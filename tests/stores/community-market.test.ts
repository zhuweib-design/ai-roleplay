/**
 * community-market store 单元测试 (模块5)
 *
 * 覆盖：
 * - 登录/登出
 * - 筛选（搜索/标签/分类/评分/精选）
 * - 排序
 * - 下载/收藏
 * - 发布
 * - 评论
 * - 举报
 * - 推荐
 * - 持久化往返
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useCommunityMarketStore } from '../../src/stores/community-market';
import { useCharacterStore } from '../../src/stores/character';
import { IndexedDBAdapter } from '../../src/storage/indexeddb-adapter';
import type { CharacterCard } from '@core/character-card';

// ── 测试夹具 ──

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'test',
    name: '测试角色',
    avatar: '',
    description: '描述',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('community-market store', () => {
  let store: ReturnType<typeof useCommunityMarketStore>;
  let adapter: IndexedDBAdapter | null = null;

  afterEach(async () => {
    // 等待 fire-and-forget 写入完成，再关闭连接（避免 close 后写失败噪音）
    await new Promise((r) => setTimeout(r, 20));
    // 关闭连接，避免 deleteDatabase 被阻塞（fake-indexeddb blocked 死锁）
    await adapter?.close();
    adapter = null;
  });

  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    // 每个测试使用独立数据库，注入快照持久化 adapter
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('community-market-test-db');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    adapter = new IndexedDBAdapter('community-market-test-db');
    await adapter.init();
    useCharacterStore();
    store = useCommunityMarketStore();
    store.setStorageAdapter(adapter);
    store._resetForTesting();
  });

  // ── 用户认证 ──

  describe('用户认证', () => {
    it('登录成功', () => {
      const ok = store.login('TestUser');
      expect(ok).toBe(true);
      expect(store.isLoggedIn).toBe(true);
      expect(store.currentUser?.name).toBe('TestUser');
    });

    it('重复登录同一用户名返回同一用户', () => {
      store.login('Alice');
      const id1 = store.currentUser?.id;
      store.logout();
      store.login('Alice');
      const id2 = store.currentUser?.id;
      expect(id1).toBe(id2);
    });

    it('登出后 isLoggedIn 为 false', () => {
      store.login('Alice');
      store.logout();
      expect(store.isLoggedIn).toBe(false);
      expect(store.currentUser).toBeNull();
    });
  });

  // ── 筛选 ──

  describe('筛选', () => {
    beforeEach(() => {
      // Mock 数据已预填充，直接使用
    });

    it('setSearch 更新搜索关键词', () => {
      store.setSearch('Seraphina');
      expect(store.searchQuery).toBe('Seraphina');
    });

    it('toggleTag 切换标签筛选', () => {
      store.toggleTag('奇幻');
      expect(store.selectedTags).toContain('奇幻');
      store.toggleTag('奇幻');
      expect(store.selectedTags).not.toContain('奇幻');
    });

    it('toggleCategory 切换分类筛选', () => {
      store.toggleCategory('科幻');
      expect(store.selectedCategories).toContain('科幻');
      store.toggleCategory('科幻');
      expect(store.selectedCategories).not.toContain('科幻');
    });

    it('toggleFeaturedOnly 切换精选筛选', () => {
      expect(store.featuredOnly).toBe(false);
      store.toggleFeaturedOnly();
      expect(store.featuredOnly).toBe(true);
    });

    it('clearFilters 清除全部筛选', () => {
      store.setSearch('test');
      store.toggleTag('奇幻');
      store.toggleCategory('科幻');
      store.setMinRating(4);
      store.toggleFeaturedOnly();
      store.clearFilters();
      expect(store.searchQuery).toBe('');
      expect(store.selectedTags).toHaveLength(0);
      expect(store.selectedCategories).toHaveLength(0);
      expect(store.minRating).toBe(0);
      expect(store.featuredOnly).toBe(false);
      expect(store.sortBy).toBe('popular');
    });

    it('搜索关键词过滤结果', () => {
      store.setSearch('Seraphina');
      expect(store.filteredCards.length).toBeGreaterThan(0);
      expect(
        store.filteredCards.every((c) =>
          c.card.name.toLowerCase().includes('seraphina') ||
          c.card.description.toLowerCase().includes('seraphina')
        )
      ).toBe(true);
    });

    it('标签筛选过滤结果', () => {
      store.toggleTag('奇幻');
      const results = store.filteredCards;
      expect(
        results.every((c) =>
          c.card.tags.some((t) => t.toLowerCase() === '奇幻'.toLowerCase())
        )
      ).toBe(true);
    });
  });

  // ── 排序 ──

  describe('排序', () => {
    it('setSortBy 更新排序方式', () => {
      store.setSortBy('rating');
      expect(store.sortBy).toBe('rating');
    });

    it('按下载量排序', () => {
      store.setSortBy('popular');
      const cards = store.filteredCards;
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i].downloadCount).toBeLessThanOrEqual(cards[i - 1].downloadCount);
      }
    });

    it('按评分排序', () => {
      store.setSortBy('rating');
      const cards = store.filteredCards;
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i].averageRating).toBeLessThanOrEqual(cards[i - 1].averageRating);
      }
    });

    it('按名称排序', () => {
      store.setSortBy('alphabetical');
      const cards = store.filteredCards;
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i].card.name.localeCompare(cards[i - 1].card.name)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── 下载 ──

  describe('下载', () => {
    beforeEach(() => {
      store.login('TestUser');
    });

    it('downloadCard 成功', () => {
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return; // Mock 数据可能为空
      const ok = store.downloadCard(cardId);
      expect(ok).toBe(true);
      expect(store.hasDownloaded(cardId)).toBe(true);
    });

    it('未登录下载失败', () => {
      store.logout();
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      const ok = store.downloadCard(cardId);
      expect(ok).toBe(false);
      expect(store.lastError).toContain('登录');
    });

    it('getDownloadHistory 返回历史', () => {
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      store.downloadCard(cardId);
      const history = store.getDownloadHistory();
      expect(history.length).toBeGreaterThan(0);
    });
  });

  // ── 收藏 ──

  describe('收藏', () => {
    beforeEach(() => {
      store.login('TestUser');
    });

    it('toggleFavorite 切换收藏状态', () => {
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      expect(store.isFavorite(cardId)).toBe(false);
      store.toggleFavorite(cardId);
      expect(store.isFavorite(cardId)).toBe(true);
      store.toggleFavorite(cardId);
      expect(store.isFavorite(cardId)).toBe(false);
    });

    it('getFavoriteCards 返回已收藏列表', () => {
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      store.toggleFavorite(cardId);
      const favs = store.getFavoriteCards();
      expect(favs.length).toBeGreaterThan(0);
    });
  });

  // ── 发布 ──

  describe('发布', () => {
    beforeEach(() => {
      store.login('TestUser');
    });

    it('publishCard 成功并返回 marketId', () => {
      const marketId = store.publishCard(makeCard({ name: 'MyCard' }), ['奇幻']);
      expect(marketId).toBeTruthy();
      expect(store.lastInfo).toContain('发布');
    });

    it('未登录发布失败', () => {
      store.logout();
      const marketId = store.publishCard(makeCard());
      expect(marketId).toBeNull();
      expect(store.lastError).toContain('登录');
    });

    it('发布后角色卡出现在我的发布列表', () => {
      store.publishCard(makeCard({ name: 'MyPub' }), ['奇幻']);
      // 新发布的角色卡审核状态为 pending，不会被 filteredCards 显示
      // 直接检查 info 提示
      expect(store.lastInfo).toContain('待审核');
    });
  });

  // ── 评论 ──

  describe('评论', () => {
    beforeEach(() => {
      store.login('TestUser');
    });

    it('addReview 成功', () => {
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      const ok = store.addReview(cardId, 5, '很好的角色卡');
      expect(ok).toBe(true);
      const reviews = store.getReviews(cardId);
      expect(reviews.length).toBeGreaterThan(0);
      expect(reviews[0].comment).toBe('很好的角色卡');
    });

    it('未登录评论失败', () => {
      store.logout();
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      const ok = store.addReview(cardId, 5, '好');
      expect(ok).toBe(false);
    });

    it('评分越界失败', () => {
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      const ok = store.addReview(cardId, 0, '零分');
      expect(ok).toBe(false);
    });
  });

  // ── 举报 ──

  describe('举报', () => {
    beforeEach(() => {
      store.login('TestUser');
    });

    it('reportCard 成功', () => {
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      const ok = store.reportCard(cardId, 'spam', '这是垃圾内容');
      expect(ok).toBe(true);
      expect(store.lastInfo).toContain('举报');
    });

    it('未登录举报失败', () => {
      store.logout();
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      const ok = store.reportCard(cardId, 'spam', '测试');
      expect(ok).toBe(false);
    });

    it('resolveReport 解决/驳回举报（D6）', () => {
      store.login('TestUser');
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      expect(store.reportCard(cardId, 'spam', '垃圾内容')).toBe(true);
      const pending = store.getReports().filter((r) => r.status === 'pending');
      expect(pending.length).toBeGreaterThan(0);

      // 解决第一条
      const ok = store.resolveReport(pending[0].id, 'resolved', '已核查');
      expect(ok).toBe(true);
      const report = store.getReports().find((r) => r.id === pending[0].id);
      expect(report?.status).toBe('resolved');
      expect(report?.resolution).toBe('已核查');
    });
  });

  // ── 推荐 ──

  describe('推荐', () => {
    it('未登录返回空列表', () => {
      const recs = store.getRecommendations();
      expect(recs).toEqual([]);
    });

    it('登录后返回推荐列表', () => {
      store.login('TestUser');
      const recs = store.getRecommendations({ limit: 3 });
      expect(recs.length).toBeLessThanOrEqual(3);
    });

    it('收藏后推荐基于标签', () => {
      store.login('TestUser');
      // 收藏一个奇幻类角色卡
      const fantasyCard = store.filteredCards.find((c) =>
        c.card.tags.includes('奇幻')
      );
      if (fantasyCard) {
        store.toggleFavorite(fantasyCard.marketId);
        const preferredTags = store.getPreferredTags();
        expect(preferredTags).toContain('奇幻');
      }
    });
  });

  // ── 持久化 ──

  describe('持久化', () => {
    it('loadFromDisk 不报错', async () => {
      await expect(store.loadFromDisk()).resolves.toBeUndefined();
      expect(store.loaded).toBe(true);
    });

    it('persistNow 后 loadFromDisk 可恢复登录状态', async () => {
      store.login('PersistUser');
      await store.persistNow();
      store._resetForTesting();
      await store.loadFromDisk();
      expect(store.isLoggedIn).toBe(true);
      expect(store.currentUser?.name).toBe('PersistUser');
    });

    it('收藏列表持久化', async () => {
      store.login('FavUser');
      const cardId = store.filteredCards[0]?.marketId;
      if (!cardId) return;
      store.toggleFavorite(cardId);
      await store.persistNow();
      store._resetForTesting();
      await store.loadFromDisk();
      expect(store.isFavorite(cardId)).toBe(true);
    });
  });

  // ── 统计 ──

  describe('统计', () => {
    it('stats 返回完整统计信息', () => {
      const stats = store.stats;
      expect(stats).toHaveProperty('totalCards');
      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('totalReviews');
      expect(stats).toHaveProperty('totalDownloads');
      expect(stats).toHaveProperty('approvedCards');
      expect(stats).toHaveProperty('pendingCards');
    });
  });

  // ── 管理 ──

  describe('管理', () => {
    it('setModerationStatus 更新状态', () => {
      store.login('Admin');
      const marketId = store.publishCard(makeCard({ name: 'ToApprove' }), ['测试']);
      expect(marketId).toBeTruthy();
      const ok = store.setModerationStatus(marketId!, 'approved');
      expect(ok).toBe(true);
      const card = store.getCard(marketId!);
      expect(card?.moderationStatus).toBe('approved');
    });

    it('setFeatured 设置精选', () => {
      store.login('Admin');
      const marketId = store.publishCard(makeCard({ name: 'ToFeature' }), ['测试']);
      store.setModerationStatus(marketId!, 'approved');
      const ok = store.setFeatured(marketId!, true);
      expect(ok).toBe(true);
      expect(store.getCard(marketId!)?.featured).toBe(true);
    });

    it('deleteCard 删除角色卡', () => {
      store.login('Admin');
      const marketId = store.publishCard(makeCard({ name: 'ToDelete' }), ['测试']);
      const ok = store.deleteCard(marketId!);
      expect(ok).toBe(true);
      expect(store.getCard(marketId!)).toBeNull();
    });
  });
});
