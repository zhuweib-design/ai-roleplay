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
 *
 * R4-10 拆分后的分工（本文件只剩「页头 + 搜索 + 分组容器 + 两个弹窗接线」）：
 * - 文档卡片（含展开分块、删除按钮）→ `components/databank/DocCard.vue`
 * - 上传弹窗（含拖拽 / 校验 / 提交）→ `components/databank/DataBankUploadModal.vue`
 * - formatFileSize / formatDate    → `utils/format.ts`
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDataBankStore } from '@/stores/data-bank';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Modal from '@/components/common/Modal.vue';
import PrereqNotice from '@/components/common/PrereqNotice.vue';
import DocCard from '@/components/databank/DocCard.vue';
import DataBankUploadModal from '@/components/databank/DataBankUploadModal.vue';
import { useDataBankPrereqs } from '@/core/readiness';
import Toast from '@/components/common/Toast.vue';
import { formatFileSize, formatDate } from '@/utils/format';
import { t } from '@/i18n';

const router = useRouter();
const store = useDataBankStore();
const characterStore = useCharacterStore();

// ── UI 状态 ──
const uploadModalOpen = ref(false);
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
const totalChunks = computed(() =>
  store.documents.reduce((sum, d) => sum + d.chunks.length, 0)
);

// ── 方法 ──

function goBack() {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

function openUploadModal() {
  uploadModalOpen.value = true;
}

/** 上传完成回调：提示文案由子组件透传（它握着 store.lastInfo） */
function handleUploaded(info: string) {
  showToast('success', info);
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

function getCharacterName(id?: string): string {
  if (!id) return '';
  const char = characterStore.characters.find((c) => c.id === id);
  return char?.name ?? id;
}
const prereqRows = useDataBankPrereqs();
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

    <!-- L 层：把"上传成功却没被检索"的两条隐藏前提显式化（E05/E06） -->
    <PrereqNotice :rows="prereqRows" />

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
      <EmptyState
        v-if="store.documents.length === 0"
        title-key="databank.emptyText"
        desc-key="databank.emptyHint"
        action-key="databank.uploadFirst"
        icon="file"
        @action="openUploadModal"
      />

      <!-- 全局文档 -->
      <section v-if="globalDocuments.length > 0" class="doc-section" :aria-label="t('databank.globalSection')">
        <h2 class="section-title">
          <Icon name="globe" :size="18" />
          {{ t('databank.globalSection') }}
          <span class="section-count">{{ globalDocuments.length }}</span>
        </h2>
        <div class="doc-grid">
          <DocCard
            :docs="globalDocuments"
            :expanded-doc-id="expandedDocId"
            :format-file-size="formatFileSize"
            :format-date="formatDate"
            :get-character-name="getCharacterName"
            @toggle-expand="toggleExpand"
            @confirm-delete="confirmDelete"
          />
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
          <DocCard
            :docs="characterDocuments"
            :expanded-doc-id="expandedDocId"
            :format-file-size="formatFileSize"
            :format-date="formatDate"
            :get-character-name="getCharacterName"
            @toggle-expand="toggleExpand"
            @confirm-delete="confirmDelete"
          />
        </div>
      </section>

      <!-- O-24（REAL_DEVICE_TEST_2026-10-03）：筛选无结果时的空态（对齐记录页做法） -->
      <div v-if="documents.length === 0" class="search-empty" role="status">
        <p class="search-empty-text">{{ t('databank.noMatch') }}</p>
        <button
          type="button"
          class="search-empty-clear"
          @click="store.searchQuery = ''"
        >
          {{ t('databank.clearSearch') }}
        </button>
      </div>
    </main>

    <!-- 上传 Modal（内部自持表单状态与提交逻辑） -->
    <DataBankUploadModal v-model="uploadModalOpen" @uploaded="handleUploaded" />

    <!-- 删除确认 Modal -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('databank.deleteTitle')"
      :aria-label="t('databank.deleteAria2')"
      described-by="db-delete-desc"
    >
      <p id="db-delete-desc" class="delete-hint">{{ t('databank.deleteHint') }}</p>
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

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover {
    background: var(--card-elevated);
    border-color: var(--border);
  }
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

@media (hover: hover) and (pointer: fine) {
  .header-btn.upload-btn:hover {
    opacity: 0.9;
  }
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

/* 卡片网格容器（卡片本体在 DocCard.vue） */
.doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

/* Modal 按钮（删除确认弹窗用；上传弹窗自带一份） */
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

@media (hover: hover) and (pointer: fine) {
  .modal-btn:hover:not(:disabled) {
    background: var(--card-elevated);
  }
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .search-input {
    font-size: 16px;
  }
}
/* O-24：搜索无结果空态 */
.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  padding: var(--spacing-lg, 24px) 0;
  color: var(--muted-foreground);
}

.search-empty-text {
  margin: 0;
  font-size: 13px;
}

.search-empty-clear {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--foreground);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .search-empty-clear:hover {
    border-color: var(--secondary);
  }
}
</style>
