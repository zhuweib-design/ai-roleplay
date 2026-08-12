import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { StorageAdapter } from '@storage/storage-adapter';
import type { CharacterCard } from '@core/character-card';
import type { Chat } from '@storage/types';
import type { AppSettings } from '@/types';

/** 删除数据库以确保测试间隔离 */
async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function makeCharacter(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'char-1',
    name: 'Seraphina',
    description: '精灵法师',
    personality: '温柔',
    scenario: '森林遭遇',
    firstMessage: '*你猛然醒来*',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: ['奇幻', '温柔'],
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
    title: '与 Seraphina 的对话',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: '你好',
        timestamp: '2026-07-10T00:00:00Z',
        swipes: [],
        swipeIndex: 0,
      },
    ],
    createdAt: '2026-07-10T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: 'dark',
    fontSize: 14,
    apiProfiles: [],
    activeApiProfileId: null,
    activePersonaId: null,
    chatBackground: { type: 'none', value: '', opacity: 1, blur: 0 },
    bubbleStyle: { radius: 16, opacity: 1 },
    customCss: '',
    ttsConfig: { enabled: false, trigger: 'manual', voiceURI: null, rate: 1, pitch: 1, volume: 1 },
    translationConfig: { enabled: false, provider: 'none', apiKey: '', direction: 'auto' },
    summarizationConfig: { enabled: true, threshold: 4000, keepRecent: 10, maxSummaryTokens: 500, temperature: 0.3 },
    quickReplies: [],
    ...overrides,
  };
}

describe('IndexedDBAdapter — 初始化与生命周期', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    await resetDatabase('test-db');
    adapter = new IndexedDBAdapter('test-db');
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  test('init() 成功创建数据库', async () => {
    // beforeEach 中已调用 init()，不抛错即为通过
    // 验证可以正常读取空数据
    const chars = await adapter.loadCharacters();
    expect(chars).toEqual([]);
  });

  test('close() 可重复调用不报错', async () => {
    // beforeEach 中已调用 init()，直接测试 close 幂等性
    await adapter.close();
    await adapter.close();
  });
});

describe('IndexedDBAdapter — 角色卡 CRUD', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    await resetDatabase('test-db-char');
    adapter = new IndexedDBAdapter('test-db-char');
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  test('saveCharacter() 保存角色卡后可 loadCharacter() 读回', async () => {
    const card = makeCharacter();
    await adapter.saveCharacter(card);

    const loaded = await adapter.loadCharacter('char-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('char-1');
    expect(loaded!.name).toBe('Seraphina');
    expect(loaded!.tags).toEqual(['奇幻', '温柔']);
  });

  test('loadCharacter() 不存在时返回 null', async () => {
    const loaded = await adapter.loadCharacter('nonexistent');
    expect(loaded).toBeNull();
  });

  test('saveCharacter() 相同 id 覆盖更新', async () => {
    await adapter.saveCharacter(makeCharacter({ name: '原名' }));
    await adapter.saveCharacter(makeCharacter({ name: '新名' }));

    const loaded = await adapter.loadCharacter('char-1');
    expect(loaded!.name).toBe('新名');
  });

  test('loadCharacters() 返回全部角色卡', async () => {
    await adapter.saveCharacter(makeCharacter({ id: 'c1', name: '角色1' }));
    await adapter.saveCharacter(makeCharacter({ id: 'c2', name: '角色2' }));
    await adapter.saveCharacter(makeCharacter({ id: 'c3', name: '角色3' }));

    const all = await adapter.loadCharacters();
    expect(all).toHaveLength(3);
    const names = all.map((c) => c.name).sort();
    expect(names).toEqual(['角色1', '角色2', '角色3']);
  });

  test('loadCharacters() 空数据库返回空数组', async () => {
    const all = await adapter.loadCharacters();
    expect(all).toEqual([]);
  });

  test('deleteCharacter() 删除后 loadCharacter() 返回 null', async () => {
    await adapter.saveCharacter(makeCharacter());
    await adapter.deleteCharacter('char-1');

    const loaded = await adapter.loadCharacter('char-1');
    expect(loaded).toBeNull();
  });

  test('deleteCharacter() 不存在时不报错', async () => {
    await adapter.deleteCharacter('nonexistent');
  });
});

describe('IndexedDBAdapter — 对话 CRUD', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    await resetDatabase('test-db-chat');
    adapter = new IndexedDBAdapter('test-db-chat');
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  test('saveChat() 保存对话后可 loadChat() 读回', async () => {
    const chat = makeChat();
    await adapter.saveChat(chat);

    const loaded = await adapter.loadChat('chat-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('chat-1');
    expect(loaded!.characterId).toBe('char-1');
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe('你好');
  });

  test('loadChat() 不存在时返回 null', async () => {
    const loaded = await adapter.loadChat('nonexistent');
    expect(loaded).toBeNull();
  });

  test('saveChat() 相同 id 覆盖更新', async () => {
    await adapter.saveChat(makeChat({ title: '原标题' }));
    await adapter.saveChat(makeChat({ title: '新标题' }));

    const loaded = await adapter.loadChat('chat-1');
    expect(loaded!.title).toBe('新标题');
  });

  test('loadChats() 按角色 ID 筛选对话', async () => {
    await adapter.saveChat(makeChat({ id: 'chat-a', characterId: 'char-A' }));
    await adapter.saveChat(makeChat({ id: 'chat-b', characterId: 'char-B' }));
    await adapter.saveChat(makeChat({ id: 'chat-c', characterId: 'char-A' }));

    const chatsForA = await adapter.loadChats('char-A');
    expect(chatsForA).toHaveLength(2);
    const ids = chatsForA.map((c) => c.id).sort();
    expect(ids).toEqual(['chat-a', 'chat-c']);
  });

  test('loadChats() 无匹配角色时返回空数组', async () => {
    await adapter.saveChat(makeChat());
    const chats = await adapter.loadChats('nonexistent-char');
    expect(chats).toEqual([]);
  });

  test('deleteChat() 删除后 loadChat() 返回 null', async () => {
    await adapter.saveChat(makeChat());
    await adapter.deleteChat('chat-1');

    const loaded = await adapter.loadChat('chat-1');
    expect(loaded).toBeNull();
  });

  test('deleteChat() 不存在时不报错', async () => {
    await adapter.deleteChat('nonexistent');
  });
});

describe('IndexedDBAdapter — 设置读写', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    await resetDatabase('test-db-settings');
    adapter = new IndexedDBAdapter('test-db-settings');
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  test('saveSettings() 后 loadSettings() 读回', async () => {
    const settings = makeSettings({
      theme: 'dark',
      fontSize: 14,
      activeApiProfileId: 'profile-1',
    });
    await adapter.saveSettings(settings);

    const loaded = await adapter.loadSettings();
    expect(loaded.theme).toBe('dark');
    expect(loaded.fontSize).toBe(14);
    expect(loaded.activeApiProfileId).toBe('profile-1');
  });

  test('loadSettings() 未保存时返回空对象', async () => {
    const loaded = await adapter.loadSettings();
    expect(loaded).toEqual({});
  });

  test('saveSettings() 覆盖更新', async () => {
    await adapter.saveSettings(makeSettings({ theme: 'dark', fontSize: 14 }));
    await adapter.saveSettings(makeSettings({ theme: 'light', fontSize: 16 }));

    const loaded = await adapter.loadSettings();
    expect(loaded.theme).toBe('light');
    expect(loaded.fontSize).toBe(16);
  });
});

describe('IndexedDBAdapter — 数据完整性', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    await resetDatabase('test-db-integrity');
    adapter = new IndexedDBAdapter('test-db-integrity');
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  test('角色卡完整字段保留（含 characterNote）', async () => {
    const card = makeCharacter({
      characterNote: { text: '保持温柔语调', depth: 4, role: 'system' },
    });
    await adapter.saveCharacter(card);

    const loaded = await adapter.loadCharacter(card.id);
    expect(loaded!.characterNote).toEqual({
      text: '保持温柔语调',
      depth: 4,
      role: 'system',
    });
  });

  test('角色卡未知字段保留', async () => {
    const card = makeCharacter({ customField: '自定义值' } as any);
    await adapter.saveCharacter(card);

    const loaded = await adapter.loadCharacter(card.id);
    expect((loaded as any)!.customField).toBe('自定义值');
  });

  test('对话消息含 swipes 完整保留', async () => {
    const chat = makeChat({
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '回复1',
          timestamp: '2026-07-10T00:00:00Z',
          swipes: ['回复1', '回复2', '回复3'],
          swipeIndex: 1,
        },
      ],
    });
    await adapter.saveChat(chat);

    const loaded = await adapter.loadChat(chat.id);
    expect(loaded!.messages[0].swipes).toEqual(['回复1', '回复2', '回复3']);
    expect(loaded!.messages[0].swipeIndex).toBe(1);
  });
});
