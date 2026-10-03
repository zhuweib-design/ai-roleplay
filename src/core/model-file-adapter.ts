/**
 * 模型文件适配器实现(双环境)
 *
 * - TauriFileAdapter:自定义 Rust 命令(model-fs-ipc.ts),模型目录在 appData/model/<id>/
 * - WebFileAdapter:浏览器 <input webkitdirectory> 选目录 → File 列表复制进 IndexedDB
 *   (key: model/<id>/<文件名>;File 对象可持久化)
 *
 * 两者实现 ModelFileAdapter 接口(vector-model-source.ts 定义)。
 * 运行时选择:isTauriEnv() ? TauriFileAdapter : WebFileAdapter
 */
import type { ModelFileAdapter } from './vector-model-source';
import type { VectorModelId } from './vector-model-manager';
import { modelFsIpc } from './model-fs-ipc';
import { t } from '@/i18n';

export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ── Tauri ──

const DB_NAME = 'ai-roleplay-models';
const STORE = 'files';
/** 与 vector-model-storage 共享同一 DB 与升级版本(避免同库版本锁导致的高版本 open 挂起) */
const META_STORE = 'user-model-meta';

/** IndexedDB 工具(Web 适配器用) */
export function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
      if (!req.result.objectStoreNames.contains(META_STORE)) {
        req.result.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class WebFileAdapter implements ModelFileAdapter {
  async exists(modelId: VectorModelId): Promise<boolean> {
    const db = await openModelDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const prefix = `model/${modelId}/`;
        resolve((req.result as IDBValidKey[]).some((key) => {
          const name = String(key);
          return name.startsWith(prefix) && /\/(?:model\.onnx|model_int8\.onnx)$/.test(name);
        }));
      };
      req.onerror = () => resolve(false);
    });
  }

  /** 浏览器复制:存入 IndexedDB(带 File 对象) */
  async importFromDir(modelId: VectorModelId, source: string | File[]): Promise<string[]> {
    const files = Array.isArray(source) ? source : [];
    const db = await openModelDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const saved: string[] = [];
    for (const file of files) {
      const key = `model/${modelId}/${file.name}`;
      store.put(file, key);
      saved.push(file.name);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return saved;
  }

  async readModelBuffer(modelId: VectorModelId, fileName: string): Promise<ArrayBuffer> {
    const file = await this.getFile(modelId, fileName);
    return file.arrayBuffer();
  }

  async readText(modelId: VectorModelId, fileName: string): Promise<string> {
    const file = await this.getFile(modelId, fileName);
    return file.text();
  }

  private async getFile(modelId: VectorModelId, fileName: string): Promise<File> {
    const db = await openModelDb();
    const file = await new Promise<File | undefined>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(`model/${modelId}/${fileName}`);
      req.onsuccess = () => resolve(req.result as File | undefined);
      req.onerror = () => resolve(undefined);
    });
    if (!file) throw new Error(t('core.modelFileNotFound', { id: modelId, file: fileName }));
    return file;
  }

  async listInstalled(): Promise<VectorModelId[]> {
    const db = await openModelDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => {
        const keys = (req.result as IDBValidKey[]).map(String);
        const ids = new Set<VectorModelId>();
        for (const k of keys) {
          // WebFileAdapter.importFromDir 使用 model/<id>/<file> 作为统一键。
          // 兼容早期版本遗留的 models/embedding/<id>/model.onnx 键，避免升级后丢失已安装模型。
          const current = k.match(/^model\/([^/]+)\/(?:model\.onnx|model_int8\.onnx)$/);
          const legacy = k.match(/^models\/embedding\/([^/]+)\/model\.onnx$/);
          const id = current?.[1] ?? legacy?.[1];
          if (id) ids.add(id as VectorModelId);
        }
        resolve([...ids].sort() as VectorModelId[]);
      };
      req.onerror = () => resolve([]);
    });
  }
}

// ── Tauri ──

/**
 * Tauri 模型文件适配器
 *
 * 磁盘访问经自定义 Rust 命令(model-fs-ipc.ts):插件命令受 capabilities ACL
 * (仅 core:default)拒绝,自定义命令不占插件权限面。项目 model/ 优先、
 * appData/model 兜底的解析顺序由 Rust 侧保证。
 */
export class TauriFileAdapter implements ModelFileAdapter {
  async exists(modelId: VectorModelId): Promise<boolean> {
    return modelFsIpc.hasModel(modelId);
  }

  /** 桌面端:把选中目录里的模型文件复制进 appData/model/<id>/ */
  async importFromDir(modelId: VectorModelId, source: string | File[]): Promise<string[]> {
    if (Array.isArray(source)) return [];
    return modelFsIpc.copyFiles(source, modelId);
  }

  async readModelBuffer(modelId: VectorModelId, fileName: string): Promise<ArrayBuffer> {
    return modelFsIpc.readModel(modelId, fileName);
  }

  async readText(modelId: VectorModelId, fileName: string): Promise<string> {
    return modelFsIpc.readModelText(modelId, fileName);
  }

  async listInstalled(): Promise<VectorModelId[]> {
    return (await modelFsIpc.listInstalled()) as VectorModelId[];
  }
}

/** 按环境选择适配器 */
export function createModelFileAdapter(): ModelFileAdapter {
  return isTauriEnv() ? new TauriFileAdapter() : new WebFileAdapter();
}
