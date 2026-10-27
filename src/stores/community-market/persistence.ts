/**
 * R4-14 / B6：community-market store 的持久化域。
 *
 * 这一域管的是"引擎快照 + 三份元数据怎么落盘、开机怎么读回来"，
 * 包括四个存储键、旧 localStorage 存量的一次性迁移，以及 `commitTick`
 * （ bump 响应式计数器 + 顺手保存引擎 ）。
 *
 * 引擎实例与那四个 ref 都由宿主传进来 —— 与本目录 `remote.ts` 同一形状：
 * 拆文件不改变 Pinia 的响应式边界，也不让执行体反过来 import store。
 * `storageAdapter` 是这个模块自己的单例槽（宿主只通过 `setStorageAdapter` 注入）。
 */
import type { Ref } from 'vue';
import type { CommunityMarketEngine, MarketUser, SerializedMarketData } from '@/core/community-market';
import { type StorageAdapter } from '@storage/storage-adapter';
import { migrateLegacyLocalStorage } from '@storage/legacy-migration';
import { logger } from '@/utils/logger';

/** 快照键（沿用旧 localStorage 键名，便于一次性迁移存量数据） */
const SNAPSHOT_KEY = 'ai-roleplay:community-market';
const CURRENT_USER_KEY = 'ai-roleplay:community-current-user';
const FAVORITES_KEY = 'ai-roleplay:community-favorites';
const ORIGINS_KEY = 'ai-roleplay:community-installed-origins';

/** 依赖注入槽：模块级单例，语义与拆分前完全一致 */
let storageAdapter: StorageAdapter | null = null;

export interface MarketPersistenceCtx {
  engine: CommunityMarketEngine;
  currentUser: Ref<MarketUser | null>;
  favorites: Ref<string[]>;
  installedOrigins: Ref<Record<string, { itemId: string; version: string }>>;
  /** 是否已加载（loadFromDisk 结束时置真） */
  loaded: Ref<boolean>;
  /** 响应式触发器：引擎是非 ref 的类实例，改完必须 bump 它 */
  tick: Ref<number>;
}

export function createMarketPersistence(ctx: MarketPersistenceCtx) {
  const { engine, currentUser, favorites, installedOrigins, loaded, tick } = ctx;

  /** 保存全量市场数据（fire-and-forget） */
  async function persist(): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.saveSnapshot(SNAPSHOT_KEY, engine.toJSON());
    } catch (err) {
      logger.error('community-market', '持久化失败', err);
    }
  }

  /** 保存当前用户与收藏（fire-and-forget） */
  async function persistMeta(): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.saveSnapshot(CURRENT_USER_KEY, currentUser.value?.id ?? null);
      await storageAdapter.saveSnapshot(FAVORITES_KEY, favorites.value);
      await storageAdapter.saveSnapshot(ORIGINS_KEY, installedOrigins.value);
    } catch (err) {
      logger.error('community-market', '持久化失败', err);
    }
  }

  function commitTick(): void {
    tick.value++;
    void persist();
  }

  /**
   * 从存储层加载市场数据（含旧 localStorage 数据一次性迁移）
   *
   * 应用启动时调用一次。
   */
  async function loadFromDisk(): Promise<void> {
    if (!storageAdapter) {
      loaded.value = true;
      return;
    }
    await migrateLegacyLocalStorage(storageAdapter, SNAPSHOT_KEY);
    await migrateLegacyLocalStorage(storageAdapter, CURRENT_USER_KEY);
    await migrateLegacyLocalStorage(storageAdapter, FAVORITES_KEY);
    try {
      const data = await storageAdapter.loadSnapshot<SerializedMarketData>(
        SNAPSHOT_KEY
      );
      if (data) {
        engine.loadFromJSON(data);
      }
      // 恢复当前用户
      const userId = await storageAdapter.loadSnapshot<string>(CURRENT_USER_KEY);
      if (userId) {
        engine.setCurrentUser(userId);
        currentUser.value = engine.getCurrentUser();
      }
      const favs = await storageAdapter.loadSnapshot<string[]>(FAVORITES_KEY);
      if (Array.isArray(favs)) {
        favorites.value = favs;
      }
      const origins = await storageAdapter.loadSnapshot<Record<string, { itemId: string; version: string }>>(ORIGINS_KEY);
      if (origins && typeof origins === 'object') {
        installedOrigins.value = origins;
      }
    } catch (err) {
      logger.error('community-market', '加载失败', err);
    }
    loaded.value = true;
    tick.value++;
  }

  /** 强制保存到存储层 */
  async function persistNow(): Promise<void> {
    await persist();
    await persistMeta();
  }

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  return {
    persist,
    persistMeta,
    commitTick,
    loadFromDisk,
    persistNow,
    setStorageAdapter,
  };
}
