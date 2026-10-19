<script setup lang="ts">
/**
 * LorebookMetaSection — 世界书元信息（名称 / 描述 + AI 扩写 / 导出 / 删除）
 *
 * R1-3 从 WorldBookView（原 3115 行）拆出。`currentLorebook` 走 props 而非
 * store：宿主已经算过一份，再算一次没意义，且 props 让"这一节画的是哪本书"
 * 在调用点就能读出来。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import type { Lorebook } from '@/core/lorebook';

const props = defineProps<{
  book: Lorebook;
  /** 生成中：置灰「AI 扩写」并改文案 */
  generating: boolean;
}>();

const emit = defineEmits<{
  nameInput: [e: Event];
  descInput: [e: Event];
  extend: [];
  export: [];
  remove: [];
}>();
</script>

<template>
  <section class="lorebook-meta" :aria-label="t('wb.metaAria')">
    <div class="meta-row">
      <label :for="`lb-name-${props.book.id}`" class="meta-label">
        {{ t('wb.nameLabel') }}
      </label>
      <input
        :id="`lb-name-${props.book.id}`"
        type="text"
        class="meta-input"
        :value="props.book.name"
        @input="emit('nameInput', $event)"
        :placeholder="t('wb.namePlaceholder')"
      />
    </div>
    <div class="meta-row">
      <label :for="`lb-desc-${props.book.id}`" class="meta-label">
        {{ t('wb.descLabel') }}
      </label>
      <textarea
        :id="`lb-desc-${props.book.id}`"
        class="meta-textarea"
        :value="props.book.description"
        @input="emit('descInput', $event)"
        :placeholder="t('wb.descPlaceholder')"
        rows="2"
      />
    </div>
    <div class="meta-actions">
      <button
        type="button"
        class="action-btn extend"
        :disabled="props.generating"
        @click="emit('extend')"
      >
        <Icon name="star" :size="14" />
        <span>{{ props.generating ? t('wb.generating') : t('wb.aiExtend') }}</span>
      </button>
      <button
        type="button"
        class="action-btn export"
        @click="emit('export')"
      >
        <Icon name="download" :size="14" />
        <span>{{ t('wb.exportJson') }}</span>
      </button>
      <button
        type="button"
        class="action-btn delete"
        @click="emit('remove')"
      >
        <Icon name="trash-2" :size="14" />
        <span>{{ t('wb.deleteLorebook') }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.lorebook-meta {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.meta-label {
  font-size: 12px;
  color: var(--muted-foreground);
  width: 48px;
  flex-shrink: 0;
}

.meta-input,
.meta-textarea {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.meta-input:focus,
.meta-textarea:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.meta-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* `.action-btn` 基类：scoped 样式到不了子组件内部，各消费者自带一份。
   值取自 WorldBookView 原定义（逐字），未提到 primitives.css ——
   WorldBookEventsPanel 用了 `.action-btn` 却没有基类（既有缺口），
   此刻提全局会把它一起改版式，超出本次拆分范围。 */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card-elevated);
  }
}

.action-btn.delete {
  color: var(--error-fg);
  border-color: var(--error);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    background: var(--error);
    color: var(--on-accent);
  }
}

.action-btn.extend {
  color: var(--accent-orange);
  border-color: var(--accent-orange);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.extend:hover:not(:disabled) {
    background: var(--accent-orange);
    color: var(--on-accent);
  }
}

.action-btn.extend:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
@media (max-width: 640px) {
  .meta-input,
  .meta-textarea {
    font-size: 16px;
  }
}
</style>
