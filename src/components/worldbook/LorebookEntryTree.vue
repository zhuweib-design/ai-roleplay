<script setup lang="ts">
/**
 * LorebookEntryTree — 条目树（F06.6 树状导航 + 拖拽改层级）
 *
 * R1-3 从 WorldBookView（原 3115 行）拆出，是这次拆分里最大的一块。
 * 树逻辑（可见节点 / 展开折叠 / 拖拽）全在 `useLorebookTree`，本组件只负责画与转发。
 *
 * `.entries-list-panel` 外壳留在宿主：手机第三态互斥用的是
 * `.editor-content[data-entry='1'] .entries-list-panel{display:none}`，外壳搬走就够不到。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import type { LorebookEntry, LorebookStrategy } from '@/core/lorebook';

const props = defineProps<{
  entriesCount: number;
  visibleEntries: LorebookEntry[];
  currentEntryId: string | null;
  draggingEntryId: string | null;
  dragOverEntryId: string | null;
  dragDropMode: 'before' | 'after' | 'inside';
  hasChildren: (entryId: string) => boolean;
  isExpanded: (entryId: string) => boolean;
  getEntryLevel: (entryId: string) => number;
  levelColor: (level: number) => string;
  levelLabel: (level: number) => string;
  getIndent: (entryId: string) => number;
  keysPreview: (keys: string[]) => string;
  strategyLabel: (s: LorebookStrategy) => string;
}>();

const emit = defineEmits<{
  select: [id: string];
  add: [];
  expandAll: [];
  collapseAll: [];
  toggleExpand: [id: string];
  toggleEntry: [id: string];
  dragStart: [id: string, e: DragEvent];
  dragOver: [id: string, e: DragEvent];
  dragLeave: [];
  drop: [id: string, e: DragEvent];
  dragEnd: [];
}>();
</script>

<template>
  <div class="entries-header">
    <h2>{{ t('wb.entriesTitle', { count: props.entriesCount }) }}</h2>
    <div class="entries-header-actions">
      <button
        type="button"
        class="tree-action-btn"
        :aria-label="t('wb.expandAll')"
        v-tip="t('wb.expandAll')"
        @click="emit('expandAll')"
      >
        <Icon name="chevron-down" :size="14" />
      </button>
      <button
        type="button"
        class="tree-action-btn"
        :aria-label="t('wb.collapseAll')"
        v-tip="t('wb.collapseAll')"
        @click="emit('collapseAll')"
      >
        <Icon name="chevron-up" :size="14" />
      </button>
      <button
        type="button"
        class="add-entry-btn"
        :aria-label="t('wb.addEntry')"
        @click="emit('add')"
      >
        <Icon name="plus" :size="14" />
        <span>{{ t('wb.add') }}</span>
      </button>
    </div>
  </div>

  <div
    class="entries-list tk-scroll"
    :role="props.entriesCount > 0 ? 'tree' : undefined"
    :aria-label="t('wb.entriesTreeAria')"
  >
    <div
      v-for="entry in props.visibleEntries"
      :key="entry.id"
      role="treeitem"
      :data-entry-id="entry.id"
      :aria-expanded="props.hasChildren(entry.id) ? props.isExpanded(entry.id) : undefined"
      :aria-level="props.getEntryLevel(entry.id) + 1"
      class="entry-tree-item"
    >
      <div
        class="entry-item"
        :class="{
          active: entry.id === props.currentEntryId,
          'drag-over': entry.id === props.dragOverEntryId,
          'drag-over-before': entry.id === props.dragOverEntryId && props.dragDropMode === 'before',
          'drag-over-after': entry.id === props.dragOverEntryId && props.dragDropMode === 'after',
          'drag-over-inside': entry.id === props.dragOverEntryId && props.dragDropMode === 'inside',
          'dragging': entry.id === props.draggingEntryId,
          'disabled': !entry.enabled,
        }"
        :style="{ paddingLeft: `${8 + props.getIndent(entry.id)}px` }"
        tabindex="0"
        draggable="true"
        :aria-label="t('wb.entryAria', { title: entry.title || t('wb.unnamedEntry'), strategy: props.strategyLabel(entry.strategy), level: props.levelLabel(props.getEntryLevel(entry.id)) })"
        :aria-current="entry.id === props.currentEntryId ? 'true' : undefined"
        @click="emit('select', entry.id)"
        @keydown.enter="emit('select', entry.id)"
        @keydown.space.prevent="emit('select', entry.id)"
        @dragstart="emit('dragStart', entry.id, $event)"
        @dragover="emit('dragOver', entry.id, $event)"
        @dragleave="emit('dragLeave')"
        @drop="emit('drop', entry.id, $event)"
        @dragend="emit('dragEnd')"
      >
        <!-- 展开/折叠按钮 -->
        <button
          v-if="props.hasChildren(entry.id)"
          type="button"
          class="expand-toggle"
          :aria-label="props.isExpanded(entry.id) ? t('wb.collapseChildren') : t('wb.expandChildren')"
          :aria-expanded="props.isExpanded(entry.id)"
          @click.stop="emit('toggleExpand', entry.id)"
        >
          <Icon
            :name="props.isExpanded(entry.id) ? 'chevron-down' : 'chevron-right'"
            :size="12"
          />
        </button>
        <span v-else class="expand-spacer" aria-hidden="true"></span>

        <!-- 层级标签 -->
        <span
          class="level-badge"
          :style="{ color: props.levelColor(props.getEntryLevel(entry.id)) }"
          :aria-label="t('wb.levelTitle', { level: props.levelLabel(props.getEntryLevel(entry.id)) })"
        >
          {{ props.levelLabel(props.getEntryLevel(entry.id)).charAt(0) }}
        </span>

        <button
          type="button"
          class="entry-toggle"
          :class="{ active: entry.enabled }"
          :aria-label="entry.enabled ? t('wb.disableEntry') : t('wb.enableEntry')"
          :aria-pressed="entry.enabled"
          @click.stop="emit('toggleEntry', entry.id)"
        >
          <Icon :name="entry.enabled ? 'eye' : 'eye-off'" :size="12" />
        </button>
        <div class="entry-content">
          <div class="entry-title">{{ entry.title || t('wb.unnamedEntry') }}</div>
          <div class="entry-keys">{{ props.keysPreview(entry.keys) }}</div>
        </div>
        <span class="entry-strategy">{{ props.strategyLabel(entry.strategy) }}</span>
      </div>
    </div>
    <div v-if="props.entriesCount === 0" class="empty-entries">
      <p>{{ t('wb.emptyEntries') }}</p>
      <button type="button" class="link-btn" @click="emit('add')">
        {{ t('wb.addFirstEntry') }}
      </button>
    </div>
  </div>

  <div class="entries-footer">
    <p class="drag-hint">{{ t('wb.dragHint') }}</p>
  </div>
</template>

<style scoped>
.entries-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.entries-header h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.entries-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tree-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--muted-foreground);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .tree-action-btn:hover {
    background: var(--card-elevated);
    color: var(--foreground);
  }
}

.add-entry-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--primary);
  color: var(--on-primary);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .add-entry-btn:hover {
    opacity: 0.9;
  }
}

.entries-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.entry-tree-item {
  display: block;
}

.empty-entries {
  padding: 24px 12px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 12px;
}

.empty-entries p {
  margin: 0 0 8px 0;
}

.link-btn {
  background: none;
  border: none;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

@media (hover: hover) and (pointer: fine) {
  .link-btn:hover {
    color: var(--primary-fg);
  }
}

.entry-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin: 0 6px;
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .entry-item:hover {
    background: var(--card-elevated);
  }
}

.entry-item.active {
  background: var(--card-elevated);
  border-color: var(--primary);
}

.entry-item.drag-over {
  border-color: var(--secondary);
  border-style: dashed;
}

/* F06.6 拖拽放置模式高亮 */
.entry-item.drag-over-before {
  border-top: 2px solid var(--secondary);
  border-color: var(--secondary) transparent transparent transparent;
}

.entry-item.drag-over-after {
  border-bottom: 2px solid var(--secondary);
  border-color: transparent transparent var(--secondary) transparent;
}

.entry-item.drag-over-inside {
  background: color-mix(in srgb, var(--secondary) 15%, transparent);
  border-color: var(--secondary);
  border-style: solid;
}

.entry-item.dragging {
  opacity: 0.5;
}

/* F06.6 展开/折叠按钮 */
.expand-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  padding: 0;
}

@media (hover: hover) and (pointer: fine) {
  .expand-toggle:hover {
    background: var(--background);
    color: var(--foreground);
  }
}

.expand-toggle:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.expand-spacer {
  display: inline-block;
  width: 18px;
  flex-shrink: 0;
}

/* F06.6 层级标签 */
.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid currentColor;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.entry-item.disabled {
  opacity: 0.55;
}

.entry-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.entry-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.entry-toggle.active {
  color: var(--secondary-text);
}

@media (hover: hover) and (pointer: fine) {
  .entry-toggle:hover {
    background: var(--background);
  }
}

.entry-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry-title {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-keys {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-strategy {
  font-size: 10px;
  color: var(--muted-foreground);
  padding: 2px 6px;
  background: var(--background);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.entries-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.drag-hint {
  margin: 0;
  font-size: 10px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

/* ≤640：二级只留一个滚动容器（`.editor-content`），条目树内容自然撑高。
   这条原在父级 style 块里，随 `.entries-list` 一起搬到本文件 —— 父组件
   scoped 规则到不了子组件内部元素，不搬就丢。 */
@media (max-width: 640px) {
  .entries-list {
    overflow: visible;
    flex: 0 0 auto;
  }
}
</style>
