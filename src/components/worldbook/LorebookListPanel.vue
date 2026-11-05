<script setup lang="ts">
/**
 * LorebookListPanel — 世界书列表（搜索 + scope 分类 Tab + 列表项）
 *
 * R1-3 从 WorldBookView（原 3115 行）拆出。**只负责"哪本书"的选择**：
 * 选中后的路由 / 压层逻辑留在宿主（那是页面级导航，不属于列表）。
 *
 * 注意 `.lorebook-list-panel` 这层外壳仍在 WorldBookView 里：
 * 手机两级互换的显隐是 `.worldbook-view[data-level='1'] .lorebook-list-panel`
 * （后代 + 属性选择器），外壳搬进本组件就够不到了。
 */
import { computed } from 'vue';
import EmptyState from '@/components/common/EmptyState.vue';
import FilterTabs, { type FilterTab } from '@/components/common/FilterTabs.vue';
import { useLorebookStore } from '@/stores/lorebook';
import { t } from '@/i18n';

const emit = defineEmits<{
  select: [id: string];
  create: [];
}>();

const store = useLorebookStore();

/** scope 标签映射 */
const SCOPE_LABELS: Record<'global' | 'character' | 'chat', string> = {
  global: t('wb.scopeGlobal'),
  character: t('wb.scopeCharacter'),
  chat: t('wb.scopeChat'),
};

/** 过滤 Tab，按 scope 聚合 + 显示数量徽标 */
const scopeFilterTabs = computed<FilterTab[]>(() => {
  const counts = store.scopeCounts;
  return (Object.keys(SCOPE_LABELS) as Array<keyof typeof SCOPE_LABELS>)
    .filter((s) => counts[s] > 0)
    .map((s) => ({
      value: s,
      label: SCOPE_LABELS[s],
      count: counts[s],
    }));
});

const filterScope = computed({
  get: () => store.filterScope,
  set: (v: string) => store.setFilterScope(v as 'global' | 'character' | 'chat' | ''),
});
</script>

<template>
  <div class="search-box">
    <input
      type="text"
      v-model="store.searchQuery"
      :placeholder="t('wb.searchPlaceholder')"
      :aria-label="t('wb.searchAria')"
      class="search-input"
    />
  </div>

  <!-- 需求1：按 scope 筛选分类 Tab -->
  <FilterTabs
    v-if="scopeFilterTabs.length > 0"
    v-model="filterScope"
    :tabs="scopeFilterTabs"
    :label="t('wb.filterLabel')"
    :all-label="t('wb.filterAll')"
    :all-value="''"
    :all-count="store.lorebooks.length"
  />

  <ul class="lorebook-list" role="list">
    <li
      v-for="lb in store.filteredLorebooks"
      :key="lb.id"
      role="listitem"
    >
      <button
        type="button"
        class="lorebook-item"
        :class="{ active: lb.id === store.currentLorebookId }"
        :aria-current="lb.id === store.currentLorebookId ? 'true' : undefined"
        @click="emit('select', lb.id)"
      >
        <div class="item-main">
          <span class="item-name">{{ lb.name }}</span>
          <span class="item-desc">{{ lb.description || t('wb.noDesc') }}</span>
        </div>
        <span class="item-meta">{{ t('wb.entryCount', { count: lb.entries.length }) }}</span>
      </button>
    </li>
    <!-- 列表内的一项，必须是 li（用默认 section 会生成 ul > section 的非法结构） -->
    <EmptyState
      v-if="store.filteredLorebooks.length === 0"
      as="li"
      compact
      title-key="wb.emptyList"
      action-key="wb.createFirst"
      @action="emit('create')"
    />
  </ul>
</template>

<style scoped>
.search-box {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.search-input:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.lorebook-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.lorebook-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .lorebook-item:hover {
    background: var(--card-elevated);
  }
}

.lorebook-item.active {
  background: var(--card-elevated);
  border-left-color: var(--primary);
}

.lorebook-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  font-size: 11px;
  color: var(--muted-foreground);
  flex-shrink: 0;
}

/* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）。
   规则随控件搬到本文件：父组件的 scoped 样式到不了子组件内部元素。 */
@media (max-width: 640px) {
  .search-input {
    font-size: 16px;
  }
}
</style>
