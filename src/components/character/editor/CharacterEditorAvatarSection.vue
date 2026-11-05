<script setup lang="ts">
/**
 * CharacterEditorAvatarSection — 头像（R2-1 从 CharacterEditorView 拆出）
 *
 * 两档：渐变（六个色板 + 两个色值输入）与图片（URL + 拍照/相册上传）。
 * 上传读文件、大小与类型校验、转 base64 都在本组件内完成——它只产出 `form.avatar`，
 * 不关心后面存到哪。失败提示经 `notify` 抛给宿主，由宿主统一走同一个 Toast
 * （视图里只有一个 Toast 实例，每个 section 各养一个会让读屏同时念两遍）。
 */
import { nextTick, ref, useTemplateRef } from 'vue';
import Icon from '@/components/common/Icon.vue';
import FormField from '@/components/common/FormField.vue';
import type { FormState } from '@/composables/useCharacterEditorForm';
import { t } from '@/i18n';

const form = defineModel<FormState>('form', { required: true });

defineProps<{
  errors: Record<string, string>;
}>();

const emit = defineEmits<{
  notify: [type: 'info' | 'success' | 'error', message: string];
}>();

// ── 颜色快选 ──
const colorPresets: Array<{ from: string; to: string; label: string }> = [
  { from: 'var(--tk-cyan-500)', to: 'var(--tk-cyan-700)', label: t('charEdit.colorCyan') },
  { from: 'var(--tk-red-500)', to: 'var(--tk-red-700)', label: t('charEdit.colorRed') },
  { from: '#a78bfa', to: '#7c3aed', label: t('charEdit.colorPurple') },
  { from: '#f472b6', to: '#db2777', label: t('charEdit.colorPink') },
  { from: '#34d399', to: '#047857', label: t('charEdit.colorGreen') },
  { from: '#fbbf24', to: '#d97706', label: t('charEdit.colorGold') },
];

function applyPreset(p: { from: string; to: string }) {
  form.value.gradientFrom = p.from;
  form.value.gradientTo = p.to;
  form.value.avatarType = 'gradient';
}

// ── 头像上传（base64 dataURL） ──
const avatarInput = useTemplateRef<HTMLInputElement>('avatarInput');

// F-5: 头像上传提供「拍照」(capture) 与「从相册选择」双入口
const avatarCapture = ref<'environment' | undefined>(undefined);
function openAvatarPicker(mode: 'camera' | 'album') {
  avatarCapture.value = mode === 'camera' ? 'environment' : undefined;
  void nextTick(() => avatarInput.value?.click());
}

function handleAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  // 限制 1MB
  if (file.size > 1024 * 1024) {
    emit('notify', 'error', t('charEdit.avatarTooLarge'));
    input.value = '';
    return;
  }
  if (!file.type.startsWith('image/')) {
    emit('notify', 'error', t('charEdit.avatarNotImage'));
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    form.value.avatar = String(reader.result);
    form.value.avatarType = 'image';
    emit('notify', 'success', t('charEdit.avatarLoaded'));
  };
  reader.onerror = () => {
    emit('notify', 'error', t('charEdit.avatarReadFailed'));
  };
  reader.readAsDataURL(file);
  input.value = '';
}
</script>

<template>
  <fieldset class="form-section">
    <legend class="section-title">{{ t('charEdit.avatarTitle') }}</legend>

    <div class="avatar-type-switch" role="radiogroup" :aria-label="t('charEdit.avatarTypeAria')">
      <button
        type="button"
        class="type-btn"
        :class="{ active: form.avatarType === 'gradient' }"
        :aria-pressed="form.avatarType === 'gradient'"
        @click="form.avatarType = 'gradient'"
      >
        <Icon name="palette" :size="14" />
        <span>{{ t('charEdit.avatarGradient') }}</span>
      </button>
      <button
        type="button"
        class="type-btn"
        :class="{ active: form.avatarType === 'image' }"
        :aria-pressed="form.avatarType === 'image'"
        @click="form.avatarType = 'image'"
      >
        <Icon name="image" :size="14" />
        <span>{{ t('charEdit.avatarImage') }}</span>
      </button>
    </div>

    <!-- 渐变色配置 -->
    <div v-if="form.avatarType === 'gradient'" class="field">
      <p id="f-gradient-presets-label" class="field-label">{{ t('charEdit.gradientPresets') }}</p>
      <div class="preset-row" role="group" aria-labelledby="f-gradient-presets-label">
        <button
          v-for="p in colorPresets"
          :key="p.label"
          type="button"
          class="preset-swatch"
          :style="{
            background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
          }"
          :aria-label="t('charEdit.applyPresetAria', { label: p.label })"
          @click="applyPreset(p)"
        >
          <Icon
            v-if="form.gradientFrom === p.from && form.gradientTo === p.to"
            name="check"
            :size="14"
          />
        </button>
      </div>

      <div class="color-row">
        <div class="color-field">
          <label for="f-grad-from" class="field-label">{{ t('charEdit.gradientFrom') }}</label>
          <input
            id="f-grad-from"
            v-model="form.gradientFrom"
            type="text"
            class="field-input"
            :class="{ 'has-error': errors.gradient }"
            :aria-invalid="!!errors.gradient"
            :aria-describedby="errors.gradient ? 'err-grad' : undefined"
            :placeholder="t('charEdit.gradientFromPlaceholder')"
          />
        </div>
        <div class="color-field">
          <label for="f-grad-to" class="field-label">{{ t('charEdit.gradientTo') }}</label>
          <input
            id="f-grad-to"
            v-model="form.gradientTo"
            type="text"
            class="field-input"
            :class="{ 'has-error': errors.gradient }"
            :placeholder="t('charEdit.gradientToPlaceholder')"
          />
        </div>
      </div>
      <p v-if="errors.gradient" id="err-grad" class="field-error" role="alert">
        <Icon name="alert-triangle" :size="12" />
        <span>{{ errors.gradient }}</span>
      </p>
    </div>

    <!-- 图片头像配置 -->
    <FormField
      v-else
      label-key="charEdit.avatarUrl"
      html-for="f-avatar-url"
      :error-text="errors.avatar"
    >
      <template #default="{ describedBy, invalid }">
        <input
          id="f-avatar-url"
          v-model="form.avatar"
          type="text"
          class="field-input"
          :class="{ 'has-error': invalid }"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
          :placeholder="t('charEdit.avatarUrlPlaceholder')"
          autocomplete="off"
        />
        <div class="upload-row">
          <button
            type="button"
            class="upload-btn"
            @click="openAvatarPicker('camera')"
          >
            <span>{{ t('picker.camera') }}</span>
          </button>
          <button
            type="button"
            class="upload-btn"
            @click="openAvatarPicker('album')"
          >
            <Icon name="image" :size="14" />
            <span>{{ t('picker.album') }}</span>
          </button>
          <input
            ref="avatarInput"
            type="file"
            accept="image/*"
            :capture="avatarCapture"
            class="hidden-file-input"
            aria-hidden="true"
            tabindex="-1"
            @change="handleAvatarSelected"
          />
          <span class="upload-hint">{{ t('charEdit.uploadHint') }}</span>
        </div>
      </template>
    </FormField>

    <FormField label-key="charEdit.initialLabel" html-for="f-initial">
      <template #default>
        <input
          id="f-initial"
          v-model="form.initial"
          type="text"
          class="field-input field-initial"
          maxlength="2"
          :placeholder="t('charEdit.initialPlaceholder')"
          autocomplete="off"
        />
      </template>
    </FormField>
  </fieldset>
</template>

<style scoped>
.form-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--card);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  padding: 0 4px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 与 FormField 的标签/说明同刻度：本页仍有 8 个字段块没接原语（温度、作者深度
   这类标签里带实时数值，原语还没有标签后缀插槽），先让两套排版看不出层级差 */
.field-label {
  font-size: 13px;
  color: var(--foreground);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-input {
  height: var(--size-control-md);
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

.field-input:focus-visible {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}

.field-input.has-error {
  border-color: var(--destructive);
}

.field-initial {
  max-width: 80px;
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--destructive);
  margin: 0;
}

.avatar-type-switch {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
}

.type-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--video-bg);
  border: none;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}

.type-btn.active {
  background: var(--secondary);
  color: var(--on-secondary);
}

.type-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.preset-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-swatch {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--border);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--on-media);
  transition: border-color .15s ease, transform .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .preset-swatch:hover {
    border-color: var(--secondary);
    transform: scale(1.05);
  }
}

.preset-swatch:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.color-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.color-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .upload-btn:hover {
    border-color: var(--secondary);
    color: var(--secondary-text);
  }
}

.upload-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.upload-hint {
  font-size: 11px;
  color: var(--muted-foreground);
}

.hidden-file-input {
  display: none;
}

@media (max-width: 640px) {
  .color-row {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  @media (hover: hover) and (pointer: fine) {
    .preset-swatch:hover {
      transform: none;
    }
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input {
    font-size: 16px;
  }
}
</style>
