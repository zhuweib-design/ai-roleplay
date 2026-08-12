/**
 * 向量模型来源管理
 *
 * 两种引用方式:
 * 1. 本地引用:用户选定模型文件夹 → 系统复制到项目划定目录
 *    `model/<model-id>/`(Tauri:app data 下;Web:IndexedDB)
 *    约定文件:model.onnx(权重)、config.json(维数/分词器元数据,可选)
 * 2. 线上服务器引用(预留):远程 OpenAI 兼容 /v1/embeddings,
 *    字段见 RemoteModelConfig,后续设置页接线后生效
 */
import type { VectorModelId } from './vector-model-manager';

/** 线上服务器引用字段(预留;后续设置页接线) */
export interface RemoteModelConfig {
  kind: 'remote';
  /** 服务器端点(含 /v1,如 http://192.168.9.40:20128/v1) */
  baseUrl: string;
  /** API Key(可为空,部分服务无需鉴权) */
  apiKey: string;
  /** 服务商侧模型名(如 bge-large-zh-v1.5) */
  modelName: string;
  /** 嵌入端点路径(默认 /embeddings) */
  embeddingPath?: string;
  /** 鉴权头名称(默认 Authorization,值 Bearer <apiKey>) */
  authHeader?: string;
  /** 扩展请求头 */
  extraHeaders?: Record<string, string>;
  /** 输出维度(用于向量一致性校验) */
  dim: number;
  /** 批量嵌入上限(默认 16) */
  batchSize?: number;
}

/** 本地引用(模型文件在项目划定目录) */
export interface LocalModelConfig {
  kind: 'local';
  /** 模型 id(目录名 model/<model-id>/) */
  modelId: VectorModelId;
  /** 权重文件名(默认 model.onnx) */
  onnxFile?: string;
  /** 输出维度 */
  dim: number;
  /** 源文件夹路径(登记时记录,复制完成后可为空) */
  sourceDir?: string;
}

export type ModelSourceConfig = LocalModelConfig | RemoteModelConfig;

/** 本地模型文件系统适配器(Tauri fs / Web IndexedDB) */
export interface ModelFileAdapter {
  /** 模型目录是否存在 */
  exists(modelId: VectorModelId): Promise<boolean>;
  /** 将源目录/文件集复制到划定目录(返回文件清单);Web 端传 File[] */
  importFromDir(modelId: VectorModelId, source: string | File[]): Promise<string[]>;
  /** 读取模型文件为 ArrayBuffer(onnx 加载用) */
  readModelBuffer(modelId: VectorModelId, fileName: string): Promise<ArrayBuffer>;
  /** 读取模型文本文件(vocab.txt/config.json;tokenizer 与元数据用) */
  readText(modelId: VectorModelId, fileName: string): Promise<string>;
  /** 列出已登记模型 */
  listInstalled(): Promise<VectorModelId[]>;
}

/** 项目划定模型目录结构(供文档与适配器实现引用) */
export const MODEL_DIR_LAYOUT = {
  base: 'model',
  files: ['model.onnx', 'config.json'],
} as const;

/** 源→目的文件名映射(复制时只取约定文件,忽略用户目录杂项) */
export function mapSourceFiles(sourceDir: string, files: string[]): Array<{ from: string; to: string }> {
  const wanted = new Set<string>(MODEL_DIR_LAYOUT.files);
  return files
    .filter((f) => wanted.has(f))
    .map((f) => ({ from: `${sourceDir}/${f}`, to: f }));
}

/** 本地模型注册表(内存;适配器落盘) */
export class VectorModelSourceRegistry {
  private sources = new Map<VectorModelId, LocalModelConfig>();

  constructor(private readonly adapter: ModelFileAdapter) {}

  /** 登记本地模型(目录存在性由调用方确认) */
  async register(config: LocalModelConfig): Promise<void> {
    if (!(await this.adapter.exists(config.modelId))) {
      throw new Error(`模型未安装: ${config.modelId}(请先复制到 ${MODEL_DIR_LAYOUT.base}/${config.modelId}/)`);
    }
    this.sources.set(config.modelId, config);
  }

  get(modelId: VectorModelId): LocalModelConfig | undefined {
    return this.sources.get(modelId);
  }

  list(): VectorModelId[] {
    return [...this.sources.keys()];
  }

  /** 复制用户选定文件夹到划定目录 */
  async importFromDir(modelId: VectorModelId, sourceDir: string): Promise<string[]> {
    const files = await this.adapter.importFromDir(modelId, sourceDir);
    const cfg: LocalModelConfig = {
      kind: 'local',
      modelId,
      dim: 0, // 由 config.json 解析填充
      sourceDir,
    };
    this.sources.set(modelId, cfg);
    return files;
  }
}