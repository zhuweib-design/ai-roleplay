/**
 * 用户自定义向量模型存储层
 *
 * 持久化位置:
 * - Web/Tauri 共用 IndexedDB `ai-roleplay-models` 的 `store:files`,
 *   键为 `user-model/<id>/<fileName>`,值存 File 或 Uint8Array
 * - 元数据(名称/时间/文件清单/来源/是否新)存 IndexedDB `store:meta`
 *
 * 该存储独立于预置模型适配器(model-file-adapter.ts),
 * 只承载用户上传/登记的自定义向量模型。
 */

import { isTauriEnv } from './model-file-adapter';

const DB_NAME = 'ai-roleplay-models';
const FILE_STORE = 'files';
const META_STORE = 'user-model-meta';
const META_KEY = 'user-vector-models';

/** 打开用户模型 IndexedDB(确保 meta store 存在) */
export function openUserModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── 元数据读写 ──

import type { UserVectorModel } from './vector-model-install';

export async function loadUserModelMeta(): Promise<UserVectorModel[]> {
  const db = await openUserModelDb();
  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(META_KEY);
    req.onsuccess = () => {
      const list = (req.result as UserVectorModel[] | undefined) ?? [];
      resolve(list);
    };
    req.onerror = () => resolve([]);
  });
}

export async function saveUserModelMeta(list: UserVectorModel[]): Promise<void> {
  const db = await openUserModelDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(list, META_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 追加一个模型(名称唯一校验在调用方) */
export async function addUserModelMeta(model: UserVectorModel): Promise<void> {
  const list = await loadUserModelMeta();
  list.push(model);
  await saveUserModelMeta(list);
}

// ── 文件读写 ──

function fileKey(id: string, fileName: string): string {
  return `user-model/${id}/${fileName}`;
}

/** 写入一组模型文件(值可为 File 或字节) */
export async function writeUserModelFiles(
  id: string,
  files: Map<string, Uint8Array | File>
): Promise<string[]> {
  const db = await openUserModelDb();
  const tx = db.transaction(FILE_STORE, 'readwrite');
  const store = tx.objectStore(FILE_STORE);
  const saved: string[] = [];
  for (const [name, data] of files) {
    store.put(data, fileKey(id, name));
    saved.push(name);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return saved;
}

/** 读取模型文件为 ArrayBuffer */
export async function readUserModelFile(id: string, fileName: string): Promise<ArrayBuffer> {
  const db = await openUserModelDb();
  const value = await new Promise<unknown>((resolve) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const req = tx.objectStore(FILE_STORE).get(fileKey(id, fileName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
  // 用 toStringTag / 能力检测识别，避免 structured-clone 跨 realm 时 instanceof 失效
  // （fake-indexeddb / 原生 webview 会返回另一 realm 的同名类型，instanceof 匹配为 false）
  const tag = Object.prototype.toString.call(value);
  // Blob / File：优先能力检测，跨 realm 实例仍有可调用的 arrayBuffer()
  if (value && typeof value === 'object' && typeof (value as Blob).arrayBuffer === 'function') {
    return (value as Blob).arrayBuffer();
  }
  if (value instanceof ArrayBuffer) return value;
  // Uint8Array / 其它 TypedArray 视图：ArrayBuffer.isView 不依赖 realm；
  // 用逐元素拷贝规避跨 realm 下 buffer/byteOffset 属性的不可靠性
  if (ArrayBuffer.isView(value)) {
    const view = value as Uint8Array;
    const out = new Uint8Array(view.byteLength);
    out.set(view);
    return out.buffer;
  }
  if (tag === '[object ArrayBuffer]') return value as ArrayBuffer;
  // i18n-ignore-start  // 运行时错误消息(非 UI 文案)
  throw new Error(`文件未找到: ${fileName}`);
  // i18n-ignore-end
}

/** 读取模型文本文件 */
export async function readUserModelText(id: string, fileName: string): Promise<string> {
  const buf = await readUserModelFile(id, fileName);
  return new TextDecoder('utf-8').decode(buf);
}

/** 删除一个用户模型(元数据 + 文件) */
export async function deleteUserModel(id: string): Promise<void> {
  const db = await openUserModelDb();
  // 1. 删元数据
  const list = await loadUserModelMeta();
  await saveUserModelMeta(list.filter((m) => m.id !== id));
  // 2. 删文件
  const tx = db.transaction(FILE_STORE, 'readwrite');
  const store = tx.objectStore(FILE_STORE);
  const keys = await new Promise<IDBValidKey[] | undefined>((resolve) => {
    const r = store.getAllKeys();
    r.onsuccess = () => resolve(r.result as IDBValidKey[] | undefined);
    r.onerror = () => resolve(undefined);
  });
  for (const key of keys ?? []) {
    if (String(key).startsWith(`user-model/${id}/`)) store.delete(key);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 列出所有用户模型 id(按文件 key 推导) */
export async function listUserModelIds(): Promise<string[]> {
  const db = await openUserModelDb();
  return new Promise((resolve) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const req = tx.objectStore(FILE_STORE).getAllKeys();
    req.onsuccess = () => {
      const ids = new Set<string>();
      for (const k of req.result as IDBValidKey[]) {
        const m = String(k).match(/^user-model\/([^/]+)\//);
        if (m) ids.add(m[1]!);
      }
      // Tauri 还可能引用磁盘文件
      resolve([...ids]);
    };
    req.onerror = () => resolve([]);
  });
}

export { isTauriEnv };