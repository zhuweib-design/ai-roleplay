/**
 * 模型文件适配器实现(双环境)
 *
 * - TauriFileAdapter:tauri-plugin-fs,模型目录在 appData/model/<id>/
 * - WebFileAdapter:浏览器 <input webkitdirectory> 选目录 → File 列表复制进 IndexedDB
 *   (key: model/<id>/<文件名>;File 对象可持久化)
 *
 * 两者实现 ModelFileAdapter 接口(vector-model-source.ts 定义)。
 * 运行时选择:isTauriEnv() ? TauriFileAdapter : WebFileAdapter
 */
import type { ModelFileAdapter } from './vector-model-source';
import type { VectorModelId } from './vector-model-manager';

export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ── Tauri ──

const DB_NAME = 'ai-roleplay-models';
const STORE = 'files';

/** IndexedDB 工具(Web 适配器用) */
export function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
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
      const req = tx.objectStore(STORE).getKey(`model/${modelId}/model.onnx`);
      req.onsuccess = () => resolve(req.result !== undefined);
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
    if (!file) throw new Error(`模型文件未找到: ${modelId}/${fileName}`);
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
          const m = k.match(/^models\/embedding\/([^/]+)\/model\.onnx$/);
          if (m) ids.add(m[1] as VectorModelId);
        }
        resolve([...ids]);
      };
      req.onerror = () => resolve([]);
    });
  }
}

// ── Tauri ──

/** Tauri fs 适配器(动态 import 插件,非 Tauri 环境不加载) */
import { BaseDirectory } from '@tauri-apps/plugin-fs';

export class TauriFileAdapter implements ModelFileAdapter {
  private async fs() {
    return import('@tauri-apps/plugin-fs');
  }

  private modelDir(modelId: VectorModelId): string {
    return `model/${modelId}`;
  }

  async exists(modelId: VectorModelId): Promise<boolean> {
    try {
      const fs = await this.fs();
      const entries = await fs.readDir(this.modelDir(modelId), { baseDir: BaseDirectory.AppData });
      return entries.some((e) => e.name === 'model.onnx');
    } catch {
      return false;
    }
  }

  async importFromDir(modelId: VectorModelId, source: string | File[]): Promise<string[]> {
    const fs = await this.fs();
    const dest = this.modelDir(modelId);
    await fs.mkdir(dest, { baseDir: BaseDirectory.AppData, recursive: true });
    if (Array.isArray(source)) return [];
    const sourceDir = source;
    const entries = await fs.readDir(sourceDir);
    const wanted = new Set(['model.onnx', 'config.json']);
    const saved: string[] = [];
    for (const e of entries) {
      if (e.name && wanted.has(e.name)) {
        await fs.copyFile(`${sourceDir}/${e.name}`, `${dest}/${e.name}`, {
          fromPathBaseDir: BaseDirectory.AppData,
          toPathBaseDir: BaseDirectory.AppData,
        });
        saved.push(e.name);
      }
    }
    return saved;
  }

  async readModelBuffer(modelId: VectorModelId, fileName: string): Promise<ArrayBuffer> {
    const fs = await this.fs();
    const bytes = await fs.readFile(`${this.modelDir(modelId)}/${fileName}`, {
      baseDir: BaseDirectory.AppData,
    });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  async readText(modelId: VectorModelId, fileName: string): Promise<string> {
    const fs = await this.fs();
    const bytes = await fs.readFile(`${this.modelDir(modelId)}/${fileName}`, {
      baseDir: BaseDirectory.AppData,
    });
    return new TextDecoder('utf-8').decode(bytes);
  }

  async listInstalled(): Promise<VectorModelId[]> {
    try {
      const fs = await this.fs();
      const entries = await fs.readDir('model', { baseDir: BaseDirectory.AppData });
      return entries
        .filter((e) => e.isDirectory)
        .map((e) => e.name as VectorModelId);
    } catch {
      return [];
    }
  }
}

/** 按环境选择适配器 */
export function createModelFileAdapter(): ModelFileAdapter {
  return isTauriEnv() ? new TauriFileAdapter() : new WebFileAdapter();
}