<script setup lang="ts">
/**
 * MarketToolbar — 搜索 / 排序 / 筛选条（R2-4 从 CommunityMarketView 拆出）
 *
 * 多根（toolbar + filter-bar 是原页里的两个兄弟块），不套 wrapper 保排布。
 * 分类筛选 Tab（需求1，单选）也在这条里：只被本条用，随组件走。
 */
import { computed } from 'vue';
import Icon from '@/components/common/Icon.vue';
import FilterTabs, { type FilterTab } from '@/components/common/FilterTabs.vue';
import type { SortOption } from '@core/community-market';
import { useCommunityMarketStore } from '@/stores/community-market';
import { t } from '@/i18n';

const store = useCommunityMarketStore();

// ── 排序选项 ──
const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'popular', label: t('market.sortPopular') },
  { value: 'rating', label: t('market.sortRating') },
  { value: 'newest', label: t('market.sortNewest') },
  { value: 'alphabetical', label: t('market.sortName') },
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
</script>

<template>
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
      <button
type="button"
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
      <button
type="button"
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
</template>

<style scoped>
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
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
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
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.chip.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (max-width: 640px) {
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

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）。
     守卫按"同文件 + 同选择器"判覆盖，搜索框搬到了本组件，覆盖块必须跟过来。 */
  .search-input,
  .form-input {
    font-size: 16px;
  }
}
</style>
