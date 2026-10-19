<script setup lang="ts">
/**
 * LorebookHeader — 世界书页头（R1-3 从 WorldBookView 拆出）
 *
 * 文件名导入控件归本组件所有（`<input type=file>` 是它自己触发的），
 * 选中文件后只把 File 抛给宿主做 store 导入 —— 这样组件不必知道 store 的形状。
 */
import { ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

const props = defineProps<{
  bookCount: number;
  /** 生成中：置灰「AI 生成」按钮 */
  generating: boolean;
}>();

const emit = defineEmits<{
  back: [];
  create: [];
  generate: [];
  import: [file: File];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

function triggerFileInput(): void {
  fileInput.value?.click();
}

function handleFileSelected(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  emit('import', input.files[0]!);
  input.value = '';
}
</script>

<template>
  <header class="page-header">
    <div class="header-title">
      <button
        type="button"
        class="header-btn back"
        :aria-label="t('wb.backAria')"
        @click="emit('back')"
      >
        <Icon name="arrow-left" :size="16" />
        <span class="btn-label">{{ t('wb.back') }}</span>
      </button>
      <h1>{{ t('wb.title') }}</h1>
      <span class="header-count">{{ t('wb.count', { count: props.bookCount }) }}</span>
    </div>

    <div class="header-actions">
      <button
        type="button"
        class="header-btn generate-btn"
        :aria-label="t('wb.aiGenerateAria')"
        :disabled="props.generating"
        @click="emit('generate')"
      >
        <Icon name="star" :size="16" />
        <span class="btn-label">{{ t('wb.aiGenerate') }}</span>
      </button>
      <button
        type="button"
        class="header-btn import-btn"
        :aria-label="t('wb.importAria')"
        @click="triggerFileInput"
      >
        <Icon name="upload" :size="16" />
        <span class="btn-label">{{ t('wb.import') }}</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        class="hidden-file-input"
        aria-hidden="true"
        tabindex="-1"
        @change="handleFileSelected"
      />
      <button
        type="button"
        class="header-btn new-btn"
        :aria-label="t('wb.newAria')"
        @click="emit('create')"
      >
        <Icon name="plus" :size="16" />
        <span class="btn-label">{{ t('wb.new') }}</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 390px 实测：标题与右侧动作组同行时，标题被压到 20px 宽（"世界书"三个字竖排）。
     允许换行 + 标题不折行，动作组放不下就整排落到第二行。 */
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--foreground);
}

.header-count {
  font-size: 12px;
  color: var(--muted-foreground);
}

.header-actions {
  display: flex;
  gap: 8px;
  /* 390px 实测：标题与这排按钮同行时被按比例压缩，"AI 生成"被压成 25×51（三行竖排）。
     动作组不该收缩，标题该让位。 */
  flex-shrink: 0;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  white-space: nowrap;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover {
    background: var(--card-elevated);
    border-color: var(--border);
  }
}

.header-btn.back {
  background: none;
  border-color: transparent;
}

.header-btn.new-btn {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .header-btn.new-btn:hover {
    opacity: 0.9;
  }
}

.header-btn.generate-btn {
  background: var(--accent-orange);
  color: var(--on-accent);
  border-color: var(--accent-orange);
}

@media (hover: hover) and (pointer: fine) {
  .header-btn.generate-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
}

.header-btn.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

/* 批次 3-2：页头动作按钮 */
@media (max-width: 640px) {
  .header-btn {
    min-height: var(--touch-min);
    min-width: var(--touch-min);
  }
}
</style>
