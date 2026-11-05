<script setup lang="ts">
/**
 * CharacterEditorHeader — 角色编辑器页头（R2-1 从 CharacterEditorView 拆出）
 *
 * 只负责"长得像页头"：标题随编辑/新建切换，右侧动作按模式增删。
 * 所有动作都以事件抛给宿主——保存要过跨字段校验、取消要先问"未保存"、
 * 删除要开确认弹窗，这些判断都不属于页头。
 *
 * 页头**没有**自己的状态：按钮的可用性（`canSave`）与模式（`isEditMode`）都由宿主算好传进来，
 * 免得"页头以为能存、宿主以为不能"这种两份真相。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

defineProps<{
  /** 编辑已有角色（决定标题文案与导出/删除两键是否出现） */
  isEditMode: boolean;
  /** 表单通过校验（决定保存键是否可点） */
  canSave: boolean;
  /**
   * 保存键是否出现。编辑态恒有；新建态只有切到完整表单才有
   * （快速档由 QuickCharacterForm 自己提交）。由宿主算，页头不猜模式。
   */
  showSave: boolean;
}>();

defineEmits<{
  /** 返回/取消：宿主负责判断要不要先弹"未保存"确认 */
  cancel: [];
  save: [];
  remove: [];
  export: [];
}>();
</script>

<template>
  <header class="editor-header">
    <button
      type="button"
      class="header-btn back"
      :aria-label="t('charEdit.backAria')"
      @click="$emit('cancel')"
    >
      <Icon name="arrow-left" :size="16" />
      <span class="btn-label">{{ t('charEdit.back') }}</span>
    </button>

    <h1 class="editor-title">
      {{ isEditMode ? t('charEdit.editTitle') : t('charEdit.newTitle') }}
    </h1>

    <div class="header-actions">
      <button
        v-if="isEditMode"
        type="button"
        class="header-btn export"
        :aria-label="t('charEdit.exportAria')"
        @click="$emit('export')"
      >
        <Icon name="download" :size="16" />
        <span class="btn-label">{{ t('charEdit.export') }}</span>
      </button>
      <button
        v-if="isEditMode"
        type="button"
        class="header-btn delete"
        :aria-label="t('charEdit.deleteAria')"
        @click="$emit('remove')"
      >
        <Icon name="trash-2" :size="16" />
        <span class="btn-label">{{ t('charEdit.delete') }}</span>
      </button>
      <button
        type="button"
        class="header-btn cancel"
        :aria-label="t('charEdit.cancel')"
        @click="$emit('cancel')"
      >
        {{ t('charEdit.cancel') }}
      </button>
      <!-- 新建态只有切到完整表单才有保存键：快速档由 QuickCharacterForm 自己提交 -->
      <button
        v-if="showSave"
        type="button"
        class="header-btn save"
        :disabled="!canSave"
        :aria-disabled="!canSave"
        :aria-label="canSave ? t('charEdit.saveAria') : t('charEdit.saveDisabled')"
        @click="$emit('save')"
      >
        <Icon name="save" :size="16" />
        <span class="btn-label">{{ t('charEdit.save') }}</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.editor-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  flex: 1;
  min-width: 120px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--size-control-md);
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover {
    border-color: var(--secondary);
    color: var(--secondary-text);
  }
}

.header-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.header-btn.save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

@media (hover: hover) and (pointer: fine) {
  .header-btn.save:hover:not(:disabled) {
    background: var(--destructive);
    border-color: var(--destructive);
    color: var(--on-accent);
  }
}

.header-btn.save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn.delete:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

.header-btn.back {
  background: none;
}

@media (max-width: 640px) {
  .header-btn .btn-label {
    display: none;
  }
  .header-btn {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
  .header-btn.cancel,
  .header-btn.save {
    width: auto;
    padding: 0 14px;
  }
  .header-btn.save .btn-label,
  .header-btn.cancel {
    display: inline;
  }
}
</style>
