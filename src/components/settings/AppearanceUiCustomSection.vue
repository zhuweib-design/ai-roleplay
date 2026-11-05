<script setup lang="ts">
/**
 * 设置 → 外观：界面自定义高级段（聊天背景 / 消息气泡 / 自定义 CSS / 开合记忆出口）
 *
 * 从 SettingsAppearancePanel.vue 拆出（R3-1），逻辑与样式逐字搬运。
 *
 * 为什么整段是一个组件而不是再切四块：这四块共享同一个 Collapse 容器与同一批
 * 表单原语（.form-field / .form-range / .ui-custom-block），再切只会让每个子组件
 * 各带一份原语副本；而它们合起来仍不到 500 行，不构成拆分收益。
 *
 * 开合记忆出口（M8-b）刻意留在这一段的末尾：它管的是"用户点过的开合状态"，
 * 没有它，一次误点会让某段永远停在随手留下的状态，用户无从退回。
 */
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import Collapse from '@/components/common/Collapse.vue';
import { useSectionMemory, useSectionMemoryCount } from '@/composables/useSectionMemory';
import type { ChatBackground, BubbleStyle } from '@/types';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();

/** M7-d：界面自定义是高级段，默认收起；用户点过的开合跨会话记住 */
const uiCustomOpen = useSectionMemory('settings.uiCustom');

const sectionMemoryCount = useSectionMemoryCount();

/** 清掉开合记忆。这条操作本身不该再被记忆管住，所以直接给结果提示。 */
function resetSectionMemory(): void {
  const cleared = settings.resetUiSectionOpen();
  if (cleared > 0) showToast('success', t('settingsView.sectionMemoryResetDone', { count: cleared }));
}

// ── 聊天背景 ──

const bgType = ref<'none' | 'url' | 'base64'>(settings.chatBackground.type);

const bgValue = ref<string>(settings.chatBackground.value);

const bgOpacity = ref<number>(settings.chatBackground.opacity);

const bgBlur = ref<number>(settings.chatBackground.blur);

const bgCapture = ref<'environment' | undefined>(undefined);

const bgFileInput = useTemplateRef<HTMLInputElement>('bgFileInput');

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

function openBgPicker(mode: 'camera' | 'album') {
  bgCapture.value = mode === 'camera' ? 'environment' : undefined;
  void nextTick(() => bgFileInput.value?.click());
}

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

function clearBackground() {
  bgType.value = 'none';
  bgValue.value = '';
  bgOpacity.value = 1;
  bgBlur.value = 0;
  settings.setChatBackground({ type: 'none', value: '', opacity: 1, blur: 0 });
  showToast('info', t('settingsView.bgCleared'));
}

// ── 消息气泡样式 ──

const bubbleRadius = ref<number>(settings.bubbleStyle.radius);

const bubbleOpacity = ref<number>(settings.bubbleStyle.opacity);

function applyBubbleStyle() {
  const style: BubbleStyle = {
    radius: bubbleRadius.value,
    opacity: bubbleOpacity.value,
  };
  settings.setBubbleStyle(style);
  showToast('success', t('settingsView.bubbleApplied'));
}

// ── 自定义 CSS ──

const customCssDraft = ref<string>(settings.customCss);

function saveCustomCss() {
  settings.setCustomCss(customCssDraft.value);
  showToast('success', t('settingsView.cssSaved'));
}

function resetCustomCss() {
  customCssDraft.value = '';
  settings.resetCustomCss();
  showToast('info', t('settingsView.cssReset'));
}
</script>

<template>
  <Collapse
    v-model:open="uiCustomOpen"
    title-key="settingsView.uiCustomSection"
    hint-key="settingsView.uiCustomHint"
    icon="image"
    advanced
  >
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
          v-range
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
          v-range
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
          v-range
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
          v-range
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
    <!-- M8-b：开合记忆的出口。没有它，一次误点会让某段永远停在随手留下的状态，
         连"还没填就自动展开"这类规则都被顶掉，用户无从退回。 -->
    <div class="ui-custom-block">
      <h3 class="ui-custom-subtitle">{{ t('settingsView.sectionMemoryTitle') }}</h3>
      <p class="ui-custom-hint">
        {{ sectionMemoryCount === 0
          ? t('settingsView.sectionMemoryEmpty')
          : t('settingsView.sectionMemoryHint', { count: sectionMemoryCount }) }}
      </p>
      <div class="ui-custom-actions">
        <button
          type="button"
          class="data-mgmt-btn"
          :disabled="sectionMemoryCount === 0"
          @click="resetSectionMemory"
        >
          {{ t('settingsView.sectionMemoryReset') }}
        </button>
      </div>
    </div>
  </Collapse>
</template>

<style scoped>
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

.field-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

.form-range {
  --range-rail: var(--video-bg);
  --range-h: 6px;
  width: 100%;
  height: 18px;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  cursor: pointer;
}

.form-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--range-fill, var(--secondary));
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.form-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--range-fill, var(--secondary));
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

.preview-line {
  margin: 0;
}

.preview-line.muted {
  color: var(--muted-foreground);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-textarea,
  .custom-css-textarea {
    font-size: 16px;
  }
}
</style>
