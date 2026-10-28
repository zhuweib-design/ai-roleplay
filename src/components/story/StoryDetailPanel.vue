<script setup lang="ts">
/**
 * StoryDetailPanel — 故事卡片展开后的详情外壳（R1-2 从 StoryEngineView 拆出）
 *
 * 编排顺序就是拆分前 `.card-detail` 的子节点顺序：
 *   错误 → 世界信息 → 人物 → 主角 → 故事时间 → 场景 → 事件 → 脚本 → 元信息
 * 人物/主角与场景/事件/脚本各自是多根组件，所以它们仍然是**独立**的网格项，
 * 桌面 ≥1025px 的两列排布与拆分前逐格对应。
 *
 * 世界信息这一段留在本文件而不是 `StoryDetailWorld`：它在 DOM 里排在人物之前，
 * 而场景/事件/脚本排在故事时间之后——同一个组件没法同时出现在两个位置。
 */
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import StoryTimeConfigPanel from '@/components/story/StoryTimeConfigPanel.vue';
import StoryDetailCharacters from '@/components/story/StoryDetailCharacters.vue';
import StoryDetailWorld from '@/components/story/StoryDetailWorld.vue';
import { formatDateTime } from './story-display';
import type { StoryAnalysisResult } from '@core/story-types';

defineProps<{
  story: StoryAnalysisResult;
  isAnalyzing: boolean;
}>();

const emit = defineEmits<{
  'set-protagonist': [characterName: string];
  'edit-protagonist': [];
  'clear-protagonist': [];
}>();
</script>

<template>
  <div class="card-detail">
    <!-- 错误信息 -->
    <div v-if="story.errors && story.errors.length > 0" class="detail-errors">
      <h4 class="detail-title">
        <Icon name="alert-triangle" :size="14" />
        {{ t('story.errorsTitle', { count: story.errors.length }) }}
      </h4>
      <ul class="error-list">
        <li v-for="(err, idx) in story.errors" :key="idx" class="error-item">
          {{ err }}
        </li>
      </ul>
    </div>

    <!-- 世界信息 -->
    <section v-if="story.worldInfo" class="detail-section">
      <h4 class="detail-title">
        <Icon name="globe" :size="14" />
        {{ t('story.worldTitle', { name: story.worldInfo.name }) }}
      </h4>
      <p class="detail-desc">{{ story.worldInfo.description }}</p>
      <div v-if="story.worldInfo.type" class="detail-tags">
        <span class="tag">{{ t('story.worldType', { type: story.worldInfo.type }) }}</span>
      </div>
      <div v-if="story.worldInfo.coreSettings && story.worldInfo.coreSettings.length > 0" class="detail-tags">
        <span v-for="s in story.worldInfo.coreSettings" :key="s" class="tag">{{ s }}</span>
      </div>
      <div v-if="story.worldInfo.factions && story.worldInfo.factions.length > 0" class="detail-tags">
        <span class="tag-label">{{ t('story.worldFactions') }}</span>
        <span v-for="f in story.worldInfo.factions" :key="f" class="tag">{{ f }}</span>
      </div>
    </section>

    <StoryDetailCharacters
      :story="story"
      :is-analyzing="isAnalyzing"
      @set-protagonist="emit('set-protagonist', $event)"
      @edit-protagonist="emit('edit-protagonist')"
      @clear-protagonist="emit('clear-protagonist')"
    />

    <StoryTimeConfigPanel :story="story" />

    <StoryDetailWorld :story="story" />

    <!-- 元信息 -->
    <div class="detail-meta">
      <span>{{ t('story.createdAt', { time: formatDateTime(story.createdAt) }) }}</span>
      <span v-if="story.completedAt">{{ t('story.completedAt', { time: formatDateTime(story.completedAt) }) }}</span>
    </div>
  </div>
</template>

<style scoped>
/* 详情展开 */
.card-detail {
  padding: 0 14px 12px;
  border-top: 1px solid var(--border);
  margin-top: 0;
}

/*
 * 补位：原选择器是 `.story-card.is-expanded .card-detail`（父级 scoped 到子组件内部，
 * 拆分后到不了）。详情只在展开时渲染，`is-expanded` 与"渲染"是同一个条件，
 * 所以去掉那一段限定后命中集合完全一致。
 */
@media (min-width: 1025px) {
  .card-detail {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 28px;
    align-items: start;
  }
}

.detail-errors {
  margin-top: 12px;
  padding: 10px;
  background: var(--error-bg, rgba(220, 38, 38, 0.08));
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--error);
}

.error-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--foreground);
}

.error-item {
  margin: 2px 0;
  word-break: break-word;
}

.detail-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.detail-section:first-child {
  border-top: none;
  padding-top: 12px;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--foreground);
}

.detail-desc {
  font-size: 13px;
  color: var(--muted-foreground);
  line-height: 1.5;
  margin: 4px 0;
  word-break: break-word;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
  align-items: center;
}

.tag-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.tag {
  padding: 2px 8px;
  background: var(--card-elevated);
  border-radius: 10px;
  font-size: 11px;
  color: var(--foreground);
}

.detail-meta {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted-foreground);
}
</style>
