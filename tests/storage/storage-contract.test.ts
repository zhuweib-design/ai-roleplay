/**
 * 双存储契约测试（R1：防 IndexedDB / Tauri 双实现 drift）
 *
 * 同一套 CRUD 往返断言分别运行在两个适配器上：
 * - IndexedDBAdapter：真实 fake-indexeddb
 * - TauriFSAdapter：mock invoke（内存 Map 模拟 Rust 文件命令）
 *
 * 覆盖：characters / chats / lorebooks / groupChats / personas /
 *       documents / stories / settings 的保存→加载→列表→删除 与空值语义。
 * 排序行为（updatedAt 降序）由各实现负责，不在契约内断言
 * （IndexedDB 在前端排序，Tauri 在 Rust 端排序）。
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { StorageAdapter } from '@storage/storage-adapter';
import type { CharacterCard } from '@core/character-card';
import type { Chat } from '@storage/types';
import type { AppSettings } from '@/types';
import type { DataBankDocument, DataBankScope } from '@core/data-bank';
import type { StoryAnalysisResult } from '@core/story-types';

// ── 夹具 ──

function makeCharacter(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'char-1',
    name: 'Seraphina',
    description: '精灵法师',
    personality: '温柔',
    scenario: '森林',
    firstMessage: '*你醒来*',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-07-10T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'chat-1',
    characterId: 'char-1',
    title: '第一次冒险',
    createdAt: '2026-07-10T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
    messages: [],
    ...overrides,
  };
}

function makeLorebook() {
  return {
    id: 'lb-1',
    name: '世界观',
    description: '',
    entries: [],
    updatedAt: '2026-07-10T00:00:00Z',
  };
}

function makeGroupChat() {
  return {
    id: 'gc-1',
    name: '冒险小队',
    members: [],
    messages: [],
    mode: 'auto' as const,
    updatedAt: '2026-07-10T00:00:00Z',
  };
}

function makePersona() {
  return {
    id: 'p-1',
    name: '主角',
    description: '',
    updatedAt: '2026-07-10T00:00:00Z',
  };
}

function makeDocument(overrides: Partial<DataBankDocument> = {}): DataBankDocument {
  return {
    id: 'doc-1',
    name: '魔法百科',
    scope: 'global' as DataBankScope,
    chunks: [],
    fileSize: 0,
    mimeType: 'text/plain',
    createdAt: '2026-07-10T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

function makeStory(): StoryAnalysisResult {
  return {
    id: 'story-1',
    sourceFileName: '测试小说.txt',
    depth: 'deep',
    status: 'completed',
    textLength: 0,
    chunkCount: 0,
    worldInfo: { name: '', type: '', description: '' },
    characters: [],
    scenes: [],
    events: [],
    scripts: [],
    createdAt: Date.now(),
    completedAt: Date.now(),
  };
}

function makeSettings(): Partial<AppSettings> {
  return { theme: 'dark', fontSize: 14 };
}

// ── TauriFSAdapter 的 mock invoke（内存 Map 模拟 Rust 文件命令）──

function createTauriMock() {
  const store = new Map<string, unknown>();

  // 命令名 → 数据集合键 映射（命令名与 TS 载荷键可能不同，见 PAYLOAD_KEYS）
  const COLLECTIONS: Record<string, string> = {
    character: 'character',
    chat: 'chat',
    lorebook: 'lorebook',
    group: 'group',
    group_chat: 'group',
    persona: 'persona',
    document: 'document',
    story: 'story',
  };
  // 命令集合名 → invoke 载荷键（TS 端传参键）
  const PAYLOAD_KEYS: Record<string, string> = {
    character: 'card',
    chat: 'chat',
    lorebook: 'lorebook',
    group: 'group',
    group_chat: 'group',
    persona: 'persona',
    document: 'document',
    story: 'story',
  };

  const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    // settings 特例
    if (cmd === 'save_settings_file') {
      store.set('settings', args!.settings);
      return null;
    }
    if (cmd === 'load_settings_file') {
      return store.get('settings') ?? null;
    }

    // 快照特例（save_snapshot_file / load_snapshot_file，键为 key）
    if (cmd === 'save_snapshot_file') {
      store.set(`snapshot:${args!.key}`, args!.value);
      return null;
    }
    if (cmd === 'load_snapshot_file') {
      return store.get(`snapshot:${args!.key}`) ?? null;
    }

    const m = cmd.match(/^(save|load|list|delete)_(.+?)_files?$/);
    if (!m) throw new Error(`未知命令: ${cmd}`);
    const action = m[1];
    const name = m[2];
    const collection = COLLECTIONS[name];
    if (!collection) throw new Error(`未知集合: ${name}`);

    const key = (id: string) => `${collection}:${id}`;
    // 列表顺序模拟 Rust 端 updatedAt 降序（与真实实现行为一致，便于契约断言）
    const listAll = () => {
      const items = [...store.entries()]
        .filter(([k]) => k.startsWith(`${collection}:`))
        .map(([, v]) => v as Record<string, unknown>);
      return items.sort((a, b) =>
        String(b.updatedAt ?? b.createdAt ?? '').localeCompare(
          String(a.updatedAt ?? a.createdAt ?? '')
        )
      );
    };

    switch (action) {
      case 'save':
        store.set(key(String(args!.id)), args![PAYLOAD_KEYS[name]]);
        return null;
      case 'load':
        return store.get(key(String(args!.id))) ?? null;
      case 'list':
        return listAll();
      case 'delete':
        store.delete(key(String(args!.id)));
        return null;
    }
    return null;
  });

  return { invoke, store };
}

// ── 共享契约套件 ──

function runContractTests(
  describeName: string,
  createAdapter: () => Promise<StorageAdapter>
) {
  describe(describeName, () => {
    let adapter: StorageAdapter;

    beforeEach(async () => {
      adapter = await createAdapter();
    });

    afterEach(async () => {
      // 关闭连接，避免阻塞下一次 beforeEach 的数据库删除
      await adapter.close();
    });

    test('角色卡 CRUD 往返', async () => {
      const card = makeCharacter();
      await adapter.saveCharacter(card);
      const loaded = await adapter.loadCharacter(card.id);
      expect(loaded?.name).toBe('Seraphina');
      const all = await adapter.loadCharacters();
      expect(all.map((c) => c.id)).toContain(card.id);
      await adapter.deleteCharacter(card.id);
      expect(await adapter.loadCharacter(card.id)).toBeNull();
    });

    test('不存在记录 load 返回 null', async () => {
      expect(await adapter.loadCharacter('nope')).toBeNull();
      expect(await adapter.loadLorebook('nope')).toBeNull();
      expect(await adapter.loadGroupChat('nope')).toBeNull();
      expect(await adapter.loadPersona('nope')).toBeNull();
      expect(await adapter.loadDocument('nope')).toBeNull();
      expect(await adapter.loadStory('nope')).toBeNull();
    });

    test('对话 CRUD 往返', async () => {
      const chat = makeChat();
      await adapter.saveChat(chat);
      const loaded = await adapter.loadChat(chat.id);
      expect(loaded?.title).toBe('第一次冒险');
      await adapter.deleteChat(chat.id);
      expect(await adapter.loadChat(chat.id)).toBeNull();
    });

    test('Lorebook CRUD 往返', async () => {
      const lb = makeLorebook();
      await adapter.saveLorebook(lb as never);
      const loaded = await adapter.loadLorebook(lb.id);
      expect(loaded?.name).toBe('世界观');
      const all = await adapter.loadLorebooks();
      expect(all.map((l) => l.id)).toContain(lb.id);
      await adapter.deleteLorebook(lb.id);
      expect(await adapter.loadLorebook(lb.id)).toBeNull();
    });

    test('群聊 CRUD 往返', async () => {
      const gc = makeGroupChat();
      await adapter.saveGroupChat(gc as never);
      const loaded = await adapter.loadGroupChat(gc.id);
      expect(loaded?.name).toBe('冒险小队');
      const all = await adapter.loadGroupChats();
      expect(all.map((g) => g.id)).toContain(gc.id);
      await adapter.deleteGroupChat(gc.id);
      expect(await adapter.loadGroupChat(gc.id)).toBeNull();
    });

    test('Persona CRUD 往返', async () => {
      const p = makePersona();
      await adapter.savePersona(p as never);
      const loaded = await adapter.loadPersona(p.id);
      expect(loaded?.name).toBe('主角');
      const all = await adapter.loadPersonas();
      expect(all.map((x) => x.id)).toContain(p.id);
      await adapter.deletePersona(p.id);
      expect(await adapter.loadPersona(p.id)).toBeNull();
    });

    test('DataBank 文档 CRUD 往返 + scope 过滤', async () => {
      const doc = makeDocument();
      await adapter.saveDocument(doc);
      const loaded = await adapter.loadDocument(doc.id);
      expect(loaded?.name).toBe('魔法百科');
      const all = await adapter.loadDocuments();
      expect(all.map((d) => d.id)).toContain(doc.id);
      // scope 语义：global 文档在任意 scope 查询中恒包含（契约一致）
      const charDocs = await adapter.loadDocumentsByScope('character', 'char-1');
      expect(charDocs.map((d) => d.id)).toContain(doc.id);
      // character 级文档仅在 characterId 匹配时返回
      const charDoc = makeDocument({
        id: 'doc-char',
        scope: 'character',
        characterId: 'char-9',
      });
      await adapter.saveDocument(charDoc);
      const otherCharDocs = await adapter.loadDocumentsByScope('character', 'char-1');
      expect(otherCharDocs.map((d) => d.id)).not.toContain('doc-char');
      await adapter.deleteDocument(doc.id);
      expect(await adapter.loadDocument(doc.id)).toBeNull();
    });

    test('Story CRUD 往返', async () => {
      const story = makeStory();
      await adapter.saveStory(story);
      const loaded = await adapter.loadStory(story.id);
      expect(loaded?.sourceFileName).toBe("测试小说.txt");
      const all = await adapter.loadStories();
      expect(all.map((s) => s.id)).toContain(story.id);
      await adapter.deleteStory(story.id);
      expect(await adapter.loadStory(story.id)).toBeNull();
    });

    test('设置保存/加载', async () => {
      const settings = makeSettings();
      await adapter.saveSettings(settings as never);
      const loaded = await adapter.loadSettings();
      expect(loaded?.theme).toBe('dark');
    });

    test('快照保存/加载（null 语义 + 覆盖写 + 原始值）', async () => {
      // 不存在时返回 null
      expect(await adapter.loadSnapshot('snap-1')).toBeNull();
      // 对象快照往返
      await adapter.saveSnapshot('snap-1', { a: 1, list: ['x'] });
      expect(await adapter.loadSnapshot('snap-1')).toEqual({ a: 1, list: ['x'] });
      // 覆盖写
      await adapter.saveSnapshot('snap-1', { b: 2 });
      expect(await adapter.loadSnapshot('snap-1')).toEqual({ b: 2 });
      // 原始值（当前用户 ID 为 string、收藏为数组）
      await adapter.saveSnapshot('snap-user', 'user-1');
      expect(await adapter.loadSnapshot('snap-user')).toBe('user-1');
      await adapter.saveSnapshot('snap-favs', ['a', 'b']);
      expect(await adapter.loadSnapshot('snap-favs')).toEqual(['a', 'b']);
      // 键隔离
      expect(await adapter.loadSnapshot('other-key')).toBeNull();
    });
  });
}

// ── 两个实现的契约运行 ──

runContractTests('契约 · IndexedDBAdapter（真实 fake-indexeddb）', async () => {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('contract-test-db');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  const adapter = new IndexedDBAdapter('contract-test-db');
  await adapter.init();
  return adapter;
});

runContractTests('契约 · TauriFSAdapter（mock invoke）', async () => {
  const mock = createTauriMock();
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: mock.invoke,
  };
  vi.doMock('@tauri-apps/api/core', () => ({ invoke: mock.invoke }));
  // 动态导入以应用 mock
  const { TauriFSAdapter: Adapter } = await import('@storage/tauri-fs-adapter');
  const adapter = new Adapter();
  await adapter.init();
  return adapter;
});
