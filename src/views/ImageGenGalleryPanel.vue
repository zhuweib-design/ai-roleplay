<script setup lang="ts">
/**
 * ImageGenGalleryPanel — 图像生成「画廊」tab 面板
 *
 * 从 ImageGeneratorView.vue 拆出（R3-6）。搜索 / 风格筛选 / 统计 / 网格 / 空态，
 * 外加两个破坏性操作的确认浮层（删单图、清空画廊）—— 这两个浮层只由本 tab 触发，
 * 所以随画廊一起下移，宿主不再持有 deleteTargetId / clearAllOpen。
 *
 * 打开详情仍要走宿主：detailImage / detailOpen 与那个 Modal 是跨 tab 的，
 * 生成 tab 的预览图也会打开同一个浮层。
 */
import { ref, computed } from 'vue';
import { useImageGenerationStore } from '@/stores/image-generation';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Modal from '@/components/common/Modal.vue';
import type { GeneratedImage } from '@/core/image-generation';
import { t } from '@/i18n';
import { downloadImage, formatDuration } from './image-gen-format';

const store = useImageGenerationStore();

const emit = defineEmits<{
  notify: [message: string, type?: 'info' | 'success' | 'error'];
  'open-detail': [image: GeneratedImage];
}>();

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

// P2-8 删除确认(pre-launch 全检): 删单图/清空画廊均为破坏性操作, 先确认后执行
const deleteModalOpen = ref(false);
const deleteTargetId = ref<string | null>(null);
const clearAllOpen = ref(false);

// ── 操作 ──
function openDetail(image: GeneratedImage) {
  emit('open-detail', image);
}

function handleDelete(id: string) {
  deleteTargetId.value = id;
  deleteModalOpen.value = true;
}

async function confirmDeleteImage() {
  if (!deleteTargetId.value) return;
  await store.deleteFromGallery(deleteTargetId.value);
  deleteTargetId.value = null;
  deleteModalOpen.value = false;
  emit('notify', t('imgGen.deleted'), 'info');
}

function handleClearGallery() {
  clearAllOpen.value = true;
}

async function confirmClearGallery() {
  await store.clearGallery();
  clearAllOpen.value = false;
  emit('notify', t('imgGen.galleryCleared'), 'info');
}
</script>

<template>
  <section
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
          :width="img.width"
          :height="img.height"
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
    <EmptyState
      v-else
      title-key="imgGen.emptyGallery"
      desc-key="imgGen.emptyGalleryHint"
      icon="image"
    />

    <!-- P2-8 删除单图确认 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('imgGen.deleteConfirmTitle')"
      :aria-label="t('imgGen.deleteConfirmTitle')"
      described-by="img-delete-desc"
    >
      <p id="img-delete-desc">{{ t('imgGen.deleteConfirm') }}</p>
      <template #footer>
        <button type="button" class="modal-btn modal-cancel" @click="deleteTargetId = null">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="modal-btn modal-confirm" @click="confirmDeleteImage">
          {{ t('common.delete') }}
        </button>
      </template>
    </Modal>

    <!-- P2-8 清空画廊确认 -->
    <Modal
      v-model="clearAllOpen"
      :title="t('imgGen.clearConfirmTitle')"
      :aria-label="t('imgGen.clearConfirmTitle')"
      described-by="img-clear-desc"
    >
      <p id="img-clear-desc">{{ t('imgGen.clearConfirm') }}</p>
      <template #footer>
        <button type="button" class="modal-btn modal-cancel" @click="clearAllOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="modal-btn modal-confirm" @click="confirmClearGallery">
          {{ t('common.delete') }}
        </button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.form-select.small {
  width: auto;
  min-width: 120px;
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

@media (hover: hover) and (pointer: fine) {
  .gallery-item:hover .gallery-overlay {
    opacity: 1;
  }
}
/* I-5（2026-09-16）：触屏无 hover，画廊操作遮罩常显，保证下载/查看等操作可达 */
@media (hover: none) {
  .gallery-overlay {
    opacity: 1;
  }
}

.gallery-prompt {
  font-size: 11px;
  color: var(--on-media);
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
  /* 原为 rgba(255,255,255,0.2) + --on-media 白字：这组控件是叠在**图片**上的浮层，
     白 20% 蒙版落在浅色图片上时白字几乎不可读（静态扫描合成到白卡上得 1.00:1，
     不是纯误报）。改用 --media-scrim（与 --on-media 成对，随皮肤反向）后与图片
     明暗无关，恒达 AA。 */
  background: var(--media-scrim);
  border: none;
  color: var(--on-media);
  padding: 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn:hover {
    background: var(--media-scrim-hover);
  }
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn.danger:hover {
    background: var(--danger, #ef4444);
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）
   * .search-input 的基础规则（13px）在本文件，故它的 16px 兜底也留在这里 ——
   * i7 守卫按「同文件内、同选择器」判已覆盖，搬到宿主会被算成「未覆盖」。
   * 表单族的那四条兜底在宿主，和它们的基础规则同处一文件。 */
  .search-input {
    font-size: 16px;
  }
}
</style>
