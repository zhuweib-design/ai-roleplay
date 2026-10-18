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
import { useCharacterVersionStore } from '@/stores/character-version';
import { useReadinessJump } from '@/composables/useReadinessJump';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Avatar from '@/components/common/Avatar.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import FilterTabs, { type FilterTab } from '@/components/common/FilterTabs.vue';
import type { UICharacter } from '@/types';
import {
  CHARACTER_TEMPLATES,
  type CharacterTemplateId,
} from '@/core/character-generator';
import { t } from '@/i18n';

const router = useRouter();
const characterStore = useCharacterStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const versionStore = useCharacterVersionStore();
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

// 拖拽状态
const isDragging = ref(false);
const importBusy = ref(false);
const importProgress = ref(0);
const importTotal = ref(0);
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

// F01.7 随机生成
const generateModalOpen = ref(false);
const selectedTemplate = ref<CharacterTemplateId | null>(null);
const templates = CHARACTER_TEMPLATES;

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

function toggleFavorite(id: string, e: Event) {
  e.stopPropagation();
  characterStore.toggleFavorite(id);
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

// ── F01.7 随机生成 ──

function openGenerateModal() {
  if (!hasApiProfile.value) {
    showToast('error', t('characters.generateApiRequired'));
    return;
  }
  selectedTemplate.value = null;
  generateModalOpen.value = true;
}

function selectTemplate(id: CharacterTemplateId) {
  selectedTemplate.value = id;
}

async function handleGenerate() {
  if (!selectedTemplate.value) {
    showToast('error', t('characters.generateSelectTemplate'));
    return;
  }
  if (characterStore.isGeneratingCharacter) return;

  const templateId = selectedTemplate.value;
  const id = await characterStore.generateRandomCharacter(templateId);
  if (id) {
    generateModalOpen.value = false;
    // 生成成功后自动跳转到编辑页查看结果
    setTimeout(() => {
      void router.push({ name: 'character-edit', params: { id } });
    }, 300);
  }
  // 失败时 lastError 会通过 watch 显示 toast，保持 Modal 打开允许重试
}

function closeGenerateModal() {
  if (characterStore.isGeneratingCharacter) return; // 生成中不允许关闭
  generateModalOpen.value = false;
}

// ── 导入 ──

function triggerFileInput() {
  fileInput.value?.click();
}

async function syncImportedCharacters(ids: string[]): Promise<number> {
  const characters = ids.map((id) => characterStore.characters.find((character) => character.id === id))
    .filter((character): character is UICharacter => Boolean(character));
  const failed: string[] = [];
  let synced = 0;
  for (let index = 0; index < characters.length; index += 50) {
    const batch = characters.slice(index, index + 50);
    const result = await chatStore.createRuntimeCharactersBatch(batch);
    if (!result) {
      failed.push(...batch.map((character) => character.id));
      continue;
    }
    failed.push(...result.items.filter((item) => item.status === 'invalid')
      .map((item) => batch[item.index]?.id)
      .filter((id): id is string => Boolean(id)));
    synced += result.items.filter((item) => item.status !== 'invalid').length;
  }
  pendingRuntimeIds.value = [...new Set([...pendingRuntimeIds.value.filter((id) => !ids.includes(id)), ...failed])];
  return synced;
}

async function importFiles(files: File[]): Promise<void> {
  if (importBusy.value || files.length === 0) return;
  if (files.length > 50) {
    showToast('error', t('characters.importLimit'));
    return;
  }
  importBusy.value = true;
  importTotal.value = files.length;
  importProgress.value = 0;
  const importedIds: string[] = [];
  let failed = 0;
  try {
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
        failed += 1;
      } else {
        const id = await characterStore.importV2File(file);
        if (id) importedIds.push(id);
        else failed += 1;
      }
      importProgress.value += 1;
    }
    const synced = importedIds.length ? await syncImportedCharacters(importedIds) : 0;
    if (failed > 0 || synced < importedIds.length) {
      showToast('error', t('characters.importSummary', {
        count: importedIds.length, synced, failed: failed + importedIds.length - synced,
      }));
    } else {
      showToast('success', t('characters.importSummary', { count: importedIds.length, synced, failed: 0 }));
    }
  } finally {
    importBusy.value = false;
  }
}

async function retryRuntimeSync(): Promise<void> {
  if (importBusy.value || pendingRuntimeIds.value.length === 0) return;
  importBusy.value = true;
  try {
    const ids = [...pendingRuntimeIds.value];
    const synced = await syncImportedCharacters(ids);
    showToast(pendingRuntimeIds.value.length ? 'error' : 'success', t('characters.importSummary', {
      count: ids.length, synced, failed: pendingRuntimeIds.value.length,
    }));
  } finally {
    importBusy.value = false;
  }
}

async function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  await importFiles(files);
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  await importFiles([...(e.dataTransfer?.files ?? [])]);
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  if (e.currentTarget === e.target) {
    isDragging.value = false;
  }
}

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

function tagsPreview(tags: string[]): string {
  return tags.slice(0, 3).join(' · ') + (tags.length > 3 ? ` +${tags.length - 3}` : '');
}
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
    <div class="characters-grid tk-scroll">
      <article
        v-for="char in characterList"
        :key="char.id"
        class="char-card hover-surface"
        :class="{ 'is-busy': busyCharacterId === char.id }"
        tabindex="0"
        :aria-label="t('characters.cardAria', { name: char.name })"
        @click="onCardClick(char.id)"
        @keydown.enter="onCardClick(char.id)"
        @keydown.space.prevent="onCardClick(char.id)"
      >
        <div class="card-header">
          <Avatar :character="char" :size="isMobile ? 44 : 56" />
          <button
            type="button"
            class="favorite-btn"
            :class="{ active: char.favorite }"
            :aria-label="char.favorite ? t('characters.unfavorite') : t('characters.favorite')"
            :aria-pressed="char.favorite"
            @click="toggleFavorite(char.id, $event)"
          >
            <Icon name="star" :size="16" />
          </button>
        </div>

        <h2 class="card-name">{{ char.name }}</h2>
        <p class="card-tags">{{ tagsPreview(char.tags) }}</p>
        <p v-if="!isMobile" class="card-desc">{{ char.description }}</p>

        <div class="card-meta">
          <span class="meta-item">
            <Icon name="chat-circle" :size="12" />
            <span>{{ t('characters.convCount', { count: char.conversations.length }) }}</span>
          </span>
          <span class="meta-item">
            <Icon name="gear" :size="12" />
            <span>{{ settingsStore.activeProfile?.model ?? char.model }}</span>
          </span>
          <button
            v-if="versionStore.hasRepository(char.id)"
            type="button"
            class="meta-item meta-tracked"
            data-rel-jump="char-tracked"
            :aria-label="t('characters.trackedAria', { name: char.name })"
            v-tip="t('characters.trackedHint')"
            @click.stop="openVersions(char.id)"
          >
            <Icon name="git-branch" :size="12" aria-hidden="true" />
            <span>{{ t('characters.trackedTag') }}</span>
          </button>
        </div>

        <!-- 手机：四个动作在详情抽屉里（批次 1-5 方案乙）；桌面保留卡面内联 -->
        <div v-if="!isMobile" class="card-actions">
          <button
            type="button"
            class="action-btn edit"
            :aria-label="t('characters.editAria')"
            @click.stop="editCharacter(char.id)"
          >
            <Icon name="pencil" :size="14" />
            <span>{{ t('characters.edit') }}</span>
          </button>
          <button
            type="button"
            class="action-btn chat"
            :aria-label="t('characters.chatAria')"
            @click.stop="startConversation(char.id)"
          >
            <Icon name="chat-circle" :size="14" />
            <span>{{ t('characters.chat') }}</span>
          </button>
          <button
            type="button"
            class="action-btn export"
            :aria-label="t('characters.exportAria')"
            :disabled="busyCharacterId === char.id"
            @click.stop="exportCharacter(char.id)"
          >
            <Icon name="download" :size="14" />
            <span>{{ t('characters.export') }}</span>
          </button>
          <button
            type="button"
            class="action-btn delete"
            :aria-label="t('characters.deleteAria')"
            @click.stop="confirmDelete(char)"
          >
            <Icon name="trash-2" :size="14" />
            <span>{{ t('characters.delete') }}</span>
          </button>
        </div>
      </article>

      <!-- 空状态 -->
      <EmptyState
        v-if="characterList.length === 0"
        :title-key="characterStore.searchQuery ? 'characters.emptySearch' : 'characters.emptyNoChar'"
        :desc-key="characterStore.searchQuery ? 'characters.emptySearchHint' : 'characters.emptyNoCharHint'"
        icon="user"
      />

      <!-- 拖拽提示 -->
      <div v-if="isDragging" class="drag-overlay" aria-hidden="true">
        <Icon name="upload" :size="48" />
        <p>{{ t('characters.dropHint') }}</p>
      </div>
    </div>

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
    <Modal
      v-model="generateModalOpen"
      :title="t('characters.generateModalTitle')"
      :aria-label="t('characters.generateModalAria')"
      described-by="char-generate-desc"
    >
      <div class="generate-content">
        <p id="char-generate-desc" class="generate-hint">
          {{ t('characters.generateHint') }}
          <span class="generate-cost">{{ t('characters.generateCost') }}</span>
        </p>

        <div class="template-grid" role="radiogroup" :aria-label="t('characters.templateAria')">
          <button
            v-for="tpl in templates"
            :key="tpl.id"
            type="button"
            class="template-card"
            :class="{ active: selectedTemplate === tpl.id }"
            role="radio"
            :aria-checked="selectedTemplate === tpl.id"
            :aria-label="t('characters.templateSelect', { label: tpl.label, description: tpl.description })"
            :disabled="characterStore.isGeneratingCharacter"
            @click="selectTemplate(tpl.id)"
          >
            <span class="template-label">{{ tpl.label }}</span>
            <span class="template-desc">{{ tpl.description }}</span>
          </button>
        </div>

        <!-- 生成中加载提示 -->
        <div
          v-if="characterStore.isGeneratingCharacter"
          class="generate-loading"
          role="status"
          aria-live="polite"
        >
          <Icon name="refresh-cw" :size="20" class="spin-icon" />
          <span>{{ t('characters.generating') }}</span>
        </div>
      </div>

      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          :disabled="characterStore.isGeneratingCharacter"
          @click="closeGenerateModal"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-generate"
          :disabled="!selectedTemplate || characterStore.isGeneratingCharacter"
          @click="handleGenerate"
        >
          <Icon
            v-if="!characterStore.isGeneratingCharacter"
            name="refresh-cw"
            :size="14"
          />
          <span>{{ characterStore.isGeneratingCharacter ? t('characters.generatingBtn') : t('characters.generateBtn') }}</span>
        </button>
      </template>
    </Modal>
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
  height: 36px;
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
  height: 36px;
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

.characters-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  align-content: start;
  overflow-y: auto;
  padding-right: 4px;
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

.char-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color .15s ease, transform .15s ease, background-color .15s ease;
  outline: none;
}

@media (hover: hover) and (pointer: fine) {
  .char-card:hover {
    border-color: var(--secondary);
    background: var(--card-elevated);
  }
}

/* focus-visible 分支不加 hover 守卫：键盘可达性不受设备 hover 能力影响 */
.char-card:focus-visible {
  border-color: var(--secondary);
  background: var(--card-elevated);
}

.char-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.char-card.is-busy {
  opacity: 0.6;
  pointer-events: none;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.favorite-btn {
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  border-radius: var(--radius-sm);
  transition: color .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .favorite-btn:hover {
    color: var(--primary-fg);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }
}

.favorite-btn.active {
  color: var(--primary-fg);
}

.favorite-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.card-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-tags {
  font-size: 12px;
  /* --secondary 作文字在 theatre 的 --card-elevated 上仅 4.37:1；
     改用派生 token --secondary-text（= secondary 与 foreground 混合，主题自适应）。 */
  color: var(--secondary-text);
  margin: 0;
}

.card-desc {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 39px;
}

.card-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

/* "已跟踪"是可点的（跳该角色版本历史），但视觉仍是元信息行的一员，不做成按钮块 */
.meta-tracked {
  margin-left: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 4px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  background: var(--video-bg);
  border: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card-elevated);
    color: var(--foreground);
  }
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}




.drag-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--secondary) 8%, var(--background));
  border: 2px dashed var(--secondary);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--secondary-text);
  font-size: 16px;
  pointer-events: none;
  z-index: 5;
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

.generate-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.generate-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.generate-cost {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--secondary-text);
}

.template-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.template-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .template-card:hover:not(:disabled) {
    border-color: var(--secondary);
    background: var(--card-elevated);
  }
}

.template-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.template-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, var(--video-bg));
}

.template-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.template-label {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}

.template-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.generate-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  color: var(--secondary-text);
  font-size: 13px;
  background: color-mix(in srgb, var(--secondary) 8%, transparent);
  border-radius: var(--radius-md);
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-generate {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--on-secondary);
}

@media (hover: hover) and (pointer: fine) {
  .modal-generate:hover:not(:disabled) {
    filter: brightness(1.1);
  }
}

.modal-generate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .spin-icon {
    animation: none;
  }
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

  .characters-grid {
    grid-template-columns: 1fr;
  }
  /*
   * 一屏 ≥3 张卡（批次 1-5 判据）。卡面四个动作搬走只省了一半，剩下的靠
   * "卡 = 索引、抽屉 = 详情"的分工把卡压瘦：
   * - 页头返回按钮隐藏：底部导航全程在场，Tab 就是回去的路，页头返回是第二个
   * - 简介 clamp 1 行、标签隐藏：全量信息在抽屉里，卡只留"这是谁"的一眼
   * - 头像 44：见模板 :size 的 isMobile 分流
   */
  .characters-header .header-btn.back {
    display: none;
  }
  .card-tags {
    display: none;
  }
  .characters-grid {
    gap: 10px;
  }
  .card-name {
    font-size: 14px;
  }
  /* chrome 也得让位：容器 padding 与块间距是"一屏 ≥3 卡"的另一半 */
  .characters-view {
    padding: 12px;
    gap: 12px;
  }
  .sort-bar {
    padding: 0 0 4px;
  }

  .card-actions {
    grid-template-columns: 1fr 1fr;
  }
  .template-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .search-input,
  .sort-select {
    font-size: 16px;
  }
}
</style>
