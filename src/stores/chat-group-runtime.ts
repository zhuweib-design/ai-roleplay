/**
 * chat-group-runtime — Virtual Character OS Runtime 集成（群聊）子 store
 * （第三轮拆分 · ROUND_3_HIGH_RISK_SPLIT_DESIGN §2）
 *
 * 职责（优化项 7 · S5）：
 * - pendingGroupRuntimeTurns / groupRuntimeConflict 状态（本地可靠投递队列 + CAS 冲突）
 * - ensureGroupRuntimeIntegration / prepareRemoteGroupRuntime / getGroupRuntimeApi
 * - syncRemoteGroupMember / syncRemoteGroupStatus / runtimeCharacterIdFor
 * - commitRuntimeGroupTurn / retryRemoteGroupOutbox / recoverRemoteGroupOutbox
 * - fetchRemoteGroupTurns / retryPendingGroupRuntimeTurn
 * - loadRuntimePendingGroupTurns / discardPendingGroupRuntimeTurns / clearGroupRuntimeConflict
 * - 自持 storageAdapter（由兼容层 setStorageAdapter 扇出注入）
 *
 * 依赖：runtime 域（ensureRuntimeIntegration / resolveRuntimeTenantId /
 * reportRuntimeError / runtimeStatus 复位 / isRuntimeNotFound 纯函数），有向无环。
 */
import { defineStore, storeToRefs } from 'pinia';
import { ref } from 'vue';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';
import type { GroupChat } from '@/core/group-chat';
import { uiCharToCard } from '../services/type-adapters';
import { migrateSnapshot, wrapSnapshot } from '../storage/snapshot-migration';
import { PENDING_GROUP_TURNS_MIGRATION_PLAN } from '../storage/snapshot-plans';
import type { StorageAdapter } from '../storage/storage-adapter';
import { stableChatCharacterId, stableRuntimeUuid, HttpGroupRuntimeApi, type ChatRuntimeIntegration } from '@/runtime';
import { RuntimeApiError } from '@/runtime/runtime-http';
import type { RuntimeGroupTurn } from '@/runtime/group-runtime-contract';
import { logger } from '@/utils/logger';
import { useChatRuntimeStore, isRuntimeNotFound } from './chat-runtime';

const PENDING_GROUP_RUNTIME_TURNS_KEY = 'runtime:pending-group-turns:v1';

/** 远程群聊公共回合的本地可靠投递记录。内容一旦入队不可被同键新载荷覆盖。 */
export interface PendingGroupRuntimeTurn {
  groupId: string;
  turnId: string;
  speakerCharacterId: string;
  userMessage: string;
  assistantMessage: string;
  /** 首次提交时固定的时间；重试必须复用，避免同键被判定为内容冲突。 */
  occurredAt: string;
  createdAt: string;
  attempts: number;
  status: 'pending' | 'failed';
  lastError?: string;
  lastErrorCode?: string;
  lastErrorStatus?: number;
  /** OBS-01：上次失败的关联 ID，便于按同一 ID 回查服务端日志。 */
  lastErrorTrace?: string;
  nextRetryAt?: string;
}

export const useChatGroupRuntimeStore = defineStore('chat-group-runtime', () => {
  const runtimeStore = useChatRuntimeStore();
  const { runtimeStatus } = storeToRefs(runtimeStore);
  const { reportRuntimeError, resolveRuntimeTenantId, ensureRuntimeIntegration } = runtimeStore;

  let groupRuntimeApi: HttpGroupRuntimeApi | null | undefined;
  let storageAdapter: StorageAdapter | null = null;
  const pendingGroupRuntimeTurns = ref<PendingGroupRuntimeTurn[]>([]);
  /**
   * 群组定义 CAS 冲突：远端成员/状态已被其他客户端修改。
   * 仅记录冲突事实与远端最新定义，不自动覆盖，等待用户显式选择以服务端为准。
   */
  const groupRuntimeConflict = ref<{
    groupId: string;
    operation: 'add' | 'remove' | 'status';
    message: string;
    at: number;
    remoteMemberIds?: string[];
    remoteVersion?: number;
    remoteStatus?: 'active' | 'archived';
  } | null>(null);

  /** 注入存储适配器（由兼容层扇出调用） */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  function isGroupVersionConflict(error: unknown): boolean {
    return error instanceof RuntimeApiError
      ? error.code === 'GROUP_VERSION_CONFLICT' || error.code === 'GROUP_CONFLICT'
      : error instanceof Error && /GROUP_VERSION_CONFLICT|GROUP_CONFLICT/.test(error.message);
  }

  function clearGroupRuntimeConflict(): void {
    groupRuntimeConflict.value = null;
  }

  function isPendingGroupRuntimeTurn(value: unknown): value is PendingGroupRuntimeTurn {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return ['groupId', 'turnId', 'speakerCharacterId', 'userMessage', 'assistantMessage', 'createdAt']
      .every((key) => typeof item[key] === 'string' && (item[key] as string).length > 0)
      && Number.isFinite(Date.parse((typeof item.occurredAt === 'string' ? item.occurredAt : item.createdAt) as string))
      && Number.isSafeInteger(item.attempts) && (item.attempts as number) >= 0
      && (item.status === undefined || item.status === 'pending' || item.status === 'failed')
      && (item.lastErrorCode === undefined || typeof item.lastErrorCode === 'string')
      && (item.lastErrorStatus === undefined || (Number.isSafeInteger(item.lastErrorStatus) && (item.lastErrorStatus as number) >= 100))
      && (item.lastErrorTrace === undefined || typeof item.lastErrorTrace === 'string')
      && (item.nextRetryAt === undefined || (typeof item.nextRetryAt === 'string' && Number.isFinite(Date.parse(item.nextRetryAt))));
  }

  async function persistPendingGroupRuntimeTurns(): Promise<void> {
    if (!storageAdapter) return;
    try {
      // MIG-01：写入带版本信封，旧裸数组仍可被迁移链读取。
      await storageAdapter.saveSnapshot(
        PENDING_GROUP_RUNTIME_TURNS_KEY,
        wrapSnapshot(
          pendingGroupRuntimeTurns.value.map((item) => ({ ...item })),
          PENDING_GROUP_TURNS_MIGRATION_PLAN.currentVersion,
        ),
      );
    } catch (error) {
      reportRuntimeError(error, 'event');
    }
  }

  async function loadRuntimePendingGroupTurns(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const raw = await storageAdapter.loadSnapshot<unknown>(PENDING_GROUP_RUNTIME_TURNS_KEY);
      // MIG-01：0.3.0 旧记录由迁移链补 occurredAt/status，不做静默丢弃。
      const { data, report } = raw === null
        ? { data: null, report: null }
        : migrateSnapshot<unknown>(raw, PENDING_GROUP_TURNS_MIGRATION_PLAN);
      if (report?.changed) {
        logger.info('chat', `群聊投递队列已迁移：${report.fromVersion} → ${report.toVersion}`);
      }
      pendingGroupRuntimeTurns.value = Array.isArray(data)
        ? data.filter(isPendingGroupRuntimeTurn).map((item) => ({ ...item }))
        : [];
    } catch (error) {
      reportRuntimeError(error, 'initialize');
    }
  }

  async function enqueuePendingGroupRuntimeTurn(input: {
    groupId: string;
    turnId: string;
    speakerCharacterId: string;
    userMessage: string;
    assistantMessage: string;
    occurredAt: string;
    error?: unknown;
  }): Promise<void> {
    const existing = pendingGroupRuntimeTurns.value.find((item) =>
      item.groupId === input.groupId && item.turnId === input.turnId);
    const errorText = input.error instanceof Error ? input.error.message : String(input.error ?? t('group.runtimeSubmitFailed'));
    const errorRecord = input.error instanceof Error
      ? input.error as Error & { code?: string; status?: number; statusCode?: number; traceId?: string }
      : null;
    const errorCode = typeof errorRecord?.code === 'string' ? errorRecord.code : undefined;
    const errorStatus = Number.isSafeInteger(errorRecord?.status)
      ? errorRecord?.status
      : Number.isSafeInteger(errorRecord?.statusCode) ? errorRecord?.statusCode : undefined;
    const errorTrace = typeof errorRecord?.traceId === 'string' ? errorRecord.traceId : undefined;
    if (existing) {
      existing.attempts += 1;
      existing.lastError = errorText;
      existing.lastErrorCode = errorCode;
      existing.lastErrorStatus = errorStatus;
      existing.lastErrorTrace = errorTrace;
      existing.status = 'failed';
      existing.nextRetryAt = new Date(Date.now() + Math.min(60_000, 2_000 * (2 ** Math.min(existing.attempts - 1, 5)))).toISOString();
    } else {
      pendingGroupRuntimeTurns.value.push({
        groupId: input.groupId,
        turnId: input.turnId,
        speakerCharacterId: input.speakerCharacterId,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        occurredAt: input.occurredAt,
        createdAt: new Date().toISOString(),
        attempts: 1,
        status: 'failed',
        lastError: errorText,
        lastErrorCode: errorCode,
        lastErrorStatus: errorStatus,
        lastErrorTrace: errorTrace,
        nextRetryAt: new Date(Date.now() + 2_000).toISOString(),
      });
    }
    pendingGroupRuntimeTurns.value.sort((a, b) =>
      (a.createdAt + a.groupId + a.turnId).localeCompare(b.createdAt + b.groupId + b.turnId));
    await persistPendingGroupRuntimeTurns();
  }

  async function removePendingGroupRuntimeTurn(groupId: string, turnId: string): Promise<void> {
    pendingGroupRuntimeTurns.value = pendingGroupRuntimeTurns.value.filter((item) =>
      item.groupId !== groupId || item.turnId !== turnId);
    await persistPendingGroupRuntimeTurns();
  }

  async function discardPendingGroupRuntimeTurns(groupId: string): Promise<void> {
    pendingGroupRuntimeTurns.value = pendingGroupRuntimeTurns.value.filter((item) => item.groupId !== groupId);
    await persistPendingGroupRuntimeTurns();
  }

  function getGroupRuntimeApi(): HttpGroupRuntimeApi | null {
    const baseUrl = import.meta.env.VITE_RUNTIME_BASE_URL;
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null;
    if (groupRuntimeApi === undefined) groupRuntimeApi = new HttpGroupRuntimeApi({ baseUrl: baseUrl.trim() });
    return groupRuntimeApi;
  }

  /** 创建必须在读取群组上下文之前完成；重试只确认定义一致，不覆盖服务端成员。 */
  async function prepareRemoteGroupRuntime(input: {
    group: GroupChat;
    characters: UICharacter[];
    speakerCharacterId: string;
  }, api: HttpGroupRuntimeApi) {
    if (input.group.lifecycleStatus === 'archived') throw new Error(t('group.runtimeArchived'));
    if (!input.group.members.some((member) => member.characterId === input.speakerCharacterId)) {
      throw new Error(t('group.runtimeNotMember'));
    }
    const tenantId = resolveRuntimeTenantId();
    const integrations = new Map<string, NonNullable<Awaited<ReturnType<typeof ensureRuntimeIntegration>>>>();
    for (const member of input.group.members) {
      const character = input.characters.find((item) => item.id === member.characterId);
      if (!character) throw new Error(t('group.runtimeMemberCardMissing', { id: member.characterId }));
      const integration = await ensureRuntimeIntegration(character, uiCharToCard(character), 'group-' + input.group.id);
      if (!integration) throw new Error(t('group.runtimeMemberInitFailed', { name: character.name }));
      integrations.set(member.characterId, integration);
    }
    const runtimeGroupId = stableRuntimeUuid('group-runtime', tenantId, input.group.id);
    await api.createGroup({
      groupId: runtimeGroupId,
      name: input.group.name,
      memberIds: input.group.members.map((member) => integrations.get(member.characterId)!.characterId),
    });
    return { runtimeGroupId, speaker: integrations.get(input.speakerCharacterId)! };
  }

  async function ensureGroupRuntimeIntegration(input: {
    group: GroupChat;
    characters: UICharacter[];
    speakerCharacterId: string;
  }): Promise<ChatRuntimeIntegration | null> {
    const api = getGroupRuntimeApi();
    if (!api) {
      const character = input.characters.find((item) => item.id === input.speakerCharacterId);
      return character ? ensureRuntimeIntegration(character, uiCharToCard(character), 'group-' + input.group.id) : null;
    }
    try {
      const { runtimeGroupId, speaker } = await prepareRemoteGroupRuntime(input, api);
      // 不修改缓存的单角色 Integration，避免群聊绑定污染普通单聊或其他群组。
      return {
        ...speaker,
        requireContext: true,
        api: {
          buildContext: (characterId, request) => {
            if (characterId !== speaker.characterId) throw new Error(t('group.runtimeContextMismatch'));
            return api.buildMemberContext(runtimeGroupId, speaker.characterId, request);
          },
          ingestEvent: async () => { throw new Error(t('group.runtimeMustUsePublicTurn')); },
        },
      };
    } catch (error) {
      reportRuntimeError(error, 'initialize');
      // 远端初始化失败必须中止生成，不能退回无授权的普通单角色上下文。
      throw error;
    }
  }

  /**
   * UI 角色 → Runtime 角色 ID。
   * 冲突恢复需要把服务端返回的成员 ID 映射回本地角色卡，避免依赖内部缓存。
   */
  function runtimeCharacterIdFor(character: UICharacter): string {
    return stableChatCharacterId(resolveRuntimeTenantId(), character.id);
  }

  async function syncRemoteGroupMember(input: {
    group: GroupChat;
    characters: UICharacter[];
    memberCharacterId: string;
    operation: 'add' | 'remove';
  }): Promise<{ enabled: boolean; synced: boolean }> {
    const api = getGroupRuntimeApi();
    if (!api) return { enabled: false, synced: true };
    try {
      if (input.group.members.length < 2 || !input.group.members.some((member) =>
        member.characterId === input.memberCharacterId)) {
        if (input.operation === 'remove') throw new Error(t('group.runtimeRemoveNotMember'));
      }
      const anchor = input.group.members[0];
      if (!anchor) throw new Error(t('group.runtimeNoAnchorMember'));
      const { runtimeGroupId } = await prepareRemoteGroupRuntime({
        group: input.group,
        characters: input.characters,
        speakerCharacterId: anchor.characterId,
      }, api);
      // 读取版本后以 CAS 执行显式成员变更；并发客户端修改会得到 409，而不会静默覆盖。
      const state = await api.getGroupState(runtimeGroupId);
      const target = input.characters.find((character) => character.id === input.memberCharacterId);
      if (!target) throw new Error(t('group.runtimeMemberCardMissing', { id: input.memberCharacterId }));
      const targetIntegration = await ensureRuntimeIntegration(target, uiCharToCard(target), 'group-' + input.group.id);
      if (!targetIntegration) throw new Error(t('group.runtimeMemberInitFailed', { name: target.name }));
      if (input.operation === 'add') {
        await api.addMember(runtimeGroupId, targetIntegration.characterId, state.version);
      } else {
        await api.removeMember(runtimeGroupId, targetIntegration.characterId, state.version);
      }
      runtimeStatus.value = null;
      clearGroupRuntimeConflict();
      return { enabled: true, synced: true };
    } catch (error) {
      reportRuntimeError(error, 'event');
      // CAS 冲突：记录远端最新定义，供界面提示与「以服务端为准」恢复使用。
      if (isGroupVersionConflict(error)) {
        try {
          const anchor = input.group.members[0];
          if (anchor) {
            const { runtimeGroupId } = await prepareRemoteGroupRuntime({
              group: input.group,
              characters: input.characters,
              speakerCharacterId: anchor.characterId,
            }, api);
            const remote = await api.getGroupState(runtimeGroupId);
            groupRuntimeConflict.value = {
              groupId: input.group.id,
              operation: input.operation,
              message: error instanceof Error ? error.message : String(error),
              at: Date.now(),
              remoteMemberIds: remote.memberIds,
              remoteVersion: remote.version,
              remoteStatus: remote.status,
            };
          }
        } catch {
          // 读取远端定义失败时保留冲突事实，不阻断既有错误上报。
          groupRuntimeConflict.value = {
            groupId: input.group.id,
            operation: input.operation,
            message: error instanceof Error ? error.message : String(error),
            at: Date.now(),
          };
        }
      }
      return { enabled: true, synced: false };
    }
  }

  /**
   * 同步群组归档 / 恢复状态到服务端。
   * 远端成功后才允许本地变更，失败时不修改本地生命周期，避免本地与服务端状态分叉。
   */
  async function syncRemoteGroupStatus(input: {
    group: GroupChat;
    characters: UICharacter[];
    status: 'active' | 'archived';
  }): Promise<{ enabled: boolean; synced: boolean }> {
    const api = getGroupRuntimeApi();
    if (!api) return { enabled: false, synced: true };
    try {
      const anchor = input.group.members[0];
      if (!anchor) throw new Error(t('group.runtimeNoAnchorMember'));
      const { runtimeGroupId } = await prepareRemoteGroupRuntime({
        group: input.group,
        characters: input.characters,
        speakerCharacterId: anchor.characterId,
      }, api);
      const state = await api.getGroupState(runtimeGroupId);
      if (state.status !== input.status) {
        await api.setGroupStatus({ groupId: runtimeGroupId, status: input.status, expectedVersion: state.version });
      }
      runtimeStatus.value = null;
      clearGroupRuntimeConflict();
      return { enabled: true, synced: true };
    } catch (error) {
      reportRuntimeError(error, 'event');
      if (isGroupVersionConflict(error)) {
        try {
          const anchor = input.group.members[0];
          if (anchor) {
            const { runtimeGroupId } = await prepareRemoteGroupRuntime({
              group: input.group,
              characters: input.characters,
              speakerCharacterId: anchor.characterId,
            }, api);
            const remote = await api.getGroupState(runtimeGroupId);
            groupRuntimeConflict.value = {
              groupId: input.group.id,
              operation: 'status',
              message: error instanceof Error ? error.message : String(error),
              at: Date.now(),
              remoteMemberIds: remote.memberIds,
              remoteVersion: remote.version,
              remoteStatus: remote.status,
            };
          }
        } catch {
          groupRuntimeConflict.value = {
            groupId: input.group.id,
            operation: 'status',
            message: error instanceof Error ? error.message : String(error),
            at: Date.now(),
          };
        }
      }
      return { enabled: true, synced: false };
    }
  }

  async function commitRuntimeGroupTurn(input: {
    group: GroupChat;
    characters: UICharacter[];
    speakerCharacterId: string;
    turnId: string;
    userMessage: string;
    assistantMessage: string;
    occurredAt?: string;
  }): Promise<{ enabled: boolean; committed: boolean }> {
    const api = getGroupRuntimeApi();
    if (!api) return { enabled: false, committed: false };
    const pending = pendingGroupRuntimeTurns.value.find((item) =>
      item.groupId === input.group.id && item.turnId === input.turnId);
    let occurredAt = pending?.occurredAt ?? input.occurredAt ?? new Date().toISOString();
    if (pending && (pending.speakerCharacterId !== input.speakerCharacterId
      || pending.userMessage !== input.userMessage || pending.assistantMessage !== input.assistantMessage)) {
      const conflict = new RuntimeApiError(409, 'OUTBOX_CONFLICT', t('group.runtimeLocalOutboxConflict'));
      reportRuntimeError(conflict, 'event');
      return { enabled: true, committed: false };
    }
    try {
      const { runtimeGroupId, speaker } = await prepareRemoteGroupRuntime(input, api);
      // 服务端可靠投递：先入队持久化，再尝试原子提交。
      // 若标签页在提交前崩溃，服务端仍保留 pending 记录，可由 outbox 重放。
      const enqueued = await api.enqueueTurn({
        groupId: runtimeGroupId,
        turnId: input.turnId,
        speakerId: speaker.characterId,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        occurredAt,
      });
      // 服务端首次入队生成的时间是权威值；重复请求必须复用该时间。
      occurredAt = enqueued.occurredAt;
      await api.commitTurn({
        groupId: runtimeGroupId,
        turnId: input.turnId,
        speakerId: speaker.characterId,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        occurredAt,
      });
      await removePendingGroupRuntimeTurn(input.group.id, input.turnId);
      runtimeStatus.value = null;
      return { enabled: true, committed: true };
    } catch (error) {
      reportRuntimeError(error, 'event');
      await enqueuePendingGroupRuntimeTurn({
        groupId: input.group.id,
        turnId: input.turnId,
        speakerCharacterId: input.speakerCharacterId,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        occurredAt,
        error,
      });
      return { enabled: true, committed: false };
    }
  }

  /**
   * 触发服务端 outbox 重放：把服务端仍为 pending / failed 的回合尝试提交。
   * 用于本地队列丢失但服务端仍有待处理记录的场景（例如标签页在本地快照写入前崩溃）。
   */
  async function retryRemoteGroupOutbox(input: {
    group: GroupChat;
    characters: UICharacter[];
  }): Promise<{ enabled: boolean; attempted: number; committed: number }> {
    const api = getGroupRuntimeApi();
    if (!api) return { enabled: false, attempted: 0, committed: 0 };
    try {
      const anchor = input.group.members[0];
      if (!anchor) throw new Error(t('group.runtimeNoAnchorMember'));
      const { runtimeGroupId } = await prepareRemoteGroupRuntime({
        group: input.group,
        characters: input.characters,
        speakerCharacterId: anchor.characterId,
      }, api);
      const results = await api.retryPendingTurns(runtimeGroupId);
      const committedItems = results.filter((item) => item.status === 'committed');
      // 服务端已提交的条目同步清理本地队列
      for (const item of committedItems) {
        await removePendingGroupRuntimeTurn(input.group.id, item.turnId);
      }
      runtimeStatus.value = null;
      return { enabled: true, attempted: results.length, committed: committedItems.length };
    } catch (error) {
      reportRuntimeError(error, 'event');
      return { enabled: true, attempted: 0, committed: 0 };
    }
  }

  /** 恢复本地快照之外仍保存在服务端 outbox 的回合，交给现有的显式重试入口处理。 */
  async function recoverRemoteGroupOutbox(input: {
    group: GroupChat;
    characters: UICharacter[];
  }): Promise<{ enabled: boolean; recovered: number }> {
    const api = getGroupRuntimeApi();
    if (!api) return { enabled: false, recovered: 0 };
    if (input.group.lifecycleStatus === 'archived') return { enabled: true, recovered: 0 };
    try {
      const anchor = input.group.members[0];
      if (!anchor) throw new Error(t('group.runtimeNoAnchorMember'));
      const { runtimeGroupId } = await prepareRemoteGroupRuntime({
        group: input.group,
        characters: input.characters,
        speakerCharacterId: anchor.characterId,
      }, api);
      const remoteEntries = await api.listPendingTurns(runtimeGroupId);
      const localIdByRuntimeId = new Map(input.characters.map((character) => [
        runtimeCharacterIdFor(character), character.id,
      ]));
      let recovered = 0;
      let changed = false;
      for (const entry of remoteEntries) {
        const speakerCharacterId = localIdByRuntimeId.get(entry.speakerId);
        if (!speakerCharacterId || !input.group.members.some((member) => member.characterId === speakerCharacterId)) {
          reportRuntimeError(new RuntimeApiError(409, 'OUTBOX_SPEAKER_UNAVAILABLE', t('group.runtimeOutboxSpeakerUnavailable')), 'event');
          continue;
        }
        const existing = pendingGroupRuntimeTurns.value.find((item) =>
          item.groupId === input.group.id && item.turnId === entry.turnId);
        if (existing && (existing.speakerCharacterId !== speakerCharacterId
          || existing.userMessage !== entry.userMessage || existing.assistantMessage !== entry.assistantMessage)) {
          reportRuntimeError(new RuntimeApiError(409, 'OUTBOX_CONFLICT', t('group.runtimeLocalOutboxConflict')), 'event');
          continue;
        }
        const recoveredTurn: PendingGroupRuntimeTurn = {
          groupId: input.group.id,
          turnId: entry.turnId,
          speakerCharacterId,
          userMessage: entry.userMessage,
          assistantMessage: entry.assistantMessage,
          occurredAt: entry.occurredAt,
          createdAt: entry.createdAt,
          attempts: entry.attempts,
          status: entry.status === 'failed' ? 'failed' : 'pending',
          ...(entry.lastError === undefined ? {} : { lastError: entry.lastError }),
        };
        if (existing) {
          Object.assign(existing, recoveredTurn, {
            attempts: Math.max(existing.attempts, entry.attempts),
            status: entry.status === 'failed' ? 'failed' : existing.status,
            lastError: entry.lastError ?? existing.lastError,
            lastErrorCode: existing.lastErrorCode,
            lastErrorStatus: existing.lastErrorStatus,
            lastErrorTrace: existing.lastErrorTrace,
            nextRetryAt: existing.nextRetryAt,
          });
        } else {
          pendingGroupRuntimeTurns.value.push(recoveredTurn);
        }
        recovered += 1;
        changed = true;
      }
      if (changed) {
        pendingGroupRuntimeTurns.value.sort((a, b) =>
          (a.createdAt + a.groupId + a.turnId).localeCompare(b.createdAt + b.groupId + b.turnId));
        await persistPendingGroupRuntimeTurns();
      }
      return { enabled: true, recovered };
    } catch (error) {
      reportRuntimeError(error, 'event');
      return { enabled: true, recovered: 0 };
    }
  }

  /**
   * 拉取服务端群聊公共回合历史（跨设备历史同步）。
   *
   * - 以群组任一有效成员身份读取（服务端要求成员限定）。
   * - 远端模式未启用时返回 enabled=false，调用方保持纯本地历史。
   * - 只读，不写服务端；合并去重由调用方（group-chat store）负责。
   */
  async function fetchRemoteGroupTurns(input: {
    group: GroupChat;
    characters: UICharacter[];
  }): Promise<{ enabled: boolean; turns: RuntimeGroupTurn[] }> {
    const api = getGroupRuntimeApi();
    if (!api) return { enabled: false, turns: [] };
    try {
      const anchor = input.group.members[0];
      if (!anchor) throw new Error(t('group.runtimeNoAnchorMember'));
      const { runtimeGroupId, speaker } = await prepareRemoteGroupRuntime({
        group: input.group,
        characters: input.characters,
        speakerCharacterId: anchor.characterId,
      }, api);
      const turns = await api.listTurns(runtimeGroupId, speaker.characterId);
      return { enabled: true, turns };
    } catch (error) {
      if (isRuntimeNotFound(error)) return { enabled: true, turns: [] };
      reportRuntimeError(error, 'context');
      return { enabled: true, turns: [] };
    }
  }

  /** 显式重试入口：复用稳定回合键重发，不重复生成、不覆盖本地载荷。 */
  async function retryPendingGroupRuntimeTurn(input: {
    group: GroupChat;
    characters: UICharacter[];
    groupTurnId: string;
  }): Promise<{ enabled: boolean; committed: boolean }> {
    const pending = pendingGroupRuntimeTurns.value.find((item) =>
      item.groupId === input.group.id && item.turnId === input.groupTurnId);
    if (!pending) return { enabled: true, committed: false };
    pending.status = 'pending';
    pending.nextRetryAt = undefined;
    await persistPendingGroupRuntimeTurns();
    return commitRuntimeGroupTurn({
      group: input.group,
      characters: input.characters,
      speakerCharacterId: pending.speakerCharacterId,
      turnId: pending.turnId,
      userMessage: pending.userMessage,
      assistantMessage: pending.assistantMessage,
      occurredAt: pending.occurredAt,
    });
  }

  return {
    setStorageAdapter,
    clearGroupRuntimeConflict,
    loadRuntimePendingGroupTurns,
    discardPendingGroupRuntimeTurns,
    ensureGroupRuntimeIntegration,
    syncRemoteGroupMember,
    syncRemoteGroupStatus,
    runtimeCharacterIdFor,
    commitRuntimeGroupTurn,
    retryRemoteGroupOutbox,
    recoverRemoteGroupOutbox,
    fetchRemoteGroupTurns,
    retryPendingGroupRuntimeTurn,
    pendingGroupRuntimeTurns,
    groupRuntimeConflict,
  };
});
