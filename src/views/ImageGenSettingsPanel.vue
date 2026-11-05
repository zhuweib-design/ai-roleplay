<script setup lang="ts">
/**
 * ImageGenSettingsPanel — 图像生成「设置」tab 面板
 *
 * 从 ImageGeneratorView.vue 拆出（R3-6）。本页的 Provider 配置（随设置一起持久化），
 * 以及「从设置侧图像/视频 Profile 一键填入」的入口。
 *
 * 主密码未解锁时 Profile 的 apiKey 仍是密文，直接抄过来会得到一个
 * "看起来有值其实不能用"的密钥，因此那种情况只填端点与模型并说明原因。
 */
import { computed } from 'vue';
import { useImageGenerationStore } from '@/stores/image-generation';
import { useSettingsStore } from '@/stores/settings';
import { isEncrypted } from '@core/api-key-crypto';
import type { ProviderType } from '@/core/image-generation';
import { t } from '@/i18n';

const store = useImageGenerationStore();
const settingsStore = useSettingsStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
  'go-settings': [];
}>();

// ── Provider 类型选项 ──
const providerTypeOptions: Array<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: t('imgGen.providerOpenai') },
  { value: 'custom', label: t('imgGen.providerCustom') },
];

/** 设置侧「图像/视频」分类的主要 Profile（与设置页同一判定源 getPrimaryModel） */
const imageVideoPrimary = computed(() => settingsStore.getPrimaryModel('image-video'));

/**
 * 一键把设置侧的 Profile 填进本页配置。
 * 主密码未解锁时 Profile 的 apiKey 仍是密文，直接抄过来会得到一个"看起来有值其实不能用"的密钥，
 * 因此这种情况只填端点与模型，并说明原因。
 */
function useImageVideoProfile(): void {
  const p = imageVideoPrimary.value;
  if (!p) return;
  const patch: Partial<typeof store.providerConfig> = {
    endpoint: p.baseUrl,
    model: p.model,
    enabled: true,
  };
  if (p.apiKey && !isEncrypted(p.apiKey)) {
    patch.apiKey = p.apiKey;
  } else {
    emit('notify', t('imgGen.profileKeyLocked'), 'info');
  }
  store.updateProviderConfig(patch);
}

function goToSettings() {
  emit('go-settings');
}
</script>

<template>
  <section
    id="panel-settings"
    role="tabpanel"
    aria-labelledby="tab-settings"
    class="panel"
  >
    <div class="settings-form">
      <!-- E22：两处配置的关系首次说明清楚，并给一个"从模型接入填入"的去路 -->
      <div class="provider-source">
        <p class="provider-source-text">{{ t('imgGen.configPersistedNote') }}</p>
        <div class="provider-source-actions">
          <button
            v-if="imageVideoPrimary"
            type="button"
            class="config-warning-btn"
            data-rel-jump="imggen-use-model-profile"
            @click="useImageVideoProfile"
          >
            {{ t('imgGen.fillFromProfile', { name: imageVideoPrimary.name }) }}
          </button>
          <button
            type="button"
            class="config-warning-btn"
            data-rel-jump="imggen-go-settings"
            @click="goToSettings"
          >
            {{ t('imgGen.goToModelSettings') }}
          </button>
        </div>
      </div>

      <div class="form-group">
        <label for="provider-type" class="form-label">{{ t('imgGen.providerType') }}</label>
        <select
          id="provider-type"
          :value="store.providerConfig.type"
          class="form-select"
          @change="store.updateProviderConfig({ type: ($event.target as HTMLSelectElement).value as ProviderType })"
        >
          <option v-for="opt in providerTypeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="endpoint" class="form-label">{{ t('imgGen.endpoint') }}</label>
        <input
          id="endpoint"
          type="url"
          :value="store.providerConfig.endpoint"
          class="form-input"
          placeholder="https://api.openai.com/v1"
          @input="store.updateProviderConfig({ endpoint: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="form-group">
        <label for="api-key" class="form-label">{{ t('imgGen.apiKey') }}</label>
        <input
          id="api-key"
          type="password"
          :value="store.providerConfig.apiKey"
          class="form-input"
          placeholder="sk-..."
          autocomplete="off"
          @input="store.updateProviderConfig({ apiKey: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div class="form-group">
        <label for="model" class="form-label">{{ t('imgGen.model') }}</label>
        <input
          id="model"
          type="text"
          :value="store.providerConfig.model"
          class="form-input"
          placeholder="dall-e-3"
          @input="store.updateProviderConfig({ model: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <label class="setting-row">
        <input
          type="checkbox"
          :checked="store.providerConfig.enabled"
          @change="store.updateProviderConfig({ enabled: ($event.target as HTMLInputElement).checked })"
        />
        <span>{{ t('imgGen.enableProvider') }}</span>
      </label>
    </div>
  </section>
</template>

<style scoped>
/* 设置表单 */
.provider-source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
  margin-bottom: 16px;
}

.provider-source-text {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.provider-source-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 500px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}
</style>
