<script setup lang="ts">
/**
 * CharacterEditorBasicSection — 基本信息（R2-1 从 CharacterEditorView 拆出）
 *
 * 名称、标签、描述、性格、场景、收藏。五块里四块已接 FormField 原语
 * （aria-describedby / 必填读屏文本都由原语给），只有"收藏"是个裸勾选框。
 *
 * 状态不在这里：`form` 由宿主持有并 `v-model` 下来。这张表单是跨字段校验的
 * （属性开关一开，等级/经验/属性名三条校验才成立），拆成各管一段会变成多份真相。
 */
import FormField from '@/components/common/FormField.vue';
import type { FormState } from '@/composables/useCharacterEditorForm';
import { t } from '@/i18n';

const form = defineModel<FormState>('form', { required: true });

defineProps<{
  /** 宿主算好的校验结果（`name` 一条在这里用得上） */
  errors: Record<string, string>;
}>();
</script>

<template>
  <fieldset class="form-section">
    <legend class="section-title">{{ t('charEdit.basicTitle') }}</legend>

    <FormField label-key="charEdit.nameLabel" html-for="f-name" :error-text="errors.name" required>
      <template #default="{ describedBy, invalid }">
        <input
          id="f-name"
          v-model="form.name"
          type="text"
          class="field-input"
          :class="{ 'has-error': invalid }"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
          maxlength="64"
          required
          autocomplete="off"
        />
      </template>
    </FormField>

    <FormField label-key="charEdit.tagsLabel" html-for="f-tags" hint-key="charEdit.tagsHint">
      <template #default="{ describedBy }">
        <input
          id="f-tags"
          v-model="form.tagsText"
          type="text"
          class="field-input"
          :placeholder="t('charEdit.tagsPlaceholder')"
          :aria-describedby="describedBy"
          autocomplete="off"
        />
      </template>
    </FormField>

    <FormField label-key="charEdit.descLabel" html-for="f-desc">
      <template #default>
        <textarea
          id="f-desc"
          v-model="form.description"
          class="field-input field-textarea"
          rows="5"
          :placeholder="t('charEdit.descPlaceholder')"
        ></textarea>
      </template>
    </FormField>

    <FormField
      label-key="charEdit.personalityLabel"
      html-for="f-personality"
      hint-key="charEdit.personalityHint"
    >
      <template #default="{ describedBy }">
        <textarea
          id="f-personality"
          v-model="form.personality"
          class="field-input field-textarea"
          rows="4"
          :placeholder="t('charEdit.personalityPlaceholder')"
          :aria-describedby="describedBy"
        ></textarea>
      </template>
    </FormField>

    <FormField
      label-key="charEdit.scenarioLabel"
      html-for="f-scenario"
      hint-key="charEdit.scenarioHint"
    >
      <template #default="{ describedBy }">
        <textarea
          id="f-scenario"
          v-model="form.scenario"
          class="field-input field-textarea"
          rows="4"
          :placeholder="t('charEdit.scenarioPlaceholder')"
          :aria-describedby="describedBy"
        ></textarea>
      </template>
    </FormField>

    <div class="field field-inline">
      <label class="field-checkbox">
        <input
          v-model="form.favorite"
          type="checkbox"
        />
        <span>{{ t('charEdit.favorite') }}</span>
      </label>
    </div>
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

.field-textarea {
  height: auto;
  padding: 10px 12px;
  line-height: 1.5;
  resize: vertical;
  min-height: 80px;
  font-family: var(--font-sans);
}

.field-inline {
  flex-direction: row;
  align-items: center;
}

.field-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
  cursor: pointer;
}

.field-checkbox input {
  width: 16px;
  height: 16px;
  accent-color: var(--secondary);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input {
    font-size: 16px;
  }
}
</style>
