/**
 * ChatManager —— 类型定义层
 *
 * 本层零函数、零副作用，只描述注入配置 / 发送参数 / 流式回调三套数据结构。
 * ChatManager 类与外部消费方共同依赖它，放在依赖图最底层
 *（R4-16 自 chat-manager.ts 整段切出，公开面经宿主 export type 再导出保持不变）。
 */

import type { ApiClient } from '@api/api-client';
import type { ToolCall, ToolDefinition, ChatUsage, ReasoningEffort } from '@api/types';
import type { RetryPolicy } from '@api/llm-retry';
import type { PromptContexts } from '@core/prompt-builder';
import type { PromptTraceItem } from '@core/lorebook-scanner';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import type { NarrationPerspective } from '@core/narration';
import type { CharacterStatus } from '@core/status-schema';
import type { OptimizationPipeline } from '@core/optimization-pipeline';
import type { SummarizationConfig, ConversationSummary } from '@core/summarizer';
import type { L0L2Deps } from '@core/l0-l2-runtime';
import type { ChatRuntimeIntegration } from '@/runtime';

/**
 * ChatManager 配置
 *
 * 由调用方（chat store）根据当前角色与 API Profile 组装后注入。
 * 支持运行时通过 updateConfig() 切换 API Client / 模型 / 参数。
 */
export interface ChatManagerConfig {
  /** API 客户端实例（OpenAI / Anthropic / Custom） */
  apiClient: ApiClient;
  /** 模型名，如 'gpt-4o' / 'claude-3-5-sonnet-20241022' */
  model: string;
  /** 当前世界内昵称（兼容旧调用方；{{user}} 不再作为宏替换） */
  userName?: string;
  /** 系统提示词前缀（可空，角色定义会拼接到其后） */
  systemPrompt?: string;
  /** 上下文窗口 Token 上限，默认 8192 */
  maxContextTokens?: number;
  /** 为回复预留的 Token 数，默认 1024 */
  reservedTokens?: number;
  /** 默认采样温度 */
  temperature?: number;
  /** P0-3：核采样阈值 0-1；undefined = 不传（供应商默认） */
  topP?: number;
  /** P0-3：存在惩罚 -2~2；undefined = 不传 */
  presencePenalty?: number;
  /** P0-3：频率惩罚 -2~2；undefined = 不传 */
  frequencyPenalty?: number;
  /** P0-2：思考强度（运行时由 capability 决定是否真正下发） */
  reasoningEffort?: ReasoningEffort;
  /**
   * P0-1：历史 assistant 消息中的思考是否随请求回传
   * 默认 false = 剥离（省 token）；true 时以 `<think>…</think>` 前缀回包进 content。
   * **只在内存组装时生效，不修改任何持久化数据。**
   */
  includeThinkingInHistory?: boolean;
  /**
   * 心理活动（旁白段）的人称视角：'me' = 旁白里用户是「我」，'you' = 「你」。
   * undefined = 不注入叙事规则（老的调用方与测试走这条）。
   */
  narrationPerspective?: NarrationPerspective;
  /** T-02：可用工具定义列表（模型可在回复中发起工具调用） */
  tools?: ToolDefinition[];
  /** T-02：工具执行器（执行模型发起的工具调用，返回结果文本） */
  executeTool?: (call: ToolCall) => Promise<string>;
  /** E-04 二期：嵌入优化管线（默认关闭；启用后对长历史消息做 L1 压缩，fail-open） */
  optimization?: OptimizationPipeline;
  /** E-01/E-02：L0/L2 运行时依赖（MemoryStore/CharacterRegistry/EmotionTracker） */
  l0l2?: L0L2Deps;
  /** Virtual Character OS：可选的持久化角色 Runtime 接入。失败时保持聊天主链路 fail-open。 */
  runtime?: ChatRuntimeIntegration;
  /** E-01：会话 ID（情绪状态键；缺省用前缀哈希兜底） */
  sessionId?: string;
  /**
   * P1：是否向模型注入"要求输出状态块"的提示词指令。
   *
   * 只影响**注入**（改变模型行为）；解析与渲染**永远开启**（模型自己输出了就白捡）。
   * 由 chat store 的 applyRuntimeLlmControls() 从 settings.statusHudConfig.enabled 同步，
   * 角色级 `ext.statusInstruction === 'on' | 'off'` 在此之上覆盖（见 sendMessage 内解析）。
   */
  statusInstructionEnabled?: boolean;
  // ── 摘要接线（2026-09-21）──
  /**
   * 会话摘要配置。**不传 = 完全不触发摘要**（行为与接线前一致）。
   *
   * 传入后：流式结束时会**异步**（fire-and-forget）判断是否需要生成摘要，
   * 失败静默 —— 不阻塞、不影响主链路（天然 fail-open）。
   */
  summarizationConfig?: SummarizationConfig;
  /** 现有摘要（增量更新用；由 chat store 从当前会话读取后传入） */
  existingSummary?: ConversationSummary | null;
  /** 摘要生成完成回调（chat store 负责写回会话并持久化） */
  onSummaryGenerated?: (summary: ConversationSummary) => void;
  /**
   * MODEL-02：LLM 调用层自动重试策略。
   * 只对**连接阶段**（尚未产出任何事件）的瞬时故障（限流/5xx/网络）重试；
   * 已产出内容后失败一律交上层处理，避免正文重复。不传 = 使用默认策略。
   */
  retryPolicy?: RetryPolicy;
}

export interface SendMessageParams {
  /** 角色卡 */
  card: CharacterCard;
  /** 历史消息（核心类型 ChatMessage[]） */
  history: ChatMessage[];
  /** 用户输入文本 */
  userMessage: string;
  /** Runtime 对话轮次的稳定 ID；由会话层传入以支持 Event 幂等重试。 */
  runtimeTurnId?: string;
  /** 当前会话使用的 Runtime 接入；会覆盖配置级 Runtime。 */
  runtime?: ChatRuntimeIntegration;
  /** 仅注入 Runtime Context，不在 ChatManager 内写入 Event；群聊由服务端事务统一提交。 */
  persistRuntime?: boolean;
  /**
   * 覆盖默认配置（model / userName / 全部采样参数 / 思考强度）
   *
   * 注意：只传**已设置**的键 —— 未设置的键不应出现在本对象里，
   * 否则 `{...config, ...overrides}` 会用 undefined 覆盖掉 Profile 级默认值。
   */
  overrides?: Partial<
    Pick<
      ChatManagerConfig,
      | 'model'
      | 'userName'
      | 'temperature'
      | 'topP'
      | 'presencePenalty'
      | 'frequencyPenalty'
      | 'reasoningEffort'
    >
  >;
  /** 迭代33：可选注入上下文（Lorebook / RAG / 事件 / 主角 / 故事时间），收拢为单一对象 */
  contexts?: PromptContexts;
}

/**
 * 流式回调集合
 * 任一回调可选；返回值被忽略
 */
export interface ChatManagerCallbacks {
  /** 每收到一个 delta token 触发，fullContent 为累计正文（已剥离思考） */
  onDelta?: (delta: string, fullContent: string) => void;
  /**
   * P0-1：每收到一段思考增量触发，fullThinking 为累计思考
   *
   * 两种来源都收敛到本回调：
   * - 字段型（`reasoning_content` / `thinking_delta`）→ 由 client 直接产出
   * - 标签型（`<think>…</think>`）→ 由编排层 ThinkingSplitter 切分后产出
   *
   * 收敛阶段（done）若最终思考与累计值不一致，会以 delta='' 再回调一次，
   * 调用方只需用 fullThinking 覆盖即可。
   */
  onThinking?: (delta: string, fullThinking: string) => void;
  /** 生成完成 */
  onDone?: (fullContent: string, finishReason?: string) => void;
  /** 收到用量统计(含前缀缓存拆解时可用;每轮 done 触发) */
  onUsage?: (usage: ChatUsage) => void;
  /** 发生错误（含用户中止） */
  onError?: (error: Error) => void;
  /** prompt 构建完成后触发，可用于 UI 显示 Token 计数与裁剪状态 */
  onPromptBuilt?: (info: {
    tokenCount: number;
    trimmed: boolean;
    messageCount: number;
    /** 本轮真正注入的世界书条目（裁剪视图，不含正文） */
    activated: PromptTraceItem[];
  }) => void;
  /** E-01：本轮生成完成后情绪状态更新回调（成功时触发，供 UI 展示） */
  onEmotionUpdated?: (label: string, sessionId: string) => void;
  /**
   * P1：本轮解析出的角色状态快照（状态块闭合后一次性回调；无状态时不回调）
   *
   * 与 onThinking 同构：调用方只需用返回值覆盖 UI 消息的 `status` 字段。
   * 未解析出任何可用字段时为 null（渲染层据此不渲染，不渲染空壳）。
   */
  onStatus?: (status: CharacterStatus | null) => void;
}
