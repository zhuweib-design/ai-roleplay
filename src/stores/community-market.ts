/**
 * 角色卡社区市场 Store (模块5)
 *
 * 职责：
 * - 管理 CommunityMarketEngine 单例（含 Mock 数据初始化）
 * - 当前登录用户状态
 * - 角色卡列表的筛选/排序/搜索
 * - 收藏列表与下载历史（localStorage 持久化）
 * - 发布/评论/举报操作
 * - 推荐列表
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
  type MarketFilter,
  type SortOption,
  type RecommendationItem,
  type RecommendationParams,
  type ReportReason,
  type ModerationStatus,
  type MarketReport,
  type SerializedMarketData,
} from '@/core/community-market';
import type { CharacterCard } from '@/core/character-card';
import { useCharacterStore } from './character';
import type { StorageAdapter } from '@storage/storage-adapter';
import { migrateLegacyLocalStorage } from '@storage/legacy-migration';

// ── 常量 ──

/** 快照键（沿用旧 localStorage 键名，便于一次性迁移存量数据） */
const SNAPSHOT_KEY = 'ai-roleplay:community-market';
const CURRENT_USER_KEY = 'ai-roleplay:community-current-user';
const FAVORITES_KEY = 'ai-roleplay:community-favorites';

// ── 单例引擎 ──

const engine = createMockEngine();

// ── 依赖注入 ──

let storageAdapter: StorageAdapter | null = null;

// ── Store ──

export const useCommunityMarketStore = defineStore('communityMarket', () => {
  // ── 状态 ──

  const currentUser = ref<MarketUser | null>(null);

  /** 搜索关键词 */
  const searchQuery = ref('');

  /** 当前筛选标签 */
  const selectedTags = ref<string[]>([]);

  /** 当前筛选分类 */
  const selectedCategories = ref<string[]>([]);

  /** 最低评分筛选 */
  const minRating = ref(0);

  /** 是否仅显示精选 */
  const featuredOnly = ref(false);

  /** 排序方式 */
  const sortBy = ref<SortOption>('popular');

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

  // ── 计算属性 ──

  /** 是否已登录 */
  const isLoggedIn = computed(() => currentUser.value !== null);

  /** 全部角色卡（经过当前筛选+排序） */
  const filteredCards = computed<MarketCharacterCard[]>(() => {
    tick.value;
    const filter: MarketFilter = {
      search: searchQuery.value || undefined,
      tags: selectedTags.value.length > 0 ? selectedTags.value : undefined,
      categories:
        selectedCategories.value.length > 0
          ? selectedCategories.value
          : undefined,
      minRating: minRating.value > 0 ? minRating.value : undefined,
      featuredOnly: featuredOnly.value || undefined,
      approvedOnly: true,
    };
    return engine.listCards(filter, sortBy.value);
  });

  /** 全部分类 */
  const allCategories = computed<string[]>(() => {
    tick.value;
    return engine.listCategories();
  });

  /** 需求1：每个分类的卡片数量（用于 FilterTabs 徽标） */
  const categoryCounts = computed<Record<string, number>>(() => {
    tick.value;
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
    tick.value;
    return engine.listAllTags();
  });

  /** 统计信息 */
  const stats = computed(() => {
    tick.value;
    return engine.getStats();
  });

  // ── 内部辅助 ──

  /** 保存全量市场数据（fire-and-forget） */
  async function persist(): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.saveSnapshot(SNAPSHOT_KEY, engine.toJSON());
    } catch (err) {
      console.error('[community-market] 持久化失败：', err);
    }
  }

  /** 保存当前用户与收藏（fire-and-forget） */
  async function persistMeta(): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.saveSnapshot(CURRENT_USER_KEY, currentUser.value?.id ?? null);
      await storageAdapter.saveSnapshot(FAVORITES_KEY, favorites.value);
    } catch (err) {
      console.error('[community-market] 持久化失败：', err);
    }
  }

  function commitTick(): void {
    tick.value++;
    void persist();
  }

  // ── 动作：加载/持久化 ──

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
    } catch (err) {
      console.error('[community-market] 加载失败：', err);
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

  // ── 动作：筛选/排序 ──

  function setSearch(query: string): void {
    searchQuery.value = query;
  }

  function toggleTag(tag: string): void {
    const idx = selectedTags.value.indexOf(tag);
    if (idx >= 0) {
      selectedTags.value.splice(idx, 1);
    } else {
      selectedTags.value.push(tag);
    }
  }

  function toggleCategory(cat: string): void {
    const idx = selectedCategories.value.indexOf(cat);
    if (idx >= 0) {
      selectedCategories.value.splice(idx, 1);
    } else {
      selectedCategories.value.push(cat);
    }
  }

  /** 需求1：单选模式设置分类（传 '' 清空，单选模式用于 FilterTabs） */
  function setCategory(cat: string): void {
    if (!cat) {
      selectedCategories.value = [];
    } else {
      selectedCategories.value = [cat];
    }
  }

  /** 需求1：当前单选分类（取 selectedCategories 第一个；空数组=未选） */
  const currentCategory = computed<string>(() => selectedCategories.value[0] ?? '');

  function setMinRating(rating: number): void {
    minRating.value = rating;
  }

  function toggleFeaturedOnly(): void {
    featuredOnly.value = !featuredOnly.value;
  }

  function setSortBy(sort: SortOption): void {
    sortBy.value = sort;
  }

  function clearFilters(): void {
    searchQuery.value = '';
    selectedTags.value = [];
    selectedCategories.value = [];
    minRating.value = 0;
    featuredOnly.value = false;
    sortBy.value = 'popular';
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

  // ── 动作：管理（审核） ──

  function setModerationStatus(
    marketId: string,
    status: ModerationStatus
  ): boolean {
    try {
      engine.setModerationStatus(marketId, status);
      lastInfo.value = t('mkt.statusUpdated', { status });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** D6 补完：获取举报列表（管理 Tab） */
  function getReports(): MarketReport[] {
    return engine.getReports();
  }

  /** D6 补完：解决/驳回举报（管理 Tab） */
  function resolveReport(
    reportId: string,
    status: 'resolved' | 'dismissed',
    resolution?: string
  ): boolean {
    try {
      engine.resolveReport(reportId, status, resolution);
      lastInfo.value = t('mkt.reportHandled', { status: status === 'resolved' ? t('mkt.resolved') : t('mkt.dismissed') });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function setFeatured(marketId: string, featured: boolean): boolean {
    try {
      engine.setFeatured(marketId, featured);
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function deleteCard(marketId: string): boolean {
    const ok = engine.deleteCard(marketId);
    if (ok) {
      // 从收藏中移除
      const idx = favorites.value.indexOf(marketId);
      if (idx >= 0) {
        favorites.value.splice(idx, 1);
        void persistMeta();
      }
      lastInfo.value = t('mkt.cardDeleted');
      commitTick();
    }
    return ok;
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
    searchQuery.value = '';
    selectedTags.value = [];
    selectedCategories.value = [];
    minRating.value = 0;
    featuredOnly.value = false;
    sortBy.value = 'popular';
    lastError.value = null;
    lastInfo.value = null;
    loaded.value = false;
    tick.value++;
  }

  return {
    // 状态
    currentUser,
    searchQuery,
    selectedTags,
    selectedCategories,
    minRating,
    featuredOnly,
    sortBy,
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
    /** 需求1：当前单选分类 */
    currentCategory,
    allTags,
    stats,
    // 加载/持久化
    loadFromDisk,
    persistNow,
    // 依赖注入
    setStorageAdapter,
    // 用户认证
    login,
    logout,
    // 筛选/排序
    setSearch,
    toggleTag,
    toggleCategory,
    /** 需求1：单选模式设置分类 */
    setCategory,
    setMinRating,
    toggleFeaturedOnly,
    setSortBy,
    clearFilters,
    // 角色卡详情
    getCard,
    getReviews,
    // 下载
    downloadCard,
    hasDownloaded,
    getDownloadHistory,
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
    getReports,
    resolveReport,
    getRecommendations,
    getPreferredTags,
    // 管理
    setModerationStatus,
    setFeatured,
    deleteCard,
    // 错误清理
    clearLastError,
    clearLastInfo,
    // 测试
    _resetForTesting,
  };
});
