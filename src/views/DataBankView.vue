<script setup lang="ts">
/**
 * DataBankView — 数据银行页面 (F09)
 *
 * 功能：
 * - 文档上传（TXT/MD/HTML，按段落自动分块）
 * - 文档列表（按作用域分组：全局/角色级/聊天级）
 * - 文档管理（展开查看分块、删除）
 * - 搜索过滤
 *
 * 无障碍：
 * - 语义化 main/section
 * - aria-label 标注图标按钮
 * - Modal 焦点陷阱
 * - 删除前确认
 * - Toast role=alert 反馈
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDataBankStore } from '@/stores/data-bank';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import type { DataBankScope } from '@/core/data-bank';
import { MAX_FILE_SIZE } from '@/core/data-bank';
import { t } from '@/i18n';

const router = useRouter();
const store = useDataBankStore();
const characterStore = useCharacterStore();

// ── UI 状态 ──
const uploadModalOpen = ref(false);
const selectedScope = ref<DataBankScope>('global');
const selectedCharacterId = ref<string>('');
const selectedFile = ref<File | null>(null);
const deleteTargetId = ref<string | null>(null);
const deleteModalOpen = ref(false);
const expandedDocId = ref<string | null>(null);
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

// ── 计算属性 ──
const documents = computed(() => store.filteredDocuments);
const globalDocuments = computed(() => documents.value.filter((d) => d.scope === 'global'));
const characterDocuments = computed(() => documents.value.filter((d) => d.scope === 'character'));
const chatDocuments = computed(() => documents.value.filter((d) => d.scope === 'chat'));
const totalChunks = computed(() =>
  store.documents.reduce((sum, d) => sum + d.chunks.length, 0)
);

// ── 方法 ──

function goBack() {
  void router.push({ name: 'chat' });
}

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

function openUploadModal() {
  selectedScope.value = 'global';
  selectedCharacterId.value = '';
  selectedFile.value = null;
  uploadModalOpen.value = true;
}

function closeUploadModal() {
  uploadModalOpen.value = false;
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]!;
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    selectedFile.value = event.dataTransfer.files[0]!;
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}

async function handleUpload() {
  if (!selectedFile.value) {
    showToast('error', t('databank.selectFileFirst'));
    return;
  }

  if (selectedFile.value.size > MAX_FILE_SIZE) {
    showToast('error', t('databank.fileTooLarge', { size: MAX_FILE_SIZE / 1024 / 1024 }));
    return;
  }

  const characterId =
    selectedScope.value === 'character' && selectedCharacterId.value
      ? selectedCharacterId.value
      : undefined;

  const id = await store.createDocumentFromFile(
    selectedFile.value,
    selectedScope.value,
    characterId
  );

  if (id) {
    closeUploadModal();
    if (store.lastInfo) {
      showToast('success', store.lastInfo);
    }
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}

function confirmDelete(id: string) {
  deleteTargetId.value = id;
  deleteModalOpen.value = true;
}

async function handleDelete() {
  if (!deleteTargetId.value) return;
  await store.deleteDocument(deleteTargetId.value);
  deleteModalOpen.value = false;
  deleteTargetId.value = null;
  showToast('success', t('databank.deleted'));
}

function toggleExpand(id: string) {
  expandedDocId.value = expandedDocId.value === id ? null : id;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

function getCharacterName(id?: string): string {
  if (!id) return '';
  const char = characterStore.characters.find((c) => c.id === id);
  return char?.name ?? id;
}
</script>

<template>
  <div class="databank-view">
    <!-- 顶部 Header -->
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn back"
          :aria-label="t('databank.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">{{ t('databank.back') }}</span>
        </button>
        <h1>{{ t('databank.title') }}</h1>
        <span class="header-count">{{ t('databank.count', { docs: store.documents.length, chunks: totalChunks }) }}</span>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-btn upload-btn"
          :aria-label="t('databank.uploadAria')"
          @click="openUploadModal"
        >
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('databank.upload') }}</span>
        </button>
      </div>
    </header>

    <!-- 搜索框 -->
    <div class="search-bar">
      <span class="search-icon" aria-hidden="true"><Icon name="search" :size="16" /></span>
      <input
        type="text"
        class="search-input"
        :placeholder="t('databank.searchPlaceholder')"
        :value="store.searchQuery"
        :aria-label="t('databank.searchAria')"
        @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- 文档列表 -->
    <main class="doc-main" :aria-label="t('databank.listAria')">
      <!-- 空状态 -->
      <div v-if="store.documents.length === 0" class="empty-state">
        <Icon name="file" :size="48" class="empty-icon" />
        <p class="empty-text">{{ t('databank.emptyText') }}</p>
        <p class="empty-hint">{{ t('databank.emptyHint') }}</p>
        <button type="button" class="header-btn upload-btn" @click="openUploadModal">
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('databank.uploadFirst') }}</span>
        </button>
      </div>

      <!-- 全局文档 -->
      <section v-if="globalDocuments.length > 0" class="doc-section" :aria-label="t('databank.globalSection')">
        <h2 class="section-title">
          <Icon name="globe" :size="18" />
          {{ t('databank.globalSection') }}
          <span class="section-count">{{ globalDocuments.length }}</span>
        </h2>
        <div class="doc-grid">
          <article
            v-for="doc in globalDocuments"
            :key="doc.id"
            class="doc-card"
          >
            <div class="card-header" @click="toggleExpand(doc.id)">
              <Icon name="file" :size="20" class="doc-icon" />
              <div class="card-info">
                <h3 class="doc-name">{{ doc.name }}</h3>
                <span class="doc-meta">{{ formatFileSize(doc.fileSize) }} · {{ t('databank.chunksCount', { count: doc.chunks.length }) }} · {{ formatDate(doc.createdAt) }}</span>
              </div>
              <button
                type="button"
                class="card-expand"
                :aria-label="expandedDocId === doc.id ? t('databank.collapseChunks') : t('databank.expandChunks')"
                :aria-expanded="expandedDocId === doc.id"
                @click="toggleExpand(doc.id)"
              >
                <Icon :name="expandedDocId === doc.id ? 'chevron-up' : 'chevron-down'" :size="16" />
              </button>
            </div>
            <div v-if="expandedDocId === doc.id" class="card-chunks">
              <div
                v-for="chunk in doc.chunks"
                :key="chunk.id"
                class="chunk-item"
              >
                <span class="chunk-index">#{{ chunk.index + 1 }}</span>
                <span class="chunk-content">{{ chunk.content }}</span>
                <span class="chunk-tokens">{{ chunk.tokenCount }} tok</span>
              </div>
            </div>
            <div class="card-actions">
              <button
                type="button"
                class="card-btn delete-btn"
                :aria-label="t('databank.deleteAria')"
                @click="confirmDelete(doc.id)"
              >
                <Icon name="trash-2" :size="14" />
                <span>{{ t('databank.delete') }}</span>
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- 角色级文档 -->
      <section v-if="characterDocuments.length > 0" class="doc-section" :aria-label="t('databank.characterSection')">
        <h2 class="section-title">
          <Icon name="user" :size="18" />
          {{ t('databank.characterSection') }}
          <span class="section-count">{{ characterDocuments.length }}</span>
        </h2>
        <div class="doc-grid">
          <article
            v-for="doc in characterDocuments"
            :key="doc.id"
            class="doc-card"
          >
            <div class="card-header" @click="toggleExpand(doc.id)">
              <Icon name="file" :size="20" class="doc-icon" />
              <div class="card-info">
                <h3 class="doc-name">{{ doc.name }}</h3>
                <span class="doc-meta">{{ formatFileSize(doc.fileSize) }} · {{ t('databank.chunksCount', { count: doc.chunks.length }) }} · {{ getCharacterName(doc.characterId) }}</span>
              </div>
              <button
                type="button"
                class="card-expand"
                :aria-label="expandedDocId === doc.id ? t('databank.collapseChunks') : t('databank.expandChunks')"
                :aria-expanded="expandedDocId === doc.id"
                @click="toggleExpand(doc.id)"
              >
                <Icon :name="expandedDocId === doc.id ? 'chevron-up' : 'chevron-down'" :size="16" />
              </button>
            </div>
            <div v-if="expandedDocId === doc.id" class="card-chunks">
              <div
                v-for="chunk in doc.chunks"
                :key="chunk.id"
                class="chunk-item"
              >
                <span class="chunk-index">#{{ chunk.index + 1 }}</span>
                <span class="chunk-content">{{ chunk.content }}</span>
                <span class="chunk-tokens">{{ chunk.tokenCount }} tok</span>
              </div>
            </div>
            <div class="card-actions">
              <button
                type="button"
                class="card-btn delete-btn"
                :aria-label="t('databank.deleteAria')"
                @click="confirmDelete(doc.id)"
              >
                <Icon name="trash-2" :size="14" />
                <span>{{ t('databank.delete') }}</span>
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- 聊天级文档 -->
      <section v-if="chatDocuments.length > 0" class="doc-section" :aria-label="t('databank.chatSection')">
        <h2 class="section-title">
          <Icon name="chat-circle" :size="18" />
          {{ t('databank.chatSection') }}
          <span class="section-count">{{ chatDocuments.length }}</span>
        </h2>
        <div class="doc-grid">
          <article
            v-for="doc in chatDocuments"
            :key="doc.id"
            class="doc-card"
          >
            <div class="card-header" @click="toggleExpand(doc.id)">
              <Icon name="file" :size="20" class="doc-icon" />
              <div class="card-info">
                <h3 class="doc-name">{{ doc.name }}</h3>
                <span class="doc-meta">{{ formatFileSize(doc.fileSize) }} · {{ t('databank.chunksCount', { count: doc.chunks.length }) }}</span>
              </div>
              <button
                type="button"
                class="card-expand"
                :aria-label="expandedDocId === doc.id ? t('databank.collapseChunks') : t('databank.expandChunks')"
                :aria-expanded="expandedDocId === doc.id"
                @click="toggleExpand(doc.id)"
              >
                <Icon :name="expandedDocId === doc.id ? 'chevron-up' : 'chevron-down'" :size="16" />
              </button>
            </div>
            <div v-if="expandedDocId === doc.id" class="card-chunks">
              <div
                v-for="chunk in doc.chunks"
                :key="chunk.id"
                class="chunk-item"
              >
                <span class="chunk-index">#{{ chunk.index + 1 }}</span>
                <span class="chunk-content">{{ chunk.content }}</span>
                <span class="chunk-tokens">{{ chunk.tokenCount }} tok</span>
              </div>
            </div>
            <div class="card-actions">
              <button
                type="button"
                class="card-btn delete-btn"
                :aria-label="t('databank.deleteAria')"
                @click="confirmDelete(doc.id)"
              >
                <Icon name="trash-2" :size="14" />
                <span>{{ t('databank.delete') }}</span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>

    <!-- 上传 Modal -->
    <Modal
      v-model="uploadModalOpen"
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
        <button type="button" class="modal-btn modal-cancel" @click="closeUploadModal">
          {{ t('databank.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          :disabled="!selectedFile || (selectedScope === 'character' && !selectedCharacterId)"
          @click="handleUpload"
        >
          {{ t('databank.uploadBtn') }}
        </button>
      </template>
    </Modal>

    <!-- 删除确认 Modal -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('databank.deleteTitle')"
      :aria-label="t('databank.deleteAria2')"
    >
      <p class="delete-hint">{{ t('databank.deleteHint') }}</p>
      <template #footer>
        <button type="button" class="modal-btn modal-cancel" @click="deleteModalOpen = false">
          {{ t('databank.cancel') }}
        </button>
        <button type="button" class="modal-btn modal-delete" @click="handleDelete">
          {{ t('databank.delete') }}
        </button>
      </template>
    </Modal>

    <!-- Toast -->
    <Toast v-model="toastOpen" :type="toastType" :message="toastMessage" />
  </div>
</template>

<style scoped>
.databank-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground);
}

.header-count {
  font-size: 13px;
  color: var(--muted-foreground);
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
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.header-btn:hover {
  background: var(--card-elevated);
  border-color: var(--border);
}

.header-btn.back {
  background: none;
  border-color: transparent;
}

.header-btn.upload-btn {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.header-btn.upload-btn:hover {
  opacity: 0.9;
}

/* 搜索栏 */
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.search-icon {
  color: var(--muted-foreground);
  display: flex;
}

.search-input {
  flex: 1;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
}

.search-input:focus {
  outline: 2px solid var(--secondary);
  outline-offset: -1px;
}

/* 文档列表 */
.doc-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--muted-foreground);
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0 0 8px 0;
  max-width: 400px;
}

/* 文档分组 */
.doc-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.section-count {
  font-size: 12px;
  color: var(--muted-foreground);
  background: var(--card-elevated);
  padding: 2px 8px;
  border-radius: 10px;
}

/* 文档卡片 */
.doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.doc-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
  overflow: hidden;
  transition: border-color 0.15s;
}

.doc-card:hover {
  border-color: var(--border);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  cursor: pointer;
}

.doc-icon {
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  font-size: 12px;
  color: var(--muted-foreground);
  display: block;
  margin-top: 2px;
}

.card-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.card-expand:hover {
  background: var(--card-elevated);
}

/* 分块预览 */
.card-chunks {
  border-top: 1px solid var(--border);
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  background: var(--background);
}

.chunk-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.5;
}

.chunk-item:last-child {
  border-bottom: none;
}

.chunk-index {
  color: var(--muted-foreground);
  font-weight: 600;
  flex-shrink: 0;
  min-width: 28px;
}

.chunk-content {
  flex: 1;
  color: var(--foreground);
  word-break: break-word;
  max-height: 60px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.chunk-tokens {
  color: var(--muted-foreground);
  font-size: 11px;
  flex-shrink: 0;
}

/* 卡片操作 */
.card-actions {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}

.card-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  background: none;
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  transition: background-color 0.15s, color 0.15s;
}

.delete-btn:hover {
  background: color-mix(in srgb, var(--error) 10%, transparent);
  color: var(--error);
}

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
  height: 36px;
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

.drop-zone:hover {
  border-color: var(--secondary);
  background: var(--card-elevated);
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

/* Modal 按钮 */
.modal-btn {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.modal-btn:hover:not(:disabled) {
  background: var(--card-elevated);
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-confirm {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.modal-delete {
  background: var(--destructive);
  color: var(--on-accent);
  border-color: var(--destructive);
}

.delete-hint {
  font-size: 14px;
  color: var(--foreground);
  margin: 0;
}

/* 响应式 */
@media (max-width: 640px) {
  .doc-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .header-actions {
    width: 100%;
  }

  .header-btn.upload-btn {
    flex: 1;
    justify-content: center;
  }
}
</style>
