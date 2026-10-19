<script setup lang="ts">
/**
 * LorebookGenerateModal — F06.8 AI 生成世界观（R1-3 从 WorldBookView 拆出）
 *
 * 生成中禁止关闭：Modal 里的取消按钮与遮罩都置灰。
 * 生成的这本世界归谁（`ownerId`）由宿主持有 —— 生成成功后要 bindWorldBook，
 * 那是跨 store 的动作，不属于"选模板"这件事。
 */
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import { t } from '@/i18n';
import { WORLD_TEMPLATES, type WorldTemplateId } from '@core/world-generator';

const open = defineModel<boolean>({ required: true });

const props = defineProps<{
  selectedTemplateId: WorldTemplateId;
  ownerId: string;
  ownerOptions: { id: string; name: string }[];
  generating: boolean;
  errorMessage: string | null;
}>();

const emit = defineEmits<{
  selectTemplate: [id: WorldTemplateId];
  'update:ownerId': [id: string];
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <Modal
    v-model="open"
    :title="t('wb.generateTitle')"
    described-by="wb-generate-desc"
  >
    <div class="generate-modal-body">
      <p id="wb-generate-desc" class="generate-hint">
        {{ t('wb.generateHint') }}
      </p>

      <div
        class="template-grid"
        role="radiogroup"
        :aria-label="t('wb.generateTypeAria')"
      >
        <button
          v-for="tpl in WORLD_TEMPLATES"
          :key="tpl.id"
          type="button"
          class="template-card"
          role="radio"
          :aria-checked="props.selectedTemplateId === tpl.id"
          :class="{ active: props.selectedTemplateId === tpl.id }"
          @click="emit('selectTemplate', tpl.id)"
        >
          <span class="template-label">{{ tpl.label }}</span>
          <span class="template-desc">{{ tpl.description }}</span>
        </button>
      </div>

      <div class="gen-owner">
        <label class="gen-owner-label" for="gen-owner-select">{{ t('wb.genOwnerLabel') }}</label>
        <select
          id="gen-owner-select"
          :value="props.ownerId"
          class="form-select"
          :disabled="props.generating"
          @change="emit('update:ownerId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('wb.genOwnerGlobal') }}</option>
          <option v-for="c in props.ownerOptions" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
        <p class="generate-hint">{{ t('wb.genOwnerHint') }}</p>
      </div>

      <div v-if="props.generating" class="generating-state" role="status" aria-live="polite">
        <Icon name="refresh-cw" :size="16" />
        <span>{{ t('wb.generatingWorld') }}</span>
      </div>

      <div v-if="props.errorMessage && !props.generating && open" class="generate-error" role="alert">
        {{ props.errorMessage }}
      </div>
    </div>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        :disabled="props.generating"
        @click="emit('cancel')"
      >
        {{ t('wb.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm"
        :disabled="props.generating"
        @click="emit('confirm')"
      >
        {{ props.generating ? t('wb.generating') : t('wb.generateBtn') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.generate-modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.generate-hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
}

/* 生成 Modal 里的"这本世界归谁" */
.gen-owner {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-3);
}

.gen-owner-label {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 500;
}

.gen-owner select {
  width: 100%;
}

.form-select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
}

.form-select:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.form-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.template-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1.5px solid var(--border);
  background: var(--background);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .template-card:hover {
    border-color: var(--accent-orange);
  }
}

.template-card.active {
  border-color: var(--accent-orange);
  background: rgba(224, 160, 96, 0.1);
}

.template-card .template-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--foreground);
}

.template-card .template-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.generating-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--card-elevated);
  border-radius: var(--radius-md);
  color: var(--muted-foreground);
  font-size: 13px;
}

.generating-state :deep(svg) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.generate-error {
  padding: 10px 12px;
  background: rgba(255, 82, 82, 0.1);
  border: 1px solid var(--error);
  border-radius: var(--radius-md);
  color: var(--error-fg);
  font-size: 13px;
}

@media (max-width: 640px) {
  .template-grid {
    grid-template-columns: 1fr;
  }
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-select {
    font-size: 16px;
  }
}
</style>
