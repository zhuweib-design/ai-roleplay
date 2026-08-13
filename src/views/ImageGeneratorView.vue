<script setup lang="ts">
/**
 * ImageGeneratorView — 图像生成集成 (模块3)
 *
 * 功能：
 * - 提示词输入与参数调整
 * - 风格预设选择
 * - 批量生成
 * - 图像画廊
 * - Provider 配置
 *
 * 无障碍：
 * - 语义化结构
 * - ARIA 标签
 * - 键盘可访问
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useImageGenerationStore } from '@/stores/image-generation';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import { SIZE_DIMENSIONS } from '@/core/image-generation';
import type { ImageSize, ImageQuality, StylePresetId, ProviderType, GeneratedImage } from '@/core/image-generation';
import { t } from '@/i18n';

const router = useRouter();
const store = useImageGenerationStore();

// ── Tab ──
type TabKey = 'generate' | 'gallery' | 'settings';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'generate', label: t('imgGen.tabGenerate') },
  { key: 'gallery', label: t('imgGen.tabGallery') },
  { key: 'settings', label: t('imgGen.tabSettings') },
];
const activeTab = ref<TabKey>('generate');

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

// ── Provider 类型选项 ──
const providerTypeOptions: Array<{ value: ProviderType; label: string }> = [
  { value: 'openai', label: t('imgGen.providerOpenai') },
  { value: 'custom', label: t('imgGen.providerCustom') },
];

// ── Toast ──
const toastOpen = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'success' | 'error'>('info');

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  toastMessage.value = message;
  toastType.value = type;
  toastOpen.value = true;
}

// ── 画廊搜索 ──
const searchQuery = ref('');
const filterStyle = ref<string>('all');
const filteredGallery = computed(() => {
  let list = store.galleryImages;
  if (filterStyle.value !== 'all') {
    list = list.filter((img) => img.params.style === filterStyle.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (img) =>
        img.params.prompt.toLowerCase().includes(q) ||
        img.provider.toLowerCase().includes(q)
    );
  }
  return list;
});

// ── 图像详情 Modal ──
const detailOpen = ref(false);
const detailImage = ref<GeneratedImage | null>(null);

// ── 操作 ──
function goBack() {
  router.push({ name: 'chat' });
}

async function handleGenerate() {
  if (!store.canGenerate) {
    showToast(t('imgGen.needConfig'), 'error');
    return;
  }
  const image = await store.generate();
  if (image) {
    showToast(t('imgGen.success'), 'success');
  } else {
    showToast(store.lastError ?? t('imgGen.failed'), 'error');
  }
}

async function handleBatchGenerate() {
  if (!store.canGenerate) {
    showToast(t('imgGen.needConfig'), 'error');
    return;
  }
  const images = await store.generateBatch();
  showToast(t('imgGen.batchDone', { count: images.length }), images.length > 0 ? 'success' : 'error');
}

function openDetail(image: GeneratedImage) {
  detailImage.value = image;
  detailOpen.value = true;
}

function downloadImage(image: GeneratedImage) {
  const link = document.createElement('a');
  link.href = image.data;
  link.download = `${image.id}.png`;
  link.click();
}

async function handleDelete(id: string) {
  await store.deleteFromGallery(id);
  showToast(t('imgGen.deleted'), 'info');
}

async function handleClearGallery() {
  await store.clearGallery();
  showToast(t('imgGen.galleryCleared'), 'info');
}

// ── 工具 ──
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// ── 初始化 ──
onMounted(async () => {
  await store.loadGallery();
});
</script>

<template>
  <div class="image-gen-view">
    <header class="page-header">
      <div class="header-title">
        <button type="button" class="header-btn" :aria-label="t('imgGen.backAria')" @click="goBack">
          <Icon name="arrow-left" :size="18" aria-hidden="true" />
        </button>
        <h1>{{ t('imgGen.title') }}</h1>
        <span class="header-tag" :class="{ enabled: store.providerConfig.enabled }">
          {{ store.providerConfig.enabled ? t('imgGen.configured') : t('imgGen.notConfigured') }}
        </span>
      </div>
    </header>

    <nav class="tabs" role="tablist" :aria-label="t('imgGen.tabsAria')">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`panel-${tab.key}`"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'gallery'" class="tab-count">{{ store.galleryStats.count }}</span>
      </button>
    </nav>

    <main class="page-body">
      <!-- 生成面板 -->
      <section
        v-show="activeTab === 'generate'"
        id="panel-generate"
        role="tabpanel"
        aria-labelledby="tab-generate"
        class="panel"
      >
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
                  :title="preset.description"
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
                :src="store.galleryImages[0].data"
                :alt="store.galleryImages[0].params.prompt"
                class="preview-img"
                @click="openDetail(store.galleryImages[0])"
              />
              <p class="preview-prompt">{{ store.galleryImages[0].params.prompt }}</p>
              <p class="preview-meta">
                {{ formatDuration(store.galleryImages[0].durationMs) }} ·
                {{ store.galleryImages[0].width }}×{{ store.galleryImages[0].height }}
              </p>
            </div>
            <div v-else class="empty-preview">
              <Icon name="image" :size="48" aria-hidden="true" />
              <p>{{ t('imgGen.emptyPreview') }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 画廊 -->
      <section
        v-show="activeTab === 'gallery'"
        id="panel-gallery"
        role="tabpanel"
        aria-labelledby="tab-gallery"
        class="panel"
      >
        <div class="panel-toolbar">
          <input
            type="search"
            v-model="searchQuery"
            class="search-input"
            :placeholder="t('imgGen.searchPlaceholder')"
            :aria-label="t('imgGen.searchAria')"
          />
          <select v-model="filterStyle" class="form-select small" :aria-label="t('imgGen.filterAria')">
            <option value="all">{{ t('imgGen.filterAll') }}</option>
            <option v-for="preset in store.stylePresets" :key="preset.id" :value="preset.id">
              {{ preset.name }}
            </option>
          </select>
          <button type="button" class="btn danger" @click="handleClearGallery">
            <Icon name="trash-2" :size="14" aria-hidden="true" />
            {{ t('imgGen.clearBtn') }}
          </button>
        </div>

        <div class="gallery-stats">
          <span>{{ t('imgGen.statsCount', { count: store.galleryStats.count }) }}</span>
          <span>{{ t('imgGen.statsSize', { size: store.galleryStats.totalSizeMb.toFixed(1) }) }}</span>
          <span>{{ t('imgGen.statsAvg', { duration: formatDuration(store.galleryStats.avgDurationMs) }) }}</span>
        </div>

        <ul v-if="filteredGallery.length > 0" class="gallery-grid" role="list">
          <li
            v-for="img in filteredGallery"
            :key="img.id"
            class="gallery-item"
          >
            <img
              :src="img.data"
              :alt="img.params.prompt"
              class="gallery-img"
              loading="lazy"
              @click="openDetail(img)"
            />
            <div class="gallery-overlay">
              <p class="gallery-prompt">{{ img.params.prompt }}</p>
              <div class="gallery-item-actions">
                <button type="button" class="icon-btn" :aria-label="t('imgGen.downloadAria')" @click="downloadImage(img)">
                  <Icon name="download" :size="14" aria-hidden="true" />
                </button>
                <button type="button" class="icon-btn danger" :aria-label="t('imgGen.deleteAria')" @click="handleDelete(img.id)">
                  <Icon name="trash-2" :size="14" aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>
        </ul>
        <div v-else class="empty-state">
          <Icon name="image" :size="48" aria-hidden="true" />
          <p>{{ t('imgGen.emptyGallery') }}</p>
          <p class="empty-hint">{{ t('imgGen.emptyGalleryHint') }}</p>
        </div>
      </section>

      <!-- 设置 -->
      <section
        v-show="activeTab === 'settings'"
        id="panel-settings"
        role="tabpanel"
        aria-labelledby="tab-settings"
        class="panel"
      >
        <div class="settings-form">
          <div class="form-group">
            <label for="provider-type" class="form-label">{{ t('imgGen.providerType') }}</label>
            <select
              id="provider-type"
              v-model="store.providerConfig.type"
              class="form-select"
            >
              <option v-for="opt in providerTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="endpoint" class="form-label">{{ t('imgGen.endpoint') }}</label>
            <input
              id="endpoint"
              type="url"
              v-model="store.providerConfig.endpoint"
              class="form-input"
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div class="form-group">
            <label for="api-key" class="form-label">{{ t('imgGen.apiKey') }}</label>
            <input
              id="api-key"
              type="password"
              v-model="store.providerConfig.apiKey"
              class="form-input"
              placeholder="sk-..."
            />
          </div>

          <div class="form-group">
            <label for="model" class="form-label">{{ t('imgGen.model') }}</label>
            <input
              id="model"
              type="text"
              v-model="store.providerConfig.model"
              class="form-input"
              placeholder="dall-e-3"
            />
          </div>

          <label class="setting-row">
            <input
              type="checkbox"
              v-model="store.providerConfig.enabled"
            />
            <span>{{ t('imgGen.enableProvider') }}</span>
          </label>
        </div>
      </section>
    </main>

    <!-- 图像详情 Modal -->
    <Modal :model-value="detailOpen" :title="t('imgGen.detailTitle')" @update:model-value="detailOpen = $event">
      <div v-if="detailImage" class="detail-content">
        <img :src="detailImage.data" :alt="detailImage.params.prompt" class="detail-img" />
        <dl class="detail-meta">
          <div><dt>{{ t('imgGen.detailPrompt') }}</dt><dd>{{ detailImage.params.prompt }}</dd></div>
          <div v-if="detailImage.params.negativePrompt">
            <dt>{{ t('imgGen.detailNegative') }}</dt><dd>{{ detailImage.params.negativePrompt }}</dd>
          </div>
          <div><dt>{{ t('imgGen.detailSize') }}</dt><dd>{{ detailImage.width }}×{{ detailImage.height }}</dd></div>
          <div><dt>{{ t('imgGen.detailStyle') }}</dt><dd>{{ detailImage.params.style }}</dd></div>
          <div><dt>{{ t('imgGen.detailProvider') }}</dt><dd>{{ detailImage.provider }}</dd></div>
          <div><dt>{{ t('imgGen.detailDuration') }}</dt><dd>{{ formatDuration(detailImage.durationMs) }}</dd></div>
          <div><dt>{{ t('imgGen.detailTime') }}</dt><dd>{{ formatTime(detailImage.createdAt) }}</dd></div>
          <div v-if="detailImage.params.seed >= 0">
            <dt>{{ t('imgGen.detailSeed') }}</dt><dd>{{ detailImage.params.seed }}</dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <button type="button" class="btn" @click="detailOpen = false">{{ t('imgGen.closeBtn') }}</button>
        <button
          v-if="detailImage"
          type="button"
          class="btn primary"
          @click="downloadImage(detailImage)"
        >
          <Icon name="download" :size="14" aria-hidden="true" />
          {{ t('imgGen.downloadBtn') }}
        </button>
      </template>
    </Modal>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.image-gen-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
  color: var(--foreground);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.header-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.header-tag.enabled {
  background: color-mix(in srgb, var(--success) 20%, transparent);
  color: var(--success);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
}

.tab {
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tab.active {
  color: var(--primary-fg, var(--primary));
  border-bottom-color: var(--primary);
}

.tab-count {
  font-size: 11px;
  background: var(--card-elevated);
  padding: 0 6px;
  border-radius: 999px;
  color: var(--muted-foreground);
}

/* Panel */
.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

/* 生成布局 */
.generate-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.params-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.form-textarea,
.form-input,
.form-select {
  padding: 8px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.form-select.small {
  width: auto;
  min-width: 120px;
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
  transition: all .15s ease;
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

.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.btn.danger {
  color: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
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

/* 画廊 */
.gallery-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 13px;
  min-width: 200px;
}

.gallery-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.gallery-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--card-elevated);
  cursor: pointer;
}

.gallery-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.8), transparent 60%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 8px;
  opacity: 0;
  transition: opacity .2s ease;
}

.gallery-item:hover .gallery-overlay {
  opacity: 1;
}

.gallery-prompt {
  font-size: 11px;
  color: #fff;
  margin: 0 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gallery-item-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.icon-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: #fff;
  padding: 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
}

.icon-btn:hover {
  background: rgba(255,255,255,0.3);
}

.icon-btn.danger:hover {
  background: var(--danger, #ef4444);
}

/* 设置表单 */
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 500px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

/* 图像详情 */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-img {
  width: 100%;
  max-height: 50vh;
  object-fit: contain;
  border-radius: var(--radius-md);
  background: var(--card-elevated);
}

.detail-meta {
  display: grid;
  gap: 6px;
  font-size: 12px;
  margin: 0;
}

.detail-meta div {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
}

.detail-meta dt {
  color: var(--muted-foreground);
}

.detail-meta dd {
  margin: 0;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--muted-foreground);
  gap: 8px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.empty-hint {
  font-size: 12px !important;
}

/* 响应式 */
@media (max-width: 767px) {
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
