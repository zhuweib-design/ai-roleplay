/**
 * chat-generation — 消息生成引擎子 store（第三轮拆分 · ROUND_3_HIGH_RISK_SPLIT_DESIGN §2）
 *
 * 职责（优化项 7 · S6）：
 * - isGenerating / streamingContent / lastError / tokenUsage / cacheUsage /
 *   prefixStability / ttftStats / summaryStatus 状态
 * - chatManager 单例 + setApiProfile / applyApiProfile / flushPendingProfile
 * - sendMessage / executeSlashCommand / stop / regenerateMessage
 * - copyMessage / deleteMessage / editMessage / persistAfterEdit / loadChatHistory
 * - persistChat / maybeGenerateSummary / invalidateActiveSummary / maybeGenerateRandomEvent
 * - buildCharacterOverrides / applyRuntimeLlmControls / beginRequestTracking
 * - 自持 storageAdapter（由兼容层 setStorageAdapter 扇出注入）
 *
 * 依赖（上层 → 中层/底层，有向无环）：
 * - session 域（activeChatId / sessions / chatVariables，storeToRefs 共享引用）
 * - memory 域（loadLocalMemoryStore / buildLocalMemoryContext /
 *   recordLocalConversationMemory / seedStandingFacts / persistLocalMemoryStore /
 *   listScopedFacts / getL0L2Deps）
 * - runtime 域（ensureRuntimeIntegration / activePresetInfo 写入）
 */
import { defineStore, storeToRefs } from 'pinia';
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import type { UIMessage, UICharacter, ApiProfile } from '@/types';
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
import type { Chat } from '../storage/types';
import { uiCharToCard, uiMsgsToChatMsgs } from '../services/type-adapters';
import { useEventsStore } from './events';
import { buildChatSessionContext, collectLorebooksForCharacter } from './chat-context';
import {
  buildVectorRagInjection,
  getRagDynamicModel,
  getRagStaticModel,
  type VectorRagSource,
} from '@/core/dual-channel-runtime';
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
import { logger } from '@/utils/logger';
import {
  PRESET_SCHEMA_VERSION,
  presetSamplingOverrides,
  resolveEffectivePreset,
} from '@/core/creation-preset';
import type { MemoryFact } from '@/core/memory-store';
import { useChatSessionStore } from './chat-session';
import { useSettingsStore } from './settings';
import { useChatMemoryStore } from './chat-memory';
import { useChatRuntimeStore } from './chat-runtime';

export type ChatSummaryStatusPhase = 'none' | 'ready' | 'updating';

/** 当前会话摘要的可视化状态，供上下文面板显示。 */
export interface ChatSummaryStatus {
  phase: ChatSummaryStatusPhase;
  coveredMessageCount: number;
  lastCoveredMessageIndex: number;
  createdAt?: number;
  tokenCount?: number;
}

/** 合并关键词 RAG 与向量 RAG，按正文去重并控制动态上下文上限。 */
function mergeRagContext(base: string | undefined, extra: string, maxChars = 12_000): string | undefined {
  const blocks = [base ?? '', extra]
    .flatMap((value) => value.split(/\n\n+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  let length = 0;
  for (const block of blocks) {
    const key = block.replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    const nextLength = length + block.length + (unique.length > 0 ? 2 : 0);
    if (nextLength > maxChars) break;
    seen.add(key);
    unique.push(block);
    length = nextLength;
  }
  return unique.length > 0 ? unique.join('\n\n') : undefined;
}

function staticVectorSources(
  documents: ReturnType<typeof useDataBankStore>['documents'],
  lorebooks: NonNullable<ReturnType<typeof buildChatSessionContext>['lorebooks']>,
  characterId: string,
  chatId: string | null,
): VectorRagSource[] {
  const sources: VectorRagSource[] = [];
  const seen = new Set<string>();
  for (const doc of documents) {
    if (doc.scope === 'character' && doc.characterId !== characterId) continue;
    if (doc.scope === 'chat' && doc.chatId !== chatId) continue;
    for (const chunk of doc.chunks ?? []) {
      const id = `document:${doc.id}:${chunk.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      sources.push({
        id,
        text: `${doc.name}\n${chunk.content}`,
        meta: { scope: 'document', documentId: doc.id, chunkId: chunk.id },
      });
    }
  }
  for (const book of lorebooks) {
    if (book.worldDescription?.content) {
      const id = `world:${book.id}:description`;
      sources.push({
        id,
        text: `${book.worldDescription.name ?? book.name}\n${book.worldDescription.content}`,
        meta: { scope: 'world', lorebookId: book.id },
      });
    }
    for (const entry of book.entries ?? []) {
      if (!entry.enabled || !entry.content.trim()) continue;
      const id = `lorebook:${book.id}:${entry.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      sources.push({
        id,
        text: `${entry.title}\n${entry.content}`,
        meta: { scope: 'world', lorebookId: book.id, entryId: entry.id },
      });
    }
  }
  return sources;
}

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

export const useChatGenerationStore = defineStore('chat-generation', () => {
  // 跨域依赖（有向无环：generation → session / memory / runtime）
  const sessionStore = useChatSessionStore();
  const { activeChatId, sessions, chatVariables } = storeToRefs(sessionStore);
  const memoryStore = useChatMemoryStore();
  const runtimeStore = useChatRuntimeStore();
  const { activePresetInfo } = storeToRefs(runtimeStore);
  const { ensureRuntimeIntegration } = runtimeStore;

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

  // 第2条：Token 消耗统计（本次会话累计，客户端估算）
  const tokenUsage = ref({ prompt: 0, completion: 0 });

  /** 同一会话的摘要任务串行化，避免快速连续发送时旧摘要覆盖新摘要。 */
  const summaryJobs = new Map<string, Promise<void>>();
  /** 任务串行化使用 Map，面板状态使用响应式快照。 */
  const summaryPendingIds = ref<Record<string, true>>({});
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

  const summaryStatus = computed<ChatSummaryStatus>(() => {
    const chatId = activeChatId.value;
    const summary = chatId ? sessions.value.find((session) => session.id === chatId)?.summary : undefined;
    const pending = chatId ? summaryPendingIds.value[chatId] === true : false;
    const base = {
      coveredMessageCount: summary?.coveredMessageCount ?? 0,
      lastCoveredMessageIndex: summary?.lastCoveredMessageIndex ?? -1,
      createdAt: summary?.createdAt,
      tokenCount: summary?.tokenCount,
    };
    if (pending) return { phase: 'updating', ...base };
    if (summary) return { phase: 'ready', ...base };
    return { phase: 'none', ...base };
  });
  // 首 token 延迟统计(TTFT;命中缓存时显著降低,启发式观测)
  const ttftStats = ref({ lastMs: 0, avgMs: 0, count: 0 });
  let requestStartAt = 0;
  let ttftReported = false;

  let storageAdapter: StorageAdapter | null = null;
  let chatManager: ChatManager | null = null;

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

  /**
   * 注入存储适配器（应用启动时由兼容层扇出调用）
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
      // E-01/E-02: L0/L2 运行时依赖（S2 起由 chat-memory store 持有，与记忆域共享同一实例）
      l0l2: memoryStore.getL0L2Deps(),
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
   *
   * EXP-01：可选传入当前角色 —— 角色级创作模式绑定（boundPresetId）优先于全局设置。
   */
  async function applyRuntimeLlmControls(character?: UICharacter): Promise<void> {
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

      // MODEL-03：创作模式（Preset）作为**最低优先级**兜底。
      // 仅在 config 对应字段仍为空时补齐 —— 角色级 / Profile 级 / 全局采样默认值优先。
      // 同时把生效的 preset 与版本记入 activePresetInfo，满足"Preset 变更可追溯"。
      // EXP-01：角色级绑定（boundPresetId）优先于全局；未绑定 / 非法值回落全局。
      const presetId = resolveEffectivePreset(
        character?.boundPresetId,
        settingsStore.creationPreset
      );
      activePresetInfo.value = { presetId, presetVersion: PRESET_SCHEMA_VERSION, at: Date.now() };
      const presetSampling = presetSamplingOverrides(presetId);
      if (presetSampling) {
        const cfg = chatManager?.currentConfig;
        if (cfg) {
          if (cfg.topP === undefined && typeof presetSampling.topP === 'number') patch.topP = presetSampling.topP;
          if (cfg.presencePenalty === undefined && typeof presetSampling.presencePenalty === 'number') {
            patch.presencePenalty = presetSampling.presencePenalty;
          }
          if (cfg.frequencyPenalty === undefined && typeof presetSampling.frequencyPenalty === 'number') {
            patch.frequencyPenalty = presetSampling.frequencyPenalty;
          }
        }
        // 输出约束：Preset 的 statusInstruction 仅供参考展示，**不**在运行时覆盖
        // 用户显式的 statusHudConfig（该开关是显式布尔值而非"空档"，按"高级用户覆盖"
        // 原则，用户设置优先）。UI 可通过 resolvePresetParams 展示该建议值。
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
  /**
   * D-10（REAL_DEVICE_TEST_2026-10-03）：发送前置三态检查（同步，供输入侧与守卫共用）。
   * - 'no-profile'：未配置 API Profile
   * - 'locked'：已配置但主密码未解锁（activeProfile 在锁定态返回 null，ChatManager 未建）
   * - null：可发送
   */
  function checkSendBlock(): 'locked' | 'no-profile' | null {
    if (chatManager) return null;
    const st = useSettingsStore();
    if (st.activeProfile) {
      return st.hasMasterPassword && !st.isUnlocked ? 'locked' : null;
    }
    return 'no-profile';
  }

  async function sendMessage(character: UICharacter, text: string): Promise<boolean> {
    if (isGenerating.value) return false; // 单实例串行保护
    if (!text.trim()) return false;

    // F11.1: 斜杠命令路由——以 / 开头时走命令引擎而非 AI API（无需 API Profile）
    if (isSlashCommand(text)) {
      await executeSlashCommand(character, text);
      return true;
    }

    // D-10：守卫前置——在任何消息入列之前失败，用户输入的正文保留在输入框不被清空。
    // 三态区分：未配置 / 已配置但锁定（提示去解锁，而不是误导用户新建配置）。
    if (!chatManager) {
      const st = useSettingsStore();
      if (st.activeProfile && st.hasMasterPassword && !st.isUnlocked) {
        lastError.value = {
          type: 'unknown',
          message: t('char.profileLocked'),
        };
        return false;
      }
      if (!st.activeProfile) {
        lastError.value = {
          type: 'unknown',
          message: t('char.noChatManager'),
        };
        return false;
      }
      // 配置存在且已解锁但 ChatManager 未建（如生成中切换 Profile 的时序缝隙）→ 现场重建
      setApiProfile(st.activeProfile);
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

    isGenerating.value = true;
    lastError.value = null;

    // 候选1+2: 统一上下文组装（Lorebook / Persona / RAG / 事件 / 主角 / 故事时间）
    const ctx = buildChatSessionContext(character, {
      ragMessages: [...history.map((m) => m.content), text],
      allowEventTrigger: true,
    });
    await memoryStore.loadLocalMemoryStore();
    ctx.memoryContext = await memoryStore.buildLocalMemoryContext(
      [...history.slice(-4).map((m) => m.content), text].join('\n')
    );
    const dataBankStore = useDataBankStore();
    const staticEntries = staticVectorSources(
      dataBankStore.documents,
      ctx.lorebooks ?? [],
      character.id,
      activeChatId.value,
    );
    const dynamicEntries: VectorRagSource[] = (await memoryStore.listScopedFacts())
      .map((fact: MemoryFact) => ({
        id: `memory:${fact.id}`,
        text: fact.body,
        meta: { scope: 'memory', kind: fact.kind, timestamp: String(fact.updatedAt) },
      }));
    // 双通道向量检索注入（默认关；只进 ragContext 动态段，不碰 standing 前缀）
    const vectorRag = await buildVectorRagInjection(
      text,
      (ctx.lorebooks?.length ?? 0) > 0,
      {
        dynamicModel: getRagDynamicModel(),
        staticModel: getRagStaticModel(),
        dynamicEntries,
        staticEntries,
      }
    );
    if (vectorRag.text) {
      ctx.ragContext = mergeRagContext(ctx.ragContext, vectorRag.text);
    }

    if (!chatManager) return false; // setApiProfile 现场重建失败的兜底（正常不可达）
    const mgr = chatManager;
    try {
      beginRequestTracking(card);
      // E-01: 以角色 ID 作为会话键(情绪状态按角色隔离)
      mgr.updateConfig({ sessionId: character.id });
      // P0-1/P0-3：同步思维链偏好与全局采样默认值
      await applyRuntimeLlmControls(character);
      // E-01: 种入角色 standing 事实(首次;字节稳定前缀数据源)
      await memoryStore.seedStandingFacts(card, character.id);
      const runtime = await ensureRuntimeIntegration(character, card);
      await mgr.sendMessage(
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
            // L 层：把"这一轮到底注入了哪几条设定"挂到本条回复上（E02 此前算出来却不下传）。
            // 目标必须是 liveMsg（响应式消息）而不是 card：CharacterCard 带 [key: string]: unknown，
            // 写 card 能过 typecheck 但既不渲染也不落盘——E2E 实测过一次静默失效。
            liveMsg.promptTrace = info.activated.length ? info.activated : undefined;
          },
          onEmotionUpdated: () => {
            void memoryStore.persistLocalMemoryStore();
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

            // 0.4.0：本地模式也保留可检索的会话事实；远程 Runtime 仍按自己的事件/记忆模型落盘。
            void memoryStore.recordLocalConversationMemory(character, text, fullContent, userMsg.id);

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
    return true;
  }

  /**
   * F11.1 执行斜杠命令
   *
   * 将命令文本路由到斜杠命令引擎，执行结果作为消息显示在对话区。
   * /setvar 修改的局部变量写入 chatVariables（随对话保留）。
   */
  async function executeSlashCommand(character: UICharacter, text: string): Promise<void> {
    const userName = collectLorebooksForCharacter(character.id)
      .find((lb) => lb.userProfile?.name?.trim())?.userProfile?.name?.trim() || 'User';

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
    invalidateActiveSummary();

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
    target.promptTrace = undefined;
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
    await memoryStore.loadLocalMemoryStore();
    ctx.memoryContext = await memoryStore.buildLocalMemoryContext(
      [...history.slice(-4).map((m) => m.content), userText].join('\n')
    );
    const dataBankStore = useDataBankStore();
    const staticEntries = staticVectorSources(
      dataBankStore.documents,
      ctx.lorebooks ?? [],
      character.id,
      activeChatId.value,
    );
    const dynamicEntries: VectorRagSource[] = (await memoryStore.listScopedFacts())
      .map((fact: MemoryFact) => ({
        id: `memory:${fact.id}`,
        text: fact.body,
        meta: { scope: 'memory', kind: fact.kind, timestamp: String(fact.updatedAt) },
      }));
    // 双通道向量检索注入（默认关；fail-open 不阻断重新生成）
    const vectorRag = await buildVectorRagInjection(
      userText,
      (ctx.lorebooks?.length ?? 0) > 0,
      {
        dynamicModel: getRagDynamicModel(),
        staticModel: getRagStaticModel(),
        dynamicEntries,
        staticEntries,
      }
    );
    if (vectorRag.text) {
      ctx.ragContext = mergeRagContext(ctx.ragContext, vectorRag.text);
    }

    try {
      beginRequestTracking(card);
      // E-01: 以角色 ID 作为会话键(情绪状态按角色隔离)
      chatManager.updateConfig({ sessionId: character.id });
      // P0-1/P0-3：同步思维链偏好与全局采样默认值
      await applyRuntimeLlmControls(character);
      // E-01: 种入角色 standing 事实(首次;字节稳定前缀数据源)
      await memoryStore.seedStandingFacts(card, character.id);
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
            // L 层：把"这一轮到底注入了哪几条设定"挂到本条回复上（E02 此前算出来却不下传）
            target.promptTrace = info.activated.length ? info.activated : undefined;
          },
          onEmotionUpdated: () => {
            void memoryStore.persistLocalMemoryStore();
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
            void memoryStore.recordLocalConversationMemory(
              character,
              userText,
              fullContent,
              historyBefore[lastUserIdx]?.id,
            );
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
      invalidateActiveSummary();
      character.messages.splice(idx, 1);
      void persistChat(character);
    }
  }

  function editMessage(msg: UIMessage, newContent: string): void {
    invalidateActiveSummary();
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
    const chatId = activeChatId.value ?? `chat-${character.id}`;
    const previous = summaryJobs.get(chatId) ?? Promise.resolve();
    summaryPendingIds.value = { ...summaryPendingIds.value, [chatId]: true };
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          const mgr = chatManager;
          if (!mgr || !storageAdapter) return;
          const { useSettingsStore } = await import('./settings');
          const settings = useSettingsStore();
          const config = settings.summarizationConfig;
          if (!config?.enabled) return;

          const existing = sessions.value.find((s) => s.id === chatId);
          const messages = uiMsgsToChatMsgs(character.messages);
          const baselineSummary = existing?.summary ?? null;
          const summary = await mgr.summarizeIfNeeded(messages, config, baselineSummary);
          if (!summary) return;

          // 编辑/重新生成可能在摘要请求期间使消息历史失效；只有基线仍是当前摘要时才写回。
          const latest = sessions.value.find((s) => s.id === chatId);
          if (!latest || latest.summary !== baselineSummary) return;
          latest.summary = summary;
          try {
            await storageAdapter.saveChat(latest);
          } catch {
            /* 落盘失败不阻断：内存态已更新，下一轮注入仍可用 */
          }
        } catch {
          /* fail-open：摘要整条链路静默失败 */
        }
      });
    summaryJobs.set(chatId, current);
    try {
      await current;
    } finally {
      if (summaryJobs.get(chatId) === current) {
        summaryJobs.delete(chatId);
        const next = { ...summaryPendingIds.value };
        delete next[chatId];
        summaryPendingIds.value = next;
      }
    }
  }

  /** 历史内容被编辑或重新生成后，旧摘要不再可信，必须从会话元数据中失效。 */
  function invalidateActiveSummary(): void {
    const chatId = activeChatId.value;
    if (!chatId) return;
    const existing = sessions.value.find((s) => s.id === chatId);
    if (!existing?.summary) return;
    existing.summary = undefined;
    if (storageAdapter) void storageAdapter.saveChat(existing).catch(() => undefined);
  }

  /**
   * 将当前角色对话持久化到存储层
   * 使用 character.id 作为 characterId，messages[0].id 拼接作为 chatId（简化）
   */
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
   * 在每轮 AI 回复完成后异步调用：检查生成器 → 决策 → LLM 生成事件内容。
   * 集成失败不影响主对话流程。
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
      const sceneName = character.name;

      // 执行决策
      const decision = randomEventsStore.decide(sceneName, recentMessages);
      if (!decision.shouldTrigger) {
        // 记录跳过原因（仅 console，不污染结果历史）
        if (decision.reason) {
          logger.debug('F17.3', `随机事件未触发：${decision.reason}`);
        }
        return;
      }

      // 检查 API 配置（无 API 则无法调用 LLM 生成）
      const { useSettingsStore } = await import('./settings');
      const settingsStore = useSettingsStore();
      const profile = settingsStore.activeProfile;
      if (!profile) {
        logger.debug('F17.3', '随机事件决策触发但未配置 API，跳过 LLM 生成');
        return;
      }

      // 已有 active 随机事件时不重复生成（避免事件堆积）
      const eventsStore = useEventsStore();
      const existingActive = eventsStore
        .getActiveEvents()
        .some((e) => e.id.startsWith('rand-evt-'));
      if (existingActive) {
        logger.debug('F17.3', '已有激活的随机事件，跳过本次生成');
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
        logger.debug('F17.3', 'LLM 返回内容解析失败，跳过记录');
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

      logger.info(
        'F17.3',
        `Random event generated: ${generated.name} (template=${
          tpl?.name ?? '(instant)'
        }, probability=${decision.effectiveProbability}%)`
      );
    } catch (err) {
      // 集成失败不影响主对话流程
      logger.warn('F17.3', '随机事件生成失败', err);
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

  /**
   * 清空最近一次错误（供 UI 关闭错误 Modal 后调用）
   */
  function clearLastError(): void {
    lastError.value = null;
  }

  return {
    setStorageAdapter,
    setApiProfile,
    applyRuntimeLlmControls,
    sendMessage,
    checkSendBlock,
    stop,
    regenerateMessage,
    copyMessage,
    deleteMessage,
    editMessage,
    persistAfterEdit,
    loadChatHistory,
    clearLastError,
    isGenerating,
    streamingContent,
    lastError,
    tokenUsage,
    totalTokenUsage,
    cacheUsage,
    prefixCacheHitRate,
    prefixStability,
    prefixStableRate,
    ttftStats,
    summaryStatus,
    summaryPendingIds,
  };
});
