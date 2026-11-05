<script setup lang="ts">
/**
 * GroupListPanel — 群聊列表（手机一级页满屏，R1-1 从 GroupChatView 拆出）
 *
 * 筛选（状态 + 关键词）是这块自己的 UI 状态：除了这个列表没人读它，
 * 留在视图里只会让父级多两个与它无关的 ref。
 * 选群是意图，交给父级——那里还要写 URL、压两级历史、拉远端回合。
 */
import { computed, ref } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { GroupChat } from '@/core/group-chat';

const props = defineProps<{
  /** 全部群聊（筛选在本组件内做） */
  groups: GroupChat[];
  /** 当前选中的群 id */
  currentGroupId: string | null;
}>();

const emit = defineEmits<{
  select: [groupId: string];
  create: [];
}>();

const groupFilter = ref<'all' | 'active' | 'archived'>('all');
const groupSearch = ref('');

const filteredGroups = computed(() => {
  const q = groupSearch.value.trim().toLowerCase();
  return props.groups.filter((g) => {
    if (groupFilter.value === 'active' && g.lifecycleStatus === 'archived') return false;
    if (groupFilter.value === 'archived' && g.lifecycleStatus !== 'archived') return false;
    if (q && !g.name.toLowerCase().includes(q)) return false;
    return true;
  });
});
</script>

<template>
  <aside class="group-list-panel m-swap__master tk-scroll" :aria-label="t('group.listAria')">
    <!-- 需求6 筛选：状态 + 关键词 -->
    <div class="group-filter-bar">
      <div class="group-filter-tabs" role="tablist" :aria-label="t('group.filterAria')">
        <button
          v-for="f in ([
            { id: 'all', label: t('group.filterAll') },
            { id: 'active', label: t('group.filterActive') },
            { id: 'archived', label: t('group.filterArchived') },
          ] as const)"
          :key="f.id"
          type="button"
          class="filter-tab"
          :class="{ active: groupFilter === f.id }"
          role="tab"
          :aria-selected="groupFilter === f.id"
          @click="groupFilter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <input
        v-model="groupSearch"
        type="search"
        class="group-search-input"
        :placeholder="t('group.searchPlaceholder')"
        :aria-label="t('group.searchAria')"
      />
    </div>
    <ul class="group-list" role="list">
      <li v-for="g in filteredGroups" :key="g.id" role="listitem">
        <button
          type="button"
          class="group-item"
          :class="{
            active: g.id === currentGroupId,
            archived: g.lifecycleStatus === 'archived',
          }"
          :aria-current="g.id === currentGroupId ? 'true' : undefined"
          @click="emit('select', g.id)"
        >
          <div class="group-avatar">
            <Icon name="users" :size="20" />
          </div>
          <div class="group-info">
            <div class="group-name">
              {{ g.name }}
              <span v-if="g.lifecycleStatus === 'archived'" class="archived-badge">{{ t('group.archivedBadge') }}</span>
            </div>
            <div class="group-meta">{{ t('group.meta', { members: g.members.length, messages: g.messages.length }) }}</div>
          </div>
        </button>
      </li>
      <EmptyState
        v-if="filteredGroups.length === 0"
        as="li"
        :title-key="groups.length === 0 ? 'group.noGroups' : 'group.noMatch'"
        icon="users"
        :action-key="groups.length === 0 ? 'group.createFirst' : undefined"
        @action="emit('create')"
      />
    </ul>
  </aside>
</template>

<style scoped>
/* 左侧群聊列表 */
.group-list-panel {
  border-right: 1px solid var(--border);
  background: var(--card);
  overflow-y: auto;
}

/* 需求6 筛选栏 */
.group-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.group-filter-tabs {
  display: flex;
  gap: 4px;
}
.filter-tab {
  flex: 1;
  padding: 5px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.filter-tab.active {
  border-color: var(--ring);
  color: var(--text-primary);
  font-weight: 600;
}
.filter-tab:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.group-search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--text-primary);
  font-size: 13px;
}
.group-search-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.group-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 10px;
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
  .group-item:hover {
    background: var(--card-elevated);
  }
}

.group-item.active {
  background: var(--card-elevated);
  border-left-color: var(--primary);
}

.group-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.group-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-meta {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.group-item.archived {
  opacity: 0.6;
}

.archived-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 500;
  color: var(--muted-foreground);
  background: color-mix(in srgb, var(--muted-foreground) 15%, transparent);
  border-radius: var(--radius-pill, 999px);
  vertical-align: middle;
}

@media (max-width: 1024px) {
  /* 窄屏不隐藏群聊列表,堆叠+限高滚动,保留选择能力 */
  .group-list-panel {
    display: block;
    max-height: 42vh;
    overflow-y: auto;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .group-search-input {
    font-size: 16px;
  }

  /* 两级互换：一级页就是满屏列表，取消 1024 档那个 max-height:42vh
     （那是"堆叠两段"的遗产，留 42% 会让列表只占半屏、下半屏是空的） */
  .group-list-panel {
    max-height: none;
    min-height: 0;
  }
}

/* 批次 3-2：群聊页自己的筛选 chip（组件版在 FilterTabs.vue 里另有一条） */
@media (max-width: 640px) {
  .filter-tab {
    min-height: var(--touch-min);
  }
}
</style>
