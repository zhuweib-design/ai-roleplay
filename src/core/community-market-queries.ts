/**
 * 社区市场 —— 纯查询与推荐算法
 *
 * 从 community-market.ts 拆出（R4-7）。三个函数全部无副作用：只读传入的
 * 角色卡集合，不写 Map、不留状态，因此引擎可以安全地把方法转发到这里。
 *
 * 加权评分（getRecommendations 原算法，权重未改动）：
 * - 标签匹配 40%（Jaccard 相似度）
 * - 评分 30%（averageRating / 5）
 * - 流行度 20%（log10 归一化下载量）
 * - 新鲜度 10%（发布时间衰减）
 */

import type {
  MarketCharacterCard,
  MarketFilter,
  SortOption,
  RecommendationParams,
  RecommendationItem,
} from './community-market-types';
import { intersectionSize, recencyScore } from './community-market-types';

// ── 筛选 ──

export function applyMarketFilter(cards: MarketCharacterCard[], filter: MarketFilter): MarketCharacterCard[] {
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

// ── 排序 ──

export function applyMarketSort(cards: MarketCharacterCard[], sort: SortOption): MarketCharacterCard[] {
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

// ── 推荐 ──

export function computeRecommendations(
  cardsMap: Map<string, MarketCharacterCard>,
  params: RecommendationParams
): RecommendationItem[] {
  const limit = params.limit ?? 10;
  const excludeIds = new Set(params.excludeIds ?? []);

  const candidates = Array.from(cardsMap.values()).filter(
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
