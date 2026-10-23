/**
 * PostgreSQL Runtime Store —— 事务编排层
 *
 * 保留职责：事务边界、角色行 FOR UPDATE 乐观锁、幂等校验、审计落库、
 * 租户边界校验。具体每张表的 SQL 写入已下放到 postgres-store-writer.ts，
 * 本轮改写对调用方零影响：公开面仍只有 PostgresRuntimeStore / SqlExecutor / SqlResult。
 *
 * 文件分层（依赖单向，无环）：
 *
 *   postgres-sql-port.ts       SqlExecutor 端口 + isUuid / json / parseJson / slugify
 *        ↑
 *   postgres-store-writer.ts   10 个 SQL 写入自由函数（tx, tenantId, ...）
 *        ↑
 *   postgres-store.ts          PostgresRuntimeStore（本文件）
 */

import { OptimisticLockError, RuntimeConflictError } from './store';
import { stableChatConversationTurnIds } from './runtime-id';
import { isUuid, json, parseJson, slugify, type SqlExecutor } from './postgres-sql-port';
import {
  insertEvent,
  insertEventTurnLinks,
  insertStateChange,
  persistNormalizedState,
} from './postgres-store-writer';
import type {
  ContextBuildRecord,
  RuntimeCharacterListRequest,
  RuntimeCharacterListResult,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult,
  RuntimeSnapshot,
  RuntimeSnapshotStore,
} from './types';

// 端口类型从这里再导出，维持拆分前的公开面（postgres-executor 直接 import 本文件）
export type { SqlExecutor, SqlResult } from './postgres-sql-port';

interface CharacterVersionRow {
  state_version: number;
}

interface SnapshotRow {
  state: RuntimeSnapshot | string;
  event_sequence: number;
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
        await insertEvent(tx, this.tenantId, event);
      }
      for (const change of snapshot.stateChanges) {
        await insertStateChange(tx, this.tenantId, change);
      }
      await persistNormalizedState(tx, this.tenantId, null, snapshot);
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
          await insertEventTurnLinks(tx, this.tenantId, event, [...committedTurnIds]);
        }
      }
      return turnResult;
    }

    const newEvents = snapshot.events.filter((item) => !knownEventIds.has(item.id));
    const newStateChanges = snapshot.stateChanges.filter((item) => !knownStateChangeIds.has(item.id));
    for (const event of newEvents) {
      await insertEvent(tx, this.tenantId, event);
    }
    for (const change of newStateChanges) {
      await insertStateChange(tx, this.tenantId, change);
    }
    await persistNormalizedState(tx, this.tenantId, current, snapshot);
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
}
