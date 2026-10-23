<script setup lang="ts">
/**
 * 上下文面板 · 角色状态栏（R2-3 从 ContextPanel 拆出）
 *
 * 状态指令三态开关 + 折叠式 schema 编辑器。折叠状态是本组件自己的 UI 状态，
 * 不进 composable（面板其余部分是纯投影，没有需要跨段共享的可变状态）。
 */
import { ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import SegmentedControl from '@/components/common/SegmentedControl.vue';
import { useContextPanel } from '@/composables/useContextPanel';
import { t } from '@/i18n';

const {
  statusInstructionOptions,
  statusInstruction,
  onStatusInstruction,
  statusFields,
  statusIconOptions,
  addStatusField,
  removeStatusField,
  onStatusFieldKey,
  onStatusFieldLabel,
  onStatusFieldType,
  onStatusFieldIcon,
  onStatusFieldAliases,
  onStatusFieldOptions,
} = useContextPanel();

/** 编辑器折叠状态（默认折叠，避免长 schema 挤占面板） */
const schemaOpen = ref(false);
</script>

<template>
  <section class="ctx-section" aria-labelledby="ctx-status-title">
    <header class="ctx-section-header">
      <span id="ctx-status-title" class="ctx-section-title">{{ t('status.instruction') }}</span>
      <span class="ctx-section-value">{{ statusFields.length }}</span>
    </header>
    <SegmentedControl
      :model-value="statusInstruction"
      :options="statusInstructionOptions"
      :aria-label="t('status.instruction')"
      @update:model-value="onStatusInstruction"
    />
    <p class="ctx-param-hint">{{ t('status.instructionHint') }}</p>

    <button
      type="button"
      class="ctx-schema-toggle"
      :aria-expanded="schemaOpen"
      aria-controls="ctx-status-schema"
      @click="schemaOpen = !schemaOpen"
    >
      <Icon :name="schemaOpen ? 'chevron-up' : 'chevron-down'" :size="14" />
      <span>{{ t('status.schemaTitle') }}</span>
    </button>

    <div v-if="schemaOpen" id="ctx-status-schema" class="ctx-schema">
      <div v-for="(f, i) in statusFields" :key="`sf-${i}`" class="status-field">
        <div class="status-field-row">
          <label class="status-field-cell">
            <span class="status-field-label">{{ t('status.schemaKey') }}</span>
            <input
              class="tk-input status-field-input"
              type="text"
              :value="f.key"
              :placeholder="t('status.schemaKeyHint')"
              :aria-label="t('status.schemaKey')"
              @input="onStatusFieldKey(i, $event)"
            />
          </label>
          <label class="status-field-cell">
            <span class="status-field-label">{{ t('status.schemaLabel') }}</span>
            <input
              class="tk-input status-field-input"
              type="text"
              :value="f.label ?? ''"
              :aria-label="t('status.schemaLabel')"
              @input="onStatusFieldLabel(i, $event)"
            />
          </label>
        </div>
        <div class="status-field-row">
          <label class="status-field-cell">
            <span class="status-field-label">{{ t('status.schemaType') }}</span>
            <select
              class="tk-input status-field-input"
              :value="f.type ?? 'string'"
              :aria-label="t('status.schemaType')"
              @change="onStatusFieldType(i, $event)"
            >
              <option value="string">{{ t('status.schemaTypeString') }}</option>
              <option value="number">{{ t('status.schemaTypeNumber') }}</option>
              <option value="enum">{{ t('status.schemaTypeEnum') }}</option>
            </select>
          </label>
          <label class="status-field-cell">
            <span class="status-field-label">{{ t('status.schemaIcon') }}</span>
            <select
              class="tk-input status-field-input"
              :value="f.icon ?? ''"
              :aria-label="t('status.schemaIcon')"
              @change="onStatusFieldIcon(i, $event)"
            >
              <option value="">{{ t('status.schemaIconNone') }}</option>
              <option v-for="ic in statusIconOptions" :key="ic" :value="ic">{{ ic }}</option>
            </select>
          </label>
        </div>
        <label class="status-field-cell">
          <span class="status-field-label">{{ t('status.schemaAliases') }}</span>
          <input
            class="tk-input status-field-input"
            type="text"
            :value="(f.aliases ?? []).join(', ')"
            :placeholder="t('status.schemaAliasesHint')"
            :aria-label="t('status.schemaAliases')"
            @input="onStatusFieldAliases(i, $event)"
          />
        </label>
        <label v-if="f.type === 'enum'" class="status-field-cell">
          <span class="status-field-label">{{ t('status.schemaOptions') }}</span>
          <input
            class="tk-input status-field-input"
            type="text"
            :value="(f.options ?? []).join(', ')"
            :aria-label="t('status.schemaOptions')"
            @input="onStatusFieldOptions(i, $event)"
          />
        </label>
        <button
          type="button"
          class="ctx-reset-btn status-field-remove"
          :aria-label="t('status.schemaRemove')"
          @click="removeStatusField(i)"
        >
          <Icon name="trash-2" :size="12" />
        </button>
      </div>
      <button type="button" class="ctx-schema-add" @click="addStatusField">
        <Icon name="plus" :size="14" />
        <span>{{ t('status.schemaAdd') }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* ── P1 角色状态栏：schema 编辑器 ── */

.ctx-schema-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  margin-top: var(--spacing-sm);
  padding: 0 var(--spacing-sm);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

@media (hover: hover) and (pointer: fine) {
  .ctx-schema-toggle:hover {
    color: var(--foreground);
  }
}

.ctx-schema-toggle:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.ctx-schema {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.status-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--muted-foreground) 6%, transparent);
}

.status-field-row {
  display: flex;
  gap: 6px;
}

.status-field-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.status-field-label {
  font-size: 11px;
  color: var(--muted-foreground);
}

.status-field-input {
  width: 100%;
  min-width: 0;
  font-size: 13px;
}

.status-field-remove {
  position: absolute;
  top: 6px;
  right: 6px;
}

.ctx-schema-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .ctx-schema-add:hover {
    color: var(--foreground);
  }
}

.ctx-schema-add:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .status-field-input {
    font-size: 16px;
  }
}
</style>
