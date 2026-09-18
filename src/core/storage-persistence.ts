import { ref } from 'vue';

/**
 * Web 端存储持久化授权（Web SOP 评审 P1-10）
 *
 * 背景：Web / PWA 模式下数据存放于 IndexedDB，与桌面端文件系统不同，存在三类
 * 被浏览器单方面清除的风险：
 * 1. 存储压力驱逐 —— 未获「持久化」授权的源，其 IndexedDB 可在磁盘紧张时被自动清理；
 * 2. Safari 7 天清理策略 —— 未持续访问的站点，其脚本可写存储可能被系统清除；
 * 3. 配额上限 —— 角色卡 + 对话历史 + 向量缓存增长后可能写入失败。
 *
 * `navigator.storage.persist()` 可申请持久化授权，显著降低被驱逐概率
 * （**非绝对保证**：用户仍可手动清除站点数据，浏览器也可能在极端情况下回收）。
 *
 * 端归属：仅 Web。Tauri 走本地文件系统，无此概念，调用方须按端分流
 * （见 App.vue 中 `getStorageEnv() === 'web'` 判断）。
 *
 * 设计参照 src/core/viewport.ts：模块级单例 ref，全仓共享同一份状态。
 */

/** 持久化授权状态 */
export type PersistState =
  /** 已获持久化授权 */
  | 'granted'
  /** 已查询/已申请，但未获授权（浏览器按参与度启发式判定，不弹窗） */
  | 'denied'
  /** 当前环境不支持 Storage API（如 Tauri、旧浏览器、非安全上下文） */
  | 'unsupported'
  /** 支持但查询/申请过程抛错 */
  | 'unknown';

/** 模块级单例：UI 直接绑定；未初始化时为 'unknown' */
export const persistState = ref<PersistState>('unknown');

/** 当前环境是否具备持久化能力（存在性探测，不发起申请） */
export function isPersistSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage === 'object' &&
    navigator.storage !== null &&
    typeof navigator.storage.persist === 'function' &&
    typeof navigator.storage.persisted === 'function'
  );
}

/** 查询当前持久化状态（只读，不发起申请） */
export async function getPersistState(): Promise<PersistState> {
  if (!isPersistSupported()) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

/**
 * 申请持久化授权。
 *
 * - 已授权：直接返回 'granted'，不重复调用（部分浏览器重复调用会消耗配额判定预算）
 * - 不支持：返回 'unsupported'，不抛错
 * - 异常：返回 'unknown'，不向上抛（持久化是增强能力，失败不得阻断启动）
 */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (!isPersistSupported()) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

/**
 * 启动时调用一次：申请授权并同步模块级状态。
 * 供 App.vue 在 Web 环境下调用；Tauri 环境不应调用（无此概念）。
 */
export async function initStoragePersistence(): Promise<PersistState> {
  const state = await requestPersistentStorage();
  persistState.value = state;
  return state;
}

/** 重新查询并刷新模块级状态（设置页手动刷新用） */
export async function refreshStoragePersistence(): Promise<PersistState> {
  const state = await getPersistState();
  persistState.value = state;
  return state;
}

/** 仅供测试使用：重置模块级状态 */
export function resetPersistState(): void {
  persistState.value = 'unknown';
}
