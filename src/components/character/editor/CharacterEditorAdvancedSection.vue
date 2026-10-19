<script setup lang="ts">
/**
 * CharacterEditorAdvancedSection — 高级（R2-1 从 CharacterEditorView 拆出）
 *
 * 作者笔记与注入深度。两项都只影响上下文拼装，不影响角色本身的行为，
 * 所以单独成段放在最后，默认折叠进"高级"的语义里（这一段不折叠，靠位置收）。
 */
import FormField from '@/components/common/FormField.vue';
import type { FormState } from '@/composables/useCharacterEditorForm';
import { t } from '@/i18n';

const form = defineModel<FormState>('form', { required: true });

defineProps<{
  errors: Record<string, string>;
}>();
</script>

<template>
  <fieldset class="form-section">
    <legend class="section-title">{{ t('charEdit.advancedTitle') }}</legend>

    <FormField
      label-key="charEdit.authorNoteLabel"
      html-for="f-author-note"
      hint-key="charEdit.authorNoteHint"
    >
      <template #default="{ describedBy }">
        <textarea
          id="f-author-note"
          v-model="form.authorNote"
          class="field-input field-textarea"
          rows="4"
          :placeholder="t('charEdit.authorNotePlaceholder')"
          :aria-describedby="describedBy"
        ></textarea>
      </template>
    </FormField>

    <FormField
      label-key="charEdit.authorDepthLabel"
      html-for="f-depth"
      hint-key="charEdit.authorDepthHint"
      :error-text="errors.authorDepth"
    >
      <template #label-extra>
        <span class="value-badge">{{ form.authorDepth }}</span>
      </template>
      <template #default="{ describedBy, invalid }">
        <input
          id="f-depth"
          v-model.number="form.authorDepth"
          v-range
          type="range"
          min="0"
          max="50"
          step="1"
          class="tk-range"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
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

.value-badge {
  background: var(--video-bg);
  border: 1px solid var(--border);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--secondary-text);
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

.field-textarea {
  height: auto;
  padding: 10px 12px;
  line-height: 1.5;
  resize: vertical;
  min-height: 80px;
  font-family: var(--font-sans);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input {
    font-size: 16px;
  }
}
</style>
