/**
 * 本地模型推理引擎 (模块2)
 *
 * 混合方案：WebGPU 本地推理优先，不支持时回退到 API。
 *
 * 职责：
 * - WebGPU 能力检测
 * - 模型注册表管理（预置可用模型元数据）
 * - 通过 WebLLM 动态加载/卸载模型
 * - 流式推理执行
 * - 性能指标采集（tokens/s、显存占用、加载耗时）
 * - 模型版本管理接口
 *
 * 依赖：@mlc-ai/web-llm（动态导入，避免主包膨胀）
 */

// ── 类型定义 ──

/** 模型规模级别 */
import { t } from '@/i18n';
export type ModelSize = 'small' | 'medium' | 'large';

/** 模型状态 */
export type ModelStatus = 'not-downloaded' | 'downloading' | 'ready' | 'loading' | 'loaded' | 'error';

/** 预置模型元数据 */
export interface LocalModelMeta {
  /** 模型 ID（WebLLM 的 model_id） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 模型规模 */
  size: ModelSize;
  /** 估算下载大小（MB） */
  downloadSizeMb: number;
  /** 估算显存占用（MB） */
  vramMb: number;
  /** 上下文窗口（tokens） */
  contextLength: number;
  /** 模型版本标签 */
  version: string;
  /** 模型描述 */
  description: string;
  /** 默认温度 */
  defaultTemperature: number;
  /** 是否低资源设备推荐 */
  lowResourceFriendly: boolean;
}

/** 推理请求 */
export interface LocalInferenceRequest {
  /** 模型 ID */
  modelId: string;
  /** 消息列表 */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** 温度 */
  temperature?: number;
  /** 最大生成 tokens */
  maxTokens?: number;
  /** top-p 采样 */
  topP?: number;
}

/** 推理性能指标 */
export interface InferenceMetrics {
  /** 模型 ID */
  modelId: string;
  /** 推理总耗时（ms） */
  totalMs: number;
  /** 首字延迟（ms） */
  firstTokenMs: number;
  /** 生成 tokens 数 */
  outputTokens: number;
  /** 解码速度（tokens/s） */
  tokensPerSecond: number;
  /** 估算显存占用（MB） */
  vramMb: number;
  /** 时间戳 */
  timestamp: string;
}

/** 模型加载进度 */
export interface LoadProgress {
  /** 模型 ID */
  modelId: string;
  /** 进度 0-1 */
  progress: number;
  /** 已加载大小（MB） */
  loadedMb: number;
  /** 总大小（MB） */
  totalMb: number;
  /** 阶段文本 */
  phase: string;
}

/** 引擎能力检测结果 */
export interface EngineCapability {
  /** 是否支持 WebGPU */
  webgpuSupported: boolean;
  /** 是否已安装 WebLLM */
  webllmInstalled: boolean;
  /** 浏览器名称 */
  browserName: string;
  /** 估算可用显存（MB，0=未知） */
  estimatedVramMb: number;
  /** T-05:是否支持 WebLLM 的 WASM 降级（无 WebGPU 时可用 CPU 推理，速度慢） */
  wasmSupported: boolean;
  /** 不支持原因 */
  reason?: string;
}

// ── 预置模型注册表 ──

/**
 * 预置可用模型列表
 *
 * 这些模型经过 WebLLM 验证，可在浏览器中运行。
 * 版本号对应 WebLLM 的模型仓库标签。
 */
export const MODEL_REGISTRY: LocalModelMeta[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B',
    size: 'small',
    downloadSizeMb: 540,
    vramMb: 945,
    contextLength: 4096,
    version: '0.2.84',
    description: t('lme.desc05'),
    defaultTemperature: 0.7,
    lowResourceFriendly: true,
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 1.5B',
    size: 'small',
    downloadSizeMb: 1100,
    vramMb: 1620,
    contextLength: 4096,
    version: '0.2.84',
    description: t('lme.desc15'),
    defaultTemperature: 0.7,
    lowResourceFriendly: true,
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    size: 'small',
    downloadSizeMb: 934,
    vramMb: 1289,
    contextLength: 4096,
    version: '0.2.84',
    description: t('lme.descLlama1'),
    defaultTemperature: 0.6,
    lowResourceFriendly: true,
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 3B',
    size: 'medium',
    downloadSizeMb: 1980,
    vramMb: 2810,
    contextLength: 4096,
    version: '0.2.84',
    description: t('lme.desc3'),
    defaultTemperature: 0.7,
    lowResourceFriendly: false,
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    size: 'medium',
    downloadSizeMb: 1726,
    vramMb: 2422,
    contextLength: 4096,
    version: '0.2.84',
    description: t('lme.descLlama3'),
    defaultTemperature: 0.6,
    lowResourceFriendly: false,
  },
];

/**
 * 获取注册表中所有模型
 */
export function listRegisteredModels(): LocalModelMeta[] {
  return [...MODEL_REGISTRY];
}

/**
 * 按 ID 查找模型
 */
export function findModel(modelId: string): LocalModelMeta | null {
  return MODEL_REGISTRY.find((m) => m.id === modelId) ?? null;
}

/**
 * 按规模筛选模型
 */
export function filterModelsBySize(size: ModelSize): LocalModelMeta[] {
  return MODEL_REGISTRY.filter((m) => m.size === size);
}

// ── WebGPU 能力检测 ──

/**
 * 检测浏览器 WebGPU 能力
 *
 * WebGPU 需要：
 * - Chrome 113+ / Edge 113+ / Safari 18+
 * - 安全上下文（HTTPS 或 localhost）
 * - 用户显卡支持
 */
export async function detectEngineCapability(): Promise<EngineCapability> {
  const ua = navigator.userAgent;
  let browserName = 'Unknown';

  if (/Chrome\/(\d+)/.test(ua) && !/Edg/.test(ua)) {
    browserName = `Chrome ${RegExp.$1}`;
  } else if (/Edg\/(\d+)/.test(ua)) {
    browserName = `Edge ${RegExp.$1}`;
  } else if (/Firefox\/(\d+)/.test(ua)) {
    browserName = `Firefox ${RegExp.$1}`;
  } else if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) {
    browserName = `Safari ${RegExp.$1}`;
  }

  // 检测 WebGPU API
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return {
      webgpuSupported: false,
      webllmInstalled: false,
      browserName,
      estimatedVramMb: 0,
      wasmSupported: false,
      reason: t('lme.webgpuUnsupported'),
    };
  }

  // 尝试获取 adapter 估算显存
  let estimatedVramMb = 0;
  try {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<{
          info?: { memoryInfo?: { availableMemory?: number } };
        } | null>;
      };
    };
    const adapter = await nav.gpu?.requestAdapter();
    const available = adapter?.info?.memoryInfo?.availableMemory;
    if (available) {
      estimatedVramMb = Math.round(available / (1024 * 1024));
    }
  } catch {
    // 估算失败不阻塞，仅无显存信息
  }

  // 检测 WebLLM 是否可动态导入
  let webllmInstalled = false;
  try {
    await import('@mlc-ai/web-llm');
    webllmInstalled = true;
  } catch {
    webllmInstalled = false;
  }

  // T-05:WASM 降级能力 —— 无 WebGPU 时 WebLLM 仍可在支持 WebAssembly
  // + SIMD 的浏览器以 CPU 后端运行(速度慢但可用)。
  const hasWasm = typeof WebAssembly !== 'undefined';
  const hasSimd =
    hasWasm &&
    typeof WebAssembly !== 'undefined' &&
    'validate' in WebAssembly &&
    typeof (WebAssembly as unknown as { validate: unknown }).validate === 'function';

  return {
    webgpuSupported: true,
    webllmInstalled,
    browserName,
    estimatedVramMb,
    wasmSupported: hasWasm && hasSimd,
  };
}

// ── 推理引擎 ──

/**
 * 本地模型推理引擎
 *
 * 封装 WebLLM 的加载与推理流程，提供统一的接口。
 * 使用动态导入避免主包膨胀。
 */
export class LocalModelEngine {
  private engine: unknown = null;
  private loadedModelId: string | null = null;
  private metricsHistory: InferenceMetrics[] = [];
  private readonly maxMetricsHistory = 100;

  /** 当前已加载模型 ID */
  get currentModelId(): string | null {
    return this.loadedModelId;
  }

  /** 是否有模型已加载 */
  get isLoaded(): boolean {
    return this.engine !== null && this.loadedModelId !== null;
  }

  /**
   * 加载模型
   *
   * @param modelId 模型 ID
   * @param onProgress 加载进度回调
   */
  async loadModel(
    modelId: string,
    onProgress?: (progress: LoadProgress) => void
  ): Promise<void> {
    const meta = findModel(modelId);
    if (!meta) {
      throw new Error(t('lme.modelNotRegistered', { id: modelId }));
    }

    // 已加载相同模型则跳过
    if (this.loadedModelId === modelId && this.engine) {
      return;
    }

    // 卸载旧模型
    if (this.engine) {
      await this.unloadModel();
    }

    // 动态导入 WebLLM
    const webllm = await import('@mlc-ai/web-llm');
    const { CreateMLCEngine } = webllm as { CreateMLCEngine: (model: string, opts?: { initProgressCallback?: (p: { progress: number; text: string }) => void }) => Promise<unknown> };

    this.engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (p: { progress: number; text: string }) => {
        if (onProgress) {
          onProgress({
            modelId,
            progress: p.progress,
            loadedMb: Math.round(p.progress * meta.downloadSizeMb),
            totalMb: meta.downloadSizeMb,
            phase: p.text,
          });
        }
      },
    });

    this.loadedModelId = modelId;
  }

  /**
   * 卸载当前模型（释放显存）
   */
  async unloadModel(): Promise<void> {
    if (!this.engine) return;

    try {
      const webllm = await import('@mlc-ai/web-llm');
      const { DeleteMLCEngine } = webllm as { DeleteMLCEngine?: (e: unknown) => Promise<void> };
      if (DeleteMLCEngine) {
        await DeleteMLCEngine(this.engine);
      }
    } catch {
      // 卸载失败不影响主流程
    }

    this.engine = null;
    this.loadedModelId = null;
  }

  /**
   * 执行推理（流式）
   *
   * @param request 推理请求
   * @param onDelta 增量回调
   * @returns 完整结果
   */
  async infer(
    request: LocalInferenceRequest,
    onDelta?: (delta: string, fullContent: string) => void
  ): Promise<string> {
    if (!this.engine || this.loadedModelId !== request.modelId) {
      throw new Error(t('lme.modelNotLoaded'));
    }

    const meta = findModel(request.modelId);
    if (!meta) {
      throw new Error(t('lme.modelNotRegistered', { id: request.modelId }));
    }

    const startTime = performance.now();
    let firstTokenTime = 0;
    let outputTokens = 0;
    let fullContent = '';

    const engine = this.engine as {
      chat: {
        completion: {
          create: (opts: {
            stream: true;
            messages: Array<{ role: string; content: string }>;
            temperature?: number;
            max_tokens?: number;
            top_p?: number;
          }) => AsyncIterable<{
            choices: Array<{ delta: { content?: string } }>;
            usage?: { completion_tokens?: number };
          }>;
        };
      };
    };

    const stream = engine.chat.completion.create({
      stream: true,
      messages: request.messages,
      temperature: request.temperature ?? meta.defaultTemperature,
      max_tokens: request.maxTokens ?? 1024,
      top_p: request.topP ?? 0.95,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        if (firstTokenTime === 0) {
          firstTokenTime = performance.now();
        }
        fullContent += delta;
        outputTokens++;
        onDelta?.(delta, fullContent);
      }

      // 从 usage 补充 tokens 数（若可用）
      if (chunk.usage?.completion_tokens) {
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    const endTime = performance.now();
    const totalMs = endTime - startTime;
    const firstTokenMs = firstTokenTime > 0 ? firstTokenTime - startTime : 0;
    const tokensPerSecond = outputTokens > 0 && totalMs > 0
      ? (outputTokens / totalMs) * 1000
      : 0;

    // 记录指标
    const metrics: InferenceMetrics = {
      modelId: request.modelId,
      totalMs,
      firstTokenMs,
      outputTokens,
      tokensPerSecond,
      vramMb: meta.vramMb,
      timestamp: new Date().toISOString(),
    };
    this.recordMetrics(metrics);

    return fullContent;
  }

  /**
   * 记录性能指标
   */
  private recordMetrics(metrics: InferenceMetrics): void {
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxMetricsHistory) {
      this.metricsHistory.shift();
    }
  }

  /**
   * 获取历史指标
   */
  getMetricsHistory(): InferenceMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * 获取最近一次指标
   */
  getLatestMetrics(): InferenceMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] ?? null;
  }

  /**
   * 获取平均性能指标
   */
  getAverageMetrics(modelId?: string): {
    avgTokensPerSecond: number;
    avgFirstTokenMs: number;
    avgTotalMs: number;
    count: number;
  } {
    const filtered = modelId
      ? this.metricsHistory.filter((m) => m.modelId === modelId)
      : this.metricsHistory;

    if (filtered.length === 0) {
      return { avgTokensPerSecond: 0, avgFirstTokenMs: 0, avgTotalMs: 0, count: 0 };
    }

    const sum = filtered.reduce(
      (acc, m) => ({
        tps: acc.tps + m.tokensPerSecond,
        ftm: acc.ftm + m.firstTokenMs,
        tm: acc.tm + m.totalMs,
      }),
      { tps: 0, ftm: 0, tm: 0 }
    );

    return {
      avgTokensPerSecond: sum.tps / filtered.length,
      avgFirstTokenMs: sum.ftm / filtered.length,
      avgTotalMs: sum.tm / filtered.length,
      count: filtered.length,
    };
  }

  /**
   * 清空指标历史
   */
  clearMetrics(): void {
    this.metricsHistory = [];
  }
}

// ── 模型版本管理 ──

/**
 * 检查模型是否有新版本
 *
 * 对比注册表中的 version 与 WebLLM 仓库的版本。
 * 实际场景需联网查询，此处返回注册表中的版本作为最新版本。
 */
export function checkModelUpdate(modelId: string): {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
} {
  const meta = findModel(modelId);
  if (!meta) {
    return { currentVersion: '0', latestVersion: '0', hasUpdate: false };
  }
  return {
    currentVersion: meta.version,
    latestVersion: meta.version,
    hasUpdate: false,
  };
}
