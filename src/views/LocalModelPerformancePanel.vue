<script setup lang="ts">
import { useLocalModelStore } from '@/stores/local-model';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { t } from '@/i18n';
import { formatMs } from './local-model-format';

/**
 * R3-3：本地模型页「性能」面板——平均值卡片与最近 20 次推理记录。
 *
 * 本面板没有专属样式：`.panel-toolbar` / `.stats-grid` / `.stat-*` / `.section-title` /
 * `.metrics-*` 都在宿主的 `:deep()` 共享块里（缓存面板与基准面板也用同一批）。
 */

const store = useLocalModelStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
}>();

function handleClearMetrics() {
  store.clearMetrics();
  emit('notify', t('lm.metricsCleared'), 'info');
}
</script>

<template>
  <div class="panel-toolbar">
    <p class="panel-hint">{{ t('lm.performanceHint') }}</p>
    <button type="button" class="btn" @click="handleClearMetrics">
      <Icon name="trash-2" :size="14" aria-hidden="true" />
      {{ t('lm.clearMetrics') }}
    </button>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.avgDecodeSpeed') }}</span>
      <span class="stat-value">{{ store.averageMetrics.avgTokensPerSecond.toFixed(1) }} <span class="unit">tokens/s</span></span>
    </div>
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.avgFirstToken') }}</span>
      <span class="stat-value">{{ formatMs(store.averageMetrics.avgFirstTokenMs) }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.avgTotal') }}</span>
      <span class="stat-value">{{ formatMs(store.averageMetrics.avgTotalMs) }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.inferenceCount') }}</span>
      <span class="stat-value">{{ store.averageMetrics.count }}</span>
    </div>
  </div>

  <h3 class="section-title">{{ t('lm.recentMetrics') }}</h3>
  <ul v-if="store.metricsHistory.length > 0" class="metrics-list" role="list">
    <li v-for="(m, idx) in store.metricsHistory.slice(-20).reverse()" :key="idx" class="metrics-item">
      <span class="metrics-model">{{ m.modelId.split('-')[0] }} {{ m.modelId.split('-')[1] }}</span>
      <span class="metrics-tps">{{ m.tokensPerSecond.toFixed(1) }} t/s</span>
      <span class="metrics-time">{{ formatMs(m.totalMs) }}</span>
      <span class="metrics-tokens">{{ m.outputTokens }} tokens</span>
    </li>
  </ul>
  <EmptyState v-else title-key="lm.noMetrics" compact :heading-level="3" />
</template>
