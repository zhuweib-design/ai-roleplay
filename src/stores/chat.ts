import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UIMessage, UICharacter, ApiProfile } from '@/types';
import type { CharacterCard } from '@/core/character-card';
import { ChatManager, classifyChatError, type ChatManagerConfig } from '../services/chat-manager';
import { createApiClient } from '../api';
import { ApiError, type ApiErrorKind } from '../api/types';
import type { StorageAdapter } from '../storage/storage-adapter';
import type { Chat } from '../storage/types';
import {
  uiCharToCard,
  uiMsgsToChatMsgs,
} from '../services/type-adapters';
import { usePersonaStore } from './persona';
import { useEventsStore } from './events';
import { buildChatSessionContext, collectLorebooksForCharacter } from './chat-context';
import { buildVectorRagInjection } from '@/core/dual-channel-runtime';
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
  // 生成中切换的 API Profile 暂存，任务结束后应用（修复：原实现直接丢弃）
  let pendingProfile: {
    profile: ApiProfile | null;
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>;
  } | null = null;

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
      return;
    }

    const apiClient = createApiClient(profile);
    const config: ChatManagerConfig = {
      apiClient,
      model: profile.model,
      userName: options?.userName ?? 'User',
      systemPrompt: options?.systemPrompt ?? '',
      maxContextTokens: options?.maxContextTokens ?? 8192,
      reservedTokens: options?.reservedTokens ?? 1024,
      // 需求3: API Profile 默认最大 Tokens（角色 overrides.maxTokens 优先）
      maxTokens: profile.maxTokens,
      // T-02: 内置工具装配 —— get_var/set_var 直连全局变量,
      // retrieve_document 惰性调用 data-bank store(global 作用域);
      // ponytail: search_lorebook 需角色级 lorebook 上下文(chat-context 持有),
      // 暂不注入(工具返回"不可用"提示,模型会向用户说明),后续随 chat 会话上下文接线
      tools: getBuiltinToolDefinitions(),
      // E-04 二期: 嵌入优化管线(默认关闭,由设置页开关;fail-open 不影响主链路)
      optimization: new OptimizationPipeline(loadOptimizationConfig()),
      executeTool: async (call) =>
        executeBuiltinTool(call, {
          getVariable: (name) => loadGlobalVariables()[name],
          setVariable: setGlobalVariable,
          retrieveDocuments: async (query, limit) => {
            try {
              const docs = useDataBankStore().retrieveForChat([query], 'global');
              const limited = limit && limit > 0 ? docs.slice(0, limit) : docs;
              return limited.length === 0
                ? '资料库中未找到相关内容'
                : limited
                    .map((d) => `【${d.documentName}】${d.chunk.content}`)
                    .join('\n\n');
            } catch {
              return '资料库不可用';
            }
          },
        }),
    };
    chatManager = new ChatManager(config);
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
    const liveMsg = character.messages[character.messages.length - 1];

    // 4. 转换 UI → 核心类型
    const card = uiCharToCard(character);
    const history = uiMsgsToChatMsgs(historyBefore);

    if (!chatManager) {
      // 未配置 API Profile，给出明确提示而非静默失败
      liveMsg.generating = false;
      liveMsg.content = '（未配置 API Profile，请在设置页添加 API 配置后再开始对话）';
      lastError.value = {
        type: 'unknown',
        message: '未配置 ChatManager',
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
      (ctx.lorebooks?.length ?? 0) > 0
    );
    if (vectorRag.text) {
      ctx.ragContext = ctx.ragContext ? `${ctx.ragContext}\n${vectorRag.text}` : vectorRag.text;
    }

    try {
      beginRequestTracking(card);
      await chatManager.sendMessage(
        {
          card,
          history,
          userMessage: text,
          overrides: {
            temperature: character.temperature,
            maxTokens: character.maxTokens,
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
          onUsage: (usage) => {
            // 前缀缓存统计(供应商返回 cache 拆解时)
            if (usage.promptCacheHitTokens !== undefined || usage.promptCacheMissTokens !== undefined) {
              cacheUsage.value.hitTokens += usage.promptCacheHitTokens ?? 0;
              cacheUsage.value.missTokens += usage.promptCacheMissTokens ?? 0;
              cacheUsage.value.reported++;
            }
          },
          onDone: (fullContent) => {
            tokenUsage.value.completion += countTokens(fullContent);
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
              if (!liveMsg.content) liveMsg.content = '（已停止生成）';
            } else {
              liveMsg.content = `（生成失败：${err.message}）`;
            }
            lastError.value = toLastErrorRecord(err, type);
            streamingContent.value = '';
          },
        }
      );

      // 5. 持久化对话（无论成功 / 失败，都保存已收到的内容）
      await persistChat(character);
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
                  ? `已触发事件「${eventsStore.getEvent(id)?.name ?? id}」`
                  : (eventsStore.lastError ?? `触发事件 ${id} 失败`),
              };
            },
            complete: (id: string) => {
              const ok = eventsStore.completeEvent(id);
              return {
                success: ok,
                message: ok
                  ? `已完成事件「${eventsStore.getEvent(id)?.name ?? id}」`
                  : (eventsStore.lastError ?? `完成事件 ${id} 失败`),
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
        ? '（命令执行完成）'
        : '（命令执行失败）';
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
    const target = character.messages[idx];
    if (target.role !== 'assistant') return;

    // 取该消息之前的全部消息作为 history
    const historyBefore = character.messages.slice(0, idx);

    // 找最后一条用户消息的索引（chat-manager 会把它作为 userMessage 重新加入 prompt）
    let lastUserIdx = -1;
    for (let i = historyBefore.length - 1; i >= 0; i--) {
      if (historyBefore[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) return; // 历史中无用户消息，无法重新生成
    const userText = historyBefore[lastUserIdx].content;

    // 重置目标消息
    target.content = '';
    target.generating = true;

    // 转换 UI → 核心
    // history 排除最后一条用户消息（chat-manager 会将其作为 userMessage 重新加入）
    const card = uiCharToCard(character);
    const history = uiMsgsToChatMsgs(historyBefore.slice(0, lastUserIdx));

    if (!chatManager) {
      target.generating = false;
      target.content = '（未配置 API Profile）';
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
      (ctx.lorebooks?.length ?? 0) > 0
    );
    if (vectorRag.text) {
      ctx.ragContext = ctx.ragContext ? `${ctx.ragContext}\n${vectorRag.text}` : vectorRag.text;
    }

    try {
      beginRequestTracking(card);
      await chatManager.sendMessage(
        {
          card,
          history,
          userMessage: userText,
          overrides: {
            temperature: character.temperature,
            maxTokens: character.maxTokens,
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
          onDone: (fullContent) => {
            tokenUsage.value.completion += countTokens(fullContent);
            target.content = fullContent;
            target.generating = false;
            streamingContent.value = '';
          },
          onError: (err) => {
            const type = classifyChatError(err);
            target.generating = false;
            if (type === 'aborted') {
              if (!target.content) target.content = '（已停止生成）';
            } else {
              target.content = `（生成失败：${err.message}）`;
            }
            lastError.value = toLastErrorRecord(err, type);
            streamingContent.value = '';
          },
        }
      );

      await persistChat(character);
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
  async function persistChat(character: UICharacter): Promise<void> {
    if (!storageAdapter) return; // 未注入存储适配器，静默跳过
    if (character.messages.length === 0) return;

    const now = new Date().toISOString();
    const chatId = `chat-${character.id}`;
    const chat: Chat = {
      id: chatId,
      characterId: character.id,
      title: `与 ${character.name} 的对话`,
      messages: uiMsgsToChatMsgs(character.messages),
      createdAt: character.messages[0].timestamp
        ? new Date(character.messages[0].timestamp as number).toISOString()
        : now,
      updatedAt: now,
    };

    try {
      await storageAdapter.saveChat(chat);
    } catch (err) {
      // 持久化失败不应阻塞 UI 流程，记录到 lastError
      lastError.value = {
        type: 'unknown',
        message: `持久化失败：${err instanceof Error ? err.message : String(err)}`,
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
        ? `【事件模板提示】名称=${tpl.name}；类别=${tpl.category}；严重度=${tpl.severity}${
            tpl.triggerKeywords.length > 0 ? `；关键词=${tpl.triggerKeywords.join('、')}` : ''
          }；描述=${tpl.description}`
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
        `[F17.3] 随机事件已生成：${generated.name}（模板=${
          tpl?.name ?? '(即时)'
        }，概率=${decision.effectiveProbability}%）`
      );
    } catch (err) {
      // 集成失败不影响主对话流程
      console.warn('[F17.3] 随机事件生成失败：', err);
    }
  }

  /**
   * 从存储层加载历史对话到指定角色
   */
  async function loadChatHistory(character: UICharacter): Promise<void> {
    if (!storageAdapter) return;
    try {
      const chat = await storageAdapter.loadChat(`chat-${character.id}`);
      if (chat) {
        // 用核心消息覆盖 UI 消息（chatMsgsToUiMsgs 自动过滤 system）
        // 延迟 import 避免循环依赖
        const { chatMsgsToUiMsgs } = await import('../services/type-adapters');
        character.messages = chatMsgsToUiMsgs(chat.messages);
      }
    } catch (err) {
      lastError.value = {
        type: 'unknown',
        message: `加载历史失败：${err instanceof Error ? err.message : String(err)}`,
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
    // 状态
    isGenerating,
    streamingContent,
    lastError,
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
    // 消息操作
    sendMessage,
    stop,
    copyMessage,
    deleteMessage,
    editMessage,
    regenerateMessage,
    persistAfterEdit,
    loadChatHistory,
    // 错误管理
    clearLastError,
  };
});
