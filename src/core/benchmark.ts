/**
 * 性能基准 (T-10)
 *
 * 在浏览器内运行可重复的微基准,验证性能预算:
 * - RAG 召回耗时:软预算 100ms / 硬预算 500ms(与嵌入优化方案指标一致)
 * - 长对话窗口计算:10k/50k 消息的 visibleMessages 窗口裁剪耗时
 * - Token 计数:100 条消息的 token 统计耗时
 *
 * 结果含 pass/fail 预算断言,可本地重复运行;历史存 localStorage。
 * 说明:推理速度对比(本地 vs 云端)依赖真实模型,由 LocalModelView 指标页覆盖,不在本模块。
 */

import { retrieveRelevantChunks } from './rag-retriever';
import type { DataBankDocument } from './data-bank';
import { countTokens } from './token-counter';

/** 单项基准结果 */
export interface BenchmarkResult {
  /** 基准名 */
  name: string;
  /** 耗时(ms) */
  durationMs: number;
  /** 是否通过预算 */
  pass: boolean;
  /** 预算(ms),undefined=无硬预算 */
  budgetMs?: number;
  /** 补充信息(样本量等) */
  detail: string;
  /** 运行时间 */
  ts: string;
}

/** localStorage 存储键 */
const STORAGE_KEY = 'ai-roleplay:benchmark-history';

/** 历史保留条数 */
const MAX_HISTORY = 20;

/** 计时辅助:返回 [耗时ms, 结果] */
async function timed<T>(fn: () => T | Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

/** 构造基准用 RAG 文档集(100 文档 × 20 chunk,中文段落) */
function buildBenchmarkDocuments(docCount = 100, chunkPerDoc = 20): DataBankDocument[] {
  const paragraph =
    '翡翠森林的精灵们在月圆之夜举行祭典,古老的魔法阵在树冠间亮起,守护着这片土地的平衡。';
  const docs: DataBankDocument[] = [];
  for (let d = 0; d < docCount; d++) {
    const docId = `bench-doc-${d}`;
    docs.push({
      id: docId,
      name: `基准文档${d}`,
      scope: 'global',
      fileSize: paragraph.length * chunkPerDoc,
      mimeType: 'text/plain',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      chunks: Array.from({ length: chunkPerDoc }, (_, i) => ({
        id: `${docId}-${i}`,
        documentId: docId,
        index: i,
        content: `${paragraph} 第${d}-${i}段 关键词:精灵 魔法 森林 祭典`,
        tokenCount: 64,
      })),
    });
  }
  return docs;
}

/** RAG 召回基准:固定查询集,测检索耗时 */
export async function runRagBenchmark(): Promise<BenchmarkResult> {
  const docs = buildBenchmarkDocuments();
  const queries = ['精灵 魔法', '森林 祭典', '古老的 守护', '月圆 平衡'];
  const { ms } = await timed(() => {
    for (const q of queries) {
      retrieveRelevantChunks(docs, [q], { maxChunks: 3 });
    }
  });
  return {
    name: 'RAG 召回(100 文档 × 20 段 × 4 查询)',
    durationMs: round(ms),
    pass: ms <= 500, // 硬预算 500ms(软 100ms 仅在真机上可达成,jsdom 亦适用)
    budgetMs: 500,
    detail: `平均 ${round(ms / queries.length)}ms/查询`,
    ts: new Date().toISOString(),
  };
}

/** 长对话窗口计算基准:模拟 ChatMain visibleMessages 的 slice 窗口 */
export async function runScrollWindowBenchmark(): Promise<BenchmarkResult> {
  const counts = [10_000, 50_000];
  const lines: string[] = [];
  const { ms } = await timed(() => {
    for (const count of counts) {
      // 构造 10w 条消息数组(内容复用避免 GC 干扰)
      const arr: string[] = new Array(count).fill('消息内容'.repeat(20));
      // 与 ChatMain.visibleMessages 相同逻辑:取末尾 100 条
      for (let i = 0; i < 100; i++) {
        const _window = arr.slice(arr.length - 100);
        void _window;
      }
      lines.push(`${count} 条 × 100 次窗口`);
    }
  });
  return {
    name: '对话窗口计算(10k/50k × 100 次)',
    durationMs: round(ms),
    pass: ms <= 50,
    budgetMs: 50,
    detail: lines.join(';'),
    ts: new Date().toISOString(),
  };
}

/** Token 计数基准:100 条混合消息 */
export async function runTokenCountBenchmark(): Promise<BenchmarkResult> {
  const messages = Array.from({ length: 100 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `第 ${i} 条消息:翡翠森林的精灵守护者缓缓睁开双眼,凝视着远方。`.repeat(3),
  }));
  const { ms } = await timed(() => {
    for (const m of messages) countTokens(m.content);
  });
  return {
    name: 'Token 计数(100 条消息)',
    durationMs: round(ms),
    pass: true, // 无硬预算,观测项
    detail: `共 ${messages.length} 条`,
    ts: new Date().toISOString(),
  };
}

/** 运行全部基准,返回结果并持久化历史 */
export async function runAllBenchmarks(): Promise<BenchmarkResult[]> {
  const results = await Promise.all([
    runRagBenchmark(),
    runScrollWindowBenchmark(),
    runTokenCountBenchmark(),
  ]);
  saveHistory(results);
  return results;
}

/** 读取基准历史(新→旧) */
export function loadBenchmarkHistory(): BenchmarkResult[][] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BenchmarkResult[][]) : [];
  } catch {
    return [];
  }
}

/** 清空基准历史 */
export function clearBenchmarkHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

function saveHistory(results: BenchmarkResult[]): void {
  try {
    const history = loadBenchmarkHistory();
    history.unshift(results);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* 存储不可用时历史仅内存 */
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}