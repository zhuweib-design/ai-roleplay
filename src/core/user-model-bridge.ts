/**
 * 用户自定义向量模型桥接适配器
 *
 * 实现 ModelFileAdapter 接口,但底层读取用户自定义模型存储
 * (IndexedDB `user-model/<id>/<file>`),使 OnnxEmbeddingProvider
 * 无需改动即可对用户上传/登记的自定义模型执行 ONNX 推理。
 *
 * modelId 传用户自定义 id(形如 user-<ts>-<slug>)。
 */
import type { ModelFileAdapter } from './vector-model-source';
import type { VectorModelId } from './vector-model-manager';
import {
  readUserModelFile,
  readUserModelText,
  listUserModelIds,
} from './vector-model-storage';
import { isUserVectorModelId } from './vector-model-install';

export class UserModelFileAdapter implements ModelFileAdapter {
  async exists(modelId: VectorModelId): Promise<boolean> {
    return isUserVectorModelId(modelId);
  }

  async importFromDir(_modelId: VectorModelId, _source: string | File[]): Promise<string[]> {
    // 用户模型导入由 user-vector-model store 负责,此处不实现
    return [];
  }

  async readModelBuffer(modelId: VectorModelId, fileName: string): Promise<ArrayBuffer> {
    return readUserModelFile(modelId, fileName);
  }

  async readText(modelId: VectorModelId, fileName: string): Promise<string> {
    return readUserModelText(modelId, fileName);
  }

  async listInstalled(): Promise<VectorModelId[]> {
    const ids = await listUserModelIds();
    return ids.filter(isUserVectorModelId) as VectorModelId[];
  }
}