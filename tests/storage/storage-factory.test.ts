/**
 * storage-factory — Profile 隔离 (T-12) 测试
 *
 * 覆盖：
 * - 默认 profile 'default'
 * - setActiveProfileId 持久化与非法名回退
 * - Web 环境按 profile 生成独立 IndexedDB 库名
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getActiveProfileId,
  setActiveProfileId,
  DEFAULT_PROFILE,
  resetStorageAdapter,
} from '@storage/storage-factory';

describe('storage-factory Profile (T-12)', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* noop */
    }
    resetStorageAdapter();
    vi.restoreAllMocks();
  });

  it('默认 profile 为 default', () => {
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE);
  });

  it('setActiveProfileId 持久化并可读回', () => {
    setActiveProfileId('project-a');
    expect(getActiveProfileId()).toBe('project-a');
  });

  it('非法 profile 名回退为 default', () => {
    setActiveProfileId('bad name!');
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE);
    setActiveProfileId('中文名');
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE);
    setActiveProfileId('x'.repeat(33));
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE);
  });

  it('Web 环境按 profile 隔离 IndexedDB 库名', async () => {
    // 排除 Tauri 环境分支 + 重置模块缓存使 doMock 生效
    // 注意:isTauriEnv 用 in 检查,属性存在(即使 undefined)即命中,须真删除
    try {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    } catch {
      /* noop */
    }
    vi.resetModules();
    const IndexedDBAdapterMock = vi.fn();
    vi.doMock('@storage/indexeddb-adapter', () => ({
      IndexedDBAdapter: class {
        constructor(dbName: string) {
          IndexedDBAdapterMock(dbName);
        }
      },
    }));

    const { getStorageAdapter: getAdapter, resetStorageAdapter: resetAdapter, setActiveProfileId: setProfile, getActiveProfileId: getProfile } = await import('@storage/storage-factory');
    try {
      resetAdapter();
      getAdapter();
      expect(IndexedDBAdapterMock).toHaveBeenCalledWith('ai-roleplay');

      resetAdapter();
      setProfile('profile-x');
      expect(getProfile()).toBe('profile-x');
      getAdapter();
      expect(IndexedDBAdapterMock).toHaveBeenLastCalledWith('ai-roleplay-profile-x');
    } finally {
      vi.doUnmock('@storage/indexeddb-adapter');
    }
  });
});