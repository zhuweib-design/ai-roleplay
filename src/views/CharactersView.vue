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
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
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
const settingsStore = useSettingsStore();

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
    if (err) showToast('error', err);
  }
);
watch(
  () => characterStore.lastInfo,
  (info) => {
    if (info) showToast('success', info);
  }
);

// ── 操作 ──

/** 返回对话页 */
function goBack() {
  void router.push({ name: 'chat' });
}

function goToEditor(id?: string) {
  if (id) {
    void router.push({ name: 'character-edit', params: { id } });
  } else {
    void router.push({ name: 'character-new' });
  }
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

function toggleFavorite(id: string, e: Event) {
  e.stopPropagation();
  characterStore.toggleFavorite(id);
}

function exportCharacter(id: string, e: Event) {
  e.stopPropagation();
  busyCharacterId.value = id;
  try {
    const ok = characterStore.downloadV2(id);
    if (!ok) {
      // 错误已通过 lastError 显示
    }
  } finally {
    busyCharacterId.value = null;
  }
}

function confirmDelete(char: UICharacter, e: Event) {
  e.stopPropagation();
  deleteTarget.value = char;
  deleteModalOpen.value = true;
}

function executeDelete() {
  if (!deleteTarget.value) return;
  const name = deleteTarget.value.name;
  characterStore.deleteCharacter(deleteTarget.value.id);
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

async function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  const id = await characterStore.importV2File(file);
  if (id) {
    showToast('success', t('characters.imported', { name: characterStore.characters.find((c) => c.id === id)?.name ?? '' }));
  }
  // 重置 input 允许重复选择同一文件
  input.value = '';
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  if (!e.dataTransfer || e.dataTransfer.files.length === 0) return;
  const file = e.dataTransfer.files[0];
  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    showToast('error', t('characters.dropJsonOnly'));
    return;
  }
  const id = await characterStore.importV2File(file);
  if (id) {
    showToast('success', t('characters.imported', { name: characterStore.characters.find((c) => c.id === id)?.name ?? '' }));
  }
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
          @click="triggerFileInput"
        >
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('characters.import') }}</span>
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

    <!-- 角色卡片网格（不使用 main landmark 避免与页面 main 冲突） -->
    <div class="characters-grid tk-scroll">
      <article
        v-for="char in characterList"
        :key="char.id"
        class="char-card hover-surface"
        :class="{ 'is-busy': busyCharacterId === char.id }"
        tabindex="0"
        :aria-label="t('characters.cardAria', { name: char.name })"
        @click="editCharacter(char.id)"
        @keydown.enter="editCharacter(char.id)"
        @keydown.space.prevent="editCharacter(char.id)"
      >
        <div class="card-header">
          <Avatar :character="char" :size="56" />
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
        <p class="card-desc">{{ char.description }}</p>

        <div class="card-meta">
          <span class="meta-item">
            <Icon name="chat-circle" :size="12" />
            <span>{{ t('characters.convCount', { count: char.conversations.length }) }}</span>
          </span>
          <span class="meta-item">
            <Icon name="gear" :size="12" />
            <span>{{ settingsStore.activeProfile?.model ?? char.model }}</span>
          </span>
        </div>

        <div class="card-actions">
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
            @click.stop="exportCharacter(char.id, $event)"
          >
            <Icon name="download" :size="14" />
            <span>{{ t('characters.export') }}</span>
          </button>
          <button
            type="button"
            class="action-btn delete"
            :aria-label="t('characters.deleteAria')"
            @click.stop="confirmDelete(char, $event)"
          >
            <Icon name="trash-2" :size="14" />
            <span>{{ t('characters.delete') }}</span>
          </button>
        </div>
      </article>

      <!-- 空状态 -->
      <div v-if="characterList.length === 0" class="empty-state">
        <Icon name="user" :size="48" />
        <p class="empty-title">{{ characterStore.searchQuery ? t('characters.emptySearch') : t('characters.emptyNoChar') }}</p>
        <p class="empty-hint">
          {{ characterStore.searchQuery ? t('characters.emptySearchHint') : t('characters.emptyNoCharHint') }}
        </p>
      </div>

      <!-- 拖拽提示 -->
      <div v-if="isDragging" class="drag-overlay" aria-hidden="true">
        <Icon name="upload" :size="48" />
        <p>{{ t('characters.dropHint') }}</p>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('characters.deleteTitle')"
      :aria-label="t('characters.deleteModalAria')"
    >
      <p v-if="deleteTarget">
        {{ t('characters.deleteConfirm', { name: deleteTarget.name }) }}
      </p>
      <p class="delete-warning">
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
    >
      <div class="generate-content">
        <p class="generate-hint">
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

.header-btn:hover {
  border-color: var(--secondary);
  color: var(--secondary);
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
  color: var(--on-media);
}

.new-btn:hover {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
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

.char-card:hover,
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

.favorite-btn:hover {
  color: var(--primary-fg);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
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
  color: var(--secondary);
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

.action-btn:hover {
  background: var(--card-elevated);
  color: var(--foreground);
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.action-btn.delete:hover {
  border-color: var(--destructive);
  color: var(--destructive);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 16px;
  gap: 12px;
  color: var(--muted-foreground);
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--foreground);
  margin: 0;
}

.empty-hint {
  font-size: 13px;
  margin: 0;
  text-align: center;
  max-width: 320px;
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
  color: var(--secondary);
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

.modal-cancel:hover {
  background: var(--video-bg);
}

.modal-confirm {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

.modal-confirm:hover {
  background: var(--destructive);
  border-color: var(--destructive);
}

/* F01.7 随机生成 */
.generate-btn {
  background: var(--card-elevated);
  border-color: var(--secondary);
  color: var(--secondary);
}

.generate-btn:hover:not(:disabled) {
  background: var(--secondary);
  color: var(--on-media);
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
  color: var(--secondary);
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

.template-card:hover:not(:disabled) {
  border-color: var(--secondary);
  background: var(--card-elevated);
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
  color: var(--secondary);
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
  color: var(--on-media);
}

.modal-generate:hover:not(:disabled) {
  filter: brightness(1.1);
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

@media (max-width: 767px) {
  .characters-view {
    padding: 16px;
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

  .card-actions {
    grid-template-columns: 1fr 1fr;
  }
  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
