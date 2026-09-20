import type { ChatRequest, ChatStream, ApiMessage } from './types';

/**
 * LLM API 客户端抽象接口 (F02)
 *
 * 不同服务商（OpenAI / Anthropic / 自定义兼容）实现此接口，
 * 上层 ChatManager 通过统一接口调用，无需关心协议差异。
 */
export interface ApiClient {
  /** 服务商标识，如 'openai' / 'anthropic' / 'custom' */
  readonly provider: string;

  /**
   * 非流式对话（一次性返回完整内容）
   * 适用于短回复或不需要打字机效果的场景
   */
  chat(request: ChatRequest): Promise<string>;

  /**
   * 流式对话（async iterable）
   * 每收到一个 token delta 触发一次 yield，最后 yield done 事件
   *
   * 调用方可通过 request.signal 中止生成
   */
  chatStream(request: ChatRequest): ChatStream;

  /**
   * 预检请求（可选）：验证 API Key 与端点是否可用
   * @returns 200 OK 返回 true，否则 false
   */
  ping?(): Promise<boolean>;

  /**
   * 获取模型列表（可选）：GET {baseUrl}/v1/models
   * 返回模型 id 列表；部分本地服务不支持 /models 接口时抛错，
   * 调用方应降级为手动输入模型名
   */
  listModels?(): Promise<string[]>;
}

/**
 * 把 `undefined` / `null` 统一收敛为 `undefined`（= 不传 = 供应商默认）
 * 用于合并参数时避免把 null 透进 body。
 */
function pickNumber(
  primary: number | null | undefined,
  fallback: number | null | undefined
): number | undefined {
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  return undefined;
}

/**
 * 构建请求时的辅助工具：合并默认参数
 *
 * 逐字段 `??` 合并，请求侧优先；两侧都未设置时保持 `undefined`（不传）。
 * 注意：`reasoningEffort` 不参与合并 —— 它由 capability 决定是否下发。
 */
export function mergeDefaultParams(
  request: ChatRequest,
  defaults: import('./types').SamplingParams
): ChatRequest {
  return {
    ...request,
    temperature: pickNumber(request.temperature, defaults.temperature),
    maxTokens: pickNumber(request.maxTokens, defaults.maxTokens),
    topP: pickNumber(request.topP, defaults.topP),
    presencePenalty: pickNumber(request.presencePenalty, defaults.presencePenalty),
    frequencyPenalty: pickNumber(request.frequencyPenalty, defaults.frequencyPenalty),
  };
}

/** 将 ApiMessage[] 简化为 [role, content] 元组数组，便于日志/调试 */
export function summarizeMessages(messages: ApiMessage[]): string {
  return messages
    .map((m) => `[${m.role}] ${m.content.slice(0, 80)}${m.content.length > 80 ? '…' : ''}`)
    .join('\n');
}
