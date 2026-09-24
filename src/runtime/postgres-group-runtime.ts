import { GroupRuntimeError, type CreateRuntimeGroupInput, type CommitRuntimeGroupTurnInput, type SetRuntimeGroupStatusInput, type RuntimeGroupState, type RuntimeGroupTurn } from './group-runtime-contract';
export { GroupRuntimeError, type CreateRuntimeGroupInput, type CommitRuntimeGroupTurnInput, type SetRuntimeGroupStatusInput, type RuntimeGroupTurn } from './group-runtime-contract';
import { RuntimeCore, reduceRuntimeState } from './runtime-core';
import { isRuntimeUuid, stableRuntimeUuid } from './runtime-id';
import { PostgresRuntimeStore, type SqlExecutor } from './postgres-store';
import type { DomainEvent, RuntimeContext, RuntimeContextRequest, RuntimeSnapshot } from './types';

interface TurnRow {
  id: string;
  group_id: string;
  logical_turn_id: string;
  sequence_no: number | string;
  speaker_id: string;
  user_message: string;
  assistant_message: string;
  occurred_at: Date | string;
}

function validateExpectedVersion(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new GroupRuntimeError(400, 'INVALID_GROUP_VERSION', '群组版本必须是非负安全整数');
  }
}

function assertGroupVersion(expected: number | undefined, actual: number): void {
  if (expected !== undefined && expected !== actual) {
    throw new GroupRuntimeError(409, 'GROUP_VERSION_CONFLICT', '群组状态已更新，请刷新后重试');
  }
}

function uuid(value: string, label: string): void {
  if (!isRuntimeUuid(value)) throw new GroupRuntimeError(400, 'INVALID_UUID', `${label} 必须为 UUID`);
}

/** PostgreSQL 群聊协调器：公共 Turn、所有成员 Event/投影/审计在同一事务内提交。 */
export class PostgresGroupRuntime {
  constructor(private readonly sql: SqlExecutor, private readonly tenantId: string) {
    uuid(tenantId, '租户 ID');
  }

  async createGroup(input: CreateRuntimeGroupInput): Promise<void> {
    uuid(input.groupId, '群组 ID');
    if (!input.name.trim() || input.name.length > 50) {
      throw new GroupRuntimeError(400, 'INVALID_GROUP_NAME', '群组名称长度须为 1 至 50');
    }
    const members = [...new Set(input.memberIds)];
    if (members.length !== input.memberIds.length || members.length < 2 || members.length > 8) {
      throw new GroupRuntimeError(400, 'INVALID_MEMBERS', '群组要求 2 至 8 位不重复的成员');
    }
    members.forEach((id) => uuid(id, '成员 ID'));
    members.sort();
    await this.sql.transaction(async (tx) => {
      // 所有写路径遵循先群组、后角色的锁顺序；创建重试不得隐式同步成员。
      const created = await tx.query<{ id: string }>(
        `INSERT INTO group_chats (id, tenant_id, name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [input.groupId, this.tenantId, input.name.trim()]
      );
      if (!created.rowCount) {
        const existing = await tx.query<{ name: string; tenant_id: string; status: string }>(
          'SELECT name, tenant_id, status FROM group_chats WHERE id = $1 FOR UPDATE', [input.groupId]
        );
        if (existing.rows[0]?.tenant_id !== this.tenantId || existing.rows[0].status !== 'active') {
          throw new GroupRuntimeError(404, 'GROUP_NOT_FOUND', '群组不存在、已归档或不属于当前租户');
        }
        const current = await tx.query<{ character_id: string }>(
          `SELECT character_id FROM group_chat_members WHERE group_id = $1 AND tenant_id = $2
             AND status = 'active' ORDER BY character_id`, [input.groupId, this.tenantId]
        );
        if (existing.rows[0].name !== input.name.trim()
          || JSON.stringify(current.rows.map((row) => row.character_id)) !== JSON.stringify(members)) {
          throw new GroupRuntimeError(409, 'GROUP_CONFLICT', '群组定义冲突，请通过明确的成员变更接口更新');
        }
        return;
      }
      const found = await tx.query<{ id: string }>(
        `SELECT id FROM characters WHERE tenant_id = $1 AND status = 'active'
          AND id = ANY($2::uuid[]) ORDER BY id FOR SHARE`, [this.tenantId, members]
      );
      if (found.rows.length !== members.length) {
        throw new GroupRuntimeError(403, 'MEMBER_NOT_AVAILABLE', '成员不存在、已归档或不属于当前租户');
      }
      for (const characterId of members) {
        await tx.query(
          'INSERT INTO group_chat_members (group_id, tenant_id, character_id) VALUES ($1, $2, $3)',
          [input.groupId, this.tenantId, characterId]
        );
      }
    });
  }

  async getGroupState(groupId: string): Promise<RuntimeGroupState> {
    uuid(groupId, '群组 ID');
    return this.sql.transaction(async (tx) => this.readGroupState(tx, groupId, false));
  }

  /**
   * 设置群组状态（归档 / 恢复）。
   * 归档后公共回合与成员变更都会被拒绝；恢复不改变成员定义，但会推进定义版本。
   */
  async setGroupStatus(input: SetRuntimeGroupStatusInput): Promise<RuntimeGroupState> {
    uuid(input.groupId, '群组 ID');
    validateExpectedVersion(input.expectedVersion);
    return this.sql.transaction(async (tx) => {
      await this.lockActiveOrArchivedGroup(tx, input.groupId);
      const state = await this.readGroupState(tx, input.groupId, false);
      assertGroupVersion(input.expectedVersion, state.version);
      if (state.status === input.status) return state;
      await tx.query(
        'UPDATE group_chats SET status = $3, version = version + 1 WHERE id = $1 AND tenant_id = $2',
        [input.groupId, this.tenantId, input.status]
      );
      return this.readGroupState(tx, input.groupId, false);
    });
  }

  async addMember(groupId: string, characterId: string, expectedVersion?: number): Promise<RuntimeGroupState> {
    uuid(groupId, '群组 ID');
    uuid(characterId, '成员 ID');
    validateExpectedVersion(expectedVersion);
    return this.sql.transaction(async (tx) => {
      await this.lockActiveGroup(tx, groupId);
      const state = await this.readGroupState(tx, groupId, false);
      assertGroupVersion(expectedVersion, state.version);
      if (state.memberIds.includes(characterId)) return state;
      if (state.memberIds.length >= 8) throw new GroupRuntimeError(409, 'GROUP_FULL', '群组最多 8 位成员');
      const character = await tx.query(
        `SELECT 1 FROM characters WHERE id = $1 AND tenant_id = $2 AND status = 'active' FOR SHARE`,
        [characterId, this.tenantId]
      );
      if (!character.rowCount) throw new GroupRuntimeError(403, 'MEMBER_NOT_AVAILABLE', '成员不存在、已归档或不属于当前租户');
      await tx.query(
        `INSERT INTO group_chat_members (group_id, tenant_id, character_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, character_id) DO UPDATE SET
           status = 'active', joined_at = now(), left_at = NULL`,
        [groupId, this.tenantId, characterId]
      );
      await tx.query('UPDATE group_chats SET version = version + 1 WHERE id = $1 AND tenant_id = $2',
        [groupId, this.tenantId]);
      return this.readGroupState(tx, groupId, false);
    });
  }

  async removeMember(groupId: string, characterId: string, expectedVersion?: number): Promise<RuntimeGroupState> {
    uuid(groupId, '群组 ID');
    uuid(characterId, '成员 ID');
    validateExpectedVersion(expectedVersion);
    return this.sql.transaction(async (tx) => {
      await this.lockActiveGroup(tx, groupId);
      const state = await this.readGroupState(tx, groupId, false);
      assertGroupVersion(expectedVersion, state.version);
      if (!state.memberIds.includes(characterId)) {
        throw new GroupRuntimeError(403, 'MEMBER_FORBIDDEN', '角色不是有效群组成员');
      }
      if (state.memberIds.length <= 2) throw new GroupRuntimeError(409, 'GROUP_TOO_SMALL', '群组至少保留 2 位成员');
      await tx.query(
        `UPDATE group_chat_members SET status = 'left', left_at = now()
           WHERE group_id = $1 AND tenant_id = $2 AND character_id = $3`,
        [groupId, this.tenantId, characterId]
      );
      await tx.query('UPDATE group_chats SET version = version + 1 WHERE id = $1 AND tenant_id = $2',
        [groupId, this.tenantId]);
      return this.readGroupState(tx, groupId, false);
    });
  }

  private async readGroupState(tx: SqlExecutor, groupId: string, forUpdate: boolean): Promise<RuntimeGroupState> {
    const group = await tx.query<{ name: string; status: 'active' | 'archived'; version: number | string }>(
      `SELECT name, status, version FROM group_chats WHERE id = $1 AND tenant_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
      [groupId, this.tenantId]
    );
    if (!group.rows[0]) throw new GroupRuntimeError(404, 'GROUP_NOT_FOUND', '群组不存在或不属于当前租户');
    const members = await tx.query<{ character_id: string }>(
      `SELECT character_id FROM group_chat_members WHERE group_id = $1 AND tenant_id = $2
         AND status = 'active' ORDER BY character_id`, [groupId, this.tenantId]
    );
    return {
      groupId,
      name: group.rows[0].name,
      status: group.rows[0].status,
      version: Number(group.rows[0].version),
      memberIds: members.rows.map((row) => row.character_id),
    };
  }

  private async lockActiveGroup(tx: SqlExecutor, groupId: string): Promise<void> {
    const group = await tx.query(
      `SELECT 1 FROM group_chats WHERE id = $1 AND tenant_id = $2 AND status = 'active' FOR UPDATE`,
      [groupId, this.tenantId]
    );
    if (!group.rowCount) throw new GroupRuntimeError(404, 'GROUP_NOT_FOUND', '群组不存在或不属于当前租户');
  }

  /** 归档/恢复路径需要锁定任意状态的群组行。 */
  private async lockActiveOrArchivedGroup(tx: SqlExecutor, groupId: string): Promise<void> {
    const group = await tx.query(
      'SELECT 1 FROM group_chats WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [groupId, this.tenantId]
    );
    if (!group.rowCount) throw new GroupRuntimeError(404, 'GROUP_NOT_FOUND', '群组不存在或不属于当前租户');
  }

  async listTurns(groupId: string, memberId: string): Promise<RuntimeGroupTurn[]> {
    uuid(groupId, '群组 ID');
    uuid(memberId, '成员 ID');
    return this.sql.transaction(async (tx) => {
      await this.requireActiveMember(tx, groupId, memberId);
      const rows = await tx.query<TurnRow>(
        'SELECT * FROM group_chat_turns WHERE group_id = $1 AND tenant_id = $2 ORDER BY sequence_no',
        [groupId, this.tenantId]
      );
      const turns: RuntimeGroupTurn[] = [];
      for (const row of rows.rows) turns.push(await this.toTurn(tx, row));
      return turns;
    });
  }

  async buildMemberContext(
    groupId: string, memberId: string, request: RuntimeContextRequest = {}
  ): Promise<RuntimeContext> {
    uuid(groupId, '群组 ID');
    uuid(memberId, '成员 ID');
    return this.sql.transaction(async (tx) => {
      await this.requireActiveMember(tx, groupId, memberId);
      return new RuntimeCore(new PostgresRuntimeStore(tx, this.tenantId)).buildContext(memberId, request);
    });
  }

  private async requireActiveMember(tx: SqlExecutor, groupId: string, memberId: string): Promise<void> {
    const access = await tx.query(
      `SELECT 1 FROM group_chats g JOIN group_chat_members m ON m.group_id = g.id
         WHERE g.id = $1 AND g.tenant_id = $2 AND m.character_id = $3
           AND m.status = 'active' FOR SHARE OF g, m`,
      [groupId, this.tenantId, memberId]
    );
    if (!access.rowCount) throw new GroupRuntimeError(403, 'MEMBER_FORBIDDEN', '无权访问群组');
  }

  async commitTurn(input: CommitRuntimeGroupTurnInput): Promise<RuntimeGroupTurn> {
    uuid(input.groupId, '群组 ID');
    uuid(input.speakerId, '发言角色 ID');
    const logicalId = input.turnId.trim();
    if (!logicalId || logicalId.length > 200) throw new GroupRuntimeError(400, 'INVALID_TURN_ID', '群组回合键长度须为 1 至 200');
    if (!input.userMessage.trim() || !input.assistantMessage.trim()) throw new GroupRuntimeError(400, 'INVALID_MESSAGE', '群组消息不可为空');
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    if (!Number.isFinite(Date.parse(occurredAt))) throw new GroupRuntimeError(400, 'INVALID_TIME', '群组时间格式无效');
    return this.sql.transaction(async (tx) => {
      const group = await tx.query<{ next_sequence: number | string }>(
        `SELECT next_sequence FROM group_chats WHERE id = $1 AND tenant_id = $2
          AND status = 'active' FOR UPDATE`, [input.groupId, this.tenantId]
      );
      if (!group.rows[0]) throw new GroupRuntimeError(404, 'GROUP_NOT_FOUND', '群组不存在或不属于当前租户');
      const members = await tx.query<{ character_id: string }>(
        `SELECT character_id FROM group_chat_members WHERE group_id = $1 AND tenant_id = $2
          AND status = 'active' ORDER BY character_id`, [input.groupId, this.tenantId]
      );
      const ids = members.rows.map((row) => row.character_id);
      if (ids.length < 2 || ids.length > 8 || !ids.includes(input.speakerId)) {
        throw new GroupRuntimeError(403, 'MEMBER_FORBIDDEN', '发言角色不是有效群组成员');
      }
      const previous = await tx.query<TurnRow>(
        `SELECT * FROM group_chat_turns WHERE group_id = $1 AND tenant_id = $2
          AND logical_turn_id = $3`, [input.groupId, this.tenantId, logicalId]
      );
      if (previous.rows[0]) {
        const row = previous.rows[0];
        if (row.speaker_id !== input.speakerId || row.user_message !== input.userMessage ||
            row.assistant_message !== input.assistantMessage ||
            (input.occurredAt && new Date(row.occurred_at).toISOString() !== new Date(input.occurredAt).toISOString())) {
          throw new GroupRuntimeError(409, 'TURN_CONFLICT', '群组回合键已存在但内容不一致');
        }
        return this.toTurn(tx, row);
      }
      // 群组行先锁定，角色行按 ID 固定顺序锁定；不同群组共享成员时也不会反向取锁。
      const locked = await tx.query<{ id: string }>(
        `SELECT id FROM characters WHERE tenant_id = $1 AND status = 'active'
          AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`, [this.tenantId, ids]
      );
      if (locked.rows.length !== ids.length) throw new GroupRuntimeError(409, 'MEMBER_UNAVAILABLE', '群组成员已归档或跨租户');
      const turnId = stableRuntimeUuid('group-turn', this.tenantId, input.groupId, logicalId);
      const sequenceNo = Number(group.rows[0].next_sequence);
      await tx.query(
        `INSERT INTO group_chat_turns
          (id, group_id, tenant_id, logical_turn_id, sequence_no, speaker_id,
           user_message, assistant_message, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [turnId, input.groupId, this.tenantId, logicalId, sequenceNo, input.speakerId,
          input.userMessage, input.assistantMessage, occurredAt]
      );
      const store = new PostgresRuntimeStore(tx, this.tenantId);
      const eventIds: Record<string, string> = {};
      for (const characterId of ids) {
        const snapshot: RuntimeSnapshot | null = await store.load(characterId);
        if (!snapshot) throw new GroupRuntimeError(500, 'MISSING_SNAPSHOT', `成员缺少 Runtime Snapshot：${characterId}`);
        const event: DomainEvent = {
          id: stableRuntimeUuid('group-event', this.tenantId, characterId, turnId),
          tenantId: this.tenantId, characterId, actorId: input.speakerId,
          eventType: characterId === input.speakerId ? 'group_chat_turn' : 'group_observation',
          importance: characterId === input.speakerId ? 0.5 : 0.4,
          occurredAt,
          payload: {
            source: 'group-chat', groupId: input.groupId, groupTurnId: turnId,
            logicalTurnId: logicalId, speakerId: input.speakerId,
            userMessage: input.userMessage, assistantMessage: input.assistantMessage,
          },
        };
        const reduced = reduceRuntimeState(snapshot, event);
        await store.commitUsingTransaction(tx, reduced.snapshot, snapshot.version);
        await tx.query(
          `INSERT INTO group_event_links (group_turn_id, group_id, character_id, event_id)
           VALUES ($1, $2, $3, $4)`, [turnId, input.groupId, characterId, event.id]
        );
        eventIds[characterId] = event.id;
      }
      await tx.query('UPDATE group_chats SET next_sequence = $3 WHERE id = $1 AND tenant_id = $2',
        [input.groupId, this.tenantId, sequenceNo + 1]);
      return { id: turnId, groupId: input.groupId, turnId: logicalId, sequenceNo,
        speakerId: input.speakerId, userMessage: input.userMessage,
        assistantMessage: input.assistantMessage, occurredAt, eventIds };
    });
  }

  private async toTurn(tx: SqlExecutor, row: TurnRow): Promise<RuntimeGroupTurn> {
    const links = await tx.query<{ character_id: string; event_id: string }>(
      'SELECT character_id, event_id FROM group_event_links WHERE group_turn_id = $1 ORDER BY character_id',
      [row.id]
    );
    return {
      id: row.id, groupId: row.group_id, turnId: row.logical_turn_id,
      sequenceNo: Number(row.sequence_no), speakerId: row.speaker_id,
      userMessage: row.user_message, assistantMessage: row.assistant_message,
      occurredAt: new Date(row.occurred_at).toISOString(),
      eventIds: Object.fromEntries(links.rows.map((link) => [link.character_id, link.event_id])),
    };
  }
}
