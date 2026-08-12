/**
 * L1 内容压缩层 (E-03)
 *
 * 依据《AI酒馆项目嵌入优化方案开发文档.md》L1 设计,落地为纯 TS 模块:
 * - ExtractiveCompressor:提取式压缩(TextCrusher 思路)——句切分 → 新颖度/相关性/
 *   显著性打分 → 按序重组(保留原句,确定性)
 * - SemanticValidator:语义校验(实体/情绪词保留率 ≥0.9,关键实体 1.0)
 * - CcrStore:Compress-Cache-Retrieve 无损端到端(哈希键暂存原文,滑动 TTL)
 * - CompressionPipeline:触发条件(上下文占用 + 冷却)+ 豁免黑名单(standing 不压缩)
 * - 三级回退:校验不过 → 静默回退原文;连续失败 → 暂停;配置关闭 → 全关
 *
 * 设计:纯函数 + 确定性,无 LLM 依赖(LLM 摘要为可选吸收路径,temperature=0 一次生成)
 */

import { extractKeywords } from './rag-retriever';

// ── 句切分 ──

/** 中英文句切分(。！？!?…\n 为边界,保留分隔符) */
export function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[。！？!?…])|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts;
}

// ── 提取式压缩器 ──

export interface CompressOptions {
  /** 目标压缩比(0-1),如 0.6=保留 60% 内容 */
  targetRatio: number;
  /** 设定实体列表(显著性加分 + 校验) */
  entities?: string[];
  /** 关键实体(必须 100% 保留) */
  criticalEntities?: string[];
  /** 上下文文本(相关性打分依据,如最近消息/当前提问) */
  context?: string;
  /** 是否启用去重(默认 true) */
  dedupe?: boolean;
}

export interface CompressResult {
  /** 压缩后的文本(按原句顺序) */
  text: string;
  /** 被移除的句子(按原顺序) */
  removed: string[];
  /** 原句数 → 保留句数 */
  keptCount: number;
  totalCount: number;
}

/** n-gram 集合(默认 3-gram,中文字符级) */
function ngrams(s: string, n = 3): Set<string> {
  const out = new Set<string>();
  const chars = s.replace(/\s/g, '');
  if (chars.length <= n) {
    out.add(chars);
    return out;
  }
  for (let i = 0; i <= chars.length - n; i++) {
    out.add(chars.slice(i, i + n));
  }
  return out;
}

/**
 * 提取式压缩:打分 → 贪婪选取 → 按原序重组
 * 打分规则:
 * - 相关性:句子命中查询关键词数(关键词来自 context)
 * - 新颖度:句子 3-gram 与已选句重叠越少分越高(信息增量)
 * - 显著性:命中设定实体 +;句长过短/过长降权
 */
export function extractiveCompress(text: string, options: CompressOptions): CompressResult {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) {
    return { text, removed: [], keptCount: sentences.length, totalCount: sentences.length };
  }

  const keywords = options.context ? extractKeywords([options.context], 20) : [];
  const entitySet = new Set(options.entities ?? []);
  const targetKept = Math.max(1, Math.round(sentences.length * options.targetRatio));

  // 打分
  const scored = sentences.map((s, i) => {
    const grams = ngrams(s);
    const relevance = keywords.reduce((sum, k) => (s.includes(k) ? sum + 1 : sum), 0);
    const salience = entitySet.size > 0
      ? Array.from(entitySet).reduce((sum, e) => (s.includes(e) ? sum + 1 : sum), 0)
      : 0;
    const lenScore = s.length >= 8 && s.length <= 80 ? 1 : 0.5;
    const sig = relevance * 2 + salience * 3 + lenScore;
    return { i, text: s, sig, grams };
  });

  // 贪婪选择:优先高 sig,惩罚与已选句重叠(新颖度)
  const selected: typeof scored = [];
  const pool = [...scored].sort((a, b) => b.sig - a.sig);
  for (const cand of pool) {
    if (selected.length >= targetKept) break;
    if (options.dedupe !== false) {
      const overlap = selected.reduce((max, s) => {
        let cnt = 0;
        for (const g of cand.grams) if (s.grams.has(g)) cnt++;
        return Math.max(max, cnt);
      }, 0);
      const dupRatio = cand.grams.size > 0 ? overlap / cand.grams.size : 0;
      if (dupRatio > 0.6) continue; // 与已选句高度重复,视为冗余
    }
    selected.push(cand);
  }

  // 兜底:若贪婪未选够,补选高 sig 句(同样应用去重)
  while (selected.length < targetKept && pool.length > 0) {
    const next = pool.shift()!;
    if (selected.includes(next)) continue;
    if (options.dedupe !== false) {
      const overlap = selected.reduce((max, s) => {
        let cnt = 0;
        for (const g of next.grams) if (s.grams.has(g)) cnt++;
        return Math.max(max, cnt);
      }, 0);
      const dupRatio = next.grams.size > 0 ? overlap / next.grams.size : 0;
      if (dupRatio > 0.6) continue;
    }
    selected.push(next);
  }

  const selectedSet = new Set(selected.map((s) => s.i));
  return {
    text: sentences.filter((_, i) => selectedSet.has(i)).join(''),
    removed: sentences.filter((_, i) => !selectedSet.has(i)),
    keptCount: selected.length,
    totalCount: sentences.length,
  };
}

// ── 语义校验 ──

export interface ValidationInput {
  original: string;
  compressed: string;
  /** 设定实体列表 */
  entities?: string[];
  /** 关键实体(必须全保留) */
  criticalEntities?: string[];
  /** 情绪词列表 */
  emotionWords?: string[];
}

export interface Validation {
  pass: boolean;
  /** 实体保留率 */
  entityRate: number;
  /** 情绪词保留率 */
  emotionRate: number;
  /** 缺失的关键实体 */
  missingCritical: string[];
}

/**
 * 语义校验:min(实体保留率, 情绪词保留率) ≥ 0.9 且关键实体保留率 = 1.0
 * 用于压缩前后的 fail-open 判断(不达标回退原文)
 */
export function validateCompression(input: ValidationInput): Validation {
  const count = (list: string[], haystack: string): number =>
    list.reduce((sum, w) => (haystack.includes(w) ? sum + 1 : sum), 0);

  const entities = input.entities ?? [];
  const emotionWords = input.emotionWords ?? [];
  const entityRate = entities.length > 0
    ? count(entities, input.compressed) / entities.length
    : 1;
  const emotionRate = emotionWords.length > 0
    ? count(emotionWords, input.compressed) / emotionWords.length
    : 1;
  const missingCritical = (input.criticalEntities ?? []).filter((e) => !input.compressed.includes(e));

  const pass =
    Math.min(entityRate, emotionRate) >= 0.9 && missingCritical.length === 0;

  return {
    pass,
    entityRate: round2(entityRate),
    emotionRate: round2(emotionRate),
    missingCritical,
  };
}

// ── CCR 无损端到端 ──

/**
 * Compress-Cache-Retrieve:以哈希键暂存压缩前的原文,
 * 后续按需无损取回(有损在线、无损端到端)
 */
export class CcrStore {
  private entries = new Map<string, { payload: string; expiresAt: number }>();

  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}

  /** 暂存原文(键自定,如内容 sha256 前缀) */
  put(hash: string, payload: string): void {
    this.entries.set(hash, { payload, expiresAt: Date.now() + this.ttlMs });
  }

  /** 取回原文;命中刷新 TTL(滑动),过期即删除 */
  get(hash: string): string | null {
    const entry = this.entries.get(hash);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(hash);
      return null;
    }
    entry.expiresAt = Date.now() + this.ttlMs; // 滑动刷新
    return entry.payload;
  }

  /** 清理过期条目,返回清除数 */
  purgeExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** 当前条目数 */
  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

// ── 压缩管线(触发 + 回退) ──

export interface PipelineContext {
  /** 当前上下文占用 token 数 */
  contextUsed: number;
  /** 上下文上限 token 数 */
  contextLimit: number;
  /** 距上次压缩的轮数(冷却) */
  roundsSinceLastCompress: number;
  /** 连续校验失败次数(二级回退:暂停) */
  consecutiveFailures: number;
  /** 豁免对象列表(standing 事实等永不压缩) */
  exemptTexts?: string[];
}

/** 管线决策 */
export interface PipelineDecision {
  shouldCompress: boolean;
  reason: 'soft-threshold' | 'hard-threshold' | 'cooldown' | 'paused' | 'disabled' | string;
}

/** 触发阈值(与嵌入优化方案一致:soft 70% / hard 80%,冷却 ≥N 轮) */
export const SOFT_THRESHOLD = 0.7;
export const HARD_THRESHOLD = 0.8;
export const COOLDOWN_ROUNDS = 3;
export const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 判断本轮是否应压缩(fail-open 三级回退的触发层)
 * - enabled=false → 全关(三级强控)
 * - 连续失败 ≥3 → 暂停(二级)
 * - 占用 <70% 或冷却中 → 不压缩
 * - 占用 ≥80% → 硬性压缩(接受一次 miss)
 */
export function decideCompression(ctx: PipelineContext, enabled = true): PipelineDecision {
  if (!enabled) return { shouldCompress: false, reason: 'disabled' };
  if (ctx.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return { shouldCompress: false, reason: 'paused' };
  }
  if (ctx.roundsSinceLastCompress < COOLDOWN_ROUNDS) {
    return { shouldCompress: false, reason: 'cooldown' };
  }
  const ratio = ctx.contextUsed / ctx.contextLimit;
  if (ratio >= HARD_THRESHOLD) return { shouldCompress: true, reason: 'hard-threshold' };
  if (ratio >= SOFT_THRESHOLD) return { shouldCompress: true, reason: 'soft-threshold' };
  return { shouldCompress: false, reason: 'below-threshold' };
}

/** 豁免检查:命中黑名单(standing 等)的对象不压缩 */
export function isExempt(text: string, exemptTexts: string[]): boolean {
  return exemptTexts.some((e) => e.length > 0 && (text.includes(e) || e.includes(text)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}