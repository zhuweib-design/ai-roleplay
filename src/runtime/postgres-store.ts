import { OptimisticLockError, RuntimeConflictError } from './store';
import { stableChatConversationTurnIds, stableRuntimeUuid } from './runtime-id';
import type { ContextBuildRecord, DomainEvent, Episode, MemoryRecord, RuntimeConversationTurnInput, RuntimeConversationTurnResult, RuntimeSnapshot, RuntimeSnapshotStore, RuntimeCharacterListRequest, RuntimeCharacterListResult, StateChange } from './types';

export interface SqlResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

/**
 * PostgreSQL 驱动的最小端口。
 * pg.Pool、Tauri Rust command 或服务端 RPC 只需要实现这个端口即可接入。
 */
export interface SqlExecutor {
  query<Row = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<SqlResult<Row>>;
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
}

interface CharacterVersionRow {
  state_version: number;
}

interface SnapshotRow {
  state: RuntimeSnapshot | string;
  event_sequence: number;
}

function parseJson<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}

function slugify(value: string, stableId?: string): string {
  const slug = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  const base = slug || 'character';
  const suffix = stableId?.replace(/[^0-9a-z]/gi, '').slice(0, 8).toLocaleLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

/**
 * 以 characters.state_version + state_snapshots.state 作为投影存储，
 * 并把新 Event、StateChange 和审计记录追加到对应的规范化表。
 *
 * 这不是浏览器端模拟器，而是服务端 PostgreSQL 的真实事务边界：
 * - 角色行 FOR UPDATE 锁定
 * - expectedVersion 乐观锁校验
 * - Event / StateChange / Memory / Episode / Snapshot / Audit 同事务提交
 */
export class PostgresRuntimeStore implements RuntimeSnapshotStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly tenantId: string,
    private readonly auditActorType: 'system' | 'migration' = 'system'
  ) {}

  async recordConversationTurn(
    input: RuntimeConversationTurnInput
  ): Promise<RuntimeConversationTurnResult> {
    this.validateConversationTurnInput(input);
    return this.sql.transaction((tx) => this.persistConversationTurn(tx, input));
  }

  async recordContextBuild(record: ContextBuildRecord): Promise<void> {
    this.assertUuidBoundary(record.characterId, '角色 ID');
    this.assertUuidBoundary(this.tenantId, '租户 ID');
    if (!isUuid(record.id)) throw new Error('PostgreSQL ContextBuild 要求 id 使用 UUID');
    await this.sql.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO context_builds
          (id, character_id, conversation_id, turn_id, model_provider, model_name, total_token_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.characterId,
          record.conversationId && isUuid(record.conversationId) ? record.conversationId : null,
          record.turnId && isUuid(record.turnId) ? record.turnId : null,
          record.modelProvider ?? null,
          record.modelName ?? null,
          record.totalTokenCount ?? null,
          record.createdAt,
        ]
      );
      for (const source of record.items) {
        const sourceId = source.sourceId && isUuid(source.sourceId) ? source.sourceId : null;
        if (sourceId === null && source.sourceType !== 'identity' && source.sourceType !== 'state' && source.sourceType !== 'goal' && source.sourceType !== 'behavior_plan' && source.sourceType !== 'summary') {
          continue;
        }
        await tx.query(
          `INSERT INTO context_build_items
            (context_build_id, source_type, source_id, rank, relevance_score, token_count)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [record.id, source.sourceType, sourceId ?? record.characterId, source.rank, source.relevanceScore ?? null, source.tokenCount ?? null]
        );
      }
    });
  }

  private async persistConversationTurn(
    tx: SqlExecutor,
    input: RuntimeConversationTurnInput
  ): Promise<RuntimeConversationTurnResult> {
    const logicalTurnId = input.turnId.trim();
    const turnIds = stableChatConversationTurnIds(
      this.tenantId,
      input.characterId,
      input.conversationKey,
      input.sessionKey,
      logicalTurnId
    );
    const { conversationId, sessionId, userTurnId, assistantTurnId } = turnIds;
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const metadata = json({
      ...(input.metadata ?? {}),
      source: 'chat-manager',
      logicalTurnId,
    });
    const result = turnIds;

    const character = await tx.query<{ id: string }>(
      `SELECT id
         FROM characters
        WHERE id = $1 AND tenant_id = $2
        FOR SHARE`,
      [input.characterId, this.tenantId]
    );
    if (character.rowCount === 0) throw new Error(`角色不存在：${input.characterId}`);

    await tx.query(
      `INSERT INTO conversations
        (id, tenant_id, character_id, status, metadata)
       VALUES ($1, $2, $3, 'active', $4::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [conversationId, this.tenantId, input.characterId, json({ source: 'runtime' })]
    );
    const conversation = await tx.query<{ tenant_id: string; character_id: string }>(
      `SELECT tenant_id, character_id
         FROM conversations
        WHERE id = $1
        FOR UPDATE`,
      [conversationId]
    );
    const conversationRow = conversation.rows[0];
    if (!conversationRow) throw new Error(`Conversation 创建失败：${conversationId}`);
    if (
      conversationRow.tenant_id !== this.tenantId ||
      conversationRow.character_id !== input.characterId
    ) {
      throw new Error(`Conversation 租户隔离校验失败：${conversationId}`);
    }

    await tx.query(
      `INSERT INTO conversation_sessions (id, conversation_id, metadata)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [sessionId, conversationId, json({ source: 'runtime' })]
    );
    const session = await tx.query<{ conversation_id: string }>(
      `SELECT conversation_id
         FROM conversation_sessions
        WHERE id = $1
        FOR UPDATE`,
      [sessionId]
    );
    if (session.rows[0]?.conversation_id !== conversationId) {
      throw new Error(`Conversation Session 隔离校验失败：${sessionId}`);
    }

    const existing = await tx.query<{ id: string; content: string }>(
      `SELECT id, content
         FROM conversation_turns
        WHERE id IN ($1, $2)`,
      [userTurnId, assistantTurnId]
    );
    const existingById = new Map(existing.rows.map((row) => [row.id, row.content]));
    const existingUser = existingById.get(userTurnId);
    const existingAssistant = existingById.get(assistantTurnId);
    if (existingUser !== undefined && existingUser !== input.userMessage) {
      throw new RuntimeConflictError(`Conversation Turn 幂等键内容冲突：${userTurnId}`);
    }
    if (existingAssistant !== undefined && existingAssistant !== input.assistantMessage) {
      throw new RuntimeConflictError(`Conversation Turn 幂等键内容冲突：${assistantTurnId}`);
    }
    if (existingUser !== undefined && existingAssistant !== undefined) return result;

    const sequenceResult = await tx.query<{ next_sequence: number | string }>(
      `SELECT COALESCE(MAX(sequence_no), -1) + 1 AS next_sequence
         FROM conversation_turns
        WHERE session_id = $1`,
      [sessionId]
    );
    const nextSequence = Number(sequenceResult.rows[0]?.next_sequence ?? 0);
    const userSequence = existingUser === undefined ? nextSequence : nextSequence + 1;
    const assistantSequence = existingAssistant === undefined
      ? (existingUser === undefined ? nextSequence + 1 : nextSequence)
      : nextSequence + 1;

    if (existingUser === undefined) {
      await tx.query(
        `INSERT INTO conversation_turns
          (id, session_id, sequence_no, speaker_type, speaker_id, content, created_at, metadata)
         VALUES ($1, $2, $3, 'user', NULL, $4, $5, $6::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [userTurnId, sessionId, userSequence, input.userMessage, occurredAt, metadata]
      );
    }
    if (existingAssistant === undefined) {
      await tx.query(
        `INSERT INTO conversation_turns
          (id, session_id, sequence_no, speaker_type, speaker_id, content, created_at, metadata)
         VALUES ($1, $2, $3, 'character', $4, $5, $6, $7::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [assistantTurnId, sessionId, assistantSequence, input.characterId, input.assistantMessage, occurredAt, metadata]
      );
    }
    await tx.query(
      `UPDATE conversations
          SET last_activity_at = GREATEST(last_activity_at, $2::timestamptz)
        WHERE id = $1`,
      [conversationId, occurredAt]
    );
    return result;
  }

  async listCharacters(request: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult> {
    if (request.tenantId !== this.tenantId) throw new Error('租户隔离校验失败');
    this.assertUuidBoundary(this.tenantId, '租户 ID');
    if (request.cursor) this.assertUuidBoundary(request.cursor, '游标角色 ID');
    const limit = request.limit ?? 20;
    const rows = await this.sql.query<{ id: string; state: RuntimeSnapshot | string }>(
      `SELECT c.id, s.state
         FROM characters c
         JOIN LATERAL (
           SELECT state FROM state_snapshots
            WHERE character_id = c.id ORDER BY event_sequence DESC LIMIT 1
         ) s ON TRUE
        WHERE c.tenant_id = $1 AND ($2::uuid IS NULL OR c.id > $2::uuid)
        ORDER BY c.id ASC LIMIT $3`,
      [this.tenantId, request.cursor ?? null, limit + 1]
    );
    const hasMore = rows.rows.length > limit;
    const page = rows.rows.slice(0, limit);
    return {
      items: page.map((row) => parseJson<RuntimeSnapshot>(row.state).character),
      ...(hasMore ? { nextCursor: page[page.length - 1]!.id } : {}),
    };
  }

  async load(characterId: string): Promise<RuntimeSnapshot | null> {
    const result = await this.sql.query<SnapshotRow>(
      `SELECT s.state, s.event_sequence
         FROM characters c
         LEFT JOIN LATERAL (
           SELECT state, event_sequence
             FROM state_snapshots
            WHERE character_id = c.id
            ORDER BY event_sequence DESC
            LIMIT 1
         ) s ON TRUE
        WHERE c.id = $1 AND c.tenant_id = $2
        LIMIT 1`,
      [characterId, this.tenantId]
    );
    const row = result.rows[0];
    return row?.state ? parseJson(row.state) : null;
  }

  async initialize(snapshot: RuntimeSnapshot): Promise<void> {
    this.assertUuidBoundary(snapshot.character.id, '角色 ID');
    this.assertUuidBoundary(snapshot.character.tenantId, '租户 ID');
    this.assertUuidBoundary(this.tenantId, '租户 ID');
    if (snapshot.character.tenantId !== this.tenantId) throw new Error('租户隔离校验失败');
    await this.sql.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO characters
          (id, tenant_id, slug, name, status, schema_version, state_version)
         VALUES ($1, $2, $3, $4, 'active', 1, $5)`,
        [
          snapshot.character.id,
          this.tenantId,
          slugify(snapshot.character.profile.displayName, snapshot.character.id),
          snapshot.character.profile.displayName,
          snapshot.version,
        ]
      );
      await tx.query(
        `INSERT INTO character_profiles (character_id, identity, speech_profile, boundaries)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)`,
        [
          snapshot.character.id,
          json(snapshot.character.profile),
          json({ speakingStyle: snapshot.character.profile.speakingStyle }),
          json(snapshot.character.profile.boundaries ?? []),
        ]
      );
      for (const event of snapshot.events) {
        await this.insertEvent(tx, event);
      }
      for (const change of snapshot.stateChanges) {
        await this.insertStateChange(tx, change);
      }
      await this.persistNormalizedState(tx, null, snapshot);
      await tx.query(
        `INSERT INTO state_snapshots (character_id, event_sequence, state)
         VALUES ($1, $2, $3::jsonb)`,
        [snapshot.character.id, snapshot.version, json(snapshot)]
      );
      await tx.query(
        `INSERT INTO character_versions (character_id, version_no, change_type, snapshot)
         VALUES ($1, $2, 'runtime.initialize', $3::jsonb)
         ON CONFLICT (character_id, version_no) DO NOTHING`,
        [snapshot.character.id, snapshot.version, json(snapshot)]
      );
    });
  }

  async commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void> {
    this.validateSnapshotBoundary(snapshot);
    await this.sql.transaction((tx) => this.commitInTransaction(tx, snapshot, expectedVersion));
  }

  /** 由上层事务协调器调用；调用方负责 BEGIN/COMMIT 与固定顺序锁定多角色。 */
  async commitUsingTransaction(tx: SqlExecutor, snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void> {
    this.validateSnapshotBoundary(snapshot);
    await this.commitInTransaction(tx, snapshot, expectedVersion);
  }

  async commitConversationTurn(
    snapshot: RuntimeSnapshot,
    expectedVersion: number,
    input: RuntimeConversationTurnInput
  ): Promise<RuntimeConversationTurnResult> {
    this.validateSnapshotBoundary(snapshot);
    this.validateConversationTurnInput(input);
    if (input.characterId !== snapshot.character.id) {
      throw new Error('Conversation Turn 与 Runtime Snapshot 角色不一致');
    }
    const result = await this.sql.transaction((tx) =>
      this.commitInTransaction(tx, snapshot, expectedVersion, input)
    );
    if (!result) throw new Error('Runtime Conversation Turn 提交结果缺失');
    return result;
  }

  private async commitInTransaction(
    tx: SqlExecutor,
    snapshot: RuntimeSnapshot,
    expectedVersion: number,
    turnInput?: RuntimeConversationTurnInput
  ): Promise<RuntimeConversationTurnResult | undefined> {
    const versionResult = await tx.query<CharacterVersionRow>(
      `SELECT state_version
         FROM characters
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE`,
      [snapshot.character.id, this.tenantId]
    );
    const versionRow = versionResult.rows[0];
    if (!versionRow) throw new Error(`角色不存在：${snapshot.character.id}`);
    const actualVersion = Number(versionRow.state_version);
    if (actualVersion !== expectedVersion) {
      throw new OptimisticLockError(snapshot.character.id, expectedVersion, actualVersion);
    }

    const currentResult = await tx.query<SnapshotRow>(
      `SELECT state, event_sequence
         FROM state_snapshots
        WHERE character_id = $1
        ORDER BY event_sequence DESC
        LIMIT 1`,
      [snapshot.character.id]
    );
    const current = currentResult.rows[0]?.state
      ? parseJson(currentResult.rows[0].state)
      : null;
    const knownEventIds = new Set(current?.events.map((event) => event.id) ?? []);
    const knownStateChangeIds = new Set(current?.stateChanges.map((change) => change.id) ?? []);

    const turnResult = turnInput
      ? await this.persistConversationTurn(tx, turnInput)
      : undefined;
    // 幂等重试只需在同一事务中校验或补齐 Turn；既有 Event 不重复写 Snapshot、Version 和 Audit。
    if (turnInput && snapshot.version === expectedVersion) {
      if (turnResult) {
        const committedTurnIds = new Set([turnResult.userTurnId, turnResult.assistantTurnId]);
        const relatedEvents = snapshot.events.filter((event) =>
          event.sourceTurnId === turnInput.turnId ||
          event.sourceTurnIds?.some((turnId) => committedTurnIds.has(turnId))
        );
        for (const event of relatedEvents) {
          await this.insertEventTurnLinks(tx, event, [...committedTurnIds]);
        }
      }
      return turnResult;
    }

    const newEvents = snapshot.events.filter((item) => !knownEventIds.has(item.id));
    const newStateChanges = snapshot.stateChanges.filter((item) => !knownStateChangeIds.has(item.id));
    for (const event of newEvents) {
      await this.insertEvent(tx, event);
    }
    for (const change of newStateChanges) {
      await this.insertStateChange(tx, change);
    }
    await this.persistNormalizedState(tx, current, snapshot);
    await tx.query(
      `INSERT INTO state_snapshots (character_id, event_sequence, state)
       VALUES ($1, $2, $3::jsonb)`,
      [snapshot.character.id, snapshot.version, json(snapshot)]
    );
    await tx.query(
      `UPDATE characters
          SET state_version = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [snapshot.character.id, this.tenantId, snapshot.version]
    );
    await tx.query(
      `INSERT INTO character_versions (character_id, version_no, change_type, snapshot)
       VALUES ($1, $2, 'runtime.commit', $3::jsonb)
       ON CONFLICT (character_id, version_no) DO NOTHING`,
      [snapshot.character.id, snapshot.version, json(snapshot)]
    );
    await tx.query(
      `INSERT INTO state_audit_logs
        (tenant_id, character_id, actor_type, action, entity_type, entity_id, before_state, after_state, reason)
       VALUES ($1, $2, $3, 'runtime.commit', 'state_snapshot', NULL, $4::jsonb, $5::jsonb, $6::jsonb)`,
      [
        this.tenantId,
        snapshot.character.id,
        this.auditActorType,
        json(current),
        json(snapshot),
        json({
          expectedVersion,
          nextVersion: snapshot.version,
          eventIds: newEvents.map((event) => event.id),
          stateChangeIds: newStateChanges.map((change) => change.id),
        }),
      ]
    );
    return turnResult;
  }

  private validateSnapshotBoundary(snapshot: RuntimeSnapshot): void {
    this.assertUuidBoundary(snapshot.character.id, '角色 ID');
    this.assertUuidBoundary(snapshot.character.tenantId, '租户 ID');
    this.assertUuidBoundary(this.tenantId, '租户 ID');
    if (snapshot.character.tenantId !== this.tenantId) throw new Error('租户隔离校验失败');
  }

  private validateConversationTurnInput(input: RuntimeConversationTurnInput): void {
    this.assertUuidBoundary(input.characterId, '角色 ID');
    this.assertUuidBoundary(input.tenantId, '租户 ID');
    this.assertUuidBoundary(this.tenantId, '租户 ID');
    if (input.tenantId !== this.tenantId) throw new Error('租户隔离校验失败');
    if (!input.turnId.trim()) throw new Error('conversation turn 缺少稳定 turnId');
  }

  private assertUuidBoundary(value: string, label: string): void {
    if (!isUuid(value)) throw new Error(`PostgreSQL Runtime ${label} 要求使用 UUID`);
  }

  private async persistNormalizedState(
    tx: SqlExecutor,
    current: RuntimeSnapshot | null,
    next: RuntimeSnapshot
  ): Promise<void> {
    await this.persistCharacterProjection(tx, next);
    const knownMemoryIds = new Set(current?.memories.map((memory) => memory.id) ?? []);
    for (const memory of next.memories.filter((item) => !knownMemoryIds.has(item.id))) {
      await this.insertMemory(tx, memory);
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
        await this.updateEpisode(tx, next.character.id, episode);
      } else {
        await this.insertEpisode(tx, next.character.id, episode);
      }
      await this.insertEpisodeEvents(tx, next.character.id, episode);
    }
  }

  private async persistCharacterProjection(tx: SqlExecutor, snapshot: RuntimeSnapshot): Promise<void> {
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
      const targetId = await this.ensureTarget(
        tx,
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
      const targetId = await this.ensureTarget(tx, attitude.targetId);
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
      const targetId = await this.ensureTarget(tx, relationship.targetId);
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

  private async insertMemory(tx: SqlExecutor, memory: MemoryRecord): Promise<void> {
    if (!isUuid(memory.id) || !isUuid(memory.characterId)) {
      throw new Error('PostgreSQL Memory 要求 id、characterId 使用 UUID');
    }
    const targetId = await this.ensureTarget(tx, memory.targetId);
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
        [memory.sourceEventId, memory.characterId, this.tenantId]
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

  private async insertEpisode(
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

  private async updateEpisode(
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

  private async insertEpisodeEvents(tx: SqlExecutor, characterId: string, episode: Episode): Promise<void> {
    if (!isUuid(episode.id)) throw new Error('PostgreSQL Episode 要求 id 使用 UUID');
    for (const [ordinal, eventId] of episode.eventIds.entries()) {
      if (!isUuid(eventId)) continue;
      const event = await tx.query(
        'SELECT 1 FROM events WHERE id = $1 AND character_id = $2 AND tenant_id = $3 LIMIT 1',
        [eventId, characterId, this.tenantId]
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
  private async insertEvent(tx: SqlExecutor, event: DomainEvent): Promise<void> {
    if (!isUuid(event.id) || !isUuid(event.characterId) || !isUuid(event.tenantId)) {
      throw new Error('PostgreSQL Runtime Event 要求 tenantId、characterId、eventId 使用 UUID');
    }
    const targetId = await this.ensureTarget(tx, event.targetId);
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
        json({ ...event.payload, topic: event.topic, effects: event.effects, targetId: event.targetId }),
        event.occurredAt,
      ]
    );
    await this.insertEventTurnLinks(tx, event);
  }

  private async insertEventTurnLinks(
    tx: SqlExecutor,
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
        [sourceTurnId, this.tenantId, event.characterId]
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

  private async insertStateChange(tx: SqlExecutor, change: StateChange): Promise<void> {
    if (!isUuid(change.id) || !isUuid(change.eventId) || !isUuid(change.characterId)) {
      throw new Error('PostgreSQL StateChange 要求 id、eventId、characterId 使用 UUID');
    }
    const targetId = await this.ensureTarget(tx, change.targetId);
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
  private async ensureTarget(
    tx: SqlExecutor,
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
        this.tenantId,
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
    if (target.tenant_id !== this.tenantId) {
      throw new Error(`Runtime Target 租户隔离校验失败：${targetId}`);
    }
    return targetId;
  }
}
