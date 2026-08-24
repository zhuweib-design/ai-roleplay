/**
 * 向量模型选择与管理 (需求 3:可选 bge-large/bge-small/gte-large,浏览器自动切 bge-small;
 * 仿 VectorModelManager:高频模型常驻,低频模型延迟加载、可卸载)
 *
 * 当前实现:provider 选择器 + 生命周期管理。
 * 运行时接线说明:
 * - ONNXEmbeddingProvider:onnxruntime-web 加载本地模型(后续接入,浏览器端使用 bge-small)
 * - GatewayEmbeddingProvider:远端 /v1/embeddings(网关配凭证后可用)
 * - MockEmbeddingProvider:离线开发/降级
 * 浏览器判定 isBrowserRuntime:Web 环境自动选择 bge-small-zh-v1.5;
 * 桌面(Tauri)环境可配置 bge-large-zh-v1.5 / bge-large-zh-v1.5-int8-onnx / gte-large-quant。
 */

import {
  type EmbeddingProvider,
  GatewayEmbeddingProvider,
  MockEmbeddingProvider,
} from './embedding';
import { getBestEmbeddingModel } from './rag-benchmark';
import { isUserVectorModelId } from './vector-model-install';

export type VectorModelId =
  | 'bge-large-zh-v1.5'
  | 'bge-large-zh-v1.5-int8-onnx'
  | 'bge-small-zh-v1.5'
  | 'bge-small-zh-v1.5-int8-onnx'
  | 'gte-large-zh-int8-onnx';

export interface VectorModelInfo {
  id: VectorModelId;
  /** 语义维度 */
  dim: number;
  /** 权重文件大小参考(MB) */
  sizeMb: number;
  /** 是否推荐浏览器端(WASM 内存友好) */
  browserSafe: boolean;
  /** 角色:动态层(每轮)或静态层(按需) */
  role: 'dynamic' | 'static';
}

export const VECTOR_MODELS: Record<VectorModelId, VectorModelInfo> = {
  'bge-large-zh-v1.5': {
    id: 'bge-large-zh-v1.5',
    dim: 1024,
    sizeMb: 1330,
    browserSafe: false,
    role: 'static',
  },
  'bge-large-zh-v1.5-int8-onnx': {
    id: 'bge-large-zh-v1.5-int8-onnx',
    dim: 1024,
    sizeMb: 311,
    browserSafe: false,
    role: 'static',
  },
  'bge-small-zh-v1.5': {
    id: 'bge-small-zh-v1.5',
    dim: 512,
    sizeMb: 95,
    browserSafe: true,
    role: 'static',
  },
  'bge-small-zh-v1.5-int8-onnx': {
    id: 'bge-small-zh-v1.5-int8-onnx',
    dim: 512,
    sizeMb: 92,
    browserSafe: true,
    role: 'static',
  },
  'gte-large-zh-int8-onnx': {
    id: 'gte-large-zh-int8-onnx',
    dim: 1024,
    sizeMb: 312,
    browserSafe: false,
    role: 'dynamic',
  },
};

/** 浏览器运行时判定(无 __TAURI_INTERNALS__ 即 Web 环境) */
export function isBrowserRuntime(): boolean {
  return typeof window === 'undefined'
    ? true
    : !('__TAURI_INTERNALS__' in window);
}

/**
 * 模型选择器:
 * - 用户显式选择 → 尊重选择
 * - 未选择 → 自动择优记录(bestEmbeddingModel)优先;无记录则平台默认
 *   (浏览器 bge-small;桌面按角色:动态 gte-large / 静态 bge-large)
 */
export function selectVectorModel(
  userChoice: VectorModelId | undefined,
  role: 'dynamic' | 'static'
): VectorModelId {
  if (userChoice) return userChoice;
  // 择优结果(用户自定义或合法预置模型)作为最高优先级
  const best = getBestEmbeddingModel();
  if (best && (isUserVectorModelId(best) || best in VECTOR_MODELS)) {
    return best as VectorModelId;
  }
  if (isBrowserRuntime()) {
    // 浏览器端统一降级 bge-small(内存友好)
    return 'bge-small-zh-v1.5';
  }
  return role === 'dynamic' ? 'gte-large-zh-int8-onnx' : 'bge-large-zh-v1.5';
}

/**
 * 模型管理器(仿附件 VectorModelManager):
 * - 常驻模型(通常为动态层,小/高频)保持加载
 * - 按需模型(静态层,大/低频)首次使用时加载,可 unload 释放
 * - 当前 provider 层为接口占位;实际 onnx 加载在 ONNXEmbeddingProvider 接入后生效
 */
export class VectorModelManager {
  private resident: EmbeddingProvider | null = null;
  private onDemand: EmbeddingProvider | null = null;
  private residentModel: VectorModelId | null = null;
  private onDemandModel: VectorModelId | null = null;

  constructor(private readonly factory: (model: VectorModelId) => EmbeddingProvider) {}

  /** 动态层:始终用常驻模型(首用时加载) */
  async providerForDynamic(choice?: VectorModelId): Promise<EmbeddingProvider> {
    const id = selectVectorModel(choice, 'dynamic');
    if (!this.resident || this.residentModel !== id) {
      this.resident = this.factory(id);
      this.residentModel = id;
    }
    return this.resident;
  }

  /** 静态层:按需加载;未加载时创建并缓存 */
  async providerForStatic(choice?: VectorModelId): Promise<EmbeddingProvider> {
    const id = selectVectorModel(choice, 'static');
    if (!this.onDemand || this.onDemandModel !== id) {
      this.onDemand = this.factory(id);
      this.onDemandModel = id;
    }
    return this.onDemand;
  }

  /** 释放按需模型(对话高峰期可主动调用) */
  unloadOnDemand(): void {
    this.onDemandModel = null;
    this.onDemand = null;
  }

  /** 当前已加载模型名(实时:常驻+按需去重) */
  loadedModels(): string[] {
    const ids = new Set<VectorModelId>();
    if (this.residentModel) ids.add(this.residentModel);
    if (this.onDemandModel) ids.add(this.onDemandModel);
    return [...ids];
  }

  /** 默认工厂:远端配置(本地存储 aijiuguan.remoteEmbedding)存在时用网关,否则 mock */
  static defaultFactory(): VectorModelManager {
    // 设置页保存的线上引用配置(localStorage;UI 接线)
    let remote: { baseUrl?: string; apiKey?: string; modelName?: string; dim?: number; embeddingPath?: string } | null = null;
    try {
      const raw = localStorage.getItem('aijiuguan.remoteEmbedding');
      if (raw) remote = JSON.parse(raw);
    } catch {
      remote = null;
    }
    const factory = (model: VectorModelId): EmbeddingProvider => {
      if (remote?.baseUrl) {
        return new GatewayEmbeddingProvider({
          baseUrl: `${remote.baseUrl.replace(/\/+$/, '')}${remote.embeddingPath ?? '/embeddings'}`,
          apiKey: remote.apiKey ?? '',
          model: remote.modelName ?? model,
          defaultDim: remote.dim ?? VECTOR_MODELS[model].dim,
        });
      }
      return new MockEmbeddingProvider();
    };
    return new VectorModelManager(factory);
  }
}