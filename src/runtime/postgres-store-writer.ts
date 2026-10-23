/**
 * PostgreSQL Runtime Store —— SQL 写入层
 *
 * 全部是自由函数，签名一律 (tx, tenantId, ...) 全显式：不持有任何实例状态，
 * 事务句柄由调用方传入，租户隔离所需的 tenantId 也显式传递而非从 this 取。
 * 这一层可以脱离 PostgresRuntimeStore 单独测试（只造一个 SqlExecutor 假体）。
 *
 * 职责：单表 UPSERT、投影刷新、外键占位 Target 兜底建立。
 * 事务边界、乐观锁、审计与幂等判定全部留在宿主 postgres-store.ts。
 */

import { stableRuntimeUuid } from './runtime-id';
import { isUuid, json, type SqlExecutor } from './postgres-sql-port';
import type { DomainEvent, Episode, MemoryRecord, RuntimeSnapshot, StateChange } from './types';

export async function persistNormalizedState(
  tx: SqlExecutor,
  tenantId: string,
  current: RuntimeSnapshot | null,
  next: RuntimeSnapshot
): Promise<void> {
  await persistCharacterProjection(tx, tenantId, next);
  const knownMemoryIds = new Set(current?.memories.map((memory) => memory.id) ?? []);
  for (const memory of next.memories.filter((item) => !knownMemoryIds.has(item.id))) {
    await insertMemory(tx, tenantId, memory);
  }
  const previousMemories = new Map((current?.memories ?? []).map((memory) => [memory.id, memory]));
  for (const memory of next.memories) {
    const previous = previousMemories.get(memory.id);
    if (previous && (previous.reviewStatus !== memory.reviewStatus || previous.reviewedAt !== memory.reviewedAt)) {
      await tx.query(
        `UPDATE memories
            SET review_status = $3, reviewed_at = $4, updated_at = now()
          WHERE id = $1 AND character_id = $2`,
        [memory.id, next.character.id, memory.reviewStatus ?? 'confirmed', memory.reviewedAt ?? null]
      );
    }
  }

  const knownEpisodeIds = new Set(current?.episodes.map((episode) => episode.id) ?? []);
  for (const episode of next.episodes) {
    if (knownEpisodeIds.has(episode.id)) {
      await updateEpisode(tx, next.character.id, episode);
    } else {
      await insertEpisode(tx, next.character.id, episode);
    }
    await insertEpisodeEvents(tx, tenantId, next.character.id, episode);
  }
}

export async function persistCharacterProjection(tx: SqlExecutor, tenantId: string, snapshot: RuntimeSnapshot): Promise<void> {
  const character = snapshot.character;
  for (const trait of character.traits) {
    await tx.query(
      `INSERT INTO character_traits
        (character_id, trait_key, value, confidence, mutable, locked, source)
       VALUES ($1, $2, $3, 1, $4, $5, 'character-definition')
       ON CONFLICT (character_id, trait_key) DO UPDATE SET
         value = EXCLUDED.value,
         mutable = EXCLUDED.mutable,
         locked = EXCLUDED.locked,
         updated_at = now()`,
      [character.id, trait.key, trait.value, !trait.locked, Boolean(trait.locked)]
    );
  }
  for (const value of character.values) {
    await tx.query(
      `INSERT INTO character_values
        (character_id, value_key, strength, priority, confidence, locked)
       VALUES ($1, $2, $3, $4, 1, $5)
       ON CONFLICT (character_id, value_key) DO UPDATE SET
         strength = EXCLUDED.strength,
         priority = EXCLUDED.priority,
         locked = EXCLUDED.locked`,
      [
        character.id,
        value.key,
        value.importance,
        Math.round(value.importance * 100),
        Boolean(value.locked),
      ]
    );
  }
  for (const belief of character.beliefs) {
    const beliefId = stableRuntimeUuid('character-belief', character.id, belief.key);
    await tx.query(
      `INSERT INTO character_beliefs
        (id, character_id, statement, strength, confidence, mutable, locked, source)
       VALUES ($1, $2, $3, 0.5, $4, $5, $6, 'character-definition')
       ON CONFLICT (id) DO UPDATE SET
         statement = EXCLUDED.statement,
         confidence = EXCLUDED.confidence,
         mutable = EXCLUDED.mutable,
         locked = EXCLUDED.locked,
         updated_at = now()`,
      [beliefId, character.id, belief.statement, belief.confidence, !belief.locked, Boolean(belief.locked)]
    );
  }
  for (const goal of character.goals) {
    const goalId = stableRuntimeUuid('character-goal', character.id, goal.key);
    await tx.query(
      `INSERT INTO character_goals
        (id, character_id, description, priority, progress, active, metadata)
       VALUES ($1, $2, $3, $4, 0, $5, $6::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         description = EXCLUDED.description,
         priority = EXCLUDED.priority,
         active = EXCLUDED.active,
         metadata = EXCLUDED.metadata,
         updated_at = now()`,
      [goalId, character.id, goal.description, goal.priority, goal.active, json({ key: goal.key })]
    );
  }
  for (const [key, score] of Object.entries(character.preferences)) {
    const targetId = await ensureTarget(
      tx,
      tenantId,
      stableRuntimeUuid('preference-target', character.tenantId, character.id, key),
      { type: 'preference', canonicalName: key }
    );
    if (!targetId) continue;
    await tx.query(
      `INSERT INTO character_preferences
        (character_id, target_id, dimension, score, baseline, confidence, salience, version)
       VALUES ($1, $2, 'score', $3, 0, 1, $4, $5)
       ON CONFLICT (character_id, target_id, dimension) DO UPDATE SET
         score = EXCLUDED.score,
         salience = EXCLUDED.salience,
         version = EXCLUDED.version,
         updated_at = now()`,
      [character.id, targetId, Math.max(-1, Math.min(1, score)), Math.min(1, Math.abs(score)), snapshot.version]
    );
  }
  for (const attitude of character.attitudes) {
    const targetId = await ensureTarget(tx, tenantId, attitude.targetId);
    if (!targetId) continue;
    await tx.query(
      `INSERT INTO character_attitudes
        (character_id, target_id, dimension, score, baseline, confidence, salience, version)
       VALUES ($1, $2, 'liking', $3, 0, $4, $5, $6)
       ON CONFLICT (character_id, target_id, dimension) DO UPDATE SET
         score = EXCLUDED.score,
         confidence = EXCLUDED.confidence,
         salience = EXCLUDED.salience,
         version = EXCLUDED.version,
         updated_at = now()`,
      [character.id, targetId, attitude.liking, attitude.confidence, attitude.salience, snapshot.version]
    );
  }
  for (const relationship of character.relationships) {
    const targetId = await ensureTarget(tx, tenantId, relationship.targetId);
    if (!targetId) continue;
    await tx.query(
      `INSERT INTO character_relationships
        (character_id, target_id, relationship_type, status, version)
       VALUES ($1, $2, 'acquaintance', 'active', $3)
       ON CONFLICT (character_id, target_id) DO UPDATE SET
         version = EXCLUDED.version,
         updated_at = now()`,
      [character.id, targetId, snapshot.version]
    );
    const dimensions = { ...relationship.dimensions, closeness: relationship.closeness };
    for (const [dimension, score] of Object.entries(dimensions)) {
      await tx.query(
        `INSERT INTO relationship_dimensions
          (character_id, target_id, dimension, score, baseline, version)
         VALUES ($1, $2, $3, $4, 0, $5)
         ON CONFLICT (character_id, target_id, dimension) DO UPDATE SET
           score = EXCLUDED.score,
           version = EXCLUDED.version,
           updated_at = now()`,
        [character.id, targetId, dimension, Math.max(0, Math.min(1, score)), snapshot.version]
      );
    }
  }
  for (const emotion of character.emotions) {
    await tx.query(
      `INSERT INTO character_emotions
        (character_id, emotion_key, intensity, baseline, half_life_seconds, version)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (character_id, emotion_key) DO UPDATE SET
         intensity = EXCLUDED.intensity,
         baseline = EXCLUDED.baseline,
         half_life_seconds = EXCLUDED.half_life_seconds,
         version = EXCLUDED.version,
         updated_at = now()`,
      [character.id, emotion.emotion, emotion.intensity, emotion.baseline, emotion.halfLifeSeconds, snapshot.version]
    );
  }
  await tx.query(
    `INSERT INTO character_mood
      (character_id, valence, arousal, dominance, baseline_valence, baseline_arousal, baseline_dominance, half_life_seconds, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (character_id) DO UPDATE SET
       valence = EXCLUDED.valence,
       arousal = EXCLUDED.arousal,
       dominance = EXCLUDED.dominance,
       baseline_valence = EXCLUDED.baseline_valence,
       baseline_arousal = EXCLUDED.baseline_arousal,
       baseline_dominance = EXCLUDED.baseline_dominance,
       half_life_seconds = EXCLUDED.half_life_seconds,
       version = EXCLUDED.version,
       updated_at = now()`,
    [
      character.id,
      character.mood.valence,
      character.mood.arousal,
      character.mood.dominance,
      character.mood.baselineValence,
      character.mood.baselineArousal,
      character.mood.baselineDominance,
      character.mood.halfLifeSeconds,
      snapshot.version,
    ]
  );
}

export async function insertMemory(tx: SqlExecutor, tenantId: string, memory: MemoryRecord): Promise<void> {
  if (!isUuid(memory.id) || !isUuid(memory.characterId)) {
    throw new Error('PostgreSQL Memory 要求 id、characterId 使用 UUID');
  }
  const targetId = await ensureTarget(tx, tenantId, memory.targetId);
  await tx.query(
    `INSERT INTO memories
      (id, character_id, memory_type, content, target_id, importance, confidence, salience, occurred_at, valid_from, valid_until, review_status, reviewed_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      memory.id,
      memory.characterId,
      memory.type,
      memory.content,
      targetId,
      memory.importance,
      memory.confidence ?? 1,
      memory.salience,
      memory.occurredAt,
      memory.validFrom ?? null,
      memory.validUntil ?? null,
      memory.reviewStatus ?? 'confirmed',
      memory.reviewedAt ?? null,
      json({ sourceEventId: memory.sourceEventId, lastAccessedAt: memory.lastAccessedAt }),
    ]
  );
  if (memory.sourceEventId && isUuid(memory.sourceEventId)) {
    const sourceEvent = await tx.query(
      'SELECT 1 FROM events WHERE id = $1 AND character_id = $2 AND tenant_id = $3 LIMIT 1',
      [memory.sourceEventId, memory.characterId, tenantId]
    );
    if (sourceEvent.rowCount > 0) {
      await tx.query(
        `INSERT INTO memory_sources (memory_id, event_id, turn_id, weight)
         VALUES ($1, $2, NULL, 1)
         ON CONFLICT DO NOTHING`,
        [memory.id, memory.sourceEventId]
      );
    }
  }
}

export async function insertEpisode(
  tx: SqlExecutor,
  characterId: string,
  episode: Episode
): Promise<void> {
  if (!isUuid(episode.id) || !isUuid(characterId)) {
    throw new Error('PostgreSQL Episode 要求 id、characterId 使用 UUID');
  }
  await tx.query(
    `INSERT INTO emotion_episodes
      (id, character_id, episode_type, started_at, peak_at, recovered_at, peak_intensity, resolution, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      episode.id,
      characterId,
      episode.topic ?? 'runtime',
      episode.startedAt,
      episode.lastEventAt,
      episode.resolvedAt ?? null,
      episode.peakIntensity,
      episode.status === 'resolved' ? 'resolved' : null,
      json({
        topic: episode.topic,
        targetId: episode.targetId,
        status: episode.status,
        currentIntensity: episode.currentIntensity,
        salience: episode.salience,
        residualInfluence: episode.residualInfluence,
        unresolved: episode.unresolved,
      }),
    ]
  );
}

export async function updateEpisode(
  tx: SqlExecutor,
  characterId: string,
  episode: Episode
): Promise<void> {
  if (!isUuid(episode.id) || !isUuid(characterId)) {
    throw new Error('PostgreSQL Episode 要求 id、characterId 使用 UUID');
  }
  await tx.query(
    `UPDATE emotion_episodes
        SET peak_at = $3, recovered_at = $4, peak_intensity = $5, resolution = $6, metadata = $7::jsonb
      WHERE id = $1 AND character_id = $2`,
    [
      episode.id,
      characterId,
      episode.lastEventAt,
      episode.resolvedAt ?? null,
      episode.peakIntensity,
      episode.status === 'resolved' ? 'resolved' : null,
      json({
        topic: episode.topic,
        targetId: episode.targetId,
        status: episode.status,
        currentIntensity: episode.currentIntensity,
        salience: episode.salience,
        residualInfluence: episode.residualInfluence,
        unresolved: episode.unresolved,
      }),
    ]
  );
}

export async function insertEpisodeEvents(tx: SqlExecutor, tenantId: string, characterId: string, episode: Episode): Promise<void> {
  if (!isUuid(episode.id)) throw new Error('PostgreSQL Episode 要求 id 使用 UUID');
  for (const [ordinal, eventId] of episode.eventIds.entries()) {
    if (!isUuid(eventId)) continue;
    const event = await tx.query(
      'SELECT 1 FROM events WHERE id = $1 AND character_id = $2 AND tenant_id = $3 LIMIT 1',
      [eventId, characterId, tenantId]
    );
    if (event.rowCount === 0) continue;
    await tx.query(
      `INSERT INTO emotion_episode_events (episode_id, event_id, ordinal)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [episode.id, eventId, ordinal]
    );
  }
}
export async function insertEvent(tx: SqlExecutor, tenantId: string, event: DomainEvent): Promise<void> {
  if (!isUuid(event.id) || !isUuid(event.characterId) || !isUuid(event.tenantId)) {
    throw new Error('PostgreSQL Runtime Event 要求 tenantId、characterId、eventId 使用 UUID');
  }
  const targetId = await ensureTarget(tx, tenantId, event.targetId);
  await tx.query(
    `INSERT INTO events
      (id, tenant_id, character_id, actor_id, target_id, event_type, importance, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      event.id,
      event.tenantId,
      event.characterId,
      event.actorId && isUuid(event.actorId) ? event.actorId : null,
      targetId,
      event.eventType,
      event.importance,
      json({
        ...event.payload,
        topic: event.topic,
        effects: event.effects,
        targetId: event.targetId,
        schemaVersion: event.schemaVersion,
        reducerVersion: event.reducerVersion,
      }),
      event.occurredAt,
    ]
  );
  await insertEventTurnLinks(tx, tenantId, event);
}

export async function insertEventTurnLinks(
  tx: SqlExecutor,
  tenantId: string,
  event: DomainEvent,
  additionalTurnIds: string[] = []
): Promise<void> {
  const sourceTurnIds = [...new Set([
    ...(event.sourceTurnIds ?? []),
    event.sourceTurnId,
    ...additionalTurnIds,
  ].filter((value): value is string => isUuid(value)))];
  for (const sourceTurnId of sourceTurnIds) {
    const turn = await tx.query(
      `SELECT 1 FROM conversation_turns AS turn
        JOIN conversation_sessions AS session ON session.id = turn.session_id
        JOIN conversations AS conversation ON conversation.id = session.conversation_id
       WHERE turn.id = $1
         AND conversation.tenant_id = $2
         AND conversation.character_id = $3
       LIMIT 1`,
      [sourceTurnId, tenantId, event.characterId]
    );
    if (turn.rowCount > 0) {
      await tx.query(
        `INSERT INTO event_turn_links (event_id, turn_id, role)
         VALUES ($1, $2, 'evidence')
         ON CONFLICT DO NOTHING`,
        [event.id, sourceTurnId]
      );
    }
  }
}

export async function insertStateChange(tx: SqlExecutor, tenantId: string, change: StateChange): Promise<void> {
  if (!isUuid(change.id) || !isUuid(change.eventId) || !isUuid(change.characterId)) {
    throw new Error('PostgreSQL StateChange 要求 id、eventId、characterId 使用 UUID');
  }
  const targetId = await ensureTarget(tx, tenantId, change.targetId);
  await tx.query(
    `INSERT INTO state_changes
      (id, character_id, event_id, state_type, target_id, dimension, old_value, delta, new_value, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      change.id,
      change.characterId,
      change.eventId,
      change.stateType,
      targetId,
      change.dimension,
      change.oldValue ?? null,
      change.delta,
      change.newValue ?? null,
      json(change.changes),
    ]
  );
}

/**
 * Runtime 的 targetId 可能来自角色卡或聊天上下文，首次出现时通常还没有
 * 对应的世界实体记录。先建立租户内的最小占位 Target，确保事件、记忆和
 * 状态变化不会在外键处失败；已有跨租户 ID 则明确拒绝，避免越权关联。
 */
export async function ensureTarget(
  tx: SqlExecutor,
  tenantId: string,
  targetId?: string,
  options: { type?: string; canonicalName?: string } = {}
): Promise<string | null> {
  if (!targetId || !isUuid(targetId)) return null;
  await tx.query(
    `INSERT INTO targets (id, tenant_id, type, canonical_name, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      targetId,
      tenantId,
      options.type ?? 'runtime',
      options.canonicalName ?? targetId,
      json({ source: 'runtime-placeholder' }),
    ]
  );
  const result = await tx.query<{ tenant_id: string }>(
    'SELECT tenant_id FROM targets WHERE id = $1 LIMIT 1',
    [targetId]
  );
  const target = result.rows[0];
  if (!target) throw new Error(`Runtime Target 创建失败：${targetId}`);
  if (target.tenant_id !== tenantId) {
    throw new Error(`Runtime Target 租户隔离校验失败：${targetId}`);
  }
  return targetId;
}
