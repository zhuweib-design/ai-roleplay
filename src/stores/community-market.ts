/**
 * 角色卡社区市场 Store (模块5)
 *
 * 职责：
 * - 管理 CommunityMarketEngine 单例（含 Mock 数据初始化）
 * - 当前登录用户状态
 * - 角色卡列表的筛选/排序/搜索
 * - 收藏列表与下载历史（StorageAdapter 持久化）
 * - 发布/评论/举报操作
 * - 推荐列表
 *
 * 本文件自 B6 起是**装配层**：状态 + 依赖引擎的派生值 + 引擎动作的薄包装。
 * 三个内聚域各自成文件（工厂收实例状态、执行体不 import store，与
 * `chat-generation` / `story` / `group-chat` 同一形状）：
 * - `community-market/persistence.ts` 快照与元数据落盘、开机读回、commitTick
 * - `community-market/filters.ts`     六个筛选状态与 toFilter() 组装
 * - `community-market/moderation.ts`  管理 Tab 的审核/举报裁决/精选/删卡
 * - `community-market/remote.ts`      远程市场索引与真实下载（R4-14）
 *
 * 持久化策略：
 * - 引擎全量数据（用户/角色卡/评论/交易/举报）序列化为快照存入 StorageAdapter
 * - 当前用户 ID 单独存储，便于自动恢复登录
 * - 收藏列表单独存储
 * - 旧 localStorage 存量数据在 loadFromDisk 时一次性迁移
 */

import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  createMockEngine,
  type MarketUser,
  type MarketCharacterCard,
  type MarketReview,
  type MarketTransaction,
  type RecommendationItem,
  type RecommendationParams,
  type ReportReason,
} from '@/core/community-market';
import type { CharacterCard } from '@/core/character-card';
import type { MarketIndexItem } from '@/core/market-index';
import { useCharacterStore } from './character';
import { createMarketFilters } from './community-market/filters';
import { createMarketModeration } from './community-market/moderation';
import { createMarketPersistence } from './community-market/persistence';
import { createRemoteMarketActions } from './community-market/remote';

// ── 单例引擎 ──

const engine = createMockEngine();

// ── Store ──

export const useCommunityMarketStore = defineStore('communityMarket', () => {
  // ── 状态 ──

  const currentUser = ref<MarketUser | null>(null);

  /** 收藏列表（marketId 数组） */
  const favorites = ref<string[]>([]);

  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 最近一次信息 */
  const lastInfo = ref<string | null>(null);

  /** 响应式触发器 */
  const tick = ref(0);

  /** 是否已加载 */
  const loaded = ref(false);

  /** 下载进度：marketId → { received, total, status }（status: downloading/installing/done/failed） */
  const downloadProgress = ref<Record<
    string,
    { received: number; total: number; status: string }
  >>({});

  /** 远程市场索引条目列表（真实下载源） */
  const remoteItems = ref<MarketIndexItem[]>([]);
  /** 远程市场索引加载状态 */
  const remoteLoading = ref(false);
  /** 远程市场索引加载错误（null 表示无错） */
  const remoteError = ref<string | null>(null);

  /** §14.4 更新检查：已装本地角色 → 远程来源（characterId → {itemId, version}） */
  const installedOrigins = ref<Record<string, { itemId: string; version: string }>>({});

  // ── 子域装配（传的是同一份 ref，不改变响应式边界）──

  const filters = createMarketFilters();

  const persistence = createMarketPersistence({
    engine,
    currentUser,
    favorites,
    installedOrigins,
    loaded,
    tick,
  });
  const { commitTick, persistMeta } = persistence;

  const moderation = createMarketModeration({
    engine,
    favorites,
    lastError,
    lastInfo,
    commitTick,
    persistMeta,
  });

  const remote = createRemoteMarketActions({
    remoteItems,
    remoteLoading,
    remoteError,
    downloadProgress,
    installedOrigins,
    lastError,
    lastInfo,
    persistMeta,
  });

  // ── 计算属性 ──

  /** 是否已登录 */
  const isLoggedIn = computed(() => currentUser.value !== null);

  /** 全部角色卡（经过当前筛选+排序） */
  const filteredCards = computed<MarketCharacterCard[]>(() => {
    void tick.value;
    return engine.listCards(filters.toFilter(), filters.sortBy.value);
  });

  /** 全部分类 */
  const allCategories = computed<string[]>(() => {
    void tick.value;
    return engine.listCategories();
  });

  /** 需求1：每个分类的卡片数量（用于 FilterTabs 徽标） */
  const categoryCounts = computed<Record<string, number>>(() => {
    void tick.value;
    const counts: Record<string, number> = {};
    const all = engine.listCards({ approvedOnly: true }, 'popular');
    for (const c of all) {
      for (const cat of c.categories) {
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
    }
    return counts;
  });

  /** 全部标签 */
  const allTags = computed<string[]>(() => {
    void tick.value;
    return engine.listAllTags();
  });

  /** 统计信息 */
  const stats = computed(() => {
    void tick.value;
    return engine.getStats();
  });

  // ── 动作：用户认证 ──

  function login(name: string, avatar?: string): boolean {
    try {
      const user = engine.login(name, avatar);
      currentUser.value = user;
      void persistMeta();
      lastInfo.value = t('mkt.loggedIn', { name });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function logout(): void {
    engine.logout();
    currentUser.value = null;
    void persistMeta();
    lastInfo.value = t('mkt.loggedOut');
    commitTick();
  }

  // ── 动作：角色卡详情 ──

  function getCard(marketId: string): MarketCharacterCard | null {
    return engine.getCard(marketId);
  }

  function getReviews(marketId: string): MarketReview[] {
    return engine.getReviews(marketId);
  }

  // ── 动作：下载 ──

  function downloadCard(marketId: string): boolean {
    if (!currentUser.value) {
      lastError.value = t('mkt.needLogin');
      return false;
    }
    try {
      engine.downloadCard(marketId, currentUser.value.id);
      lastInfo.value = t('mkt.downloadOk');
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function hasDownloaded(marketId: string): boolean {
    if (!currentUser.value) return false;
    return engine.hasUserDownloaded(marketId, currentUser.value.id);
  }

  function getDownloadHistory(): MarketTransaction[] {
    if (!currentUser.value) return [];
    return engine.getUserDownloads(currentUser.value.id);
  }

  // ── 动作：收藏 ──

  function isFavorite(marketId: string): boolean {
    return favorites.value.includes(marketId);
  }

  function toggleFavorite(marketId: string): void {
    const idx = favorites.value.indexOf(marketId);
    if (idx >= 0) {
      favorites.value.splice(idx, 1);
      engine.decrementFavorite(marketId);
    } else {
      favorites.value.push(marketId);
      engine.incrementFavorite(marketId);
    }
    void persistMeta();
    commitTick();
  }

  function getFavoriteCards(): MarketCharacterCard[] {
    return favorites.value
      .map((id) => engine.getCard(id))
      .filter((c): c is MarketCharacterCard => c !== null);
  }

  // ── 动作：发布 ──

  function publishCard(
    card: CharacterCard,
    categories: string[] = []
  ): string | null {
    if (!currentUser.value) {
      lastError.value = t('mkt.needLogin');
      return null;
    }
    try {
      const marketId = engine.publishCard(
        card,
        currentUser.value.id,
        categories
      );
      lastInfo.value = t('mkt.published', { name: card.name });
      commitTick();
      return marketId;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  /**
   * 从 character store 拉取当前角色并发布
   */
  function publishCurrentCharacter(
    characterId: string,
    categories: string[] = []
  ): string | null {
    if (!currentUser.value) {
      lastError.value = t('mkt.needLogin');
      return null;
    }
    const charStore = useCharacterStore();
    const character = charStore.characters.find((c) => c.id === characterId);
    if (!character) {
      lastError.value = t('mkt.charNotExist');
      return null;
    }
    const card: CharacterCard = {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      description: character.description,
      personality: '',
      scenario: '',
      firstMessage: '',
      alternateGreetings: [],
      exampleMessages: '',
      characterNote: null,
      talkativeness: 50,
      tags: character.tags,
      favorite: character.favorite,
      version: '1.0',
      createdAt: character.lastActive,
      updatedAt: new Date().toISOString(),
      attributes: character.attributes,
    };
    return publishCard(card, categories);
  }

  // ── 动作：评论 ──

  function addReview(
    marketId: string,
    rating: number,
    comment: string
  ): boolean {
    if (!currentUser.value) {
      lastError.value = t('mkt.needLogin');
      return false;
    }
    try {
      engine.addReview(
        marketId,
        currentUser.value.id,
        rating,
        comment
      );
      lastInfo.value = t('mkt.reviewPosted');
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function likeReview(reviewId: string): void {
    engine.likeReview(reviewId);
    commitTick();
  }

  // ── 动作：举报 ──

  function reportCard(
    marketId: string,
    reason: ReportReason,
    description: string
  ): boolean {
    if (!currentUser.value) {
      lastError.value = t('mkt.needLogin');
      return false;
    }
    try {
      engine.reportCard(
        marketId,
        currentUser.value.id,
        reason,
        description
      );
      lastInfo.value = t('mkt.reportSubmitted');
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  // ── 动作：推荐 ──

  function getRecommendations(
    params?: Partial<RecommendationParams>
  ): RecommendationItem[] {
    // 未登录时不返回推荐
    if (!currentUser.value) {
      return [];
    }
    const fullParams: RecommendationParams = {
      preferredTags: params?.preferredTags ?? getPreferredTags(),
      preferredCategories: params?.preferredCategories ?? [],
      excludeIds:
        params?.excludeIds ??
        engine
          .getUserDownloads(currentUser.value.id)
          .map((t) => t.marketId),
      limit: params?.limit ?? 6,
    };
    return engine.getRecommendations(fullParams);
  }

  /**
   * 基于收藏的角色卡标签推断用户偏好
   */
  function getPreferredTags(): string[] {
    const tags = new Set<string>();
    for (const fav of getFavoriteCards()) {
      for (const tag of fav.card.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags);
  }

  // ── 动作：错误清理 ──

  function clearLastError(): void {
    lastError.value = null;
  }

  function clearLastInfo(): void {
    lastInfo.value = null;
  }

  // ── 测试专用 ──

  function _resetForTesting(): void {
    const fresh = createMockEngine();
    const data = fresh.toJSON();
    engine.loadFromJSON(data);
    currentUser.value = null;
    favorites.value = [];
    filters.searchQuery.value = '';
    filters.selectedTags.value = [];
    filters.selectedCategories.value = [];
    filters.minRating.value = 0;
    filters.featuredOnly.value = false;
    filters.sortBy.value = 'popular';
    lastError.value = null;
    lastInfo.value = null;
    loaded.value = false;
    tick.value++;
  }

  return {
    // 状态
    currentUser,
    favorites,
    lastError,
    lastInfo,
    loaded,
    // 计算属性
    isLoggedIn,
    filteredCards,
    allCategories,
    /** 需求1：分类计数（用于 FilterTabs 徽标） */
    categoryCounts,
    allTags,
    stats,
    // 筛选/排序（状态与方法都在 filters 子域，这里原样透出）
    searchQuery: filters.searchQuery,
    selectedTags: filters.selectedTags,
    selectedCategories: filters.selectedCategories,
    minRating: filters.minRating,
    featuredOnly: filters.featuredOnly,
    sortBy: filters.sortBy,
    /** 需求1：当前单选分类 */
    currentCategory: filters.currentCategory,
    setSearch: filters.setSearch,
    toggleTag: filters.toggleTag,
    toggleCategory: filters.toggleCategory,
    /** 需求1：单选模式设置分类 */
    setCategory: filters.setCategory,
    setMinRating: filters.setMinRating,
    toggleFeaturedOnly: filters.toggleFeaturedOnly,
    setSortBy: filters.setSortBy,
    clearFilters: filters.clearFilters,
    // 加载/持久化
    loadFromDisk: persistence.loadFromDisk,
    persistNow: persistence.persistNow,
    // 依赖注入
    setStorageAdapter: persistence.setStorageAdapter,
    // 用户认证
    login,
    logout,
    // 角色卡详情
    getCard,
    getReviews,
    // 下载
    downloadCard,
    hasDownloaded,
    getDownloadHistory,
    // 远程市场（T-11 真实下载流）
    remoteItems,
    remoteLoading,
    remoteError,
    downloadProgress,
    loadRemoteIndex: remote.loadRemoteIndex,
    installRemoteItem: remote.installRemoteItem,
    // §14.4 更新检查
    installedOrigins,
    getUpdatableInstalls: remote.getUpdatableInstalls,
    // 收藏
    isFavorite,
    toggleFavorite,
    getFavoriteCards,
    // 发布
    publishCard,
    publishCurrentCharacter,
    // 评论
    addReview,
    likeReview,
    // 举报
    reportCard,
    // 推荐
    getReports: moderation.getReports,
    resolveReport: moderation.resolveReport,
    getRecommendations,
    getPreferredTags,
    // 管理
    setModerationStatus: moderation.setModerationStatus,
    setFeatured: moderation.setFeatured,
    deleteCard: moderation.deleteCard,
    // 错误清理
    clearLastError,
    clearLastInfo,
    // 测试
    _resetForTesting,
  };
});
