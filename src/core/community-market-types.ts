/**
 * 社区市场 —— 类型定义与纯工具函数
 *
 * 从 community-market.ts 拆出（R4-7）。本模块**不依赖引擎**，只放数据形状与
 * 无状态的字符串/数值工具，可被引擎、查询层、Mock 数据任意方向引用而无环。
 */

import type { CharacterCard } from './character-card';

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
export function intersectionSize(a: string[], b: string[]): number {
  const setB = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((s) => setB.has(s.toLowerCase())).length;
}

/**
 * 计算新鲜度分数（0-1，30天内为 1，超过 365 天递减到 0）
 */
export function recencyScore(publishedAt: string): number {
  const now = Date.now();
  const pub = new Date(publishedAt).getTime();
  const daysSince = (now - pub) / (1000 * 60 * 60 * 24);
  if (daysSince <= 30) return 1;
  if (daysSince >= 365) return 0;
  return 1 - (daysSince - 30) / 335;
}
