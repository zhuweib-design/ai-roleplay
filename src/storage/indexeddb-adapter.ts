import type { CharacterCard } from '@core/character-card';
import type { Lorebook } from '@core/lorebook';
import type { GroupChat } from '@core/group-chat';
import type { DataBankDocument, DataBankScope } from '@core/data-bank';
import type { StoryAnalysisResult } from '@core/story-types';
import type { Chat } from './types';
import type { AppSettings, Persona } from '@/types';
import type { StorageAdapter } from './storage-adapter';

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
      throw new Error('StorageAdapter 未初始化，请先调用 init()');
    }
    return this.db;
  }

  /** 将 IDBRequest 包装为 Promise */
  private wrap<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** 获取对象存储 */
  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    return this.requireDB().transaction(name, mode).objectStore(name);
  }

  // ── 角色卡 CRUD ──

  async saveCharacter(card: CharacterCard): Promise<void> {
    await this.wrap(this.store(STORE_CHARACTERS, 'readwrite').put(card));
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
    await this.wrap(this.store(STORE_CHATS, 'readwrite').put(chat));
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
    await this.wrap(
      this.store(STORE_SETTINGS, 'readwrite').put({ key: SETTINGS_KEY, ...settings })
    );
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
    await this.wrap(this.store(STORE_LOREBOOKS, 'readwrite').put(lorebook));
  }

  async loadLorebook(id: string): Promise<Lorebook | null> {
    const result = await this.wrap(this.store(STORE_LOREBOOKS, 'readonly').get(id));
    return result ?? null;
  }

  async loadLorebooks(): Promise<Lorebook[]> {
    const all = await this.wrap(this.store(STORE_LOREBOOKS, 'readonly').getAll());
    // 按 updatedAt 降序
    return (all as Lorebook[]).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  async deleteLorebook(id: string): Promise<void> {
    await this.wrap(this.store(STORE_LOREBOOKS, 'readwrite').delete(id));
  }

  // ── 群聊 CRUD (F10) ──

  async saveGroupChat(group: GroupChat): Promise<void> {
    await this.wrap(this.store(STORE_GROUPS, 'readwrite').put(group));
  }

  async loadGroupChat(id: string): Promise<GroupChat | null> {
    const result = await this.wrap(this.store(STORE_GROUPS, 'readonly').get(id));
    return result ?? null;
  }

  async loadGroupChats(): Promise<GroupChat[]> {
    const all = await this.wrap(this.store(STORE_GROUPS, 'readonly').getAll());
    return (all as GroupChat[]).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  async deleteGroupChat(id: string): Promise<void> {
    await this.wrap(this.store(STORE_GROUPS, 'readwrite').delete(id));
  }

  // ── Persona CRUD (F07) ──

  async savePersona(persona: Persona): Promise<void> {
    await this.wrap(this.store(STORE_PERSONAS, 'readwrite').put(persona));
  }

  async loadPersona(id: string): Promise<Persona | null> {
    const result = await this.wrap(this.store(STORE_PERSONAS, 'readonly').get(id));
    return result ?? null;
  }

  async loadPersonas(): Promise<Persona[]> {
    const all = await this.wrap(this.store(STORE_PERSONAS, 'readonly').getAll());
    return (all as Persona[]).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  async deletePersona(id: string): Promise<void> {
    await this.wrap(this.store(STORE_PERSONAS, 'readwrite').delete(id));
  }

  // ── DataBank 文档 CRUD (F09) ──

  async saveDocument(doc: DataBankDocument): Promise<void> {
    await this.wrap(this.store(STORE_DOCUMENTS, 'readwrite').put(doc));
  }

  async loadDocument(id: string): Promise<DataBankDocument | null> {
    const result = await this.wrap(this.store(STORE_DOCUMENTS, 'readonly').get(id));
    return result ?? null;
  }

  async loadDocuments(): Promise<DataBankDocument[]> {
    const all = await this.wrap(this.store(STORE_DOCUMENTS, 'readonly').getAll());
    return (all as DataBankDocument[]).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  async loadDocumentsByScope(
    scope: DataBankScope,
    characterId?: string,
    chatId?: string
  ): Promise<DataBankDocument[]> {
    const all = await this.loadDocuments();
    return all.filter((doc) => {
      // 全局文档始终包含
      if (doc.scope === 'global') return true;
      // 角色级：scope='character' 且 characterId 匹配
      if (scope === 'character' && doc.scope === 'character' && doc.characterId === characterId) {
        return true;
      }
      // 聊天级：scope='chat' 且 chatId 匹配
      if (scope === 'chat' && doc.scope === 'chat' && doc.chatId === chatId) {
        return true;
      }
      return false;
    });
  }

  async deleteDocument(id: string): Promise<void> {
    await this.wrap(this.store(STORE_DOCUMENTS, 'readwrite').delete(id));
  }

  // ── Story CRUD (F16) ──

  async saveStory(story: StoryAnalysisResult): Promise<void> {
    await this.wrap(this.store(STORE_STORIES, 'readwrite').put(story));
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
    // JSON 规范化：Vue 响应式 proxy / Map 等对象经 structuredClone 会抛
    // DataCloneError，而快照语义本就是纯 JSON 数据（localStorage 时代的
    // JSON.stringify 恰好掩盖了此差异）。经 JSON round-trip 保证可克隆。
    const plain = JSON.parse(JSON.stringify(value));
    await this.wrap(
      this.store(STORE_SNAPSHOTS, 'readwrite').put({ key, value: plain })
    );
  }

  async loadSnapshot<T>(key: string): Promise<T | null> {
    const result = await this.wrap(
      this.store(STORE_SNAPSHOTS, 'readonly').get(key)
    );
    if (!result) return null;
    return (result as { value: T }).value;
  }
}
