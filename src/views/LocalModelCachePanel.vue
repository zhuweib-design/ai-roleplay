<script setup lang="ts">
import { useLocalModelStore } from '@/stores/local-model';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { formatPercent } from './local-model-format';

/**
 * R3-3：本地模型页「缓存」面板——容量/命中率/淘汰统计与清理动作。
 *
 * 卡片沿用宿主的 `.stats-grid` / `.stat-*` 共享块，本组件只带 `.toolbar-actions`。
 */

const store = useLocalModelStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
}>();

function handleClearCache() {
  store.clearCache();
  emit('notify', t('lm.cacheCleared'), 'info');
}
</script>

<template>
  <div class="panel-toolbar">
    <p class="panel-hint">{{ t('lm.cacheHint') }}</p>
    <div class="toolbar-actions">
      <button type="button" class="btn" @click="store.purgeExpiredCache()">
        {{ t('lm.purgeExpired') }}
      </button>
      <button type="button" class="btn danger" @click="handleClearCache">
        <Icon name="trash-2" :size="14" aria-hidden="true" />
        {{ t('lm.clearCache') }}
      </button>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.cacheEntries') }}</span>
      <span class="stat-value">{{ store.cacheStats.size }} / {{ store.cacheStats.maxCapacity }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.hitRate') }}</span>
      <span class="stat-value">{{ formatPercent(store.cacheStats.hitRate) }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.hitCount') }}</span>
      <span class="stat-value">{{ store.cacheStats.totalHits }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">{{ t('lm.evictionCount') }}</span>
      <span class="stat-value">{{ store.cacheStats.totalEvictions }}</span>
    </div>
  </div>
</template>

<style scoped>
.toolbar-actions {
  display: flex;
  gap: 8px;
}
</style>
