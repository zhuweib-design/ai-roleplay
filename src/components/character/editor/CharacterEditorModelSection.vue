<script setup lang="ts">
/**
 * CharacterEditorModelSection — 模型设置（R2-1 从 CharacterEditorView 拆出）
 *
 * 只有两件事：绑哪个 API 档位（`profileId`，留空＝跟随全局）、温度。
 * 档位列表直接读设置 store——它是"当前有哪些档位"的唯一来源，
 * 复制一份到本地状态就会在设置页新建档位后失效。
 *
 * 输出上限刻意不在这里：它由"模型最大上下文 − 预留 − 输入"自动推导，
 * 不再做角色级旋钮。
 */
import FormField from '@/components/common/FormField.vue';
import { useSettingsStore } from '@/stores/settings';
import type { FormState } from '@/composables/useCharacterEditorForm';
import { t } from '@/i18n';

const form = defineModel<FormState>('form', { required: true });

defineProps<{
  errors: Record<string, string>;
}>();

const settingsStore = useSettingsStore();
</script>

<template>
  <fieldset class="form-section">
    <legend class="section-title">{{ t('charEdit.modelTitle') }}</legend>

    <FormField
      label-key="charEdit.profileBindLabel"
      html-for="f-profile"
      hint-key="charEdit.profileBindHint"
    >
      <template #default="{ describedBy }">
      <select
        id="f-profile"
        class="field-input"
        :value="form.profileId ?? ''"
        :aria-describedby="describedBy"
        @change="form.profileId = ($event.target as HTMLSelectElement).value || null"
      >
        <option value="">
          {{ t('charEdit.profileFollowGlobal', { model: settingsStore.activeProfile?.model ?? '—' }) }}
        </option>
        <option
          v-for="p in settingsStore.apiProfiles"
          :key="p.id"
          :value="p.id"
        >
          {{ p.name }} · {{ p.model }}
        </option>
      </select>
      </template>
    </FormField>

    <FormField
      label-key="charEdit.temperatureLabel"
      html-for="f-temp"
      hint-key="charEdit.temperatureHint"
      :error-text="errors.temperature"
    >
      <template #label-extra>
        <span class="value-badge" :class="{ err: errors.temperature }">{{ form.temperature.toFixed(2) }}</span>
      </template>
      <template #default="{ describedBy, invalid }">
        <input
          id="f-temp"
          v-model.number="form.temperature"
          v-range
          type="range"
          min="0"
          max="2"
          step="0.05"
          class="tk-range"
          :aria-invalid="invalid"
          :aria-describedby="describedBy"
        />
      </template>
    </FormField>

    <!-- 输出上限不再是角色级旋钮：由"模型最大上下文 − 预留 − 输入"自动推导 -->
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

.value-badge.err {
  background: color-mix(in srgb, var(--destructive) 12%, transparent);
  /* --destructive 是填充档；文字走 --error-fg（light 下 #DC2626 → #991B1B）。 */
  color: var(--error-fg);
  font-weight: 500;
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

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input {
    font-size: 16px;
  }
}
</style>
