/**
 * 图像存储管理 (模块3)
 *
 * 统一管理生成图像的存储与检索：
 * - 内存画廊（响应式）
 * - IndexedDB 持久化（Web）
 * - 元数据索引（prompt、参数、时间）
 *
 * 存储策略：
 * - 图像数据以 base64 data URL 存储
 * - 大图像（>2MB）自动压缩质量
 * - 画廊上限可配置，超出时淘汰最旧
 */

import type { GeneratedImage } from './image-generation';

// ── 类型 ──

export interface ImageGalleryStats {
  /** 画廊中的图像总数 */
  count: number;
  /** 总占用空间（估算 MB） */
  totalSizeMb: number;
  /** 平均生成耗时 */
  avgDurationMs: number;
  /** 按 Provider 统计 */
  byProvider: Record<string, number>;
  /** 按风格统计 */
  byStyle: Record<string, number>;
}

// ── 估算工具 ──

/**
 * 估算 base64 data URL 的字节大小
 */
export function estimateBase64Size(dataUrl: string): number {
  // base64 部分约为原始数据的 4/3
  const base64Part = dataUrl.split(',')[1] ?? '';
  return Math.round((base64Part.length * 3) / 4);
}

/**
 * 格式化大小
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// ── 内存画廊 ──

/**
 * 内存图像画廊
 *
 * 管理生成图像的内存列表，支持上限与淘汰。
 */
export class ImageGallery {
  private images: GeneratedImage[] = [];
  private readonly maxCapacity: number;

  constructor(maxCapacity: number = 200) {
    this.maxCapacity = maxCapacity;
  }

  /**
   * 添加图像到画廊
   */
  add(image: GeneratedImage): void {
    this.images.unshift(image);

    // 超出容量淘汰最旧的
    while (this.images.length > this.maxCapacity) {
      this.images.pop();
    }
  }

  /**
   * 批量添加
   */
  addBatch(images: GeneratedImage[]): void {
    for (const img of images) {
      this.add(img);
    }
  }

  /**
   * 按 ID 获取
   */
  get(id: string): GeneratedImage | null {
    return this.images.find((img) => img.id === id) ?? null;
  }

  /**
   * 按 ID 删除
   */
  delete(id: string): boolean {
    const idx = this.images.findIndex((img) => img.id === id);
    if (idx < 0) return false;
    this.images.splice(idx, 1);
    return true;
  }

  /**
   * 清空画廊
   */
  clear(): void {
    this.images = [];
  }

  /**
   * 获取所有图像（按时间倒序）
   */
  list(): GeneratedImage[] {
    return [...this.images];
  }

  /**
   * 按关键词搜索
   */
  search(query: string): GeneratedImage[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.list();
    return this.images.filter((img) =>
      img.params.prompt.toLowerCase().includes(q) ||
      img.params.negativePrompt?.toLowerCase().includes(q) ||
      img.provider.toLowerCase().includes(q)
    );
  }

  /**
   * 按风格筛选
   */
  filterByStyle(style: string): GeneratedImage[] {
    if (style === 'all') return this.list();
    return this.images.filter((img) => img.params.style === style);
  }

  /**
   * 获取统计信息
   */
  getStats(): ImageGalleryStats {
    const totalBytes = this.images.reduce(
      (sum, img) => sum + estimateBase64Size(img.data),
      0
    );
    const totalDuration = this.images.reduce(
      (sum, img) => sum + img.durationMs,
      0
    );

    const byProvider: Record<string, number> = {};
    const byStyle: Record<string, number> = {};

    for (const img of this.images) {
      byProvider[img.provider] = (byProvider[img.provider] ?? 0) + 1;
      byStyle[img.params.style] = (byStyle[img.params.style] ?? 0) + 1;
    }

    return {
      count: this.images.length,
      totalSizeMb: totalBytes / (1024 * 1024),
      avgDurationMs: this.images.length > 0 ? totalDuration / this.images.length : 0,
      byProvider,
      byStyle,
    };
  }

  /**
   * 获取当前数量
   */
  get count(): number {
    return this.images.length;
  }
}

// ── IndexedDB 持久化 ──

const DB_NAME = 'ai-roleplay-images';
const STORE_NAME = 'gallery';
const DB_VERSION = 1;

/**
 * 打开 IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('provider', 'provider', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 持久化图像到 IndexedDB
 */
export async function persistImage(image: GeneratedImage): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(image);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 从 IndexedDB 加载所有图像
 */
export async function loadAllImages(): Promise<GeneratedImage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const images = request.result as GeneratedImage[];
      // 按时间倒序
      images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(images);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 从 IndexedDB 删除图像
 */
export async function deleteImage(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 清空 IndexedDB 中的所有图像
 */
export async function clearAllImages(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
