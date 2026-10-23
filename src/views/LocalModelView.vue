<script setup lang="ts">
/**
 * LocalModelView — 本地模型推理管理 (模块2)
 *
 * 功能：
 * - 引擎能力检测与状态展示
 * - 五个 tab 面板：模型 / 性能 / 性能基准 / 缓存 / 设置（R3-3 拆为子组件）
 *
 * 无障碍：
 * - 语义化结构
 * - ARIA 标签
 * - 键盘可访问
 *
 * R3-3 拆分说明：这个文件的样式占了一半（641/1267），且**死样式为 0**——与
 * R3-1/R3-2 那种"整段搬运遗留"不同，这里只能靠真拆。切面是现成的：模板里
 * 五个 `<section v-show="activeTab === ...">` 各管一个 tab，彼此没有 props 往来。
 *
 * 共用样式（`.panel-toolbar` / `.btn` 族 / `.stats-*` / `.metrics-*` / `.section-title`）
 * 留在宿主并写成 `:deep()`：这五组被 2–5 个面板同时使用，各带一份会让
 * primitives-guard 从 1 涨到 5。`primitives-guard` 对 `:deep()` 副本不计数（见其
 * 文件头 R2-4 记录），且 `.local-model-view` 是宿主根元素，` :deep()` 能穿透到
 * 所有子组件内部。
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLocalModelStore } from '@/stores/local-model';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import { t } from '@/i18n';
import { formatSize } from './local-model-format';
import LocalModelModelsPanel from './LocalModelModelsPanel.vue';
import LocalModelPerformancePanel from './LocalModelPerformancePanel.vue';
import LocalModelBenchmarkPanel from './LocalModelBenchmarkPanel.vue';
import LocalModelCachePanel from './LocalModelCachePanel.vue';
import LocalModelSettingsPanel from './LocalModelSettingsPanel.vue';

const router = useRouter();
const store = useLocalModelStore();

// ── Tab ──
type TabKey = 'models' | 'performance' | 'benchmark' | 'cache' | 'settings';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'models', label: t('lm.tabModels') },
  { key: 'performance', label: t('lm.tabPerformance') },
  { key: 'benchmark', label: t('lm.tabBenchmark') },
  { key: 'cache', label: t('lm.tabCache') },
  { key: 'settings', label: t('lm.tabSettings') },
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

// ── 操作 ──
function goBack() {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

async function handleDetect() {
  await store.detectCapability();
  if (store.isAvailable) {
    showToast(t('lm.engineAvailable', { browser: store.capability?.browserName ?? '', vram: store.capability?.estimatedVramMb ?? 0 }), 'success');
  } else {
    showToast(store.lastError ?? t('lm.engineUnavailable'), 'error');
  }
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
        <button type="button" class="header-btn" :aria-label="t('lm.backAria')" @click="goBack">
          <Icon name="arrow-left" :size="18" aria-hidden="true" />
        </button>
        <h1>{{ t('lm.title') }}</h1>
        <span
          class="header-tag"
          :class="{ available: store.isAvailable, unavailable: !store.isAvailable }"
        >
          {{ store.isAvailable ? t('lm.available') : t('lm.unavailable') }}
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
          {{ store.isDetecting ? t('lm.detecting') : t('lm.detect') }}
        </button>
      </div>
    </header>

    <!-- 能力状态卡片 -->
    <section class="capability-card" :aria-label="t('lm.capabilityAria')">
      <div class="cap-grid">
        <div class="cap-item">
          <span class="cap-label">{{ t('lm.webgpu') }}</span>
          <span class="cap-value" :class="{ ok: store.capability?.webgpuSupported, no: !store.capability?.webgpuSupported }">
            {{ store.capability ? (store.capability.webgpuSupported ? t('lm.supported') : t('lm.notSupported')) : t('lm.notDetected') }}
          </span>
        </div>
        <div class="cap-item">
          <span class="cap-label">{{ t('lm.webllm') }}</span>
          <span class="cap-value" :class="{ ok: store.capability?.webllmInstalled, no: store.capability?.webllmInstalled === false }">
            {{ store.capability ? (store.capability.webllmInstalled ? t('lm.installed') : t('lm.notInstalled')) : t('lm.notDetected') }}
          </span>
        </div>
        <div class="cap-item">
          <span class="cap-label">{{ t('lm.browser') }}</span>
          <span class="cap-value">{{ store.capability?.browserName ?? t('lm.notDetected') }}</span>
        </div>
        <div class="cap-item">
          <span class="cap-label">{{ t('lm.estimatedVram') }}</span>
          <span class="cap-value">{{ store.capability ? formatSize(store.capability.estimatedVramMb) : t('lm.notDetected') }}</span>
        </div>
        <div class="cap-item">
          <span class="cap-label">{{ t('lm.wasmFallback') }}</span>
          <span
            class="cap-value"
            :class="{
              ok: store.capability?.wasmSupported,
              no: store.capability?.wasmSupported === false,
            }"
          >
            {{ store.capability ? (store.capability.wasmSupported ? t('lm.wasmAvailable') : t('lm.wasmUnavailable')) : t('lm.notDetected') }}
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
        <span>{{ t('lm.wasmNotice') }}</span>
      </div>
      <p v-if="store.capability?.reason" class="cap-reason" role="alert">
        <Icon name="alert-triangle" :size="14" aria-hidden="true" />
        {{ store.capability.reason }}
      </p>
    </section>

    <nav class="tabs" role="tablist" :aria-label="t('lm.tabsAria')">
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
      <section
        v-show="activeTab === 'models'"
        id="panel-models"
        role="tabpanel"
        aria-labelledby="tab-models"
        class="panel"
      >
        <LocalModelModelsPanel @notify="showToast" />
      </section>

      <section
        v-show="activeTab === 'performance'"
        id="panel-performance"
        role="tabpanel"
        aria-labelledby="tab-performance"
        class="panel"
      >
        <LocalModelPerformancePanel @notify="showToast" />
      </section>

      <section
        v-show="activeTab === 'benchmark'"
        id="panel-benchmark"
        role="tabpanel"
        aria-labelledby="tab-benchmark"
        class="panel"
      >
        <LocalModelBenchmarkPanel @notify="showToast" />
      </section>

      <section
        v-show="activeTab === 'cache'"
        id="panel-cache"
        role="tabpanel"
        aria-labelledby="tab-cache"
        class="panel"
      >
        <LocalModelCachePanel @notify="showToast" />
      </section>

      <section
        v-show="activeTab === 'settings'"
        id="panel-settings"
        role="tabpanel"
        aria-labelledby="tab-settings"
        class="panel"
      >
        <LocalModelSettingsPanel @notify="showToast" />
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
  /* --success 是「背景/装饰」用色，文字须用其前景版 --success-fg。
     light 下 --success(#059669) on 20% 染层仅 2.79:1；success-fg(#065F46) 达标。 */
  color: var(--success-fg);
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

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover:not(:disabled) {
    background: var(--card-elevated);
  }
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
  /* 同上：--success 作文字在 light 卡片上仅 3.76:1，改用 --success-fg。 */
  color: var(--success-fg);
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

@media (hover: hover) and (pointer: fine) {
  .tab:hover {
    color: var(--foreground);
  }
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

/* ── 面板共用样式（:deep 穿透到子组件；五组被 2–5 个面板同时使用，各带一份会让
   primitives-guard 从 1 涨到 5） ── */
.local-model-view :deep(.panel-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.local-model-view :deep(.panel-hint) {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.local-model-view :deep(.btn) {
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

@media (hover: hover) and (pointer: fine) {
  .local-model-view :deep(.btn:hover:not(:disabled)) {
    background: var(--card-elevated);
  }
}

.local-model-view :deep(.btn.primary) {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.local-model-view :deep(.btn.danger) {
  background: transparent;
  color: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
}

@media (hover: hover) and (pointer: fine) {
  .local-model-view :deep(.btn.danger:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent);
  }
}

/* 统计卡片 */
.local-model-view :deep(.stats-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.local-model-view :deep(.stat-card) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.local-model-view :deep(.stat-label) {
  font-size: 11px;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.local-model-view :deep(.stat-value) {
  font-size: 20px;
  font-weight: 600;
  font-family: var(--font-display);
}

.local-model-view :deep(.stat-value .unit) {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted-foreground);
}

/* 指标列表 */
.local-model-view :deep(.section-title) {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 10px;
}

.local-model-view :deep(.metrics-list) {
  list-style: none;
  margin: 0;
  padding: 0;
}

.local-model-view :deep(.metrics-item) {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  align-items: center;
}

.local-model-view :deep(.metrics-model) {
  font-weight: 500;
}

.local-model-view :deep(.metrics-tps) {
  color: var(--primary-fg, var(--primary));
  font-weight: 600;
}

.local-model-view :deep(.metrics-time),
.local-model-view :deep(.metrics-tokens) {
  color: var(--muted-foreground);
}

@media (max-width: 640px) {
  .local-model-view :deep(.metrics-item) {
    grid-template-columns: 1fr 1fr;
    font-size: 11px;
  }
}
</style>
