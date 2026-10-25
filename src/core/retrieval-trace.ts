/**
 * 检索注入痕迹（C-03 记忆可见化第一步）
 *
 * `promptTrace`（世界书）和 `eventTrace`（随机事件）已经把这套纪律立过两遍：
 * **在组装提示词那一刻抓，只留够认出来的信息**。事件表不落盘、检索分数每次重算，
 * 事后都回推不出"这条回复当时带了哪几条"，所以必须在现场落一份裁剪视图。
 *
 * 与前两者的一处有意偏离：记忆事实和资料库条目没有标题字段，正文前 40 字是唯一
 * 能让人认出"哦是这条"的东西。体积有界（上限 8 条 × 40 字），且这里给的是**注入时
 * 实际用到的那段文本的开头**，不是模型采纳了什么——后者无法从界面证明。
 */
import type { VectorRagSource } from './dual-channel-runtime';

/** 界面上"检索命中"一栏的条目 */
export interface RetrievalTraceItem {
  /** 命中来源的稳定标识（`memory:<factId>` 或资料库/世界书条目 id） */
  id: string;
  /** 一行人话：来源正文的短裁剪，认不出是哪条就等于没做这个面板 */
  label: string;
  /** 相关度，保留三位小数 */
  score: number;
  /** dynamic = 会话记忆这条通道，static = 设定/资料库那条 */
  channel: 'dynamic' | 'static';
}

/** 一次注入最多留几条：再多界面也读不完，且持久化体积要封顶 */
export const RETRIEVAL_TRACE_MAX = 8;

/** label 的正文长度上限（不含省略号） */
const LABEL_MAX_CHARS = 40;

const clipLabel = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '—';
  const chars = [...flat];
  return chars.length > LABEL_MAX_CHARS ? `${chars.slice(0, LABEL_MAX_CHARS).join('')}…` : flat;
};

/**
 * 命中 + 当时的来源表 → 可持久化、可渲染的裁剪视图。
 *
 * 来源表是必须的：`hits` 里只有 id 和分数，光凭 `memory:session-char-17…` 用户读不出
 * 任何东西。找不到对应来源时不猜、不抛，label 落到占位符。
 */
export function toRetrievalTraceItems(
  hits: ReadonlyArray<{ id: string; score: number; channel: 'dynamic' | 'static' }> | undefined,
  sources: ReadonlyArray<VectorRagSource> | undefined
): RetrievalTraceItem[] {
  if (!hits?.length) return [];
  const byId = new Map((sources ?? []).map((s) => [s.id, s.text]));
  return hits.slice(0, RETRIEVAL_TRACE_MAX).map((h) => ({
    id: h.id,
    label: clipLabel(byId.get(h.id) ?? ''),
    score: Math.round(h.score * 1000) / 1000,
    channel: h.channel,
  }));
}
