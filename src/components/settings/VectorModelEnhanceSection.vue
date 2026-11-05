<script setup lang="ts">
/**
 * RAG 增强：自动择优（本地跑基准，挑 recall 最高/最快的嵌入模型）+ 停用词过滤。
 * 基准模块含 onnx 重依赖，经 loadBenchmarkMod() 动态 import，不进首屏。
 */
import { ref, computed, watch, onMounted } from 'vue';
import { isStopwordFilterEnabled, setStopwordFilterEnabled } from '@/core/stopword-filter';
import { t } from '@/i18n';

const benchmarking = ref(false);
const benchResults = ref<Array<{ modelId: string; passed: number; recall: number; latencyMs: number; error?: string }>>([]);
const benchMsg = ref('');
const stopwordFilter = ref(true);

/** 当前是否已存在择优记录(供"清除"按钮禁用态) */
const hasBest = ref(false);

/** 加载偏好(分函数避免整体静态 import 引入 onnx 重依赖) */
async function loadBenchmarkMod() {
  return import('@/core/rag-benchmark');
}

async function runBenchmark() {
  if (benchmarking.value) return;
  benchmarking.value = true;
  benchMsg.value = '';
  try {
    const mod = await loadBenchmarkMod();
    const out = await mod.runEmbeddingBenchmark();
    benchResults.value = out.results;
    if (out.best) {
      hasBest.value = true;
      benchMsg.value = t('vector.benchBest', {
        id: out.best.modelId,
        recall: (out.best.recall * 100).toFixed(0),
        ms: out.best.latencyMs.toFixed(0),
      });
    } else {
      hasBest.value = false;
      benchMsg.value = t('vector.benchNoModel');
    }
  } catch (e) {
    benchMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    benchmarking.value = false;
  }
}

async function handleClearBest() {
  const mod = await loadBenchmarkMod();
  mod.clearBestEmbeddingModel();
  benchResults.value = [];
  benchMsg.value = t('vector.benchCleared');
}

/** 表格中可选中行(recall 最高,并列取耗时短) */
const bestBenchId = computed(() => {
  const valid = benchResults.value.filter((r) => !r.error);
  if (valid.length === 0) return null;
  const b = [...valid].sort((a, b) => b.recall - a.recall || a.latencyMs - b.latencyMs)[0];
  return b ? b.modelId : null;
});
function canSelect(r: { modelId: string; error?: string }): boolean {
  return !r.error && r.modelId === bestBenchId.value;
}

watch(stopwordFilter, (v) => setStopwordFilterEnabled(v));

onMounted(() => {
  stopwordFilter.value = isStopwordFilterEnabled();
  void (async () => {
    const mod = await loadBenchmarkMod();
    hasBest.value = mod.getBestEmbeddingModel() !== null;
  })();
});
</script>

<template>
  <!-- RAG 增强:自动择优 + 停用词过滤 -->
  <div class="enhance-box" aria-labelledby="vector-enhance-title">
    <h3 id="vector-enhance-title" class="box-title">{{ t('vector.enhanceTitle') }}</h3>
    <div class="enhance-row">
      <label class="toggle-wrap">
        <span>{{ t('vector.stopwordFilter') }}</span>
        <input
          type="checkbox"
          :checked="stopwordFilter"
          :aria-label="t('vector.stopwordFilterAria')"
          @change="stopwordFilter = ($event.target as HTMLInputElement).checked"
        />
      </label>
      <span class="field-hint">{{ t('vector.stopwordFilterHint') }}</span>
    </div>
    <div class="enhance-row actions">
      <button type="button" class="add-btn" :disabled="benchmarking" @click="runBenchmark">
        {{ benchmarking ? t('vector.benchLoading') : t('vector.benchButton') }}
      </button>
      <button type="button" class="add-btn secondary" :disabled="!hasBest" @click="handleClearBest">
        {{ t('vector.benchClear') }}
      </button>
    </div>
    <p v-if="benchMsg" class="field-hint bench-msg">{{ benchMsg }}</p>
    <p v-else class="field-hint">{{ t('vector.benchHint') }}</p>

    <table v-if="benchResults.length" class="bench-table" :aria-label="t('vector.benchTable')">
      <thead>
        <tr>
          <th scope="col">{{ t('vector.benchColModel') }}</th>
          <th scope="col">{{ t('vector.benchColRecall') }}</th>
          <th scope="col">{{ t('vector.benchColLatency') }}</th>
          <th scope="col">{{ t('vector.benchColSelected') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in benchResults" :key="r.modelId" :class="{ selected: canSelect(r) }">
          <td class="bench-model">{{ r.modelId }}<span v-if="r.error" class="bench-error">✗</span></td>
          <td>{{ r.error ? '—' : (r.recall * 100).toFixed(0) + '%' }}</td>
          <td>{{ r.error ? '—' : r.latencyMs.toFixed(0) + 'ms' }}</td>
          <td>{{ canSelect(r) ? '✓' : '' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* ── RAG 增强:自动择优 + 停用词 ── */
.enhance-box {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.enhance-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.enhance-row.actions {
  gap: var(--spacing-sm);
}
.bench-msg {
  color: var(--green, #9ece6a);
}
.bench-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.bench-table th,
.bench-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.bench-table th {
  color: var(--muted-foreground);
  font-weight: 600;
}
.bench-table tr.selected td {
  background: color-mix(in srgb, var(--secondary) 15%, transparent);
}
.bench-model {
  font-family: var(--font-mono);
  font-size: 11px;
}
.bench-error {
  margin-left: 6px;
  color: var(--destructive);
}
</style>