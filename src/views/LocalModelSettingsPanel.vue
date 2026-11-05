<script setup lang="ts">
import { useLocalModelStore } from '@/stores/local-model';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

/**
 * R3-3：本地模型页「设置」面板——偏好开关与推理默认参数。
 *
 * 所有改动直接走 `store.updateSettings` 实时落库，底部按钮只是给个确认反馈。
 */

const store = useLocalModelStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
}>();

function handleSaveSettings() {
  // 设置已通过 updateSettings 实时更新到 store
  emit('notify', t('lm.settingsSaved'), 'success');
}
</script>

<template>
  <div class="settings-form">
    <label class="setting-row">
      <span class="setting-label">{{ t('lm.preferLocal') }}</span>
      <input
        type="checkbox"
        :checked="store.settings.preferLocal"
        @change="store.updateSettings({ preferLocal: ($event.target as HTMLInputElement).checked })"
      />
      <span class="setting-desc">{{ t('lm.preferLocalDesc') }}</span>
    </label>

    <label class="setting-row">
      <span class="setting-label">{{ t('lm.cacheCapacity') }}</span>
      <input
        type="number"
        min="1"
        max="500"
        :value="store.settings.cacheCapacity"
        @change="store.updateSettings({ cacheCapacity: parseInt(($event.target as HTMLInputElement).value, 10) || 50 })"
      />
      <span class="setting-desc">{{ t('lm.cacheCapacityDesc') }}</span>
    </label>

    <label class="setting-row">
      <span class="setting-label">{{ t('lm.cacheTtl') }}</span>
      <input
        type="number"
        min="1"
        max="1440"
        :value="Math.round(store.settings.cacheTtlMs / 60000)"
        @change="store.updateSettings({ cacheTtlMs: (parseInt(($event.target as HTMLInputElement).value, 10) || 30) * 60000 })"
      />
      <span class="setting-desc">{{ t('lm.cacheTtlDesc') }}</span>
    </label>

    <label class="setting-row">
      <span class="setting-label">{{ t('lm.defaultTemp') }}</span>
      <input
        type="number"
        min="0"
        max="2"
        step="0.1"
        :value="store.settings.defaultTemperature"
        @change="store.updateSettings({ defaultTemperature: parseFloat(($event.target as HTMLInputElement).value) || 0.7 })"
      />
      <span class="setting-desc">{{ t('lm.defaultTempDesc') }}</span>
    </label>

    <label class="setting-row">
      <span class="setting-label">{{ t('lm.defaultTopP') }}</span>
      <input
        type="number"
        min="0"
        max="1"
        step="0.05"
        :value="store.settings.defaultTopP"
        @change="store.updateSettings({ defaultTopP: parseFloat(($event.target as HTMLInputElement).value) || 0.95 })"
      />
      <span class="setting-desc">{{ t('lm.defaultTopPDesc') }}</span>
    </label>

    <label class="setting-row">
      <span class="setting-label">{{ t('lm.defaultMaxTokens') }}</span>
      <input
        type="number"
        min="64"
        max="4096"
        step="64"
        :value="store.settings.defaultMaxTokens"
        @change="store.updateSettings({ defaultMaxTokens: parseInt(($event.target as HTMLInputElement).value, 10) || 1024 })"
      />
      <span class="setting-desc">{{ t('lm.defaultMaxTokensDesc') }}</span>
    </label>

    <div class="setting-actions">
      <button type="button" class="btn primary" @click="handleSaveSettings">
        <Icon name="save" :size="14" aria-hidden="true" />
        {{ t('lm.saveSettings') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
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

@media (max-width: 640px) {
  .setting-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .setting-row input[type="number"] {
    font-size: 16px;
  }
}
</style>
