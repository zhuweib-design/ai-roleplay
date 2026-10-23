<script setup lang="ts">
/**
 * MarketCard — 市场卡片（R2-4 从 CommunityMarketView 拆出）
 *
 * 四个网格（市场 / 推荐 / 收藏 / 我的发布）共用一张卡，差异用 props 表达：
 * - score：推荐页顶部的推荐分
 * - badge：featured（市场页）或 moderationStatus（我的发布）
 * - showTags：我的发布不展示标签
 * - showAuthor：仅市场页
 * - showFavoriteStat：仅市场页（收藏数）
 * - ariaRating：仅市场页给评分加 aria-label（原样保留，其余网格原本没有）
 * - reviewCount：我的发布展示评论数
 *
 * 点卡开详情：emit `open`，由宿主持有 selectedCardId。
 */
import { computed } from 'vue';
import Icon from '@/components/common/Icon.vue';
import type { MarketCharacterCard } from '@core/community-market';
import { ratingStars, formatCount } from './market-format';
import { t } from '@/i18n';

const props = withDefaults(
  defineProps<{
    card: MarketCharacterCard;
    score?: number;
    badge?: string;
    showTags?: boolean;
    showAuthor?: boolean;
    showFavoriteStat?: boolean;
    ariaRating?: boolean;
    reviewCount?: number;
  }>(),
  {
    score: undefined,
    badge: undefined,
    showTags: true,
    showAuthor: false,
    showFavoriteStat: false,
    ariaRating: false,
    reviewCount: undefined,
  }
);

const emit = defineEmits<{ open: [] }>();

const badgeText = computed(() => {
  if (!props.badge) return '';
  if (props.badge === 'featured') return t('market.featured');
  return props.badge === 'approved'
    ? t('market.statusApproved')
    : props.badge === 'pending'
      ? t('market.statusPending')
      : t('market.statusRejected');
});
</script>

<template>
  <article class="market-card" tabindex="0" @click="emit('open')" @keydown.enter="emit('open')">
    <div v-if="score !== undefined" class="recommend-score">{{ t('market.recommendScore', { score }) }}</div>
    <div class="card-header">
      <span v-if="badge" :class="['badge', `badge-${badge}`]">{{ badgeText }}</span>
      <span class="card-name">{{ card.card.name }}</span>
    </div>
    <p class="card-desc">{{ card.card.description }}</p>
    <div v-if="showTags" class="card-tags">
      <span v-for="tag in card.card.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
    </div>
    <div class="card-footer">
      <span
        class="rating"
        :aria-label="ariaRating ? t('market.ratingAria', { rating: card.averageRating }) : undefined"
      >{{ ratingStars(card.averageRating) }}</span>
      <span class="stat"><Icon name="download" :size="14" /> {{ formatCount(card.downloadCount) }}</span>
      <span v-if="showFavoriteStat" class="stat"><Icon name="heart" :size="14" /> {{ formatCount(card.favoriteCount) }}</span>
      <span v-if="reviewCount !== undefined" class="stat"><Icon name="star" :size="14" /> {{ t('market.reviewCount', { count: reviewCount }) }}</span>
    </div>
    <div v-if="showAuthor" class="card-author">{{ t('market.author', { name: card.authorName }) }}</div>
  </article>
</template>

<style scoped>
.market-card {
  padding: 1rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}

@media (hover: hover) and (pointer: fine) {
  .market-card:hover {
    border-color: var(--primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
}

/* focus-visible 分支不加 hover 守卫：键盘可达性不受设备 hover 能力影响 */
.market-card:focus-visible {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.recommend-score {
  font-size: 0.75rem;
  color: var(--primary-fg, var(--primary));
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.card-name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--foreground);
}

.badge {
  padding: 0.125rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.6875rem;
  font-weight: 600;
}

.badge-featured {
  background: var(--primary);
  color: var(--on-primary);
}

.badge-approved {
  background: var(--success);
  color: var(--on-accent);
}

.badge-pending {
  background: var(--warning-fg);
  color: var(--on-accent);
}

.badge-rejected {
  background: var(--error);
  color: var(--on-accent);
}

.card-desc {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  margin: 0 0 0.5rem 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.tag {
  padding: 0.125rem 0.5rem;
  background: var(--background);
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin-bottom: 0.25rem;
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.rating {
  color: var(--warning-fg);
}

.card-author {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
</style>
