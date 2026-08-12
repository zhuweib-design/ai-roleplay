/**
 * Backup Service 单元测试 (迭代22 · W10)
 *
 * 覆盖 F13 功能：
 * - exportAll：从存储层收集所有数据
 * - importBackup：三种冲突策略（overwrite / skip / merge）
 * - parseBackupFile：JSON 解析与校验
 * - exportChatMarkdown：对话转 Markdown
 * - exportCharacterPng / importCharacterPng：PNG 嵌入式角色卡 round-trip
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  exportAll,
  importBackup,
  parseBackupFile,
  exportChatMarkdown,
  exportCharacterPng,
  importCharacterPng,
} from '../../src/services/backup-service';
import type { BackupData } from '../../src/core/backup';
import type { StorageAdapter } from '../../src/storage/storage-adapter';
import type { CharacterCard } from '../../src/core/character-card';
import type { Chat } from '../../src/storage/types';
import type { Lorebook } from '../../src/core/lorebook';
import type { GroupChat } from '../../src/core/group-chat';
import type { Persona, AppSettings } from '@/types';

// ── Mock 存储适配器 ──

class MockStorageAdapter implements Partial<StorageAdapter> {
  public characters: CharacterCard[] = [];
  public chats: Chat[] = [];
  public lorebooks: Lorebook[] = [];
  public groupChats: GroupChat[] = [];
  public personas: Persona[] = [];
  public settingsData: Partial<AppSettings> = {};

  // 跟踪调用
  public savedCharacters: CharacterCard[] = [];
  public savedChats: Chat[] = [];
  public savedLorebooks: Lorebook[] = [];
  public savedGroupChats: GroupChat[] = [];
  public savedPersonas: Persona[] = [];
  public savedSettings: Partial<AppSettings> | null = null;

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async saveCharacter(card: CharacterCard): Promise<void> {
    this.savedCharacters.push({ ...card });
    const idx = this.characters.findIndex((c) => c.id === card.id);
    if (idx >= 0) this.characters[idx] = { ...card };
    else this.characters.push({ ...card });
  }
  async loadCharacter(id: string): Promise<CharacterCard | null> {
    return this.characters.find((c) => c.id === id) ?? null;
  }
  async loadCharacters(): Promise<CharacterCard[]> {
    return [...this.characters];
  }
  async deleteCharacter(id: string): Promise<void> {
    this.characters = this.characters.filter((c) => c.id !== id);
  }

  async saveChat(chat: Chat): Promise<void> {
    this.savedChats.push({ ...chat });
    const idx = this.chats.findIndex((c) => c.id === chat.id);
    if (idx >= 0) this.chats[idx] = { ...chat };
    else this.chats.push({ ...chat });
  }
  async loadChat(id: string): Promise<Chat | null> {
    return this.chats.find((c) => c.id === id) ?? null;
  }
  async loadChats(characterId: string): Promise<Chat[]> {
    return this.chats.filter((c) => c.characterId === characterId);
  }
  async deleteChat(id: string): Promise<void> {
    this.chats = this.chats.filter((c) => c.id !== id);
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.savedSettings = { ...settings };
    this.settingsData = { ...settings };
  }
  async loadSettings(): Promise<Partial<AppSettings>> {
    return { ...this.settingsData };
  }

  async saveLorebook(lb: Lorebook): Promise<void> {
    this.savedLorebooks.push({ ...lb });
    const idx = this.lorebooks.findIndex((l) => l.id === lb.id);
    if (idx >= 0) this.lorebooks[idx] = { ...lb };
    else this.lorebooks.push({ ...lb });
  }
  async loadLorebook(id: string): Promise<Lorebook | null> {
    return this.lorebooks.find((l) => l.id === id) ?? null;
  }
  async loadLorebooks(): Promise<Lorebook[]> {
    return [...this.lorebooks];
  }
  async deleteLorebook(id: string): Promise<void> {
    this.lorebooks = this.lorebooks.filter((l) => l.id !== id);
  }

  async saveGroupChat(g: GroupChat): Promise<void> {
    this.savedGroupChats.push({ ...g });
    const idx = this.groupChats.findIndex((x) => x.id === g.id);
    if (idx >= 0) this.groupChats[idx] = { ...g };
    else this.groupChats.push({ ...g });
  }
  async loadGroupChat(id: string): Promise<GroupChat | null> {
    return this.groupChats.find((g) => g.id === id) ?? null;
  }
  async loadGroupChats(): Promise<GroupChat[]> {
    return [...this.groupChats];
  }
  async deleteGroupChat(id: string): Promise<void> {
    this.groupChats = this.groupChats.filter((g) => g.id !== id);
  }

  async savePersona(p: Persona): Promise<void> {
    this.savedPersonas.push({ ...p });
    const idx = this.personas.findIndex((x) => x.id === p.id);
    if (idx >= 0) this.personas[idx] = { ...p };
    else this.personas.push({ ...p });
  }
  async loadPersona(id: string): Promise<Persona | null> {
    return this.personas.find((p) => p.id === id) ?? null;
  }
  async loadPersonas(): Promise<Persona[]> {
    return [...this.personas];
  }
  async deletePersona(id: string): Promise<void> {
    this.personas = this.personas.filter((p) => p.id !== id);
  }
}

// ── 测试夹具 ──

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'char-1',
    name: 'Alice',
    avatar: '',
    description: '描述',
    personality: '性格',
    scenario: '场景',
    firstMessage: '你好',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'chat-1',
    characterId: 'char-1',
    title: '对话1',
    messages: [
      { id: 'm1', role: 'user', content: '你好', timestamp: '2025-01-01T00:00:00.000Z', swipes: [], swipeIndex: 0 },
      { id: 'm2', role: 'assistant', content: '你好！', timestamp: '2025-01-01T00:01:00.000Z', swipes: [], swipeIndex: 0 },
    ],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:01:00.000Z',
    ...overrides,
  };
}

function makeLorebook(overrides: Partial<Lorebook> = {}): Lorebook {
  return {
    id: 'lb-1',
    name: '世界书1',
    description: '',
    entries: [],
    scope: 'global',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGroupChat(overrides: Partial<GroupChat> = {}): GroupChat {
  return {
    id: 'gc-1',
    name: '群聊1',
    characterIds: ['char-1', 'char-2'],
    mode: 'natural',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as GroupChat;
}

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'p-1',
    name: 'User',
    description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBackupData(overrides: Partial<BackupData> = {}): BackupData {
  return {
    version: '1.0',
    exportedAt: '2025-01-01T00:00:00.000Z',
    characters: [makeCard()],
    chats: [makeChat()],
    lorebooks: [makeLorebook()],
    groupChats: [makeGroupChat()],
    personas: [makePersona()],
    settings: { theme: 'dark' } as Partial<AppSettings>,
    ...overrides,
  };
}

// ── 测试用例 ──

describe('backup-service — F13 单元测试', () => {
  let adapter: MockStorageAdapter;

  beforeEach(() => {
    adapter = new MockStorageAdapter();
  });

  describe('exportAll', () => {
    it('从存储层收集所有数据', async () => {
      adapter.characters = [makeCard({ id: 'c1', name: 'A' }), makeCard({ id: 'c2', name: 'B' })];
      adapter.chats = [makeChat({ id: 'ct1', characterId: 'c1' })];
      adapter.lorebooks = [makeLorebook({ id: 'lb1' })];
      adapter.groupChats = [makeGroupChat({ id: 'gc1' })];
      adapter.personas = [makePersona({ id: 'p1' })];
      adapter.settingsData = { theme: 'light' } as Partial<AppSettings>;

      const data = await exportAll(adapter as unknown as StorageAdapter);

      expect(data.version).toBe('1.0');
      expect(data.exportedAt).toBeTruthy();
      expect(data.characters).toHaveLength(2);
      expect(data.chats).toHaveLength(1);
      expect(data.lorebooks).toHaveLength(1);
      expect(data.groupChats).toHaveLength(1);
      expect(data.personas).toHaveLength(1);
      expect(data.settings.theme).toBe('light');
    });

    it('sourceEnv 在浏览器环境为 "web"', async () => {
      const data = await exportAll(adapter as unknown as StorageAdapter);
      expect(data.sourceEnv).toBe('web');
    });

    it('存在明文 API Key 时拒绝导出（防备份泄漏密钥）', async () => {
      adapter.settingsData = {
        theme: 'light',
        apiProfiles: [
          { id: 'p1', name: 'P1', apiKey: 'sk-plaintext-1' },
          { id: 'p2', name: 'P2', apiKey: 'enc:v1:abc' },
        ],
      } as Partial<AppSettings>;

      await expect(
        exportAll(adapter as unknown as StorageAdapter)
      ).rejects.toThrow('未加密的 API Key');
    });

    it('全部 API Key 已加密时正常导出', async () => {
      adapter.settingsData = {
        theme: 'light',
        apiProfiles: [
          { id: 'p1', name: 'P1', apiKey: 'enc:v1:abc' },
          { id: 'p2', name: 'P2', apiKey: 'enc:v1:def' },
        ],
      } as Partial<AppSettings>;

      const data = await exportAll(adapter as unknown as StorageAdapter);
      expect(data.settings.apiProfiles).toHaveLength(2);
    });
  });

  describe('importBackup · overwrite 策略', () => {
    it('新数据被添加', async () => {
      adapter.characters = [];
      const data = makeBackupData({
        characters: [makeCard({ id: 'new1', name: 'NewChar' })],
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data, {
        conflictStrategy: 'overwrite',
      });

      expect(result.characters.added).toBe(1);
      expect(result.characters.overwritten).toBe(0);
      expect(result.characters.skipped).toBe(0);
      expect(adapter.characters).toHaveLength(1);
    });

    it('同 ID 数据被覆盖', async () => {
      adapter.characters = [makeCard({ id: 'c1', name: 'OldName' })];
      const data = makeBackupData({
        characters: [makeCard({ id: 'c1', name: 'NewName' })],
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data, {
        conflictStrategy: 'overwrite',
      });

      expect(result.characters.overwritten).toBe(1);
      expect(result.characters.added).toBe(0);
      expect(adapter.characters[0].name).toBe('NewName');
    });
  });

  describe('importBackup · skip 策略', () => {
    it('同 ID 数据被跳过', async () => {
      adapter.characters = [makeCard({ id: 'c1', name: 'OldName' })];
      const data = makeBackupData({
        characters: [makeCard({ id: 'c1', name: 'NewName' })],
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data, {
        conflictStrategy: 'skip',
      });

      expect(result.characters.skipped).toBe(1);
      expect(adapter.characters[0].name).toBe('OldName'); // 保留原数据
    });
  });

  describe('importBackup · merge 策略', () => {
    it('同 ID 数据跳过，新数据追加', async () => {
      adapter.characters = [makeCard({ id: 'c1', name: 'Existing' })];
      const data = makeBackupData({
        characters: [
          makeCard({ id: 'c1', name: 'Should Not Override' }),
          makeCard({ id: 'c2', name: 'NewAdd' }),
        ],
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data, {
        conflictStrategy: 'merge',
      });

      expect(result.characters.skipped).toBe(1); // c1 跳过
      expect(result.characters.added).toBe(1); // c2 新增
      expect(adapter.characters.find((c) => c.id === 'c1')?.name).toBe('Existing');
      expect(adapter.characters.find((c) => c.id === 'c2')?.name).toBe('NewAdd');
    });
  });

  describe('importBackup · 选项控制', () => {
    it('importCharacters=false 跳过角色卡导入', async () => {
      adapter.characters = [];
      const data = makeBackupData({
        characters: [makeCard({ id: 'c1' })],
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data, {
        importCharacters: false,
      });

      expect(result.characters.added).toBe(0);
      expect(adapter.characters).toHaveLength(0);
    });

    it('importSettings=false 跳过设置导入', async () => {
      const data = makeBackupData({
        settings: { theme: 'light' } as Partial<AppSettings>,
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data, {
        importSettings: false,
      });

      expect(result.settingsUpdated).toBe(false);
    });

    it('导入设置后 settingsUpdated=true', async () => {
      const data = makeBackupData({
        settings: { theme: 'midnight' } as Partial<AppSettings>,
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data);

      expect(result.settingsUpdated).toBe(true);
    });
  });

  describe('importBackup · 错误处理', () => {
    it('单个数据失败不影响其他', async () => {
      const failingSave = vi
        .spyOn(adapter, 'saveCharacter')
        .mockImplementation(async (card: CharacterCard) => {
          if (card.id === 'fail') throw new Error('mock save error');
          await MockStorageAdapter.prototype.saveCharacter.call(adapter, card);
        });

      const data = makeBackupData({
        characters: [
          makeCard({ id: 'fail', name: 'WillFail' }),
          makeCard({ id: 'ok', name: 'WillOK' }),
        ],
      });

      const result = await importBackup(adapter as unknown as StorageAdapter, data);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('WillFail');
      expect(result.characters.added).toBe(1); // ok 成功
      failingSave.mockRestore();
    });
  });

  describe('parseBackupFile', () => {
    it('合法 JSON 文件解析成功', async () => {
      const data = makeBackupData();
      const file = new File([JSON.stringify(data)], 'backup.json', {
        type: 'application/json',
      });

      const parsed = await parseBackupFile(file);
      expect(parsed.version).toBe('1.0');
      expect(parsed.characters).toHaveLength(1);
    });

    it('非法 JSON 抛出错误', async () => {
      const file = new File(['{ invalid json'], 'bad.json', {
        type: 'application/json',
      });

      await expect(parseBackupFile(file)).rejects.toThrow(/JSON 解析失败/);
    });

    it('缺少 version 字段校验失败', async () => {
      const badData = { ...makeBackupData(), version: undefined };
      const file = new File([JSON.stringify(badData)], 'bad.json');

      await expect(parseBackupFile(file)).rejects.toThrow(/version/);
    });

    it('characters 字段非数组校验失败', async () => {
      const badData = { ...makeBackupData(), characters: 'not-an-array' };
      const file = new File([JSON.stringify(badData)], 'bad.json');

      await expect(parseBackupFile(file)).rejects.toThrow(/characters/);
    });
  });

  describe('exportChatMarkdown', () => {
    it('生成包含标题和消息的 Markdown', () => {
      const chat = makeChat();
      const md = exportChatMarkdown(chat, 'Alice', 'User');

      expect(md).toContain('# Alice 的对话');
      expect(md).toContain('对话 ID: `chat-1`');
      expect(md).toContain('消息数: 2');
      expect(md).toContain('👤 User');
      expect(md).toContain('你好');
      expect(md).toContain('🤖 Alice');
      expect(md).toContain('你好！');
    });

    it('默认 userName 为 "User"', () => {
      const chat = makeChat();
      const md = exportChatMarkdown(chat, 'Bob');
      expect(md).toContain('👤 User');
    });

    it('空消息显示占位符', () => {
      const chat = makeChat({
        messages: [
          { id: 'm1', role: 'user', content: '', timestamp: '2025-01-01T00:00:00.000Z', swipes: [], swipeIndex: 0 },
        ],
      });
      const md = exportChatMarkdown(chat, 'Alice', 'User');
      expect(md).toContain('_(空消息)_');
    });

    it('包含元信息（创建时间、更新时间、导出时间）', () => {
      const chat = makeChat();
      const md = exportChatMarkdown(chat, 'Alice');
      expect(md).toContain('创建时间:');
      expect(md).toContain('更新时间:');
      expect(md).toContain('导出时间:');
    });
  });

  describe('exportCharacterPng / importCharacterPng round-trip', () => {
    it('PNG 嵌入并提取角色卡数据一致', async () => {
      const card = makeCard({
        id: 'png-test',
        name: 'PngChar',
        description: 'PNG 测试角色',
        personality: '勇敢',
        scenario: '城堡',
        firstMessage: '欢迎',
        tags: ['奇幻'],
      });

      const blob = exportCharacterPng(card);
      expect(blob.type).toBe('image/png');

      const file = new File([blob], 'char.png', { type: 'image/png' });
      const restored = await importCharacterPng(file);

      expect(restored).not.toBeNull();
      expect(restored!.name).toBe('PngChar');
      expect(restored!.description).toBe('PNG 测试角色');
      expect(restored!.personality).toBe('勇敢');
      expect(restored!.tags).toContain('奇幻');
    });

    it('非 PNG 文件抛出错误', async () => {
      const file = new File([new Uint8Array([0, 1, 2, 3])], 'not-png.png');
      await expect(importCharacterPng(file)).rejects.toThrow(/不是有效的 PNG/);
    });

    it('无嵌入数据的 PNG 返回 null', async () => {
      // 构造一个不含 tEXt chunk 的最小 PNG
      // 使用 exportCharacterPng 生成后修改其 bytes — 此处简单测试：
      // 通过 exportCharacterPng 必然返回带数据的 PNG，所以构造空 PNG 比较麻烦
      // 直接通过 buildPngChunk 逻辑构造最小 PNG
      const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      // 构造 IHDR
      const ihdrData = new Uint8Array(13);
      const view = new DataView(ihdrData.buffer);
      view.setUint32(0, 1, false);
      view.setUint32(4, 1, false);
      ihdrData[8] = 8;
      ihdrData[9] = 6;

      // 简单 chunk 构造（不复用内部函数，因为不导出）
      function buildChunk(type: string, data: Uint8Array): Uint8Array {
        const typeBytes = new TextEncoder().encode(type);
        const chunk = new Uint8Array(12 + data.length);
        const v = new DataView(chunk.buffer);
        v.setUint32(0, data.length, false);
        chunk.set(typeBytes, 4);
        chunk.set(data, 8);
        // CRC32 简化：填 0（importCharacterPng 不校验 CRC）
        v.setUint32(8 + data.length, 0, false);
        return chunk;
      }

      const ihdr = buildChunk('IHDR', ihdrData);
      const iend = buildChunk('IEND', new Uint8Array(0));
      const png = new Uint8Array(PNG_SIG.length + ihdr.length + iend.length);
      png.set(PNG_SIG, 0);
      png.set(ihdr, PNG_SIG.length);
      png.set(iend, PNG_SIG.length + ihdr.length);

      const file = new File([png], 'empty.png', { type: 'image/png' });
      const result = await importCharacterPng(file);
      expect(result).toBeNull();
    });
  });
});
