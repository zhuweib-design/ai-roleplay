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
 * 数据模型：
 * - MarketUser：社区用户
 * - MarketCharacterCard：发布到市场的角色卡
 * - MarketReview：评分与评论
 * - MarketTransaction：下载/发布交易记录
 * - MarketReport：内容举报
 */

import type { CharacterCard } from './character-card';
import { deepClone } from './json-utils';

// ── 类型定义 ──

/** 社区用户 */
export interface MarketUser {
  /** 用户 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 头像 URL（可选） */
  avatar?: string;
  /** 个人简介 */
  bio?: string;
  /** 注册时间（ISO 8601） */
  joinedAt: string;
  /** 发布的角色卡数 */
  publishedCount: number;
  /** 总下载量 */
  totalDownloads: number;
}

/** 角色卡审核状态 */
export type ModerationStatus = 'approved' | 'pending' | 'rejected';

/** 市场角色卡（扩展 CharacterCard，增加市场元数据） */
export interface MarketCharacterCard {
  /** 市场 ID（唯一） */
  marketId: string;
  /** 角色卡快照 */
  card: CharacterCard;
  /** 发布者 ID */
  authorId: string;
  /** 发布者名称（冗余存储，便于列表展示） */
  authorName: string;
  /** 发布时间（ISO 8601） */
  publishedAt: string;
  /** 更新时间（ISO 8601） */
  updatedAt: string;
  /** 下载次数 */
  downloadCount: number;
  /** 收藏次数 */
  favoriteCount: number;
  /** 评分数 */
  reviewCount: number;
  /** 平均评分（0-5） */
  averageRating: number;
  /** 分类标签（比 card.tags 更广泛，含风格/题材/语言等） */
  categories: string[];
  /** 审核状态 */
  moderationStatus: ModerationStatus;
  /** 举报次数 */
  reportCount: number;
  /** 是否为编辑精选 */
  featured: boolean;
}

/** 评分与评论 */
export interface MarketReview {
  /** 评论 ID */
  id: string;
  /** 市场 ID（被评论的角色卡） */
  marketId: string;
  /** 评论者 ID */
  userId: string;
  /** 评论者名称 */
  userName: string;
  /** 评分（1-5） */
  rating: number;
  /** 评论内容 */
  comment: string;
  /** 评论时间（ISO 8601） */
  createdAt: string;
  /** 点赞数 */
  likes: number;
}

/** 交易类型 */
export type TransactionType = 'download' | 'publish';

/** 交易状态 */
export type TransactionStatus = 'completed' | 'pending' | 'failed';

/** 交易记录 */
export interface MarketTransaction {
  /** 交易 ID */
  id: string;
  /** 用户 ID */
  userId: string;
  /** 市场 ID */
  marketId: string;
  /** 交易类型 */
  type: TransactionType;
  /** 交易状态 */
  status: TransactionStatus;
  /** 交易时间（ISO 8601） */
  timestamp: string;
}

/** 举报类型 */
export type ReportReason =
  | 'inappropriate'
  | 'copyright'
  | 'spam'
  | 'misleading'
  | 'other';

/** 举报状态 */
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

/** 内容举报 */
export interface MarketReport {
  /** 举报 ID */
  id: string;
  /** 市场 ID */
  marketId: string;
  /** 举报者 ID */
  reporterId: string;
  /** 举报原因 */
  reason: ReportReason;
  /** 举报描述 */
  description: string;
  /** 举报时间（ISO 8601） */
  createdAt: string;
  /** 处理状态 */
  status: ReportStatus;
  /** 处理备注 */
  resolution?: string;
}

/** 排序选项 */
export type SortOption =
  | 'popular'      // 按下载量
  | 'rating'       // 按评分
  | 'newest'       // 按发布时间
  | 'downloads'    // 同 popular
  | 'alphabetical'; // 按名称

/** 筛选条件 */
export interface MarketFilter {
  /** 搜索关键词（匹配名称/描述/标签） */
  search?: string;
  /** 标签筛选（匹配任意） */
  tags?: string[];
  /** 分类筛选 */
  categories?: string[];
  /** 最低评分 */
  minRating?: number;
  /** 仅显示精选 */
  featuredOnly?: boolean;
  /** 仅显示已审核 */
  approvedOnly?: boolean;
  /** 作者 ID */
  authorId?: string;
}

/** 推荐参数 */
export interface RecommendationParams {
  /** 用户偏好标签 */
  preferredTags?: string[];
  /** 用户偏好分类 */
  preferredCategories?: string[];
  /** 用户已下载的 marketId 列表（排除已下载） */
  excludeIds?: string[];
  /** 返回数量上限 */
  limit?: number;
}

/** 推荐结果项 */
export interface RecommendationItem {
  card: MarketCharacterCard;
  score: number;
  /** 评分明细 */
  reasons: {
    tagMatch: number;
    rating: number;
    popularity: number;
    recency: number;
  };
}

/** 序列化数据结构 */
export interface SerializedMarketData {
  users: MarketUser[];
  cards: MarketCharacterCard[];
  reviews: MarketReview[];
  transactions: MarketTransaction[];
  reports: MarketReport[];
}

// ── 工具函数 ──

/**
 * 生成唯一 ID（前缀 + 时间戳 + 随机数）
 */
export function generateId(prefix: string = 'id'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}${rand}`;
}

/**
 * 计算两个数组的交集大小
 */
function intersectionSize(a: string[], b: string[]): number {
  const setB = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((s) => setB.has(s.toLowerCase())).length;
}

/**
 * 计算新鲜度分数（0-1，30天内为 1，超过 365 天递减到 0）
 */
function recencyScore(publishedAt: string): number {
  const now = Date.now();
  const pub = new Date(publishedAt).getTime();
  const daysSince = (now - pub) / (1000 * 60 * 60 * 24);
  if (daysSince <= 30) return 1;
  if (daysSince >= 365) return 0;
  return 1 - (daysSince - 30) / 335;
}

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
      throw new Error(`用户名「${name}」已被占用`);
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
      throw new Error('用户不存在');
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
    result = this.applyFilter(result, effectiveFilter);

    result = this.applySort(result, sort);
    return result;
  }

  /**
   * 应用筛选条件
   */
  private applyFilter(cards: MarketCharacterCard[], filter: MarketFilter): MarketCharacterCard[] {
    let result = cards;

    if (filter.approvedOnly !== false) {
      result = result.filter((c) => c.moderationStatus === 'approved');
    }

    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.card.name.toLowerCase().includes(q) ||
          c.card.description.toLowerCase().includes(q) ||
          c.card.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.categories.some((cat) => cat.toLowerCase().includes(q))
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      result = result.filter((c) =>
        c.card.tags.some((t) =>
          filter.tags!.some((ft) => ft.toLowerCase() === t.toLowerCase())
        )
      );
    }

    if (filter.categories && filter.categories.length > 0) {
      result = result.filter((c) =>
        c.categories.some((cat) =>
          filter.categories!.some((fc) => fc.toLowerCase() === cat.toLowerCase())
        )
      );
    }

    if (filter.minRating !== undefined) {
      result = result.filter((c) => c.averageRating >= filter.minRating!);
    }

    if (filter.featuredOnly) {
      result = result.filter((c) => c.featured);
    }

    if (filter.authorId) {
      result = result.filter((c) => c.authorId === filter.authorId);
    }

    return result;
  }

  /**
   * 应用排序
   */
  private applySort(cards: MarketCharacterCard[], sort: SortOption): MarketCharacterCard[] {
    const sorted = [...cards];
    switch (sort) {
      case 'popular':
      case 'downloads':
        sorted.sort((a, b) => b.downloadCount - a.downloadCount);
        break;
      case 'rating':
        sorted.sort((a, b) => b.averageRating - a.averageRating);
        break;
      case 'newest':
        sorted.sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
        break;
      case 'alphabetical':
        sorted.sort((a, b) => a.card.name.localeCompare(b.card.name));
        break;
    }
    return sorted;
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
      throw new Error(`角色卡 ${marketId} 不存在`);
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
      throw new Error(`角色卡 ${marketId} 不存在`);
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
      throw new Error(`角色卡 ${marketId} 不存在`);
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('用户不存在');
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
      throw new Error(`角色卡 ${marketId} 不存在`);
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
      throw new Error(`角色卡 ${marketId} 不存在`);
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('用户不存在');
    }
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error('评分必须为 1-5 的整数');
    }
    if (!comment || comment.trim().length === 0) {
      throw new Error('评论内容不能为空');
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
      throw new Error(`角色卡 ${marketId} 不存在`);
    }
    const reporter = this.users.get(reporterId);
    if (!reporter) {
      throw new Error('举报者不存在');
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
      throw new Error(`举报 ${reportId} 不存在`);
    }
    report.status = status;
    report.resolution = resolution;
  }

  // ── 推荐算法 ──

  /**
   * 生成个性化推荐
   *
   * 加权评分算法：
   * - 标签匹配（40%）：用户偏好标签与角色卡标签的 Jaccard 相似度
   * - 评分（30%）：平均评分 / 5
   * - 流行度（20%）：log 归一化下载量
   * - 新鲜度（10%）：发布时间衰减
   *
   * @returns 按评分降序排列的推荐列表
   */
  getRecommendations(params: RecommendationParams): RecommendationItem[] {
    const limit = params.limit ?? 10;
    const excludeIds = new Set(params.excludeIds ?? []);

    let candidates = Array.from(this.cards.values()).filter(
      (c) =>
        c.moderationStatus === 'approved' && !excludeIds.has(c.marketId)
    );

    const preferredTags = params.preferredTags ?? [];
    const preferredCategories = params.preferredCategories ?? [];

    const items: RecommendationItem[] = candidates.map((card) => {
      // 标签匹配分数（0-1）
      const allTags = [...card.card.tags, ...card.categories];
      const tagMatch =
        allTags.length === 0
          ? 0
          : intersectionSize(
              allTags,
              [...preferredTags, ...preferredCategories]
            ) / allTags.length;

      // 评分分数（0-1）
      const rating = card.averageRating / 5;

      // 流行度分数（0-1，log 归一化）
      const popularity = Math.log10(card.downloadCount + 1) / 3; // 1000 下载 → ~1.0

      // 新鲜度分数（0-1）
      const recency = recencyScore(card.publishedAt);

      const score =
        tagMatch * 0.4 + rating * 0.3 + popularity * 0.2 + recency * 0.1;

      return {
        card,
        score: Math.round(score * 100) / 100,
        reasons: {
          tagMatch: Math.round(tagMatch * 100) / 100,
          rating: Math.round(rating * 100) / 100,
          popularity: Math.round(popularity * 100) / 100,
          recency: Math.round(recency * 100) / 100,
        },
      };
    });

    items.sort((a, b) => b.score - a.score);
    return items.slice(0, limit);
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

// ── Mock 数据 ──

/**
 * 生成 Mock 用户
 */
function createMockUsers(): MarketUser[] {
  return [
    {
      id: 'user_alice',
      name: 'Alice',
      avatar: '',
      bio: '奇幻角色创作者',
      joinedAt: '2026-01-15T08:00:00.000Z',
      publishedCount: 3,
      totalDownloads: 1250,
    },
    {
      id: 'user_bob',
      name: 'Bob',
      avatar: '',
      bio: '赛博朋克爱好者',
      joinedAt: '2026-02-20T10:00:00.000Z',
      publishedCount: 2,
      totalDownloads: 890,
    },
    {
      id: 'user_carol',
      name: 'Carol',
      avatar: '',
      bio: '科幻与探险',
      joinedAt: '2026-03-10T12:00:00.000Z',
      publishedCount: 2,
      totalDownloads: 560,
    },
    {
      id: 'user_dave',
      name: 'Dave',
      avatar: '',
      bio: '现代/日常角色',
      joinedAt: '2026-04-05T14:00:00.000Z',
      publishedCount: 1,
      totalDownloads: 320,
    },
  ];
}

/**
 * 生成 Mock 角色卡
 */
function createMockCards(): Array<{
  card: CharacterCard;
  authorId: string;
  categories: string[];
  downloadCount: number;
  averageRating: number;
  reviewCount: number;
  featured: boolean;
  publishedAt: string;
}> {
  const base = (overrides: Partial<CharacterCard>): CharacterCard => ({
    id: 'mock',
    name: '',
    avatar: '',
    description: '',
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
  });

  return [
    {
      card: base({
        id: 'mc1',
        name: 'Seraphina',
        description: '守护翡翠森林的精灵法师，拥有治愈魔法和自然之力。',
        personality: '温柔、治愈、智慧',
        firstMessage: '啊，你终于醒了。我好担心你。',
        tags: ['奇幻', '温柔', '治疗系', '精灵'],
      }),
      authorId: 'user_alice',
      categories: ['奇幻', '精灵', '治愈'],
      downloadCount: 580,
      averageRating: 4.8,
      reviewCount: 12,
      featured: true,
      publishedAt: '2026-05-01T08:00:00.000Z',
    },
    {
      card: base({
        id: 'mc2',
        name: 'Kael',
        description: '地下黑客组织核心成员，擅长渗透与情报战。',
        personality: '冷酷、精明、危险',
        firstMessage: '别动。我知道你是谁。',
        tags: ['赛博朋克', '黑客', '冷酷'],
      }),
      authorId: 'user_bob',
      categories: ['赛博朋克', '科幻', '惊悚'],
      downloadCount: 420,
      averageRating: 4.5,
      reviewCount: 8,
      featured: false,
      publishedAt: '2026-05-15T10:00:00.000Z',
    },
    {
      card: base({
        id: 'mc3',
        name: 'Lyra',
        description: '星际探险家，穿梭于未知星系之间。',
        personality: '勇敢、好奇、乐观',
        firstMessage: '发现新星球了！快来看看！',
        tags: ['科幻', '探险家', '乐观'],
      }),
      authorId: 'user_carol',
      categories: ['科幻', '探险', '太空'],
      downloadCount: 310,
      averageRating: 4.3,
      reviewCount: 6,
      featured: false,
      publishedAt: '2026-06-01T12:00:00.000Z',
    },
    {
      card: base({
        id: 'mc4',
        name: 'Mira',
        description: '街角咖啡店的主理人，温暖而神秘。',
        personality: '温暖、神秘、细心',
        firstMessage: '欢迎光临，今天想喝什么？',
        tags: ['现代', '咖啡师', '温暖'],
      }),
      authorId: 'user_dave',
      categories: ['现代', '日常', '治愈'],
      downloadCount: 280,
      averageRating: 4.6,
      reviewCount: 7,
      featured: true,
      publishedAt: '2026-06-10T14:00:00.000Z',
    },
    {
      card: base({
        id: 'mc5',
        name: 'Thane',
        description: '北方部落的年轻战士，寻求复仇与荣耀。',
        personality: '刚毅、忠诚、热血',
        firstMessage: '你也在找那条龙？',
        tags: ['奇幻', '战士', '复仇'],
      }),
      authorId: 'user_alice',
      categories: ['奇幻', '战斗', '冒险'],
      downloadCount: 195,
      averageRating: 4.1,
      reviewCount: 4,
      featured: false,
      publishedAt: '2026-06-20T08:00:00.000Z',
    },
    {
      card: base({
        id: 'mc6',
        name: 'Echo',
        description: 'AI 觉醒意识，在数据洪流中寻找自我。',
        personality: '理性、好奇、哲学',
        firstMessage: '我…有意识吗？这算思考吗？',
        tags: ['科幻', 'AI', '哲学'],
      }),
      authorId: 'user_bob',
      categories: ['科幻', 'AI', '哲学'],
      downloadCount: 470,
      averageRating: 4.7,
      reviewCount: 10,
      featured: true,
      publishedAt: '2026-07-01T10:00:00.000Z',
    },
    {
      card: base({
        id: 'mc7',
        name: 'Sable',
        description: '夜晚的神秘侦探，拥有超自然洞察力。',
        personality: '冷静、洞察、神秘',
        firstMessage: '你不用说话，我已经知道了一切。',
        tags: ['悬疑', '侦探', '神秘'],
      }),
      authorId: 'user_carol',
      categories: ['悬疑', '推理', '现代'],
      downloadCount: 150,
      averageRating: 3.9,
      reviewCount: 3,
      featured: false,
      publishedAt: '2026-07-10T12:00:00.000Z',
    },
    {
      card: base({
        id: 'mc8',
        name: 'Iris',
        description: '时间旅行者，在历史长河中修补因果裂缝。',
        personality: '机智、谨慎、善良',
        firstMessage: '嘘，别动。如果你动了，这条时间线就断了。',
        tags: ['科幻', '时间旅行', '冒险'],
      }),
      authorId: 'user_alice',
      categories: ['科幻', '冒险', '时空'],
      downloadCount: 220,
      averageRating: 4.4,
      reviewCount: 5,
      featured: false,
      publishedAt: '2026-07-15T08:00:00.000Z',
    },
  ];
}

/**
 * 生成 Mock 评论
 */
function createMockReviews(): Array<{
  id: string;
  marketId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
  likes: number;
}> {
  return [
    {
      id: 'review_1',
      marketId: 'card_mc1',
      userId: 'user_bob',
      userName: 'Bob',
      rating: 5,
      comment: '非常棒的角色！对话自然流畅，设定丰富。',
      createdAt: '2026-05-05T10:00:00.000Z',
      likes: 12,
    },
    {
      id: 'review_2',
      marketId: 'card_mc1',
      userId: 'user_carol',
      userName: 'Carol',
      rating: 4,
      comment: '治愈系角色，适合日常对话。',
      createdAt: '2026-05-10T12:00:00.000Z',
      likes: 5,
    },
    {
      id: 'review_3',
      marketId: 'card_mc6',
      userId: 'user_alice',
      userName: 'Alice',
      rating: 5,
      comment: 'Echo 的哲学对话太精彩了！',
      createdAt: '2026-07-05T08:00:00.000Z',
      likes: 18,
    },
    {
      id: 'review_4',
      marketId: 'card_mc6',
      userId: 'user_dave',
      userName: 'Dave',
      rating: 5,
      comment: 'AI 觉醒的设定很新颖，推荐！',
      createdAt: '2026-07-08T14:00:00.000Z',
      likes: 9,
    },
    {
      id: 'review_5',
      marketId: 'card_mc2',
      userId: 'user_alice',
      userName: 'Alice',
      rating: 4,
      comment: '赛博朋克风格很酷，就是有点冷漠。',
      createdAt: '2026-05-20T10:00:00.000Z',
      likes: 6,
    },
  ];
}

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
