/**
 * 双通道向量检索 (双通道 RAG)
 *
 * 设计(依据可行性与影响评估):
 * - EmbeddingProvider:抽象向量化接口,支持三种实现
 *   (GatewayEmbeddingProvider:远端 /v1/embeddings;ONNXEmbeddingProvider:
 *   onnxruntime-web 浏览器本地,后续接入;MockEmbeddingProvider:测试/演示)
 * - VectorStore:余弦相似度 Top-k 检索 + 元数据,可持久化(调用方接 storage)
 * - DualChannelRetriever:双通道编排
 *   · 动态通道:每轮用户输入 → 嵌入 → 记忆/情绪库 Top-k(小模型,gte 类)
 *   · 静态通道:按需触发(话题切换/设定引用检测)→ 嵌入查询世界书/角色设定
 *     (大模型,bge 类,惰性加载用后释放)
 * - 关键契约:检索结果注入 prompt 的【动态段】(user turn 末尾),绝不触碰
 *   standing 前缀 → 与 DeepSeek-Reasonix 的 append-only 契约一致,保证前缀缓存命中
 */

import { t } from '@/i18n';

// ── 向量与存储 ──

export interface EmbeddingVector {
  /** 维度(cosine 要求同维) */
  dim: number;
  values: number[];
}

export interface VectorEntry {
  id: string;
  vector: EmbeddingVector;
  /** 原文/引用文本 */
  text: string;
  /** 来源元数据(scope=document/lorebook/memory/emotion 等) */
  meta: Record<string, string>;
  /** 指纹(可选,用于去重) */
  fingerprint?: string;
}

/** 余弦相似度(两向量,越接近 1 越相似) */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.dim !== b.dim || a.dim === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.dim; i++) {
    const av = a.values[i]!;
    const bv = b.values[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 向量存储(内存实现;持久化由调用方接 IndexedDB/Rust fs) */
export class VectorStore {
  private entries = new Map<string, VectorEntry>();

  add(entry: VectorEntry): void {
    this.entries.set(entry.id, entry);
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  get(id: string): VectorEntry | undefined {
    return this.entries.get(id);
  }

  /** 查询 Top-k(余弦降序);返回条目+分数 */
  query(vector: EmbeddingVector, k = 3): Array<{ entry: VectorEntry; score: number }> {
    const scored: Array<{ entry: VectorEntry; score: number }> = [];
    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(vector, entry.vector);
      if (score > 0) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  /** 全量导出(持久化用) */
  exportAll(): Array<VectorEntry> {
    return [...this.entries.values()];
  }

  /** 从导出数据恢复 */
  importAll(items: Array<VectorEntry>): void {
    for (const item of items) this.entries.set(item.id, item);
  }
}

// ── Provider ──

/** 向量化提供者抽象 */
export interface EmbeddingProvider {
  readonly name: string;
  /** 输出维度(各 provider 固定) */
  readonly dim: number;
  /** 文本 → 向量 */
  embed(text: string): Promise<EmbeddingVector>;
  /** 批量嵌入(动态层每轮多个片段时减少往返) */
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}

/** 远端 OpenAI 兼容 /v1/embeddings(网关可用时;未配凭证会抛错) */
export class GatewayEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gateway';

  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      model: string;
      defaultDim?: number;
    }
  ) {}

  get dim(): number {
    return this.config.defaultDim ?? 1024;
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const res = await fetch(this.config.baseUrl.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model: this.config.model, input: text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(t('core.embedFailed', { status: res.status, body: body.slice(0, 200) }));
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    const values = data.data?.[0]?.embedding;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(t('core.embedMissingData'));
    }
    return { dim: values.length, values };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const res = await fetch(this.config.baseUrl.replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model: this.config.model, input: texts }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(t('core.batchEmbedFailed', { status: res.status, body: body.slice(0, 200) }));
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    return (data.data ?? []).map((d) => ({ dim: d.embedding.length, values: d.embedding }));
  }
}

/**
 * 确定性 mock provider(测试/演示:字符 n-gram 哈希 → 归一化向量;
 * 语义相似的文本得到相近向量,可用于离线开发)
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly dim = 64;

  async embed(text: string): Promise<EmbeddingVector> {
    const values = new Array<number>(this.dim).fill(0);
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) {
      const code = chars[i]!.charCodeAt(0);
      // 字符码哈希到两个相邻桶,带位置加权
      const idx = code % this.dim;
      values[idx]! += 1 + (i % 3) * 0.1;
      values[(idx + 1) % this.dim]! += 0.3;
    }
    // L2 归一化
    let norm = 0;
    for (const v of values) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return { dim: this.dim, values: values.map((v) => v / norm) };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const out: EmbeddingVector[] = [];
    for (const t of texts) out.push(await this.embed(t));
    return out;
  }
}

// ── 双通道检索器 ──

export interface RetrieverContext {
  /** 当前用户输入 */
  query: string;
  /** 最近消息(动态层排序依据之一) */
  recentMessages?: string[];
}

/** 双通道检索配置 */
export interface DualChannelConfig {
  /** 动态层每轮检索条数 */
  dynamicTopK: number;
  /** 静态层按需检索条数 */
  staticTopK: number;
}

export const DEFAULT_DUAL_CHANNEL: DualChannelConfig = { dynamicTopK: 3, staticTopK: 3 };

export interface RetrievalHit {
  entry: VectorEntry;
  score: number;
  /** 来源通道 */
  channel: 'dynamic' | 'static';
}

/**
 * 双通道检索器
 * - 动态通道:每轮对 recentMessages+query 嵌入,查动态库(记忆/情绪)
 * - 静态通道:由 shouldTriggerStatic 判定(话题切换/设定引用),嵌入 query 查静态库(世界观/设定)
 * - 注入契约:结果只供调用方注入动态段,不进入 standing 前缀
 */
export class DualChannelRetriever {
  readonly dynamicStore = new VectorStore();
  readonly staticStore = new VectorStore();

  constructor(
    private readonly provider: EmbeddingProvider,
    private readonly config: DualChannelConfig = DEFAULT_DUAL_CHANNEL,
    /** 静态层触发判定(话题切换/设定引用检测);默认每轮都尝试静态 */
    private readonly shouldTriggerStatic: (
      ctx: RetrieverContext
    ) => boolean | Promise<boolean> = () => true
  ) {}

  /** 执行检索;返回两通道命中(dynamic 在前,按分数降序) */
  async retrieve(ctx: RetrieverContext): Promise<RetrievalHit[]> {
    const hits: RetrievalHit[] = [];
    const queryEmbedding = await this.provider.embed(ctx.query);

    // 动态通道:每轮触发,查动态库(记忆/情绪)
    const dynamicHits = this.dynamicStore.query(queryEmbedding, this.config.dynamicTopK);
    for (const h of dynamicHits) hits.push({ ...h, channel: 'dynamic' });

    // 静态通道:按需触发
    if (await this.shouldTriggerStatic(ctx)) {
      const staticHits = this.staticStore.query(queryEmbedding, this.config.staticTopK);
      for (const h of staticHits) hits.push({ ...h, channel: 'static' });
    }

    return hits;
  }

  /** 向动态库写入(记忆/情绪事实向量化) */
  async addDynamic(entry: Omit<VectorEntry, 'vector'> & { text: string }): Promise<void> {
    const vector = await this.provider.embed(entry.text);
    this.dynamicStore.add({ ...entry, vector });
  }

  /** 向静态库写入(世界书/角色设定向量化) */
  async addStatic(entry: Omit<VectorEntry, 'vector'> & { text: string }): Promise<void> {
    const vector = await this.provider.embed(entry.text);
    this.staticStore.add({ ...entry, vector });
  }
}