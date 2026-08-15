// gpt-tokenizer 词表 ~983KB(gzip ~447KB), 动态 import 懒加载避免进入首屏 chunk(P1-3)
// 首次调用时加载, 之后复用同一 promise; 所有调用方需 await(P1-3 改造)
let encoderPromise: Promise<typeof import('gpt-tokenizer')> | null = null;
function getEncoder(): Promise<typeof import('gpt-tokenizer')> {
  encoderPromise ??= import('gpt-tokenizer');
  return encoderPromise;
}

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
export async function countTokens(text: string): Promise<number> {
  if (!text) return 0;
  const { encode } = await getEncoder();
  return encode(text).length;
}

/**
 * 预加载 tokenizer 并返回同步计数函数。
 * 高频循环场景(如字符级预算切分)先调用一次, 循环内同步计数, 避免每字符 await 的 microtask 开销。
 */
export async function loadTokenCounter(): Promise<(text: string) => number> {
  const { encode } = await getEncoder();
  return (text: string) => (text ? encode(text).length : 0);
}

/**
 * Chat Completion 消息列表 Token 计数
 * 默认每条消息有 4 Token 的格式开销，整体有 3 Token 的对话开销。
 * 可通过 overhead 参数自定义开销值以适配不同 API 提供商。
 */
export async function countMessageTokens(
  messages: ChatMessage[],
  overhead: TokenOverheadConfig = {}
): Promise<number> {
  const config = { ...DEFAULT_OVERHEAD, ...overhead };
  let total = config.conversationOverhead;
  for (const msg of messages) {
    total += config.perMessageOverhead;
    total += await countTokens(msg.content);
    total += await countTokens(msg.role);
  }
  return total;
}
