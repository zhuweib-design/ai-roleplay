<script setup lang="ts">
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { RandomEventResult, RandomEventFeedback } from '@core/random-event-generator';
import { t } from '@/i18n';
import {
  flushStoreMessages,
  formatTime,
  getCategoryLabel,
  getSeverityLabel,
} from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
const notify = (type: 'info' | 'success' | 'error', message: string): void =>
  emit('notify', type, message);

// ── 结果反馈 ──
function applyFeedback(result: RandomEventResult, feedback: RandomEventFeedback): void {
  const ok = store.applyFeedback(result.id, feedback);
  if (ok) {
    const label =
      feedback === 'positive' ? t('re.feedbackLike') : feedback === 'negative' ? t('re.feedbackDislike') : t('re.feedbackNeutral');
    notify('success', t('re.feedbackRecorded', { feedback: label }));
  }
  flushStoreMessages(store, notify);
}

function clearResults(): void {
  if (confirm(t('re.clearHistoryConfirm'))) {
    store.clearResults();
    notify('success', t('re.historyCleared'));
  }
}
</script>

<template>
  <div>
    <!-- ── 结果与统计 ── -->
    <section
      id="panel-results"
      role="tabpanel"
      aria-labelledby="tab-results"
      class="panel"
    >
      <!-- 统计卡片 -->
      <div class="stats-grid" v-if="store.stats.totalGenerated > 0">
        <div class="stat-card">
          <div class="stat-value">{{ store.stats.totalGenerated }}</div>
          <div class="stat-label">{{ t('re.statTotal') }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ store.stats.averageProbability }}%</div>
          <div class="stat-label">{{ t('re.statAvgProb') }}</div>
        </div>
        <div class="stat-card positive">
          <div class="stat-value">{{ store.stats.byFeedback.positive }}</div>
          <div class="stat-label">{{ t('re.statLike') }}</div>
        </div>
        <div class="stat-card neutral">
          <div class="stat-value">{{ store.stats.byFeedback.neutral }}</div>
          <div class="stat-label">{{ t('re.statNeutral') }}</div>
        </div>
        <div class="stat-card negative">
          <div class="stat-value">{{ store.stats.byFeedback.negative }}</div>
          <div class="stat-label">{{ t('re.statDislike') }}</div>
        </div>
      </div>

      <!-- 类别分布 -->
      <div class="stats-section" v-if="store.stats.totalGenerated > 0">
        <h3 class="subsection-title">{{ t('re.categoryDist') }}</h3>
        <div class="dist-bars">
          <div v-for="cat in store.CATEGORY_OPTIONS" :key="cat.value" class="dist-row">
            <span class="dist-label">{{ cat.label }}</span>
            <div class="dist-bar">
              <div
                class="dist-fill"
                :style="{ width: `${store.stats.totalGenerated > 0 ? (store.stats.byCategory[cat.value] / store.stats.totalGenerated) * 100 : 0}%` }"
              ></div>
            </div>
            <span class="dist-count">{{ store.stats.byCategory[cat.value] }}</span>
          </div>
        </div>
      </div>

      <!-- 结果列表 -->
      <div class="panel-toolbar">
        <p class="panel-hint">{{ t('re.resultsHint') }}</p>
        <button type="button" v-if="store.results.length > 0" class="btn danger-outline" @click="clearResults">
          <Icon name="trash-2" :size="16" aria-hidden="true" />
          {{ t('re.clearHistory') }}
        </button>
      </div>

      <ul v-if="store.results.length > 0" class="result-list" role="list">
        <li v-for="r in [...store.results].reverse()" :key="r.id" class="result-card">
          <div class="result-header">
            <span class="result-name">{{ r.eventName }}</span>
            <span class="badge category">{{ getCategoryLabel(store, r.category) }}</span>
            <span class="badge severity" :data-sev="r.severity">{{ getSeverityLabel(store, r.severity) }}</span>
            <span class="result-time">{{ formatTime(r.generatedAt) }}</span>
          </div>
          <p class="result-desc">{{ r.eventDescription }}</p>
          <div class="result-meta">
            <span>{{ t('re.template', { name: r.templateName }) }}</span>
            <span>{{ t('re.scene', { name: r.sceneName }) }}</span>
            <span>{{ t('re.prob', { percent: r.effectiveProbability }) }}</span>
          </div>
          <div class="result-feedback">
            <button
              type="button"
              class="feedback-btn"
              :class="{ active: r.feedback === 'positive' }"
              :aria-pressed="r.feedback === 'positive'"
              :aria-label="t('re.like')"
              @click="applyFeedback(r, 'positive')"
            >
              <Icon name="heart" :size="16" aria-hidden="true" />
              {{ t('re.like') }}
            </button>
            <button
              type="button"
              class="feedback-btn"
              :class="{ active: r.feedback === 'neutral' }"
              :aria-pressed="r.feedback === 'neutral'"
              :aria-label="t('re.neutral')"
              @click="applyFeedback(r, 'neutral')"
            >
              <Icon name="star" :size="16" aria-hidden="true" />
              {{ t('re.neutral') }}
            </button>
            <button
              type="button"
              class="feedback-btn"
              :class="{ active: r.feedback === 'negative' }"
              :aria-pressed="r.feedback === 'negative'"
              :aria-label="t('re.dislike')"
              @click="applyFeedback(r, 'negative')"
            >
              <Icon name="close" :size="16" aria-hidden="true" />
              {{ t('re.dislike') }}
            </button>
          </div>
        </li>
      </ul>
      <EmptyState
        v-else
        title-key="re.noResults"
        desc-key="re.noResultsHint"
        icon="star"
      />
    </section>
  </div>
</template>

<style scoped>
/* 统计 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--foreground);
}

.stat-label {
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 4px;
}

.stat-card.positive .stat-value {
  color: var(--success-fg);
}

.stat-card.negative .stat-value {
  color: var(--danger-fg);
}

.stat-card.neutral .stat-value {
  color: var(--muted-foreground);
}

.stats-section {
  margin-bottom: 24px;
}

.subsection-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--foreground);
}

.dist-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dist-row {
  display: grid;
  grid-template-columns: 120px 1fr 40px;
  gap: 8px;
  align-items: center;
}

.dist-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.dist-bar {
  height: 8px;
  background: var(--card-elevated);
  border-radius: 4px;
  overflow: hidden;
}

.dist-fill {
  height: 100%;
  background: var(--primary-fg, var(--primary));
  transition: width 0.3s;
}

.dist-count {
  font-size: 12px;
  color: var(--foreground);
  text-align: right;
}

/* 结果卡片 */
.result-card {
  margin-bottom: 0;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.result-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.result-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted-foreground);
}

.result-desc {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--foreground);
  line-height: 1.5;
}

.result-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--muted-foreground);
  margin-bottom: 8px;
}

.result-feedback {
  display: flex;
  gap: 8px;
}

.feedback-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .feedback-btn:hover {
    background: var(--card-elevated);
    color: var(--foreground);
  }
}

.feedback-btn.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}
</style>
