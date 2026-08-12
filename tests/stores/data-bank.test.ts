/**
 * DataBank Store 单元测试 (迭代26 · F09)
 *
 * 覆盖：
 * - 初始状态与计算属性
 * - setStorageAdapter 依赖注入
 * - createDocumentFromFile：文件大小/类型校验、分块、持久化
 * - deleteDocument：内存清理 + 存储删除 + currentDocumentId 重置
 * - getDocumentsForScope：作用域过滤（global / character / chat）
 * - retrieveForChat / retrieveAndBuildContext：RAG 检索链路
 * - loadFromStorage：从存储加载
 * - 持久化失败错误反馈
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDataBankStore } from '../../src/stores/data-bank';
import { MAX_FILE_SIZE } from '@core/data-bank';
import type { DataBankDocument, DataBankScope } from '@core/data-bank';
import type { StorageAdapter } from '@/storage/storage-adapter';

// ── Mock 存储适配器 ──

class MockStorageAdapter implements Partial<StorageAdapter> {
  public documents: DataBankDocument[] = [];
  public saveCalls: DataBankDocument[] = [];
  public deleteCalls: string[] = [];

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async loadDocuments(): Promise<DataBankDocument[]> {
    return [...this.documents];
  }
  async loadDocument(id: string): Promise<DataBankDocument | null> {
    return this.documents.find((d) => d.id === id) ?? null;
  }
  async loadDocumentsByScope(
    scope: DataBankScope,
    _characterId?: string,
    _chatId?: string
  ): Promise<DataBankDocument[]> {
    // 模拟实现：全局文档始终包含
    return this.documents.filter(
      (d) => d.scope === 'global' || d.scope === scope
    );
  }
  async saveDocument(doc: DataBankDocument): Promise<void> {
    this.saveCalls.push({ ...doc });
    const idx = this.documents.findIndex((d) => d.id === doc.id);
    if (idx >= 0) this.documents[idx] = { ...doc };
    else this.documents.push({ ...doc });
  }
  async deleteDocument(id: string): Promise<void> {
    this.deleteCalls.push(id);
    this.documents = this.documents.filter((d) => d.id !== id);
  }
}

// ── 测试夹具 ──

function makeFile(
  content: string,
  name = 'test.txt',
  type = 'text/plain'
): File {
  return new File([content], name, { type });
}

function makeDocument(
  overrides: Partial<DataBankDocument> = {}
): DataBankDocument {
  return {
    id: `doc-${Math.random().toString(36).slice(2, 9)}`,
    name: 'fixture.txt',
    scope: 'global',
    chunks: [
      {
        id: 'chunk-0',
        documentId: 'fixture',
        index: 0,
        content: '勇者在森林中遇到了精灵法师。',
        tokenCount: 20,
      },
    ],
    fileSize: 100,
    mimeType: 'text/plain',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  };
}

// ── 测试用例 ──

describe('useDataBankStore — F09 数据银行单元测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始状态', () => {
    it('documents 列表初始为空', () => {
      const store = useDataBankStore();
      expect(store.documents).toHaveLength(0);
    });

    it('currentDocumentId 初始为 null', () => {
      const store = useDataBankStore();
      expect(store.currentDocumentId).toBeNull();
    });

    it('searchQuery 初始为空字符串', () => {
      const store = useDataBankStore();
      expect(store.searchQuery).toBe('');
    });

    it('lastError / lastInfo 初始为 null', () => {
      const store = useDataBankStore();
      expect(store.lastError).toBeNull();
      expect(store.lastInfo).toBeNull();
    });

    it('计算属性初始为空', () => {
      const store = useDataBankStore();
      expect(store.currentDocument).toBeNull();
      expect(store.filteredDocuments).toHaveLength(0);
      expect(store.globalDocuments).toHaveLength(0);
      expect(store.characterDocuments).toHaveLength(0);
      expect(store.chatDocuments).toHaveLength(0);
    });
  });

  describe('setStorageAdapter 注入', () => {
    it('注入适配器不报错', () => {
      const store = useDataBankStore();
      const adapter = new MockStorageAdapter();
      expect(() => store.setStorageAdapter(adapter as unknown as StorageAdapter)).not.toThrow();
    });

    it('传入 null 不报错', () => {
      const store = useDataBankStore();
      expect(() => store.setStorageAdapter(null)).not.toThrow();
    });
  });

  describe('createDocumentFromFile 文件上传', () => {
    it('拒绝超过大小限制的文件', async () => {
      const store = useDataBankStore();
      store.setStorageAdapter(new MockStorageAdapter() as unknown as StorageAdapter);

      // 构造超大文件
      const hugeContent = 'x'.repeat(MAX_FILE_SIZE + 1);
      const file = makeFile(hugeContent, 'huge.txt');
      const id = await store.createDocumentFromFile(file, 'global');

      expect(id).toBeNull();
      expect(store.lastError).toContain('文件大小超过限制');
      expect(store.documents).toHaveLength(0);
    });

    it('拒绝不支持的文件类型', async () => {
      const store = useDataBankStore();
      store.setStorageAdapter(new MockStorageAdapter() as unknown as StorageAdapter);

      const file = makeFile('test', 'archive.zip', 'application/zip');
      const id = await store.createDocumentFromFile(file, 'global');

      expect(id).toBeNull();
      expect(store.lastError).toContain('不支持的文件类型');
    });

    it('拒绝 PDF 文件（暂不支持提取）', async () => {
      const store = useDataBankStore();
      store.setStorageAdapter(new MockStorageAdapter() as unknown as StorageAdapter);

      const file = makeFile('dummy', 'doc.pdf', 'application/pdf');
      const id = await store.createDocumentFromFile(file, 'global');

      expect(id).toBeNull();
      expect(store.lastError).toContain('PDF');
    });

    it('成功创建 TXT 文档并分块', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      const content = '第一段内容。\n\n第二段内容。\n\n第三段内容。';
      const file = makeFile(content, 'story.txt');
      const id = await store.createDocumentFromFile(file, 'global');

      expect(id).not.toBeNull();
      expect(store.documents).toHaveLength(1);
      const doc = store.documents[0];
      expect(doc.id).toBe(id);
      expect(doc.name).toBe('story.txt');
      expect(doc.scope).toBe('global');
      expect(doc.chunks.length).toBeGreaterThan(0);
      expect(doc.fileSize).toBe(file.size);
      expect(store.lastInfo).toContain('已上传文档');
      // 持久化被调用
      expect(mock.saveCalls).toHaveLength(1);
      expect(mock.saveCalls[0].id).toBe(id);
    });

    it('成功创建 MD 文档', async () => {
      const store = useDataBankStore();
      store.setStorageAdapter(new MockStorageAdapter() as unknown as StorageAdapter);

      const content = '# 标题\n\n这是 Markdown 正文。';
      const file = makeFile(content, 'note.md', 'text/markdown');
      const id = await store.createDocumentFromFile(file, 'global');

      expect(id).not.toBeNull();
      expect(store.documents[0].name).toBe('note.md');
    });

    it('创建 character 作用域文档并绑定 characterId', async () => {
      const store = useDataBankStore();
      store.setStorageAdapter(new MockStorageAdapter() as unknown as StorageAdapter);

      const file = makeFile('角色相关内容', 'char-doc.txt');
      const id = await store.createDocumentFromFile(file, 'character', 'char-001');

      expect(id).not.toBeNull();
      const doc = store.documents[0];
      expect(doc.scope).toBe('character');
      expect(doc.characterId).toBe('char-001');
    });

    it('创建 chat 作用域文档并绑定 chatId', async () => {
      const store = useDataBankStore();
      store.setStorageAdapter(new MockStorageAdapter() as unknown as StorageAdapter);

      const file = makeFile('对话相关内容', 'chat-doc.txt');
      const id = await store.createDocumentFromFile(file, 'chat', undefined, 'chat-002');

      expect(id).not.toBeNull();
      const doc = store.documents[0];
      expect(doc.scope).toBe('chat');
      expect(doc.chatId).toBe('chat-002');
    });

    it('未注入存储适配器时仍可创建文档（不持久化）', async () => {
      const store = useDataBankStore();
      // 不注入适配器
      const file = makeFile('内容', 'no-persist.txt');
      const id = await store.createDocumentFromFile(file, 'global');

      expect(id).not.toBeNull();
      expect(store.documents).toHaveLength(1);
      expect(store.lastInfo).toContain('已上传文档');
    });

    it('文件读取失败时返回 null 并设置错误', async () => {
      const store = useDataBankStore();
      store.setStorageAdapter(new MockStorageAdapter() as unknown as StorageAdapter);

      // 构造一个 file.text() 抛错的 File 对象
      const file = makeFile('content', 'broken.txt');
      // 覆盖 text 方法
      Object.defineProperty(file, 'text', {
        value: vi.fn().mockRejectedValue(new Error('读取失败')),
      });
      const id = await store.createDocumentFromFile(file, 'global');

      expect(id).toBeNull();
      expect(store.lastError).toContain('处理文件失败');
    });
  });

  describe('deleteDocument 删除文档', () => {
    it('删除已存在文档并清理内存', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      const file = makeFile('内容', 'to-delete.txt');
      const id = await store.createDocumentFromFile(file, 'global');
      expect(store.documents).toHaveLength(1);

      await store.deleteDocument(id!);

      expect(store.documents).toHaveLength(0);
      expect(mock.deleteCalls).toContain(id);
    });

    it('删除不存在文档不报错', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      await expect(store.deleteDocument('non-existent')).resolves.not.toThrow();
      expect(mock.deleteCalls).toHaveLength(0);
    });

    it('删除当前选中文档时清理 currentDocumentId', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      const file = makeFile('内容', 'selected.txt');
      const id = await store.createDocumentFromFile(file, 'global');
      store.selectDocument(id!);
      expect(store.currentDocumentId).toBe(id);

      await store.deleteDocument(id!);

      expect(store.currentDocumentId).toBeNull();
    });
  });

  describe('getDocumentsForScope 作用域过滤', () => {
    beforeEach(() => {
      // 每个测试 case 单独初始化 pinia
    });

    it('返回全局文档 + 匹配作用域文档', () => {
      const store = useDataBankStore();
      const globalDoc = makeDocument({ id: 'g1', scope: 'global' });
      const charDoc = makeDocument({
        id: 'c1',
        scope: 'character',
        characterId: 'char-001',
      });
      const otherCharDoc = makeDocument({
        id: 'c2',
        scope: 'character',
        characterId: 'char-002',
      });
      const chatDoc = makeDocument({
        id: 'ch1',
        scope: 'chat',
        chatId: 'chat-001',
      });
      store.documents.push(globalDoc, charDoc, otherCharDoc, chatDoc);

      const result = store.getDocumentsForScope('character', 'char-001');
      // 应返回全局 + 匹配 characterId 的文档
      expect(result.map((d) => d.id).sort()).toEqual(['c1', 'g1']);
    });

    it('chat 作用域返回全局 + 匹配 chatId', () => {
      const store = useDataBankStore();
      const globalDoc = makeDocument({ id: 'g1', scope: 'global' });
      const chatDoc = makeDocument({
        id: 'ch1',
        scope: 'chat',
        chatId: 'chat-001',
      });
      const otherChatDoc = makeDocument({
        id: 'ch2',
        scope: 'chat',
        chatId: 'chat-002',
      });
      store.documents.push(globalDoc, chatDoc, otherChatDoc);

      const result = store.getDocumentsForScope('chat', undefined, 'chat-001');
      expect(result.map((d) => d.id).sort()).toEqual(['ch1', 'g1']);
    });

    it('global 作用域仅返回全局文档', () => {
      const store = useDataBankStore();
      const globalDoc = makeDocument({ id: 'g1', scope: 'global' });
      const charDoc = makeDocument({ id: 'c1', scope: 'character' });
      store.documents.push(globalDoc, charDoc);

      const result = store.getDocumentsForScope('global');
      expect(result.map((d) => d.id)).toEqual(['g1']);
    });

    it('空文档列表返回空数组', () => {
      const store = useDataBankStore();
      const result = store.getDocumentsForScope('character', 'any');
      expect(result).toEqual([]);
    });
  });

  describe('retrieveForChat / retrieveAndBuildContext RAG 检索', () => {
    it('无文档时返回空数组', () => {
      const store = useDataBankStore();
      const result = store.retrieveForChat(['一些消息'], 'global');
      expect(result).toEqual([]);
    });

    it('匹配关键词时返回检索结果', () => {
      const store = useDataBankStore();
      const doc = makeDocument({
        id: 'd1',
        chunks: [
          {
            id: 'd1-0',
            documentId: 'd1',
            index: 0,
            content: '勇者在森林中遇到了精灵法师。',
            tokenCount: 20,
          },
        ],
      });
      store.documents.push(doc);

      const result = store.retrieveForChat(['勇者的冒险故事'], 'global');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].chunk.content).toContain('勇者');
    });

    it('retrieveAndBuildContext 返回注入文本', () => {
      const store = useDataBankStore();
      const doc = makeDocument({
        id: 'd1',
        chunks: [
          {
            id: 'd1-0',
            documentId: 'd1',
            index: 0,
            content: '魔法师施放了火球术。',
            tokenCount: 15,
          },
        ],
      });
      store.documents.push(doc);

      const context = store.retrieveAndBuildContext(['魔法师的故事'], 'global');
      expect(typeof context).toBe('string');
      // 匹配时应包含参考资料标记
      expect(context).toContain('数据银行检索结果');
    });

    it('无匹配时返回空字符串', () => {
      const store = useDataBankStore();
      const doc = makeDocument({
        id: 'd1',
        chunks: [
          {
            id: 'd1-0',
            documentId: 'd1',
            index: 0,
            content: '完全无关的内容XYZ',
            tokenCount: 10,
          },
        ],
      });
      store.documents.push(doc);

      const context = store.retrieveAndBuildContext(
        ['另一段不相关文字ABC'],
        'global'
      );
      expect(context).toBe('');
    });

    it('character 作用域检索包含全局文档', () => {
      const store = useDataBankStore();
      const globalDoc = makeDocument({
        id: 'g1',
        scope: 'global',
        chunks: [
          {
            id: 'g1-0',
            documentId: 'g1',
            index: 0,
            content: '勇者冒险故事',
            tokenCount: 10,
          },
        ],
      });
      const charDoc = makeDocument({
        id: 'c1',
        scope: 'character',
        characterId: 'char-001',
        chunks: [
          {
            id: 'c1-0',
            documentId: 'c1',
            index: 0,
            content: '勇者的装备',
            tokenCount: 8,
          },
        ],
      });
      store.documents.push(globalDoc, charDoc);

      const result = store.retrieveForChat(
        ['勇者的冒险'],
        'character',
        'char-001'
      );
      // 应同时检索全局和角色文档
      const docIds = result.map((r) => r.documentId);
      expect(docIds).toContain('g1');
      expect(docIds).toContain('c1');
    });
  });

  describe('loadFromStorage 加载文档', () => {
    it('从存储加载文档到列表', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      const doc1 = makeDocument({ id: 'load1' });
      const doc2 = makeDocument({ id: 'load2' });
      mock.documents.push(doc1, doc2);
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      await store.loadFromStorage();

      expect(store.documents).toHaveLength(2);
      expect(store.documents.map((d) => d.id).sort()).toEqual(['load1', 'load2']);
    });

    it('未注入适配器时静默跳过', async () => {
      const store = useDataBankStore();
      await expect(store.loadFromStorage()).resolves.not.toThrow();
      expect(store.documents).toHaveLength(0);
    });

    it('加载失败时设置 lastError', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      mock.loadDocuments = vi.fn().mockRejectedValue(new Error('存储读取失败'));
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      await store.loadFromStorage();

      expect(store.lastError).toContain('加载数据银行文档失败');
      expect(store.lastError).toContain('存储读取失败');
    });
  });

  describe('计算属性', () => {
    it('filteredDocuments 按 searchQuery 过滤', () => {
      const store = useDataBankStore();
      const doc1 = makeDocument({ id: 'd1', name: '勇者故事' });
      const doc2 = makeDocument({ id: 'd2', name: '精灵日记' });
      store.documents.push(doc1, doc2);

      store.setSearchQuery('勇者');
      expect(store.filteredDocuments.map((d) => d.id)).toEqual(['d1']);
    });

    it('searchQuery 为空时返回全部', () => {
      const store = useDataBankStore();
      const doc1 = makeDocument({ id: 'd1' });
      const doc2 = makeDocument({ id: 'd2' });
      store.documents.push(doc1, doc2);

      expect(store.filteredDocuments).toHaveLength(2);
    });

    it('globalDocuments / characterDocuments / chatDocuments 分组', () => {
      const store = useDataBankStore();
      const g = makeDocument({ id: 'g', scope: 'global' });
      const c = makeDocument({ id: 'c', scope: 'character' });
      const ch = makeDocument({ id: 'ch', scope: 'chat' });
      store.documents.push(g, c, ch);

      expect(store.globalDocuments.map((d) => d.id)).toEqual(['g']);
      expect(store.characterDocuments.map((d) => d.id)).toEqual(['c']);
      expect(store.chatDocuments.map((d) => d.id)).toEqual(['ch']);
    });

    it('currentDocument 返回当前选中文档', () => {
      const store = useDataBankStore();
      const doc = makeDocument({ id: 'cur' });
      store.documents.push(doc);

      expect(store.currentDocument).toBeNull();
      store.selectDocument('cur');
      expect(store.currentDocument?.id).toBe('cur');
    });

    it('selectDocument 设置不存在的 ID 返回 null', () => {
      const store = useDataBankStore();
      store.selectDocument('non-existent');
      expect(store.currentDocumentId).toBe('non-existent');
      expect(store.currentDocument).toBeNull();
    });
  });

  describe('持久化错误反馈', () => {
    it('persistDocument 失败时设置 lastError', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      mock.saveDocument = vi.fn().mockRejectedValue(new Error('写入失败'));
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      const doc = makeDocument({ id: 'persist-fail' });
      store.documents.push(doc);

      await store.persistDocument('persist-fail');
      expect(store.lastError).toContain('保存文档失败');
      expect(store.lastError).toContain('写入失败');
    });

    it('deleteFromStorage 失败时设置 lastError', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      mock.deleteDocument = vi.fn().mockRejectedValue(new Error('删除失败'));
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      await store.deleteFromStorage('any-id');
      expect(store.lastError).toContain('删除文档失败');
      expect(store.lastError).toContain('删除失败');
    });

    it('persistDocument 对不存在文档静默跳过', async () => {
      const store = useDataBankStore();
      const mock = new MockStorageAdapter();
      store.setStorageAdapter(mock as unknown as StorageAdapter);

      await expect(store.persistDocument('non-existent')).resolves.not.toThrow();
      expect(mock.saveCalls).toHaveLength(0);
    });
  });
});
