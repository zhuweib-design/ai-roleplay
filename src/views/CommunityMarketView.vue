<script setup lang="ts">
/**
 * CommunityMarketView — 角色卡社区市场页面 (模块5)
 *
 * 功能：
 * - 顶部：返回按钮 + 登录/用户信息
 * - Tab 1 市场：搜索/筛选/排序 + 角色卡卡片网格
 * - Tab 2 推荐：个性化推荐列表（基于收藏标签）
 * - Tab 3 收藏：已收藏的角色卡
 * - Tab 4 我的发布：已发布的角色卡管理
 * - Tab 5 管理：审核/举报管理（所有用户可见 pending 状态）
 * - Modal：登录、角色卡详情、发布、评论、举报
 *
 * 无障碍：
 * - 语义化 main/header/nav/section
 * - Tab 使用 role="tablist"/"tab"/"tabpanel"
 * - 图标按钮 aria-label
 * - Modal 焦点陷阱
 * - Toast role=alert
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import Modal from '@/components/common/Modal.vue';
import FilterTabs, { type FilterTab } from '@/components/common/FilterTabs.vue';
import type { MarketCharacterCard, SortOption, ReportReason } from '@core/community-market';
import { t } from '@/i18n';

const router = useRouter();
const store = useCommunityMarketStore();
const characterStore = useCharacterStore();

// ── 启动 ──
onMounted(() => {
  void store.loadFromDisk();
});

// ── Tab ──
type TabKey = 'market' | 'recommendations' | 'favorites' | 'published' | 'admin';
const activeTab = ref<TabKey>('market');
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'market', label: t('market.tabMarket') },
  { key: 'recommendations', label: t('market.tabRecommend') },
  { key: 'favorites', label: t('market.tabFavorites') },
  { key: 'published', label: t('market.tabPublished') },
  { key: 'admin', label: t('market.tabAdmin') },
];

// ── 需求1：市场内分类筛选 Tab（单选） ──────────────────────────────
const categoryFilterTabs = computed<FilterTab[]>(() => {
  const counts = store.categoryCounts;
  return store.allCategories.slice(0, 12).map((cat) => ({
    value: cat,
    label: cat,
    count: counts[cat] ?? 0,
  }));
});

const filterCategory = computed({
  get: () => store.currentCategory,
  set: (v: string) => store.setCategory(v),
});

// ── Toast ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(type: typeof toastType.value, message: string): void {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastOpen.value = false;
  }, 2500);
}

watch(
  () => store.lastError,
  (val) => {
    if (val) {
      showToast('error', val);
      store.clearLastError();
    }
  }
);

watch(
  () => store.lastInfo,
  (val) => {
    if (val) {
      showToast('success', val);
      store.clearLastInfo();
    }
  }
);

// ── 排序选项 ──
const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'popular', label: t('market.sortPopular') },
  { value: 'rating', label: t('market.sortRating') },
  { value: 'newest', label: t('market.sortNewest') },
  { value: 'alphabetical', label: t('market.sortName') },
];

// ── 登录 Modal ──
const loginModalOpen = ref(false);
const loginName = ref('');

function openLoginModal(): void {
  loginName.value = '';
  loginModalOpen.value = true;
}

function handleLogin(): void {
  if (!loginName.value.trim()) {
    showToast('error', t('market.needUsername'));
    return;
  }
  if (store.login(loginName.value.trim())) {
    loginModalOpen.value = false;
  }
}

function handleLogout(): void {
  store.logout();
}

// ── 角色卡详情 Modal ──
const detailModalOpen = ref(false);
const selectedCardId = ref<string | null>(null);
const selectedCard = computed<MarketCharacterCard | null>(() => {
  if (!selectedCardId.value) return null;
  return store.getCard(selectedCardId.value);
});
const selectedCardReviews = computed(() => {
  if (!selectedCardId.value) return [];
  return store.getReviews(selectedCardId.value);
});

function openDetail(marketId: string): void {
  selectedCardId.value = marketId;
  detailModalOpen.value = true;
}

// ── 下载 ──
function handleDownload(marketId: string): void {
  store.downloadCard(marketId);
}

// ── 收藏 ──
function handleToggleFavorite(marketId: string): void {
  if (!store.isLoggedIn) {
    showToast('error', t('market.needLogin'));
    return;
  }
  store.toggleFavorite(marketId);
}

// ── 发布 Modal ──
const publishModalOpen = ref(false);
const publishCharacterId = ref('');
const publishCategories = ref('');

function openPublishModal(): void {
  if (!store.isLoggedIn) {
    showToast('error', t('market.needLogin'));
    return;
  }
  publishCharacterId.value = '';
  publishCategories.value = '';
  publishModalOpen.value = true;
}

function handlePublish(): void {
  if (!publishCharacterId.value) {
    showToast('error', t('market.needCharacter'));
    return;
  }
  const categories = publishCategories.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const marketId = store.publishCard(
    getCharacterCard(publishCharacterId.value),
    categories
  );
  if (marketId) {
    publishModalOpen.value = false;
  }
}

function getCharacterCard(characterId: string) {
  const char = characterStore.characters.find((c) => c.id === characterId);
  if (!char) throw new Error(t('market.charNotFound'));
  return {
    id: char.id,
    name: char.name,
    avatar: char.avatar,
    description: char.description,
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: char.tags,
    favorite: char.favorite,
    version: '1.0',
    createdAt: char.lastActive,
    updatedAt: new Date().toISOString(),
    attributes: char.attributes,
  };
}

// ── 评论 Modal ──
const reviewModalOpen = ref(false);
const reviewRating = ref(5);
const reviewComment = ref('');

function openReviewModal(): void {
  if (!store.isLoggedIn) {
    showToast('error', t('market.needLogin'));
    return;
  }
  reviewRating.value = 5;
  reviewComment.value = '';
  reviewModalOpen.value = true;
}

function handleReview(): void {
  if (!selectedCardId.value) return;
  if (!reviewComment.value.trim()) {
    showToast('error', t('market.needReviewText'));
    return;
  }
  if (store.addReview(selectedCardId.value, reviewRating.value, reviewComment.value)) {
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
    showToast('error', t('market.needLogin'));
    return;
  }
  reportReason.value = 'inappropriate';
  reportDescription.value = '';
  reportModalOpen.value = true;
}

function handleReport(): void {
  if (!selectedCardId.value) return;
  if (!reportDescription.value.trim()) {
    showToast('error', t('market.needReportText'));
    return;
  }
  if (store.reportCard(selectedCardId.value, reportReason.value, reportDescription.value)) {
    reportModalOpen.value = false;
  }
}

// ── D6 补完：管理操作 ──
function handleApprove(marketId: string): void {
  if (store.setModerationStatus(marketId, 'approved')) {
    showToast('success', t('market.approved'));
  }
}

function handleReject(marketId: string): void {
  if (store.setModerationStatus(marketId, 'rejected')) {
    showToast('error', t('market.rejected'));
  }
}

function handleResolveReport(reportId: string, status: 'resolved' | 'dismissed'): void {
  if (store.resolveReport(reportId, status)) {
    showToast('success', status === 'resolved' ? t('market.reportResolved') : t('market.reportDismissed'));
  }
}

// ── 推荐 ──
const recommendations = computed(() => {
  if (!store.isLoggedIn) return [];
  return store.getRecommendations({ limit: 6 });
});

// ── 我的发布 ──
const myPublishedCards = computed<MarketCharacterCard[]>(() => {
  if (!store.currentUser) return [];
  return store.filteredCards.filter(
    (c) => c.authorId === store.currentUser!.id
  );
});

// ── 收藏列表 ──
const favoriteCards = computed(() => store.getFavoriteCards());

// ── 辅助 ──
function goBack(): void {
  void router.push('/chat');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function ratingStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}
</script>

<template>
  <div class="community-market-view">
    <header class="page-header">
      <button type="button" class="header-btn" :aria-label="t('market.backAria')" @click="goBack">
        <Icon name="arrow-left" :size="18" aria-hidden="true" />
      </button>
      <h1 class="page-title">
        {{ t('market.title') }}
        <span
          class="beta-badge"
          :title="t('market.betaTitle')"
        >{{ t('market.beta') }}</span>
      </h1>
      <div class="header-right">
        <template v-if="store.isLoggedIn">
          <span class="user-info">
            <Icon name="user" :size="16" />
            {{ store.currentUser?.name }}
          </span>
          <button type="button" class="btn btn-ghost" @click="handleLogout">{{ t('market.logout') }}</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-primary" @click="openLoginModal">{{ t('market.login') }}</button>
        </template>
      </div>
    </header>

    <nav class="tabs" role="tablist" :aria-label="t('market.tabsAria')">
      <button type="button"
        v-for="tab in TABS"
        :key="tab.key"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :class="['tab', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main class="page-content">
      <!-- Tab 1: 市场 -->
      <section v-if="activeTab === 'market'" role="tabpanel" class="tab-panel">
        <div class="toolbar">
          <div class="search-box">
            <Icon name="search" :size="16" />
            <input
              :value="store.searchQuery"
              type="text"
              :placeholder="t('market.searchPlaceholder')"
              :aria-label="t('market.searchAria')"
              class="search-input"
              @input="store.setSearch(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="sort-buttons" role="group" :aria-label="t('market.sortAria')">
            <button type="button"
              v-for="opt in SORT_OPTIONS"
              :key="opt.value"
              :class="['sort-btn', { active: store.sortBy === opt.value }]"
              @click="store.setSortBy(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="filter-bar">
          <div class="filter-chips">
            <button type="button"
              :class="['chip', { active: store.featuredOnly }]"
              @click="store.toggleFeaturedOnly()"
            >
              {{ t('market.featured') }}
            </button>
          </div>
          <!-- 需求1：分类 Tab 筛选（单选） -->
          <FilterTabs
            v-if="categoryFilterTabs.length > 0"
            v-model="filterCategory"
            :tabs="categoryFilterTabs"
            :label="t('market.filterLabel')"
            :all-label="t('market.filterAll')"
            :all-value="''"
            :all-count="store.filteredCards.length"
          />
          <button type="button" v-if="store.searchQuery || store.selectedTags.length || store.selectedCategories.length || store.featuredOnly" class="btn btn-ghost btn-sm" @click="store.clearFilters()">
            {{ t('market.clearFilters') }}
          </button>
        </div>

        <div v-if="store.filteredCards.length === 0" class="empty-state">
          <Icon name="search" :size="48" />
          <p>{{ t('market.emptySearch') }}</p>
        </div>
        <div v-else class="card-grid">
          <article
            v-for="card in store.filteredCards"
            :key="card.marketId"
            class="market-card"
            tabindex="0"
            @click="openDetail(card.marketId)"
            @keydown.enter="openDetail(card.marketId)"
          >
            <div class="card-header">
              <span v-if="card.featured" class="badge badge-featured">{{ t('market.featured') }}</span>
              <span class="card-name">{{ card.card.name }}</span>
            </div>
            <p class="card-desc">{{ card.card.description }}</p>
            <div class="card-tags">
              <span v-for="tag in card.card.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="card-footer">
              <span class="rating" :aria-label="t('market.ratingAria', { rating: card.averageRating })">{{ ratingStars(card.averageRating) }}</span>
              <span class="stat"><Icon name="download" :size="14" /> {{ formatCount(card.downloadCount) }}</span>
              <span class="stat"><Icon name="heart" :size="14" /> {{ formatCount(card.favoriteCount) }}</span>
            </div>
            <div class="card-author">{{ t('market.author', { name: card.authorName }) }}</div>
          </article>
        </div>
      </section>

      <!-- Tab 2: 推荐 -->
      <section v-if="activeTab === 'recommendations'" role="tabpanel" class="tab-panel">
        <div v-if="!store.isLoggedIn" class="empty-state">
          <Icon name="info" :size="48" />
          <p>{{ t('market.recommendLogin') }}</p>
          <button type="button" class="btn btn-primary" @click="openLoginModal">{{ t('market.login') }}</button>
        </div>
        <div v-else-if="recommendations.length === 0" class="empty-state">
          <Icon name="star" :size="48" />
          <p>{{ t('market.recommendEmpty') }}</p>
        </div>
        <div v-else class="card-grid">
          <article
            v-for="item in recommendations"
            :key="item.card.marketId"
            class="market-card"
            tabindex="0"
            @click="openDetail(item.card.marketId)"
            @keydown.enter="openDetail(item.card.marketId)"
          >
            <div class="recommend-score">{{ t('market.recommendScore', { score: item.score }) }}</div>
            <div class="card-header">
              <span class="card-name">{{ item.card.card.name }}</span>
            </div>
            <p class="card-desc">{{ item.card.card.description }}</p>
            <div class="card-tags">
              <span v-for="tag in item.card.card.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="card-footer">
              <span class="rating">{{ ratingStars(item.card.averageRating) }}</span>
              <span class="stat"><Icon name="download" :size="14" /> {{ formatCount(item.card.downloadCount) }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- Tab 3: 收藏 -->
      <section v-if="activeTab === 'favorites'" role="tabpanel" class="tab-panel">
        <div v-if="favoriteCards.length === 0" class="empty-state">
          <Icon name="heart" :size="48" />
          <p>{{ t('market.favoriteEmpty') }}</p>
        </div>
        <div v-else class="card-grid">
          <article
            v-for="card in favoriteCards"
            :key="card.marketId"
            class="market-card"
            tabindex="0"
            @click="openDetail(card.marketId)"
            @keydown.enter="openDetail(card.marketId)"
          >
            <div class="card-header">
              <span class="card-name">{{ card.card.name }}</span>
            </div>
            <p class="card-desc">{{ card.card.description }}</p>
            <div class="card-tags">
              <span v-for="tag in card.card.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="card-footer">
              <span class="rating">{{ ratingStars(card.averageRating) }}</span>
              <span class="stat"><Icon name="download" :size="14" /> {{ formatCount(card.downloadCount) }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- Tab 4: 我的发布 -->
      <section v-if="activeTab === 'published'" role="tabpanel" class="tab-panel">
        <div v-if="!store.isLoggedIn" class="empty-state">
          <Icon name="info" :size="48" />
          <p>{{ t('market.publishLogin') }}</p>
          <button type="button" class="btn btn-primary" @click="openLoginModal">{{ t('market.login') }}</button>
        </div>
        <template v-else>
          <button type="button" class="btn btn-primary" @click="openPublishModal">
            <Icon name="plus" :size="16" />
            {{ t('market.publishBtn') }}
          </button>
          <div v-if="myPublishedCards.length === 0" class="empty-state">
            <Icon name="upload" :size="48" />
            <p>{{ t('market.publishedEmpty') }}</p>
          </div>
          <div v-else class="card-grid">
            <article
              v-for="card in myPublishedCards"
              :key="card.marketId"
              class="market-card"
              tabindex="0"
              @click="openDetail(card.marketId)"
              @keydown.enter="openDetail(card.marketId)"
            >
              <div class="card-header">
                <span :class="['badge', `badge-${card.moderationStatus}`]">
                  {{ card.moderationStatus === 'approved' ? t('market.statusApproved') : card.moderationStatus === 'pending' ? t('market.statusPending') : t('market.statusRejected') }}
                </span>
                <span class="card-name">{{ card.card.name }}</span>
              </div>
              <p class="card-desc">{{ card.card.description }}</p>
              <div class="card-footer">
                <span class="rating">{{ ratingStars(card.averageRating) }}</span>
                <span class="stat"><Icon name="download" :size="14" /> {{ formatCount(card.downloadCount) }}</span>
                <span class="stat"><Icon name="star" :size="14" /> {{ t('market.reviewCount', { count: card.reviewCount }) }}</span>
              </div>
            </article>
          </div>
        </template>
      </section>

      <!-- Tab 5: 管理 -->
      <section v-if="activeTab === 'admin'" role="tabpanel" class="tab-panel">
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalCards }}</span>
            <span class="stat-label">{{ t('market.statTotalCards') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalUsers }}</span>
            <span class="stat-label">{{ t('market.statUsers') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalReviews }}</span>
            <span class="stat-label">{{ t('market.statReviews') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalDownloads }}</span>
            <span class="stat-label">{{ t('market.statDownloads') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.pendingCards }}</span>
            <span class="stat-label">{{ t('market.statPending') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ store.stats.totalReports }}</span>
            <span class="stat-label">{{ t('market.statReports') }}</span>
          </div>
        </div>

        <!-- D6 补完：待审核角色卡操作 -->
        <h3 class="admin-section-title">{{ t('market.adminPendingTitle') }}</h3>
        <ul class="admin-list" role="list">
          <li
            v-for="card in store.filteredCards.filter((c) => c.moderationStatus === 'pending')"
            :key="card.marketId"
            class="admin-row"
            role="listitem"
          >
            <span class="admin-name">{{ card.card.name }}</span>
            <span class="admin-meta">{{ t('market.author', { name: card.authorName }) }}</span>
            <div class="admin-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="handleApprove(card.marketId)"
              >
                {{ t('market.adminApprove') }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="handleReject(card.marketId)"
              >
                {{ t('market.adminReject') }}
              </button>
            </div>
          </li>
          <li v-if="store.filteredCards.filter((c) => c.moderationStatus === 'pending').length === 0" class="empty-mini">
            {{ t('market.adminNoPending') }}
          </li>
        </ul>

        <!-- D6 补完：举报处理 -->
        <h3 class="admin-section-title">{{ t('market.adminReportsTitle') }}</h3>
        <ul class="admin-list" role="list">
          <li
            v-for="report in store.getReports().filter((r) => r.status === 'pending')"
            :key="report.id"
            class="admin-row"
            role="listitem"
          >
            <span class="admin-name">{{ report.marketId }}</span>
            <span class="admin-meta">{{ t('market.adminReportMeta', { reason: report.reason, desc: report.description }) }}</span>
            <div class="admin-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="handleResolveReport(report.id, 'resolved')"
              >
                {{ t('market.adminResolve') }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="handleResolveReport(report.id, 'dismissed')"
              >
                {{ t('market.adminDismiss') }}
              </button>
            </div>
          </li>
          <li v-if="store.getReports().filter((r) => r.status === 'pending').length === 0" class="empty-mini">
            {{ t('market.adminNoReports') }}
          </li>
        </ul>
      </section>
    </main>

    <!-- 登录 Modal -->
    <Modal v-model="loginModalOpen" :title="t('market.loginTitle')">
      <div class="form-group">
        <label for="login-name" class="form-label">{{ t('market.username') }}</label>
        <input
          id="login-name"
          v-model="loginName"
          type="text"
          class="form-input"
          :placeholder="t('market.usernamePlaceholder')"
          @keydown.enter="handleLogin"
        />
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="loginModalOpen = false">{{ t('market.cancel') }}</button>
        <button type="button" class="btn btn-primary" @click="handleLogin">{{ t('market.loginBtn') }}</button>
      </template>
    </Modal>

    <!-- 角色卡详情 Modal -->
    <Modal
      v-if="selectedCard"
      v-model="detailModalOpen"
      :title="selectedCard.card.name"
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
        <button type="button"
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

    <!-- 发布 Modal -->
    <Modal v-model="publishModalOpen" :title="t('market.publishTitle')">
      <div class="form-group">
        <label for="publish-character" class="form-label">{{ t('market.selectCharacter') }}</label>
        <select id="publish-character" v-model="publishCharacterId" class="form-input">
          <option value="">{{ t('market.selectPlaceholder') }}</option>
          <option v-for="char in characterStore.characters" :key="char.id" :value="char.id">
            {{ char.name }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="publish-categories" class="form-label">{{ t('market.categories') }}</label>
        <input
          id="publish-categories"
          v-model="publishCategories"
          type="text"
          class="form-input"
          :placeholder="t('market.categoriesPlaceholder')"
        />
      </div>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="publishModalOpen = false">{{ t('market.cancel') }}</button>
        <button type="button" class="btn btn-primary" @click="handlePublish">{{ t('market.publish') }}</button>
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

    <Toast v-model="toastOpen" :type="toastType" :message="toastMessage" />
  </div>
</template>

<style scoped>
.community-market-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.page-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

/* T-14: 市场 Beta 徽标 */
.beta-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
  color: var(--warning, #f59e0b);
  font-size: 11px;
  font-weight: 600;
  vertical-align: middle;
  letter-spacing: 0.5px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--muted-foreground);
}

.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.tab {
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  color: var(--muted-foreground);
  font-size: 0.875rem;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  color: var(--primary-fg, var(--primary));
  border-bottom-color: var(--primary);
}

.tab-panel {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.toolbar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}

.search-input {
  flex: 1;
  border: none;
  background: none;
  color: var(--text);
  font-size: 0.875rem;
  outline: none;
}

.sort-buttons {
  display: flex;
  gap: 0.25rem;
}

.sort-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: var(--card);
  color: var(--muted-foreground);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}

.sort-btn.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filter-chips {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: var(--card);
  color: var(--muted-foreground);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.chip.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.market-card {
  padding: 1rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}

.market-card:hover,
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
  color: var(--text);
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem 1rem;
  color: var(--muted-foreground);
  text-align: center;
}

.empty-mini {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  padding: 1rem 0;
}

/* D6 管理 Tab 操作区 */
.admin-section-title {
  margin: 18px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.admin-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.admin-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  font-size: 13px;
}
.admin-name {
  font-weight: 600;
  color: var(--text-primary);
  flex: 0 0 auto;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-meta {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}
.empty-mini {
  padding: 10px 12px;
  color: var(--muted-foreground);
  font-size: 13px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--primary-fg, var(--primary));
}

.stat-label {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  margin-top: 0.25rem;
}

/* 详情 Modal */
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

/* 表单 */
.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
  color: var(--text);
}

.form-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--background);
  color: var(--text);
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

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-sm {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-ghost {
  background: var(--card);
  color: var(--text);
  border-color: var(--border);
}

.btn-ghost:hover {
  background: var(--background);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, border-color 0.15s;
}

.header-btn:hover {
  background: var(--background);
}

.header-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .card-grid {
    grid-template-columns: 1fr;
  }

  .toolbar {
    flex-direction: column;
  }

  .search-box {
    width: 100%;
  }

  .sort-buttons {
    overflow-x: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>
