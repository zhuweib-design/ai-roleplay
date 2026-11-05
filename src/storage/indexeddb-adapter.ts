import type { CharacterCard } from '@core/character-card';
import type { Lorebook } from '@core/lorebook';
import type { GroupChat } from '@core/group-chat';
import type { DataBankDocument, DataBankScope } from '@core/data-bank';
import { documentMatchesScope } from '@core/data-bank';
import { toPlainJson } from '@core/json-utils';
import type { StoryAnalysisResult } from '@core/story-types';
import type { Chat } from './types';
import type { AppSettings, Persona } from '@/types';
import type { StorageAdapter } from './storage-adapter';
import { t } from '@/i18n';

/** 数据库版本（迭代33 升级 v6：新增 snapshots store） */
const DB_VERSION = 6;
const STORE_CHARACTERS = 'characters';
const STORE_CHATS = 'chats';
const STORE_SETTINGS = 'settings';
const STORE_LOREBOOKS = 'lorebooks';
const STORE_GROUPS = 'groups';
const STORE_PERSONAS = 'personas';
const STORE_DOCUMENTS = 'documents';
const STORE_STORIES = 'stories';
const STORE_SNAPSHOTS = 'snapshots';
const SETTINGS_KEY = 'app';

/** 列表读取统一的降序规则（Tauri 端由 Rust 排序，两端各自负责） */
function byUpdatedAtDesc(a: { updatedAt: string }, b: { updatedAt: string }): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * IndexedDB 存储适配器（Web 降级版）
 *
 * 在浏览器环境中使用 IndexedDB 持久化数据。
 * 对象存储：
 * - characters: 角色卡，keyPath = id
 * - chats: 对话记录，keyPath = id，index = characterId
 * - settings: 全局设置，keyPath = key（单条记录 key='app'）
 * - lorebooks: 世界书，keyPath = id，index = scope, characterId
 * - groups: 群聊，keyPath = id
 * - personas: 用户 Persona (F07)，keyPath = id
 * - stories: 故事分析结果 (F16)，keyPath = id
 * - snapshots: 整块快照，keyPath = key（社区市场/角色版本等）
 */
export class IndexedDBAdapter implements StorageAdapter {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private readonly storeTransactions = new WeakMap<IDBObjectStore, IDBTransaction>();
  private lastTransaction: IDBTransaction | null = null;
  private lastStoreName: string | null = null;

  constructor(dbName = 'ai-roleplay') {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    if (this.db) return;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = () => {
        const db = request.result;
        // 从旧版本升级时 event.oldVersion 可能为 0/1，需做幂等创建

        if (!db.objectStoreNames.contains(STORE_CHARACTERS)) {
          db.createObjectStore(STORE_CHARACTERS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_CHATS)) {
          const chatStore = db.createObjectStore(STORE_CHATS, { keyPath: 'id' });
          chatStore.createIndex('characterId', 'characterId', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }

        // W2 新增：Lorebook store
        if (!db.objectStoreNames.contains(STORE_LOREBOOKS)) {
          const loreStore = db.createObjectStore(STORE_LOREBOOKS, { keyPath: 'id' });
          loreStore.createIndex('scope', 'scope', { unique: false });
          loreStore.createIndex('characterId', 'characterId', { unique: false });
        }

        // W2 新增：群聊 store
        if (!db.objectStoreNames.contains(STORE_GROUPS)) {
          db.createObjectStore(STORE_GROUPS, { keyPath: 'id' });
        }

        // 迭代22 新增：Persona store (F07)
        if (!db.objectStoreNames.contains(STORE_PERSONAS)) {
          db.createObjectStore(STORE_PERSONAS, { keyPath: 'id' });
        }

        // 迭代26 新增：DataBank 文档 store (F09)
        if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
          const docStore = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
          docStore.createIndex('scope', 'scope', { unique: false });
        }

        // 迭代31 新增：Story 故事引擎 store (F16)
        if (!db.objectStoreNames.contains(STORE_STORIES)) {
          db.createObjectStore(STORE_STORIES, { keyPath: 'id' });
        }

        // 迭代33 新增：整块快照 store（key-value，keyPath = key）
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'key' });
        }
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private requireDB(): IDBDatabase {
    if (!this.db) {
      throw new Error(t('storage.notInitialized'));
    }
    return this.db;
  }

  /** 将 IDBRequest 包装为 Promise */
  private wrap<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      // WebKit 某些请求不会暴露 request.transaction；从创建请求的对象存储回查事务。
      const source = request.source;
      const sourceStore = source && 'objectStore' in source ? source.objectStore : source;
      const sourceStoreName = sourceStore && typeof sourceStore === 'object' && 'name' in sourceStore
        ? String((sourceStore as { name: string }).name)
        : this.lastStoreName;
      const transaction = request.transaction ?? this.lastTransaction ??
        (sourceStore && typeof sourceStore === 'object'
          ? this.storeTransactions.get(sourceStore as IDBObjectStore) ?? null
          : null);
      let requestCompleted = false;
      // 读事务的结果在 request success 时已经可用；写事务还要等 complete
      // 才能确保刷新页面时数据已经提交。
      let transactionCompleted =
        !transaction || transaction.mode === 'readonly';
      let result: T;
      let settled = false;
      let commitCheckStarted = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error('IndexedDB request failed'));
      };

      const resolveWhenCommitted = () => {
        if (settled || !requestCompleted || !transactionCompleted) return;
        settled = true;
        resolve(result);
      };

      const confirmCommit = () => {
        if (
          settled ||
          commitCheckStarted ||
          transactionCompleted ||
          !transaction ||
          transaction.mode === 'readonly' ||
          !sourceStoreName
        ) return;
        commitCheckStarted = true;
        try {
          // 某些 WebKit 版本可能漏发 transaction complete 事件；同一对象存储的
          // 只读请求会排在当前写事务之后，用它确认写入已经真正提交。
          const verifyTransaction = this.requireDB().transaction(sourceStoreName, 'readonly');
          const verifyRequest = verifyTransaction.objectStore(sourceStoreName).count();
          verifyRequest.onsuccess = () => {
            transactionCompleted = true;
            resolveWhenCommitted();
          };
          verifyRequest.onerror = () => fail(verifyRequest.error);
          verifyTransaction.onerror = () => fail(verifyTransaction.error);
          verifyTransaction.onabort = () => fail(verifyTransaction.error);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };

      request.onsuccess = () => {
        result = request.result;
        requestCompleted = true;
        confirmCommit();
        resolveWhenCommitted();
      };
      request.onerror = () => fail(request.error);

      if (transaction && transaction.mode !== 'readonly') {
        transaction.addEventListener('complete', () => {
          transactionCompleted = true;
          resolveWhenCommitted();
        });
        transaction.addEventListener('abort', () => fail(transaction.error));
        transaction.addEventListener('error', () => fail(transaction.error));
      }
    });
  }

  /**
   * 统一序列化入口（F-2：将散落各写入点的 JSON 解包下沉到此）
   * Vue 响应式 Proxy / Map 等对象经 structuredClone 会抛 DataCloneError，
   * JSON round-trip 保证可克隆。集中到一处，避免「靠人记住逐点解包」的维护风险。
   */
  private serialize<T>(value: T): T {
    return toPlainJson(value);
  }

  /** 获取对象存储 */
  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    const transaction = this.requireDB().transaction(name, mode);
    const objectStore = transaction.objectStore(name);
    this.lastTransaction = transaction;
    this.lastStoreName = name;
    this.storeTransactions.set(objectStore, transaction);
    return objectStore;
  }

  // ── 角色卡 CRUD ──

  async saveCharacter(card: CharacterCard): Promise<void> {
    const plain = this.serialize(card);
    await this.wrap(this.store(STORE_CHARACTERS, 'readwrite').put(plain));
  }

  async loadCharacter(id: string): Promise<CharacterCard | null> {
    const result = await this.wrap(this.store(STORE_CHARACTERS, 'readonly').get(id));
    return result ?? null;
  }

  async loadCharacters(): Promise<CharacterCard[]> {
    return await this.wrap(this.store(STORE_CHARACTERS, 'readonly').getAll());
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.wrap(this.store(STORE_CHARACTERS, 'readwrite').delete(id));
  }

  // ── 对话 CRUD ──

  async saveChat(chat: Chat): Promise<void> {
    const plain = this.serialize(chat);
    await this.wrap(this.store(STORE_CHATS, 'readwrite').put(plain));
  }

  async loadChat(id: string): Promise<Chat | null> {
    const result = await this.wrap(this.store(STORE_CHATS, 'readonly').get(id));
    return result ?? null;
  }

  async loadChats(characterId: string): Promise<Chat[]> {
    const index = this.store(STORE_CHATS, 'readonly').index('characterId');
    return await this.wrap(index.getAll(characterId));
  }

  async deleteChat(id: string): Promise<void> {
    await this.wrap(this.store(STORE_CHATS, 'readwrite').delete(id));
  }

  // ── 设置 ──

  async saveSettings(settings: AppSettings): Promise<void> {
    const plain = this.serialize({ key: SETTINGS_KEY, ...settings });
    await this.wrap(this.store(STORE_SETTINGS, 'readwrite').put(plain));
  }

  async loadSettings(): Promise<Partial<AppSettings>> {
    const result = await this.wrap(
      this.store(STORE_SETTINGS, 'readonly').get(SETTINGS_KEY)
    );
    if (!result) return {};
    const { key: _key, ...rest } = result;
    return rest as Partial<AppSettings>;
  }

  // ── Lorebook CRUD (F06) ──

  async saveLorebook(lorebook: Lorebook): Promise<void> {
    const plain = this.serialize(lorebook);
    await this.wrap(this.store(STORE_LOREBOOKS, 'readwrite').put(plain));
  }

  async loadLorebook(id: string): Promise<Lorebook | null> {
    const result = await this.wrap(this.store(STORE_LOREBOOKS, 'readonly').get(id));
    return result ?? null;
  }

  async loadLorebooks(): Promise<Lorebook[]> {
    const all = await this.wrap(this.store(STORE_LOREBOOKS, 'readonly').getAll());
    // 按 updatedAt 降序
    return (all as Lorebook[]).sort(byUpdatedAtDesc);
  }

  async deleteLorebook(id: string): Promise<void> {
    await this.wrap(this.store(STORE_LOREBOOKS, 'readwrite').delete(id));
  }

  // ── 群聊 CRUD (F10) ──

  async saveGroupChat(group: GroupChat): Promise<void> {
    const plain = this.serialize(group);
    await this.wrap(this.store(STORE_GROUPS, 'readwrite').put(plain));
  }

  async loadGroupChat(id: string): Promise<GroupChat | null> {
    const result = await this.wrap(this.store(STORE_GROUPS, 'readonly').get(id));
    return result ?? null;
  }

  async loadGroupChats(): Promise<GroupChat[]> {
    const all = await this.wrap(this.store(STORE_GROUPS, 'readonly').getAll());
    return (all as GroupChat[]).sort(byUpdatedAtDesc);
  }

  async deleteGroupChat(id: string): Promise<void> {
    await this.wrap(this.store(STORE_GROUPS, 'readwrite').delete(id));
  }

  // ── Persona CRUD (F07) ──

  async savePersona(persona: Persona): Promise<void> {
    const plain = this.serialize(persona);
    await this.wrap(this.store(STORE_PERSONAS, 'readwrite').put(plain));
  }

  async loadPersona(id: string): Promise<Persona | null> {
    const result = await this.wrap(this.store(STORE_PERSONAS, 'readonly').get(id));
    return result ?? null;
  }

  async loadPersonas(): Promise<Persona[]> {
    const all = await this.wrap(this.store(STORE_PERSONAS, 'readonly').getAll());
    return (all as Persona[]).sort(byUpdatedAtDesc);
  }

  async deletePersona(id: string): Promise<void> {
    await this.wrap(this.store(STORE_PERSONAS, 'readwrite').delete(id));
  }

  // ── DataBank 文档 CRUD (F09) ──

  async saveDocument(doc: DataBankDocument): Promise<void> {
    const plain = this.serialize(doc);
    await this.wrap(this.store(STORE_DOCUMENTS, 'readwrite').put(plain));
  }

  async loadDocument(id: string): Promise<DataBankDocument | null> {
    const result = await this.wrap(this.store(STORE_DOCUMENTS, 'readonly').get(id));
    return result ?? null;
  }

  async loadDocuments(): Promise<DataBankDocument[]> {
    const all = await this.wrap(this.store(STORE_DOCUMENTS, 'readonly').getAll());
    return (all as DataBankDocument[]).sort(byUpdatedAtDesc);
  }

  async loadDocumentsByScope(
    scope: DataBankScope,
    characterId?: string,
    chatId?: string
  ): Promise<DataBankDocument[]> {
    const all = await this.loadDocuments();
    return all.filter((doc) => documentMatchesScope(doc, scope, characterId, chatId));
  }

  async deleteDocument(id: string): Promise<void> {
    await this.wrap(this.store(STORE_DOCUMENTS, 'readwrite').delete(id));
  }

  // ── Story CRUD (F16) ──

  async saveStory(story: StoryAnalysisResult): Promise<void> {
    const plain = this.serialize(story);
    await this.wrap(this.store(STORE_STORIES, 'readwrite').put(plain));
  }

  async loadStory(id: string): Promise<StoryAnalysisResult | null> {
    const result = await this.wrap(this.store(STORE_STORIES, 'readonly').get(id));
    return result ?? null;
  }

  async loadStories(): Promise<StoryAnalysisResult[]> {
    const all = await this.wrap(this.store(STORE_STORIES, 'readonly').getAll());
    return (all as StoryAnalysisResult[]).sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteStory(id: string): Promise<void> {
    await this.wrap(this.store(STORE_STORIES, 'readwrite').delete(id));
  }

  // ── 整块快照 ──

  async saveSnapshot(key: string, value: unknown): Promise<void> {
    // 统一经 serialize() 规范化（Vue 响应式 proxy / Map 等对象不可 structured clone）
    const plain = this.serialize(value);
    await this.wrap(
      this.store(STORE_SNAPSHOTS, 'readwrite').put({ key, value: plain })
    );
  }

  async listSnapshotsByPrefix<T>(prefix: string): Promise<T[]> {
    const records = await this.wrap(
      this.store(STORE_SNAPSHOTS, 'readonly').getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`))
    );
    return (records as Array<{ value: T }>).map((record) => record.value);
  }

  async loadSnapshot<T>(key: string): Promise<T | null> {
    const result = await this.wrap(
      this.store(STORE_SNAPSHOTS, 'readonly').get(key)
    );
    if (!result) return null;
    return (result as { value: T }).value;
  }
}
