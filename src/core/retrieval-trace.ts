/**
 * 检索注入痕迹（C-03 记忆可见化）
 *
 * `promptTrace`（世界书）和 `eventTrace`（随机事件）已经把这套纪律立过两遍：
 * **在组装提示词那一刻抓，只留够认出来的信息**。检索分数每次重算、记忆事实会被改写，
 * 事后都回推不出"这条回复当时带了哪几条"，所以必须在现场落一份裁剪视图。
 *
 * 一轮里其实有三路检索，语料互相重叠（都从记忆事实与资料库里取）：
 *   1. 双通道向量检索：动态通道取记忆事实，静态通道取资料库分块与世界书条目；
 *   2. 资料库关键词检索（`data-bank.ts` 的 `retrieveForChat`）；
 *   3. L0 记忆关键词检索（`chat-memory.ts` 的 `searchLocalMemoryContext`）。
 * 三路并列成三个清单，用户看不出差别；所以这里合并成一条，按来源打标签、按同一对象去重。
 *
 * **三路的分不是一把尺**：向量给的是相似度（0..1），资料库给的是命中关键词个数（0,1,2…），
 * L0 给的是"精确整句 ×2 + 命中率"。跨来源比大小没有意义，所以：
 * - 去重只在同一路内部做（同一对象被两种 id 写法命中时留分数更高的）；
 * - 排序只在同一个来源内部按分数降序，来源之间按固定顺序（记忆 → 资料 → 设定）；
 * - 界面上的数字只用于同一来源内横向看，这一点要在文案里说清。
 */
import type { VectorRagSource } from './dual-channel-runtime';

/** 命中的来源，决定标签与排序分组 */
export type RetrievalSource = 'memory' | 'document' | 'lore';

/** 界面上"检索命中"一栏的条目 */
export interface RetrievalTraceItem {
  /** 原始 id（保留来源前缀，便于回查是哪一路命中的） */
  id: string;
  /** 一行人话：来源正文的短裁剪，认不出是哪条就等于没做这个面板 */
  label: string;
  /** 该路检索自己的打分（跨来源不可横向比较） */
  score: number;
  source: RetrievalSource;
}

/** 各路检索交给这里的原始命中：文本由调用方给，裁剪与合并在这里统一做 */
export interface RawRetrievalHit {
  id: string;
  score: number;
  source: RetrievalSource;
  text: string;
}

/** 一次注入最多留几条：再多界面也读不完，且持久化体积要封顶 */
export const RETRIEVAL_TRACE_MAX = 8;

/** 界面标签的固定顺序：记忆 → 资料 → 设定 */
const SOURCE_RANK: Record<RetrievalSource, number> = { memory: 0, document: 1, lore: 2 };

/** label 的正文长度上限（不含省略号） */
const LABEL_MAX_CHARS = 40;

const clipLabel = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '—';
  const chars = [...flat];
  return chars.length > LABEL_MAX_CHARS ? `${chars.slice(0, LABEL_MAX_CHARS).join('')}…` : flat;
};

/** 向量检索那路的 id 前缀 → 来源；认不出的按"资料"算（静态通道的兜底） */
export function sourceOfVectorId(id: string): RetrievalSource {
  if (id.startsWith('memory:')) return 'memory';
  if (id.startsWith('lorebook:') || id.startsWith('world:')) return 'lore';
  return 'document';
}

/**
 * 去重键：把同一路里两种 id 写法归一到"同一个对象"。
 *
 * 必须带来源一起算——资料库关键词那路给的是裸 `chunk.id`（`<docId>-<index>`），
 * 而记忆那路的裸 id 是事实 id，光看字符串会把两者认成同一个东西（踩过）。
 *
 * - 记忆：向量 `memory:<factId>` 与 L0 的 `<factId>` → `fact:<factId>`
 * - 资料：向量 `document:<docId>:<chunkId>` 与资料库的 `<chunkId>` → `chunk:<chunkId>`
 * - 设定：`lorebook:<bookId>:<entryId>` → `entry:<entryId>`；`world:<bookId>:description` → `world:<bookId>`
 */
export function canonicalRetrievalKey(id: string, source: RetrievalSource): string {
  if (source === 'memory') return `fact:${id.startsWith('memory:') ? id.slice('memory:'.length) : id}`;
  if (source === 'document') {
    return `chunk:${id.startsWith('document:') ? id.slice(id.lastIndexOf(':') + 1) : id}`;
  }
  if (id.startsWith('lorebook:')) return `entry:${id.slice(id.lastIndexOf(':') + 1)}`;
  if (id.startsWith('world:')) return `world:${id.slice('world:'.length).replace(/:description$/, '')}`;
  return `lore:${id}`;
}

/**
 * 三路命中 → 一条可持久化、可渲染的清单。
 *
 * 顺序规则：先按来源分组（记忆 → 资料 → 设定），组内按该来源自己的分数降序。
 * 上限对合并后的清单生效，所以"前 8 条"是三条路一共 8 条。
 */
export function mergeRetrievalTrace(hits: ReadonlyArray<RawRetrievalHit> | undefined): RetrievalTraceItem[] {
  if (!hits?.length) return [];
  const kept = new Map<string, { hit: RawRetrievalHit; at: number }>();
  hits.forEach((hit, at) => {
    const key = `${hit.source}|${canonicalRetrievalKey(hit.id, hit.source)}`;
    const prev = kept.get(key);
    // 同一对象被同一路的两种写法命中：留分数更高的那条。跨来源不会撞键——
    // 三路语料重叠的部分（记忆事实、资料库分块）在同一个来源标签下。
    if (!prev || hit.score > prev.hit.score) kept.set(key, { hit, at });
  });
  return [...kept.values()]
    .sort((a, b) => SOURCE_RANK[a.hit.source] - SOURCE_RANK[b.hit.source] || b.hit.score - a.hit.score || a.at - b.at)
    .slice(0, RETRIEVAL_TRACE_MAX)
    .map(({ hit }) => ({
      id: hit.id,
      label: clipLabel(hit.text),
      // 三路精度不同，统一三位小数只为显示稳定，不代表跨来源可比
      score: Math.round(hit.score * 1000) / 1000,
      source: hit.source,
    }));
}

/**
 * 向量那一路的适配：命中里只有 id 和分数，文本要从当轮的来源表里取。
 *
 * 来源表是必须的：光凭 `memory:session-char-17…` 用户读不出任何东西。
 * 找不到对应来源时不猜、不抛，label 落到占位符。
 */
export function toVectorRetrievalHits(
  hits: ReadonlyArray<{ id: string; score: number; channel: 'dynamic' | 'static' }> | undefined,
  sources: ReadonlyArray<VectorRagSource> | undefined
): RawRetrievalHit[] {
  if (!hits?.length) return [];
  const byId = new Map((sources ?? []).map((s) => [s.id, s.text]));
  return hits.map((h) => ({
    id: h.id,
    score: h.score,
    source: h.channel === 'dynamic' ? 'memory' : sourceOfVectorId(h.id),
    text: byId.get(h.id) ?? '',
  }));
}

/**
 * 把三路检索的输出拼成合并视图的输入。
 *
 * 三路的产出形状不同（向量只回 id+分数、资料库回分块对象、L0 回事实对象），
 * 调用方各自摊开写一遍会有两份几乎一样的 12 行代码；这里统一收口，也方便单测。
 * 用结构化类型而不是 import 那些 store 的类型：这一层只关心"有没有 id / 正文 / 分数"。
 */
export function collectRetrievalHits(input: {
  vector?: {
    hits?: ReadonlyArray<{ id: string; score: number; channel: 'dynamic' | 'static' }>;
    sources?: ReadonlyArray<VectorRagSource>;
  };
  documents?: ReadonlyArray<{
    chunk: { id: string; content: string };
    documentName: string;
    score: number;
  }>;
  memories?: ReadonlyArray<{ fact: { id: string; body: string }; score: number }>;
}): RawRetrievalHit[] {
  const out: RawRetrievalHit[] = [...toVectorRetrievalHits(input.vector?.hits, input.vector?.sources)];
  for (const c of input.documents ?? []) {
    out.push({
      id: c.chunk.id,
      score: c.score,
      source: 'document',
      // 文档名 + 正文开头，才认得出"是哪份资料的哪一段"
      text: `${c.documentName}：${c.chunk.content}`,
    });
  }
  for (const m of input.memories ?? []) {
    out.push({ id: m.fact.id, score: m.score, source: 'memory', text: m.fact.body });
  }
  return out;
}
