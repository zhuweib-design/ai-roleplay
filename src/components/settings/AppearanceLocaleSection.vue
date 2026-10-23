<script setup lang="ts">
/**
 * 设置 → 外观：语言分区（T-13）
 *
 * 从 SettingsAppearancePanel.vue 拆出（R3-1）。拆出的原因是宿主 1894 行触顶
 * 单文件棘轮，而不是这段逻辑本身有问题——所以实现一字未改，只搬位置。
 *
 * 注意 localeOptions 必须是 computed：普通 const 会把当前语言的标签在 setup
 * 那一刻快照住，之后切语言它不动（locale-reactivity 测试就是钉这件事）。
 */
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import { showToast } from '@/utils/toast-service';
import { t, type Locale } from '@/i18n';

const settings = useSettingsStore();

const localeOptions = computed<{ value: Locale; label: string }[]>(() => [
  { value: 'zh', label: t('settings.languageZh') },
  { value: 'en', label: t('settings.languageEn') },
]);

function selectLocale(l: Locale) {
  if (settings.locale === l) return;
  settings.setLocale(l);
  showToast('success', t('common.saveSuccess'));
}
</script>

<template>
  <section class="settings-section" aria-labelledby="locale-section-title">
    <header class="section-header">
      <h2 id="locale-section-title" class="section-title">
        <Icon name="globe" :size="16" />
        <span>{{ t('settings.language') }}</span>
      </h2>
      <p class="section-hint">{{ t('settings.languageDesc') }}</p>
    </header>

    <div class="fontsize-grid" role="radiogroup" :aria-label="t('settings.language')">
      <button
        v-for="opt in localeOptions"
        :key="opt.value"
        type="button"
        class="fontsize-card"
        :class="{ active: settings.locale === opt.value }"
        role="radio"
        :aria-checked="settings.locale === opt.value"
        :tabindex="settings.locale === opt.value ? 0 : -1"
        @click="selectLocale(opt.value)"
      >
        <span class="fontsize-value">{{ opt.label }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* 基础分区骨架。scoped 到不了子组件内部，所以每个 section 组件各带一份
   （与 R2-4 市场页拆分同一处理方式，css-equiv 只把重复记成"多出"）。 */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  gap: 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

/* 语言选择复用字号的卡片网格：两处都是"少量互斥选项平铺" */
.fontsize-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.fontsize-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
  transition: border-color .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .fontsize-card:hover {
    border-color: var(--secondary);
  }
}

.fontsize-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.fontsize-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.fontsize-value {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
}

@media (max-width: 640px) {
  .settings-section {
    padding: 14px;
  }
  .fontsize-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fontsize-card {
    transition: none;
  }
}
</style>
