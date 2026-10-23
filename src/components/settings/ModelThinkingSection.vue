<script setup lang="ts">
/**
 * ModelThinkingSection — P0-1 思维链偏好（全局；剥离开关 + 默认折叠）
 *
 * R1-4 从 SettingsModelPanel（原 2544 行）拆出。两个开关改动即持久化，
 * 不经过父级：它们是全局偏好，父级没有任何决策要做。
 */
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

const settings = useSettingsStore();

const stripFromHistory = ref(settings.thinkingConfig?.stripFromHistory !== false);
const defaultCollapsed = ref(settings.thinkingConfig?.defaultCollapsed !== false);

function onThinkingPrefChange(): void {
  settings.setThinkingConfig({
    stripFromHistory: stripFromHistory.value,
    defaultCollapsed: defaultCollapsed.value,
  });
  void settings.persistSettings();
}
</script>

<template>
  <section class="settings-section" aria-labelledby="thinking-prefs-title">
    <header class="section-header">
      <h2 id="thinking-prefs-title" class="section-title">
        <Icon name="brain" :size="16" />
        <span>{{ t('settings.thinkingTitle') }}</span>
      </h2>
    </header>

    <label class="pref-row">
      <span class="pref-text">
        <span class="pref-label">{{ t('settings.thinkingStripHistory') }}</span>
        <span class="pref-desc">{{ t('settings.thinkingStripHistoryDesc') }}</span>
      </span>
      <input
        v-model="stripFromHistory"
        type="checkbox"
        class="pref-checkbox"
        :aria-label="t('settings.thinkingStripHistory')"
        @change="onThinkingPrefChange"
      />
    </label>

    <label class="pref-row">
      <span class="pref-text">
        <span class="pref-label">{{ t('settings.thinkingDefaultCollapsed') }}</span>
        <span class="pref-desc">{{ t('settings.thinkingDefaultCollapsedDesc') }}</span>
      </span>
      <input
        v-model="defaultCollapsed"
        type="checkbox"
        class="pref-checkbox"
        :aria-label="t('settings.thinkingDefaultCollapsed')"
        @change="onThinkingPrefChange"
      />
    </label>
  </section>
</template>

<style scoped>
/* ── 标准 section 容器（从 SettingsModelPanel.vue 复制，因 scoped 不穿透子组件） ── */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

/* P0-1：思维链偏好行 */
.pref-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
  border-top: 1px solid var(--border);
  cursor: pointer;
}

.pref-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.pref-label {
  font-size: 13px;
  color: var(--foreground);
}

.pref-desc {
  font-size: 11px;
  line-height: 1.55;
  color: var(--muted-foreground);
}

.pref-checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--secondary);
  cursor: pointer;
}

.pref-checkbox:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}
</style>
