<script setup lang="ts">
/**
 * StoryCard — 故事卡片外壳（R1-2 从 StoryEngineView 拆出）
 *
 * 只负责"这张卡长什么样 + 点哪里做什么"：页头（文件名/状态/深度/字数）、
 * 底部三个动作、展开态。详情段由父级通过默认插槽塞进来——卡片不该知道
 * 详情里有哪些段，否则它会把 `StoryDetailPanel` 的 props 再透传一遍。
 *
 * 为什么 `.story-card.is-expanded { grid-column: 1/-1 }` 留在这里：
 * 它选的是卡片自己，而卡片就是 `.story-grid` 的格子。
 */
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import { formatCharCount, getDepthMeta, getStatusClass, getStatusLabel } from './story-display';
import type { StoryAnalysisResult } from '@core/story-types';

const props = defineProps<{
  story: StoryAnalysisResult;
  /** 当前是否是展开的那一张 */
  expanded: boolean;
  /** 分析进行中：所有动作按钮禁用 */
  isAnalyzing: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  import: [];
  protagonist: [];
  delete: [];
}>();

function onToggle(): void {
  emit('toggle');
}
</script>

<template>
  <article
    class="story-card"
    :class="[getStatusClass(props.story.status), { 'is-expanded': props.expanded }]"
  >
    <div class="card-header" @click="onToggle">
      <Icon name="book-open" :size="20" class="card-icon" />
      <div class="card-info">
        <h3 class="card-title">{{ props.story.sourceFileName }}</h3>
        <span class="card-meta">
          <span class="status-badge" :class="getStatusClass(props.story.status)">
            {{ getStatusLabel(props.story.status) }}
          </span>
          · {{ getDepthMeta(props.story.depth)?.label ?? props.story.depth }}
          · {{ formatCharCount(props.story.textLength) }}
          · {{ t('story.chunkCount', { count: props.story.chunkCount }) }}
        </span>
      </div>
      <!--
        注意：这个按钮**故意**不加 `.stop`。它嵌在 `.card-header`（同一个 @click）里，
        原来的行为就是"点箭头触发两次 toggle ⇒ 等于没反应"，用户实际靠点整行展开。
        这是既有缺陷，不是本次拆分引入的；R 类只动组织不动行为，所以原样保留，
        修复留给行为类任务（届时把 `.stop` 加上即可，一行）。
      -->
      <button
        type="button"
        class="card-expand"
        :aria-label="props.expanded ? t('story.collapse') : t('story.expand')"
        :aria-expanded="props.expanded"
        @click="onToggle"
      >
        <Icon :name="props.expanded ? 'chevron-up' : 'chevron-down'" :size="16" />
      </button>
    </div>

    <!-- 展开详情（由父级塞入，卡片不知道里面有什么） -->
    <slot />

    <div class="card-actions">
      <button
        v-if="props.story.status === 'completed'"
        type="button"
        class="card-btn import-btn"
        :aria-label="t('story.importResultAria')"
        :disabled="props.isAnalyzing"
        @click="emit('import')"
      >
        <Icon name="download" :size="14" />
        <span>{{ t('story.importResult') }}</span>
      </button>
      <button
        v-if="props.story.status === 'completed'"
        type="button"
        class="card-btn protagonist-btn"
        :aria-label="props.story.protagonist ? t('story.editProtagonistBtn') : t('story.setProtagonistBtn')"
        :disabled="props.isAnalyzing"
        @click="emit('protagonist')"
      >
        <Icon name="user" :size="14" />
        <span>{{ props.story.protagonist ? t('story.editProtagonistBtn') : t('story.setProtagonistBtn') }}</span>
      </button>
      <button
        type="button"
        class="card-btn delete-btn"
        :aria-label="t('story.deleteAria')"
        :disabled="props.isAnalyzing"
        @click="emit('delete')"
      >
        <Icon name="trash-2" :size="14" />
        <span>{{ t('story.delete') }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
.story-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .story-card:hover {
    border-color: var(--primary);
  }
}

.story-card.status-failed {
  border-color: var(--error);
}

/* 展开的那张卡占满整行。
 * 1440 视口实测：`.story-grid` 是 `auto-fill minmax(360px,1fr)`，只有一份故事时
 * 它就是一条 400px 宽的窄列，七段详情竖着堆到 1276px 高，右边一千像素全空——
 * 读一条故事要滚三屏，而页面看起来是坏的。 */
.story-card.is-expanded {
  grid-column: 1 / -1;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.card-icon {
  color: var(--primary-fg);
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.status-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

/* 状态色口径：只作用于徽标与边框。
 * 这四条原本是不带元素限定的 `.status-xxx`，而卡片根元素也吃同一个类
 * （`:class="getStatusClass(...)"`），于是 `color` 一路继承下去——
 * 一份"已完成"的故事整张卡变成绿色，标题、人名、场景名全染上状态色。
 * 状态是这张卡的**元信息**，不是它的主题色，所以限定到徽标上。 */
.status-badge.status-pending {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-orange-text);
}

.status-badge.status-analyzing {
  background: rgba(59, 130, 246, 0.15);
  color: var(--tag-blue);
}

.status-badge.status-completed {
  background: rgba(34, 197, 94, 0.15);
  color: var(--tag-green);
}

.status-badge.status-failed {
  background: rgba(220, 38, 38, 0.15);
  color: var(--error-fg);
}

.card-expand {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
}

@media (hover: hover) and (pointer: fine) {
  .card-expand:hover {
    background: var(--card-elevated);
  }
}

/* 卡片操作按钮 */
.card-actions {
  display: flex;
  gap: 6px;
  padding: 0 14px 12px;
  justify-content: flex-end;
}

.card-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .card-btn:hover:not(:disabled) {
    background: var(--card-elevated);
    border-color: var(--primary);
  }
}

.card-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (hover: hover) and (pointer: fine) {
  .delete-btn:hover:not(:disabled) {
    background: var(--error-bg, rgba(220, 38, 38, 0.1));
    border-color: var(--error);
    color: var(--error-fg);
  }
}

.card-btn.import-btn {
  color: var(--secondary-text);
}

@media (hover: hover) and (pointer: fine) {
  .card-btn.import-btn:hover {
    background: color-mix(in srgb, var(--secondary) 12%, transparent);
  }
}

/* F16.3 主角按钮（卡片操作区） */
.card-btn.protagonist-btn {
  color: var(--primary-fg, #3b82f6);
}

@media (hover: hover) and (pointer: fine) {
  .card-btn.protagonist-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
  }
}
</style>
