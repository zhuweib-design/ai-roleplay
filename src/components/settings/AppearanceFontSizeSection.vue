<script setup lang="ts">
/**
 * 设置 → 外观：字号选择 + 实时预览
 *
 * 从 SettingsAppearancePanel.vue 拆出（R3-1），逻辑与样式逐字搬运。
 * 键盘导航（方向键 / Home / End 在 radiogroup 内移动并转移焦点）是本段的
 * 无障碍要点，拆的时候连同 handleFontSizeKeydown 一起搬，没有改判据。
 */
import { computed, nextTick } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import { FONT_SIZE_PRESETS } from '@/types';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();

interface FontSizeOption {
  value: number;
  label: string;
  sample: string;
}

const fontSizeOptions = computed<FontSizeOption[]>(() =>
  FONT_SIZE_PRESETS.map((size) => ({
    value: size,
    label: size === 12 ? t('settingsView.fontSmall') : size === 14 ? t('settingsView.fontDefault') : size === 16 ? t('settingsView.fontLarge') : t('settingsView.fontXLarge'),
    sample: t('settingsView.fontSample'),
  }))
);

const previewFontPx = computed(() => `${settings.fontSize}px`);

function selectFontSize(size: number) {
  settings.setFontSize(size);
  showToast('success', t('settingsView.fontChanged', { size }));
}

function handleFontSizeKeydown(e: KeyboardEvent, currentIndex: number): void {
  const len = fontSizeOptions.value.length;
  let nextIndex: number | null = null;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + len) % len;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % len;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = len - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  if (nextIndex !== null) {
    selectFontSize(fontSizeOptions.value[nextIndex]!.value);
    void nextTick(() => {
      const target = document.querySelector<HTMLElement>(
        `.fontsize-card[data-value="${fontSizeOptions.value[nextIndex!]!.value}"]`
      );
      target?.focus();
    });
  }
}
</script>

<template>
  <section class="settings-section" aria-labelledby="fontsize-section-title">
    <header class="section-header">
      <h2 id="fontsize-section-title" class="section-title">
        <Icon name="type-size" :size="16" />
        <span>{{ t('settingsView.fontSection') }}</span>
      </h2>
      <p class="section-hint">{{ t('settingsView.fontHint') }}</p>
    </header>

    <div class="fontsize-grid" role="radiogroup" :aria-label="t('settingsView.fontAria')">
      <button
        v-for="(opt, idx) in fontSizeOptions"
        :key="opt.value"
        type="button"
        class="fontsize-card"
        :class="{ active: settings.fontSize === opt.value }"
        :data-value="opt.value"
        role="radio"
        :aria-checked="settings.fontSize === opt.value"
        :tabindex="settings.fontSize === opt.value ? 0 : -1"
        :aria-label="`${opt.label}（${opt.value}px）`"
        @click="selectFontSize(opt.value)"
        @keydown="handleFontSizeKeydown($event, idx)"
      >
        <span class="fontsize-label">{{ opt.label }}</span>
        <span class="fontsize-value">{{ opt.value }}px</span>
        <span
          class="fontsize-sample"
          :style="{ fontSize: `${opt.value}px` }"
        >{{ opt.sample }}</span>
      </button>
    </div>

    <!-- 实时预览 -->
    <div class="font-preview" :aria-label="t('settingsView.previewAria')">
      <p class="preview-label">{{ t('settingsView.previewLabel', { size: settings.fontSize }) }}</p>
      <div class="preview-box" :style="{ fontSize: previewFontPx }">
        <p class="preview-line"><strong>{{ t('settingsView.previewCharName') }}</strong>：{{ t('settingsView.previewWelcome') }}</p>
        <p class="preview-line muted">{{ t('settingsView.previewSample', { size: settings.fontSize }) }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
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

/* ── 字号选择 ── */
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

.fontsize-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground);
}

.fontsize-value {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
}

.fontsize-sample {
  color: var(--muted-foreground);
  line-height: 1.3;
  margin-top: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.preview-label {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

.preview-box {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  line-height: 1.6;
}

.preview-line {
  margin: 0;
}

.preview-line.muted {
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
