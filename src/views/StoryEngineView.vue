<script setup lang="ts">
/**
 * StoryEngineView — 故事引擎页面 (F16.1)
 *
 * 功能：
 * - 上传小说文件（TXT/MD），选择分析深度（快速/标准/深度）
 * - 调用 LLM 进行结构化分析，提取人物/场景/事件/世界/脚本
 * - 实时进度跟踪（已完成分块/总分块）
 * - 取消分析（AbortController）
 * - 故事卡片列表（按创建时间降序）
 * - 展开查看分析结果详情（人物、场景、事件、世界信息、脚本）
 * - 删除故事（带确认 Modal）
 *
 * 无障碍：
 * - 语义化 main/section/article
 * - aria-label 标注图标按钮
 * - Modal 焦点陷阱
 * - 删除前确认
 * - Toast role=alert 反馈
 * - 进度条 role="progressbar"
 *
 * R1-2 拆分后的分工（本文件只剩"页头 + 工具条 + 列表骨架 + 弹窗接线"）：
 * - 一键生成设定 → `StoryQuickSetupPanel`
 * - 故事卡片（含动作区）→ `StoryCard`
 * - 展开详情（外壳/人物/世界内容）→ `StoryDetailPanel` + `StoryDetailCharacters` + `StoryDetailWorld`
 * - 三个弹窗 → `StoryUploadModal` / `StoryImportModal` / `StoryProtagonistModal`
 * - 上传→分析链路 → `useStoryGeneration`；搜索与状态分类 → `useStoryFilters`
 * - 展示格式化 → `story-display.ts`
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDeepLinkId } from '@/composables/useDeepLinkId';
import { useStoryGeneration } from '@/composables/useStoryGeneration';
import { useStoryFilters } from '@/composables/useStoryFilters';
import { useStoryStore } from '@/stores/story';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import FilterTabs from '@/components/common/FilterTabs.vue';
import StoryQuickSetupPanel from '@/components/story/StoryQuickSetupPanel.vue';
import StoryCard from '@/components/story/StoryCard.vue';
import StoryDetailPanel from '@/components/story/StoryDetailPanel.vue';
import StoryUploadModal from '@/components/story/StoryUploadModal.vue';
import StoryImportModal from '@/components/story/StoryImportModal.vue';
import StoryProtagonistModal from '@/components/story/StoryProtagonistModal.vue';
import { t } from '@/i18n';

const router = useRouter();
const store = useStoryStore();
const settingsStore = useSettingsStore();

const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);

// ── UI 状态 ──
const uploadModalOpen = ref(false);
const deleteTargetId = ref<string | null>(null);
const deleteModalOpen = ref(false);
const expandedStoryId = ref<string | null>(null);
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

// ── F16.2 / F16.3 弹窗开关（表单状态在各自的弹窗里）──
const importModalOpen = ref(false);
const importTargetStoryId = ref<string | null>(null);
const protagonistModalOpen = ref(false);
const protagonistTargetStoryId = ref<string | null>(null);
const protagonistPresetName = ref<string | null>(null);

const importTargetStory = computed(() =>
  store.stories.find((s) => s.id === importTargetStoryId.value) ?? null
);

const protagonistTargetStory = computed(() =>
  store.stories.find((s) => s.id === protagonistTargetStoryId.value) ?? null
);

// ── Toast ──
function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

const { stories, statusFilterTabs, filterStatus } = useStoryFilters();
const { isAnalyzing, progress, progressPercent, handleUpload, handleCancelAnalysis } =
  useStoryGeneration({ showToast });

/**
 * E15：聊天页的故事时间现在可点进来，带 `?story=<id>` 时直接选中那一条。
 * 只认 stories 里真实存在的 id——手打的、或故事已删除留下的过期链接，
 * 都不该把界面停在一个空选中态上。
 *
 * 取 id、等读库、等待期间 URL 变化作废，全部收进 useDeepLinkId（M14-a）。
 */
useDeepLinkId({
  key: 'story',
  // 闸门由登记表给（src/core/deep-link-keys.ts）：视图只说键名，不自己挑库
  onResolved: (id) => {
    if (store.stories.some((s) => s.id === id)) {
      store.selectStory(id);
      return;
    }
    // 读完仍然没有 ⇒ 链接过期或手打错，说给用户听（原来同样静默）
    showToast('error', t('story.notFound2'));
  },
});

function goBack() {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

function openUploadModal() {
  if (!hasApiProfile.value) {
    showToast('error', t('story.apiRequired'));
    return;
  }
  uploadModalOpen.value = true;
}

/** 上传弹窗提交：建记录 → 立刻关弹窗 → 后台跑分析（顺序见 useStoryGeneration） */
function onSubmitUpload(payload: Parameters<typeof handleUpload>[0]): void {
  void handleUpload(payload, () => {
    uploadModalOpen.value = false;
  });
}

function confirmDelete(id: string) {
  deleteTargetId.value = id;
  deleteModalOpen.value = true;
}

async function handleDelete() {
  if (!deleteTargetId.value) return;
  await store.deleteStory(deleteTargetId.value);
  deleteModalOpen.value = false;
  deleteTargetId.value = null;
  showToast('success', t('story.deleted'));
}

function toggleExpand(id: string) {
  expandedStoryId.value = expandedStoryId.value === id ? null : id;
}

// ── F16.2 导入 / F16.3 主角：只负责"给哪个故事开" ──

function openImportModal(storyId: string) {
  importTargetStoryId.value = storyId;
  importModalOpen.value = true;
}

/**
 * 打开主角配置 Modal（从某个故事人物快速进入）
 * @param storyId 故事 ID
 * @param characterName 可选：预填的人物名（来自"设为主角"按钮）
 */
function openProtagonistModal(storyId: string, characterName?: string) {
  if (!store.stories.some((s) => s.id === storyId)) {
    showToast('error', t('story.storyNotFound'));
    return;
  }
  protagonistTargetStoryId.value = storyId;
  protagonistPresetName.value = characterName ?? null;
  protagonistModalOpen.value = true;
}

/** 清除主角配置 */
function handleClearProtagonist(storyId: string) {
  const ok = store.clearProtagonist(storyId);
  if (ok) {
    if (store.lastInfo) showToast('success', store.lastInfo);
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}
</script>

<template>
  <div class="story-view">
    <!-- 顶部 Header -->
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn back"
          :aria-label="t('story.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">{{ t('story.back') }}</span>
        </button>
        <h1>{{ t('story.title') }}</h1>
        <span class="header-count">{{ t('story.count', { count: store.stories.length }) }}</span>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-btn upload-btn"
          :aria-label="t('story.uploadAria')"
          :disabled="isAnalyzing"
          @click="openUploadModal"
        >
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('story.upload') }}</span>
        </button>
      </div>
    </header>

    <!-- T-08: 一键生成设定（世界书 + 主角角色卡）-->
    <StoryQuickSetupPanel
      :expanded-story-id="expandedStoryId"
      :is-analyzing="isAnalyzing"
      @notify="showToast"
    />

    <!-- 搜索框 -->
    <div class="search-bar">
      <span class="search-icon" aria-hidden="true"><Icon name="search" :size="16" /></span>
      <input
        type="text"
        class="search-input"
        :placeholder="t('story.searchPlaceholder')"
        :value="store.searchQuery"
        :aria-label="t('story.searchAria')"
        @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- 需求1：按状态筛选分类 Tab -->
    <FilterTabs
      v-if="statusFilterTabs.length > 0"
      v-model="filterStatus"
      :tabs="statusFilterTabs"
      :label="t('story.filterLabel')"
      :all-label="t('story.filterAll')"
      :all-value="''"
      :all-count="store.stories.length"
    />

    <!-- 分析进度条（仅在分析中显示） -->
    <div
      v-if="isAnalyzing"
      class="progress-panel"
      role="region"
      :aria-label="t('story.progressAria')"
    >
      <div class="progress-header">
        <Icon name="refresh-cw" :size="16" class="progress-icon" />
        <span class="progress-stage">{{ progress.stage }}</span>
        <button
          type="button"
          class="cancel-btn"
          :aria-label="t('story.cancelAria')"
          @click="handleCancelAnalysis"
        >
          <Icon name="stop" :size="14" />
          <span>{{ t('story.cancel') }}</span>
        </button>
      </div>
      <div
        class="progress-bar"
        role="progressbar"
        :aria-valuenow="progress.completed"
        :aria-valuemin="0"
        :aria-valuemax="progress.total"
        :aria-label="t('story.progressLabel', { completed: progress.completed, total: progress.total })"
      >
        <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
      </div>
      <div class="progress-meta">
        {{ t('story.progressMeta', { completed: progress.completed, total: progress.total, percent: progressPercent }) }}
      </div>
    </div>

    <!-- 故事列表 -->
    <main class="story-main" :aria-label="t('story.listAria')">
      <!-- 空状态 -->
      <EmptyState
        v-if="store.stories.length === 0"
        title-key="story.emptyText"
        desc-key="story.emptyHint"
        action-key="story.uploadFirst"
        icon="book-open"
        @action="openUploadModal"
      />

      <!-- 故事卡片 -->
      <section v-else class="story-grid" :aria-label="t('story.cardsAria')">
        <StoryCard
          v-for="story in stories"
          :key="story.id"
          :story="story"
          :expanded="expandedStoryId === story.id"
          :is-analyzing="isAnalyzing"
          @toggle="toggleExpand(story.id)"
          @import="openImportModal(story.id)"
          @protagonist="openProtagonistModal(story.id)"
          @delete="confirmDelete(story.id)"
        >
          <StoryDetailPanel
            v-if="expandedStoryId === story.id"
            :story="story"
            :is-analyzing="isAnalyzing"
            @set-protagonist="openProtagonistModal(story.id, $event)"
            @edit-protagonist="openProtagonistModal(story.id)"
            @clear-protagonist="handleClearProtagonist(story.id)"
          />
        </StoryCard>
      </section>
    </main>

    <!-- 删除确认 Modal -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('story.deleteTitle')"
      :aria-label="t('story.deleteAria2')"
      described-by="story-delete-desc"
    >
      <p id="story-delete-desc" class="confirm-text">
        {{ t('story.deleteConfirm') }}
      </p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" @click="deleteModalOpen = false">
          {{ t('story.cancelBtn') }}
        </button>
        <button type="button" class="btn btn-danger" @click="handleDelete">
          {{ t('story.delete') }}
        </button>
      </div>
    </Modal>

    <!-- 上传 / 导入 / 主角配置 -->
    <StoryUploadModal
      v-model:open="uploadModalOpen"
      @submit="onSubmitUpload"
      @error="showToast('error', $event)"
    />

    <StoryImportModal
      v-model:open="importModalOpen"
      :story="importTargetStory"
      @notify="showToast"
    />

    <StoryProtagonistModal
      v-model:open="protagonistModalOpen"
      :story="protagonistTargetStory"
      :preset-character-name="protagonistPresetName"
      @notify="showToast"
    />

    <!-- Toast 反馈 -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.story-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg);
  color: var(--on-bg);
}

/* 顶部 Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-title h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
}

.header-count {
  font-size: 13px;
  color: var(--on-surface-variant);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--on-surface);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover:not(:disabled) {
    background: var(--card-elevated);
    border-color: var(--primary);
  }
}

.header-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.header-btn.back {
  padding: 6px 10px;
}

.btn-label {
  white-space: nowrap;
}

/* 搜索框 */
.search-bar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-icon {
  color: var(--on-surface-variant);
  margin-right: 8px;
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--on-bg);
  border-radius: var(--radius-md);
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: var(--primary);
}

/* 进度面板 */
.progress-panel {
  padding: 12px 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.progress-icon {
  color: var(--primary-fg);
  animation: spin 1.5s linear infinite;
}

.progress-stage {
  flex: 1;
  font-size: 13px;
  color: var(--on-surface);
}

.cancel-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--on-bg);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .cancel-btn:hover {
    background: var(--error-bg, rgba(220, 38, 38, 0.1));
    border-color: var(--error);
    color: var(--error-fg);
  }
}

.progress-bar {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width .3s ease;
}

.progress-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--on-surface-variant);
  text-align: right;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .progress-icon { animation: none; }
  .progress-fill { transition: none; }
}

.story-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 故事卡片 */
.story-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}

/* 删除确认 */
.confirm-text {
  font-size: 14px;
  color: var(--on-surface);
  margin: 0 0 16px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* 按钮三件套（全仓惯例：每个视图自带一份） */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--on-surface);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .btn:hover:not(:disabled) {
    background: var(--card-elevated);
  }
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--card);
}

.btn-danger {
  background: var(--error);
  color: var(--on-accent);
  border-color: var(--error);
}

@media (hover: hover) and (pointer: fine) {
  .btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error) 75%, #000);
  }
}

/* 响应式 */
@media (max-width: 640px) {
  .story-grid {
    grid-template-columns: 1fr;
  }

  .header-title h1 {
    font-size: 16px;
  }

  .btn-label {
    display: none;
  }

  .header-btn {
    padding: 6px 8px;
  }

  .header-btn.back .btn-label {
    display: inline;
  }

  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）。
     拆分后 `.form-select/.form-input/.form-textarea` 的这条随各自弹窗走，
     `.search-input` 留在本文件。 */
  .search-input {
    font-size: 16px;
  }
}
</style>
