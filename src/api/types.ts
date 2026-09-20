/**
 * API 层共享类型
 *
 * 此处定义与 LLM 服务商交互时使用的消息格式，
 * 与核心层 ChatMessage（带 id/timestamp/swipes）解耦。
 */

export type ApiRole = 'system' | 'user' | 'assistant' | 'tool';

/** LLM 工具调用定义(OpenAI 风格,Anthropic 由协议层转换) */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    /** JSON Schema 风格的参数定义 */
    parameters?: Record<string, unknown>;
  };
}

/** 模型发起的工具调用(OpenAI 风格) */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON 字符串形式的参数 */
    arguments: string;
  };
}

/**
 * P0-2 思考强度（对外统一概念）
 *
 * 三个档位是**产品语义**，各 provider 的实际下发形态由
 * `src/api/reasoning-capability.ts` 翻译（OpenAI 用 reasoning_effort，
 * Anthropic 用 thinking.budget_tokens，其余不下发）。
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/**
 * P0-3 采样参数集合（持久化层的收纳容器）
 *
 * 语义沿用 T-16：`undefined` / `null` = **不传** = 供应商默认。
 * 绝不用 0 表示"未设置"（top_p=0 是"只取概率最高的 token"）。
 */
export interface SamplingParams {
  /** 0-2；undefined/null = 不传 = 供应商默认 */
  temperature?: number | null;
  /** undefined/null = 不传 = 供应商默认（沿用 T-16） */
  maxTokens?: number | null;
  /** 0-1；undefined/null = 不传 */
  topP?: number | null;
  /** -2 ~ 2；undefined/null = 不传 */
  presencePenalty?: number | null;
  /** -2 ~ 2；undefined/null = 不传 */
  frequencyPenalty?: number | null;
}

/** 发送给 LLM 的单条消息 */
export interface ApiMessage {
  role: ApiRole;
  content: string;
  /** assistant 消息携带的模型工具调用(可选) */
  toolCalls?: ToolCall[];
  /** role='tool' 时关联的 tool_call id(可选) */
  toolCallId?: string;
}

/** 聊天请求参数 */
export interface ChatRequest {
  /** 已构建的消息列表（含 system + history + user） */
  messages: ApiMessage[];
  /** 模型名，如 'gpt-4o' / 'claude-3-5-sonnet-20241022' */
  model: string;
  /** 采样温度，0-2，默认由服务商处理 */
  temperature?: number;
  /** 单次回复最大 tokens */
  maxTokens?: number;
  /** P0-3：核采样阈值 0-1；undefined/null = 不传 */
  topP?: number;
  /** P0-3：存在惩罚 -2~2（OpenAI 兼容层专有；Anthropic / local 静默丢弃） */
  presencePenalty?: number;
  /** P0-3：频率惩罚 -2~2（同上） */
  frequencyPenalty?: number;
  /** P0-2：思考强度；命中 capability 才真正下发，否则 client 静默丢弃 */
  reasoningEffort?: ReasoningEffort;
  /** T-02:可用工具定义列表(模型可在回复中发起工具调用) */
  tools?: ToolDefinition[];
  /** 终止信号，用于 stop() 中止请求 */
  signal?: AbortSignal;
}

/** 流式事件类型 */
export type ChatStreamEventType = 'delta' | 'done' | 'error';

/** LLM 用量统计(OpenAI 兼容 usage 字段;DeepSeek 系含前缀缓存拆解) */
export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** 前缀缓存命中 token(DeepSeek: prompt_cache_hit_tokens) */
  promptCacheHitTokens?: number;
  /** 前缀缓存未命中 token(DeepSeek: prompt_cache_miss_tokens) */
  promptCacheMissTokens?: number;
  /**
   * 推理（思考）消耗的 token（P1 起在思维链块上展示）
   *
   * 来源：OpenAI 兼容 `usage.completion_tokens_details.reasoning_tokens`（部分网关平铺为 `usage.reasoning_tokens`）；
   * Anthropic `usage.output_tokens_details.thinking_tokens`；local/WebLLM 不上报。
   * **拿不到时必须是 undefined —— UI 不展示，绝不显示 0（0 会被误读成"思考没花 token"）。**
   */
  reasoningTokens?: number;
}

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  /** type=delta：增量 token（标签型思考已被编排层剥离，此处恒为正文） */
  delta?: string;
  /** type=delta：思考增量（字段型来源由 client 产出；标签型此字段为空） */
  thinkingDelta?: string;
  /** type=done：完整回复内容 */
  fullContent?: string;
  /** type=done：完整思考（字段型由 client 提供；标签型由编排层解析补齐） */
  fullThinking?: string;
  /** type=error：错误消息 */
  error?: string;
  /** finish_reason（仅 done 时）：stop / length / content_filter */
  finishReason?: string;
  /** T-02：done 时携带模型发起的工具调用（非流式或流式聚合后） */
  toolCalls?: ToolCall[];
  /** 用量统计(带缓存拆解时可用;取自流式末 chunk / 非流式响应) */
  usage?: ChatUsage;
}

/** 流式响应（async iterable） */
export type ChatStream = AsyncIterable<ChatStreamEvent>;

/**
 * API 错误类型分类
 * - aborted：用户主动中止
 * - cors：跨域被浏览器拦截
 * - network：网络层错误（DNS 解析失败、连接超时、断网等）
 * - invalid-url：baseUrl 格式错误
 * - auth：API Key 错误或未授权（401/403）
 * - rate-limit：调用频率超限（429）
 * - server：服务商服务器错误（5xx）
 * - unknown：其他未分类错误
 */
export type ApiErrorKind =
  | 'aborted'
  | 'cors'
  | 'network'
  | 'invalid-url'
  | 'auth'
  | 'rate-limit'
  | 'server'
  | 'unknown';

/** API 错误 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly provider?: string,
    public readonly kind: ApiErrorKind = 'unknown'
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
