<script setup lang="ts">
/**
 * CommunityMarketView — 角色卡社区市场页面 (模块5)
 *
 * R2-4 拆分后宿主只留外壳与编排：Tab 骨架、Toast、昵称/发布两扇 Modal、
 * 详情入口（selectedCardId）与共享样式。子组件见 components/market/：
 * MarketHeader（页头）/ MarketRemotePanel（远程+更新横幅）/ MarketToolbar（搜索排序筛选）/
 * MarketCard（四网格共用卡）/ MarketAdminSection（管理）/ MarketDetailModal（详情/评论/举报）。
 *
 * 无障碍：
 * - 语义化 main/header/nav/section
 * - Tab 使用 role="tablist"/"tab"/"tabpanel"
 * - 图标按钮 aria-label
 * - Modal 焦点陷阱
 * - Toast role=alert
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Toast from '@/components/common/Toast.vue';
import Modal from '@/components/common/Modal.vue';
import MarketHeader from '@/components/market/MarketHeader.vue';
import MarketRemotePanel from '@/components/market/MarketRemotePanel.vue';
import MarketToolbar from '@/components/market/MarketToolbar.vue';
import MarketCard from '@/components/market/MarketCard.vue';
import MarketAdminSection from '@/components/market/MarketAdminSection.vue';
import MarketDetailModal from '@/components/market/MarketDetailModal.vue';
import type { MarketCharacterCard } from '@core/community-market';
import { t } from '@/i18n';

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

// ── Toast（全页单实例；子组件经 notify 事件冒泡到这里）──
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

// ── 昵称 Modal（本地身份，无凭据、无后端）──
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

// ── 详情入口（状态留宿主：四个网格都往这开；三扇详情相关 Modal 在 MarketDetailModal）──
const detailModalOpen = ref(false);
const selectedCardId = ref<string | null>(null);

function openDetail(marketId: string): void {
  selectedCardId.value = marketId;
  detailModalOpen.value = true;
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
</script>

<template>
  <div class="community-market-view">
    <MarketHeader @login="openLoginModal" @logout="handleLogout" />

    <nav class="tabs" role="tablist" :aria-label="t('market.tabsAria')">
      <button
type="button"
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
        <MarketRemotePanel />
        <MarketToolbar />

        <EmptyState
          v-if="store.filteredCards.length === 0"
          title-key="market.emptySearch"
          icon="search"
        />
        <div v-else class="card-grid">
          <MarketCard
            v-for="card in store.filteredCards"
            :key="card.marketId"
            :card="card"
            :badge="card.featured ? 'featured' : undefined"
            show-author
            show-favorite-stat
            aria-rating
            @open="openDetail(card.marketId)"
          />
        </div>
      </section>

      <!-- Tab 2: 推荐 -->
      <section v-if="activeTab === 'recommendations'" role="tabpanel" class="tab-panel">
        <EmptyState
          v-if="!store.isLoggedIn"
          title-key="market.recommendLogin"
          action-key="market.login"
          @action="openLoginModal"
        />
        <EmptyState
          v-else-if="recommendations.length === 0"
          title-key="market.recommendEmpty"
          icon="star"
        />
        <div v-else class="card-grid">
          <MarketCard
            v-for="item in recommendations"
            :key="item.card.marketId"
            :card="item.card"
            :score="item.score"
            @open="openDetail(item.card.marketId)"
          />
        </div>
      </section>

      <!-- Tab 3: 收藏 -->
      <section v-if="activeTab === 'favorites'" role="tabpanel" class="tab-panel">
        <EmptyState
          v-if="favoriteCards.length === 0"
          title-key="market.favoriteEmpty"
          icon="heart"
        />
        <div v-else class="card-grid">
          <MarketCard
            v-for="card in favoriteCards"
            :key="card.marketId"
            :card="card"
            @open="openDetail(card.marketId)"
          />
        </div>
      </section>

      <!-- Tab 4: 我的发布 -->
      <section v-if="activeTab === 'published'" role="tabpanel" class="tab-panel">
        <EmptyState
          v-if="!store.isLoggedIn"
          title-key="market.publishLogin"
          action-key="market.login"
          @action="openLoginModal"
        />
        <template v-else>
          <button type="button" class="btn btn-primary" @click="openPublishModal">
            <Icon name="plus" :size="16" />
            {{ t('market.publishBtn') }}
          </button>
          <EmptyState
            v-if="myPublishedCards.length === 0"
            title-key="market.publishedEmpty"
            icon="upload"
          />
          <div v-else class="card-grid">
            <MarketCard
              v-for="card in myPublishedCards"
              :key="card.marketId"
              :card="card"
              :badge="card.moderationStatus"
              :show-tags="false"
              :review-count="card.reviewCount"
              @open="openDetail(card.marketId)"
            />
          </div>
        </template>
      </section>

      <!-- Tab 5: 管理 -->
      <section v-if="activeTab === 'admin'" role="tabpanel" class="tab-panel">
        <MarketAdminSection @notify="showToast" />
      </section>
    </main>

    <!-- 昵称 Modal（批次 2-7：本地模拟、无凭据、无后端） -->
    <Modal v-model="loginModalOpen" :title="t('market.loginTitle')">
      <p class="login-hint">{{ t('market.nicknameHint') }}</p>
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

    <!-- 角色卡详情 + 评论 + 举报（共用 selectedCardId） -->
    <MarketDetailModal
      v-model="detailModalOpen"
      :card-id="selectedCardId"
      @notify="showToast"
    />

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

    <Toast v-model="toastOpen" :type="toastType" :message="toastMessage" />
  </div>
</template>

<style scoped>
.community-market-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card);
  color: var(--foreground);
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

@media (hover: hover) and (pointer: fine) {
  .tab:hover {
    color: var(--foreground);
  }
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

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

/* ── 页级共享基类：留在宿主，用 :deep() 一次作用到子组件内部（R2-2/R2-3 同判据——
   会不会被别处引用。Teleport 进 Modal 的内容收不到 :deep()（不在本节点祖先下），
   那部分由 MarketDetailModal 自带副本，见该组件注释）。── */
.community-market-view :deep(.btn-sm) {
  padding: 4px 10px;
  font-size: 12px;
}

.community-market-view :deep(.btn) {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.community-market-view :deep(.btn-sm) {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}

.community-market-view :deep(.btn-primary) {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .community-market-view :deep(.btn-primary:hover) {
    opacity: 0.9;
  }
}

.community-market-view :deep(.btn-ghost) {
  background: var(--card);
  color: var(--text, inherit);
  border-color: var(--border);
}

@media (hover: hover) and (pointer: fine) {
  .community-market-view :deep(.btn-ghost:hover) {
    background: var(--background);
  }
}

.community-market-view :deep(.empty-mini) {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  padding: 1rem 0;
}

.community-market-view :deep(.empty-mini) {
  padding: 10px 12px;
  color: var(--muted-foreground);
  font-size: 13px;
}

/* ── 宿主自己（昵称 / 发布两扇 Modal）用的共享基类：Teleport 里靠本节点 data-v 命中，
   保持普通 scoped 形态 ── */
.login-hint {
  margin: 0 0 var(--space-3, 12px);
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
  color: var(--foreground);
}

.form-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--background);
  color: var(--foreground);
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--primary);
}

/* 按钮（宿主两扇 Modal 自用；子组件内部靠上面的 :deep() 族） */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .btn-primary:hover {
    opacity: 0.9;
  }
}

.btn-ghost {
  background: var(--card);
  color: var(--foreground);
  border-color: var(--border);
}

@media (hover: hover) and (pointer: fine) {
  .btn-ghost:hover {
    background: var(--background);
  }
}

@media (max-width: 640px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）。
     `.search-input` 随搜索框搬到 MarketToolbar，覆盖块在该组件里（守卫按同文件判）。 */
  .form-input {
    font-size: 16px;
  }
}
</style>
