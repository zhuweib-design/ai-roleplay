/**
 * 双通道向量检索运行时 — 对话链路接线
 *
 * 设计(与 token 节省的契约):
 * - 注入只进 ragContext(动态段/user turn 侧),绝不触碰 standing 前缀 → 保前缀缓存命中
 * - 默认关闭(localStorage `aijiuguan.vectorRagEnabled` = '1' 开启),符合优化管线默认关原则
 * - fail-open:任何异常(模型未装/嵌入失败)返回 '' 不阻断主链路
 * - 动态层:记忆/情绪,时间衰减(旧条目权重降低防语气僵硬)
 * - 静态层:世界设定,关键词门控(lorebook 扫描命中才查,防噪音)
 * - 预算:动态 ≤3 段、静态 ≤3 块
 */
import {
  VectorStore,
  type EmbeddingProvider,
  type VectorEntry,
} from './embedding';
import {
  VectorModelManager,
  selectVectorModel,
  type VectorModelId,
} from './vector-model-manager';
import { OnnxEmbeddingProvider } from './onnx-embedding-provider';
import { createModelFileAdapter } from './model-file-adapter';

const ENABLE_KEY = 'aijiuguan.vectorRagEnabled';

export function isVectorRagEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVectorRagEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLE_KEY, '1');
    else localStorage.removeItem(ENABLE_KEY);
  } catch {
    /* 环境无 localStorage:静默 */
  }
}

/** 时间衰减:1 小时后权重 ~37%,24 小时后 ~2% */
function decay(ageMs: number): number {
  return Math.exp(-ageMs / 3_600_000);
}

export interface VectorRagOptions {
  /** 动态层模型显式选择(默认由 selectVectorModel 决定:浏览器 bge-small) */
  dynamicModel?: VectorModelId;
  /** 静态层模型显式选择 */
  staticModel?: VectorModelId;
  /** 每轮动态检索条数(默认 3) */
  dynamicTopK?: number;
  /** 静态检索条数(默认 3) */
  staticTopK?: number;
  /** 分数阈值(低于不注入;默认 0.3) */
  minScore?: number;
}

/** 双通道检索注入结果 */
export interface VectorRagInjection {
  /** 注入文本(空串 = 未启用/无命中/失败) */
  text: string;
  /** 命中详情(调试/统计) */
  hits: Array<{ id: string; score: number; channel: 'dynamic' | 'static' }>;
  /** 本次是否实际执行了检索(未启用=false) */
  ran: boolean;
}

const EMPTY: VectorRagInjection = { text: '', hits: [], ran: false };

/** 单例运行时:模型管理器(常驻/按需)+ 双库 + 检索 */
export class VectorRagRuntime {
  private static instance: VectorRagRuntime | null = null;

  readonly dynamicStore = new VectorStore();
  readonly staticStore = new VectorStore();
  private readonly manager: VectorModelManager;
  private dynamicProvider: EmbeddingProvider | null = null;
  private staticProvider: EmbeddingProvider | null = null;
  private localOnnxProvider: EmbeddingProvider | null = null;
  private readonly opts: Required<Pick<VectorRagOptions, 'dynamicTopK' | 'staticTopK' | 'minScore'>>;
  private readonly adapter = createModelFileAdapter();

  private constructor(opts: VectorRagOptions) {
    this.opts = {
      dynamicTopK: opts.dynamicTopK ?? 3,
      staticTopK: opts.staticTopK ?? 3,
      minScore: opts.minScore ?? 0.3,
    };
    this.manager = VectorModelManager.defaultFactory();
  }

  /** 重置单例(测试用) */
  static reset(): void {
    VectorRagRuntime.instance = null;
  }

  static get(opts: VectorRagOptions = {}): VectorRagRuntime {
    if (!VectorRagRuntime.instance) {
      VectorRagRuntime.instance = new VectorRagRuntime(opts);
    }
    return VectorRagRuntime.instance;
  }

  /**
   * 解析通道 provider(优先级):
   * 1. 本地已装 ONNX 模型(自动:偏好模型优先,否则第一个已装)
   * 2. 显式选择 → VectorModelManager(远程配置/mock)
   * 3. mock 兜底
   */
  private async resolveProvider(channel: 'dynamic' | 'static', choice?: VectorModelId): Promise<EmbeddingProvider> {
    if (choice) {
      try {
        if (await this.adapter.exists(choice)) {
          return this.getLocalProvider(choice);
        }
      } catch {
        /* 探测失败走 manager */
      }
      return channel === 'dynamic'
        ? this.manager.providerForDynamic(choice)
        : this.manager.providerForStatic(choice);
    }

    // 自动:本地已装模型优先(浏览器自动选 bge-small 等)
    const preferred = selectVectorModel(undefined, channel);
    try {
      const installed = await this.adapter.listInstalled();
      if (installed.includes(preferred)) return this.getLocalProvider(preferred);
      if (installed.length > 0) return this.getLocalProvider(installed[0]);
    } catch {
      /* 无本地模型,走 manager */
    }
    return channel === 'dynamic'
      ? this.manager.providerForDynamic()
      : this.manager.providerForStatic();
  }

  /** 本地 ONNX provider 缓存复用(双通道共享同模型时只加载一次) */
  private getLocalProvider(modelId: VectorModelId): EmbeddingProvider {
    if (!this.localOnnxProvider) {
      this.localOnnxProvider = new OnnxEmbeddingProvider({
        modelId,
        adapter: this.adapter,
      });
    }
    return this.localOnnxProvider;
  }

  private async getDynamicProvider(choice?: VectorModelId): Promise<EmbeddingProvider> {
    if (!this.dynamicProvider) {
      this.dynamicProvider = await this.resolveProvider('dynamic', choice);
    }
    return this.dynamicProvider;
  }

  private async getStaticProvider(choice?: VectorModelId): Promise<EmbeddingProvider> {
    if (!this.staticProvider) {
      this.staticProvider = await this.resolveProvider('static', choice);
    }
    return this.staticProvider;
  }

  /** 写动态库(记忆/情绪;meta.timestamp 供衰减) */
  async addDynamic(entry: Omit<VectorEntry, 'vector'>, providerChoice?: VectorModelId): Promise<void> {
    const provider = await this.getDynamicProvider(providerChoice);
    const vector = await provider.embed(entry.text);
    this.dynamicStore.add({ ...entry, vector });
  }

  /** 写静态库(世界设定/角色设定) */
  async addStatic(entry: Omit<VectorEntry, 'vector'>, providerChoice?: VectorModelId): Promise<void> {
    const provider = await this.getStaticProvider(providerChoice);
    const vector = await provider.embed(entry.text);
    this.staticStore.add({ ...entry, vector });
  }

  /** 双通道检索:动态每轮 + 静态(关键词门控) */
  async retrieve(query: string, staticGate: boolean): Promise<Array<{ entry: VectorEntry; score: number; channel: 'dynamic' | 'static' }>> {
    const out: Array<{ entry: VectorEntry; score: number; channel: 'dynamic' | 'static' }> = [];
    const dynamicProvider = await this.getDynamicProvider();
    const q = await dynamicProvider.embed(query);
    const now = Date.now();

    // 动态通道:每轮,时间衰减
    const dyn = this.dynamicStore
      .query(q, this.opts.dynamicTopK)
      .map((h) => {
        const ts = Number(h.entry.meta.timestamp ?? now);
        return { ...h, decayed: h.score * decay(now - ts) };
      })
      .filter((h) => h.decayed >= this.opts.minScore)
      .sort((a, b) => b.decayed - a.decayed);
    for (const h of dyn) out.push({ entry: h.entry, score: h.decayed, channel: 'dynamic' });

    // 静态通道:关键词门控(世界书扫描命中)才查
    if (staticGate) {
      const staticProvider = await this.getStaticProvider();
      const sq = await staticProvider.embed(query);
      const st = this.staticStore
        .query(sq, this.opts.staticTopK)
        .filter((h) => h.score >= this.opts.minScore);
      for (const h of st) out.push({ entry: h.entry, score: h.score, channel: 'static' });
    }
    return out;
  }
}

/** 每轮双通道检索并组装注入(失败静默返回空;guard + minScore 见 VectorRagOptions) */
export async function buildVectorRagInjection(
  query: string,
  staticGate: boolean,
  opts: VectorRagOptions = {}
): Promise<VectorRagInjection> {
  if (!isVectorRagEnabled()) return EMPTY;
  try {
    const runtime = VectorRagRuntime.get(opts);
    const hits = await runtime.retrieve(query, staticGate);
    if (hits.length === 0) return { text: '', hits: [], ran: true };
    const parts: string[] = [];
    for (const h of hits) {
      const tag = h.channel === 'dynamic' ? '[记忆]' : '[设定]';
      parts.push(`${tag}${h.entry.text}`);
    }
    return {
      text: parts.join('\n'),
      hits: hits.map((h) => ({ id: h.entry.id, score: h.score, channel: h.channel })),
      ran: true,
    };
  } catch {
    return EMPTY;
  }
}