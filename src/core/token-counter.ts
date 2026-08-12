import { encode } from 'gpt-tokenizer';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Token 计数开销配置
 * 不同 API 提供商的消息格式开销不同，可通过此接口自定义。
 * 默认值基于 OpenAI 的 Token 计算规则。
 * 来源：OpenAI Cookbook - "How to count tokens with tiktoken"
 */
export interface TokenOverheadConfig {
  /** 对话整体开销（Token），默认 3。来源：OpenAI Chat Markup 格式的基础开销 */
  conversationOverhead?: number;
  /** 每条消息的格式开销（Token），默认 4。来源：OpenAI 每条消息的 role/content 标记开销 */
  perMessageOverhead?: number;
}

const DEFAULT_OVERHEAD: Required<TokenOverheadConfig> = {
  conversationOverhead: 3,
  perMessageOverhead: 4,
};

/**
 * Token 计数 (F03.2)
 * 使用 gpt-tokenizer 库在前端执行 Token 计数。
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

/**
 * Chat Completion 消息列表 Token 计数
 * 默认每条消息有 4 Token 的格式开销，整体有 3 Token 的对话开销。
 * 可通过 overhead 参数自定义开销值以适配不同 API 提供商。
 */
export function countMessageTokens(
  messages: ChatMessage[],
  overhead: TokenOverheadConfig = {}
): number {
  const config = { ...DEFAULT_OVERHEAD, ...overhead };
  let total = config.conversationOverhead;
  for (const msg of messages) {
    total += config.perMessageOverhead;
    total += countTokens(msg.content);
    total += countTokens(msg.role);
  }
  return total;
}
