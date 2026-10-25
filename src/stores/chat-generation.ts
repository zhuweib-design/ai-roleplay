/**
 * chat-generation — 消息生成引擎子 store（R4-4 拆分后：735 行装配层）
 *
 * 职责（优化项 7 · S6）：
 * - isGenerating / streamingContent / lastError / tokenUsage / cacheUsage /
 *   prefixStability / ttftStats / summaryStatus 状态
 * - sendMessage / stop / regenerateMessage / copyMessage / deleteMessage /
 *   editMessage / persistAfterEdit / beginRequestTracking / checkSendBlock
 *
 * 下放模块（本文件只做装配与转发，return 面零变化）：
 * - chat-generation-helpers：纯函数（RAG 合并 / 向量源 / 采样补丁 / 错误归一）
 * - chat-generation-profile：Profile → ChatManager 装配（工厂，pendingProfile 为实例状态）
 * - chat-generation-persistence：persistChat / 摘要 / 历史加载（工厂，storageAdapter 为实例状态）
 * - chat-generation-commands：斜杠命令管道（依赖注入 stop / sendMessage / persistChat）
 * - chat-generation-random-event：F17.3 随机事件（无状态，自由函数）
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
import type { UIMessage, UICharacter } from '@/types';
import type { CharacterCard } from '@/core/character-card';
import { ChatManager, classifyChatError } from '../services/chat-manager';
import { chatErrorI18n } from '../services/chat-error';
import { type ApiErrorKind } from '../api/types';
import { uiCharToCard, uiMsgsToChatMsgs } from '../services/type-adapters';
import { buildChatSessionContext } from './chat-context';
import { toEventTraceItems } from '@core/event-trace';
import {
  buildVectorRagInjection,
  getRagDynamicModel,
  getRagStaticModel,
  type VectorRagSource,
} from '@/core/dual-channel-runtime';
import { isSlashCommand } from '@/core/slash-command';
import { useStoryStore } from './story';
import { countTokens } from '@/core/token-counter';
import { stripNarrationMarkers } from '@core/narration';
import { useDataBankStore } from './data-bank';
import type { MemoryFact } from '@/core/memory-store';
import { useChatSessionStore } from './chat-session';
import { useSettingsStore } from './settings';
import { useChatMemoryStore } from './chat-memory';
import { useChatRuntimeStore } from './chat-runtime';
import { mergeRagContext, staticVectorSources, toLastErrorRecord } from './chat-generation-helpers';
import { executeSlashCommand as runSlashCommand } from './chat-generation-commands';
import { maybeGenerateRandomEvent } from './chat-generation-random-event';
import { createPersistenceOps } from './chat-generation-persistence';
import { createProfileOps } from './chat-generation-profile';

export type ChatSummaryStatusPhase = 'none' | 'ready' | 'updating';

/** 当前会话摘要的可视化状态，供上下文面板显示。 */
export interface ChatSummaryStatus {
  phase: ChatSummaryStatusPhase;
  coveredMessageCount: number;
  lastCoveredMessageIndex: number;
  createdAt?: number;
  tokenCount?: number;
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

  let chatManager: ChatManager | null = null;
  const getChatManager = (): ChatManager | null => chatManager;
  const setChatManager = (manager: ChatManager | null): void => {
    chatManager = manager;
  };

  const profileOps = createProfileOps({
    activeChatId,
    sessions,
    activePresetInfo,
    memoryStore,
    getChatManager,
    setChatManager,
  });
  const persistenceOps = createPersistenceOps({
    activeChatId,
    sessions,
    lastError,
    summaryPendingIds,
    getChatManager,
  });

  // 转发包装：保持宿主原有调用点与 return 面不变
  const { setApiProfile, applyRuntimeLlmControls, buildCharacterOverrides, flushPendingProfile } =
    profileOps;
  const {
    setStorageAdapter,
    persistChat,
    maybeGenerateSummary,
    invalidateActiveSummary,
    loadChatHistory,
  } = persistenceOps;

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
      await runSlashCommand(character, text, {
        chatVariables,
        stop,
        sendMessage,
        persistChat,
      });
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
            // E11：随机事件同理挂到本条回复上。读 ctx 而不是事后查事件表——
            // 事件表只在内存里（stores/events.ts 注明），刷新后当初那条就没了。
            const eventTrace = toEventTraceItems(ctx.activatedEvents);
            liveMsg.eventTrace = eventTrace.length ? eventTrace : undefined;
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
   * 停止当前生成
   */
  function stop(): void {
    // 不能看 chatManager.isGenerating：prompt 构建期间它是 false，
    // 但 store 已经是"正在生成"，此时点停止必须能传达到 manager
    if (!isGenerating.value) return;
    chatManager?.stop();
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
    // E11：本轮的事件痕迹属于上一轮，重新生成必须一起清掉
    target.eventTrace = undefined;
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
            // E11：重新生成走的是 allowEventTrigger=false，已激活的事件仍会注入，
            // 所以痕迹同样要重算，不能留着上一轮的那条。
            const eventTrace = toEventTraceItems(ctx.activatedEvents);
            target.eventTrace = eventTrace.length ? eventTrace : undefined;
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
    // 复制出去的是给人读的正文，不能带 ⟦⟧ 这两个只服务于渲染的标记
    navigator.clipboard?.writeText(stripNarrationMarkers(msg.content)).catch(() => {});
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
