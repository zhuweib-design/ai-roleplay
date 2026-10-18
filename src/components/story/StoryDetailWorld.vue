<script setup lang="ts">
/**
 * StoryDetailWorld — 故事详情里的"世界内容"三段（R1-2 从 StoryEngineView 拆出）
 *
 * 场景 / 事件 / 脚本。三段在 DOM 里是并列的 `<section>`，所以这里用多根组件
 * （fragment）：它们会**直接**成为 `.card-detail` 的网格项，与拆分前一一对应。
 * 如果套一层 wrapper，桌面 ≥1025px 的两列排布就会从"6 段各自一格"变成
 * "几个分组各占一格"，视觉上会重排——多根是这里唯一不改变布局的写法。
 *
 * 世界信息（`story.worldInfo`）不在这里：它在 DOM 里排在这三段之前，
 * 中间还夹着人物、主角、故事时间，所以留在 `StoryDetailPanel` 里按原顺序编排。
 */
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { StoryAnalysisResult } from '@core/story-types';

defineProps<{
  story: StoryAnalysisResult;
}>();
</script>

<template>
  <!-- 场景 -->
  <section v-if="story.scenes.length > 0" class="detail-section">
    <h4 class="detail-title">
      <Icon name="map-pin" :size="14" />
      {{ t('story.scenesTitle', { count: story.scenes.length }) }}
    </h4>
    <div class="scene-list">
      <div v-for="(scene, idx) in story.scenes" :key="idx" class="scene-item">
        <div class="scene-name">
          {{ scene.name }}
          <span class="scene-type">{{ scene.type }}</span>
          <span v-if="scene.parent" class="scene-parent">← {{ scene.parent }}</span>
        </div>
        <p v-if="scene.description" class="scene-desc">{{ scene.description }}</p>
      </div>
    </div>
  </section>

  <!-- 事件 -->
  <section v-if="story.events.length > 0" class="detail-section">
    <h4 class="detail-title">
      <Icon name="calendar-check" :size="14" />
      {{ t('story.eventsTitle', { count: story.events.length }) }}
    </h4>
    <ol class="event-list">
      <li v-for="(event, idx) in story.events" :key="idx" class="event-item">
        <div class="event-header">
          <span class="event-order">#{{ event.order }}</span>
          <span class="event-name">{{ event.name }}</span>
          <span class="event-type">{{ event.type }}</span>
        </div>
        <p v-if="event.description" class="event-desc">{{ event.description }}</p>
        <div v-if="event.characters.length > 0" class="event-meta">
          {{ t('story.eventParticipants', { names: event.characters.join('、') }) }}
        </div>
        <div v-if="event.scene" class="event-meta">
          {{ t('story.eventScene', { name: event.scene }) }}
        </div>
      </li>
    </ol>
  </section>

  <!-- 脚本（深度模式） -->
  <section v-if="story.scripts.length > 0" class="detail-section">
    <h4 class="detail-title">
      <Icon name="git-branch" :size="14" />
      {{ t('story.scriptsTitle', { count: story.scripts.length }) }}
    </h4>
    <div class="script-list">
      <div v-for="(script, idx) in story.scripts" :key="idx" class="script-item">
        <div class="script-header">
          <span class="script-name">{{ script.name }}</span>
          <span class="script-type" :class="`type-${script.type}`">{{ script.type }}</span>
        </div>
        <p v-if="script.content" class="script-content">{{ script.content }}</p>
        <div v-if="script.characters.length > 0" class="script-meta">
          {{ t('story.scriptChars', { names: script.characters.join('、') }) }}
        </div>
        <div v-if="script.scenes.length > 0" class="script-meta">
          {{ t('story.scriptScenes', { names: script.scenes.join('、') }) }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
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
  color: var(--on-surface);
}

/* 场景 / 脚本列表：拆分前与 `.char-*` 共用一条规则，这里按各自前缀重写，
   声明值一字未改（同一个元素只会命中自己那一组，合并与否不影响计算值）。 */
.scene-list,
.script-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-item,
.script-item {
  padding: 8px 10px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.scene-name,
.script-header {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.scene-desc,
.script-content {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
  line-height: 1.5;
  word-break: break-word;
}

.scene-type,
.scene-parent {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--card-elevated);
  border-radius: 8px;
  color: var(--on-surface-variant);
  font-weight: normal;
}

.scene-parent {
  color: var(--primary-fg);
}

.event-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-item {
  padding: 8px 10px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  flex-wrap: wrap;
}

.event-order {
  color: var(--primary-fg);
  font-weight: 600;
}

.event-type {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--card-elevated);
  border-radius: 8px;
  color: var(--on-surface-variant);
  font-weight: normal;
}

.event-desc {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
  line-height: 1.5;
}

.event-meta {
  font-size: 11px;
  color: var(--on-surface-variant);
  margin-top: 2px;
}

.script-header {
  justify-content: space-between;
}

.script-type {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: normal;
}

.script-type.type-main {
  background: rgba(59, 130, 246, 0.15);
  color: var(--tag-blue);
}

.script-type.type-side {
  background: rgba(168, 85, 247, 0.15);
  color: var(--tag-purple);
}

.script-type.type-background {
  background: rgba(107, 114, 128, 0.15);
  color: var(--tag-gray);
}

.script-meta {
  font-size: 11px;
  color: var(--on-surface-variant);
  margin-top: 4px;
}
</style>
