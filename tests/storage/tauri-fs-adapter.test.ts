import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mock @tauri-apps/api/core 的 invoke ──
// TauriFSAdapter 内部通过动态 import('@tauri-apps/api/core') 调用 invoke
// 在测试中我们将其 mock 为可记录调用参数的 stub

const invokeMock = vi.fn();

// 模拟 Tauri 环境：注入 window.__TAURI_INTERNALS__
beforeEach(() => {
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: invokeMock,
  };

  // 模拟 ESM 模块（动态 import 使用）
  vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  // 清理 Tauri 环境标记
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

// 动态导入待测组件（在 mock 之后）
const { TauriFSAdapter } = await import('@storage/tauri-fs-adapter');

describe('TauriFSAdapter', () => {
  describe('isTauriEnv', () => {
    it('在 window.__TAURI_INTERNALS__ 存在时返回 true', () => {
      expect(TauriFSAdapter.isTauriEnv()).toBe(true);
    });

    it('在 window.__TAURI_INTERNALS__ 不存在时返回 false', () => {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      expect(TauriFSAdapter.isTauriEnv()).toBe(false);
    });
  });

  describe('init', () => {
    it('在 Tauri 环境下成功初始化', async () => {
      const adapter = new TauriFSAdapter();
      await expect(adapter.init()).resolves.toBeUndefined();
    });

    it('在非 Tauri 环境下抛出错误', async () => {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      const adapter = new TauriFSAdapter();
      await expect(adapter.init()).rejects.toThrow('非 Tauri 环境');
    });
  });

  describe('unimplementedFeatures（候选5）', () => {
    it('M1 后全部持久化能力已实现，清单为空', () => {
      const names = TauriFSAdapter.getUnimplementedFeatureNames();
      expect(names).toEqual([]);
    });

    it('未实现方法调用在非 Tauri 环境下抛错（init 校验兜底）', async () => {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      const adapter = new TauriFSAdapter();
      await expect(adapter.init()).rejects.toThrow('非 Tauri 环境');
    });
  });

  describe('close', () => {
    it('文件系统适配器无需显式关闭', async () => {
      const adapter = new TauriFSAdapter();
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('角色卡 CRUD', () => {
    it('saveCharacter 调用 save_character_file 命令', async () => {
      const adapter = new TauriFSAdapter();
      const card = {
        id: 'char-1',
        name: '测试角色',
        version: '2.0',
        spec: 'chara_card_v2',
        data: {
          name: '测试角色',
          description: '描述',
          personality: '性格',
          first_mes: '首条消息',
          mes_example: '',
          scenario: '',
          creator_notes: '',
          system_prompt: '',
          post_history_instructions: '',
          tags: [],
          creator: '',
          character_book: { entries: [] },
        },
      };

      invokeMock.mockResolvedValueOnce(undefined);
      await adapter.saveCharacter(card as never);

      expect(invokeMock).toHaveBeenCalledWith('save_character_file', {
        id: 'char-1',
        card,
      });
    });

    it('loadCharacter 不存在时返回 null', async () => {
      const adapter = new TauriFSAdapter();
      invokeMock.mockResolvedValueOnce(null);
      const result = await adapter.loadCharacter('nonexistent');
      expect(result).toBeNull();
      expect(invokeMock).toHaveBeenCalledWith('load_character_file', {
        id: 'nonexistent',
      });
    });

    it('loadCharacter 存在时返回角色卡', async () => {
      const adapter = new TauriFSAdapter();
      const mockCard = { id: 'char-1', name: '测试角色' };
      invokeMock.mockResolvedValueOnce(mockCard);
      const result = await adapter.loadCharacter('char-1');
      expect(result).toEqual(mockCard);
    });

    it('loadCharacters 返回角色卡数组', async () => {
      const adapter = new TauriFSAdapter();
      const mockCards = [{ id: 'char-1' }, { id: 'char-2' }];
      invokeMock.mockResolvedValueOnce(mockCards);
      const result = await adapter.loadCharacters();
      expect(result).toEqual(mockCards);
      expect(invokeMock).toHaveBeenCalled();
      expect(invokeMock.mock.calls[0][0]).toBe('list_character_files');
    });

    it('loadCharacters 在 Rust 返回 null 时降级为空数组', async () => {
      const adapter = new TauriFSAdapter();
      invokeMock.mockResolvedValueOnce(null);
      const result = await adapter.loadCharacters();
      expect(result).toEqual([]);
    });

    it('deleteCharacter 调用 delete_character_file 命令', async () => {
      const adapter = new TauriFSAdapter();
      invokeMock.mockResolvedValueOnce(undefined);
      await adapter.deleteCharacter('char-1');
      expect(invokeMock).toHaveBeenCalledWith('delete_character_file', {
        id: 'char-1',
      });
    });
  });

  describe('对话 CRUD', () => {
    it('saveChat 调用 save_chat_file 命令', async () => {
      const adapter = new TauriFSAdapter();
      const chat = {
        id: 'chat-1',
        characterId: 'char-1',
        title: '测试对话',
        messages: [],
        createdAt: '2026-07-21T00:00:00.000Z',
        updatedAt: '2026-07-21T00:00:00.000Z',
      };

      invokeMock.mockResolvedValueOnce(undefined);
      await adapter.saveChat(chat as never);

      expect(invokeMock).toHaveBeenCalledWith('save_chat_file', {
        id: 'chat-1',
        chat,
      });
    });

    it('loadChat 不存在时返回 null', async () => {
      const adapter = new TauriFSAdapter();
      invokeMock.mockResolvedValueOnce(null);
      const result = await adapter.loadChat('nonexistent');
      expect(result).toBeNull();
    });

    it('loadChats 按 characterId 查询', async () => {
      const adapter = new TauriFSAdapter();
      const mockChats = [
        { id: 'chat-1', characterId: 'char-1' },
        { id: 'chat-2', characterId: 'char-1' },
      ];
      invokeMock.mockResolvedValueOnce(mockChats);
      const result = await adapter.loadChats('char-1');
      expect(result).toEqual(mockChats);
      expect(invokeMock).toHaveBeenCalledWith('list_chat_files', {
        characterId: 'char-1',
      });
    });

    it('deleteChat 调用 delete_chat_file 命令', async () => {
      const adapter = new TauriFSAdapter();
      invokeMock.mockResolvedValueOnce(undefined);
      await adapter.deleteChat('chat-1');
      expect(invokeMock).toHaveBeenCalledWith('delete_chat_file', {
        id: 'chat-1',
      });
    });
  });

  describe('设置', () => {
    it('saveSettings 调用 save_settings_file 命令', async () => {
      const adapter = new TauriFSAdapter();
      const settings = {
        theme: 'dark' as const,
        fontSize: 14,
        apiProfiles: [],
        activeApiProfileId: null,
        activePersonaId: null,
        chatBackground: { type: 'none' as const, value: '', opacity: 1, blur: 0 },
        bubbleStyle: { radius: 16, opacity: 1 },
        customCss: '',
        ttsConfig: { enabled: false, trigger: 'manual' as const, voiceURI: null, rate: 1, pitch: 1, volume: 1 },
        translationConfig: { enabled: false, provider: 'none' as const, apiKey: '', direction: 'auto' as const },
        summarizationConfig: { enabled: true, threshold: 4000, keepRecent: 10, maxSummaryTokens: 500, temperature: 0.3 },
        quickReplies: [],
      };
      invokeMock.mockResolvedValueOnce(undefined);
      await adapter.saveSettings(settings);
      expect(invokeMock).toHaveBeenCalledWith('save_settings_file', {
        settings,
      });
    });

    it('loadSettings 不存在时返回空对象', async () => {
      const adapter = new TauriFSAdapter();
      invokeMock.mockResolvedValueOnce(null);
      const result = await adapter.loadSettings();
      expect(result).toEqual({});
    });

    it('loadSettings 存在时返回设置对象', async () => {
      const adapter = new TauriFSAdapter();
      const mockSettings = {
        theme: 'light',
        fontSize: 16,
        apiProfiles: [{ id: 'p-1', name: 'Profile1' }],
        activeApiProfileId: 'p-1',
      };
      invokeMock.mockResolvedValueOnce(mockSettings);
      const result = await adapter.loadSettings();
      expect(result).toEqual(mockSettings);
      expect(invokeMock).toHaveBeenCalled();
      expect(invokeMock.mock.calls[0][0]).toBe('load_settings_file');
    });
  });
});

describe('Storage Factory', () => {
  it('在 Tauri 环境下返回 TauriFSAdapter 实例', async () => {
    const { getStorageAdapter, resetStorageAdapter } = await import(
      '@storage/storage-factory'
    );
    const { TauriFSAdapter: Adapter } = await import('@storage/tauri-fs-adapter');

    resetStorageAdapter();
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };

    const adapter = getStorageAdapter();
    expect(adapter).toBeInstanceOf(Adapter);

    resetStorageAdapter();
  });

  it('在非 Tauri 环境下返回 IndexedDBAdapter 实例', async () => {
    const { getStorageAdapter, resetStorageAdapter } = await import(
      '@storage/storage-factory'
    );
    const { IndexedDBAdapter } = await import('@storage/indexeddb-adapter');

    resetStorageAdapter();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    const adapter = getStorageAdapter();
    expect(adapter).toBeInstanceOf(IndexedDBAdapter);

    resetStorageAdapter();
  });

  it('getStorageEnv 返回当前环境标识', async () => {
    const { getStorageEnv } = await import('@storage/storage-factory');

    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };
    expect(getStorageEnv()).toBe('tauri');

    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    expect(getStorageEnv()).toBe('web');
  });
});
