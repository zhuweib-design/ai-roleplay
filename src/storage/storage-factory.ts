import type { StorageAdapter } from './storage-adapter';
import { IndexedDBAdapter } from './indexeddb-adapter';
import { TauriFSAdapter } from './tauri-fs-adapter';

/**
 * 存储适配器工厂 (Phase H3 更新)
 *
 * 运行时根据环境自动选择实现：
 * - Tauri 环境（window.__TAURI_INTERNALS__ 存在）→ TauriFSAdapter（本地文件系统）
 * - 浏览器环境 → IndexedDBAdapter（浏览器 IndexedDB）
 *
 * Phase H3 已实现 TauriFSAdapter，可正确切换；
 * Web 降级方案完整保留，浏览器环境行为不变。
 */

let instance: StorageAdapter | null = null;

/** 当前激活 profile 的 localStorage 键 */
const ACTIVE_PROFILE_KEY = 'ai-roleplay:active-profile';

/** 默认 profile 名(不创建独立数据库) */
export const DEFAULT_PROFILE = 'default';

/** 读取当前激活 profile id(默认 'default') */
export function getActiveProfileId(): string {
  try {
    const v = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return v && /^[a-zA-Z0-9_-]{1,32}$/.test(v) ? v : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

/** 设置激活 profile(持久化;切换后需重启应用生效) */
export function setActiveProfileId(profileId: string): void {
  const id = /^[a-zA-Z0-9_-]{1,32}$/.test(profileId) ? profileId : DEFAULT_PROFILE;
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {
    /* 存储不可用时忽略 */
  }
  // 重置单例,下次 getStorageAdapter 按新 profile 创建
  instance = null;
}

/** 计算当前 profile 的 IndexedDB 库名(T-12:非 default 时加后缀隔离) */
function resolveDbName(base: string): string {
  const profile = getActiveProfileId();
  return profile === DEFAULT_PROFILE ? base : `${base}-${profile}`;
}

/**
 * 获取全局 StorageAdapter 单例
 * 首次调用时根据环境创建适配器，后续调用返回同一实例
 *
 * 在 App.vue 启动时调用一次即可
 */
export function getStorageAdapter(): StorageAdapter {
  if (instance) return instance;

  if (TauriFSAdapter.isTauriEnv()) {
    // Tauri 桌面应用环境：使用本地文件系统
    // ponytail(T-12):Tauri 文件系统 profile 隔离需 Rust 侧路径重构,当前单 profile
    instance = new TauriFSAdapter();
  } else {
    // Web 降级：浏览器环境使用 IndexedDB,按 profile 隔离库名
    instance = new IndexedDBAdapter(resolveDbName('ai-roleplay'));
  }

  return instance;
}

/**
 * 重置全局单例（仅供测试使用）
 */
export function resetStorageAdapter(): void {
  instance = null;
}

/**
 * 获取当前环境标识（UI 提示用）
 * - 'tauri'：桌面应用环境，数据存储在 %APPDATA%/com.airoleplay.app/data/
 * - 'web'：浏览器环境，数据存储在 IndexedDB
 */
export function getStorageEnv(): 'tauri' | 'web' {
  return TauriFSAdapter.isTauriEnv() ? 'tauri' : 'web';
}
