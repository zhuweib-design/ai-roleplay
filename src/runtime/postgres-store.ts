import { OptimisticLockError } from './store';
import type { DomainEvent, Episode, MemoryRecord, RuntimeSnapshot, RuntimeSnapshotStore, StateChange } from './types';

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

function slugify(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'character';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    if (snapshot.character.tenantId !== this.tenantId) throw new Error('租户隔离校验失败');
    await this.sql.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO characters
          (id, tenant_id, slug, name, status, schema_version, state_version)
         VALUES ($1, $2, $3, $4, 'active', 1, $5)`,
        [
          snapshot.character.id,
          this.tenantId,
          slugify(snapshot.character.profile.displayName),
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
      await this.persistNormalizedState(tx, null, snapshot);
      await tx.query(
        `INSERT INTO state_snapshots (character_id, event_sequence, state)
         VALUES ($1, $2, $3::jsonb)`,
        [snapshot.character.id, snapshot.version, json(snapshot)]
      );
    });
  }

  async commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void> {
    if (snapshot.character.tenantId !== this.tenantId) throw new Error('租户隔离校验失败');
    await this.sql.transaction(async (tx) => {
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

      for (const event of snapshot.events.filter((item) => !knownEventIds.has(item.id))) {
        await this.insertEvent(tx, event);
      }
      for (const change of snapshot.stateChanges.filter((item) => !knownStateChangeIds.has(item.id))) {
        await this.insertStateChange(tx, change);
      }
      await this.persistNormalizedState(tx, current, snapshot);

      await this.persistNormalizedState(tx, null, snapshot);
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
        `INSERT INTO state_audit_logs
          (tenant_id, character_id, actor_type, action, entity_type, entity_id, before_state, after_state, reason)
         VALUES ($1, $2, $3, 'runtime.commit', 'state_snapshot', NULL, $4::jsonb, $5::jsonb, $6::jsonb)`,
        [
          this.tenantId,
          snapshot.character.id,
          this.auditActorType,
          json(current),
          json(snapshot),
          json({ expectedVersion, nextVersion: snapshot.version }),
        ]
      );
    });
  }

  private async persistNormalizedState(
    tx: SqlExecutor,
    current: RuntimeSnapshot | null,
    next: RuntimeSnapshot
  ): Promise<void> {
    const knownMemoryIds = new Set(current?.memories.map((memory) => memory.id) ?? []);
    for (const memory of next.memories.filter((item) => !knownMemoryIds.has(item.id))) {
      await this.insertMemory(tx, memory);
    }

    const knownEpisodeIds = new Set(current?.episodes.map((episode) => episode.id) ?? []);
    for (const episode of next.episodes) {
      if (knownEpisodeIds.has(episode.id)) {
        await this.updateEpisode(tx, next.character.id, episode);
      } else {
        await this.insertEpisode(tx, next.character.id, episode);
      }
      await this.insertEpisodeEvents(tx, episode);
    }
  }

  private async insertMemory(tx: SqlExecutor, memory: MemoryRecord): Promise<void> {
    if (!isUuid(memory.id) || !isUuid(memory.characterId)) {
      throw new Error('PostgreSQL Memory 要求 id、characterId 使用 UUID');
    }
    await tx.query(
      `INSERT INTO memories
        (id, character_id, memory_type, content, target_id, importance, salience, occurred_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        memory.id,
        memory.characterId,
        memory.type,
        memory.content,
        memory.targetId && isUuid(memory.targetId) ? memory.targetId : null,
        memory.importance,
        memory.salience,
        memory.occurredAt,
        json({ sourceEventId: memory.sourceEventId, lastAccessedAt: memory.lastAccessedAt }),
      ]
    );
    if (memory.sourceEventId && isUuid(memory.sourceEventId)) {
      await tx.query(
        `INSERT INTO memory_sources (memory_id, event_id, turn_id, weight)
         VALUES ($1, $2, NULL, 1)
         ON CONFLICT DO NOTHING`,
        [memory.id, memory.sourceEventId]
      );
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

  private async insertEpisodeEvents(tx: SqlExecutor, episode: Episode): Promise<void> {
    if (!isUuid(episode.id)) throw new Error('PostgreSQL Episode 要求 id 使用 UUID');
    for (const [ordinal, eventId] of episode.eventIds.entries()) {
      if (!isUuid(eventId)) continue;
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
    const targetId = event.targetId && isUuid(event.targetId) ? event.targetId : null;
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
        json({ ...event.payload, effects: event.effects, targetId: event.targetId }),
        event.occurredAt,
      ]
    );
    if (event.sourceTurnId && isUuid(event.sourceTurnId)) {
      await tx.query(
        `INSERT INTO event_turn_links (event_id, turn_id, role)
         VALUES ($1, $2, 'evidence')`,
        [event.id, event.sourceTurnId]
      );
    }
  }

  private async insertStateChange(tx: SqlExecutor, change: StateChange): Promise<void> {
    if (!isUuid(change.id) || !isUuid(change.eventId) || !isUuid(change.characterId)) {
      throw new Error('PostgreSQL StateChange 要求 id、eventId、characterId 使用 UUID');
    }
    await tx.query(
      `INSERT INTO state_changes
        (id, character_id, event_id, state_type, target_id, dimension, old_value, delta, new_value, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        change.id,
        change.characterId,
        change.eventId,
        change.stateType,
        change.targetId && isUuid(change.targetId) ? change.targetId : null,
        change.dimension,
        change.oldValue ?? null,
        change.delta,
        change.newValue ?? null,
        json(change.changes),
      ]
    );
  }
}
