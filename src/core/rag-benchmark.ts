/**
 * 嵌入模型自动择优 — 内置评测集 + 跑分
 *
 * 设计文档: docs/rag-enhancement-design.md §5
 *
 * 用法:
 * - 用户在设置页点击「自动择优」→ runEmbeddingBenchmark()
 * - 对已装嵌入模型(mock 除外)跑 recall@3 + 耗时,自动选中最佳并持久化
 * - selectVectorModel() 读取择优记录作为最高优先级
 *
 * 运行方式:仅用户手动触发,不后台占用算力。
 */
// i18n-ignore-start  // 评测集为语言数据/内部文案, 非 UI 文案(待翻译)
import type { EmbeddingProvider, EmbeddingVector } from './embedding';
import { VectorStore } from './embedding';
import type { VectorModelId } from './vector-model-manager';
import { createModelFileAdapter } from './model-file-adapter';
import { UserModelFileAdapter } from './user-model-bridge';
import { OnnxEmbeddingProvider } from './onnx-embedding-provider';
import { isUserVectorModelId, findOnnxFile } from './vector-model-install';
import { loadUserModelMeta } from './vector-model-storage';

const BEST_KEY = 'aijiuguan.bestEmbeddingModel';

export interface EmbeddingBenchmarkCase {
  id: string;
  channel: 'dynamic' | 'static';
  query: string;
  /** 期望命中条目 id 列表(全部命中才算过) */
  expected: string[];
  /** 需命中条数(S4=2 因 expected 有两条;其余=1) */
  expectedCount: number;
}

export interface RAGBenchmarkSet {
  dynamicKb: Array<{ id: string; text: string; channel: 'dynamic'; meta: Record<string, string> }>;
  staticKb: Array<{ id: string; text: string; channel: 'static'; meta: Record<string, string> }>;
  cases: EmbeddingBenchmarkCase[];
}

export interface BenchmarkResult {
  modelId: string;
  /** 命中 case 数 */
  passed: number;
  /** recall = passed / 总 case 数 */
  recall: number;
  /** 总耗时(ms) */
  latencyMs: number;
  /** 失败原因(可选;含 error 不计入择优) */
  error?: string;
}

export interface BenchmarkOutcome {
  results: BenchmarkResult[];
  best?: BenchmarkResult;
}

/** 内置评测集(设计 §5.2):6 动态 + 8 静态 = 14 组 */
export function buildRagBenchmarkSet(): RAGBenchmarkSet {
  const dynamicKb: RAGBenchmarkSet['dynamicKb'] = [
    { id: 'memory-king', text: '国王住在南境都城的高塔上', channel: 'dynamic', meta: { scope: 'memory' } },
    { id: 'memory-queen-promise', text: '王后答应资助冒险队一千金币', channel: 'dynamic', meta: { scope: 'memory' } },
    { id: 'memory-wound', text: '主角左臂被狼咬伤，仍在渗血', channel: 'dynamic', meta: { scope: 'memory' } },
    { id: 'memory-progress', text: '队伍已抵达幽暗森林边缘', channel: 'dynamic', meta: { scope: 'memory' } },
    { id: 'memory-follower', text: '灰袍的盗贼一直尾随队伍', channel: 'dynamic', meta: { scope: 'memory' } },
    { id: 'memory-blacksmith-intent', text: '老铁匠打算锻造一把魔剑', channel: 'dynamic', meta: { scope: 'memory' } },
  ];
  const staticKb: RAGBenchmarkSet['staticKb'] = [
    { id: 'elems', text: '大陆的魔法元素分为火、水、风、土、光、暗六系', channel: 'static', meta: { scope: 'world' } },
    { id: 'fire', text: '火元素象征毁灭与激情，源自火山地脉，可驱动锻造与烈焰魔法', channel: 'static', meta: { scope: 'world' } },
    { id: 'water', text: '水元素象征流动与治愈，自深洋涌泉凝聚，可驱动治疗与冰霜魔法', channel: 'static', meta: { scope: 'world' } },
    { id: 'wind', text: '风元素象征自由与迅捷，随群山气流奔涌，可驱动飞行与疾风魔法', channel: 'static', meta: { scope: 'world' } },
    { id: 'earth', text: '土元素象征厚重与坚韧，自岩层矿脉沉淀，可驱动防御与驭石魔法', channel: 'static', meta: { scope: 'world' } },
    { id: 'light', text: '光元素象征净化与希望，自天穹晨曦凝聚，可驱动治愈与圣光魔法', channel: 'static', meta: { scope: 'world' } },
    { id: 'dark', text: '暗元素象征隐秘与侵蚀，自永夜影渊滋生，可驱动隐匿与暗影魔法', channel: 'static', meta: { scope: 'world' } },
    { id: 'blacksmith', text: '铁匠铺可锻造武器、护甲、法器', channel: 'static', meta: { scope: 'world' } },
    { id: 'ancientgod', text: '古神教信奉创世的灰烬之主', channel: 'static', meta: { scope: 'world' } },
    { id: 'forbidden', text: '禁书阁封存《灰烬之典》残卷', channel: 'static', meta: { scope: 'world' } },
  ];
  const cases: EmbeddingBenchmarkCase[] = [
    // 动态层(记忆/情绪):6 组
    { id: 'D1', channel: 'dynamic', query: '国王住在哪里', expected: ['memory-king'], expectedCount: 1 },
    { id: 'D2', channel: 'dynamic', query: '刚才王后答应了什么', expected: ['memory-queen-promise'], expectedCount: 1 },
    { id: 'D3', channel: 'dynamic', query: '主角受了什么伤', expected: ['memory-wound'], expectedCount: 1 },
    { id: 'D4', channel: 'dynamic', query: '现在队伍赶到哪里了', expected: ['memory-progress'], expectedCount: 1 },
    { id: 'D5', channel: 'dynamic', query: '谁一路跟随我们', expected: ['memory-follower'], expectedCount: 1 },
    { id: 'D6', channel: 'dynamic', query: '老铁匠的打算是什么', expected: ['memory-blacksmith-intent'], expectedCount: 1 },
    // 静态层(世界观/设定):8 组
    { id: 'S1', channel: 'static', query: '这片大陆存在哪些魔法元素', expected: ['elems'], expectedCount: 1 },
    { id: 'S2', channel: 'static', query: '这个世界的元素力量有哪些', expected: ['elems'], expectedCount: 1 },
    { id: 'S3', channel: 'static', query: '魔法的基本构成是什么', expected: ['elems'], expectedCount: 1 },
    { id: 'S4', channel: 'static', query: '火系和光系分别对应哪些元素', expected: ['fire', 'light'], expectedCount: 2 },
    { id: 'S5', channel: 'static', query: '铁匠铺能打造什么装备', expected: ['blacksmith'], expectedCount: 1 },
    { id: 'S6', channel: 'static', query: '古神信仰的教义', expected: ['ancientgod'], expectedCount: 1 },
    { id: 'S7', channel: 'static', query: '禁书阁藏着哪本书', expected: ['forbidden'], expectedCount: 1 },
    { id: 'S8', channel: 'static', query: '要找到那本神秘残卷得去哪', expected: ['forbidden'], expectedCount: 1 },
  ];
  return { dynamicKb, staticKb, cases };
}

/** 读取最佳模型 id(无则 null) */
export function getBestEmbeddingModel(): string | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

/** 持久化最佳模型与跑分指标 */
export function setBestEmbeddingModel(id: string, recall: number, latencyMs: number): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ id, recall, latencyMs, timestamp: Date.now() }));
  } catch {
    /* 环境无 localStorage:静默 */
  }
}

/** 清除择优结果,恢复平台默认 */
export function clearBestEmbeddingModel(): void {
  try {
    localStorage.removeItem(BEST_KEY);
  } catch {
    /* 静默 */
  }
}

export interface BenchmarkRunnerOptions {
  /** 已装模型 id 列表(默认:预置 + 用户自定义) */
  listInstalled?: () => Promise<string[]>;
  /** provider 工厂(默认:本地 ONNX;测试注入 mock) */
  factory?: (modelId: string) => Promise<EmbeddingProvider>;
  /** 检索条数(默认 3,recall@3) */
  topK?: number;
}

/** 默认:枚举预置 + 用户自定义已装模型 */
async function defaultListInstalled(): Promise<string[]> {
  const ids = new Set<string>();
  try {
    for (const id of await createModelFileAdapter().listInstalled()) ids.add(id);
  } catch {
    /* 忽略 */
  }
  try {
    for (const id of await new UserModelFileAdapter().listInstalled()) ids.add(id);
  } catch {
    /* 忽略 */
  }
  return [...ids];
}

/** 默认:本地 ONNX provider(与 dual-channel-runtime 相同的适配器/onnxFile 解析) */
async function defaultProviderFactory(modelId: string): Promise<EmbeddingProvider> {
  if (isUserVectorModelId(modelId)) {
    // 自定义模型:桥接 IndexedDB + 按元数据推 onnx 文件名
    let onnxFile: string | undefined;
    try {
      const meta = await loadUserModelMeta();
      const m = meta.find((x) => x.id === modelId);
      if (m?.files) onnxFile = findOnnxFile(m.files);
    } catch {
      /* 无元数据 */
    }
    return new OnnxEmbeddingProvider({
      modelId: modelId as VectorModelId,
      adapter: new UserModelFileAdapter(),
      onnxFile,
    });
  }
  return new OnnxEmbeddingProvider({
    modelId: modelId as VectorModelId,
    adapter: createModelFileAdapter(),
  });
}

/**
 * 自动择优:对已装模型跑 recall@3 + 耗时,选中最佳并持久化。
 * 失败模型跳过(带 error),不影响整体;无可用模型则返回空结果。
 */
export async function runEmbeddingBenchmark(opts: BenchmarkRunnerOptions = {}): Promise<BenchmarkOutcome> {
  const set = buildRagBenchmarkSet();
  const list = opts.listInstalled ?? defaultListInstalled;
  const factory = opts.factory ?? defaultProviderFactory;
  const topK = opts.topK ?? 3;
  const ids = await list();

  const results: BenchmarkResult[] = [];
  for (const modelId of ids) {
    let provider: EmbeddingProvider;
    try {
      provider = await factory(modelId);
    } catch (err) {
      results.push({ modelId, passed: 0, recall: 0, latencyMs: 0, error: errToString(err) });
      continue;
    }
    const t0 = performance.now();
    try {
      const dyn = new VectorStore();
      const sta = new VectorStore();
      for (const k of set.dynamicKb) {
        dyn.add({ ...k, vector: await provider.embed(k.text) });
      }
      for (const k of set.staticKb) {
        sta.add({ ...k, vector: await provider.embed(k.text) });
      }
      let passed = 0;
      for (const c of set.cases) {
        const store = c.channel === 'dynamic' ? dyn : sta;
        const qv: EmbeddingVector = await provider.embed(c.query);
        const hits = store.query(qv, topK).map((h) => h.entry);
        const hitIds = new Set(hits.map((h) => h.id));
        const found = c.expected.filter((id) => hitIds.has(id)).length;
        if (found >= c.expectedCount) passed++;
      }
      const latencyMs = performance.now() - t0;
      results.push({ modelId, passed, recall: passed / set.cases.length, latencyMs });
    } catch (err) {
      results.push({ modelId, passed: 0, recall: 0, latencyMs: 0, error: errToString(err) });
    }
  }

  const valid = results.filter((r) => !r.error);
  let best: BenchmarkResult | undefined;
  if (valid.length > 0) {
    // recall 降序;并列取耗时短
    best = [...valid].sort((a, b) => b.recall - a.recall || a.latencyMs - b.latencyMs)[0];
    if (best) setBestEmbeddingModel(best.modelId, best.recall, best.latencyMs);
  }
  return { results, best };
}

function errToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
// i18n-ignore-end