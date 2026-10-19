<script setup lang="ts">
/**
 * StoryDetailCharacters — 故事详情里的人物与主角两段（R1-2 从 StoryEngineView 拆出）
 *
 * 两段是并列的 `<section>`，所以用多根组件（fragment）直接成为 `.card-detail`
 * 的网格项，保持拆分前"一段一格"的排布。
 *
 * 写操作（设为主角 / 编辑 / 清除）都不在这里发生：本组件只发意图，
 * 表单与落库在 `StoryProtagonistModal`。
 */
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import { getProtagonistRoleLabel, getProtagonistSourceLabel } from './story-display';
import type { StoryAnalysisResult } from '@core/story-types';

defineProps<{
  story: StoryAnalysisResult;
  /** 分析进行中：设为主角按钮禁用（与拆分前一致） */
  isAnalyzing: boolean;
}>();

const emit = defineEmits<{
  /** 从某个人物的"设为主角"按钮进入（带预填名） */
  'set-protagonist': [characterName: string];
  /** 编辑已有主角配置 */
  'edit-protagonist': [];
  /** 清除主角配置 */
  'clear-protagonist': [];
}>();
</script>

<template>
  <!-- 人物 -->
  <section v-if="story.characters.length > 0" class="detail-section">
    <h4 class="detail-title">
      <Icon name="user" :size="14" />
      {{ t('story.charsTitle', { count: story.characters.length }) }}
    </h4>
    <div class="char-list">
      <div v-for="(char, idx) in story.characters" :key="idx" class="char-item">
        <div class="char-row">
          <div class="char-main">
            <div class="char-name">
              {{ char.name }}
              <span v-if="char.aliases && char.aliases.length > 0" class="char-aliases">
                {{ t('story.charAliases', { aliases: char.aliases.join('、') }) }}
              </span>
            </div>
            <p v-if="char.description" class="char-desc">{{ char.description }}</p>
            <div v-if="char.relationships && char.relationships.length > 0" class="char-relations">
              <span class="relation-label">{{ t('story.relationsLabel') }}</span>
              <span v-for="(rel, rIdx) in char.relationships" :key="rIdx" class="relation">
                {{ rel.target }}（{{ rel.relation }}）
              </span>
            </div>
          </div>
          <button
            v-if="story.status === 'completed'"
            type="button"
            class="char-set-protagonist-btn"
            :aria-label="t('story.setProtagonistAria', { name: char.name })"
            :disabled="isAnalyzing"
            @click="emit('set-protagonist', char.name)"
          >
            <Icon name="user" :size="12" />
            <span>{{ t('story.setProtagonist') }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- 主角配置信息 -->
  <section v-if="story.protagonist" class="detail-section protagonist-section">
    <h4 class="detail-title">
      <Icon name="user" :size="14" />
      {{ t('story.protagonistTitle') }}
    </h4>
    <div class="protagonist-card">
      <div class="protagonist-header">
        <span class="protagonist-name">{{ story.protagonist.name }}</span>
        <span class="protagonist-badge" :class="`role-${story.protagonist.role}`">
          {{ getProtagonistRoleLabel(story.protagonist.role) }}
        </span>
        <span class="protagonist-badge source-badge">
          {{ getProtagonistSourceLabel(story.protagonist.source) }}
        </span>
      </div>
      <p v-if="story.protagonist.description" class="protagonist-desc">
        {{ story.protagonist.description }}
      </p>
      <div v-if="story.protagonist.startingScene" class="protagonist-meta">
        <span class="meta-label">{{ t('story.startingScene') }}</span>
        <span class="meta-value">{{ story.protagonist.startingScene }}</span>
      </div>
      <div v-if="story.protagonist.relations.length > 0" class="protagonist-relations">
        <span class="meta-label">{{ t('story.relations') }}</span>
        <ul class="relation-list">
          <li
            v-for="(rel, idx) in story.protagonist.relations"
            :key="idx"
            class="relation-item"
          >
            <span class="relation-target">{{ rel.target }}</span>
            <span class="relation-text">{{ rel.relation }}</span>
          </li>
        </ul>
      </div>
      <div class="protagonist-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          @click="emit('edit-protagonist')"
        >
          <Icon name="pencil" :size="12" />
          {{ t('story.editProtagonist') }}
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm"
          @click="emit('clear-protagonist')"
        >
          <Icon name="trash-2" :size="12" />
          {{ t('story.clear') }}
        </button>
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

.char-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 拆分前 `.char-item` 被两条规则先后命中（先随 char/scene/script 合写、后单写覆盖
   padding），这里按先后顺序原样保留两条，计算值与拆分前一致。 */
.char-item {
  padding: 8px 10px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.char-name {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.char-desc {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
  line-height: 1.5;
  word-break: break-word;
}

.char-aliases {
  font-size: 11px;
  color: var(--on-surface-variant);
  font-weight: normal;
}

.char-relations {
  margin-top: 4px;
  font-size: 11px;
  color: var(--on-surface-variant);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.relation-label {
  color: var(--on-surface-variant);
}

.relation {
  padding: 1px 6px;
  background: var(--card-elevated);
  border-radius: 8px;
}

/* 人物卡片 - 设为主角按钮 */
.char-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.char-item:last-child {
  border-bottom: none;
}

.char-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.char-main {
  flex: 1;
  min-width: 0;
}

.char-set-protagonist-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--on-surface);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .char-set-protagonist-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    border-color: var(--primary);
    color: var(--primary-fg, #3b82f6);
  }
}

.char-set-protagonist-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 主角配置信息卡片 */
.protagonist-section {
  border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--primary) 5%, var(--card));
}

.protagonist-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.protagonist-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.protagonist-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface);
}

.protagonist-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.protagonist-badge.role-protagonist {
  background: color-mix(in srgb, var(--primary) 15%, transparent);
  color: var(--primary-fg, #3b82f6);
}

.protagonist-badge.role-observer {
  background: color-mix(in srgb, var(--accent-orange) 15%, transparent);
  color: var(--accent-orange);
}

.protagonist-badge.source-badge {
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  color: var(--accent-blue-text);
}

.protagonist-desc {
  font-size: 13px;
  color: var(--on-surface-variant);
  margin: 0;
  white-space: pre-wrap;
}

.protagonist-meta {
  display: flex;
  gap: 4px;
  font-size: 12px;
  color: var(--on-surface-variant);
}

.protagonist-relations {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.relation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.relation-item {
  display: flex;
  gap: 4px;
}

.relation-target {
  font-weight: 600;
  color: var(--on-surface);
}

.relation-text {
  color: var(--on-surface-variant);
}

.protagonist-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 4px;
}

/* 辅助样式：按钮（与上传/导入/主角三个弹窗各自持有一份，全仓惯例见
   RandomEventsView / LocalModelView 等 8 个视图，均自带 `.btn`） */

@media (hover: hover) and (pointer: fine) {
  .btn:hover:not(:disabled) {
    background: var(--card-elevated);
  }
}

@media (hover: hover) and (pointer: fine) {
  .btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error) 75%, #000);
  }
}

@media (max-width: 640px) {
  .char-row {
    flex-direction: column;
    align-items: stretch;
  }

  .char-set-protagonist-btn {
    align-self: flex-start;
  }
}
</style>
