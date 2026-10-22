<script setup lang="ts">
/**
 * CharactersView — 角色管理列表页 (Phase E)
 *
 * 功能：
 * - 角色卡片网格视图（含头像、名称、标签、收藏标记）
 * - 搜索框（按名称/标签过滤）
 * - 新建角色按钮（跳转到编辑页）
 * - 编辑/导出/删除操作
 * - V2 卡导入（拖拽 + 文件选择）
 * - 删除确认对话框
 */
import { ref, computed, useTemplateRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { getActiveProfileId } from '@/storage/storage-factory';
import { useSettingsStore } from '@/stores/settings';
import { useViewport } from '@/core/viewport';
import CharacterDetailDrawer from '@/components/character/CharacterDetailDrawer.vue';
import CharacterGenerateModal from './CharacterGenerateModal.vue';
import CharacterGridPanel from './CharacterGridPanel.vue';
import { useCharacterImport } from './useCharacterImport';
import { useReadinessJump } from '@/composables/useReadinessJump';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import FilterTabs, { type FilterTab } from '@/components/common/FilterTabs.vue';
import type { UICharacter } from '@/types';
import { t } from '@/i18n';

const router = useRouter();
const characterStore = useCharacterStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const { pushWithReturn } = useReadinessJump();

// 删除确认对话框
const deleteTarget = ref<UICharacter | null>(null);
const deleteModalOpen = ref(false);

// 导入/导出反馈 Toast
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

// 隐藏的文件输入
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const pendingRuntimeKey = `ai-roleplay:pending-runtime-imports:${getActiveProfileId()}`;
function loadPendingRuntimeIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(pendingRuntimeKey) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string =>
      typeof id === 'string' && id.length > 0 && id.length <= 200))].slice(0, 1000) : [];
  } catch {
    return [];
  }
}
const pendingRuntimeIds = ref<string[]>(loadPendingRuntimeIds());
watch(pendingRuntimeIds, (ids) => {
  try {
    if (ids.length) localStorage.setItem(pendingRuntimeKey, JSON.stringify(ids));
    else localStorage.removeItem(pendingRuntimeKey);
  } catch {
    // 本地存储不可用时，本页仍允许重试。
  }
});

// 当前操作中的角色（用于 UI 反馈）
const busyCharacterId = ref<string | null>(null);

// F01.7 随机生成（模板选择状态在 CharacterGenerateModal 内部）
const generateModalOpen = ref(false);

/** 是否有可用的 API 连接 */
const hasApiProfile = computed(
  () =>
    settingsStore.apiProfiles.length > 0 &&
    settingsStore.activeApiProfileId !== null
);

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// 监听 store 错误
watch(
  () => characterStore.lastError,
  (err) => {
    if (err && !importBusy.value) showToast('error', err);
  }
);
watch(
  () => characterStore.lastInfo,
  (info) => {
    if (info && !importBusy.value) showToast('success', info);
  }
);

// ── 操作 ──

/** 返回对话页 */
function goBack() {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

function goToEditor(id?: string) {
  if (id) {
    void router.push({ name: 'character-edit', params: { id } });
  } else {
    void router.push({ name: 'character-new' });
  }
}

/**
 * E19：角色卡上的"已跟踪"标记点进该角色的版本历史。
 * 版本仓库是选中角色时懒创建的，所以"有没有标记"就是"是否已被跟踪"的唯一真相；
 * 此前面界面上没有任何地方能看出这件事。
 */
function openVersions(id: string): void {
  pushWithReturn({ name: 'character-version', query: { char: id } });
}

function startNewCharacter() {
  goToEditor();
}

function editCharacter(id: string) {
  goToEditor(id);
}

function startConversation(id: string) {
  characterStore.selectCharacter(id);
  void router.push({ name: 'chat' });
}

const { isMobile } = useViewport();

/**
 * 手机端角色详情抽屉（批次 1-5，方案乙）：点卡不再直进编辑，开抽屉。
 * 卡面四个动作全部移出（桌面保留原样），抽屉里「开始对话」是唯一主动作。
 */
const detailCharacterId = ref<string | null>(null);
const detailCharacter = computed(
  () => characterList.value.find((c) => c.id === detailCharacterId.value) ?? null
);

function onCardClick(id: string): void {
  if (isMobile.value) {
    detailCharacterId.value = id;
    return;
  }
  editCharacter(id);
}

function closeDetailDrawer(): void {
  detailCharacterId.value = null;
}

function chatFromDrawer(): void {
  const id = detailCharacterId.value;
  closeDetailDrawer();
  if (id) startConversation(id);
}

function editFromDrawer(): void {
  const id = detailCharacterId.value;
  closeDetailDrawer();
  if (id) editCharacter(id);
}

function exportFromDrawer(): void {
  const id = detailCharacterId.value;
  if (!id) return;
  closeDetailDrawer();
  void exportCharacter(id);
}

function deleteFromDrawer(): void {
  const char = detailCharacter.value;
  if (!char) return;
  // 先关抽屉再开确认：两个浮层叠着会让 Esc 语义变成"关一层"而不是"取消删除"
  detailCharacterId.value = null;
  confirmDelete(char);
}

async function exportCharacter(id: string) {
  busyCharacterId.value = id;
  try {
    // false = 找不到（lastError 显示）/ 用户取消保存面板，两种情况都不报成功
    await characterStore.downloadV2(id);
  } finally {
    busyCharacterId.value = null;
  }
}

function confirmDelete(char: UICharacter) {
  deleteTarget.value = char;
  deleteModalOpen.value = true;
}

function executeDelete() {
  if (!deleteTarget.value) return;
  const name = deleteTarget.value.name;
  characterStore.deleteCharacter(deleteTarget.value.id);
  pendingRuntimeIds.value = pendingRuntimeIds.value.filter((id) => id !== deleteTarget.value?.id);
  deleteModalOpen.value = false;
  deleteTarget.value = null;
  showToast('success', t('characters.deleted', { name }));
}

// ── F01.7 随机生成（闸门留宿主，Modal 在 CharacterGenerateModal） ──

function openGenerateModal() {
  if (!hasApiProfile.value) {
    showToast('error', t('characters.generateApiRequired'));
    return;
  }
  generateModalOpen.value = true;
}

// ── 导入（拖拽 / 文件选择 / 运行时同步重试 → useCharacterImport） ──

const {
  isDragging,
  importBusy,
  importProgress,
  importTotal,
  triggerFileInput,
  retryRuntimeSync,
  handleFileSelected,
  handleDrop,
  handleDragOver,
  handleDragLeave,
} = useCharacterImport({ characterStore, chatStore, showToast, pendingRuntimeIds, fileInput });

// 角色卡片列表
const characterList = computed(() => characterStore.filteredCharacters);

// ── 需求1：分类 Tab 筛选（按角色 tag） ──────────────────────────────
const filterTag = computed({
  get: () => characterStore.filterTag,
  set: (v: string) => characterStore.setFilterTag(v),
});

/** Robust to type variance: FilterTab[] typed derivation from store allTags */
const filterTabs = computed<FilterTab[]>(() => {
  const all = new Set<string>(characterStore.allTags.map((t) => t.tag));
  // 完整 tabs 列表（含选中 0 次的标签也展示）
  return Array.from(all).slice(0, 20).map((tag) => {
    const meta = characterStore.allTags.find((t) => t.tag === tag);
    return { value: tag, label: tag, count: meta?.count ?? 0 };
  });
});

</script>

<template>
  <main
    id="main-content"
    class="characters-view"
    :aria-label="t('characters.aria')"
    tabindex="-1"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
  >
    <!-- 头部 -->
    <header class="characters-header">
      <div class="header-left">
        <button
          type="button"
          class="header-btn back"
          :aria-label="t('characters.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">{{ t('characters.back') }}</span>
        </button>
        <h1 class="characters-title">{{ t('characters.title') }}</h1>
        <span class="character-count" aria-live="polite">{{ t('characters.count', { count: characterList.length }) }}</span>
      </div>

      <!-- 搜索框 -->
      <div class="search-wrapper">
        <span class="search-icon" aria-hidden="true"><Icon name="search" :size="16" /></span>
        <input
          type="text"
          class="search-input"
          :placeholder="t('characters.searchPlaceholder')"
          :value="characterStore.searchQuery"
          :aria-label="t('characters.searchAria')"
          @input="characterStore.setSearchQuery(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-btn import-btn"
          :aria-label="t('characters.importAria')"
          :disabled="importBusy"
          @click="triggerFileInput"
        >
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('characters.import') }}</span>
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          multiple
          class="hidden-file-input"
          aria-hidden="true"
          tabindex="-1"
          @change="handleFileSelected"
        />
        <span v-if="importBusy" role="status" aria-live="polite">{{ t('characters.importProgress', { done: importProgress, total: importTotal }) }}</span>
        <button
          v-if="pendingRuntimeIds.length > 0"
          type="button"
          class="header-btn import-btn"
          :disabled="importBusy"
          @click="retryRuntimeSync"
        >
          {{ t('characters.retryRuntime', { count: pendingRuntimeIds.length }) }}
        </button>
        <button
          type="button"
          class="header-btn generate-btn"
          :disabled="!hasApiProfile"
          :aria-disabled="!hasApiProfile"
          :aria-label="hasApiProfile ? t('characters.generateAria') : t('characters.generateDisabled')"
          @click="openGenerateModal"
        >
          <Icon name="refresh-cw" :size="16" />
          <span class="btn-label">{{ t('characters.generate') }}</span>
        </button>
        <button
          type="button"
          class="header-btn new-btn"
          :aria-label="t('characters.newAria')"
          @click="startNewCharacter"
        >
          <Icon name="plus" :size="16" />
          <span class="btn-label">{{ t('characters.new') }}</span>
        </button>
      </div>
    </header>

    <!-- 需求1：分类 Tab 筛选 -->
    <FilterTabs
      v-if="filterTabs.length > 0"
      v-model="filterTag"
      :tabs="filterTabs"
      :label="t('characters.filterLabel')"
      :all-label="t('characters.filterAll')"
      :all-value="''"
      :all-count="characterStore.characters.length"
    />

    <!-- §14.3 排序控制 -->
    <div class="sort-bar">
      <label class="sort-label" for="char-sort">{{ t('characters.sortLabel') }}</label>
      <select
        id="char-sort"
        class="sort-select"
        :value="characterStore.sortBy"
        @change="characterStore.setSortBy(($event.target as HTMLSelectElement).value as 'updated' | 'name')"
      >
        <option value="updated">{{ t('characters.sortUpdated') }}</option>
        <option value="name">{{ t('characters.sortName') }}</option>
      </select>
    </div>

    <!-- 角色卡片网格（不使用 main landmark 避免与页面 main 冲突） -->
    <CharacterGridPanel
      :list="characterList"
      :busy-id="busyCharacterId"
      :dragging="isDragging"
      @card-click="onCardClick"
      @edit="editCharacter"
      @chat="startConversation"
      @export="exportCharacter"
      @delete="confirmDelete"
      @versions="openVersions"
    />

    <!--
      手机角色详情抽屉（批次 1-5 方案乙）。桌面不挂：isMobile 为 false 时抽屉
      状态恒为 null，这里再加一层 v-if 保证组件根本不挂载。
    -->
    <CharacterDetailDrawer
      v-if="isMobile"
      :open="detailCharacter !== null"
      :character="detailCharacter"
      :busy="busyCharacterId !== null"
      @close="closeDetailDrawer"
      @chat="chatFromDrawer"
      @edit="editFromDrawer"
      @export="exportFromDrawer"
      @delete="deleteFromDrawer"
    />

    <!-- 删除确认对话框 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('characters.deleteTitle')"
      :aria-label="t('characters.deleteModalAria')"
      described-by="char-list-delete-desc char-list-delete-warning"
    >
      <p id="char-list-delete-desc" v-if="deleteTarget">
        {{ t('characters.deleteConfirm', { name: deleteTarget.name }) }}
      </p>
      <p id="char-list-delete-warning" class="delete-warning">
        {{ t('characters.deleteWarning') }}
      </p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="executeDelete"
        >
          {{ t('characters.delete') }}
        </button>
      </template>
    </Modal>

    <!-- Toast 通知 -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />

    <!-- F01.7 随机生成 Modal -->
    <CharacterGenerateModal v-model="generateModalOpen" @notify="showToast" />
  </main>
</template>

<style scoped>
.characters-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  gap: 20px;
  position: relative;
}

.characters-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 200px;
}

.characters-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.character-count {
  font-size: 13px;
  color: var(--muted-foreground);
}

.search-wrapper {
  position: relative;
  flex: 1;
  max-width: 320px;
  min-width: 200px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted-foreground);
  display: inline-flex;
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: var(--size-control-md);
  padding: 0 12px 0 36px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
}

.search-input:focus-visible {
  border-color: var(--secondary);
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

.header-btn.back {
  background: none;
  border-color: transparent;
}

.header-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.new-btn {
  background: var(--primary);
  border-color: var(--primary);
  /* primary 背景须配 --on-primary（白 / 深金）。原用 --on-media(#FFF)，
     theatre 金底上仅 2.39:1；on-primary/primary 为门禁已覆盖的达标配对。 */
  color: var(--on-primary);
}

@media (hover: hover) and (pointer: fine) {
  .new-btn:hover {
    background: var(--destructive);
    border-color: var(--destructive);
    /* destructive 背景的正确文字 token 是 --on-accent（深色），
       实测 on-accent/destructive 在 5 主题下均 ≥4.5:1，故保持不变。 */
    color: var(--on-accent);
  }
}

.hidden-file-input {
  display: none;
}

/* §14.3 排序控制条 */
.sort-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 4px 8px;
}

.sort-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.sort-select {
  height: 32px;
  padding: 0 8px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
}

.delete-warning {
  margin-top: 8px;
  color: var(--error-fg);
  font-size: 13px;
}

.modal-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .modal-cancel:hover {
    background: var(--video-bg);
  }
}

.modal-confirm {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

@media (hover: hover) and (pointer: fine) {
  .modal-confirm:hover {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

/* F01.7 随机生成 */
.generate-btn {
  background: var(--card-elevated);
  border-color: var(--secondary);
  color: var(--secondary-text);
}

@media (hover: hover) and (pointer: fine) {
  .generate-btn:hover:not(:disabled) {
    background: var(--secondary);
    color: var(--on-secondary);
  }
}

.generate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .characters-view {
    padding: var(--spacing-md);
  }

  .header-btn .btn-label {
    display: none;
  }

  .header-btn {
    width: 36px;
    padding: 0;
    justify-content: center;
  }

  .search-wrapper {
    order: 3;
    max-width: none;
    flex-basis: 100%;
  }

  .characters-header .header-btn.back {
    display: none;
  }
  /* chrome 也得让位：容器 padding 与块间距是"一屏 ≥3 卡"的另一半 */
  .characters-view {
    padding: 12px;
    gap: 12px;
  }
  .sort-bar {
    padding: 0 0 4px;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .search-input,
  .sort-select {
    font-size: 16px;
  }
}

/* 批次 3-2：页头动作与排序选择器 */
@media (max-width: 640px) {
  .header-btn,
  .sort-select {
    min-height: var(--touch-min);
  }
  .header-btn {
    min-width: var(--touch-min);
  }
}

</style>
