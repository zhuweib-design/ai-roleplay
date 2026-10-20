<script setup lang="ts">
/**
 * 设置 → 外观：主题选择 + 自定义主题编辑器（F08.4）
 *
 * 从 SettingsAppearancePanel.vue 拆出（R3-1），逻辑与样式逐字搬运。
 * 自定义主题那条链路（选图 → 取色 → 生成 token → 对比度审计）全在本文件内，
 * 与宿主的其它分区没有共享状态，所以是干净的切面。
 */
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import type { CustomTheme, ThemeName } from '@/types';
import { auditThemeContrast, extractPaletteFromImage, generateThemeTokens } from '@/core/theme-extractor';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();

interface ThemeOption {
  value: ThemeName;
  label: string;
  description: string;
  swatchClass: string;
}

const themeOptions = computed<ThemeOption[]>(() => [
  {
    value: 'dark',
    label: t('settingsView.themeDark'),
    description: t('settingsView.themeDarkDesc'),
    swatchClass: 'swatch-dark',
  },
  {
    value: 'light',
    label: t('settingsView.themeLight'),
    description: t('settingsView.themeLightDesc'),
    swatchClass: 'swatch-light',
  },
  {
    value: 'midnight',
    label: t('settingsView.themeMidnight'),
    description: t('settingsView.themeMidnightDesc'),
    swatchClass: 'swatch-midnight',
  },
  {
    value: 'oled',
    label: t('settingsView.themeOled'),
    description: t('settingsView.themeOledDesc'),
    swatchClass: 'swatch-oled',
  },
  {
    value: 'theatre',
    label: t('settingsView.themeTheatre'),
    description: t('settingsView.themeTheatreDesc'),
    swatchClass: 'swatch-theatre',
  },
  {
    value: 'terminal',
    label: t('settingsView.themeTerminal'),
    description: t('settingsView.themeTerminalDesc'),
    swatchClass: 'swatch-terminal',
  },
  {
    value: 'aurora',
    label: t('settingsView.themeAurora'),
    description: t('settingsView.themeAuroraDesc'),
    swatchClass: 'swatch-aurora',
  },
  {
    value: 'ink',
    label: t('settingsView.themeInk'),
    description: t('settingsView.themeInkDesc'),
    swatchClass: 'swatch-ink',
  },
  {
    value: 'brutal',
    label: t('settingsView.themeBrutal'),
    description: t('settingsView.themeBrutalDesc'),
    swatchClass: 'swatch-brutal',
  },
  {
    value: 'custom',
    label: t('settingsView.themeCustom'),
    description: t('settingsView.themeCustomDesc'),
    swatchClass: 'swatch-custom',
  },
]);

function selectTheme(themeName: ThemeName) {
  // 自定义主题：无自定义数据时打开编辑器，否则直接应用
  if (themeName === 'custom') {
    if (!settings.customTheme) {
      customPanelOpen.value = true;
      showToast('info', t('settingsView.customThemeNeedUpload'));
      return;
    }
    settings.setTheme('custom');
    showToast('success', t('settingsView.themeChanged', { name: t('settingsView.themeCustom') }));
    return;
  }
  settings.setTheme(themeName);
  showToast('success', t('settingsView.themeChanged', { name: themeOptions.value.find((x) => x.value === themeName)?.label ?? themeName }));
}

function handleThemeKeydown(e: KeyboardEvent, currentIndex: number): void {
  const len = themeOptions.value.length;
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
    selectTheme(themeOptions.value[nextIndex]!.value);
    // 将焦点移到新选中的按钮
    void nextTick(() => {
      const target = document.querySelector<HTMLElement>(
        `.theme-card[data-value="${themeOptions.value[nextIndex!]!.value}"]`
      );
      target?.focus();
    });
  }
}

const customPanelOpen = ref(false);

const customThemeBgInput = useTemplateRef<HTMLInputElement>('customThemeBgInput');

const customThemeBusy = ref(false);

const customThemeCapture = ref<'environment' | undefined>(undefined);

const customThemePalette = ref<string[]>([]);

const customThemePreview = ref<string | null>(null);

const customThemeResult = ref<CustomTheme | null>(null);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t('settingsView.fileReadFailed')));
    reader.readAsDataURL(file);
  });
}

function openCustomThemePicker(mode: 'camera' | 'album') {
  customThemeCapture.value = mode === 'camera' ? 'environment' : undefined;
  void nextTick(() => customThemeBgInput.value?.click());
}

async function handleCustomThemeFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  // 限制 5MB
  if (file.size > 5 * 1024 * 1024) {
    showToast('error', t('settingsView.bgTooLarge'));
    input.value = '';
    return;
  }
  customThemeBusy.value = true;
  customThemePreview.value = null;
  customThemePalette.value = [];
  customThemeResult.value = null;
  try {
    // 1. 读取为 data URL
    const dataUrl = await fileToDataUrl(file);
    customThemePreview.value = dataUrl;
    // 3. 生成主题变量
    const palette = await extractPaletteFromImage(dataUrl);
    customThemePalette.value = palette.colors;
    const tokens = generateThemeTokens(palette);
    // 4. 构建 CustomTheme 对象
    const ct: CustomTheme = {
      background: dataUrl,
      palette: palette.colors,
      paletteRatios: palette.ratios,
      avgLuminance: palette.avgLuminance,
      tokens,
    };
    customThemeResult.value = ct;
    showToast('success', t('settingsView.customThemeExtracted', { count: palette.colors.length }));
  } catch (err) {
    showToast('error', t('settingsView.customThemeExtractFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    customThemeBusy.value = false;
    input.value = '';
  }
}

function applyCustomTheme() {
  if (!customThemeResult.value) {
    showToast('error', t('settingsView.customThemeNoData'));
    return;
  }
  const issues = auditThemeContrast(customThemeResult.value.tokens);
  if (issues.length > 0) {
    showToast('error', t('settingsView.customThemeContrastFailed', { count: issues.length }));
    return;
  }
  settings.setCustomTheme(customThemeResult.value);
  customPanelOpen.value = false;
  showToast('success', t('settingsView.themeChanged', { name: t('settingsView.themeCustom') }));
}

function clearCustomTheme() {
  settings.clearCustomTheme();
  customThemeResult.value = null;
  customThemePreview.value = null;
  customThemePalette.value = [];
  if (settings.theme === 'custom') {
    settings.setTheme('dark');
  }
  showToast('info', t('settingsView.customThemeCleared'));
}
</script>

<template>
  <section class="settings-section" aria-labelledby="theme-section-title">
    <header class="section-header">
      <h2 id="theme-section-title" class="section-title">
        <Icon name="palette" :size="16" />
        <span>{{ t('settingsView.themeSection') }}</span>
      </h2>
      <p class="section-hint">{{ t('settingsView.themeHint') }}</p>
    </header>

    <div class="theme-grid" role="radiogroup" :aria-label="t('settingsView.themeAria')">
      <button
        v-for="(opt, idx) in themeOptions"
        :key="opt.value"
        type="button"
        class="theme-card"
        :class="{ active: settings.theme === opt.value }"
        :data-value="opt.value"
        role="radio"
        :aria-checked="settings.theme === opt.value"
        :tabindex="settings.theme === opt.value ? 0 : -1"
        :aria-label="`${opt.label}：${opt.description}`"
        @click="selectTheme(opt.value)"
        @keydown="handleThemeKeydown($event, idx)"
      >
        <span class="theme-swatch" :class="opt.swatchClass" aria-hidden="true"></span>
        <span class="theme-info">
          <span class="theme-name">{{ opt.label }}</span>
          <span class="theme-desc">{{ opt.description }}</span>
        </span>
        <Icon
          v-if="settings.theme === opt.value"
          name="check"
          :size="16"
          class="theme-check"
          aria-hidden="true"
        />
      </button>
    </div>

    <!-- F08.4 自定义主题编辑器 -->
    <div v-show="customPanelOpen || settings.customTheme" class="custom-theme-editor">
      <div class="custom-theme-actions">
        <button type="button" class="data-mgmt-btn primary" @click="openCustomThemePicker('camera')" :disabled="customThemeBusy">
          <span>{{ t('picker.camera') }}</span>
        </button>
        <button type="button" class="data-mgmt-btn primary" @click="openCustomThemePicker('album')" :disabled="customThemeBusy">
          <Icon name="image" :size="14" />
          <span>{{ t('picker.album') }}</span>
        </button>
        <button
          v-if="settings.customTheme"
          type="button"
          class="data-mgmt-btn"
          @click="clearCustomTheme"
        >
          <Icon name="trash-2" :size="14" />
          <span>{{ t('settingsView.customThemeClear') }}</span>
        </button>
        <input
          ref="customThemeBgInput"
          type="file"
          accept="image/*"
          :capture="customThemeCapture"
          class="hidden-file-input"
          :aria-label="t('settingsView.customThemeUploadAria')"
          @change="handleCustomThemeFileSelected"
        />
      </div>

      <!-- 预览与色板 -->
      <div v-if="customThemePreview || settings.customTheme" class="custom-theme-preview-wrap">
        <div
          class="custom-theme-preview"
          :style="{ backgroundImage: `url(${customThemePreview ?? settings.customTheme?.background})` }"
          :aria-label="t('settingsView.customThemePreviewAria')"
        ></div>
        <div class="custom-theme-palette" role="list" :aria-label="t('settingsView.customThemePaletteAria')">
          <div
            v-for="(color, idx) in (customThemePalette.length ? customThemePalette : settings.customTheme?.palette ?? [])"
            :key="color"
            class="palette-swatch"
            role="listitem"
            :style="{ background: color }"
            v-tip="`${color} · ${Math.round((settings.customTheme?.paletteRatios[idx] ?? 0) * 100)}%`"
          >
            <span class="palette-hex">{{ color }}</span>
          </div>
        </div>
      </div>

      <!-- 应用按钮（新提取时才显示） -->
      <div v-if="customThemeResult" class="custom-theme-actions">
        <button type="button" class="data-mgmt-btn primary" @click="applyCustomTheme">
          <Icon name="check" :size="14" />
          <span>{{ t('settingsView.customThemeApply') }}</span>
        </button>
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

/* ── 主题选择 ── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .theme-card:hover {
    border-color: var(--secondary);
  }
}

.theme-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.theme-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.theme-swatch {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

/* 每张卡片的预览色。这组规则原先只在 SettingsModelPanel.vue 里定义，
   而卡片渲染在本组件 ⇒ scoped 样式跨不过去，六张卡的色块实测是透明的
   （`getComputedStyle('.theme-swatch').backgroundImage === 'none'`）。搬进来才生效。 */
.swatch-dark {
  background: linear-gradient(135deg, #0b0b10, #161823);
}

.swatch-light {
  background: linear-gradient(135deg, #f7f8fa, #ffffff);
}

.swatch-midnight {
  background: linear-gradient(135deg, #0a0e27, #1a2048);
}

.swatch-oled {
  background: linear-gradient(135deg, #000000, #141414);
}

.swatch-theatre {
  background: linear-gradient(135deg, #0c0a09, #201a12);
}

.swatch-terminal {
  background: linear-gradient(135deg, #05070a, #38f2c8);
}

.swatch-aurora {
  background: linear-gradient(135deg, #0a0b14, #8b7cf6);
}

.swatch-ink {
  background: linear-gradient(135deg, #f4f1ea, #b23a2f);
}

/* 新粗野：硬切三段（米纸 / 亮粉 / 电光蓝），不用柔化渐变——这套的形状语言就是直角硬边 */
.swatch-brutal {
  background: linear-gradient(135deg, #efe9dc 0 50%, #ff5c8a 50% 75%, #2b5bff 75% 100%);
  border: 2px solid #111111;
}

.swatch-custom {
  background: repeating-conic-gradient(#4b5563 0% 25%, #9ca3af 0% 50%) 50% / 8px 8px;
}

/* F08.4 自定义主题编辑器 */
.custom-theme-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  margin-top: 12px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.custom-theme-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.custom-theme-preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.custom-theme-preview {
  height: 120px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background-size: cover;
  background-position: center;
}

.custom-theme-palette {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.palette-swatch {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  cursor: default;
}

.palette-hex {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 3px;
  font-family: var(--font-mono);
  font-size: 8px;
  text-align: center;
  color: var(--on-media);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  white-space: nowrap;
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.theme-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.theme-desc {
  font-size: 11px;
  color: var(--muted-foreground);
}

.theme-check {
  color: var(--secondary-text);
  flex-shrink: 0;
}

/* 自定义主题编辑器里的按钮与隐藏文件域：同源样式在宿主与本文件各留一份，
   因为 scoped 规则到不了对方内部 */
.data-mgmt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .data-mgmt-btn:hover:not(:disabled) {
    background: var(--card-elevated);
    border-color: var(--tk-cyan-500);
  }
}

.data-mgmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .settings-section {
    padding: 14px;
  }
  .theme-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .theme-card {
    transition: none;
  }
}
</style>
