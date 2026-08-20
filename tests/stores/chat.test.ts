import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatStore } from '../../src/stores/chat';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { UICharacter, ApiProfile } from '@/types';

// ── 测试夹具 ──

function makeCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'test-char',
    name: 'TestChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'T',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '测试角色',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    maxTokens: 2048,
    worldEntries: [],
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  };
}

function makeApiProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'test-profile',
    name: 'Test Profile',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    ...overrides,
  };
}

/**
 * 构造 OpenAI 兼容的 SSE 流响应
 */
function makeSSEResponse(deltas: Array<{ content: string; finishReason?: string | null }>): Response {
  const encoder = new TextEncoder();
  const chunks = deltas.map(({ content, finishReason }) => {
    const payload = {
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content }, finish_reason: finishReason ?? null }],
    };
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  });
  chunks.push(encoder.encode('data: [DONE]\n\n'));

  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    body: stream,
  } as Response;
}

/**
 * 构造 HTTP 错误响应
 */
function makeErrorResponse(status: number, message: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    body: null,
    json: async () => ({ error: { message } }),
    text: async () => JSON.stringify({ error: { message } }),
  } as Response;
}

/**
 * 删除数据库以确保测试间隔离
 */
async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// ── 测试用例 ──

describe('useChatStore — D4 集成', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('依赖注入', () => {
    it('setStorageAdapter 应接受 IndexedDBAdapter 实例', async () => {
      await resetDatabase('test-chat-store-di');
      const adapter = new IndexedDBAdapter('test-chat-store-di');
      await adapter.init();

      const chatStore = useChatStore();
      expect(() => chatStore.setStorageAdapter(adapter)).not.toThrow();

      await adapter.close();
    });

    it('setApiProfile(null) 应清空 ChatManager 状态', () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());
      chatStore.setApiProfile(null);
      expect(chatStore.isGenerating).toBe(false);
    });
  });

  describe('sendMessage 流程', () => {
    it('未配置 ChatManager 时应给出友好提示而非崩溃', async () => {
      const chatStore = useChatStore();
      const char = makeCharacter();

      await chatStore.sendMessage(char, '你好');

      expect(char.messages).toHaveLength(2);
      expect(char.messages[0]!.role).toBe('user');
      expect(char.messages[0]!.content).toBe('你好');
      expect(char.messages[1]!.role).toBe('assistant');
      expect(char.messages[1]!.generating).toBe(false);
      expect(char.messages[1]!.content).toContain('未配置 API Profile');
      expect(chatStore.lastError).not.toBeNull();
    });

    it('空文本不应触发任何消息', async () => {
      const chatStore = useChatStore();
      const char = makeCharacter();

      await chatStore.sendMessage(char, '   ');
      await chatStore.sendMessage(char, '');

      expect(char.messages).toHaveLength(0);
    });

    it('应通过 ChatManager 流式更新 AI 消息内容', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());

      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        makeSSEResponse([
          { content: '你好' },
          { content: '！' },
          { content: '', finishReason: 'stop' },
        ])
      );

      const char = makeCharacter();
      await chatStore.sendMessage(char, '你好');

      expect(spy).toHaveBeenCalled();
      expect(char.messages).toHaveLength(2);
      expect(char.messages[0]!.role).toBe('user');
      expect(char.messages[0]!.content).toBe('你好');
      expect(char.messages[1]!.role).toBe('assistant');
      expect(char.messages[1]!.generating).toBe(false);
      expect(char.messages[1]!.content).toBe('你好！');
      expect(chatStore.isGenerating).toBe(false);
    });

    it('应在生成过程中将 isGenerating 设为 true', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());

      let resolveFetch!: (r: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

      const char = makeCharacter();
      const sendPromise = chatStore.sendMessage(char, 'hi');

      // 等微任务让出，sendMessage 进入 fetch 等待状态
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(chatStore.isGenerating).toBe(true);

      // 解开 fetch
      resolveFetch(
        makeSSEResponse([{ content: '回复', finishReason: 'stop' }])
      );
      await sendPromise;

      expect(chatStore.isGenerating).toBe(false);
    });

    it('生成中再次 sendMessage 应被忽略（单实例串行）', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());

      let resolveFetch!: (r: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

      const char = makeCharacter();
      const sendPromise = chatStore.sendMessage(char, '第一');

      await new Promise<void>((r) => setTimeout(r, 10));
      expect(chatStore.isGenerating).toBe(true);

      // 第二次 sendMessage 应被忽略
      const char2MessagesLenBefore = char.messages.length;
      await chatStore.sendMessage(char, '第二');

      // 没有新消息加入
      expect(char.messages.length).toBe(char2MessagesLenBefore);

      resolveFetch(makeSSEResponse([{ content: '回复', finishReason: 'stop' }]));
      await sendPromise;
    });

    it('生成中切换 API Profile：任务结束后自动应用（P1-6）', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile({ baseUrl: 'https://old.example.com' }));

      let resolveFetch!: (r: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

      const char = makeCharacter();
      const sendPromise = chatStore.sendMessage(char, 'hi');

      await new Promise<void>((r) => setTimeout(r, 10));
      expect(chatStore.isGenerating).toBe(true);

      // 生成中切换 Profile（旧实现会静默丢弃）
      chatStore.setApiProfile(makeApiProfile({ baseUrl: 'https://new.example.com' }));

      // 完成任务
      resolveFetch(makeSSEResponse([{ content: '回复', finishReason: 'stop' }]));
      await sendPromise;
      expect(chatStore.isGenerating).toBe(false);

      // 下一次发送应使用新 Profile 的 baseUrl
      fetchSpy.mockClear();
      fetchSpy.mockResolvedValue(
        makeSSEResponse([{ content: '第二次', finishReason: 'stop' }])
      );
      const char2 = makeCharacter();
      await chatStore.sendMessage(char2, '再发');
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('new.example.com');
    });

    it('HTTP 错误应通过 lastError 反馈', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        makeErrorResponse(401, 'Invalid API key')
      );

      const char = makeCharacter();
      await chatStore.sendMessage(char, '你好');

      expect(char.messages[1]!.content).toContain('生成失败');
      expect(chatStore.lastError).not.toBeNull();
      expect(chatStore.lastError?.type).toBe('api');
      expect(chatStore.isGenerating).toBe(false);
    });
  });

  describe('stop 中止', () => {
    it('stop() 在未生成时调用应安全无副作用', () => {
      const chatStore = useChatStore();
      expect(() => chatStore.stop()).not.toThrow();
    });

    it('stop() 应中止正在进行的生成', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());

      let resolveFetch!: (r: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

      const char = makeCharacter();
      const sendPromise = chatStore.sendMessage(char, 'hi');

      await new Promise<void>((r) => setTimeout(r, 10));
      expect(chatStore.isGenerating).toBe(true);

      chatStore.stop();

      // 解开 fetch，应触发 abort 错误
      resolveFetch(
        makeSSEResponse([{ content: '部分内容', finishReason: 'stop' }])
      );
      await sendPromise;

      expect(chatStore.isGenerating).toBe(false);
      // 中止后 lastError.type 应是 aborted 或被流正常完成覆盖
      // （取决于 abort 在哪个阶段触发；此处仅检查 isGenerating 复位）
    });
  });

  describe('消息编辑/删除', () => {
    it('copyMessage 应调用 clipboard API', () => {
      const chatStore = useChatStore();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      chatStore.copyMessage({
        id: 'm1',
        role: 'user',
        content: 'hello',
        timestamp: 0,
      });

      expect(writeText).toHaveBeenCalledWith('hello');
    });

    it('deleteMessage 应从 messages 中移除', async () => {
      const chatStore = useChatStore();
      await resetDatabase('test-chat-del');
      const adapter = new IndexedDBAdapter('test-chat-del');
      await adapter.init();
      chatStore.setStorageAdapter(adapter);

      const char = makeCharacter({
        messages: [
          { id: 'm1', role: 'user', content: 'a', timestamp: 0 },
          { id: 'm2', role: 'assistant', content: 'b', timestamp: 1 },
        ],
      });

      chatStore.deleteMessage(char, 'm1');

      expect(char.messages).toHaveLength(1);
      expect(char.messages[0]!.id).toBe('m2');

      await adapter.close();
    });

    it('deleteMessage 不存在的 id 应安全无副作用', () => {
      const chatStore = useChatStore();
      const char = makeCharacter({
        messages: [{ id: 'm1', role: 'user', content: 'a', timestamp: 0 }],
      });

      expect(() => chatStore.deleteMessage(char, 'nonexistent')).not.toThrow();
      expect(char.messages).toHaveLength(1);
    });

    it('editMessage 应更新 content', () => {
      const chatStore = useChatStore();
      const msg = { id: 'm1', role: 'user' as const, content: 'a', timestamp: 0 };

      chatStore.editMessage(msg, 'new content');

      expect(msg.content).toBe('new content');
    });
  });

  describe('持久化', () => {
    it('未注入 storageAdapter 时 persistChat 应静默跳过', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        makeSSEResponse([{ content: 'hi', finishReason: 'stop' }])
      );

      const char = makeCharacter();
      await chatStore.sendMessage(char, '你好');

      // 不抛错即通过
      expect(char.messages).toHaveLength(2);
    });

    it('成功生成后应通过 IndexedDB 持久化对话', async () => {
      await resetDatabase('test-chat-persist');
      const adapter = new IndexedDBAdapter('test-chat-persist');
      await adapter.init();

      const chatStore = useChatStore();
      chatStore.setStorageAdapter(adapter);
      chatStore.setApiProfile(makeApiProfile());

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        makeSSEResponse([{ content: '你好呀！', finishReason: 'stop' }])
      );

      const char = makeCharacter({ id: 'persist-char' });
      await chatStore.sendMessage(char, '你好');

      // 从存储层读回验证
      const loaded = await adapter.loadChat('chat-persist-char');
      expect(loaded).not.toBeNull();
      expect(loaded!.characterId).toBe('persist-char');
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[0]!.role).toBe('user');
      expect(loaded!.messages[0]!.content).toBe('你好');
      expect(loaded!.messages[1]!.role).toBe('assistant');
      expect(loaded!.messages[1]!.content).toBe('你好呀！');

      await adapter.close();
    });

    it('loadChatHistory 应从存储层加载历史消息', async () => {
      await resetDatabase('test-chat-load');
      const adapter = new IndexedDBAdapter('test-chat-load');
      await adapter.init();

      // 预存一条对话
      await adapter.saveChat({
        id: 'chat-load-char',
        characterId: 'load-char',
        title: '历史对话',
        messages: [
          {
            id: 'old-m1',
            role: 'user',
            content: '历史用户消息',
            timestamp: '2026-07-01T00:00:00Z',
            swipes: [],
            swipeIndex: 0,
          },
          {
            id: 'old-m2',
            role: 'assistant',
            content: '历史 AI 回复',
            timestamp: '2026-07-01T00:01:00Z',
            swipes: [],
            swipeIndex: 0,
          },
        ],
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:01:00Z',
      });

      const chatStore = useChatStore();
      chatStore.setStorageAdapter(adapter);

      const char = makeCharacter({ id: 'load-char', messages: [] });
      await chatStore.loadChatHistory(char);

      expect(char.messages).toHaveLength(2);
      expect(char.messages[0]!.id).toBe('old-m1');
      expect(char.messages[0]!.content).toBe('历史用户消息');
      expect(typeof char.messages[0]!.timestamp).toBe('number');
      expect(char.messages[1]!.id).toBe('old-m2');

      await adapter.close();
    });

    it('loadChatHistory 不存在历史时应保持空消息', async () => {
      await resetDatabase('test-chat-empty');
      const adapter = new IndexedDBAdapter('test-chat-empty');
      await adapter.init();

      const chatStore = useChatStore();
      chatStore.setStorageAdapter(adapter);

      const char = makeCharacter({ id: 'no-history', messages: [] });
      await chatStore.loadChatHistory(char);

      expect(char.messages).toHaveLength(0);

      await adapter.close();
    });

    it('system 消息应在 loadChatHistory 后被过滤', async () => {
      await resetDatabase('test-chat-sys');
      const adapter = new IndexedDBAdapter('test-chat-sys');
      await adapter.init();

      await adapter.saveChat({
        id: 'chat-sys-char',
        characterId: 'sys-char',
        title: '带系统消息',
        messages: [
          {
            id: 'sys-1',
            role: 'system',
            content: 'system prompt',
            timestamp: '2026-07-01T00:00:00Z',
            swipes: [],
            swipeIndex: 0,
          },
          {
            id: 'u-1',
            role: 'user',
            content: 'user msg',
            timestamp: '2026-07-01T00:01:00Z',
            swipes: [],
            swipeIndex: 0,
          },
        ],
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:01:00Z',
      });

      const chatStore = useChatStore();
      chatStore.setStorageAdapter(adapter);

      const char = makeCharacter({ id: 'sys-char', messages: [] });
      await chatStore.loadChatHistory(char);

      // system 消息应被过滤
      expect(char.messages).toHaveLength(1);
      expect(char.messages[0]!.id).toBe('u-1');

      await adapter.close();
    });
  });

  describe('regenerateMessage 流程', () => {
    it('应基于历史用户消息重新生成 assistant 回复', async () => {
      const chatStore = useChatStore();
      chatStore.setApiProfile(makeApiProfile());

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        makeSSEResponse([{ content: '重新生成的回复', finishReason: 'stop' }])
      );

      const char = makeCharacter({
        messages: [
          { id: 'u1', role: 'user', content: '原始问题', timestamp: 1 },
          { id: 'a1', role: 'assistant', content: '原始回复', timestamp: 2 },
        ],
      });

      await chatStore.regenerateMessage(char, 'a1');

      // a1 内容应被替换为新回复
      expect(char.messages).toHaveLength(2);
      expect(char.messages[1]!.id).toBe('a1');
      expect(char.messages[1]!.content).toBe('重新生成的回复');
      expect(char.messages[1]!.generating).toBe(false);
    });

    it('重新生成非 assistant 消息应被忽略', async () => {
      const chatStore = useChatStore();
      const char = makeCharacter({
        messages: [
          { id: 'u1', role: 'user', content: '问题', timestamp: 0 },
        ],
      });

      await chatStore.regenerateMessage(char, 'u1');

      expect(char.messages[0]!.content).toBe('问题');
    });

    it('重新生成不存在的消息 id 应被忽略', async () => {
      const chatStore = useChatStore();
      const char = makeCharacter({
        messages: [
          { id: 'a1', role: 'assistant', content: '原', timestamp: 0 },
        ],
      });

      await chatStore.regenerateMessage(char, 'nonexistent');

      expect(char.messages[0]!.content).toBe('原');
    });

    it('历史中无用户消息时无法重新生成', async () => {
      const chatStore = useChatStore();
      const char = makeCharacter({
        messages: [
          { id: 'a1', role: 'assistant', content: '原', timestamp: 0 },
        ],
      });

      await chatStore.regenerateMessage(char, 'a1');

      expect(char.messages[0]!.content).toBe('原');
    });
  });
});

// ── T-17 二期: 本地前缀稳定率 + TTFT 检测 ──

describe('chat store 本地缓存检测(前缀稳定率/TTFT)', () => {
  it('同角色连续请求:前缀稳定率 100%;角色设定变更后下降', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());

    const makeSSE = () =>
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        makeSSEResponse([{ content: 'ok' }, { content: '', finishReason: 'stop' }])
      );

    const char = makeCharacter();
    // 第 1 轮:仅记录前缀(无对比)
    makeSSE();
    await chatStore.sendMessage(char, '第一轮');
    expect(chatStore.prefixStableRate).toBeNull();
    expect(chatStore.prefixStability.total).toBe(0);

    // 第 2 轮:同角色 → 稳定
    makeSSE();
    await chatStore.sendMessage(char, '第二轮');
    expect(chatStore.prefixStableRate).toBe(1);
    expect(chatStore.prefixStability).toMatchObject({ stable: 1, total: 1 });

    // 修改角色设定(前缀变化)→ 不稳定
    char.description = '被修改的设定';
    makeSSE();
    await chatStore.sendMessage(char, '第三轮');
    expect(chatStore.prefixStableRate).toBe(0.5);
    expect(chatStore.prefixStability).toMatchObject({ stable: 1, total: 2 });
  });

  it('TTFT 在首个 delta 到达时记录', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([{ content: 'hi' }, { content: '', finishReason: 'stop' }])
    );

    const before = chatStore.ttftStats.count;
    const char = makeCharacter();
    await chatStore.sendMessage(char, '你好');
    expect(chatStore.ttftStats.count).toBe(before + 1);
    expect(chatStore.ttftStats.lastMs).toBeGreaterThanOrEqual(0);
    expect(chatStore.ttftStats.avgMs).toBeGreaterThanOrEqual(0);
  });
});
