/**
 * Token 预算：把"模型最大上下文"变成唯一旋钮，其余自动适配、自动压缩、不溢出
 *
 * 背景（2026-10-14）：生成类调用原先各自写死输出上限（世界创建 2000、角色 1500、NPC 1000……），
 * 而提示词自己要求的内容量可以远超这个数（世界创建按中位字数写要 3895 token），
 * 模型被掐断在 JSON 中间 ⇒ 界面只能报"无法解析 AI 返回的数据"。
 * 现在的口径是用户定的：不限制输出上限，模型只配一个最大上下文，其余自动算——
 *
 *   输出预算 = 最大上下文 − 本次输入实测 − 预留
 *
 * 输入装不下时先压缩：先截断塞进提示词的大块源文本（小说素材 / 已有条目摘要），
 * 还不够再从最早的历史消息开始丢，最后兜底截断最长那条消息（保住尾部，
 * 因为生成类提示词的 JSON 结构说明在尾部）。全程保证 输入 + 输出 ≤ 上下文。
 */
import { countMessageTokens, countTokens, type ChatMessage } from './token-counter';

/** 输出预算下限：再小写不出一个完整结构，等于白调一次 */
export const MIN_OUTPUT_TOKENS = 512;

// i18n-ignore-start  // 截断标记会随文本塞进提示词给模型看，不是界面文案
/** 截断后追加在尾部的标记（保头时用） */
const CUT_TAIL_MARK = '……（已按上下文预算截断）';
/** 截断后追加在头部的标记（保尾时用：结构说明在尾部，砍尾等于砍掉格式要求） */
const CUT_HEAD_MARK = '……（前文已按上下文预算截断）';
// i18n-ignore-end

/** 连全局设置都拿不到时的兜底上下文（与 settings 的默认值同源：8192） */
export const DEFAULT_CONTEXT_WINDOW = 8192;

/**
 * 取模型的上下文窗口：模型设置里填了就用它，没填回退全局默认。
 * 这是用户唯一需要（也应该）设置的模型参数。
 */
export function resolveContextWindow(
  profile: { contextWindow?: number | null } | null | undefined,
  fallback: number
): number {
  const v = profile?.contextWindow;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : DEFAULT_CONTEXT_WINDOW;
}

/** 量一次请求的输入 token（含每条消息的格式开销） */
export function measureInputTokens(messages: ChatMessage[]): Promise<number> {
  return countMessageTokens(messages);
}

/** 输出预算 = 上下文 − 预留 − 输入；装不下时按下限给（调用方应先压缩输入） */
export async function computeOutputBudget(
  messages: ChatMessage[],
  contextWindow: number,
  reserved: number
): Promise<number> {
  const input = await measureInputTokens(messages);
  return Math.max(MIN_OUTPUT_TOKENS, contextWindow - reserved - input);
}

/** 把一段文本截断到 token 预算内（保头，尾部加省略标记） */
export async function truncateToTokenBudget(text: string, budget: number): Promise<string> {
  if (budget <= 0) return '';
  const { encode, decode } = await import('gpt-tokenizer');
  const tokens = encode(text);
  if (tokens.length <= budget) return text;
  return `${decode(tokens.slice(0, Math.max(1, budget)))}${CUT_TAIL_MARK}`;
}

/** 截断时保住尾部（生成类提示词的 JSON 结构说明在尾部，砍尾等于砍掉格式要求） */
async function truncateKeepingTail(text: string, budget: number): Promise<string> {
  if (budget <= 0) return '';
  const { encode, decode } = await import('gpt-tokenizer');
  const tokens = encode(text);
  if (tokens.length <= budget) return text;
  return `${CUT_HEAD_MARK}${decode(tokens.slice(-Math.max(1, budget)))}`;
}

export interface PreparedPrompt {
  messages: ChatMessage[];
  /** 本次请求的输出预算（= 上下文 − 预留 − 输入实测） */
  maxTokens: number;
  /** 是否做过压缩（截断源文本 / 丢历史 / 截断长消息） */
  compressed: boolean;
}

/**
 * 生成类调用的统一准备：构建消息 → 量输入 → 装不下就压缩 → 算输出预算。
 *
 * @param build 用源文本构建消息的函数；源文本为空时构建"无源文本"版本
 * @param source 会被塞进提示词的大块文本（小说素材、已有条目摘要等），可为空
 * @param contextWindow 模型最大上下文（唯一旋钮）
 * @param reserved 为模型回复预留的 token（全局设置）
 */
export async function prepareGenerationPrompt(
  build: (source: string | undefined) => ChatMessage[],
  source: string | undefined,
  contextWindow: number,
  reserved: number
): Promise<PreparedPrompt> {
  const budget = contextWindow - reserved;
  let messages = build(source);
  let input = await measureInputTokens(messages);
  let compressed = false;

  // 1. 先截断大块源文本：它是唯一"可牺牲"的内容
  if (input + MIN_OUTPUT_TOKENS > budget && source) {
    const over = input + MIN_OUTPUT_TOKENS - budget;
    const sourceTokens = await countTokens(source);
    const shrunk = await truncateToTokenBudget(source, Math.max(200, sourceTokens - over));
    messages = build(shrunk);
    input = await measureInputTokens(messages);
    compressed = true;
  }

  // 2. 没有源文本可截（或截完仍超）：从最早的非首尾消息开始丢
  while (input + MIN_OUTPUT_TOKENS > budget && messages.length > 2) {
    const idx = messages.findIndex((_, i) => i > 0 && i < messages.length - 1);
    if (idx < 0) break;
    messages = messages.filter((_, i) => i !== idx);
    input = await measureInputTokens(messages);
    compressed = true;
  }

  // 3. 兜底：单条消息本身就超——截断最长那条，保住尾部（结构说明在尾部）
  if (input + MIN_OUTPUT_TOKENS > budget && messages.length > 0) {
    const room = Math.max(0, budget - MIN_OUTPUT_TOKENS);
    let longest = 0;
    let longestTokens = 0;
    for (let i = 0; i < messages.length; i++) {
      const n = await countTokens(messages[i]!.content);
      if (n > longestTokens) {
        longestTokens = n;
        longest = i;
      }
    }
    const others = input - longestTokens;
    const keep = room - others;
    if (keep > 0 && keep < longestTokens) {
      const cut = await truncateKeepingTail(messages[longest]!.content, keep);
      messages = messages.map((m, i) => (i === longest ? { ...m, content: cut } : m));
      input = await measureInputTokens(messages);
      compressed = true;
    }
  }

  return { messages, maxTokens: Math.max(MIN_OUTPUT_TOKENS, budget - input), compressed };
}
