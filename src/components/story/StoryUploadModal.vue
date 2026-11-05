<script setup lang="ts">
/**
 * StoryUploadModal — 上传小说并选分析深度/题材（R1-2 从 StoryEngineView 拆出）
 *
 * 表单状态（深度 / 题材 / 文件 / 文本）自持，父级只接 submit。
 * 真正的"建故事 + 跑分析"在 `useStoryGeneration` 里——那是一条跨库的写链路，
 * 不该由弹窗持有。校验失败用 `error` 事件把本地化文案交给父级弹 Toast。
 */
import { ref, useTemplateRef, watch } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import { ANALYSIS_DEPTHS, type AnalysisDepth } from '@core/story-types';
import { STORY_TEMPLATES, type StoryTemplateId } from '@core/story-templates';
import { formatCharCount } from './story-display';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  submit: [payload: {
    file: File;
    text: string;
    depth: AnalysisDepth;
    template: StoryTemplateId;
  }];
  /** 校验/读取失败：文案已本地化，父级直接弹 */
  error: [message: string];
}>();

const selectedDepth = ref<AnalysisDepth>('standard');
const selectedTemplate = ref<StoryTemplateId>('generic');
const selectedFile = ref<File | null>(null);
/** 保留上传的文本用于分析 */
const fileText = ref<string>('');
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    // 每次打开回到默认值（原实现是在 openUploadModal() 里重置的）
    selectedDepth.value = 'standard';
    selectedTemplate.value = 'generic';
    selectedFile.value = null;
    fileText.value = '';
  }
);

function close(): void {
  emit('update:open', false);
  // 延迟清空以便关闭动画（与拆分前一致）
  setTimeout(() => {
    selectedFile.value = null;
    fileText.value = '';
  }, 200);
}

function handleFileSelect(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    void loadFileContent(input.files[0]!);
  }
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    void loadFileContent(event.dataTransfer.files[0]!);
  }
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

async function loadFileContent(file: File): Promise<void> {
  const ext = getExtension(file.name);
  const supportedExts = ['txt', 'md', 'markdown', 'text'];
  if (!supportedExts.includes(ext)) {
    emit('error', t('story.unsupportedExt', { ext, supported: supportedExts.join(', ') }));
    return;
  }

  const MAX_STORY_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_STORY_FILE_SIZE) {
    emit('error', t('story.fileTooLarge', { size: MAX_STORY_FILE_SIZE / 1024 / 1024 }));
    return;
  }

  try {
    const text = await file.text();
    if (text.trim().length === 0) {
      emit('error', t('story.fileEmpty'));
      return;
    }
    selectedFile.value = file;
    fileText.value = text;
  } catch (err) {
    emit('error', t('story.readFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

function handleUpload(): void {
  if (!selectedFile.value || !fileText.value) {
    emit('error', t('story.selectFile'));
    return;
  }
  emit('submit', {
    file: selectedFile.value,
    text: fileText.value,
    depth: selectedDepth.value,
    template: selectedTemplate.value,
  });
}
</script>

<template>
  <Modal
    :model-value="open"
    :title="t('story.uploadTitle')"
    :aria-label="t('story.uploadAria2')"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="upload-content">
      <!-- 分析深度选择 -->
      <fieldset class="depth-fieldset">
        <legend class="depth-legend">{{ t('story.depthLegend') }}</legend>
        <div class="depth-options" role="radiogroup" :aria-label="t('story.depthAria')">
          <label
            v-for="depth in ANALYSIS_DEPTHS"
            :key="depth.id"
            class="depth-option"
            :class="{ active: selectedDepth === depth.id }"
          >
            <input
              type="radio"
              name="depth"
              :value="depth.id"
              v-model="selectedDepth"
            />
            <div class="depth-info">
              <div class="depth-label">{{ depth.label }}</div>
              <div class="depth-desc">{{ depth.description }}</div>
              <div class="depth-token">
                {{ t('story.depthToken', { min: depth.tokenEstimate.min, max: depth.tokenEstimate.max }) }}
              </div>
            </div>
          </label>
        </div>
      </fieldset>

      <!-- 题材模板选择 -->
      <fieldset class="depth-fieldset">
        <legend class="depth-legend">{{ t('storyTemplate.legend') }}</legend>
        <div class="template-options" role="radiogroup" :aria-label="t('storyTemplate.legend')">
          <label
            v-for="tmpl in STORY_TEMPLATES"
            :key="tmpl.id"
            class="template-option"
            :class="{ active: selectedTemplate === tmpl.id }"
          >
            <input
              type="radio"
              name="template"
              :value="tmpl.id"
              v-model="selectedTemplate"
            />
            <div class="template-info">
              <div class="template-label">{{ tmpl.name }}</div>
              <div class="template-desc">{{ tmpl.description }}</div>
            </div>
          </label>
        </div>
      </fieldset>

      <!-- 文件拖拽区 -->
      <div
        class="drop-zone"
        :class="{ active: selectedFile !== null }"
        role="button"
        tabindex="0"
        :aria-label="t('story.dropAria')"
        @click="fileInput?.click()"
        @keydown.enter.prevent="fileInput?.click()"
        @keydown.space.prevent="fileInput?.click()"
        @drop="handleDrop"
        @dragover="handleDragOver"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.md,.markdown,.text"
          class="file-input-hidden"
          aria-hidden="true"
          @change="handleFileSelect"
        />
        <Icon
          :name="selectedFile ? 'file' : 'upload'"
          :size="32"
          class="drop-icon"
        />
        <p v-if="selectedFile" class="drop-text">
          {{ selectedFile.name }}
          <span class="drop-meta">{{ formatCharCount(fileText.length) }}</span>
        </p>
        <p v-else class="drop-text">{{ t('story.dropText') }}</p>
        <p class="drop-hint">{{ t('story.dropHint') }}</p>
      </div>

      <div class="upload-actions">
        <button type="button" class="btn btn-secondary" @click="close">
          {{ t('story.cancelBtn') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!selectedFile || !fileText"
          @click="handleUpload"
        >
          <Icon name="upload" :size="14" />
          {{ t('story.uploadAnalyze') }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.upload-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.depth-fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin: 0;
}

.depth-legend {
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.depth-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.depth-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .depth-option:hover {
    background: var(--card-elevated);
  }
}

.depth-option.active {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.depth-option input[type="radio"] {
  margin-top: 2px;
  accent-color: var(--primary);
}

.depth-info {
  flex: 1;
}

.depth-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.depth-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 2px;
  line-height: 1.4;
}

.depth-token {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

/* 题材模板选择 */
.template-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.template-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .template-option:hover {
    background: var(--card-elevated);
  }
}

.template-option.active {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.template-option input[type="radio"] {
  margin-top: 2px;
  accent-color: var(--primary);
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.template-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 2px;
  line-height: 1.4;
}

/* 拖拽区 */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
  text-align: center;
  outline: none;
}

@media (hover: hover) and (pointer: fine) {
  .drop-zone:hover {
    border-color: var(--primary);
    background: var(--card-elevated);
  }
}

/* focus-visible 分支不加 hover 守卫：键盘可达性不受设备 hover 能力影响 */
.drop-zone:focus-visible {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.drop-zone.active {
  border-color: var(--tag-green);
  border-style: solid;
  background: rgba(34, 197, 94, 0.05);
}

.drop-icon {
  color: var(--muted-foreground);
  margin-bottom: 8px;
}

.drop-zone.active .drop-icon {
  color: var(--tag-green);
}

.drop-text {
  font-size: 14px;
  color: var(--foreground);
  margin: 0;
  word-break: break-all;
}

.drop-meta {
  margin-left: 6px;
  color: var(--muted-foreground);
  font-size: 12px;
}

.drop-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 4px 0 0;
}

.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* 按钮三件套（全仓惯例：每个视图自带一份，见 RandomEventsView / LocalModelView 等） */

@media (hover: hover) and (pointer: fine) {
  .btn:hover:not(:disabled) {
    background: var(--card-elevated);
  }
}

@media (hover: hover) and (pointer: fine) {
  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover, var(--primary));
  }
}

</style>
