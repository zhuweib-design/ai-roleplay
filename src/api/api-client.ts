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

/** 构建请求时的辅助工具：合并默认参数 */
export function mergeDefaultParams(
  request: ChatRequest,
  defaults: { temperature?: number; maxTokens?: number }
): ChatRequest {
  return {
    ...request,
    temperature: request.temperature ?? defaults.temperature,
    maxTokens: request.maxTokens ?? defaults.maxTokens,
  };
}

/** 将 ApiMessage[] 简化为 [role, content] 元组数组，便于日志/调试 */
export function summarizeMessages(messages: ApiMessage[]): string {
  return messages
    .map((m) => `[${m.role}] ${m.content.slice(0, 80)}${m.content.length > 80 ? '…' : ''}`)
    .join('\n');
}
