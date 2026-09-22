import { getStorageAdapter } from '@storage/storage-factory';
import { RuntimeApiAdapter } from './runtime-api';
import { RuntimeCore } from './runtime-core';
import { SnapshotRuntimeStore } from './store';

/**
 * 创建与 AI 酒馆现有跨端存储复用的 Runtime 实例。
 *
 * Web 使用 IndexedDB，Tauri 使用现有文件存储；未来接入服务端时只需替换
 * SnapshotRuntimeStore，不需要改动 Emotion Engine、Character Compiler 或 API 契约。
 */
export function createProjectRuntime(): RuntimeApiAdapter {
  const store = new SnapshotRuntimeStore(getStorageAdapter());
  return new RuntimeApiAdapter(new RuntimeCore(store));
}
