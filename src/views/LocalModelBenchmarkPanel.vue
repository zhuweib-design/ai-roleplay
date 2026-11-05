<script setup lang="ts">
import { ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import {
  runAllBenchmarks,
  loadBenchmarkHistory,
  clearBenchmarkHistory,
  type BenchmarkResult,
} from '@/core/benchmark';
import { t } from '@/i18n';

/**
 * R3-3：本地模型页「性能基准」面板（T-10）——本次结果与历史轮次。
 *
 * 历史轮次复用宿主的 `.metrics-list` / `.metrics-item` 共享块，本组件只带
 * `.benchmark-*` 与旋转动画。
 */

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
}>();

const benchmarkRunning = ref(false);
const benchmarkResults = ref<BenchmarkResult[] | null>(null);
const benchmarkHistory = ref<BenchmarkResult[][]>(loadBenchmarkHistory());

async function handleRunBenchmark() {
  if (benchmarkRunning.value) return;
  benchmarkRunning.value = true;
  benchmarkResults.value = null;
  try {
    benchmarkResults.value = await runAllBenchmarks();
    benchmarkHistory.value = loadBenchmarkHistory();
    const allPass = benchmarkResults.value.every((r) => r.pass);
    emit('notify', allPass ? t('lm.benchmarkAllPass') : t('lm.benchmarkFailed'), allPass ? 'success' : 'error');
  } catch (err) {
    emit('notify', t('lm.benchmarkRunFailed', { error: err instanceof Error ? err.message : String(err) }), 'error');
  } finally {
    benchmarkRunning.value = false;
  }
}

function handleClearBenchmarkHistory() {
  clearBenchmarkHistory();
  benchmarkHistory.value = [];
  emit('notify', t('lm.benchmarkHistoryCleared'), 'info');
}
</script>

<template>
  <div class="panel-toolbar">
    <p class="panel-hint">
      {{ t('lm.benchmarkHint') }}
    </p>
    <button
      type="button"
      class="btn primary"
      :disabled="benchmarkRunning"
      @click="handleRunBenchmark"
    >
      <Icon name="refresh-cw" :size="14" aria-hidden="true" :class="{ spinning: benchmarkRunning }" />
      {{ benchmarkRunning ? t('lm.runningBenchmark') : t('lm.runBenchmark') }}
    </button>
    <button type="button" class="btn" @click="handleClearBenchmarkHistory">
      <Icon name="trash-2" :size="14" aria-hidden="true" />
      {{ t('lm.clearHistory') }}
    </button>
  </div>

  <!-- 本次结果 -->
  <ul v-if="benchmarkResults" class="benchmark-list" role="list">
    <li
      v-for="r in benchmarkResults"
      :key="`${r.name}-${r.ts}`"
      class="benchmark-item"
    >
      <span
        class="benchmark-pass"
        :class="r.pass ? 'pass' : 'fail'"
        :aria-label="t('lm.benchmarkPassAria')"
      >
        {{ r.pass ? '✓' : '✗' }}
      </span>
      <span class="benchmark-name">{{ r.name }}</span>
      <span class="benchmark-duration">{{ r.durationMs }} ms</span>
      <span v-if="r.budgetMs" class="benchmark-budget">{{ t('lm.benchmarkBudget', { budget: r.budgetMs }) }}</span>
      <span class="benchmark-detail">{{ r.detail }}</span>
    </li>
  </ul>
  <EmptyState v-else title-key="lm.benchmarkNoRun" compact :heading-level="3" />

  <!-- 历史 -->
  <template v-if="benchmarkHistory.length > 0">
    <h4 class="benchmark-history-title">{{ t('lm.benchmarkHistory') }}</h4>
    <ul class="metrics-list" role="list">
      <li
        v-for="(round, ridx) in benchmarkHistory"
        :key="ridx"
        class="metrics-item"
      >
        <span class="benchmark-history-time">
          {{ new Date(round[0]?.ts ?? '').toLocaleString() }}
        </span>
        <span
          v-for="r in round"
          :key="r.name"
          class="benchmark-history-chip"
          :class="r.pass ? 'pass' : 'fail'"
          :title="t('lm.benchmarkChipTitle', { name: r.name, duration: r.durationMs, budget: r.budgetMs ? t('lm.benchmarkBudgetSuffix', { budget: r.budgetMs }) : '' })"
        >
          {{ r.durationMs }}ms
        </span>
      </li>
    </ul>
  </template>
</template>

<style scoped>
/* T-10: 性能基准 */
.benchmark-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.benchmark-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  flex-wrap: wrap;
}

.benchmark-pass {
  font-weight: 700;
  width: 18px;
  text-align: center;
}

.benchmark-pass.pass {
  color: var(--green, #9ece6a);
}

.benchmark-pass.fail {
  color: var(--danger, #f7768e);
}

.benchmark-name {
  font-weight: 600;
  flex: 1;
  min-width: 200px;
}

.benchmark-duration {
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
}

.benchmark-budget {
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
}

.benchmark-detail {
  color: var(--text-secondary);
  font-size: 12px;
  width: 100%;
  padding-left: 28px;
}

.benchmark-history-title {
  margin-top: 12px;
  font-size: 13px;
  color: var(--muted-foreground);
}

.benchmark-history-time {
  font-size: 12px;
  color: var(--muted-foreground);
  white-space: nowrap;
}

.benchmark-history-chip {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  white-space: nowrap;
}

.benchmark-history-chip.pass {
  color: var(--green, #9ece6a);
  background: color-mix(in srgb, var(--green, #9ece6a) 12%, transparent);
}

.benchmark-history-chip.fail {
  color: var(--danger, #f7768e);
  background: color-mix(in srgb, var(--danger, #f7768e) 12%, transparent);
}

.spinning {
  animation: benchmark-spin 1s linear infinite;
  display: inline-block;
}

@keyframes benchmark-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
