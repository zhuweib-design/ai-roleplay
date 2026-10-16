<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';;

const settings = useSettingsStore();


</script>

<template>
    <div>
    <!-- F12 扩展系统配置 -->
    <section class="settings-section" aria-labelledby="extensions-section-title">
      <header class="section-header">
        <h2 id="extensions-section-title" class="section-title">
          <Icon name="star" :size="16" />
          <span>{{ t('settingsView.extensionSection') }}</span>
        </h2>
      </header>

      <p class="extension-security-note" role="note">
        {{ t('settingsView.extensionDesc') }}
      </p>

      <!-- F12.2 TTS 语音朗读 -->
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.ttsTitle') }}</h3>
        <label class="form-row">
          <input
            type="checkbox"
            :checked="settings.ttsConfig.enabled"
            @change="settings.setTtsConfig({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('settingsView.ttsEnable') }}</span>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.ttsTrigger') }}</span>
          <select
            :value="settings.ttsConfig.trigger"
            @change="settings.setTtsConfig({ trigger: ($event.target as HTMLSelectElement).value as 'every' | 'manual' | 'mention' })"
          >
            <option value="manual">{{ t('settingsView.ttsManual') }}</option>
            <option value="every">{{ t('settingsView.ttsEvery') }}</option>
            <option value="mention">{{ t('settingsView.ttsMention') }}</option>
          </select>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.ttsRate', { value: settings.ttsConfig.rate.toFixed(1) }) }}</span>
          <input
            v-range
            type="range"
            class="tk-range"
            min="0.5"
            max="2"
            step="0.1"
            :value="settings.ttsConfig.rate"
            @input="settings.setTtsConfig({ rate: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.ttsPitch', { value: settings.ttsConfig.pitch.toFixed(1) }) }}</span>
          <input
            v-range
            type="range"
            class="tk-range"
            min="0"
            max="2"
            step="0.1"
            :value="settings.ttsConfig.pitch"
            @input="settings.setTtsConfig({ pitch: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <p class="hint-text">
          {{ t('settingsView.ttsNote') }}
        </p>
      </div>

      <!-- F12.3 消息翻译 -->
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.translateTitle') }}</h3>
        <label class="form-row">
          <input
            type="checkbox"
            :checked="settings.translationConfig.enabled"
            @change="settings.setTranslationConfig({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('settingsView.translateEnable') }}</span>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.translateService') }}</span>
          <select
            :value="settings.translationConfig.provider"
            @change="settings.setTranslationConfig({ provider: ($event.target as HTMLSelectElement).value as 'google' | 'deepl' | 'none' })"
          >
            <option value="none">{{ t('settingsView.translateNone') }}</option>
            <option value="google">Google Translate</option>
            <option value="deepl">DeepL</option>
          </select>
        </label>
        <label class="form-row">
          <span>API Key</span>
          <input
            type="password"
            :value="settings.translationConfig.apiKey"
            :placeholder="t('settingsView.translateApiKeyPlaceholder')"
            @input="settings.setTranslationConfig({ apiKey: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.translateDirection') }}</span>
          <select
            :value="settings.translationConfig.direction"
            @change="settings.setTranslationConfig({ direction: ($event.target as HTMLSelectElement).value as 'zh-to-en' | 'en-to-zh' | 'auto' })"
          >
            <option value="auto">{{ t('settingsView.translateAuto') }}</option>
            <option value="zh-to-en">{{ t('settingsView.translateZhToEn') }}</option>
            <option value="en-to-zh">{{ t('settingsView.translateEnToZh') }}</option>
          </select>
        </label>
        <p class="hint-text">
          {{ t('settingsView.translateNote') }}
        </p>
      </div>

      <!-- F12.4 自动摘要 -->
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.summaryTitle') }}</h3>
        <label class="form-row">
          <input
            type="checkbox"
            :checked="settings.summarizationConfig.enabled"
            @change="settings.setSummarizationConfig({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('settingsView.summaryEnable') }}</span>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.summaryThreshold') }}</span>
          <input
            type="number"
            min="1000"
            max="20000"
            step="500"
            :value="settings.summarizationConfig.threshold"
            @input="settings.setSummarizationConfig({ threshold: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.summaryKeepRecent') }}</span>
          <input
            type="number"
            min="2"
            max="50"
            step="1"
            :value="settings.summarizationConfig.keepRecent"
            @input="settings.setSummarizationConfig({ keepRecent: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.summaryMaxToken') }}</span>
          <input
            type="number"
            min="100"
            max="2000"
            step="100"
            :value="settings.summarizationConfig.maxSummaryTokens"
            @input="settings.setSummarizationConfig({ maxSummaryTokens: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <p class="hint-text">
          {{ t('settingsView.summaryHint') }}
        </p>
      </div>
    </section>
</div>
</template>

<style scoped>

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack-lg);
  padding: var(--space-5);
  background: var(--card);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-inline-md);
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--gap-inline-sm);
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

/* ── 响应式 ── */
@media (max-width: 640px) {
  .settings-view {
    padding: 16px;
  }
  .settings-section {
    padding: 14px;
  }
  .theme-grid {
    grid-template-columns: 1fr;
  }
  .fontsize-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .profile-item {
    flex-direction: column;
    align-items: stretch;
  }
  .profile-actions {
    flex-wrap: wrap;
  }
  .action-btn {
    flex: 1;
    min-width: 0;
  }
  .meta-url {
    max-width: 100%;
  }
}

/* F12 扩展功能配置区块 */
.extension-security-note {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  /* 1.6 不在行高阶（1.2 / 1.35 / 1.5 / 1.7）上，留字面量并登记进尺度缺口 */
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--surface-secondary);
}
.extension-block {
  padding: var(--space-4);
  margin-bottom: var(--space-3);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
}

.extension-title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--foreground);
}

.extension-block .form-row {
  display: flex;
  align-items: center;
  gap: var(--gap-inline-md);
  margin-bottom: var(--space-2-5);
  font-size: var(--font-size-sm);
  color: var(--foreground);
}

.extension-block .form-row > span {
  min-width: 100px;
  color: var(--muted-foreground);
}

.extension-block .form-row input[type='checkbox'] {
  margin: 0;
}

.extension-block .form-row input[type='range'] {
  flex: 1;
  max-width: 200px;
}

.extension-block .form-row input[type='number'],
.extension-block .form-row input[type='password'],
.extension-block .form-row select {
  flex: 1;
  max-width: 240px;
  padding: var(--space-1-5) var(--space-2-5);
  font-size: var(--font-size-sm);
  background: var(--background);
  color: var(--foreground);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-sm);
}

.extension-block .hint-text {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-xs);
  color: var(--muted-foreground);
  line-height: var(--line-height-normal);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input,
  .form-textarea,
  .custom-css-textarea,
  .data-mgmt-select,
  .extension-block .form-row input[type='number'],
  .extension-block .form-row input[type='password'],
  .extension-block .form-row select,
  .profile-input {
    font-size: 16px;
  }
}
</style>
