<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import type { ChatBackground, BubbleStyle } from '@/types';
import type { CustomTheme } from '@/types';
import type { ThemeName } from '@/types';
import { FONT_SIZE_PRESETS } from '@/types';
import { auditThemeContrast, extractPaletteFromImage, generateThemeTokens } from '@/core/theme-extractor';
import { ref, computed, nextTick, useTemplateRef } from 'vue';;;
import { showToast } from '@/utils/toast-service';
import { t, type Locale } from '@/i18n';

const settings = useSettingsStore();

interface FontSizeOption {
  value: number;
  label: string;
  sample: string;}

interface ThemeOption {
  value: ThemeName;
  label: string;
  description: string;
  swatchClass: string;
}

function applyBackground() {
  const bg: ChatBackground = {
    type: bgType.value,
    value: bgValue.value,
    opacity: bgOpacity.value,
    blur: bgBlur.value,
  };
  settings.setChatBackground(bg);
  showToast('success', t('settingsView.bgApplied'));
}

function applyBubbleStyle() {
  const style: BubbleStyle = {
    radius: bubbleRadius.value,
    opacity: bubbleOpacity.value,
  };
  settings.setBubbleStyle(style);
  showToast('success', t('settingsView.bubbleApplied'));
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

const bgBlur = ref<number>(settings.chatBackground.blur);

const bgCapture = ref<'environment' | undefined>(undefined);

const bgFileInput = useTemplateRef<HTMLInputElement>('bgFileInput');

const bgOpacity = ref<number>(settings.chatBackground.opacity);

const bgPreviewStyle = computed(() => {
  if (bgType.value === 'none' || !bgValue.value) {
    return { background: 'var(--video-bg)' };
  }
  return {
    backgroundImage: `url(${bgValue.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

const bgType = ref<'none' | 'url' | 'base64'>(settings.chatBackground.type);

const bgValue = ref<string>(settings.chatBackground.value);

const bubbleOpacity = ref<number>(settings.bubbleStyle.opacity);

const bubbleRadius = ref<number>(settings.bubbleStyle.radius);

function clearBackground() {
  bgType.value = 'none';
  bgValue.value = '';
  bgOpacity.value = 1;
  bgBlur.value = 0;
  settings.setChatBackground({ type: 'none', value: '', opacity: 1, blur: 0 });
  showToast('info', t('settingsView.bgCleared'));
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

const customCssDraft = ref<string>(settings.customCss);

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

const fontSizeOptions = computed<FontSizeOption[]>(() =>
  FONT_SIZE_PRESETS.map((size) => ({
    value: size,
    label: size === 12 ? t('settingsView.fontSmall') : size === 14 ? t('settingsView.fontDefault') : size === 16 ? t('settingsView.fontLarge') : t('settingsView.fontXLarge'),
    sample: t('settingsView.fontSample'),
  }))
);

async function handleBgFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  // 限制 5MB
  if (file.size > 5 * 1024 * 1024) {
    showToast('error', t('settingsView.bgTooLarge'));
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    bgType.value = 'base64';
    bgValue.value = String(reader.result);
    input.value = '';
  };
  reader.onerror = () => showToast('error', t('settingsView.fileReadFailed'));
  reader.readAsDataURL(file);
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

const localeOptions: { value: Locale; label: string }[] = [
  { value: 'zh', label: t('settings.languageZh') },
  { value: 'en', label: t('settings.languageEn') },
];

function openBgPicker(mode: 'camera' | 'album') {
  bgCapture.value = mode === 'camera' ? 'environment' : undefined;
  void nextTick(() => bgFileInput.value?.click());
}

function openCustomThemePicker(mode: 'camera' | 'album') {
  customThemeCapture.value = mode === 'camera' ? 'environment' : undefined;
  void nextTick(() => customThemeBgInput.value?.click());
}

const previewFontPx = computed(() => `${settings.fontSize}px`);

function resetCustomCss() {
  customCssDraft.value = '';
  settings.resetCustomCss();
  showToast('info', t('settingsView.cssReset'));
}

function saveCustomCss() {
  settings.setCustomCss(customCssDraft.value);
  showToast('success', t('settingsView.cssSaved'));
}

function selectFontSize(size: number) {
  settings.setFontSize(size);
  showToast('success', t('settingsView.fontChanged', { size }));
}

function selectLocale(l: Locale) {
  if (settings.locale === l) return;
  settings.setLocale(l);
  showToast('success', t('common.saveSuccess'));
}

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
    value: 'custom',
    label: t('settingsView.themeCustom'),
    description: t('settingsView.themeCustomDesc'),
    swatchClass: 'swatch-custom',
  },
]);
</script>

<template>
    <div>
    <!-- T-13: 语言选择 -->
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

    <!-- 主题选择 -->
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
              :title="`${color} · ${Math.round((settings.customTheme?.paletteRatios[idx] ?? 0) * 100)}%`"
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

    <!-- 字号选择 -->
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

    <!-- F08 UI 自定义（聊天背景 + 气泡样式 + 自定义 CSS） -->
    <section class="settings-section" aria-labelledby="ui-custom-section-title">
      <header class="section-header">
        <h2 id="ui-custom-section-title" class="section-title">
          <Icon name="image" :size="16" />
          <span>{{ t('settingsView.uiCustomSection') }}</span>
        </h2>
      </header>

      <!-- F08.2 聊天背景 -->
      <div class="ui-custom-block">
        <h3 class="ui-custom-subtitle">{{ t('settingsView.bgSubtitle') }}</h3>
        <p class="ui-custom-hint">{{ t('settingsView.bgHint') }}</p>

        <div class="bg-source-tabs" role="radiogroup" :aria-label="t('settingsView.bgSourceAria')">
          <button
            type="button"
            class="bg-source-tab"
            role="radio"
            :aria-checked="bgType === 'none'"
            :class="{ active: bgType === 'none' }"
            @click="bgType = 'none'; bgValue = ''"
          >
{{ t('settingsView.bgNone') }}
</button>
          <button
            type="button"
            class="bg-source-tab"
            role="radio"
            :aria-checked="bgType === 'url'"
            :class="{ active: bgType === 'url' }"
            @click="bgType = 'url'"
          >
URL
</button>
          <button
            type="button"
            class="bg-source-tab"
            role="radio"
            :aria-checked="bgType === 'base64'"
            :class="{ active: bgType === 'base64' }"
            @click="openBgPicker('album')"
          >
{{ t('picker.album') }}
</button>
          <button
            type="button"
            class="bg-source-tab"
            role="radio"
            :aria-checked="false"
            :class="{ active: false }"
            @click="openBgPicker('camera')"
          >
{{ t('picker.camera') }}
</button>
        </div>

        <input
          ref="bgFileInput"
          type="file"
          accept="image/*"
          :capture="bgCapture"
          class="hidden-file-input"
          :aria-label="t('settingsView.bgUploadAria')"
          @change="handleBgFileSelected"
        />

        <div v-if="bgType === 'url'" class="form-field">
          <label for="bg-url" class="field-label">{{ t('settingsView.bgUrlLabel2') }}</label>
          <input
            id="bg-url"
            v-model="bgValue"
            type="url"
            class="form-input"
            placeholder="https://example.com/bg.jpg"
            aria-describedby="bg-url-hint"
          />
          <p id="bg-url-hint" class="field-hint">{{ t('settingsView.bgUrlHint') }}</p>
        </div>

        <div v-if="bgType !== 'none'" class="form-field">
          <label for="bg-opacity" class="field-label">{{ t('settingsView.bgOpacityLabel', { value: Math.round(bgOpacity * 100) }) }}</label>
          <input
            id="bg-opacity"
            v-model.number="bgOpacity"
            type="range"
            min="0"
            max="1"
            step="0.1"
            class="form-range"
            :aria-label="t('settingsView.bgOpacityAria')"
          />
        </div>

        <div v-if="bgType !== 'none'" class="form-field">
          <label for="bg-blur" class="field-label">{{ t('settingsView.bgBlurLabel', { value: bgBlur }) }}</label>
          <input
            id="bg-blur"
            v-model.number="bgBlur"
            type="range"
            min="0"
            max="20"
            step="1"
            class="form-range"
            :aria-label="t('settingsView.bgBlurAria')"
          />
        </div>

        <div class="bg-preview" :style="bgPreviewStyle" :aria-label="t('settingsView.bgPreviewAria')">
          <div class="bg-preview-overlay" :style="{ opacity: bgType === 'none' ? 1 : bgOpacity, filter: bgBlur > 0 ? `blur(${bgBlur}px)` : 'none' }">
            <p class="preview-line"><strong>{{ t('settingsView.previewCharName') }}</strong>：{{ t('settingsView.bgPreviewSample') }}</p>
            <p class="preview-line muted">{{ t('settingsView.bgPreviewOpacity', { value: Math.round(bgOpacity * 100) }) }}</p>
          </div>
        </div>

        <div class="ui-custom-actions">
          <button type="button" class="data-mgmt-btn primary" @click="applyBackground">{{ t('settingsView.applyBg') }}</button>
          <button type="button" class="data-mgmt-btn" @click="clearBackground">{{ t('settingsView.clearBg') }}</button>
        </div>
      </div>

      <!-- F08.2 消息气泡样式 -->
      <div class="ui-custom-block">
        <h3 class="ui-custom-subtitle">{{ t('settingsView.bubbleSubtitle') }}</h3>

        <div class="form-field">
          <label for="bubble-radius" class="field-label">{{ t('settingsView.bubbleRadiusLabel', { value: bubbleRadius }) }}</label>
          <input
            id="bubble-radius"
            v-model.number="bubbleRadius"
            type="range"
            min="0"
            max="24"
            step="1"
            class="form-range"
            :aria-label="t('settingsView.bubbleRadiusAria')"
          />
        </div>

        <div class="form-field">
          <label for="bubble-opacity" class="field-label">{{ t('settingsView.bubbleOpacityLabel', { value: Math.round(bubbleOpacity * 100) }) }}</label>
          <input
            id="bubble-opacity"
            v-model.number="bubbleOpacity"
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            class="form-range"
            :aria-label="t('settingsView.bubbleOpacityAria')"
          />
        </div>

        <div class="bubble-preview" :aria-label="t('settingsView.bubblePreviewAria')">
          <div
            class="bubble-preview-item user-bubble"
            :style="{ borderRadius: `${bubbleRadius}px`, opacity: bubbleOpacity }"
          >
{{ t('settingsView.bubbleUserPreview') }}
</div>
          <div
            class="bubble-preview-item assistant-bubble"
            :style="{ borderRadius: `${bubbleRadius}px`, opacity: bubbleOpacity }"
          >
{{ t('settingsView.bubbleAiPreview') }}
</div>
        </div>

        <div class="ui-custom-actions">
          <button type="button" class="data-mgmt-btn primary" @click="applyBubbleStyle">{{ t('settingsView.applyBubble') }}</button>
        </div>
      </div>

      <!-- F08.3 自定义 CSS -->
      <div class="ui-custom-block">
        <h3 class="ui-custom-subtitle">{{ t('settingsView.cssSubtitle') }}</h3>
        <p class="ui-custom-hint">{{ t('settingsView.cssHint') }}</p>

        <div class="form-field">
          <label for="custom-css" class="field-label">{{ t('settingsView.cssLabel') }}</label>
          <textarea
            id="custom-css"
            v-model="customCssDraft"
            class="form-textarea custom-css-textarea"
            rows="8"
            spellcheck="false"
            :placeholder="t('settingsView.cssPlaceholder2')"
            aria-describedby="custom-css-hint"
          ></textarea>
          <p id="custom-css-hint" class="field-hint">{{ t('settingsView.cssHint2', { vars: '--primary / --background / --card / --foreground' }) }}</p>
        </div>

        <div class="ui-custom-actions">
          <button type="button" class="data-mgmt-btn primary" @click="saveCustomCss">{{ t('settingsView.saveApply') }}</button>
          <button type="button" class="data-mgmt-btn" @click="resetCustomCss">{{ t('settingsView.resetCss') }}</button>
        </div>
      </div>
    </section>
</div>
</template>

<style scoped>

.settings-nav-title {
  margin: 0 0 10px 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.settings-nav-item {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--muted-foreground);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

/* 侧边栏描述小字 → hover 气泡（默认隐藏，向下浮层显示） */
.settings-nav-item-desc {
  position: absolute;
  left: 8px;
  right: 8px;
  top: calc(100% + 6px);
  z-index: 30;
  padding: 6px 9px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted-foreground);
  background: var(--card-elevated, var(--card));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-elevated);
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
  pointer-events: none;
}
/* I-5（2026-09-16）：触屏 tap 不触发 focus-visible，设置项描述常显，保证说明文本可达 */
@media (hover: none) {
  .settings-nav-item-desc {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
}

.settings-nav-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.settings-nav-item.active {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  /* 激活项文字用最高亮度层级，保证 on 红色浅底 ≥4.5:1（WCAG AA） */
  color: var(--foreground);
  border: 1px solid color-mix(in srgb, var(--primary) 55%, transparent);
}

.settings-subtitle {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
}

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
  color: var(--secondary);
  flex-shrink: 0;
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

/* ── API Profile 管理 ── */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--on-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  padding: 16px 0;
  text-align: center;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-item.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 6%, transparent);
}

.active-badge {
  background: var(--secondary);
  color: var(--on-accent);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.provider-badge {
  background: var(--border);
  color: var(--muted-foreground);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  text-transform: lowercase;
}

.provider-badge[data-provider='custom'] {
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary-fg);
}

.model-category-group:first-of-type {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.category-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
}

.category-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.profile-item.is-primary {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.primary-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.primary-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--primary-fg);
  font-weight: 500;
}

.action-btn.set-primary {
  color: var(--warning-fg);
  border-color: var(--warning-border);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.set-primary:hover {
    background: var(--warning-bg);
    border-color: var(--warning-fg);
    color: var(--warning-fg);
  }
}

.profile-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.meta-url {
  font-family: var(--font-mono);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

.action-btn.deactivate {
  background: var(--video-bg);
  color: var(--muted-foreground);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.field-input {
  height: 36px;
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
  width: 100%;
}

select.field-input {
  height: 36px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23AEB2C0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.field-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

.test-result-hints {
  margin: 6px 0 0;
  padding-left: 16px;
  color: var(--muted-foreground);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Persona 区段 (F07) */
.badge-active {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--on-accent);
  background: var(--secondary);
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toggle-visibility {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

.modal-save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
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

@media (prefers-reduced-motion: reduce) {
  .theme-card,
  .fontsize-card,
  .profile-item,
  .action-btn,
  .modal-btn {
    transition: none;
  }
}

/* ── F08 UI 自定义 ── */
.ui-custom-block {
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ui-custom-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.ui-custom-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.ui-custom-hint code {
  font-family: var(--font-mono);
  padding: 1px 4px;
  background: var(--video-bg);
  border-radius: 3px;
  font-size: 11px;
}

.bg-source-tabs {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--video-bg);
  border-radius: var(--radius-md);
}

.bg-source-tab {
  flex: 1;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  border-radius: calc(var(--radius-md) - 2px);
  transition: background-color 0.15s, color 0.15s;
}

.bg-source-tab.active {
  background: var(--card);
  color: var(--foreground);
  font-weight: 500;
}

.bg-source-tab:focus-visible {
  outline: 2px solid var(--tk-cyan-500);
  outline-offset: 2px;
}

.form-range {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--video-bg);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.form-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.form-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.form-range:focus-visible {
  outline: 2px solid var(--tk-cyan-500);
  outline-offset: 4px;
}

.bg-preview {
  height: 120px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-preview-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  padding: 16px;
  text-align: center;
}

.bubble-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--video-bg);
  border-radius: var(--radius-md);
}

.bubble-preview-item {
  padding: 8px 12px;
  max-width: 70%;
  font-size: 13px;
  transition: background-color 0.15s, color 0.15s, border-radius 0.15s, border-color 0.15s, opacity 0.15s;
}

.bubble-preview-item.user-bubble {
  align-self: flex-end;
  background: var(--primary);
  color: var(--on-primary);
}

.bubble-preview-item.assistant-bubble {
  align-self: flex-start;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
}

.ui-custom-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.form-textarea {
  width: 100%;
  padding: 10px;
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--foreground);
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  resize: vertical;
  line-height: 1.5;
}

.form-textarea:focus-visible {
  border-color: var(--tk-cyan-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tk-cyan-500) 20%, transparent);
}

.custom-css-textarea {
  min-height: 160px;
  font-size: 12px;
}

.data-mgmt-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

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

.data-mgmt-select {
  height: 32px;
  padding: 0 28px 0 10px;
  font-size: 13px;
  color: var(--foreground);
  background: var(--video-bg, var(--card));
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 160px;
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

.strategy-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-value {
  flex: 1;
  color: var(--muted-foreground);
  font-family: var(--font-mono, monospace);
}

.error-list {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 10%, transparent);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--tk-red-500, #ef4444);
  max-height: 200px;
  overflow-y: auto;
}

.extension-block .form-row > span {
  min-width: 100px;
  color: var(--muted-foreground);
}

.extension-block .hint-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.context-preset-label {
  min-width: 100px;
  color: var(--muted-foreground);
}

.context-preset-btns .data-mgmt-btn.active {
  border-color: var(--tk-cyan-500);
  background: var(--card-elevated);
  /* 亮色主题中 cyan-500 叠在浅色卡片上对比度不足，使用专用文本派生色。 */
  color: var(--accent-blue-text);
}

.size-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--border);
  color: var(--muted-foreground);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--border);
  color: var(--muted-foreground);
}

.status-badge[data-status='loaded'] {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary-fg);
}

.profile-item.is-loaded {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.status-dot.ok {
  background: var(--primary);
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

/* ── 窄屏：侧边栏转为顶部横向分类栏 ── */
@media (max-width: 640px) {
  .settings-view {
    flex-direction: column;
  }
  .settings-nav {
    width: auto;
    margin: 8px;
    max-height: none;
    position: static;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .settings-nav-inner {
    display: flex;
    flex-direction: column;
  }
  .settings-nav-list {
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .settings-nav-item {
    flex: 0 0 auto;
    width: auto;
    padding: 8px 12px;
  }
  .settings-nav-item-desc {
    display: none;
  }
  .settings-body {
    padding: 16px;
    max-width: none;
  }
}

.audit-empty {
  color: var(--muted-foreground);
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}

.audit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.audit-time {
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
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
