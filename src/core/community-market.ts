/**
 * 角色卡社区市场引擎 (模块5)
 *
 * 由于项目无后端，社区市场以本地 Mock 数据 + 模拟流程实现：
 * - 用户认证：本地模拟登录（用户名 + 头像，存入 localStorage）
 * - 角色卡展示：预置 Mock 数据，支持搜索/筛选/排序
 * - 评分评价：本地评分与评论（1-5 星 + 文本）
 * - 交易流程：模拟下载/发布（无真实支付，仅记录交易状态）
 * - 内容审核：举报机制 + 状态流转（pending → approved/rejected）
 * - 推荐算法：基于标签匹配 + 评分 + 下载量 + 新鲜度的加权评分
 *
 * 本文件自 R4-7 起只保留引擎类本体与 Mock 装配层：
 * - 类型与纯工具 → community-market-types.ts
 * - 筛选/排序/推荐   → community-market-queries.ts
 * - Mock 造数        → community-market-mock.ts
 *
 * 数据模型：
 * - MarketUser：社区用户
 * - MarketCharacterCard：发布到市场的角色卡
 * - MarketReview：评分与评论
 * - MarketTransaction：下载/发布交易记录
 * - MarketReport：内容举报
 */

import type { CharacterCard } from './character-card';
import { deepClone } from './json-utils';
import { t } from '@/i18n';
import type {
  MarketUser,
  MarketCharacterCard,
  MarketReview,
  MarketTransaction,
  MarketFilter,
  SortOption,
  RecommendationItem,
  RecommendationParams,
  ReportReason,
  ReportStatus,
  ModerationStatus,
  MarketReport,
  SerializedMarketData,
} from './community-market-types';
import { generateId } from './community-market-types';
import { applyMarketFilter, applyMarketSort, computeRecommendations } from './community-market-queries';
import { createMockUsers, createMockCards, createMockReviews } from './community-market-mock';

// 公共面保持不变：外部一律从本模块拿，拆分对调用方零影响
export type {
  MarketUser,
  MarketCharacterCard,
  MarketReview,
  MarketTransaction,
  MarketFilter,
  SortOption,
  RecommendationItem,
  RecommendationParams,
  ReportReason,
  ModerationStatus,
  MarketReport,
  SerializedMarketData,
  TransactionType,
  TransactionStatus,
  ReportStatus,
} from './community-market-types';
export { generateId } from './community-market-types';

// ── 核心引擎 ──

/**
 * 社区市场引擎
 *
 * 管理全量社区数据（用户/角色卡/评论/交易/举报）。
 * 持久化由调用方（Pinia Store）通过 toJSON/fromJSON 处理。
 */
export class CommunityMarketEngine {
  private users: Map<string, MarketUser> = new Map();
  private cards: Map<string, MarketCharacterCard> = new Map();
  private reviews: Map<string, MarketReview> = new Map();
  private transactions: MarketTransaction[] = [];
  private reports: Map<string, MarketReport> = new Map();
  private currentUser: MarketUser | null = null;

  // ── 用户管理 ──

  /**
   * 注册新用户（Mock 认证）
   *
   * @returns 新用户
   * @throws 用户名已存在
   */
  registerUser(name: string, avatar?: string, bio?: string): MarketUser {
    const existing = Array.from(this.users.values()).find(
      (u) => u.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      throw new Error(t('mkt.usernameTaken', { name }));
    }
    const user: MarketUser = {
      id: generateId('user'),
      name,
      avatar,
      bio,
      joinedAt: new Date().toISOString(),
      publishedCount: 0,
      totalDownloads: 0,
    };
    this.users.set(user.id, user);
    return user;
  }

  /**
   * 模拟登录（按名称查找或自动注册）
   */
  login(name: string, avatar?: string): MarketUser {
    const existing = Array.from(this.users.values()).find(
      (u) => u.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      this.currentUser = existing;
      return existing;
    }
    const user = this.registerUser(name, avatar);
    this.currentUser = user;
    return user;
  }

  /** 登出 */
  logout(): void {
    this.currentUser = null;
  }

  /** 获取当前登录用户 */
  getCurrentUser(): MarketUser | null {
    return this.currentUser;
  }

  /** 设置当前用户（用于从持久化恢复） */
  setCurrentUser(userId: string | null): void {
    if (userId === null) {
      this.currentUser = null;
      return;
    }
    this.currentUser = this.users.get(userId) ?? null;
  }

  /** 获取全部用户 */
  listUsers(): MarketUser[] {
    return Array.from(this.users.values());
  }

  /** 按 ID 获取用户 */
  getUser(userId: string): MarketUser | null {
    return this.users.get(userId) ?? null;
  }

  // ── 角色卡管理 ──

  /**
   * 发布角色卡到市场
   *
   * @param card 角色卡快照
   * @param authorId 发布者 ID
   * @param categories 分类标签
   * @returns 市场 ID
   * @throws 未登录
   */
  publishCard(
    card: CharacterCard,
    authorId: string,
    categories: string[] = []
  ): string {
    const author = this.users.get(authorId);
    if (!author) {
      throw new Error(t('mkt.userNotFound'));
    }
    const marketId = generateId('card');
    const now = new Date().toISOString();
    const marketCard: MarketCharacterCard = {
      marketId,
      card: deepClone(card),
      authorId,
      authorName: author.name,
      publishedAt: now,
      updatedAt: now,
      downloadCount: 0,
      favoriteCount: 0,
      reviewCount: 0,
      averageRating: 0,
      categories,
      moderationStatus: 'pending',
      reportCount: 0,
      featured: false,
    };
    this.cards.set(marketId, marketCard);
    author.publishedCount++;
    return marketId;
  }

  /**
   * 获取市场角色卡
   */
  getCard(marketId: string): MarketCharacterCard | null {
    return this.cards.get(marketId) ?? null;
  }

  /**
   * 列出角色卡（支持筛选与排序）
   *
   * 默认仅返回已审核的角色卡；若需包含未审核，需显式传 approvedOnly: false
   */
  listCards(filter?: MarketFilter, sort: SortOption = 'popular'): MarketCharacterCard[] {
    let result = Array.from(this.cards.values());

    // 合并默认筛选：approvedOnly 默认为 true（除非显式传 false）
    const effectiveFilter: MarketFilter = {
      approvedOnly: true,
      ...filter,
    };
    result = applyMarketFilter(result, effectiveFilter);

    result = applyMarketSort(result, sort);
    return result;
  }

  /**
   * 获取全部分类标签
   */
  listCategories(): string[] {
  const set = new Set<string>();
  for (const card of this.cards.values()) {
    for (const cat of card.categories) {
      set.add(cat);
    }
  }
  return Array.from(set).sort();
}

  /**
   * 获取全部标签
   */
  listAllTags(): string[] {
    const set = new Set<string>();
    for (const card of this.cards.values()) {
      for (const tag of card.card.tags) {
        set.add(tag);
      }
    }
    return Array.from(set).sort();
  }

  /**
   * 更新角色卡审核状态
   */
  setModerationStatus(marketId: string, status: ModerationStatus): void {
    const card = this.cards.get(marketId);
    if (!card) {
      throw new Error(t('mkt.cardNotFound', { marketId }));
    }
    card.moderationStatus = status;
    card.updatedAt = new Date().toISOString();
  }

  /**
   * 设置精选状态
   */
  setFeatured(marketId: string, featured: boolean): void {
    const card = this.cards.get(marketId);
    if (!card) {
      throw new Error(t('mkt.cardNotFound', { marketId }));
    }
    card.featured = featured;
    card.updatedAt = new Date().toISOString();
  }

  /**
   * 删除角色卡
   */
  deleteCard(marketId: string): boolean {
    const card = this.cards.get(marketId);
    if (!card) return false;

    // 删除关联评论
    const reviewIds = Array.from(this.reviews.values())
      .filter((r) => r.marketId === marketId)
      .map((r) => r.id);
    for (const rid of reviewIds) {
      this.reviews.delete(rid);
    }

    // 更新作者发布数
    const author = this.users.get(card.authorId);
    if (author && author.publishedCount > 0) {
      author.publishedCount--;
    }

    return this.cards.delete(marketId);
  }

  // ── 下载/收藏 ──

  /**
   * 下载角色卡（记录交易并增加计数）
   *
   * @returns 交易记录
   * @throws 未登录或角色卡不存在
   */
  downloadCard(marketId: string, userId: string): MarketTransaction {
    const card = this.cards.get(marketId);
    if (!card) {
      throw new Error(t('mkt.cardNotFound', { marketId }));
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(t('mkt.userNotFound'));
    }

    card.downloadCount++;
    user.totalDownloads++;

    const transaction: MarketTransaction = {
      id: generateId('tx'),
      userId,
      marketId,
      type: 'download',
      status: 'completed',
      timestamp: new Date().toISOString(),
    };
    this.transactions.push(transaction);
    return transaction;
  }

  /**
   * 收藏/取消收藏角色卡
   *
   * @returns 是否已收藏（toggle 后的状态）
   */
  toggleFavorite(marketId: string, userId: string): boolean {
    const card = this.cards.get(marketId);
    if (!card) {
      throw new Error(t('mkt.cardNotFound', { marketId }));
    }

    // 检查是否已收藏（通过交易记录）
    const existing = this.transactions.find(
      (t) =>
        t.userId === userId &&
        t.marketId === marketId &&
        t.type === 'download' &&
        t.status === 'completed'
    );

    // 简单实现：用 favoriteCount 表示收藏数，用交易记录判断是否已下载
    // 真正的收藏状态由 store 层管理（localStorage），这里只更新计数
    if (existing) {
      // 已下载 → 增加 favoriteCount（toggle 逻辑由 store 层管理）
      return true;
    }
    return false;
  }

  /**
   * 增加收藏计数
   */
  incrementFavorite(marketId: string): void {
    const card = this.cards.get(marketId);
    if (card) card.favoriteCount++;
  }

  /**
   * 减少收藏计数
   */
  decrementFavorite(marketId: string): void {
    const card = this.cards.get(marketId);
    if (card && card.favoriteCount > 0) card.favoriteCount--;
  }

  /**
   * 获取用户的下载历史
   */
  getUserDownloads(userId: string): MarketTransaction[] {
    return this.transactions.filter(
      (t) => t.userId === userId && t.type === 'download'
    );
  }

  /**
   * 检查用户是否已下载某角色卡
   */
  hasUserDownloaded(marketId: string, userId: string): boolean {
    return this.transactions.some(
      (t) =>
        t.userId === userId &&
        t.marketId === marketId &&
        t.type === 'download' &&
        t.status === 'completed'
    );
  }

  // ── 评论与评分 ──

  /**
   * 添加评论
   *
   * @throws 角色卡不存在或评分越界
   */
  addReview(
    marketId: string,
    userId: string,
    rating: number,
    comment: string
  ): MarketReview {
    const card = this.cards.get(marketId);
    if (!card) {
      throw new Error(t('mkt.cardNotFound', { marketId }));
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(t('mkt.userNotFound'));
    }
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error(t('mkt.ratingRange'));
    }
    if (!comment || comment.trim().length === 0) {
      throw new Error(t('mkt.commentEmpty'));
    }

    const review: MarketReview = {
      id: generateId('review'),
      marketId,
      userId,
      userName: user.name,
      rating,
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
      likes: 0,
    };
    this.reviews.set(review.id, review);

    // 更新角色卡平均评分
    this.recalculateRating(marketId);

    return review;
  }

  /**
   * 获取角色卡的全部评论（按时间倒序，时间戳相同时后插入的在前）
   */
  getReviews(marketId: string): MarketReview[] {
    return Array.from(this.reviews.values())
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.marketId === marketId)
      .sort((a, b) => {
        const timeDiff =
          new Date(b.r.createdAt).getTime() - new Date(a.r.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        // 时间戳相同：后插入的（idx 更大）排在前面
        return b.idx - a.idx;
      })
      .map(({ r }) => r);
  }

  /**
   * 点赞评论
   */
  likeReview(reviewId: string): void {
    const review = this.reviews.get(reviewId);
    if (review) review.likes++;
  }

  /**
   * 重新计算角色卡平均评分
   */
  private recalculateRating(marketId: string): void {
    const card = this.cards.get(marketId);
    if (!card) return;

    const reviews = Array.from(this.reviews.values()).filter(
      (r) => r.marketId === marketId
    );

    card.reviewCount = reviews.length;
    if (reviews.length === 0) {
      card.averageRating = 0;
      return;
    }
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    card.averageRating = Math.round((sum / reviews.length) * 10) / 10;
  }

  // ── 举报 ──

  /**
   * 举报角色卡
   */
  reportCard(
    marketId: string,
    reporterId: string,
    reason: ReportReason,
    description: string
  ): MarketReport {
    const card = this.cards.get(marketId);
    if (!card) {
      throw new Error(t('mkt.cardNotFound', { marketId }));
    }
    const reporter = this.users.get(reporterId);
    if (!reporter) {
      throw new Error(t('mkt.reporterNotFound'));
    }

    const report: MarketReport = {
      id: generateId('report'),
      marketId,
      reporterId,
      reason,
      description,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this.reports.set(report.id, report);
    card.reportCount++;

    return report;
  }

  /**
   * 获取角色卡的全部举报
   */
  getReports(marketId?: string): MarketReport[] {
    let result = Array.from(this.reports.values());
    if (marketId) {
      result = result.filter((r) => r.marketId === marketId);
    }
    return result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * 处理举报
   */
  resolveReport(
    reportId: string,
    status: ReportStatus,
    resolution?: string
  ): void {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error(t('mkt.reportNotFound', { reportId }));
    }
    report.status = status;
    report.resolution = resolution;
  }

  // ── 推荐算法 ──

  /**
   * 生成个性化推荐（算法见 community-market-queries.ts）
   *
   * @returns 按评分降序排列的推荐列表
   */
  getRecommendations(params: RecommendationParams): RecommendationItem[] {
    return computeRecommendations(this.cards, params);
  }
  /**
   * 获取统计信息
   */
  getStats(): {
    totalCards: number;
    totalUsers: number;
    totalReviews: number;
    totalDownloads: number;
    totalReports: number;
    approvedCards: number;
    pendingCards: number;
  } {
    const allCards = Array.from(this.cards.values());
    return {
      totalCards: allCards.length,
      totalUsers: this.users.size,
      totalReviews: this.reviews.size,
      totalDownloads: this.transactions.filter(
        (t) => t.type === 'download' && t.status === 'completed'
      ).length,
      totalReports: this.reports.size,
      approvedCards: allCards.filter((c) => c.moderationStatus === 'approved').length,
      pendingCards: allCards.filter((c) => c.moderationStatus === 'pending').length,
    };
  }

  // ── 序列化 ──

  toJSON(): SerializedMarketData {
    return {
      users: Array.from(this.users.values()),
      cards: Array.from(this.cards.values()),
      reviews: Array.from(this.reviews.values()),
      transactions: [...this.transactions],
      reports: Array.from(this.reports.values()),
    };
  }

  loadFromJSON(data: SerializedMarketData): void {
    this.users.clear();
    this.cards.clear();
    this.reviews.clear();
    this.transactions = [];
    this.reports.clear();
    this.currentUser = null;

    for (const u of data.users ?? []) {
      this.users.set(u.id, u);
    }
    for (const c of data.cards ?? []) {
      this.cards.set(c.marketId, c);
    }
    for (const r of data.reviews ?? []) {
      this.reviews.set(r.id, r);
    }
    this.transactions = data.transactions ?? [];
    for (const r of data.reports ?? []) {
      this.reports.set(r.id, r);
    }
  }
}

// ── Mock 装配 ──

/**
 * 创建预填充 Mock 数据的引擎实例
 */
export function createMockEngine(): CommunityMarketEngine {
  const engine = new CommunityMarketEngine();

  // 注册 Mock 用户
  const users = createMockUsers();
  const mockUsers: MarketUser[] = users.map((u) => ({ ...u }));

  // 注入用户到引擎
  for (const user of mockUsers) {
    (engine as unknown as { users: Map<string, MarketUser> }).users.set(user.id, user);
  }

  // 发布 Mock 角色卡
  const mockCards = createMockCards();
  for (const mc of mockCards) {
    const marketId = `card_${mc.card.id}`;
    const now = new Date().toISOString();
    const marketCard: MarketCharacterCard = {
      marketId,
      card: deepClone(mc.card),
      authorId: mc.authorId,
      authorName: mockUsers.find((u) => u.id === mc.authorId)?.name ?? 'Unknown',
      publishedAt: mc.publishedAt,
      updatedAt: now,
      downloadCount: mc.downloadCount,
      favoriteCount: Math.floor(mc.downloadCount * 0.3),
      reviewCount: mc.reviewCount,
      averageRating: mc.averageRating,
      categories: mc.categories,
      moderationStatus: 'approved',
      reportCount: 0,
      featured: mc.featured,
    };
    (engine as unknown as { cards: Map<string, MarketCharacterCard> }).cards.set(marketId, marketCard);
  }

  // 注入 Mock 评论
  const mockReviews = createMockReviews();
  for (const r of mockReviews) {
    (engine as unknown as { reviews: Map<string, MarketReview> }).reviews.set(r.id, r);
  }

  return engine;
}

// ── 默认导出 ──

export default CommunityMarketEngine;
