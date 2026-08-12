<script setup lang="ts">
/**
 * LocalModelView — 本地模型推理管理 (模块2)
 *
 * 功能：
 * - 引擎能力检测与状态展示
 * - 模型列表与加载/卸载
 * - 性能指标仪表板
 * - 推理缓存管理
 * - 设置面板
 *
 * 无障碍：
 * - 语义化结构
 * - ARIA 标签
 * - 键盘可访问
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLocalModelStore } from '@/stores/local-model';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import {
  runAllBenchmarks,
  loadBenchmarkHistory,
  clearBenchmarkHistory,
  type BenchmarkResult,
} from '@/core/benchmark';
import type { ModelSize } from '@/core/local-model-engine';

const router = useRouter();
const store = useLocalModelStore();

// ── Tab ──
type TabKey = 'models' | 'performance' | 'benchmark' | 'cache' | 'settings';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'models', label: '模型管理' },
  { key: 'performance', label: '性能指标' },
  { key: 'benchmark', label: '性能基准' },
  { key: 'cache', label: '推理缓存' },
  { key: 'settings', label: '设置' },
];
const activeTab = ref<TabKey>('models');

// ── Toast ──
const toastOpen = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'success' | 'error'>('info');

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  toastMessage.value = message;
  toastType.value = type;
  toastOpen.value = true;
}

// ── 筛选 ──
const filterSize = ref<ModelSize | 'all'>('all');

const filteredModels = computed(() => {
  if (filterSize.value === 'all') return store.models;
  return store.models.filter((m) => m.size === filterSize.value);
});

// ── 操作 ──
function goBack() {
  router.push({ name: 'chat' });
}

async function handleDetect() {
  await store.detectCapability();
  if (store.isAvailable) {
    showToast(`引擎可用：${store.capability?.browserName}，显存 ${store.capability?.estimatedVramMb}MB`, 'success');
  } else {
    showToast(store.lastError ?? '本地推理不可用', 'error');
  }
}

async function handleLoad(modelId: string) {
  const ok = await store.loadModel(modelId);
  if (ok) {
    showToast(`模型已加载就绪`, 'success');
  } else {
    showToast(store.lastError ?? '加载失败', 'error');
  }
}

async function handleUnload() {
  await store.unloadModel();
  showToast('模型已卸载', 'info');
}

function handleClearCache() {
  store.clearCache();
  showToast('缓存已清空', 'info');
}

function handleClearMetrics() {
  store.clearMetrics();
  showToast('指标已清空', 'info');
}

function handleSaveSettings() {
  // 设置已通过 updateSettings 实时更新到 store
  showToast('设置已保存', 'success');
}

// ── T-10: 性能基准 ──
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
    showToast(allPass ? '基准全部通过预算' : '存在未达预算项，请查看明细', allPass ? 'success' : 'error');
  } catch (err) {
    showToast(`基准运行失败：${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    benchmarkRunning.value = false;
  }
}

function handleClearBenchmarkHistory() {
  clearBenchmarkHistory();
  benchmarkHistory.value = [];
  showToast('基准历史已清空', 'info');
}

// ── 工具 ──
function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

// ── 初始化 ──
onMounted(async () => {
  if (!store.capability) {
    await store.detectCapability();
  }
});
</script>

<template>
  <div class="local-model-view">
    <header class="page-header">
      <div class="header-title">
        <button type="button" class="header-btn" aria-label="返回" @click="goBack">
          <Icon name="arrow-left" :size="18" aria-hidden="true" />
        </button>
        <h1>本地模型</h1>
        <span
          class="header-tag"
          :class="{ available: store.isAvailable, unavailable: !store.isAvailable }"
        >
          {{ store.isAvailable ? '可用' : '不可用' }}
        </span>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="header-btn"
          :disabled="store.isDetecting"
          @click="handleDetect"
        >
          <Icon name="refresh-cw" :size="16" aria-hidden="true" />
          {{ store.isDetecting ? '检测中…' : '检测能力' }}
        </button>
      </div>
    </header>

    <!-- 能力状态卡片 -->
    <section class="capability-card" aria-label="引擎能力">
      <div class="cap-grid">
        <div class="cap-item">
          <span class="cap-label">WebGPU</span>
          <span class="cap-value" :class="{ ok: store.capability?.webgpuSupported, no: !store.capability?.webgpuSupported }">
            {{ store.capability ? (store.capability.webgpuSupported ? '支持' : '不支持') : '未检测' }}
          </span>
        </div>
        <div class="cap-item">
          <span class="cap-label">WebLLM</span>
          <span class="cap-value" :class="{ ok: store.capability?.webllmInstalled, no: store.capability?.webllmInstalled === false }">
            {{ store.capability ? (store.capability.webllmInstalled ? '已安装' : '未安装') : '未检测' }}
          </span>
        </div>
        <div class="cap-item">
          <span class="cap-label">浏览器</span>
          <span class="cap-value">{{ store.capability?.browserName ?? '未检测' }}</span>
        </div>
        <div class="cap-item">
          <span class="cap-label">估算显存</span>
          <span class="cap-value">{{ store.capability ? formatSize(store.capability.estimatedVramMb) : '未检测' }}</span>
        </div>
        <div class="cap-item">
          <span class="cap-label">WASM 降级</span>
          <span
            class="cap-value"
            :class="{
              ok: store.capability?.wasmSupported,
              no: store.capability?.wasmSupported === false,
            }"
          >
            {{ store.capability ? (store.capability.wasmSupported ? '可用' : '不可用') : '未检测' }}
          </span>
        </div>
      </div>
      <!-- T-05: WASM 降级提示 —— 无 WebGPU 但支持 WASM 时仍可 CPU 推理（慢） -->
      <div
        v-if="store.capability && !store.capability.webgpuSupported && store.capability.wasmSupported"
        class="wasm-fallback-notice"
        role="note"
      >
        <Icon name="alert-triangle" :size="14" aria-hidden="true" />
        当前环境无 WebGPU，将使用 <strong>WASM CPU 降级</strong> 推理（速度较慢，建议选择 small 模型）
      </div>
      <p v-if="store.capability?.reason" class="cap-reason" role="alert">
        <Icon name="alert-triangle" :size="14" aria-hidden="true" />
        {{ store.capability.reason }}
      </p>
    </section>

    <nav class="tabs" role="tablist" aria-label="本地模型管理">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`panel-${tab.key}`"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main class="page-body">
      <!-- 模型管理 -->
      <section
        v-show="activeTab === 'models'"
        id="panel-models"
        role="tabpanel"
        aria-labelledby="tab-models"
        class="panel"
      >
        <div class="panel-toolbar">
          <div class="filter-group" role="radiogroup" aria-label="模型规模筛选">
            <button
              type="button"
              role="radio"
              :aria-checked="filterSize === 'all'"
              class="filter-chip"
              :class="{ active: filterSize === 'all' }"
              @click="filterSize = 'all'"
            >
              全部
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="filterSize === 'small'"
              class="filter-chip"
              :class="{ active: filterSize === 'small' }"
              @click="filterSize = 'small'"
            >
              小型
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="filterSize === 'medium'"
              class="filter-chip"
              :class="{ active: filterSize === 'medium' }"
              @click="filterSize = 'medium'"
            >
              中型
            </button>
          </div>
          <span class="model-count">{{ filteredModels.length }} 个模型</span>
        </div>

        <!-- 加载进度条 -->
        <div v-if="store.isLoading && store.loadProgress" class="progress-bar" role="status" aria-live="polite">
          <div class="progress-info">
            <span>加载中：{{ store.loadProgress.phase }}</span>
            <span>{{ formatPercent(store.loadProgress.progress) }}（{{ formatSize(store.loadProgress.loadedMb) }} / {{ formatSize(store.loadProgress.totalMb) }}）</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${store.loadProgress.progress * 100}%` }" />
          </div>
        </div>

        <ul v-if="filteredModels.length > 0" class="model-list" role="list">
          <li
            v-for="model in filteredModels"
            :key="model.id"
            class="model-card"
            :class="{ loaded: store.loadedModelId === model.id }"
          >
            <div class="model-header">
              <div class="model-title">
                <span class="title-text">{{ model.name }}</span>
                <span class="badge size" :data-size="model.size">{{ model.size === 'small' ? '小型' : model.size === 'medium' ? '中型' : '大型' }}</span>
                <span v-if="store.loadedModelId === model.id" class="badge loaded">已加载</span>
                <span v-if="model.lowResourceFriendly" class="badge friendly">低配友好</span>
              </div>
            </div>
            <p class="model-desc">{{ model.description }}</p>
            <dl class="model-meta">
              <div><dt>下载大小</dt><dd>{{ formatSize(model.downloadSizeMb) }}</dd></div>
              <div><dt>显存占用</dt><dd>{{ formatSize(model.vramMb) }}</dd></div>
              <div><dt>上下文</dt><dd>{{ model.contextLength }} tokens</dd></div>
              <div><dt>版本</dt><dd>{{ model.version }}</dd></div>
            </dl>
            <div class="model-actions">
              <button
                v-if="store.loadedModelId !== model.id"
                type="button"
                class="btn primary"
                :disabled="!store.isAvailable || store.isLoading"
                @click="handleLoad(model.id)"
              >
                <Icon name="download" :size="14" aria-hidden="true" />
                加载模型
              </button>
              <button
                v-else
                type="button"
                class="btn danger"
                :disabled="store.isLoading"
                @click="handleUnload"
              >
                <Icon name="stop" :size="14" aria-hidden="true" />
                卸载
              </button>
            </div>
          </li>
        </ul>
        <div v-else class="empty-state">
          <Icon name="cpu" :size="48" aria-hidden="true" />
          <p>无符合条件的模型</p>
        </div>
      </section>

      <!-- 性能指标 -->
      <section
        v-show="activeTab === 'performance'"
        id="panel-performance"
        role="tabpanel"
        aria-labelledby="tab-performance"
        class="panel"
      >
        <div class="panel-toolbar">
          <p class="panel-hint">展示本地推理的性能指标历史。</p>
          <button type="button" class="btn" @click="handleClearMetrics">
            <Icon name="trash-2" :size="14" aria-hidden="true" />
            清空指标
          </button>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">平均解码速度</span>
            <span class="stat-value">{{ store.averageMetrics.avgTokensPerSecond.toFixed(1) }} <span class="unit">tokens/s</span></span>
          </div>
          <div class="stat-card">
            <span class="stat-label">平均首字延迟</span>
            <span class="stat-value">{{ formatMs(store.averageMetrics.avgFirstTokenMs) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">平均总耗时</span>
            <span class="stat-value">{{ formatMs(store.averageMetrics.avgTotalMs) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">推理次数</span>
            <span class="stat-value">{{ store.averageMetrics.count }}</span>
          </div>
        </div>

        <h3 class="section-title">最近指标</h3>
        <ul v-if="store.metricsHistory.length > 0" class="metrics-list" role="list">
          <li v-for="(m, idx) in store.metricsHistory.slice(-20).reverse()" :key="idx" class="metrics-item">
            <span class="metrics-model">{{ m.modelId.split('-')[0] }} {{ m.modelId.split('-')[1] }}</span>
            <span class="metrics-tps">{{ m.tokensPerSecond.toFixed(1) }} t/s</span>
            <span class="metrics-time">{{ formatMs(m.totalMs) }}</span>
            <span class="metrics-tokens">{{ m.outputTokens }} tokens</span>
          </li>
        </ul>
        <div v-else class="empty-state small">
          <p>暂无推理记录</p>
        </div>
      </section>

      <!-- T-10: 性能基准 -->
      <section
        v-show="activeTab === 'benchmark'"
        id="panel-benchmark"
        role="tabpanel"
        aria-labelledby="tab-benchmark"
        class="panel"
      >
        <div class="panel-toolbar">
          <p class="panel-hint">
            浏览器内微基准:验证性能预算(RAG 召回 &lt;500ms、窗口计算 &lt;50ms;Token 计数为观测项)。
          </p>
          <button
            type="button"
            class="btn primary"
            :disabled="benchmarkRunning"
            @click="handleRunBenchmark"
          >
            <Icon name="refresh-cw" :size="14" aria-hidden="true" :class="{ spinning: benchmarkRunning }" />
            {{ benchmarkRunning ? '运行中…' : '运行基准' }}
          </button>
          <button type="button" class="btn" @click="handleClearBenchmarkHistory">
            <Icon name="trash-2" :size="14" aria-hidden="true" />
            清空历史
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
              aria-label="是否通过预算"
            >
              {{ r.pass ? '✓' : '✗' }}
            </span>
            <span class="benchmark-name">{{ r.name }}</span>
            <span class="benchmark-duration">{{ r.durationMs }} ms</span>
            <span v-if="r.budgetMs" class="benchmark-budget">预算 {{ r.budgetMs }} ms</span>
            <span class="benchmark-detail">{{ r.detail }}</span>
          </li>
        </ul>
        <div v-else class="empty-state small">
          <p>尚未运行基准,点击「运行基准」开始</p>
        </div>

        <!-- 历史 -->
        <template v-if="benchmarkHistory.length > 0">
          <h4 class="benchmark-history-title">历史记录</h4>
          <ul class="metrics-list" role="list">
            <li
              v-for="(round, ridx) in benchmarkHistory"
              :key="ridx"
              class="metrics-item"
            >
              <span class="benchmark-history-time">
                {{ new Date(round[0]?.ts ?? '').toLocaleString('zh-CN') }}
              </span>
              <span
                v-for="r in round"
                :key="r.name"
                class="benchmark-history-chip"
                :class="r.pass ? 'pass' : 'fail'"
                :title="`${r.name}: ${r.durationMs}ms${r.budgetMs ? ` / 预算 ${r.budgetMs}ms` : ''}`"
              >
                {{ r.durationMs }}ms
              </span>
            </li>
          </ul>
        </template>
      </section>

      <!-- 推理缓存 -->
      <section
        v-show="activeTab === 'cache'"
        id="panel-cache"
        role="tabpanel"
        aria-labelledby="tab-cache"
        class="panel"
      >
        <div class="panel-toolbar">
          <p class="panel-hint">推理结果缓存可避免重复计算，加速相同请求的响应。</p>
          <div class="toolbar-actions">
            <button type="button" class="btn" @click="store.purgeExpiredCache()">
              清理过期
            </button>
            <button type="button" class="btn danger" @click="handleClearCache">
              <Icon name="trash-2" :size="14" aria-hidden="true" />
              清空缓存
            </button>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">缓存条目数</span>
            <span class="stat-value">{{ store.cacheStats.size }} / {{ store.cacheStats.maxCapacity }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">命中率</span>
            <span class="stat-value">{{ formatPercent(store.cacheStats.hitRate) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">命中次数</span>
            <span class="stat-value">{{ store.cacheStats.totalHits }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">淘汰次数</span>
            <span class="stat-value">{{ store.cacheStats.totalEvictions }}</span>
          </div>
        </div>
      </section>

      <!-- 设置 -->
      <section
        v-show="activeTab === 'settings'"
        id="panel-settings"
        role="tabpanel"
        aria-labelledby="tab-settings"
        class="panel"
      >
        <div class="settings-form">
          <label class="setting-row">
            <span class="setting-label">优先使用本地推理</span>
            <input
              type="checkbox"
              :checked="store.settings.preferLocal"
              @change="store.updateSettings({ preferLocal: ($event.target as HTMLInputElement).checked })"
            />
            <span class="setting-desc">开启后，对话时优先尝试本地模型，失败回退到 API</span>
          </label>

          <label class="setting-row">
            <span class="setting-label">缓存容量</span>
            <input
              type="number"
              min="1"
              max="500"
              :value="store.settings.cacheCapacity"
              @change="store.updateSettings({ cacheCapacity: parseInt(($event.target as HTMLInputElement).value, 10) || 50 })"
            />
            <span class="setting-desc">缓存的最大条目数（超出后淘汰最旧的）</span>
          </label>

          <label class="setting-row">
            <span class="setting-label">缓存有效期（分钟）</span>
            <input
              type="number"
              min="1"
              max="1440"
              :value="Math.round(store.settings.cacheTtlMs / 60000)"
              @change="store.updateSettings({ cacheTtlMs: (parseInt(($event.target as HTMLInputElement).value, 10) || 30) * 60000 })"
            />
            <span class="setting-desc">缓存条目超过此时间后自动失效</span>
          </label>

          <label class="setting-row">
            <span class="setting-label">默认温度</span>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              :value="store.settings.defaultTemperature"
              @change="store.updateSettings({ defaultTemperature: parseFloat(($event.target as HTMLInputElement).value) || 0.7 })"
            />
            <span class="setting-desc">推理默认温度参数</span>
          </label>

          <label class="setting-row">
            <span class="setting-label">默认 Top-P</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              :value="store.settings.defaultTopP"
              @change="store.updateSettings({ defaultTopP: parseFloat(($event.target as HTMLInputElement).value) || 0.95 })"
            />
            <span class="setting-desc">核采样阈值（0-1，默认 0.95）</span>
          </label>

          <label class="setting-row">
            <span class="setting-label">默认最大 tokens</span>
            <input
              type="number"
              min="64"
              max="4096"
              step="64"
              :value="store.settings.defaultMaxTokens"
              @change="store.updateSettings({ defaultMaxTokens: parseInt(($event.target as HTMLInputElement).value, 10) || 1024 })"
            />
            <span class="setting-desc">单次推理最大生成 token 数</span>
          </label>

          <div class="setting-actions">
            <button type="button" class="btn primary" @click="handleSaveSettings">
              <Icon name="save" :size="14" aria-hidden="true" />
              保存设置
            </button>
          </div>
        </div>
      </section>
    </main>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.local-model-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
  color: var(--foreground);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.header-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.header-tag.available {
  background: color-mix(in srgb, var(--success) 20%, transparent);
  color: var(--success);
}

.header-tag.unavailable {
  background: color-mix(in srgb, var(--danger, #ef4444) 20%, transparent);
  color: var(--danger, #ef4444);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
  transition: background-color .15s ease;
}

.header-btn:hover:not(:disabled) {
  background: var(--card-elevated);
}

.header-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.header-btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

/* 能力卡片 */
.capability-card {
  margin: 12px 20px;
  padding: 14px 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.cap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.cap-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cap-label {
  font-size: 11px;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cap-value {
  font-size: 14px;
  font-weight: 500;
}

.cap-value.ok {
  color: var(--success);
}

.cap-value.no {
  color: var(--danger, #ef4444);
}

.cap-reason {
  margin-top: 10px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent);
  border-radius: var(--radius-sm);
  color: var(--danger, #ef4444);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* T-05: WASM 降级提示条 */
.wasm-fallback-notice {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 40%, transparent);
  background: color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent);
  color: var(--warning, #f59e0b);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.tab {
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: color .15s ease, border-color .15s ease;
}

.tab:hover {
  color: var(--foreground);
}

.tab.active {
  color: var(--primary-fg, var(--primary));
  border-bottom-color: var(--primary);
}

/* Panel */
.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.panel-hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.filter-group {
  display: flex;
  gap: 4px;
}

.filter-chip {
  padding: 4px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-full, 999px);
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 12px;
  transition: all .15s ease;
}

.filter-chip.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.model-count {
  font-size: 12px;
  color: var(--muted-foreground);
}

/* 进度条 */
.progress-bar {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 8px;
  color: var(--muted-foreground);
}

.progress-track {
  height: 6px;
  background: var(--card-elevated);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width .3s ease;
}

/* 模型列表 */
.model-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.model-card {
  padding: 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color .15s ease;
}

.model-card.loaded {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.model-header {
  margin-bottom: 8px;
}

.model-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.title-text {
  font-size: 15px;
  font-weight: 600;
}

.badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.badge.size[data-size="small"] {
  background: color-mix(in srgb, var(--success) 20%, transparent);
  color: var(--success);
}

.badge.size[data-size="medium"] {
  background: color-mix(in srgb, #f59e0b 20%, transparent);
  color: #f59e0b;
}

.badge.loaded {
  background: var(--primary);
  color: var(--on-primary);
}

.badge.friendly {
  background: color-mix(in srgb, #3b82f6 15%, transparent);
  color: #3b82f6;
}

.model-desc {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.model-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 0 0 12px;
  font-size: 12px;
}

.model-meta dt {
  color: var(--muted-foreground);
  font-size: 11px;
}

.model-meta dd {
  margin: 0;
  font-weight: 500;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 12px;
  transition: background-color .15s ease;
}

.btn:hover:not(:disabled) {
  background: var(--card-elevated);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.btn.danger {
  background: transparent;
  color: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
}

.btn.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent);
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.stat-label {
  font-size: 11px;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  font-family: var(--font-display);
}

.stat-value .unit {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted-foreground);
}

/* 指标列表 */
.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 10px;
}

.metrics-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.metrics-item {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  align-items: center;
}

.metrics-model {
  font-weight: 500;
}

.metrics-tps {
  color: var(--primary-fg, var(--primary));
  font-weight: 600;
}

.metrics-time,
.metrics-tokens {
  color: var(--muted-foreground);
}

/* 设置表单 */
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 600px;
}

.setting-row {
  display: grid;
  grid-template-columns: 180px auto 1fr;
  align-items: center;
  gap: 12px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
}

.setting-desc {
  font-size: 12px;
  color: var(--muted-foreground);
}

.setting-row input[type="number"] {
  width: 80px;
  padding: 4px 8px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 13px;
}

.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.setting-actions {
  margin-top: 8px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--muted-foreground);
  gap: 8px;
}

.empty-state.small {
  padding: 20px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

/* 响应式 */
@media (max-width: 767px) {
  .model-meta {
    grid-template-columns: 1fr;
  }

  .setting-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .metrics-item {
    grid-template-columns: 1fr 1fr;
    font-size: 11px;
  }
}
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
