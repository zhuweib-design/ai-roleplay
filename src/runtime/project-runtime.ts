import { getStorageAdapter } from '@storage/storage-factory';
import { RuntimeApiAdapter, type RuntimeApi } from './runtime-api';
import { HttpRuntimeApi, type RuntimeHttpApiOptions } from './runtime-http';
import { RuntimeCore } from './runtime-core';
import { SnapshotRuntimeStore } from './store';

export interface ProjectRuntimeOptions {
  /** 传入后使用服务端 Runtime；不传则保持 Web/Tauri 本地快照模式。 */
  server?: RuntimeHttpApiOptions;
}

/**
 * 创建 AI 酒馆使用的 Runtime。
 *
 * 默认复用现有跨端存储：Web 使用 IndexedDB，Tauri 使用文件存储。
 * 传入 server 后，ChatManager 通过同一个 RuntimeApi 契约访问服务端，
 * PostgreSQL 只在服务端边界内出现。
 */
export function createProjectRuntime(options: ProjectRuntimeOptions = {}): RuntimeApi {
  if (options.server) return new HttpRuntimeApi(options.server);
  const store = new SnapshotRuntimeStore(getStorageAdapter());
  return new RuntimeApiAdapter(new RuntimeCore(store));
}
