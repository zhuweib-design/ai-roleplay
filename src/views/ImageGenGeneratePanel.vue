<script setup lang="ts">
/**
 * ImageGenGeneratePanel — 图像生成「生成」tab 面板
 *
 * 从 ImageGeneratorView.vue 拆出（R3-6）。参数表单与最新结果预览都在这里；
 * 风格预设、参数、生成状态全部来自 image-generation store，本组件不持有页面级状态。
 *
 * 通知走 `notify` emit、详情浮层走 `open-detail`、导航走 `go-settings` ——
 * 这三件的归属都在宿主（Toast / 详情 Modal / 路由策略）。
 */
import { computed } from 'vue';
import { useImageGenerationStore } from '@/stores/image-generation';
import Icon from '@/components/common/Icon.vue';
import { SIZE_DIMENSIONS } from '@/core/image-generation';
import type { ImageQuality, ImageSize, StylePresetId, GeneratedImage } from '@/core/image-generation';
import { t } from '@/i18n';
import { formatDuration } from './image-gen-format';

const store = useImageGenerationStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
  'open-detail': [image: GeneratedImage];
  'go-settings': [];
}>();

// ── 尺寸选项 ──
const sizeOptions = computed(() =>
  Object.entries(SIZE_DIMENSIONS).map(([key, val]) => ({
    value: key as ImageSize,
    label: val.label,
  }))
);

// ── 质量选项 ──
const qualityOptions: Array<{ value: ImageQuality; label: string }> = [
  { value: 'draft', label: t('imgGen.qualityDraft') },
  { value: 'standard', label: t('imgGen.qualityStandard') },
  { value: 'high', label: t('imgGen.qualityHigh') },
  { value: 'ultra', label: t('imgGen.qualityUltra') },
];

// ── 操作 ──
async function handleGenerate() {
  if (!store.canGenerate) {
    emit('notify', t('imgGen.needConfig'), 'error');
    return;
  }
  const image = await store.generate();
  if (image) {
    emit('notify', t('imgGen.success'), 'success');
  } else {
    emit('notify', store.lastError ?? t('imgGen.failed'), 'error');
  }
}

async function handleBatchGenerate() {
  if (!store.canGenerate) {
    emit('notify', t('imgGen.needConfig'), 'error');
    return;
  }
  const images = await store.generateBatch();
  emit('notify', t('imgGen.batchDone', { count: images.length }), images.length > 0 ? 'success' : 'error');
}

function openDetail(image: GeneratedImage) {
  emit('open-detail', image);
}

function goToSettings() {
  emit('go-settings');
}
</script>

<template>
  <section
    id="panel-generate"
    role="tabpanel"
    aria-labelledby="tab-generate"
    class="panel"
  >
    <!-- P2-6 UI 修复: 未配置时醒目引导用户前往设置添加模型 -->
    <div v-if="!store.canGenerate" class="config-warning" role="alert">
      <Icon name="alert-triangle" :size="18" aria-hidden="true" />
      <span class="config-warning-text">{{ t('imgGen.configWarning') }}</span>
      <button type="button" class="config-warning-btn" @click="goToSettings">
        {{ t('imgGen.goToSettings') }}
      </button>
    </div>
    <div class="generate-layout">
      <!-- 左侧：参数 -->
      <div class="params-section">
        <div class="form-group">
          <label for="prompt" class="form-label">{{ t('imgGen.promptLabel') }}</label>
          <textarea
            id="prompt"
            v-model="store.params.prompt"
            class="form-textarea"
            rows="4"
            :placeholder="t('imgGen.promptPlaceholder')"
            aria-describedby="prompt-hint"
          />
          <p id="prompt-hint" class="form-hint">{{ t('imgGen.promptHint') }}</p>
        </div>

        <div class="form-group">
          <label for="negative-prompt" class="form-label">{{ t('imgGen.negativeLabel') }}</label>
          <textarea
            id="negative-prompt"
            v-model="store.params.negativePrompt"
            class="form-textarea"
            rows="2"
            :placeholder="t('imgGen.negativePlaceholder')"
          />
        </div>

        <div class="form-group">
          <span class="form-label">{{ t('imgGen.styleLabel') }}</span>
          <div class="style-grid" role="radiogroup" :aria-label="t('imgGen.styleAria')">
            <button
              v-for="preset in store.stylePresets"
              :key="preset.id"
              type="button"
              role="radio"
              :aria-checked="store.params.style === preset.id"
              class="style-chip"
              :class="{ active: store.params.style === preset.id }"
              v-tip="preset.description"
              @click="store.setStyle(preset.id as StylePresetId)"
            >
              {{ preset.name }}
            </button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="size" class="form-label">{{ t('imgGen.sizeLabel') }}</label>
            <select id="size" v-model="store.params.size" class="form-select">
              <option v-for="opt in sizeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="quality" class="form-label">{{ t('imgGen.qualityLabel') }}</label>
            <select id="quality" v-model="store.params.quality" class="form-select">
              <option v-for="opt in qualityOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="steps" class="form-label">{{ t('imgGen.stepsLabel') }}</label>
            <input
              id="steps"
              type="number"
              min="1"
              max="100"
              v-model.number="store.params.steps"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="cfg" class="form-label">{{ t('imgGen.cfgLabel') }}</label>
            <input
              id="cfg"
              type="number"
              min="1"
              max="30"
              step="0.5"
              v-model.number="store.params.cfgScale"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="seed" class="form-label">{{ t('imgGen.seedLabel') }}</label>
            <input
              id="seed"
              type="number"
              min="-1"
              v-model.number="store.params.seed"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="batch" class="form-label">{{ t('imgGen.batchLabel') }}</label>
          <input
            id="batch"
            type="number"
            min="1"
            max="10"
            v-model.number="store.params.batchCount"
            class="form-input"
          />
        </div>

        <div class="generate-actions">
          <button
            type="button"
            class="btn primary"
            :disabled="!store.canGenerate || store.isGenerating"
            @click="handleGenerate"
          >
            <Icon name="play" :size="14" aria-hidden="true" />
            {{ t('imgGen.generateBtn') }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="!store.canGenerate || store.isGenerating"
            @click="handleBatchGenerate"
          >
            <Icon name="image-stack" :size="14" aria-hidden="true" />
            {{ t('imgGen.batchBtn') }}
          </button>
          <button
            v-if="store.isGenerating"
            type="button"
            class="btn danger"
            @click="store.cancelGeneration()"
          >
            <Icon name="stop" :size="14" aria-hidden="true" />
            {{ t('imgGen.cancelBtn') }}
          </button>
        </div>
      </div>

      <!-- 右侧：最新结果 -->
      <div class="preview-section">
        <h2 class="section-title">{{ t('imgGen.latestTitle') }}</h2>
        <div v-if="store.galleryImages.length > 0" class="latest-image">
          <img
            :src="store.galleryImages[0]!.data"
            :alt="store.galleryImages[0]!.params.prompt"
            :width="store.galleryImages[0]!.width"
            :height="store.galleryImages[0]!.height"
            class="preview-img"
            @click="openDetail(store.galleryImages[0]!)"
          />
          <p class="preview-prompt">{{ store.galleryImages[0]!.params.prompt }}</p>
          <p class="preview-meta">
            {{ formatDuration(store.galleryImages[0]!.durationMs) }} ·
            {{ store.galleryImages[0]!.width }}×{{ store.galleryImages[0]!.height }}
          </p>
        </div>
        <div v-else class="empty-preview">
          <Icon name="image" :size="48" aria-hidden="true" />
          <p>{{ t('imgGen.emptyPreview') }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 参数表单与预览的私有样式。跨 tab 共用的 .btn 族 / .form-group / .form-label /
 * .form-textarea,.form-input,.form-select / .config-warning-btn 都在宿主，经
 * `:deep()` 穿透过来 —— 本文件不重复声明，否则同一套控件会出现多份可漂移的定义。 */

/* 生成布局 */
.generate-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* P2-6 UI 修复: 未配置模型时醒目引导卡片 */
.config-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--destructive) 14%, var(--card));
  border: 1px solid color-mix(in srgb, var(--destructive) 35%, transparent);
  color: var(--foreground);
  font-size: 13px;
}

.config-warning > :first-child {
  color: var(--destructive);
  flex-shrink: 0;
}

.config-warning-text {
  flex: 1 1 auto;
}

.params-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.form-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

/* 风格选择 */
.style-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 6px;
}

.style-chip {
  padding: 6px 8px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

.style-chip.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

/* 生成按钮 */
.generate-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* 预览 */
.preview-section {
  border-left: 1px solid var(--border);
  padding-left: 20px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}

.latest-image {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-img {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  border-radius: var(--radius-md);
  cursor: pointer;
  background: var(--card-elevated);
}

.preview-prompt {
  font-size: 13px;
  margin: 0;
}

.preview-meta {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

.empty-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--muted-foreground);
  gap: 8px;
}

@media (max-width: 640px) {
  .generate-layout {
    grid-template-columns: 1fr;
  }

  .preview-section {
    border-left: none;
    padding-left: 0;
    border-top: 1px solid var(--border);
    padding-top: 16px;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
