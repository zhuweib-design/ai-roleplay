import type { StorageAdapter } from './storage-adapter';

/**
 * 一次性迁移：将旧 localStorage 键的数据迁入 StorageAdapter 快照
 *
 * 背景（迭代33）：community-market / character-version 两个 store 曾绕过
 * StorageAdapter 直写 localStorage，导致 Tauri 环境下数据悬空于浏览器存储、
 * 备份无法覆盖。本函数在 loadFromDisk 时调用，将存量数据搬入快照。
 *
 * 规则：
 * - 仅当 adapter 中尚不存在该快照时执行（不覆盖新数据）
 * - 迁移成功后移除 localStorage 旧键
 * - 任何失败静默忽略，不阻塞主流程
 */
export async function migrateLegacyLocalStorage(
  adapter: StorageAdapter,
  key: string
): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    const existing = await adapter.loadSnapshot<unknown>(key);
    if (existing !== null) return;
    await adapter.saveSnapshot(key, JSON.parse(raw));
    localStorage.removeItem(key);
  } catch {
    // 迁移失败不阻塞主流程
  }
}
