import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UIMessage, UICharacter, ApiProfile } from '@/types';
import type { GroupChat } from '@/core/group-chat';
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_RESERVED_TOKENS,
} from '@/types';
import type { CharacterCard } from '@/core/character-card';
import { ChatManager, classifyChatError, type ChatManagerConfig } from '../services/chat-manager';
import { chatErrorI18n } from '../services/chat-error';
import { createApiClient } from '../api';
import { ApiError, type ApiErrorKind, type ReasoningEffort } from '../api/types';
import { resolveReasoningCapability } from '../api/reasoning-capability';
import type { StorageAdapter } from '../storage/storage-adapter';
import { getActiveProfileId, getStorageAdapter } from '../storage/storage-factory';
import type { Chat } from '../storage/types';
import {
  uiCharToCard,
  uiMsgsToChatMsgs,
} from '../services/type-adapters';
import { usePersonaStore } from './persona';
import { useEventsStore } from './events';
import { buildChatSessionContext, collectLorebooksForCharacter } from './chat-context';
import { buildVectorRagInjection, getRagDynamicModel, getRagStaticModel } from '@/core/dual-channel-runtime';
import {
  buildRandomEventMessages,
  parseGeneratedRandomEvent,
  generatedRandomEventToStoryEvent,
  createRandomEventResult,
  type RandomEventParams,
} from '@/core/random-event-generator';
import { useRandomEventsStore } from './random-events';
import { isSlashCommand, executePipeline } from '@/core/slash-command';
import { createSlashCommandContext } from '@/core/variable-store';
import { extensionRegistry } from '@/core/extension-loader';
import { useStoryStore } from './story';
import { countTokens } from '@/core/token-counter';
import { getBuiltinToolDefinitions, executeBuiltinTool } from '@/core/tool-registry';
import { loadGlobalVariables, setGlobalVariable } from '@/core/variable-store';
import { useDataBankStore } from './data-bank';
import { OptimizationPipeline, loadOptimizationConfig } from '@/core/optimization-pipeline';
import { MemoryStore, CharacterRegistry, EmotionTracker } from '@/core/memory-store';
import type { L0L2Deps } from '@/core/l0-l2-runtime';
import {
  createProjectRuntime,
  stableChatCharacterId,
  stableChatTargetId,
  stableRuntimeUuid,
  HttpGroupRuntimeApi,
  type ChatRuntimeIntegration,
  type RuntimeApi,
  type CharacterCompileInput,
  type RuntimeBatchCreateResult,
} from '@/runtime';
import { RuntimeApiError } from '@/runtime/runtime-http';

/** 远程群聊公共回合的本地可靠投递记录。内容一旦入队不可被同键新载荷覆盖。 */
export interface PendingGroupRuntimeTurn {
  groupId: string;
  turnId: string;
  speakerCharacterId: string;
  userMessage: string;
  assistantMessage: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

const PENDING_GROUP_RUNTIME_TURNS_KEY = 'runtime:pending-group-turns:v1';

/**
 * 将任意错误对象转换为 lastError 记录
 * 若为 ApiError，提取 kind 与 statusCode 供 UI 精确诊断
 */
function toLastErrorRecord(
  err: Error,
  type: 'aborted' | 'api' | 'network' | 'unknown'
): {
  type: 'aborted' | 'api' | 'network' | 'unknown';
  message: string;
  kind?: ApiErrorKind;
  statusCode?: number;
  original?: Error;
} {
  if (err instanceof ApiError) {
    return {
      type,
      message: err.message,
      kind: err.kind,
      statusCode: err.statusCode,
      original: err,
    };
  }
  return {
    type,
    message: err.message,
    original: err,
  };
}

/**
 * P0-3：把采样参数对象转为 ChatManagerConfig 的 patch
 *
 * 关键：**只输出已设置的键**。若把 `undefined` 也写进去，
 * `{...config, ...overrides}` 会用 undefined 覆盖掉下一档的默认值 ——
 * 这正是既有 `profile.maxTokens` 成为死代码的原因（§0.3），新参数不能再踩。
 */
function buildSamplingConfigPatch(
  sampling?: { topP?: number | null; presencePenalty?: number | null; frequencyPenalty?: number | null } | null
): Partial<Pick<ChatManagerConfig, 'topP' | 'presencePenalty' | 'frequencyPenalty'>> {
  const patch: Partial<Pick<ChatManagerConfig, 'topP' | 'presencePenalty' | 'frequencyPenalty'>> = {};
  if (!sampling) return patch;
  if (typeof sampling.topP === 'number' && Number.isFinite(sampling.topP)) {
    patch.topP = sampling.topP;
  }
  if (typeof sampling.presencePenalty === 'number' && Number.isFinite(sampling.presencePenalty)) {
    patch.presencePenalty = sampling.presencePenalty;
  }
  if (typeof sampling.frequencyPenalty === 'number' && Number.isFinite(sampling.frequencyPenalty)) {
    patch.frequencyPenalty = sampling.frequencyPenalty;
  }
  return patch;
}

/**
 * Chat Store (Phase D4)
 *
 * 职责：
 * 1. 维护生成状态（isGenerating）
 * 2. 维护当前注入的 ChatManager（由 settings store 注入 API Profile 时创建）
 * 3. 维护当前注入的 StorageAdapter（由 App.vue 在启动时注入）
 * 4. 调用 ChatManager.sendMessage 进行流式生成
 * 5. 完成后通过 StorageAdapter.saveChat 持久化对话
 * 6. 错误分类（aborted / api / network / unknown）反馈到 UI
 *
 * 不负责：
 * - 角色卡 CRUD（由 character store 负责）
 * - API Profile 管理（由 settings store 负责）
 * - 设置持久化（由 settings store + storage adapter 负责）
 */
export const useChatStore = defineStore('chat', () => {
  const isGenerating = ref(false);
  const streamingContent = ref('');
  /**
   * 最近一次错误（含分类与原始错误对象引用）
   * - type：粗分类（aborted/api/network/unknown），由 classifyChatError 生成
   * - kind：细分类（ApiErrorKind），仅在 ApiError 时有值，用于精确诊断
   * - message：错误消息
   * - original：原始错误对象，供 UI 进一步诊断（如 ApiErrorDiagnostics）
   */
  const lastError = ref<{
    type: 'aborted' | 'api' | 'network' | 'unknown';
    message: string;
    kind?: ApiErrorKind;
    statusCode?: number;
    original?: Error;
  } | null>(null);

  // F11.2 当前对话的局部变量（随对话元数据持久化，内存中管理）
  const chatVariables = ref<Record<string, string>>({});

  // 第2条：Token 消耗统计（本次会话累计，客户端估算）
  const tokenUsage = ref({ prompt: 0, completion: 0 });

  // ── 多会话（§14.2 历史会话切换/搜索/置顶/归档） ──
  /** 当前激活会话 id（决定聊天区渲染哪条会话、persistChat 写入哪条） */
  const activeChatId = ref<string | null>(null);
  /** 会话索引缓存（移动端会话 Tab / 桌面侧边栏展示；含全部角色，归档由 UI 过滤） */
  const sessions = ref<Chat[]>([]);
  // 前缀缓存统计(usage 带 cache 拆解时累积)
  const cacheUsage = ref({ hitTokens: 0, missTokens: 0, reported: 0 });
  const totalTokenUsage = computed(() => tokenUsage.value.prompt + tokenUsage.value.completion);
  /** 前缀缓存命中率(0-1;无数据时 null) */
  const prefixCacheHitRate = computed<number | null>(() => {
    const total = cacheUsage.value.hitTokens + cacheUsage.value.missTokens;
    if (total <= 0) return null;
    return cacheUsage.value.hitTokens / total;
  });
  // 前缀稳定率(供应商不返回缓存字段时的本地代理指标:缓存命中的必要条件)
  const prefixStability = ref({ stable: 0, total: 0, lastPrefix: '' });
  const prefixStableRate = computed<number | null>(() => {
    if (prefixStability.value.total <= 0) return null;
    return prefixStability.value.stable / prefixStability.value.total;
  });
  // 首 token 延迟统计(TTFT;命中缓存时显著降低,启发式观测)
  const ttftStats = ref({ lastMs: 0, avgMs: 0, count: 0 });
  let requestStartAt = 0;
  let ttftReported = false;

  /** 角色 standing 前缀(角色卡核心段;与请求前缀缓存相关的稳定段近似) */
  function buildCharacterPrefix(card: CharacterCard): string {
    return [
      card.id,
      card.name,
      card.description,
      card.personality,
      card.scenario,
      card.characterNote ?? '',
    ].join('|');
  }

  /** 每轮请求开始:TTFT 计时 + 前缀稳定检测(与上一轮对比) */
  function beginRequestTracking(card: CharacterCard): void {
    requestStartAt = Date.now();
    ttftReported = false;
    const currentPrefix = buildCharacterPrefix(card);
    const prev = prefixStability.value;
    if (prev.lastPrefix !== '') {
      prefixStability.value = {
        stable: prev.stable + (prev.lastPrefix === currentPrefix ? 1 : 0),
        total: prev.total + 1,
        lastPrefix: currentPrefix,
      };
    } else {
      prefixStability.value = { ...prev, lastPrefix: currentPrefix };
    }
  }

  // 注入的依赖（运行时由外部设置）
  let chatManager: ChatManager | null = null;
  let storageAdapter: StorageAdapter | null = null;
  // E-01/E-02: L0/L2 运行时依赖(内存实现;持久化接线待续 ponytail)
  const l0Store = new MemoryStore();
  const l0l2Deps: L0L2Deps = {
    store: l0Store,
    registry: new CharacterRegistry(l0Store),
    tracker: new EmotionTracker(),
  };

  // Virtual Character OS Runtime：默认使用本地快照，配置 VITE_RUNTIME_BASE_URL 后切换为服务端 HTTP。
  // 单聊 Runtime 允许降级；远程群聊初始化和成员限定上下文失败时必须中止生成。
  let runtimeApi: RuntimeApi | null = null;
  let groupRuntimeApi: HttpGroupRuntimeApi | null | undefined;
  let runtimeTenantId: string | null = null;
  const runtimeIntegrations = new Map<string, Promise<ChatRuntimeIntegration | null>>();
  const runtimeStatus = ref<{ phase: 'initialize' | 'context' | 'event'; message: string; at: number } | null>(null);
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
  function runtimeTenantStorageKey(): string {
    return `ai-roleplay:runtime-tenant-id:${getActiveProfileId()}`;
  }

  function reportRuntimeError(error: unknown, phase: 'initialize' | 'context' | 'event'): void {
    const message = error instanceof Error ? error.message : String(error);
    runtimeStatus.value = { phase, message, at: Date.now() };
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
      && Number.isSafeInteger(item.attempts) && (item.attempts as number) >= 0;
  }

  async function persistPendingGroupRuntimeTurns(): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.saveSnapshot(
        PENDING_GROUP_RUNTIME_TURNS_KEY,
        pendingGroupRuntimeTurns.value.map((item) => ({ ...item })),
      );
    } catch (error) {
      reportRuntimeError(error, 'event');
    }
  }

  async function loadRuntimePendingGroupTurns(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const saved = await storageAdapter.loadSnapshot<unknown>(PENDING_GROUP_RUNTIME_TURNS_KEY);
      pendingGroupRuntimeTurns.value = Array.isArray(saved)
        ? saved.filter(isPendingGroupRuntimeTurn).map((item) => ({ ...item }))
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
    error?: unknown;
  }): Promise<void> {
    const existing = pendingGroupRuntimeTurns.value.find((item) =>
      item.groupId === input.groupId && item.turnId === input.turnId);
    const errorText = input.error instanceof Error ? input.error.message : String(input.error ?? t('group.runtimeSubmitFailed'));
    if (existing) {
      existing.attempts += 1;
      existing.lastError = errorText;
    } else {
      pendingGroupRuntimeTurns.value.push({
        groupId: input.groupId,
        turnId: input.turnId,
        speakerCharacterId: input.speakerCharacterId,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
        createdAt: new Date().toISOString(),
        attempts: 1,
        lastError: errorText,
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

  function resolveRuntimeTenantId(): string {
    if (runtimeTenantId) return runtimeTenantId;
    try {
      const saved = localStorage.getItem(runtimeTenantStorageKey());
      if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
        runtimeTenantId = saved;
        return saved;
      }
    } catch {
      // 存储不可用时使用当前进程内的租户标识。
    }
    const generated = globalThis.crypto?.randomUUID?.() ?? stableChatCharacterId('local-runtime', `${Date.now()}-${Math.random()}`);
    runtimeTenantId = generated;
    try {
      localStorage.setItem(runtimeTenantStorageKey(), generated);
    } catch {
      // 隐私模式或 Tauri 环境存储不可用时忽略。
    }
    return generated;
  }

  async function getRuntimeApi(): Promise<RuntimeApi> {
    if (runtimeApi) return runtimeApi;
    const baseUrl = import.meta.env.VITE_RUNTIME_BASE_URL;
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
      // 服务端 Runtime 不依赖浏览器本地存储，避免远程模式被 IndexedDB 初始化阻断。
      runtimeApi = createProjectRuntime({ server: { baseUrl: baseUrl.trim() } });
      return runtimeApi;
    }
    // App.vue 通常会提前初始化并注入适配器；直接调用 store 的测试/嵌入场景也应自举完成初始化。
    if (!storageAdapter) {
      const adapter = getStorageAdapter();
      await adapter.init();
    }
    runtimeApi = createProjectRuntime();
    return runtimeApi;
  }

  // i18n-ignore-start  // 服务端错误码与文案匹配规则，非 UI 文案
  function isRuntimeNotFound(error: unknown): boolean {
    return error instanceof RuntimeApiError
      ? error.status === 404
      : error instanceof Error && /不存在|NOT_FOUND|404/.test(error.message);
  }

  function isRuntimeAlreadyExists(error: unknown): boolean {
    return error instanceof RuntimeApiError
      ? error.status === 409 || /已存在|ALREADY_EXISTS/.test(error.message)
      : error instanceof Error && /已存在|already exists|ALREADY_EXISTS/.test(error.message);
  }
  // i18n-ignore-end

  function runtimeInputForCard(tenantId: string, character: UICharacter, card: CharacterCard): CharacterCompileInput {
    return {
      tenantId,
      id: stableChatCharacterId(tenantId, character.id),
      profile: {
        displayName: card.name.trim() || character.id,
        description: card.description,
        speakingStyle: card.personality,
      },
      // i18n-ignore-start  // 写入 Runtime 的种子记忆内容属模型面文本，非 UI 文案
      seedMemories: [
        ...(card.description.trim()
          ? [{ type: 'semantic' as const, content: card.description.trim(), importance: 0.5 }]
          : []),
        ...(card.scenario.trim()
          ? [{ type: 'episodic' as const, content: `场景：${card.scenario.trim()}`, importance: 0.4 }]
          : []),
      ],
      // i18n-ignore-end
    };
  }

  async function createRuntimeCharactersBatch(characters: UICharacter[]): Promise<RuntimeBatchCreateResult | null> {
    if (characters.length === 0) return { items: [] };
    if (characters.length > 50) {
      reportRuntimeError(new Error(t('group.runtimeBatchLimit')), 'initialize');
      return null;
    }
    try {
      const tenantId = resolveRuntimeTenantId();
      const api = await getRuntimeApi();
      return await api.createCharacters(characters.map((character) =>
        runtimeInputForCard(tenantId, character, uiCharToCard(character))
      ));
    } catch (error) {
      reportRuntimeError(error, 'initialize');
      return null;
    }
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
    const integrations = new Map<string, ChatRuntimeIntegration>();
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
  }): Promise<{ enabled: boolean; committed: boolean }> {
    const api = getGroupRuntimeApi();
    if (!api) return { enabled: false, committed: false };
    try {
      const { runtimeGroupId, speaker } = await prepareRemoteGroupRuntime(input, api);
      // 服务端可靠投递：先入队持久化，再尝试原子提交。
      // 若标签页在提交前崩溃，服务端仍保留 pending 记录，可由 outbox 重放。
      await api.enqueueTurn({
        groupId: runtimeGroupId,
        turnId: input.turnId,
        speakerId: speaker.characterId,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
      });
      await api.commitTurn({
        groupId: runtimeGroupId,
        turnId: input.turnId,
        speakerId: speaker.characterId,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
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

  async function ensureRuntimeIntegration(
    character: UICharacter,
    card: CharacterCard,
    conversationKey = activeChatId.value ?? `chat-${character.id}`
  ): Promise<ChatRuntimeIntegration | null> {
    const integrationKey = `${character.id}\u0000${conversationKey}`;
    const existing = runtimeIntegrations.get(integrationKey);
    if (existing) return existing;
    const pending = (async (): Promise<ChatRuntimeIntegration | null> => {
      const tenantId = resolveRuntimeTenantId();
      const api = await getRuntimeApi();
      const runtimeCharacterId = stableChatCharacterId(tenantId, character.id);
      try {
        try {
          await api.getCharacter(runtimeCharacterId);
        } catch (error) {
          if (!isRuntimeNotFound(error)) throw error;
          try {
            await api.createCharacter(runtimeInputForCard(tenantId, character, card));
          } catch (createError) {
            // 并发初始化时可能由另一请求先创建，重新读取即可继续。
            if (!isRuntimeAlreadyExists(createError)) throw createError;
            await api.getCharacter(runtimeCharacterId);
          }
        }
        return {
          api,
          tenantId,
          characterId: runtimeCharacterId,
          conversationKey,
          sessionKey: conversationKey,
          // UI 角色 ID 未必是 UUID；远程 PostgreSQL 需要稳定的 Target UUID。
          targetId: stableChatTargetId(tenantId, character.id),
          contextRequest: { maxEvents: 12, maxMemories: 8, maxEpisodes: 5 },
          onError: reportRuntimeError,
        };
      } catch (error) {
        reportRuntimeError(error, 'initialize');
        return null;
      }
    })();
    runtimeIntegrations.set(integrationKey, pending);
    const resolved = await pending;
    // 初始化失败不缓存 null，允许临时网络/存储故障在下一轮自动恢复。
    if (!resolved && runtimeIntegrations.get(integrationKey) === pending) {
      runtimeIntegrations.delete(integrationKey);
    }
    return resolved;
  }
  // 生成中切换的 API Profile 暂存，任务结束后应用（修复：原实现直接丢弃）
  let pendingProfile: {
    profile: ApiProfile | null;
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>;
  } | null = null;
  /**
   * P0-2：当前生效 Profile（用于思考强度能力判定）
   * capability === 'none' 时角色级的 reasoningEffort 会被静默丢弃（不报错、不打断对话）
   */
  let activeProfileForCapability: ApiProfile | null = null;

  /**
   * 全局上下文长度缓存（maxContextTokens / reservedTokens）
   *
   * applyApiProfile 是**同步**函数，无法 await 惰性导入 settings store（避免循环依赖），
   * 故由每轮发送前的 applyRuntimeLlmControls（异步）从 settings 同步到这两个缓存，
   * 供 applyApiProfile 在同步构建 ChatManager 时读取。
   */
  let globalMaxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS;
  let globalReservedTokens = DEFAULT_RESERVED_TOKENS;

  /**
   * 本轮 ChatManager 的上下文长度是否由调用方**显式** options 指定。
   * undefined = 未显式指定 → 允许全局设置（settings）生效；
   * 否则显式传入优先于全局设置（优先级：options > settings > 默认）。
   */
  let explicitMaxContextTokens: number | undefined;
  let explicitReservedTokens: number | undefined;

  // ── 依赖注入 ──

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   * 用于对话持久化（saveChat / loadChat）
   */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  /**
   * 设置当前激活的 API Profile
   * 会在内部重建 ChatManager（保留正在进行的生成直到完成）
   *
   * @param profile API Profile（来自 settings store），传 null 表示断开
   * @param options 可选配置（如覆盖 userName / maxContextTokens）
   */
  function setApiProfile(
    profile: ApiProfile | null,
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>
  ): void {
    // 若有进行中的生成，暂存新 profile，任务结束后自动应用
    if (chatManager?.isGenerating) {
      pendingProfile = { profile, options };
      return;
    }
    pendingProfile = null;
    applyApiProfile(profile, options);
  }

  /**
   * 实际重建 ChatManager（不检查生成状态，由调用方保证时机）
   */
  function applyApiProfile(
    profile: ApiProfile | null,
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>
  ): void {
    if (!profile) {
      chatManager = null;
      activeProfileForCapability = null;
      return;
    }
    activeProfileForCapability = profile;

    // 记录本轮 options 是否显式指定上下文长度（供 applyRuntimeLlmControls 判断是否用全局设置覆盖）
    explicitMaxContextTokens = options?.maxContextTokens;
    explicitReservedTokens = options?.reservedTokens;

    const apiClient = createApiClient(profile);
    // P0-2：Profile 的思考强度能力（决定是否下发；'none' 时静默丢弃）
    const capability = resolveReasoningCapability(profile);
    const config: ChatManagerConfig = {
      apiClient,
      model: profile.model,
      userName: options?.userName ?? 'User',
      systemPrompt: options?.systemPrompt ?? '',
      // 上下文长度：显式 options 优先，其次全局设置缓存（由 applyRuntimeLlmControls 同步）
      maxContextTokens: options?.maxContextTokens ?? globalMaxContextTokens,
      reservedTokens: options?.reservedTokens ?? globalReservedTokens,
      // 需求3/T-16: API Profile 默认最大 Tokens
      // 角色级未设置时 overrides 里不写该键 → 本值真正生效（此前被角色级必填 4096 无条件覆盖）
      maxTokens: profile.maxTokens,
      // P0-3：Profile 级采样参数（角色级显式设置时在 overrides 里覆盖）
      ...buildSamplingConfigPatch(profile.sampling),
      // P0-2：Profile 级默认思考强度（仅 capability 可用时才注入）
      ...(capability !== 'none' && profile.reasoningEffort
        ? { reasoningEffort: profile.reasoningEffort }
        : {}),
      // T-02: 内置工具装配 —— get_var/set_var 直连全局变量,
      // retrieve_document 惰性调用 data-bank store(global 作用域);
      // ponytail: search_lorebook 需角色级 lorebook 上下文(chat-context 持有),
      // 暂不注入(工具返回"不可用"提示,模型会向用户说明),后续随 chat 会话上下文接线
      tools: getBuiltinToolDefinitions(),
      // E-04 二期: 嵌入优化管线(默认关闭,由设置页开关;fail-open 不影响主链路)
      optimization: new OptimizationPipeline(loadOptimizationConfig()),
      // E-01/E-02: L0/L2 运行时依赖(内存实现;持久化接线待续 ponytail)
      l0l2: l0l2Deps,
      executeTool: async (call) =>
        executeBuiltinTool(call, {
          getVariable: (name) => loadGlobalVariables()[name],
          setVariable: setGlobalVariable,
          retrieveDocuments: async (query, limit) => {
            try {
              const docs = useDataBankStore().retrieveForChat([query], 'global');
              const limited = limit && limit > 0 ? docs.slice(0, limit) : docs;
              return limited.length === 0
                ? t('chat.dbNoContent')
                : limited
                    .map((d) => `【${d.documentName}】${d.chunk.content}`)
                    .join('\n\n');
            } catch {
              return t('chat.dbUnavailable');
            }
          },
        }),
    };
    chatManager = new ChatManager(config);
  }

  /**
   * P0-2/P0-3：构造本轮请求的 overrides（角色级覆盖）
   *
   * 与既有 temperature 不同，maxTokens 与新参数在**每一档都是可选**的：
   * 角色级未设置时不写该键，从而让 Profile 级 / 全局默认值生效（逐档回落）。
   */
  function buildCharacterOverrides(
    character: UICharacter
  ): NonNullable<import('../services/chat-manager').SendMessageParams['overrides']> {
    const overrides: NonNullable<import('../services/chat-manager').SendMessageParams['overrides']> = {
      temperature: character.temperature,
      ...buildSamplingConfigPatch(character.sampling),
    };
    /**
     * T-16：角色级 maxTokens 为可选，未设置时**不写该键**。
     * 写在对象里（哪怕是 undefined）都会被 `{...config, ...overrides}` 覆盖掉
     * Profile 级默认值 —— 这正是 profile.maxTokens 沦为死代码的原因。
     */
    const charMaxTokens = character.maxTokens;
    // 0 与负数不是合法的 max_tokens（合法区间 1~32768），按"未设置"处理（fail-open）
    if (typeof charMaxTokens === 'number' && Number.isFinite(charMaxTokens) && charMaxTokens > 0) {
      overrides.maxTokens = charMaxTokens;
    }
    // P0-2：capability 为 none 时静默丢弃角色级思考强度（不报错、不打断对话）
    const capability = activeProfileForCapability
      ? resolveReasoningCapability(activeProfileForCapability)
      : 'none';
    const effort: ReasoningEffort | null | undefined = character.reasoningEffort;
    if (capability !== 'none' && (effort === 'low' || effort === 'medium' || effort === 'high')) {
      overrides.reasoningEffort = effort;
    }
    return overrides;
  }

  /**
   * P0-1/P0-3：每轮发送前同步「全局偏好」到 ChatManager
   *
   * - 思维链：settings.thinkingConfig.stripFromHistory → includeThinkingInHistory
   * - 采样：全局 samplingDefaults 仅在 Profile 级也未设置时兜底（最低优先级）
   *
   * settings store 在此处惰性导入（与既有 maybeGenerateRandomEvent 一致，避免循环依赖）。
   */
  async function applyRuntimeLlmControls(): Promise<void> {
    try {
      const { useSettingsStore } = await import('./settings');
      const settingsStore = useSettingsStore();
      const patch: Partial<ChatManagerConfig> = {};

      // P0-1：剥离开关（默认 true = 剥离 → includeThinkingInHistory = false）
      const strip = settingsStore.thinkingConfig?.stripFromHistory !== false;
      patch.includeThinkingInHistory = !strip;

      // P1：提示词注入开关（默认 false = 不要求模型产出状态块；解析/渲染与开关无关）
      // 角色级 ext.statusInstruction 由 chat-manager 在本轮请求里再覆盖（'on'/'off' 优先）
      patch.statusInstructionEnabled = settingsStore.statusHudConfig?.enabled === true;

      // 上下文长度：同步全局设置到缓存，并在未被显式 options 覆盖时下发到 config
      // （修复：此前 chat-manager / store 硬编码 8192/1024，接入大上下文模型无法生效）
      globalMaxContextTokens = settingsStore.maxContextTokens;
      globalReservedTokens = settingsStore.reservedTokens;
      if (explicitMaxContextTokens === undefined) patch.maxContextTokens = settingsStore.maxContextTokens;
      if (explicitReservedTokens === undefined) patch.reservedTokens = settingsStore.reservedTokens;

      // 摘要接线（2026-09-21）：把当前会话的摘要传给 chat-manager，用于下一轮注入
      //
      // 摘要由 maybeGenerateSummary 在上一轮回复完成后异步写入 sessions，
      // 此处**每轮读取最新值** —— 不传的话摘要即使生成了也不会被注入。
      const chatId = activeChatId.value;
      if (chatId) {
        const current = sessions.value.find((s) => s.id === chatId);
        patch.existingSummary = current?.summary ?? null;
      }

      // P0-3：全局采样默认值（最低优先级，仅在 config 该字段为空时补齐）
      const defaults = settingsStore.samplingDefaults;
      if (defaults) {
        const cfg = chatManager?.currentConfig;
        if (cfg) {
          if (cfg.topP === undefined && typeof defaults.topP === 'number') patch.topP = defaults.topP;
          if (
            cfg.presencePenalty === undefined &&
            typeof defaults.presencePenalty === 'number'
          ) {
            patch.presencePenalty = defaults.presencePenalty;
          }
          if (
            cfg.frequencyPenalty === undefined &&
            typeof defaults.frequencyPenalty === 'number'
          ) {
            patch.frequencyPenalty = defaults.frequencyPenalty;
          }
        }
      }

      chatManager?.updateConfig(patch);
    } catch {
      /* fail-open：全局偏好读取失败不影响主链路 */
    }
  }

  /**
   * 生成任务收尾时应用暂存的 Profile（sendMessage / regenerateMessage 的 finally 调用）
   */
  function flushPendingProfile(): void {
    if (!pendingProfile) return;
    const pending = pendingProfile;
    pendingProfile = null;
    applyApiProfile(pending.profile, pending.options);
  }

  /**
   * E-01: 将角色卡 standing 事实种入 MemoryStore(仅首次)
   * 以角色 ID 为稳定键,写 standing 角色事实(人工 author,触发写保护语义)
   * 幂等:已存在该 ID 事实则跳过(避免每轮重复写、破坏前缀稳定)
   */
  async function seedStandingFacts(card: CharacterCard, characterId: string): Promise<void> {
    try {
      const existing = await l0l2Deps.store.get(`char-${characterId}`);
      if (existing) return; // 已种入,保持前缀稳定
      const body = [
        card.name && t('chat.cardName', { value: card.name }),
        card.description && t('chat.cardDesc', { value: card.description }),
        card.personality && t('chat.cardPersonality', { value: card.personality }),
        card.scenario && t('chat.cardScenario', { value: card.scenario }),
      ]
        .filter(Boolean)
        .join('\n');
      await l0l2Deps.store.put(
        { id: `char-${characterId}`, scope: 'standing', kind: 'character', body },
        'human'
      );
    } catch {
      /* fail-open:种入失败不影响主链路 */
    }
  }

  // ── 消息操作 ──

  /**
   * 发送用户消息并触发 AI 流式回复
   *
   * 流程：
   * 1. push 用户消息到 character.messages
   * 2. push 占位 assistant 消息（generating=true）
   * 3. 转换 UI 类型为核心类型，调用 ChatManager.sendMessage
   * 4. onDelta 流式更新占位消息的 content
   * 5. onDone 完成，移除 generating 标记，持久化对话
   * 6. onError 失败，标记错误信息
   *
   * @param character 当前角色（包含 messages / authorNote / temperature 等）
   * @param text 用户输入文本
   */
  async function sendMessage(character: UICharacter, text: string): Promise<void> {
    if (isGenerating.value) return; // 单实例串行保护
    if (!text.trim()) return;

    // F11.1: 斜杠命令路由——以 / 开头时走命令引擎而非 AI API
    if (isSlashCommand(text)) {
      await executeSlashCommand(character, text);
      return;
    }

    // 1. 保存 history 快照（在 push 用户消息之前）
    const historyBefore = [...character.messages];

    // 2. push 用户消息
    const userMsg: UIMessage = {
      id: `m-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    character.messages.push(userMsg);

    // 3. push 占位 assistant 消息
    const aiMsg: UIMessage = {
      id: `m-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      generating: true,
      timestamp: Date.now(),
    };
    character.messages.push(aiMsg);
    // Vue 响应性陷阱：push 后数组内存储的是 reactive 代理，直接修改局部原始对象
    // aiMsg 不会触发 DOM 更新（E2E 复现：气泡卡"正在生成…"），需经数组取回引用再修改
    const liveMsg = character.messages[character.messages.length - 1]!;

    // 4. 转换 UI → 核心类型
    const card = uiCharToCard(character);
    const history = uiMsgsToChatMsgs(historyBefore);

    if (!chatManager) {
      // 未配置 API Profile，给出明确提示而非静默失败
      liveMsg.generating = false;
      liveMsg.content = t('char.noApiProfile2');
      lastError.value = {
        type: 'unknown',
        message: t('char.noChatManager'),
      };
      return;
    }

    isGenerating.value = true;
    lastError.value = null;

    // 候选1+2: 统一上下文组装（Lorebook / Persona / RAG / 事件 / 主角 / 故事时间）
    const ctx = buildChatSessionContext(character, {
      ragMessages: [...history.map((m) => m.content), text],
      allowEventTrigger: true,
    });
    // 双通道向量检索注入（默认关；只进 ragContext 动态段，不碰 standing 前缀）
    const vectorRag = await buildVectorRagInjection(
      text,
      (ctx.lorebooks?.length ?? 0) > 0,
      { dynamicModel: getRagDynamicModel(), staticModel: getRagStaticModel() }
    );
    if (vectorRag.text) {
      ctx.ragContext = ctx.ragContext ? `${ctx.ragContext}\n${vectorRag.text}` : vectorRag.text;
    }

    try {
      beginRequestTracking(card);
      // E-01: 以角色 ID 作为会话键(情绪状态按角色隔离)
      chatManager.updateConfig({ sessionId: character.id });
      // P0-1/P0-3：同步思维链偏好与全局采样默认值
      await applyRuntimeLlmControls();
      // E-01: 种入角色 standing 事实(首次;字节稳定前缀数据源)
      await seedStandingFacts(card, character.id);
      const runtime = await ensureRuntimeIntegration(character, card);
      await chatManager.sendMessage(
        {
          card,
          history,
          userMessage: text,
          runtimeTurnId: userMsg.id,
          runtime: runtime ?? undefined,
          overrides: {
            ...buildCharacterOverrides(character),
            userName: ctx.userName,
          },
          contexts: ctx,
        },
        {
          onPromptBuilt: (info) => {
            tokenUsage.value.prompt += info.tokenCount;
          },
          onDelta: (_delta, fullContent) => {
            // TTFT:首个 delta 到达时记录(命中缓存时显著降低)
            if (!ttftReported) {
              ttftReported = true;
              const ms = Date.now() - requestStartAt;
              ttftStats.value = {
                lastMs: ms,
                avgMs:
                  ttftStats.value.count === 0
                    ? ms
                    : Math.round((ttftStats.value.avgMs * ttftStats.value.count + ms) / (ttftStats.value.count + 1)),
                count: ttftStats.value.count + 1,
              };
            }
            liveMsg.content = fullContent;
            streamingContent.value = fullContent;
          },
          // P0-1：思考增量（fullThinking 为累计值，直接覆盖即可）
          onThinking: (_delta, fullThinking) => {
            liveMsg.thinking = fullThinking;
          },
          // P1：状态快照（状态块闭合后一次性回调；null = 本轮无可用状态）
          onStatus: (status) => {
            liveMsg.status = status ? { ...status, messageId: liveMsg.id } : undefined;
          },
          onUsage: (usage) => {
            // 前缀缓存统计(供应商返回 cache 拆解时)
            if (usage.promptCacheHitTokens !== undefined || usage.promptCacheMissTokens !== undefined) {
              cacheUsage.value.hitTokens += usage.promptCacheHitTokens ?? 0;
              cacheUsage.value.missTokens += usage.promptCacheMissTokens ?? 0;
              cacheUsage.value.reported++;
            }
            /**
             * P1：思考 token 落到本条消息（与 thinking 同款，便于回溯"这轮想了多久"）
             * 供应商未上报时保持 undefined（UI 不展示）—— 绝不写 0，0 会被误读成"思考没花 token"。
             */
            if (typeof usage.reasoningTokens === 'number' && usage.reasoningTokens > 0) {
              liveMsg.reasoningTokens = usage.reasoningTokens;
            }
          },
          onDone: (fullContent) => {
            void countTokens(fullContent).then((n) => { tokenUsage.value.completion += n; });
            liveMsg.content = fullContent;
            liveMsg.generating = false;
            streamingContent.value = '';

            // F16.4: AI 回复完成后，按策略推进故事时间
            const sid = character.storyId ?? null;
            if (sid) {
              useStoryStore().recordTurnEndForStory(sid);
            }

            // F17.3: 异步触发随机事件决策（不阻塞 UI，失败不影响主流程）
            // 收集最近对话消息用于决策
            const recentMsgs = character.messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .slice(-6)
              .map((m) => m.content);
            void maybeGenerateRandomEvent(character, recentMsgs);
          },
          onError: (err) => {
            const type = classifyChatError(err);
            liveMsg.generating = false;
            // 用户中止时保留已生成的部分内容
            if (type === 'aborted') {
              if (!liveMsg.content) liveMsg.content = t('char.stoppedGen2');
            } else {
              const msg = chatErrorI18n(err);
              liveMsg.content = t(msg.key, msg.params);
            }
            lastError.value = toLastErrorRecord(err, type);
            streamingContent.value = '';
          },
        }
      );

      // 5. 持久化对话（无论成功 / 失败，都保存已收到的内容）
      await persistChat(character);

      // 6. 摘要接线：异步生成 / 更新摘要（fire-and-forget，失败静默）
      //    放在持久化之后 —— 摘要依赖已落盘的消息，且不阻塞本轮返回
      void maybeGenerateSummary(character);
    } finally {
      isGenerating.value = false;
      streamingContent.value = '';
      // 生成中切换的 API Profile 在此应用
      flushPendingProfile();
    }
  }

  /**
   * F11.1 执行斜杠命令
   *
   * 将命令文本路由到斜杠命令引擎，执行结果作为消息显示在对话区：
   * - 命令文本作为 user 消息显示（用户可见输入了什么命令）
   * - 命令结果作为 assistant 消息显示（dice 结果、echo 文本等）
   * - 若结果含 sendMessage，递归调用 sendMessage 触发 AI 回复
   * - 若结果含 shouldAbort，调用 stop() 中断当前生成
   * - /setvar 修改的局部变量写入 chatVariables（随对话保留）
   *
   * @param character 当前角色
   * @param text 用户输入的命令文本（以 / 开头）
   */
  async function executeSlashCommand(character: UICharacter, text: string): Promise<void> {
    const personaStore = usePersonaStore();
    const userName = personaStore.activeUserName;

    // F16.4: 构造故事时间命令上下文（若角色关联了故事）
    const storyStore = useStoryStore();
    const storyId = character.storyId ?? null;
    const storyTimeContext = storyId
      ? {
          storyId,
          onAdvance: () => storyStore.advanceStoryTime(storyId),
          onSet: (value: number) => storyStore.setStoryTime(storyId, value),
          getStatus: () => storyStore.getFormattedStoryTime(storyId),
          onReset: () => storyStore.resetStoryTime(storyId),
        }
      : null;

    // F17.2: 构造事件命令上下文（角色关联 Lorebook 含事件时注入）
    const eventsStore = useEventsStore();
    const characterLorebooks = collectLorebooksForCharacter(character.id);
    const characterLorebookIds = new Set(characterLorebooks.map((lb) => lb.id));
    const characterEvents = eventsStore.events.filter((e) =>
      characterLorebookIds.has(e.lorebookId)
    );
    const eventsContext =
      characterEvents.length > 0
        ? {
            events: characterEvents.map((e) => ({
              id: e.id,
              name: e.name,
              state: e.state,
              sceneName: e.sceneName,
              triggerCount: e.triggerCount,
            })),
            findEvent: (idOrName: string) => {
              const byId = eventsStore.getEvent(idOrName);
              if (byId && characterLorebookIds.has(byId.lorebookId)) return byId;
              const byName = eventsStore.getEventByName(idOrName);
              if (byName && characterLorebookIds.has(byName.lorebookId)) return byName;
              return null;
            },
            trigger: (id: string) => {
              const ok = eventsStore.triggerEvent(id);
              return {
                success: ok,
                message: ok
                  ? t('char.eventTriggered', { name: eventsStore.getEvent(id)?.name ?? id })
                  : (eventsStore.lastError ?? t('store.triggerFailed', { id })),
              };
            },
            complete: (id: string) => {
              const ok = eventsStore.completeEvent(id);
              return {
                success: ok,
                message: ok
                  ? t('char.eventDone', { name: eventsStore.getEvent(id)?.name ?? id })
                  : (eventsStore.lastError ?? t('store.completeFailed', { id })),
              };
            },
          }
        : null;

    // 构造执行上下文（chatVariables 引用传入，/setvar 直接修改）
    const ctx = createSlashCommandContext(chatVariables.value, character.name, userName, {
      onAbort: () => stop(),
      storyTimeContext,
      eventsContext,
    });

    // 收集 F12 扩展系统注册的斜杠命令
    const extraCommands = extensionRegistry.getSlashCommands();

    // 执行命令管道
    const result = await executePipeline(text, ctx, extraCommands);

    // push 用户消息（命令文本，让用户看到自己输入的命令）
    const userMsg: UIMessage = {
      id: `m-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    character.messages.push(userMsg);

    // push 命令结果作为 assistant 消息
    const resultContent = result.message
      ? result.message
      : result.success
        ? t('char.cmdDone')
        : t('char.cmdFailed');
    const resultMsg: UIMessage = {
      id: `m-${Date.now() + 1}`,
      role: 'assistant',
      content: resultContent,
      timestamp: Date.now() + 1,
    };
    character.messages.push(resultMsg);

    // 持久化对话
    await persistChat(character);

    // 命令请求中断生成
    if (result.shouldAbort) {
      stop();
    }

    // 命令产生 sendMessage：递归调用触发 AI 回复
    if (result.sendMessage) {
      await sendMessage(character, result.sendMessage);
    }
  }

  /**
   * 停止当前生成
   */
  function stop(): void {
    if (chatManager?.isGenerating) {
      chatManager.stop();
    }
  }

  /**
   * 重新生成指定 assistant 消息
   *
   * 策略：清空该消息内容并重新走 sendMessage 流程，
   * 历史使用该消息之前的全部消息（含用户原消息）。
   *
   * @param character 当前角色
   * @param msgId 要重新生成的 assistant 消息 id
   */
  async function regenerateMessage(
    character: UICharacter,
    msgId: string
  ): Promise<void> {
    if (isGenerating.value) return;
    const idx = character.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const target = character.messages[idx]!;
    if (target.role !== 'assistant') return;

    // 取该消息之前的全部消息作为 history
    const historyBefore = character.messages.slice(0, idx);

    // 找最后一条用户消息的索引（chat-manager 会把它作为 userMessage 重新加入 prompt）
    let lastUserIdx = -1;
    for (let i = historyBefore.length - 1; i >= 0; i--) {
      if (historyBefore[i]!.role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) return; // 历史中无用户消息，无法重新生成
    const userText = historyBefore[lastUserIdx]!.content;

    // 重置目标消息
    // P0-1：重新生成必须清空 thinking，否则会出现"旧思考 + 新正文"的错配（§7.4）
    // P1：status 同理（本轮状态属于上一轮生成结果）
    target.content = '';
    target.thinking = '';
    target.reasoningTokens = undefined;
    target.status = undefined;
    target.generating = true;

    // 转换 UI → 核心
    // history 排除最后一条用户消息（chat-manager 会将其作为 userMessage 重新加入）
    const card = uiCharToCard(character);
    const history = uiMsgsToChatMsgs(historyBefore.slice(0, lastUserIdx));

    if (!chatManager) {
      target.generating = false;
      target.content = t('char.noApiProfile2');
      return;
    }

    isGenerating.value = true;
    lastError.value = null;

    // 候选1+2: 统一上下文组装——修复此前遗漏 RAG / 主角 / 故事时间注入的 bug
    const ctx = buildChatSessionContext(character, {
      ragMessages: historyBefore.map((m) => m.content),
      allowEventTrigger: false, // 重新生成不触发/完成新事件，仅注入已激活事件
    });
    // 双通道向量检索注入（默认关；fail-open 不阻断重新生成）
    const vectorRag = await buildVectorRagInjection(
      userText,
      (ctx.lorebooks?.length ?? 0) > 0,
      { dynamicModel: getRagDynamicModel(), staticModel: getRagStaticModel() }
    );
    if (vectorRag.text) {
      ctx.ragContext = ctx.ragContext ? `${ctx.ragContext}\n${vectorRag.text}` : vectorRag.text;
    }

    try {
      beginRequestTracking(card);
      // E-01: 以角色 ID 作为会话键(情绪状态按角色隔离)
      chatManager.updateConfig({ sessionId: character.id });
      // P0-1/P0-3：同步思维链偏好与全局采样默认值
      await applyRuntimeLlmControls();
      // E-01: 种入角色 standing 事实(首次;字节稳定前缀数据源)
      await seedStandingFacts(card, character.id);
      const runtime = await ensureRuntimeIntegration(character, card);
      await chatManager.sendMessage(
        {
          card,
          history,
          userMessage: userText,
          // 重新生成是新的候选回复，不与原始发送共用幂等键，避免内容冲突被误判为重试。
          runtimeTurnId: `${historyBefore[lastUserIdx]!.id}:regenerate:${target.id}:${Date.now()}`,
          runtime: runtime ?? undefined,
          overrides: {
            ...buildCharacterOverrides(character),
            userName: ctx.userName,
          },
          contexts: ctx,
        },
        {
          onPromptBuilt: (info) => {
            tokenUsage.value.prompt += info.tokenCount;
          },
          onDelta: (_delta, fullContent) => {
            // TTFT:首个 delta 到达时记录(命中缓存时显著降低)
            if (!ttftReported) {
              ttftReported = true;
              const ms = Date.now() - requestStartAt;
              ttftStats.value = {
                lastMs: ms,
                avgMs:
                  ttftStats.value.count === 0
                    ? ms
                    : Math.round((ttftStats.value.avgMs * ttftStats.value.count + ms) / (ttftStats.value.count + 1)),
                count: ttftStats.value.count + 1,
              };
            }
            target.content = fullContent;
            streamingContent.value = fullContent;
          },
          // P0-1：思考增量（fullThinking 为累计值）
          onThinking: (_delta, fullThinking) => {
            target.thinking = fullThinking;
          },
          // P1：状态快照（重新生成时同上先清空，避免"旧状态 + 新正文"错配）
          onStatus: (status) => {
            target.status = status ? { ...status, messageId: target.id } : undefined;
          },
          onDone: (fullContent) => {
            void countTokens(fullContent).then((n) => { tokenUsage.value.completion += n; });
            target.content = fullContent;
            target.generating = false;
            streamingContent.value = '';
          },
          onError: (err) => {
            const type = classifyChatError(err);
            target.generating = false;
            if (type === 'aborted') {
              if (!target.content) target.content = t('char.stoppedGen2');
            } else {
              const msg = chatErrorI18n(err);
              target.content = t(msg.key, msg.params);
            }
            lastError.value = toLastErrorRecord(err, type);
            streamingContent.value = '';
          },
        }
      );

      await persistChat(character);

      // 摘要接线：regenerate 同样会改变会话内容，异步更新摘要（fire-and-forget）
      void maybeGenerateSummary(character);
    } finally {
      isGenerating.value = false;
      streamingContent.value = '';
      // 生成中切换的 API Profile 在此应用
      flushPendingProfile();
    }
  }

  function copyMessage(msg: UIMessage): void {
    navigator.clipboard?.writeText(msg.content).catch(() => {});
  }

  function deleteMessage(character: UICharacter, msgId: string): void {
    const idx = character.messages.findIndex((m) => m.id === msgId);
    if (idx >= 0) {
      character.messages.splice(idx, 1);
      void persistChat(character);
    }
  }

  function editMessage(msg: UIMessage, newContent: string): void {
    msg.content = newContent;
    // P0-1：正文被改写后旧思考即失效，必须清空，避免"旧思考 + 新正文"错配（§7.4）
    if (msg.thinking) msg.thinking = '';
    // P1：思考 token 属于旧生成结果，一并清空（新正文没有对应的思考开销）
    if (msg.reasoningTokens !== undefined) msg.reasoningTokens = undefined;
    // P1：状态快照同样属于旧生成结果，一并清空
    if (msg.status) msg.status = undefined;
    // 编辑后持久化由调用方决定是否触发（避免无 character 引用）
  }

  /**
   * 编辑消息后调用以持久化
   */
  function persistAfterEdit(character: UICharacter): void {
    void persistChat(character);
  }

  // ── 持久化 ──

  /**
   * 将当前角色对话持久化到存储层
   * 使用 character.id 作为 characterId，messages[0].id 拼接作为 chatId（简化）
   */
  /**
   * 摘要接线（2026-09-21）：按需生成 / 更新当前会话摘要。
   *
   * 设计为 **fire-and-forget + fail-open** —— 在回复完成并持久化之后异步触发，
   * 不阻塞 UI；任何失败静默（摘要是锦上添花，不该影响主链路）。
   *
   * 与 L1 压缩的分工：**摘要管「被裁掉的最早历史」，L1 管「仍在窗口内的历史」**。
   *
   * 存储：摘要只落在 `Chat`（存储层 + sessions 运行时缓存），**不进 UICharacter**
   * —— persistChat 已透传 `existing?.summary`，因此不会被落盘抹掉。
   */
  async function maybeGenerateSummary(character: UICharacter): Promise<void> {
    try {
      const mgr = chatManager;
      if (!mgr || !storageAdapter) return;
      const { useSettingsStore } = await import('./settings');
      const settings = useSettingsStore();
      const config = settings.summarizationConfig;
      if (!config?.enabled) return;

      const chatId = activeChatId.value ?? `chat-${character.id}`;
      const existing = sessions.value.find((s) => s.id === chatId);
      const messages = uiMsgsToChatMsgs(character.messages);
      const summary = await mgr.summarizeIfNeeded(messages, config, existing?.summary ?? null);
      if (!summary) return;

      if (existing) {
        existing.summary = summary;
        try {
          await storageAdapter.saveChat(existing);
        } catch {
          /* 落盘失败不阻断：内存态已更新，下一轮注入仍可用 */
        }
      }
    } catch {
      /* fail-open：摘要整条链路静默失败 */
    }
  }

  async function persistChat(character: UICharacter): Promise<void> {
    if (!storageAdapter) return; // 未注入存储适配器，静默跳过
    if (character.messages.length === 0) return;

    const now = new Date().toISOString();
    // 多会话：写入当前激活会话；无则回落默认会话 id（向后兼容，签名不改单会话）或创建新会话 id
    const chatId = activeChatId.value ?? `chat-${character.id}`;
    activeChatId.value = chatId;
    const existing = sessions.value.find((s) => s.id === chatId);
    const chat: Chat = {
      id: chatId,
      characterId: character.id,
      title: existing?.title ?? t('chat.conversationTitle', { name: character.name }),
      messages: uiMsgsToChatMsgs(character.messages),
      createdAt: existing?.createdAt
        ?? (character.messages[0]!.timestamp
          ? new Date(character.messages[0]!.timestamp as number).toISOString()
          : now),
      updatedAt: now,
      pinned: existing?.pinned,
      archived: existing?.archived,
      // 摘要接线（2026-09-21）：透传已生成的摘要
      // 摘要由 persistChat 之外的异步流程写入 sessions，此处**必须透传**，
      // 否则每次落盘都会把刚生成的摘要抹掉
      summary: existing?.summary,
    };

    try {
      await storageAdapter.saveChat(chat);
      // 同步会话索引缓存
      const idx = sessions.value.findIndex((s) => s.id === chatId);
      if (idx >= 0) sessions.value[idx] = chat;
      else sessions.value.push(chat);
    } catch (err) {
      // F-2 审查结论：持久化失败「非阻塞 + 记录 lastError」策略保留。
      // lastError 由全局错误横幅呈现给用户（非静默吞掉），且不影响已生成内容的显示；
      // 不在此抛错或阻断 UI，避免一次存储异常导致整轮对话不可见。
      lastError.value = {
        type: 'unknown',
        message: t('chat.persistFailed', { error: err instanceof Error ? err.message : String(err) }),
      };
    }
  }

  /**
   * F17.3: 随机事件生成决策点
   *
   * 在每轮 AI 回复完成后异步调用：
   * 1. 检查生成器是否启用
   * 2. 调用 store.decide() 获取决策
   * 3. 若 shouldTrigger，记录决策到结果历史
   *
   * 注意：当前为决策点接入，记录决策结果。
   * 完整的 LLM 调用生成事件内容（buildTemplateAwareMessages + API 请求 + parseGeneratedRandomEvent）
   * 作为后续完善任务，需评估对对话流程的影响与 API 成本。
   *
   * @param character 当前角色
   * @param recentMessages 最近对话消息内容列表
   */
  async function maybeGenerateRandomEvent(
    character: UICharacter,
    recentMessages: string[]
  ): Promise<void> {
    try {
      const randomEventsStore = useRandomEventsStore();
      // 未启用则跳过
      if (!randomEventsStore.generatorConfig.enabled) return;

      // 获取场景名（当前简化为角色名，后续可从故事 store 获取当前场景）
      // 用户可在 RandomEventsView 场景配置中为该"场景"配置参数
      const sceneName = character.name;

      // 执行决策
      const decision = randomEventsStore.decide(sceneName, recentMessages);
      if (!decision.shouldTrigger) {
        // 记录跳过原因（仅 console，不污染结果历史）
        if (decision.reason) {
          console.debug(`[F17.3] 随机事件未触发：${decision.reason}`);
        }
        return;
      }

      // 检查 API 配置（无 API 则无法调用 LLM 生成）
      const { useSettingsStore } = await import('./settings');
      const settingsStore = useSettingsStore();
      const profile = settingsStore.activeProfile;
      if (!profile) {
        console.debug('[F17.3] 随机事件决策触发但未配置 API，跳过 LLM 生成');
        return;
      }

      // 已有 active 随机事件时不重复生成（避免事件堆积）
      const eventsStore = useEventsStore();
      const existingActive = eventsStore
        .getActiveEvents()
        .some((e) => e.id.startsWith('rand-evt-'));
      if (existingActive) {
        console.debug('[F17.3] 已有激活的随机事件，跳过本次生成');
        return;
      }

      // 收集角色相关 Lorebook 用于场景上下文
      const lorebooks = collectLorebooksForCharacter(character.id);

      // 构建 LLM 生成参数
      // 若决策选中了模板，将模板的类别/严重度/触发关键词作为生成提示
      const tpl = decision.template;
      const templateHint = tpl
        ? `[Event Template] name=${tpl.name}; category=${tpl.category}; severity=${tpl.severity}${
            tpl.triggerKeywords.length > 0 ? `; keywords=${tpl.triggerKeywords.join('、')}` : ''
          }; description=${tpl.description}`
        : '';

      const params: RandomEventParams = {
        sceneName,
        sceneDescription: templateHint || undefined,
        worldName: lorebooks[0]?.worldDescription?.name,
        worldType: lorebooks[0]?.worldDescription?.type,
        recentMessages,
        activeEventNames: eventsStore.getActiveEvents().map((e) => e.name),
      };

      const messages = buildRandomEventMessages(params);

      // 调用 LLM 生成事件内容
      const apiClient = createApiClient(profile);
      const raw = await apiClient.chat({
        messages,
        model: profile.model,
        temperature: 1.0,
        maxTokens: 600,
      });

      const generated = parseGeneratedRandomEvent(raw);
      if (!generated) {
        console.debug('[F17.3] LLM 返回内容解析失败，跳过记录');
        return;
      }

      // 记录生成结果到随机事件 store（用于统计与反馈）
      const result = createRandomEventResult({
        template: tpl,
        sceneName,
        generated,
        effectiveProbability: decision.effectiveProbability,
      });
      randomEventsStore.recordResult(result);

      // 转换为临时 StoryEvent 并注入到事件 store（供下一轮 prompt 注入）
      const lbId = lorebooks[0]?.id ?? 'random';
      const storyEvent = generatedRandomEventToStoryEvent(generated, lbId);
      eventsStore.events.push(storyEvent);

      console.info(
        `[F17.3] Random event generated: ${generated.name} (template=${
          tpl?.name ?? '(instant)'
        }, probability=${decision.effectiveProbability}%)`
      );
    } catch (err) {
      // 集成失败不影响主对话流程
      console.warn('[F17.3] 随机事件生成失败：', err);
    }
  }

  /**
   * 加载指定会话的历史到当前角色（多会话切换）
   * @param character 目标角色（活动消息缓冲将被覆盖）
   * @param chatId 要加载的会话 id；缺省用 activeChatId
   */
  async function loadChatHistory(character: UICharacter, chatId?: string): Promise<void> {
    if (!storageAdapter) return;
    const targetId = chatId ?? activeChatId.value ?? `chat-${character.id}`;
    if (!targetId) return;
    try {
      const chat = await storageAdapter.loadChat(targetId);
      if (chat) {
        activeChatId.value = chat.id;
        // 用核心消息覆盖 UI 消息（chatMsgsToUiMsgs 自动过滤 system）
        // 延迟 import 避免循环依赖
        const { chatMsgsToUiMsgs } = await import('../services/type-adapters');
        character.messages = chatMsgsToUiMsgs(chat.messages);
        // 同步会话索引缓存
        const idx = sessions.value.findIndex((s) => s.id === chat.id);
        if (idx >= 0) sessions.value[idx] = chat;
        else sessions.value.push(chat);
      }
    } catch (err) {
      lastError.value = {
        type: 'unknown',
        message: t('chat.loadHistoryFailed', { error: err instanceof Error ? err.message : String(err) }),
      };
    }
  }

  // ── 多会话（§14.2）：会话索引 / 新建 / 切换 / 置顶 / 归档 / 删除 / 重命名 ──

  /**
   * 载入全部会话索引（跨角色）到 sessions 缓存
   * 用于移动端会话 Tab 的全局会话列表。
   */
  async function loadAllSessions(characterIds: string[]): Promise<void> {
    if (!storageAdapter) return;
    const all: Chat[] = [];
    for (const cid of characterIds) {
      try {
        const list = await storageAdapter.loadChats(cid);
        all.push(...list);
      } catch {
        /* 单角色加载失败不影响其余 */
      }
    }
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    sessions.value = all;
  }

  /**
   * 打开指定角色的会话并装配到聊天区
   */
  async function openSession(character: UICharacter, chatId: string): Promise<void> {
    await loadChatHistory(character, chatId);
  }

  /**
   * 新建会话：分配唯一会话 id 并清空当前角色消息缓冲（首条消息时 persistChat 才落盘）
   */
  function newSession(character: UICharacter): void {
    activeChatId.value = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    character.messages = [];
  }

  /** 置顶/取消置顶会话 */
  async function togglePin(chatId: string): Promise<void> {
    const s = sessions.value.find((x) => x.id === chatId);
    if (!s) return;
    s.pinned = !s.pinned;
    if (storageAdapter) {
      try { await storageAdapter.saveChat(s); } catch { /* 离线静默 */ }
    }
  }

  /** 归档/取消归档会话 */
  async function toggleArchive(chatId: string): Promise<void> {
    const s = sessions.value.find((x) => x.id === chatId);
    if (!s) return;
    s.archived = !s.archived;
    if (storageAdapter) {
      try { await storageAdapter.saveChat(s); } catch { /* 离线静默 */ }
    }
  }

  /** 删除会话（存储 + 索引；若为当前激活会话则复位缓冲） */
  async function deleteSession(character: UICharacter | null, chatId: string): Promise<void> {
    if (storageAdapter) {
      try { await storageAdapter.deleteChat(chatId); } catch { /* 离线静默 */ }
    }
    sessions.value = sessions.value.filter((s) => s.id !== chatId);
    if (activeChatId.value === chatId) {
      activeChatId.value = null;
      if (character) character.messages = [];
    }
  }

  /** 重命名会话标题 */
  async function renameSession(chatId: string, title: string): Promise<void> {
    const s = sessions.value.find((x) => x.id === chatId);
    if (!s) return;
    s.title = title;
    if (storageAdapter) {
      try { await storageAdapter.saveChat(s); } catch { /* 离线静默 */ }
    }
  }

  /**
   * 清空最近一次错误（供 UI 关闭错误 Modal 后调用）
   */
  function clearLastError(): void {
    lastError.value = null;
  }

  return {
    // 状态
    isGenerating,
    streamingContent,
    lastError,
    runtimeStatus,
    // 多会话（§14.2）
    activeChatId,
    sessions,
    // F11.2 当前对话局部变量
    chatVariables,
    // 第2条：Token 消耗统计
    tokenUsage,
    totalTokenUsage,
    cacheUsage,
    prefixCacheHitRate,
    prefixStability,
    prefixStableRate,
    ttftStats,
    // 依赖注入
    setStorageAdapter,
    setApiProfile,
    ensureRuntimeIntegration,
    ensureGroupRuntimeIntegration,
    syncRemoteGroupMember,
    syncRemoteGroupStatus,
    runtimeCharacterIdFor,
    commitRuntimeGroupTurn,
    retryRemoteGroupOutbox,
    pendingGroupRuntimeTurns,
    groupRuntimeConflict,
    clearGroupRuntimeConflict,
    loadRuntimePendingGroupTurns,
    discardPendingGroupRuntimeTurns,
    async retryPendingGroupRuntimeTurn(input: { group: GroupChat; characters: UICharacter[]; groupTurnId: string }) {
      const pending = pendingGroupRuntimeTurns.value.find((item) =>
        item.groupId === input.group.id && item.turnId === input.groupTurnId);
      if (!pending) return { enabled: true, committed: false };
      return commitRuntimeGroupTurn({
        group: input.group,
        characters: input.characters,
        speakerCharacterId: pending.speakerCharacterId,
        turnId: pending.turnId,
        userMessage: pending.userMessage,
        assistantMessage: pending.assistantMessage,
      });
    },
    createRuntimeCharactersBatch,
    // 消息操作
    sendMessage,
    stop,
    copyMessage,
    deleteMessage,
    editMessage,
    regenerateMessage,
    persistAfterEdit,
    loadChatHistory,
    // 多会话（§14.2）
    loadAllSessions,
    openSession,
    newSession,
    togglePin,
    toggleArchive,
    deleteSession,
    renameSession,
    // 错误管理
    clearLastError,
  };
});
