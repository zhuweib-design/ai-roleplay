<script setup lang="ts">
/**
 * MoreView —"更多"聚合页
 *
 * 来源：D-11（≤640px 下 NavRail 卸载，二级入口在移动端没有任何 UI 入口）。
 * N 层改造（UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.2.6）：
 * - 入口清单来自 nav-model，与桌面 rail、移动底栏同源
 * - 按内容组分节，并真正渲染 descKey（原实现声明了 descKey 却没有渲染）
 * - 桌面端也可达（rail 底部系统项），因此补页头与返回
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { NAV_ENTRIES, NAV_GROUPS, moreEntries, type NavEntry } from '@/core/nav-model';
import { useGuidedTasks, guideProgress } from '@/composables/useGuidedTasks';
import {
  editableRailEntries,
  hiddenRailCount,
  isEntryVisible,
  showAllRailEntries,
  toggleRailEntry,
} from '@/core/rail-prefs';

const router = useRouter();
const groups = NAV_GROUPS.map((group) => ({
  ...group,
  entries: moreEntries().filter((e) => e.group === group.id),
})).filter((group) => group.entries.length > 0);

const sections = computed(() => groups);


const tasks = useGuidedTasks();
const progress = computed(() => guideProgress(tasks.value));

// M2-b8：侧栏入口显隐编辑器。本页始终列出全部入口（它是"找回被藏起来的入口"的地方），
// 勾选只改变桌面 rail；「更多」与「设置」不在可编辑清单里，避免把自己锁在门外。
const editingRail = ref(false);
const railChoices = editableRailEntries();
const hiddenCount = computed(() => hiddenRailCount());
// 只列"既被收起、本页分组里又没有"的入口（inMore 的那 8 个本来就在下面出现，不重复列）
const collapsedEntries = computed(() =>
  NAV_ENTRIES.filter((e) => !isEntryVisible(e.id) && !e.inMore)
);

function goBack(): void {
  if (window.history.state?.back) void router.back();
  else void router.push({ name: 'chat' });
}

function cardAria(entry: NavEntry): string {
  return t(entry.labelKey);
}
</script>

<template>
  <div class="more-view">
    <header class="more-header">
      <button type="button" class="more-back-btn" :aria-label="t('common.back')" @click="goBack">
        <Icon name="arrow-left" :size="18" aria-hidden="true" />
        <span>{{ t('common.back') }}</span>
      </button>
      <h1>{{ t('more.title') }}</h1>
      <p class="more-desc">{{ t('more.desc') }}</p>
    </header>

    <!-- 任务中心入口（G 层）：/more 顶部，带实时进度而不是"看过就算完成" -->
    <router-link :to="{ name: 'guide' }" class="more-guide" data-rel-jump="more-guide">
      <Icon name="info" :size="18" aria-hidden="true" />
      <span class="more-guide-body">
        <span class="more-guide-title">{{ t('guide.title') }}</span>
        <span class="more-guide-desc">{{ t('guide.moreDesc') }}</span>
      </span>
      <span class="more-guide-progress">
        {{ t('guide.tasksProgress', { current: progress.done, total: progress.total }) }}
      </span>
    </router-link>

    <!-- M2-b8：侧栏入口显隐编辑（只影响桌面左侧栏；本页始终保留全部入口作为找回路径） -->
    <section class="more-rail-prefs" :aria-label="t('more.railPrefsAria')">
      <button
        type="button"
        class="more-prefs-toggle"
        :aria-expanded="editingRail"
        data-rel-jump="more-rail-edit"
        @click="editingRail = !editingRail"
      >
        <Icon name="pencil" :size="14" aria-hidden="true" />
        <span class="more-prefs-title">{{ t('more.railPrefs') }}</span>
        <span class="more-prefs-state">
          {{ hiddenCount > 0 ? t('more.railHiddenCount', { count: hiddenCount }) : t('more.railAllShown') }}
        </span>
        <span class="more-prefs-edit">{{ t('more.railEdit') }}</span>
        <Icon :name="editingRail ? 'chevron-up' : 'chevron-down'" :size="14" aria-hidden="true" />
      </button>

      <template v-if="editingRail">
        <p class="more-prefs-hint">{{ t('more.railPrefsHint') }}</p>
        <ul class="more-prefs-list" role="list">
          <li v-for="entry in railChoices" :key="entry.id" class="more-pref-row">
            <label :for="`rail-show-${entry.id}`">
              <input
                :id="`rail-show-${entry.id}`"
                type="checkbox"
                :checked="isEntryVisible(entry.id)"
                :data-rel-jump="`rail-show-${entry.id}`"
                @change="toggleRailEntry(entry.id)"
              />
              <span class="more-pref-label">{{ t(entry.labelKey) }}</span>
              <span class="more-pref-desc">{{ t(entry.descKey) }}</span>
            </label>
          </li>
        </ul>
        <button
          v-if="hiddenCount > 0"
          type="button"
          class="more-prefs-reset"
          data-rel-jump="more-rail-reset"
          @click="showAllRailEntries"
        >
          {{ t('more.railShowAll') }}
        </button>
      </template>
    </section>

    <section
      v-for="group in sections"
      :key="group.id"
      class="more-section"
      role="group"
      :aria-labelledby="`more-group-${group.id}`"
    >
      <h2 :id="`more-group-${group.id}`" class="more-section-title">{{ t(group.labelKey) }}</h2>
      <nav class="more-grid" :aria-label="t('more.gridAria')">
        <router-link
          v-for="entry in group.entries"
          :key="entry.id"
          :to="{ name: entry.routeName }"
          class="more-card"
          :aria-label="cardAria(entry)"
          :data-rel-jump="`more-${entry.id}`"
        >
          <Icon :name="entry.icon" :size="22" aria-hidden="true" />
          <span class="more-card-label">{{ t(entry.labelKey) }}</span>
          <span class="more-card-desc">{{ t(entry.descKey) }}</span>
        </router-link>
      </nav>
    </section>

    <!-- 从侧栏收起、且上面各组没列出的入口——保证"藏起来"不等于"找不回来" -->
    <section v-if="collapsedEntries.length" class="more-section" :aria-label="t('more.railHiddenSection')">
      <h2 class="more-section-title">{{ t('more.railHiddenSection') }}</h2>
      <nav class="more-grid" :aria-label="t('more.gridAria')">
        <router-link
          v-for="entry in collapsedEntries"
          :key="entry.id"
          :to="{ name: entry.routeName }"
          class="more-card"
          :aria-label="cardAria(entry)"
          :data-rel-jump="`collapsed-${entry.id}`"
        >
          <Icon :name="entry.icon" :size="22" aria-hidden="true" />
          <span class="more-card-label">{{ t(entry.labelKey) }}</span>
          <span class="more-card-desc">{{ t(entry.descKey) }}</span>
        </router-link>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.more-view {
  padding: var(--spacing-md, 16px);
  /* 原为 calc(72px + env(safe-area-inset-bottom, 0))：
     其中 72px 是给底部导航的死预留，但 `.app-main.has-mobile-nav` 的全局留白
     已在 app-global.css:160-162 归零、其余 Tab 页都不留 ⇒ 这 72px 是纯空带（MOBILE_PLAN 批次 0-5）。
     env() 要保留：index.html:11 已开 viewport-fit=cover，安全区现在真的取到值了。 */
  padding-bottom: calc(var(--spacing-md, 16px) + env(safe-area-inset-bottom, 0px));
}
.more-header {
  margin-bottom: var(--spacing-md, 16px);
}
.more-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}
.more-header h1 {
  margin: 8px 0 0;
  font-size: 20px;
  color: var(--foreground);
}
.more-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted-foreground);
}
.more-section {
  margin-bottom: var(--spacing-lg, 24px);
}
.more-section-title {
  margin: 0 0 var(--spacing-sm, 8px);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
}
.more-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm, 8px);
}
.more-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xs, 4px);
  padding: var(--spacing-md, 16px) var(--spacing-sm, 8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
  color: var(--foreground);
  text-decoration: none;
  min-height: 76px;
}
.more-card-label {
  font-size: 14px;
  font-weight: 600;
}
.more-card-desc {
  font-size: 13px;
  line-height: 1.3;
  color: var(--muted-foreground);
}
.more-guide {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 var(--spacing-md, 16px);
  padding: 12px;
  border: 1px solid var(--secondary);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
  color: var(--foreground);
  text-decoration: none;
}

.more-guide-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.more-guide-title {
  font-size: 14px;
  font-weight: 600;
}

.more-guide-desc,
.more-guide-progress {
  font-size: 13px;
  color: var(--muted-foreground);
}

.more-guide:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 2px;
}

/* M2-b8：侧栏入口显隐编辑器 */
.more-rail-prefs {
  margin: 0 0 var(--spacing-md, 16px);
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
}

.more-prefs-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--foreground);
  font-size: 14px;
  cursor: pointer;
}

.more-prefs-title {
  font-weight: 600;
}

.more-prefs-state {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.more-prefs-edit {
  flex: 0 0 auto;
  padding: 2px 10px;
  border: 1px solid var(--secondary);
  border-radius: 999px;
  color: var(--secondary-text);
  font-size: 13px;
}

.more-prefs-toggle:focus-visible,
.more-prefs-reset:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 2px;
}

.more-prefs-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.more-prefs-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.more-pref-row label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  font-size: 13px;
  cursor: pointer;
}

.more-pref-label {
  flex: 0 0 auto;
  font-weight: 600;
}

.more-pref-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--muted-foreground);
}

.more-prefs-reset {
  margin-top: 8px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: none;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
}

@media (max-width: 640px) {
  .more-prefs-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (hover: hover) {
  .more-prefs-edit:hover {
    background: var(--secondary);
    color: var(--on-secondary);
  }

  .more-prefs-reset:hover {
    border-color: var(--secondary);
  }
}

/* 批次 3-2：返回与「编辑侧栏」都是独立可点元素 */
@media (max-width: 640px) {
  .more-back-btn,
  .more-prefs-toggle {
    min-height: var(--touch-min);
  }
}
</style>
