import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isPersistSupported,
  getPersistState,
  requestPersistentStorage,
  initStoragePersistence,
  refreshStoragePersistence,
  resetPersistState,
  persistState,
} from '@/core/storage-persistence';

/**
 * P1-10：Web / PWA 持久化授权（navigator.storage.persist）
 *
 * jsdom 默认不提供 navigator.storage，故用可配置替身覆盖，并在每个用例后还原。
 */

interface StorageStub {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');

function stubStorage(value: StorageStub | undefined): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value });
}

function restoreStorage(): void {
  if (originalDescriptor) {
    Object.defineProperty(navigator, 'storage', originalDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'storage');
  }
}

describe('storage-persistence（Web 端持久化授权）', () => {
  beforeEach(() => {
    resetPersistState();
  });

  afterEach(() => {
    restoreStorage();
  });

  describe('isPersistSupported', () => {
    it('navigator.storage 缺失时返回 false', () => {
      stubStorage(undefined);
      expect(isPersistSupported()).toBe(false);
    });

    it('仅有 persisted 而缺 persist 时返回 false', () => {
      stubStorage({ persisted: () => Promise.resolve(true) });
      expect(isPersistSupported()).toBe(false);
    });

    it('仅有 persist 而缺 persisted 时返回 false', () => {
      stubStorage({ persist: () => Promise.resolve(true) });
      expect(isPersistSupported()).toBe(false);
    });

    it('两者齐备时返回 true', () => {
      stubStorage({ persisted: () => Promise.resolve(true), persist: () => Promise.resolve(true) });
      expect(isPersistSupported()).toBe(true);
    });
  });

  describe('getPersistState', () => {
    it('不支持时返回 unsupported', async () => {
      stubStorage(undefined);
      expect(await getPersistState()).toBe('unsupported');
    });

    it('persisted() 为 true 时返回 granted', async () => {
      stubStorage({ persisted: () => Promise.resolve(true), persist: () => Promise.resolve(true) });
      expect(await getPersistState()).toBe('granted');
    });

    it('persisted() 为 false 时返回 denied', async () => {
      stubStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) });
      expect(await getPersistState()).toBe('denied');
    });

    it('persisted() 抛错时返回 unknown', async () => {
      stubStorage({
        persisted: () => Promise.reject(new Error('boom')),
        persist: () => Promise.resolve(true),
      });
      expect(await getPersistState()).toBe('unknown');
    });
  });

  describe('requestPersistentStorage', () => {
    it('已授权时直接返回 granted，且不重复调用 persist()', async () => {
      const persist = vi.fn(() => Promise.resolve(true));
      stubStorage({ persisted: () => Promise.resolve(true), persist });

      expect(await requestPersistentStorage()).toBe('granted');
      expect(persist).not.toHaveBeenCalled();
    });

    it('未授权时调用 persist() 并返回 granted', async () => {
      const persist = vi.fn(() => Promise.resolve(true));
      stubStorage({ persisted: () => Promise.resolve(false), persist });

      expect(await requestPersistentStorage()).toBe('granted');
      expect(persist).toHaveBeenCalledTimes(1);
    });

    it('persist() 返回 false 时返回 denied', async () => {
      stubStorage({
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(false),
      });
      expect(await requestPersistentStorage()).toBe('denied');
    });

    it('persist() 抛错时返回 unknown 且不向上抛（持久化失败不得阻断启动）', async () => {
      stubStorage({
        persisted: () => Promise.resolve(false),
        persist: () => Promise.reject(new Error('denied by policy')),
      });
      await expect(requestPersistentStorage()).resolves.toBe('unknown');
    });

    it('不支持时返回 unsupported 且不抛错', async () => {
      stubStorage(undefined);
      await expect(requestPersistentStorage()).resolves.toBe('unsupported');
    });
  });

  describe('模块级状态同步', () => {
    it('initStoragePersistence 会把结果写入 persistState', async () => {
      stubStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(true) });
      expect(persistState.value).toBe('unknown');

      await initStoragePersistence();
      expect(persistState.value).toBe('granted');
    });

    it('refreshStoragePersistence 只查询、不发起申请', async () => {
      const persist = vi.fn(() => Promise.resolve(true));
      stubStorage({ persisted: () => Promise.resolve(false), persist });

      await refreshStoragePersistence();
      expect(persistState.value).toBe('denied');
      expect(persist).not.toHaveBeenCalled();
    });

    it('resetPersistState 归位为 unknown', async () => {
      stubStorage({ persisted: () => Promise.resolve(true), persist: () => Promise.resolve(true) });
      await initStoragePersistence();
      expect(persistState.value).toBe('granted');

      resetPersistState();
      expect(persistState.value).toBe('unknown');
    });
  });
});
