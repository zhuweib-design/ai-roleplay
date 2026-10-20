<script setup lang="ts">
/**
 * MarketDetailModal — 角色卡详情 / 评论 / 举报三扇 Modal（R2-4 从 CommunityMarketView 拆出）
 *
 * 三扇共用 `cardId`（宿主持有 selectedCardId：开详情由网格 emit，评论/举报打同一张卡）。
 * 操作反馈经 `notify` 冒泡回宿主 Toast；下载成功提示走 store.lastInfo（宿主 watcher）。
 *
 * 样式注意（传送门约束）：Modal 内容 Teleport 到 body，不在 `.community-market-view`
 * 祖先下，宿主的 `:deep()` 到不了——所以本组件自带一份所需共享基类（`.btn`/`.form-*`/
 * `.tag`/`.rating`/`.empty-mini`），值与原文件一致（`.btn` 省略 border 简写，
 * 边框交还全局层叠，避免再复制一条与 primitives 逐字同值的 `.btn-primary`）。
 */
import { ref, computed } from 'vue';
import Modal from '@/components/common/Modal.vue';
import Icon from '@/components/common/Icon.vue';
import type { MarketCharacterCard, ReportReason } from '@core/community-market';
import { useCommunityMarketStore } from '@/stores/community-market';
import { formatDate, ratingStars } from './market-format';
import { t } from '@/i18n';

const props = defineProps<{
  modelValue: boolean;
  cardId: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  notify: [type: 'info' | 'success' | 'error', message: string];
}>();

const store = useCommunityMarketStore();

const selectedCard = computed<MarketCharacterCard | null>(() => {
  if (!props.cardId) return null;
  return store.getCard(props.cardId);
});
const selectedCardReviews = computed(() => {
  if (!props.cardId) return [];
  return store.getReviews(props.cardId);
});

// ── 下载 ──
function handleDownload(marketId: string): void {
  store.downloadCard(marketId);
}

// ── 收藏 ──
function handleToggleFavorite(marketId: string): void {
  if (!store.isLoggedIn) {
    emit('notify', 'error', t('market.needLogin'));
    return;
  }
  store.toggleFavorite(marketId);
}

// ── 评论 Modal ──
const reviewModalOpen = ref(false);
const reviewRating = ref(5);
const reviewComment = ref('');

function openReviewModal(): void {
  if (!store.isLoggedIn) {
    emit('notify', 'error', t('market.needLogin'));
    return;
  }
  reviewRating.value = 5;
  reviewComment.value = '';
  reviewModalOpen.value = true;
}

function handleReview(): void {
  if (!props.cardId) return;
  if (!reviewComment.value.trim()) {
    emit('notify', 'error', t('market.needReviewText'));
    return;
  }
  if (store.addReview(props.cardId, reviewRating.value, reviewComment.value)) {
    reviewModalOpen.value = false;
  }
}

// ── 举报 Modal ──
const reportModalOpen = ref(false);
const reportReason = ref<ReportReason>('inappropriate');
const reportDescription = ref('');

const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'inappropriate', label: t('market.reasonInappropriate') },
  { value: 'copyright', label: t('market.reasonCopyright') },
  { value: 'spam', label: t('market.reasonSpam') },
  { value: 'misleading', label: t('market.reasonMisleading') },
  { value: 'other', label: t('market.reasonOther') },
];

function openReportModal(): void {
  if (!store.isLoggedIn) {
    emit('notify', 'error', t('market.needLogin'));
    return;
  }
  reportReason.value = 'inappropriate';
  reportDescription.value = '';
  reportModalOpen.value = true;
}

function handleReport(): void {
  if (!props.cardId) return;
  if (!reportDescription.value.trim()) {
    emit('notify', 'error', t('market.needReportText'));
    return;
  }
  if (store.reportCard(props.cardId, reportReason.value, reportDescription.value)) {
    reportModalOpen.value = false;
  }
}
</script>

<template>
  <!-- 角色卡详情 Modal -->
  <Modal
    v-if="selectedCard"
    :model-value="modelValue"
    :title="selectedCard.card.name"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="detail-content">
      <p class="detail-desc">{{ selectedCard.card.description }}</p>
      <div class="detail-tags">
        <span v-for="tag in selectedCard.card.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <div class="detail-meta">
        <span>{{ t('market.detailAuthor', { name: selectedCard.authorName }) }}</span>
        <span>{{ t('market.detailDate', { date: formatDate(selectedCard.publishedAt) }) }}</span>
        <span>{{ t('market.detailDownload', { count: selectedCard.downloadCount }) }}</span>
        <span>{{ t('market.detailRating', { rating: selectedCard.averageRating, count: selectedCard.reviewCount }) }}</span>
      </div>

      <h3 class="detail-section-title">{{ t('market.detailReviews') }}</h3>
      <div v-if="selectedCardReviews.length === 0" class="empty-mini">{{ t('market.detailNoReviews') }}</div>
      <ul v-else class="review-list">
        <li v-for="review in selectedCardReviews" :key="review.id" class="review-item">
          <div class="review-header">
            <span class="review-author">{{ review.userName }}</span>
            <span class="rating">{{ ratingStars(review.rating) }}</span>
          </div>
          <p class="review-comment">{{ review.comment }}</p>
          <span class="review-date">{{ formatDate(review.createdAt) }}</span>
        </li>
      </ul>
    </div>
    <template #footer>
      <button type="button" class="btn btn-ghost" @click="openReviewModal">
        <Icon name="star" :size="14" />
        {{ t('market.reviewBtn') }}
      </button>
      <button type="button" class="btn btn-ghost" @click="openReportModal">
        <Icon name="alert-triangle" :size="14" />
        {{ t('market.reportBtn') }}
      </button>
      <button
type="button"
        :class="['btn', store.isFavorite(selectedCard.marketId) ? 'btn-primary' : 'btn-ghost']"
        @click="handleToggleFavorite(selectedCard.marketId)"
      >
        <Icon name="heart" :size="14" />
        {{ store.isFavorite(selectedCard.marketId) ? t('market.favorited') : t('market.favorite') }}
      </button>
      <button type="button" class="btn btn-primary" @click="handleDownload(selectedCard.marketId)">
        <Icon name="download" :size="14" />
        {{ t('market.download') }}
      </button>
    </template>
  </Modal>

  <!-- 评论 Modal -->
  <Modal v-model="reviewModalOpen" :title="t('market.reviewTitle')">
    <div class="form-group">
      <label class="form-label">{{ t('market.reviewLabel') }}</label>
      <div class="rating-input" role="radiogroup" :aria-label="t('market.reviewAria')">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          role="radio"
          :aria-checked="reviewRating === n"
          :class="['star-btn', { active: reviewRating >= n }]"
          @click="reviewRating = n"
        >
          ★
        </button>
      </div>
    </div>
    <div class="form-group">
      <label for="review-comment" class="form-label">{{ t('market.reviewComment') }}</label>
      <textarea
        id="review-comment"
        v-model="reviewComment"
        class="form-input form-textarea"
        :placeholder="t('market.reviewPlaceholder')"
        rows="3"
      ></textarea>
    </div>
    <template #footer>
      <button type="button" class="btn btn-ghost" @click="reviewModalOpen = false">{{ t('market.cancel') }}</button>
      <button type="button" class="btn btn-primary" @click="handleReview">{{ t('market.publishReview') }}</button>
    </template>
  </Modal>

  <!-- 举报 Modal -->
  <Modal v-model="reportModalOpen" :title="t('market.reportTitle')">
    <div class="form-group">
      <label class="form-label">{{ t('market.reportReason') }}</label>
      <select v-model="reportReason" class="form-input">
        <option v-for="r in REPORT_REASONS" :key="r.value" :value="r.value">{{ r.label }}</option>
      </select>
    </div>
    <div class="form-group">
      <label for="report-desc" class="form-label">{{ t('market.reportDesc') }}</label>
      <textarea
        id="report-desc"
        v-model="reportDescription"
        class="form-input form-textarea"
        :placeholder="t('market.reportPlaceholder')"
        rows="3"
      ></textarea>
    </div>
    <template #footer>
      <button type="button" class="btn btn-ghost" @click="reportModalOpen = false">{{ t('market.cancel') }}</button>
      <button type="button" class="btn btn-primary" @click="handleReport">{{ t('market.submitReport') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
/* ── 详情（随组件搬走） ── */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-desc {
  font-size: 0.875rem;
  color: var(--text);
  margin: 0;
}

.detail-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  padding: 0.75rem;
  background: var(--background);
  border-radius: 0.5rem;
}

.detail-section-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0.5rem 0 0.25rem 0;
}

.review-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.review-item {
  padding: 0.75rem;
  background: var(--background);
  border-radius: 0.5rem;
}

.review-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.review-author {
  font-weight: 600;
  font-size: 0.8125rem;
}

.review-comment {
  font-size: 0.8125rem;
  color: var(--text);
  margin: 0 0 0.25rem 0;
}

.review-date {
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}

/* ── 评分星 / 举报与评论的星级输入 ── */
.rating-input {
  display: flex;
  gap: 0.25rem;
}

.star-btn {
  font-size: 1.5rem;
  color: var(--border);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}

.star-btn.active {
  color: var(--warning-fg);
}

/* ── 共享基类的本组件副本（Teleport 到 body，宿主 :deep() 到不了）──
   与原文件同值；两处例外都写明了原因：
   1. `.btn` 省略 border 简写 —— 边框交回全局层叠（.btn 的 --border、
      .btn-primary 的 --primary 都来自 primitives.css），这样不必再复制一条
      与 primitives 逐字同值的 .btn-primary（那会撞 primitives-guard 的同值判定）。
   2. 颜色用 var(--text, inherit) 带兜底写法 —— 裸引用属 token 死引用（A 类），
      带兜底归 B 类；text 变量未定义时 unset 与 inherit 等价，运行时行为不变。 */
.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
  color: var(--text, inherit);
}

.form-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--background);
  color: var(--text, inherit);
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--primary);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.tag {
  padding: 0.125rem 0.5rem;
  background: var(--background);
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}

.rating {
  color: var(--warning-fg);
}

.empty-mini {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  padding: 1rem 0;
}

.empty-mini {
  padding: 10px 12px;
  color: var(--muted-foreground);
  font-size: 13px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.btn-ghost {
  background: var(--card);
  color: var(--text, inherit);
  border-color: var(--border);
}

@media (hover: hover) and (pointer: fine) {
  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-ghost:hover {
    background: var(--background);
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：本组件的可编辑控件（评论/举报 textarea、举报 select） */
  .form-input {
    font-size: 16px;
  }
}
</style>
