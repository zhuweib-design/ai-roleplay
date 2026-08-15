import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { StorageAdapter } from '@/storage/storage-adapter';
import type {
  DataBankDocument,
  DataBankScope,
  RetrievedChunk,
  RAGConfig,
} from '@/core/data-bank';
import { MAX_FILE_SIZE } from '@/core/data-bank';
import { chunkDocument, buildChunks } from '@/core/document-chunker';
import {
  retrieveRelevantChunks,
  buildRagContext,
} from '@/core/rag-retriever';

/**
 * 数据银行 Store (F09)
 *
 * 职责：
 * 1. 文档列表 CRUD（内存 + 持久化到 IndexedDB）
 * 2. 文件上传与分块（TXT/MD/HTML）
 * 3. 按作用域过滤文档（全局/角色/聊天）
 * 4. RAG 检索接口（供 chat store 调用）
 *
 * 不负责：
 * - 提示词注入（由 prompt-builder 集成）
 * - 向量嵌入（F09.3 后续实现）
 */
export const useDataBankStore = defineStore('data-bank', () => {
  // ── 状态 ──
  const documents = ref<DataBankDocument[]>([]);
  const currentDocumentId = ref<string | null>(null);
  const searchQuery = ref('');
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

  // ── 计算属性 ──

  const currentDocument = computed(
    () =>
      documents.value.find((d) => d.id === currentDocumentId.value) ?? null
  );

  const filteredDocuments = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return documents.value;
    return documents.value.filter((d) => d.name.toLowerCase().includes(q));
  });

  /** 全局文档 */
  const globalDocuments = computed(() =>
    documents.value.filter((d) => d.scope === 'global')
  );

  /** 角色级文档 */
  const characterDocuments = computed(() =>
    documents.value.filter((d) => d.scope === 'character')
  );

  /** 聊天级文档 */
  const chatDocuments = computed(() =>
    documents.value.filter((d) => d.scope === 'chat')
  );

  // ── 依赖注入 ──

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  // ── 持久化 ──

  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const loaded = await storageAdapter.loadDocuments();
      documents.value = loaded;
    } catch (e) {
      lastError.value = t('store.docLoadFailed', { error: (e as Error).message });
    }
  }

  async function persistDocument(id: string): Promise<void> {
    if (!storageAdapter) return;
    const doc = documents.value.find((d) => d.id === id);
    if (!doc) return;
    try {
      await storageAdapter.saveDocument(doc);
    } catch (e) {
      lastError.value = t('store.docSaveFailed', { error: (e as Error).message });
    }
  }

  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deleteDocument(id);
    } catch (e) {
      lastError.value = t('store.docDeleteFailed', { error: (e as Error).message });
    }
  }

  // ── 文档操作 ──

  /**
   * 从文件创建文档
   *
   * 流程：
   * 1. 校验文件大小（≤5MB）
   * 2. 读取文本内容
   * 3. 分块
   * 4. 创建 DataBankDocument
   * 5. 添加到列表 + 持久化
   *
   * @returns 文档 ID，失败返回 null
   */
  async function createDocumentFromFile(
    file: File,
    scope: DataBankScope,
    characterId?: string,
    chatId?: string
  ): Promise<string | null> {
    // 1. 校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      lastError.value = t('store.fileTooLarge', { size: MAX_FILE_SIZE / 1024 / 1024 });
      return null;
    }

    // 2. PDF 暂不支持（优先于通用扩展名校验，给出明确提示）
    const ext = getExtension(file.name);
    if (ext === 'pdf' || file.type === 'application/pdf') {
      lastError.value = t('dataBank.pdfNotSupported');
      return null;
    }

    // 3. 校验文件类型（支持 TXT/MD/HTML）
    const supportedExts = ['txt', 'md', 'markdown', 'html', 'htm', 'csv', 'json'];
    if (!supportedExts.includes(ext)) {
      lastError.value = t('story.unsupportedExt', { ext, supported: supportedExts.join(', ') });
      return null;
    }

    try {
      // 3. 读取文本
      const text = await file.text();

      // 4. 分块
      const rawChunks = chunkDocument(text);
      const docId = generateId();
      const chunks = await buildChunks(docId, rawChunks);

      // 5. 创建文档
      const now = new Date().toISOString();
      const doc: DataBankDocument = {
        id: docId,
        name: file.name,
        scope,
        ...(scope === 'character' && characterId ? { characterId } : {}),
        ...(scope === 'chat' && chatId ? { chatId } : {}),
        chunks,
        fileSize: file.size,
        mimeType: file.type || 'text/plain',
        createdAt: now,
        updatedAt: now,
      };

      // 6. 添加到列表 + 持久化
      documents.value.unshift(doc);
      await persistDocument(docId);

      lastInfo.value = t('dataBank.uploaded', { name: file.name, count: chunks.length });
      return docId;
    } catch (e) {
      lastError.value = t('dataBank.processFailed', { error: (e as Error).message });
      return null;
    }
  }

  /**
   * 删除文档
   */
  async function deleteDocument(id: string): Promise<void> {
    const idx = documents.value.findIndex((d) => d.id === id);
    if (idx < 0) return;
    documents.value.splice(idx, 1);
    await deleteFromStorage(id);
    if (currentDocumentId.value === id) {
      currentDocumentId.value = null;
    }
  }

  /**
   * 获取指定作用域的文档（含全局）
   */
  function getDocumentsForScope(
    scope: DataBankScope,
    characterId?: string,
    chatId?: string
  ): DataBankDocument[] {
    return documents.value.filter((d) => {
      if (d.scope === 'global') return true;
      if (scope === 'character' && d.scope === 'character' && d.characterId === characterId) {
        return true;
      }
      if (scope === 'chat' && d.scope === 'chat' && d.chatId === chatId) {
        return true;
      }
      return false;
    });
  }

  /**
   * RAG 检索（供 chat store 调用）
   *
   * @param recentMessages 最近消息内容列表
   * @param scope 作用域
   * @param characterId 角色 ID（scope='character' 时）
   * @param chatId 对话 ID（scope='chat' 时）
   * @param config RAG 配置
   * @returns 检索到的文档块列表
   */
  function retrieveForChat(
    recentMessages: string[],
    scope: DataBankScope = 'global',
    characterId?: string,
    chatId?: string,
    config?: RAGConfig
  ): RetrievedChunk[] {
    const docs = getDocumentsForScope(scope, characterId, chatId);
    if (docs.length === 0) return [];
    return retrieveRelevantChunks(docs, recentMessages, config);
  }

  /**
   * RAG 检索并构建注入文本
   *
   * @returns 注入文本，无匹配时返回空字符串
   */
  function retrieveAndBuildContext(
    recentMessages: string[],
    scope: DataBankScope = 'global',
    characterId?: string,
    chatId?: string,
    config?: RAGConfig
  ): string {
    const retrieved = retrieveForChat(
      recentMessages,
      scope,
      characterId,
      chatId,
      config
    );
    return buildRagContext(retrieved);
  }

  // ── 辅助 ──

  function selectDocument(id: string): void {
    currentDocumentId.value = id;
  }

  function setSearchQuery(q: string): void {
    searchQuery.value = q;
  }

  return {
    // 状态
    documents,
    currentDocumentId,
    searchQuery,
    lastError,
    lastInfo,
    // 计算属性
    currentDocument,
    filteredDocuments,
    globalDocuments,
    characterDocuments,
    chatDocuments,
    // 依赖注入
    setStorageAdapter,
    // 持久化
    loadFromStorage,
    persistDocument,
    deleteFromStorage,
    // 文档操作
    createDocumentFromFile,
    deleteDocument,
    getDocumentsForScope,
    retrieveForChat,
    retrieveAndBuildContext,
    // 辅助
    selectDocument,
    setSearchQuery,
  };
});

// ── 辅助函数 ──

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
