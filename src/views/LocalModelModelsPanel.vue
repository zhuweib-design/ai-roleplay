<script setup lang="ts">
import { ref, computed } from 'vue';
import { useLocalModelStore } from '@/stores/local-model';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { ModelSize } from '@/core/local-model-engine';
import { t } from '@/i18n';
import { formatSize, formatPercent } from './local-model-format';

/**
 * R3-3：本地模型页「模型」面板——能力筛选、加载进度、模型卡列表与加载/卸载。
 */

const store = useLocalModelStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
}>();

const filterSize = ref<ModelSize | 'all'>('all');

const filteredModels = computed(() => {
  if (filterSize.value === 'all') return store.models;
  return store.models.filter((m) => m.size === filterSize.value);
});

async function handleLoad(modelId: string) {
  const ok = await store.loadModel(modelId);
  if (ok) {
    emit('notify', t('lm.modelLoaded'), 'success');
  } else {
    emit('notify', store.lastError ?? t('lm.loadFailed'), 'error');
  }
}

async function handleUnload() {
  await store.unloadModel();
  emit('notify', t('lm.modelUnloaded'), 'info');
}
</script>

<template>
  <div class="panel-toolbar">
    <div class="filter-group" role="radiogroup" :aria-label="t('lm.filterAria')">
      <button
        type="button"
        role="radio"
        :aria-checked="filterSize === 'all'"
        class="filter-chip"
        :class="{ active: filterSize === 'all' }"
        @click="filterSize = 'all'"
      >
        {{ t('lm.filterAll') }}
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="filterSize === 'small'"
        class="filter-chip"
        :class="{ active: filterSize === 'small' }"
        @click="filterSize = 'small'"
      >
        {{ t('lm.filterSmall') }}
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="filterSize === 'medium'"
        class="filter-chip"
        :class="{ active: filterSize === 'medium' }"
        @click="filterSize = 'medium'"
      >
        {{ t('lm.filterMedium') }}
      </button>
    </div>
    <span class="model-count">{{ t('lm.modelCount', { count: filteredModels.length }) }}</span>
  </div>

  <!-- 加载进度条 -->
  <div v-if="store.isLoading && store.loadProgress" class="progress-bar" role="status" aria-live="polite">
    <div class="progress-info">
      <span>{{ t('lm.loadingPhase', { phase: store.loadProgress.phase }) }}</span>
      <span>{{ t('lm.loadingProgress', { percent: formatPercent(store.loadProgress.progress), loaded: formatSize(store.loadProgress.loadedMb), total: formatSize(store.loadProgress.totalMb) }) }}</span>
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
          <span class="badge size" :data-size="model.size">{{ model.size === 'small' ? t('lm.sizeSmall') : model.size === 'medium' ? t('lm.sizeMedium') : t('lm.sizeLarge') }}</span>
          <span v-if="store.loadedModelId === model.id" class="badge loaded">{{ t('lm.loadedBadge') }}</span>
          <span v-if="model.lowResourceFriendly" class="badge friendly">{{ t('lm.lowResourceFriendly') }}</span>
        </div>
      </div>
      <p class="model-desc">{{ model.description }}</p>
      <dl class="model-meta">
        <div><dt>{{ t('lm.downloadSize') }}</dt><dd>{{ formatSize(model.downloadSizeMb) }}</dd></div>
        <div><dt>{{ t('lm.vramUsage') }}</dt><dd>{{ formatSize(model.vramMb) }}</dd></div>
        <div><dt>{{ t('lm.contextLength') }}</dt><dd>{{ model.contextLength }} tokens</dd></div>
        <div><dt>{{ t('lm.version') }}</dt><dd>{{ model.version }}</dd></div>
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
          {{ t('lm.loadModel') }}
        </button>
        <button
          v-else
          type="button"
          class="btn danger"
          :disabled="store.isLoading"
          @click="handleUnload"
        >
          <Icon name="stop" :size="14" aria-hidden="true" />
          {{ t('lm.unload') }}
        </button>
      </div>
    </li>
  </ul>
  <EmptyState v-else title-key="lm.noModels" icon="cpu" />
</template>

<style scoped>
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
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
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
  color: var(--success-fg);
}

.badge.size[data-size="medium"] {
  background: color-mix(in srgb, var(--warning-fg) 20%, transparent);
  color: var(--warning-text);
}

.badge.loaded {
  background: var(--primary);
  color: var(--on-primary);
}

.badge.friendly {
  background: color-mix(in srgb, var(--accent-blue) 15%, transparent);
  color: var(--accent-blue-text);
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

@media (max-width: 640px) {
  .model-meta {
    grid-template-columns: 1fr;
  }
}
</style>
