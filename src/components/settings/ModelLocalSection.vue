<script setup lang="ts">
/**
 * ModelLocalSection — 本地模型（WebLLM）引擎检测 + 模型列表 + 加载/卸载/注册为配置
 *
 * R1-4 从 SettingsModelPanel（原 2544 行）拆出。读 `localModelStore` 与 `settings`
 * （写入"注册为 API 配置"），不接父组件状态：这一节的开合与数据都来自 store。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { useLocalModelStore } from '@/stores/local-model';
import type { ApiProfile } from '@/types';
import type { ModelSize } from '@/core/local-model-engine';
import Icon from '@/components/common/Icon.vue';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();
const localModelStore = useLocalModelStore();
const router = useRouter();

function goToLocalModel() {
  void router.push({ name: 'local-model' });
}

/** 本地模型状态文案 */
function localModelStatusLabel(id: string): string {
  const status = localModelStore.modelStatuses.get(id);
  if (status === 'loading' || status === 'downloading') return t('modelPanel.statusLoading');
  if (status === 'loaded') return t('modelPanel.statusLoaded');
  if (status === 'error') return t('modelPanel.statusError');
  return t('modelPanel.statusNotLoaded');
}

async function handleLoadLocalModel(modelId: string) {
  const ok = await localModelStore.loadModel(modelId);
  showToast(ok ? 'success' : 'error', ok ? t('modelPanel.localLoaded', { id: modelId }) : (localModelStore.lastError ?? t('modelPanel.loadFailed')));
}

async function handleUnloadLocalModel() {
  await localModelStore.unloadModel();
  showToast('info', t('modelPanel.localUnloaded'));
}

/** 将本地模型注册为模型配置（provider='local'），供对话页直接选择使用 */
function addLocalModelAsProfile(modelId: string) {
  const exists = settings.apiProfiles.some((p) => p.provider === 'local' && p.model === modelId);
  if (exists) {
    showToast('info', t('modelPanel.alreadyProfile'));
    return;
  }
  const meta = localModelStore.models.find((m) => m.id === modelId);
  const profile: ApiProfile = {
    ...settings.createProfileTemplate(),
    name: t('modelPanel.localProfilePrefix', { name: meta?.name ?? modelId }),
    provider: 'local',
    baseUrl: '',
    apiKey: '',
    model: modelId,
  };
  settings.addApiProfile(profile);
  showToast('success', t('modelPanel.profileAdded', { name: profile.name }));
}

/** 模型规模文案 */
function sizeLabel(size: ModelSize): string {
  if (size === 'small') return t('modelPanel.sizeSmall');
  if (size === 'medium') return t('modelPanel.sizeMedium');
  return t('modelPanel.sizeLarge');
}

/** 引擎状态文案 */
const engineStatusText = computed(() => {
  if (localModelStore.capability === null) return t('modelPanel.engineStatusIdle');
  if (localModelStore.isAvailable) return t('modelPanel.engineStatusOk');
  return t('modelPanel.engineStatusFail');
});

/** 引擎状态指示点样式 */
const engineStatusClass = computed(() => {
  if (localModelStore.capability === null) return 'idle';
  return localModelStore.isAvailable ? 'ok' : 'error';
});

/** 检测本地推理引擎能力 */
async function detectLocalEngine() {
  await localModelStore.detectCapability();
  if (localModelStore.isAvailable) {
    showToast('success', t('modelPanel.engineDetected'));
  } else {
    showToast('error', localModelStore.lastError ?? t('modelPanel.engineFail'));
  }
}
</script>

<template>
  <p class="section-hint">
    {{ t('modelPanel.localHint') }}
  </p>

  <!-- 引擎能力检测 -->
  <div class="local-engine-box">
    <div class="local-engine-status">
      <span class="status-dot" :class="engineStatusClass" aria-hidden="true"></span>
      <span>{{ engineStatusText }}</span>
    </div>
    <button
      type="button"
      class="data-mgmt-btn"
      :disabled="localModelStore.isDetecting"
      @click="detectLocalEngine"
    >
      {{ localModelStore.isDetecting ? t('modelPanel.detecting') : t('modelPanel.detectEngine') }}
    </button>
  </div>
  <p v-if="localModelStore.lastError" class="field-error" role="alert">{{ localModelStore.lastError }}</p>
  <p v-if="localModelStore.capability?.webgpuSupported" class="field-hint">
    {{ t('modelPanel.browserInfo', {
      browser: localModelStore.capability.browserName,
      vram: localModelStore.capability.estimatedVramMb ? t('modelPanel.vramSuffix', { vram: localModelStore.capability.estimatedVramMb }) : '',
    }) }}
  </p>

  <!-- 本地模型列表 -->
  <ul v-if="localModelStore.models.length" class="profile-list model-mgmt-list" role="list">
    <li
      v-for="m in localModelStore.models"
      :key="m.id"
      class="profile-item"
      :class="{ 'is-loaded': localModelStore.loadedModelId === m.id }"
    >
      <div class="profile-info">
        <div class="profile-row">
          <span class="profile-name">{{ m.name }}</span>
          <span class="provider-badge" data-provider="local">local</span>
          <span class="size-badge" :data-size="m.size">{{ sizeLabel(m.size) }}</span>
          <span class="status-badge" :data-status="m.status" aria-live="polite">
            {{ localModelStatusLabel(m.id) }}
          </span>
        </div>
        <div class="profile-meta">
          <span class="meta-item"><Icon name="gear" :size="11" /> {{ m.id }}</span>
          <span class="meta-item">{{ t('modelPanel.modelMeta', { download: m.downloadSizeMb, vram: m.vramMb, context: m.contextLength }) }}</span>
        </div>
        <div
          v-if="localModelStore.isLoading && localModelStore.loadProgress?.modelId === m.id"
          class="load-progress"
          aria-live="polite"
        >
          <div class="progress-track">
            <div
              class="progress-fill"
              :style="{ width: `${Math.round(localModelStore.loadProgress.progress * 100)}%` }"
            ></div>
          </div>
          <span class="progress-text">
            {{ t('modelPanel.progressText', { percent: Math.round(localModelStore.loadProgress.progress * 100), phase: localModelStore.loadProgress.phase }) }}
          </span>
        </div>
      </div>
      <div class="profile-actions">
        <button
          v-if="localModelStore.loadedModelId !== m.id"
          type="button"
          class="action-btn"
          :disabled="localModelStore.isLoading || !localModelStore.isAvailable"
          :aria-label="t('modelPanel.loadAria', { name: m.name })"
          @click="handleLoadLocalModel(m.id)"
        >
          <span>{{ localModelStore.isLoading && localModelStore.loadProgress?.modelId === m.id ? t('modelPanel.loading') : t('modelPanel.load') }}</span>
        </button>
        <button
          v-else
          type="button"
          class="action-btn danger"
          :aria-label="t('modelPanel.unloadAria', { name: m.name })"
          @click="handleUnloadLocalModel"
        >
          <span>{{ t('modelPanel.unload') }}</span>
        </button>
        <button
          type="button"
          class="action-btn"
          :aria-label="t('modelPanel.addToConfigAria', { name: m.name })"
          @click="addLocalModelAsProfile(m.id)"
        >
          <span>{{ t('modelPanel.addToConfig') }}</span>
        </button>
      </div>
    </li>
  </ul>
  <p v-else class="empty-hint local-empty">
    {{ t('modelPanel.localModelsEmpty') }}
    <button type="button" class="link-btn" @click="goToLocalModel">{{ t('modelPanel.goToLocalModel') }}</button>
  </p>
</template>

<style scoped>
/* ── 共用基类：从 SettingsModelPanel.vue 复制（scoped 不穿透子组件） ── */
.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

.field-error {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 12px;
  color: var(--destructive);
  margin: 0;
}

.field-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.model-mgmt-list {
  margin-top: 0;
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color .15s ease, background-color .15s ease;
}

.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.provider-badge {
  background: var(--badge-bg);
  color: var(--badge-fg);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  text-transform: lowercase;
}

.profile-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.profile-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--size-control-sm);
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card);
    color: var(--foreground);
  }
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  padding: var(--spacing-md) 0;
  text-align: center;
}

.local-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.local-empty .link-btn {
  appearance: none;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--primary, #4f8cff);
  font-size: 13px;
  padding: 6px var(--spacing-md);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .local-empty .link-btn:hover {
    background: var(--primary-muted, rgba(128, 128, 128, 0.12));
    border-color: var(--primary, #4f8cff);
  }
}

.data-mgmt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  border: 1px solid var(--border);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .data-mgmt-btn:hover:not(:disabled) {
    background: var(--card);
    border-color: var(--secondary);
  }
}

.data-mgmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 本地模型 ── */
.size-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--spacing-sm);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--badge-bg);
  color: var(--badge-fg);
}

.size-badge[data-size='small'] {
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary-text);
}

.size-badge[data-size='medium'] {
  background: color-mix(in srgb, var(--warning-fg, #f59e0b) 16%, transparent);
  color: var(--warning-fg, #f59e0b);
}

.size-badge[data-size='large'] {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 14%, transparent);
  color: var(--tk-red-500, #ef4444);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--spacing-sm);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--badge-bg);
  color: var(--badge-fg);
}

.status-badge[data-status='loaded'] {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary-fg);
}

.status-badge[data-status='loading'],
.status-badge[data-status='downloading'] {
  background: color-mix(in srgb, var(--warning-fg, #f59e0b) 16%, transparent);
  color: var(--warning-fg, #f59e0b);
}

.status-badge[data-status='error'] {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 14%, transparent);
  color: var(--tk-red-500, #ef4444);
}

.profile-item.is-loaded {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.local-engine-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin-bottom: var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.local-engine-status {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 13px;
  color: var(--foreground);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.status-dot.ok {
  background: var(--primary);
}

.status-dot.error {
  background: var(--tk-red-500, #ef4444);
}

.load-progress {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.progress-track {
  flex: 1;
  max-width: 220px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--primary);
  transition: width 0.2s ease;
}

.progress-text {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.action-btn.danger {
  color: var(--tk-red-500, #ef4444);
  border-color: color-mix(in srgb, var(--tk-red-500, #ef4444) 45%, transparent);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--tk-red-500, #ef4444) 12%, transparent);
  }
}
</style>
