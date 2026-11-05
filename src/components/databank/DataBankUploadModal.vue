<script setup lang="ts">
/**
 * DataBankUploadModal — 数据银行「上传文档」弹窗（R4-10 从 DataBankView 抽出）
 *
 * 整块 89 行 template + 78 行样式，且与页面主区无耦合（只读写自己的 3 个 UI 状态
 * 与 store 的两个结果字段）。抽出的同时把「选文件 / 拖拽 / 校验 / 提交」一并收进来，
 * 宿主只剩一个 `@uploaded` 回调。
 *
 * 无障碍口径不变：fieldset/legend + role=radiogroup + aria-label + 隐藏 file input 铺满拖拽区。
 */
import { ref, computed } from 'vue';
import Modal from '@/components/common/Modal.vue';
import Icon from '@/components/common/Icon.vue';
import { useDataBankStore } from '@/stores/data-bank';
import { useCharacterStore } from '@/stores/character';
import { MAX_FILE_SIZE } from '@/core/data-bank';
import type { DataBankScope } from '@/core/data-bank';
import { formatFileSize } from '@/utils/format';
import { t } from '@/i18n';

const props = defineProps<{
  /** 弹窗开关（v-model） */
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 上传完成，参数为 store.lastInfo 文案 */
  uploaded: [info: string];
}>();

const store = useDataBankStore();
const characterStore = useCharacterStore();

const selectedScope = ref<DataBankScope>('global');
const selectedCharacterId = ref<string>('');
const selectedFile = ref<File | null>(null);
/** 上传进行中（防重复提交；同时禁用确认按钮） */
const busy = ref(false);
/** 校验/上传失败提示，就地显示在弹窗内（见模板 .upload-error） */
const errorMessage = ref('');

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

/** 每次打开都重置表单，行为与原 `openUploadModal()` 一致 */
function resetForm() {
  selectedScope.value = 'global';
  selectedCharacterId.value = '';
  selectedFile.value = null;
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]!;
    errorMessage.value = '';
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    selectedFile.value = event.dataTransfer.files[0]!;
    errorMessage.value = '';
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}

async function handleUpload() {
  if (!selectedFile.value) {
    errorMessage.value = t('databank.selectFileFirst');
    return;
  }
  if (selectedFile.value.size > MAX_FILE_SIZE) {
    errorMessage.value = t('databank.fileTooLarge', { size: MAX_FILE_SIZE / 1024 / 1024 });
    return;
  }
  const characterId =
    selectedScope.value === 'character' && selectedCharacterId.value
      ? selectedCharacterId.value
      : undefined;

  busy.value = true;
  try {
    const id = await store.createDocumentFromFile(
      selectedFile.value,
      selectedScope.value,
      characterId
    );
    if (id) {
      open.value = false;
      resetForm();
      if (store.lastInfo) emit('uploaded', store.lastInfo);
    } else if (store.lastError) {
      errorMessage.value = store.lastError;
    }
  } finally {
    busy.value = false;
  }
}

function close() {
  open.value = false;
  resetForm();
  errorMessage.value = '';
}
</script>

<template>
  <Modal
    v-model="open"
    :title="t('databank.uploadTitle')"
    :aria-label="t('databank.uploadAria2')"
  >
    <div class="upload-content">
      <!-- 作用域选择 -->
      <fieldset class="scope-fieldset">
        <legend class="scope-legend">{{ t('databank.scope') }}</legend>
        <div class="scope-options" role="radiogroup" :aria-label="t('databank.scopeAria')">
          <label class="scope-option">
            <input
              type="radio"
              name="scope"
              value="global"
              v-model="selectedScope"
            />
            <span class="scope-label">{{ t('databank.scopeGlobal') }}</span>
          </label>
          <label class="scope-option">
            <input
              type="radio"
              name="scope"
              value="character"
              v-model="selectedScope"
            />
            <span class="scope-label">{{ t('databank.scopeCharacter') }}</span>
          </label>
        </div>
      </fieldset>

      <!-- 角色选择（scope=character 时显示） -->
      <div v-if="selectedScope === 'character'" class="char-select">
        <label for="character-select" class="char-select-label">{{ t('databank.bindCharacter') }}</label>
        <select
          id="character-select"
          v-model="selectedCharacterId"
          class="char-select-input"
          :aria-label="t('databank.bindCharacterAria')"
        >
          <option value="">{{ t('databank.selectCharacter') }}</option>
          <option
            v-for="char in characterStore.characters"
            :key="char.id"
            :value="char.id"
          >
            {{ char.name }}
          </option>
        </select>
      </div>

      <!-- 文件拖拽区 -->
      <div
        class="drop-zone"
        :class="{ active: selectedFile }"
        @drop="handleDrop"
        @dragover="handleDragOver"
      >
        <Icon name="upload" :size="32" class="drop-icon" />
        <p v-if="!selectedFile" class="drop-text">{{ t('databank.dropHint') }}</p>
        <p v-else class="drop-file-name">{{ t('databank.fileNameSize', { name: selectedFile.name, size: formatFileSize(selectedFile.size) }) }}</p>
        <input
          type="file"
          class="hidden-file-input"
          accept=".txt,.md,.markdown,.html,.htm,.csv,.json"
          :aria-label="t('databank.selectFileAria')"
          @change="handleFileSelect"
        />
      </div>

      <p class="upload-hint">
        {{ t('databank.uploadHint', { size: MAX_FILE_SIZE / 1024 / 1024 }) }}
      </p>
    </div>

    <template #footer>
      <button type="button" class="modal-btn modal-cancel" @click="close">
        {{ t('databank.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm"
        :disabled="busy || !selectedFile || (selectedScope === 'character' && !selectedCharacterId)"
        @click="handleUpload"
      >
        {{ t('databank.uploadBtn') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
/* 上传 Modal */
.upload-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scope-fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.scope-legend {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  margin-bottom: 8px;
  padding: 0;
}

.scope-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scope-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.scope-option input[type="radio"] {
  cursor: pointer;
}

.scope-label {
  font-size: 13px;
  color: var(--foreground);
}

.char-select {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-select-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.char-select-input {
  height: var(--size-control-md);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
}

.char-select-input:focus {
  outline: 2px solid var(--secondary);
  outline-offset: -1px;
}

/* 拖拽区 */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 20px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  position: relative;
}

@media (hover: hover) and (pointer: fine) {
  .drop-zone:hover {
    border-color: var(--secondary);
    background: var(--card-elevated);
  }
}

.drop-zone.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 5%, var(--background));
}

.drop-icon {
  color: var(--muted-foreground);
}

.drop-text {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
}

.drop-file-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.hidden-file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.upload-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

/* Modal 按钮（本组件只用 confirm / cancel 两种；.modal-delete 留在宿主） */
/* 弹窗按钮的盒模型、焦点环、禁用态与过渡统一由 primitives.css 的 `.modal-btn` 提供
   （Q8，2026-10-26）：这里不再复制基类，只保留下面与语义有关的配色变体。 */
@media (hover: hover) and (pointer: fine) {
  .modal-btn:hover:not(:disabled) {
    background: var(--card-elevated);
  }
}

.modal-confirm {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .char-select-input {
    font-size: 16px;
  }
}
</style>
