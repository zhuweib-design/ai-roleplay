/**
 * community-market 单元测试 (模块5)
 *
 * 覆盖：
 * - generateId 唯一性
 * - 用户注册/登录/登出
 * - 角色卡发布/查询/删除
 * - 列表筛选（搜索/标签/分类/评分/精选/作者）
 * - 列表排序（热门/评分/最新/名称）
 * - 下载与交易记录
 * - 收藏计数
 * - 评论与评分计算
 * - 举报与处理
 * - 推荐算法
 * - 统计信息
 * - 序列化往返
 * - Mock 数据完整性
 */
import { describe, test, expect } from 'vitest';
import {
  CommunityMarketEngine,
  createMockEngine,
  generateId,
} from '@core/community-market';
import type { CharacterCard } from '@core/character-card';

// ── 测试夹具 ──

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'test-card',
    name: '测试角色',
    avatar: '',
    description: '测试描述',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: ['测试'],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createEngineWithUser(): { engine: CommunityMarketEngine; userId: string } {
  const engine = new CommunityMarketEngine();
  const user = engine.registerUser('TestUser');
  return { engine, userId: user.id };
}

// ── 工具函数 ──

describe('generateId', () => {
  test('生成带前缀的唯一 ID', () => {
    const id1 = generateId('test');
    const id2 = generateId('test');
    expect(id1).not.toBe(id2);
    expect(id1.startsWith('test_')).toBe(true);
  });
});

// ── 用户管理 ──

describe('用户管理', () => {
  test('注册新用户', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Alice');
    expect(user.name).toBe('Alice');
    expect(user.id).toBeTruthy();
    expect(user.publishedCount).toBe(0);
  });

  test('注册重复用户名抛错', () => {
    const engine = new CommunityMarketEngine();
    engine.registerUser('Alice');
    expect(() => engine.registerUser('Alice')).toThrow(/已被占用/);
    expect(() => engine.registerUser('alice')).toThrow(/已被占用/);
  });

  test('登录已存在用户', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Alice');
    engine.logout();
    const loggedIn = engine.login('Alice');
    expect(loggedIn.id).toBe(user.id);
    expect(engine.getCurrentUser()?.id).toBe(user.id);
  });

  test('登录新用户名自动注册', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.login('NewUser');
    expect(user.name).toBe('NewUser');
    expect(engine.getCurrentUser()?.id).toBe(user.id);
  });

  test('登出后当前用户为 null', () => {
    const engine = new CommunityMarketEngine();
    engine.login('Alice');
    engine.logout();
    expect(engine.getCurrentUser()).toBeNull();
  });

  test('setCurrentUser 恢复登录状态', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Alice');
    engine.logout();
    engine.setCurrentUser(user.id);
    expect(engine.getCurrentUser()?.id).toBe(user.id);
  });

  test('getUser 按 ID 获取', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Alice');
    expect(engine.getUser(user.id)?.name).toBe('Alice');
    expect(engine.getUser('nonexistent')).toBeNull();
  });
});

// ── 角色卡发布 ──

describe('角色卡发布', () => {
  test('发布角色卡并返回 marketId', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    expect(marketId).toBeTruthy();
    expect(marketId.startsWith('card_')).toBe(true);
  });

  test('发布后 author 的 publishedCount 增加', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(makeCard(), userId);
    const user = engine.getUser(userId)!;
    expect(user.publishedCount).toBe(1);
  });

  test('发布后 card 的审核状态为 pending', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    const card = engine.getCard(marketId)!;
    expect(card.moderationStatus).toBe('pending');
  });

  test('未注册用户发布抛错', () => {
    const engine = new CommunityMarketEngine();
    expect(() => engine.publishCard(makeCard(), 'nonexistent')).toThrow(/用户不存在/);
  });
});

// ── 角色卡查询与筛选 ──

describe('角色卡查询与筛选', () => {
  test('getCard 获取已发布的角色卡', () => {
    const { engine, userId } = createEngineWithUser();
    const card = makeCard({ name: 'MyCard' });
    const marketId = engine.publishCard(card, userId);
    const retrieved = engine.getCard(marketId);
    expect(retrieved?.card.name).toBe('MyCard');
  });

  test('getCard 不存在返回 null', () => {
    const engine = new CommunityMarketEngine();
    expect(engine.getCard('nonexistent')).toBeNull();
  });

  test('listCards 默认返回已审核的角色卡', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(makeCard({ name: 'Card1' }), userId);
    // 未审核 → 不出现在默认列表
    expect(engine.listCards()).toHaveLength(0);
    // 审核通过后出现在列表
    const cards = engine.listCards({ approvedOnly: false });
    expect(cards).toHaveLength(1);
  });

  test('搜索关键词匹配名称', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(makeCard({ name: 'Seraphina' }), userId);
    engine.publishCard(makeCard({ name: 'Kael', id: 'card2' }), userId);
    engine.setModerationStatus(
      Array.from(engine.listCards({ approvedOnly: false }).map((c) => c.marketId))[0]!,
      'approved'
    );
    engine.setModerationStatus(
      Array.from(engine.listCards({ approvedOnly: false }).map((c) => c.marketId))[1]!,
      'approved'
    );
    const results = engine.listCards({ search: 'Sera' });
    expect(results).toHaveLength(1);
    expect(results[0]!.card.name).toBe('Seraphina');
  });

  test('搜索关键词匹配描述', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(
      makeCard({ name: 'A', description: '精灵法师' }),
      userId
    );
    engine.setModerationStatus(
      Array.from(engine.listCards({ approvedOnly: false }))[0]!.marketId,
      'approved'
    );
    const results = engine.listCards({ search: '精灵' });
    expect(results).toHaveLength(1);
  });

  test('标签筛选匹配任意', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(
      makeCard({ name: 'A', tags: ['奇幻', '战士'] }),
      userId
    );
    engine.publishCard(
      makeCard({ name: 'B', id: 'c2', tags: ['科幻'] }),
      userId
    );
    for (const c of engine.listCards({ approvedOnly: false })) {
      engine.setModerationStatus(c.marketId, 'approved');
    }
    const results = engine.listCards({ tags: ['奇幻'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.card.name).toBe('A');
  });

  test('分类筛选', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(makeCard({ name: 'A' }), userId, ['奇幻', '冒险']);
    engine.publishCard(makeCard({ name: 'B', id: 'c2' }), userId, ['科幻']);
    for (const c of engine.listCards({ approvedOnly: false })) {
      engine.setModerationStatus(c.marketId, 'approved');
    }
    const results = engine.listCards({ categories: ['奇幻'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.card.name).toBe('A');
  });

  test('最低评分筛选', () => {
    const { engine, userId } = createEngineWithUser();
    const id1 = engine.publishCard(makeCard({ name: 'High' }), userId);
    const id2 = engine.publishCard(makeCard({ name: 'Low', id: 'c2' }), userId);
    for (const c of engine.listCards({ approvedOnly: false })) {
      engine.setModerationStatus(c.marketId, 'approved');
    }
    // 添加评论设置评分
    engine.addReview(id1, userId, 5, '好评');
    engine.addReview(id2, userId, 2, '差评');
    const results = engine.listCards({ minRating: 4 });
    expect(results).toHaveLength(1);
    expect(results[0]!.card.name).toBe('High');
  });

  test('仅精选筛选', () => {
    const { engine, userId } = createEngineWithUser();
    const id1 = engine.publishCard(makeCard({ name: 'Featured' }), userId);
    const id2 = engine.publishCard(makeCard({ name: 'Normal', id: 'c2' }), userId);
    engine.setModerationStatus(id1, 'approved');
    engine.setModerationStatus(id2, 'approved');
    engine.setFeatured(id1, true);
    const results = engine.listCards({ featuredOnly: true });
    expect(results).toHaveLength(1);
    expect(results[0]!.card.name).toBe('Featured');
  });

  test('作者筛选', () => {
    const engine = new CommunityMarketEngine();
    const user1 = engine.registerUser('Alice');
    const user2 = engine.registerUser('Bob');
    engine.publishCard(makeCard({ name: 'AliceCard' }), user1.id);
    engine.publishCard(makeCard({ name: 'BobCard', id: 'c2' }), user2.id);
    for (const c of engine.listCards({ approvedOnly: false })) {
      engine.setModerationStatus(c.marketId, 'approved');
    }
    const results = engine.listCards({ authorId: user1.id });
    expect(results).toHaveLength(1);
    expect(results[0]!.card.name).toBe('AliceCard');
  });
});

// ── 排序 ──

describe('排序', () => {
  test('按下载量排序', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('TestUser');
    const id1 = engine.publishCard(makeCard({ name: 'Popular' }), user.id);
    const id2 = engine.publishCard(makeCard({ name: 'Less', id: 'c2' }), user.id);
    engine.setModerationStatus(id1, 'approved');
    engine.setModerationStatus(id2, 'approved');
    // 下载 id1 5 次
    for (let i = 0; i < 5; i++) {
      engine.downloadCard(id1, user.id);
    }
    const results = engine.listCards({}, 'popular');
    expect(results[0]!.card.name).toBe('Popular');
  });

  test('按评分排序', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('TestUser');
    const id1 = engine.publishCard(makeCard({ name: 'High' }), user.id);
    const id2 = engine.publishCard(makeCard({ name: 'Low', id: 'c2' }), user.id);
    engine.setModerationStatus(id1, 'approved');
    engine.setModerationStatus(id2, 'approved');
    engine.addReview(id1, user.id, 5, '好');
    engine.addReview(id2, user.id, 2, '差');
    const results = engine.listCards({}, 'rating');
    expect(results[0]!.card.name).toBe('High');
  });

  test('按名称排序', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('TestUser');
    engine.publishCard(makeCard({ name: 'Zebra' }), user.id);
    engine.publishCard(makeCard({ name: 'Apple', id: 'c2' }), user.id);
    for (const c of engine.listCards({ approvedOnly: false })) {
      engine.setModerationStatus(c.marketId, 'approved');
    }
    const results = engine.listCards({}, 'alphabetical');
    expect(results[0]!.card.name).toBe('Apple');
    expect(results[1]!.card.name).toBe('Zebra');
  });
});

// ── 下载 ──

describe('下载', () => {
  test('下载增加 downloadCount 和交易记录', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    engine.setModerationStatus(marketId, 'approved');
    const tx = engine.downloadCard(marketId, userId);
    expect(tx.type).toBe('download');
    expect(tx.status).toBe('completed');
    expect(engine.getCard(marketId)?.downloadCount).toBe(1);
  });

  test('下载不存在的角色卡抛错', () => {
    const { engine, userId } = createEngineWithUser();
    expect(() => engine.downloadCard('nonexistent', userId)).toThrow(/不存在/);
  });

  test('下载用户 totalDownloads 增加', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    engine.downloadCard(marketId, userId);
    expect(engine.getUser(userId)?.totalDownloads).toBe(1);
  });

  test('hasUserDownloaded 正确判断', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    expect(engine.hasUserDownloaded(marketId, userId)).toBe(false);
    engine.downloadCard(marketId, userId);
    expect(engine.hasUserDownloaded(marketId, userId)).toBe(true);
  });

  test('getUserDownloads 返回用户的下载历史', () => {
    const { engine, userId } = createEngineWithUser();
    const id1 = engine.publishCard(makeCard({ name: 'A' }), userId);
    const id2 = engine.publishCard(makeCard({ name: 'B', id: 'c2' }), userId);
    engine.downloadCard(id1, userId);
    engine.downloadCard(id2, userId);
    const downloads = engine.getUserDownloads(userId);
    expect(downloads).toHaveLength(2);
  });
});

// ── 收藏 ──

describe('收藏', () => {
  test('incrementFavorite 增加收藏计数', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    engine.incrementFavorite(marketId);
    expect(engine.getCard(marketId)?.favoriteCount).toBe(1);
  });

  test('decrementFavorite 减少收藏计数（不低于 0）', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    engine.incrementFavorite(marketId);
    engine.decrementFavorite(marketId);
    expect(engine.getCard(marketId)?.favoriteCount).toBe(0);
    engine.decrementFavorite(marketId);
    expect(engine.getCard(marketId)?.favoriteCount).toBe(0);
  });
});

// ── 评论与评分 ──

describe('评论与评分', () => {
  test('addReview 添加评论并更新评分', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    const review = engine.addReview(marketId, userId, 4, '不错');
    expect(review.rating).toBe(4);
    expect(review.comment).toBe('不错');
    const card = engine.getCard(marketId)!;
    expect(card.averageRating).toBe(4);
    expect(card.reviewCount).toBe(1);
  });

  test('多条评论计算平均分', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    engine.addReview(marketId, userId, 5, '好评');
    const user2 = engine.registerUser('User2');
    engine.addReview(marketId, user2.id, 3, '一般');
    const card = engine.getCard(marketId)!;
    expect(card.averageRating).toBe(4);
    expect(card.reviewCount).toBe(2);
  });

  test('评分越界抛错', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    expect(() => engine.addReview(marketId, userId, 0, '零分')).toThrow(/1-5/);
    expect(() => engine.addReview(marketId, userId, 6, '六分')).toThrow(/1-5/);
  });

  test('空评论抛错', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    expect(() => engine.addReview(marketId, userId, 3, '')).toThrow(/不能为空/);
    expect(() => engine.addReview(marketId, userId, 3, '  ')).toThrow(/不能为空/);
  });

  test('getReviews 按时间倒序返回', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    const user2 = engine.registerUser('User2');
    engine.addReview(marketId, userId, 5, '第一条');
    engine.addReview(marketId, user2.id, 4, '第二条');
    const reviews = engine.getReviews(marketId);
    expect(reviews).toHaveLength(2);
    // 最新在前
    expect(reviews[0]!.comment).toBe('第二条');
  });

  test('likeReview 增加点赞数', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    const review = engine.addReview(marketId, userId, 5, '好');
    engine.likeReview(review.id);
    expect(engine.getReviews(marketId)[0]!.likes).toBe(1);
  });
});

// ── 举报 ──

describe('举报', () => {
  test('reportCard 创建举报并增加 reportCount', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    const report = engine.reportCard(marketId, userId, 'spam', '垃圾内容');
    expect(report.reason).toBe('spam');
    expect(report.status).toBe('pending');
    expect(engine.getCard(marketId)?.reportCount).toBe(1);
  });

  test('getReports 按市场 ID 筛选', () => {
    const { engine, userId } = createEngineWithUser();
    const id1 = engine.publishCard(makeCard({ name: 'A' }), userId);
    const id2 = engine.publishCard(makeCard({ name: 'B', id: 'c2' }), userId);
    engine.reportCard(id1, userId, 'spam', '举报 A');
    engine.reportCard(id2, userId, 'inappropriate', '举报 B');
    expect(engine.getReports(id1)).toHaveLength(1);
    expect(engine.getReports()).toHaveLength(2);
  });

  test('resolveReport 更新举报状态', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    const report = engine.reportCard(marketId, userId, 'spam', '举报');
    engine.resolveReport(report.id, 'resolved', '已处理');
    const updated = engine.getReports()[0]!;
    expect(updated.status).toBe('resolved');
    expect(updated.resolution).toBe('已处理');
  });
});

// ── 推荐算法 ──

describe('推荐算法', () => {
  test('返回按 score 降序的推荐列表', () => {
    const engine = createMockEngine();
    engine.login('RecoUser');
    const recs = engine.getRecommendations({
      preferredTags: ['奇幻'],
      limit: 3,
    });
    expect(recs.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i]!.score).toBeLessThanOrEqual(recs[i - 1]!.score);
    }
  });

  test('排除已下载的角色卡', () => {
    const engine = createMockEngine();
    const user = engine.login('RecoUser');
    const allCards = engine.listCards({ approvedOnly: false });
    const firstCardId = allCards[0]!.marketId;
    engine.downloadCard(firstCardId, user.id);
    const recs = engine.getRecommendations({
      excludeIds: [firstCardId],
      limit: 10,
    });
    expect(recs.every((r) => r.card.marketId !== firstCardId)).toBe(true);
  });

  test('reasons 分数明细在 0-1 范围内', () => {
    const engine = createMockEngine();
    engine.login('RecoUser');
    const recs = engine.getRecommendations({ limit: 1 });
    if (recs.length > 0) {
      const r = recs[0]!.reasons;
      expect(r.tagMatch).toBeGreaterThanOrEqual(0);
      expect(r.tagMatch).toBeLessThanOrEqual(1);
      expect(r.rating).toBeGreaterThanOrEqual(0);
      expect(r.rating).toBeLessThanOrEqual(1);
      expect(r.popularity).toBeGreaterThanOrEqual(0);
      expect(r.popularity).toBeLessThanOrEqual(1);
      expect(r.recency).toBeGreaterThanOrEqual(0);
      expect(r.recency).toBeLessThanOrEqual(1);
    }
  });
});

// ── 审核 ──

describe('审核', () => {
  test('setModerationStatus 更新状态', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    engine.setModerationStatus(marketId, 'approved');
    expect(engine.getCard(marketId)?.moderationStatus).toBe('approved');
  });

  test('setFeatured 切换精选', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    engine.setFeatured(marketId, true);
    expect(engine.getCard(marketId)?.featured).toBe(true);
  });

  test('删除角色卡', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    expect(engine.deleteCard(marketId)).toBe(true);
    expect(engine.getCard(marketId)).toBeNull();
  });

  test('删除角色卡同时删除关联评论', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Alice');
    const marketId = engine.publishCard(makeCard(), user.id);
    engine.addReview(marketId, user.id, 5, '评论');
    expect(engine.getReviews(marketId)).toHaveLength(1);
    engine.deleteCard(marketId);
    expect(engine.getReviews(marketId)).toHaveLength(0);
  });

  test('删除角色卡更新作者 publishedCount', () => {
    const { engine, userId } = createEngineWithUser();
    const marketId = engine.publishCard(makeCard(), userId);
    expect(engine.getUser(userId)?.publishedCount).toBe(1);
    engine.deleteCard(marketId);
    expect(engine.getUser(userId)?.publishedCount).toBe(0);
  });
});

// ── 统计 ──

describe('统计信息', () => {
  test('返回正确的统计数据', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Alice');
    engine.publishCard(makeCard({ name: 'Card1' }), user.id);
    engine.publishCard(makeCard({ name: 'Card2', id: 'c2' }), user.id);
    engine.setModerationStatus(
      engine.listCards({ approvedOnly: false })[0]!.marketId,
      'approved'
    );
    engine.downloadCard(
      engine.listCards({ approvedOnly: false })[0]!.marketId,
      user.id
    );

    const stats = engine.getStats();
    expect(stats.totalCards).toBe(2);
    expect(stats.totalUsers).toBe(1);
    expect(stats.totalDownloads).toBe(1);
    expect(stats.approvedCards).toBe(1);
    expect(stats.pendingCards).toBe(1);
  });
});

// ── 序列化 ──

describe('序列化', () => {
  test('toJSON/loadFromJSON 全量往返', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Alice');
    const marketId = engine.publishCard(makeCard(), user.id);
    engine.addReview(marketId, user.id, 5, '好');
    engine.downloadCard(marketId, user.id);

    const json = engine.toJSON();
    const engine2 = new CommunityMarketEngine();
    engine2.loadFromJSON(json);

    expect(engine2.listCards({ approvedOnly: false })).toHaveLength(1);
    expect(engine2.listUsers()).toHaveLength(1);
    expect(engine2.getReviews(marketId)).toHaveLength(1);
  });

  test('loadFromJSON 清空旧数据后加载', () => {
    const engine = new CommunityMarketEngine();
    const user = engine.registerUser('Old');
    engine.publishCard(makeCard({ name: 'Old' }), user.id);

    const json = engine.toJSON();
    const engine2 = new CommunityMarketEngine();
    const user2 = engine2.registerUser('New');
    engine2.publishCard(makeCard({ name: 'New' }), user2.id);
    engine2.loadFromJSON(json);

    // 加载后旧数据被清空，只剩 JSON 中的 'Old' 用户
    expect(engine2.listUsers()).toHaveLength(1);
    expect(engine2.listUsers()[0]!.name).toBe('Old');
  });
});

// ── 分类与标签 ──

describe('分类与标签', () => {
  test('listCategories 返回全部分类', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(makeCard(), userId, ['奇幻', '冒险']);
    engine.publishCard(makeCard({ name: 'B', id: 'c2' }), userId, ['科幻']);
    const cats = engine.listCategories();
    expect(cats).toContain('奇幻');
    expect(cats).toContain('冒险');
    expect(cats).toContain('科幻');
  });

  test('listAllTags 返回全部角色卡标签', () => {
    const { engine, userId } = createEngineWithUser();
    engine.publishCard(makeCard({ tags: ['奇幻', '战士'] }), userId);
    engine.publishCard(makeCard({ name: 'B', id: 'c2', tags: ['科幻'] }), userId);
    const tags = engine.listAllTags();
    expect(tags).toContain('奇幻');
    expect(tags).toContain('战士');
    expect(tags).toContain('科幻');
  });
});

// ── Mock 数据 ──

describe('Mock 数据', () => {
  test('createMockEngine 返回预填充数据的引擎', () => {
    const engine = createMockEngine();
    expect(engine.listCards({ approvedOnly: false }).length).toBeGreaterThan(0);
    expect(engine.listUsers().length).toBeGreaterThan(0);
  });

  test('Mock 角色卡均已审核', () => {
    const engine = createMockEngine();
    const cards = engine.listCards({ approvedOnly: false });
    for (const c of cards) {
      expect(c.moderationStatus).toBe('approved');
    }
  });

  test('Mock 数据包含精选角色卡', () => {
    const engine = createMockEngine();
    const featured = engine.listCards({ featuredOnly: true });
    expect(featured.length).toBeGreaterThan(0);
  });

  test('Mock 数据包含评论', () => {
    const engine = createMockEngine();
    const stats = engine.getStats();
    expect(stats.totalReviews).toBeGreaterThan(0);
  });
});
