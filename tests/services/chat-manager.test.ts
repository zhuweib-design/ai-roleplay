import { describe, it, expect } from 'vitest';
import { ChatManager, classifyChatError } from '../../src/services/chat-manager';
import { ApiError } from '../../src/api/types';
import type { ApiClient } from '../../src/api/api-client';
import type { ChatStream, ChatStreamEvent, ChatRequest, ApiMessage } from '../../src/api/types';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import { MemoryStore, CharacterRegistry, EmotionTracker } from '@core/memory-store';
import { OptimizationPipeline, createDefaultConfig } from '@core/optimization-pipeline';
import type { L0L2Deps } from '@core/l0-l2-runtime';

// ── 测试辅助：构造 mock ApiClient ──

/** 构造一个可控的 fake ApiClient，按预设事件序列 yield */
function makeFakeApiClient(events: ChatStreamEvent[]): ApiClient {
  return {
    provider: 'fake',
    async chat(_req: ChatRequest): Promise<string> {
      // 模拟非流式
      const done = events.find((e) => e.type === 'done');
      return done?.fullContent ?? '';
    },
    async *chatStream(_req: ChatRequest): ChatStream {
      for (const ev of events) yield ev;
    },
  };
}

/** 构造一个最小可用 CharacterCard */
function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'card-1',
    name: 'Seraphina',
    description: '森林精灵法师',
    personality: '温柔治愈',
    scenario: '翡翠森林',
    firstMessage: '你好',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: ['奇幻'],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  id = `m-${Math.random().toString(36).slice(2)}`
): ChatMessage {
  return {
    id,
    role,
    content,
    timestamp: new Date().toISOString(),
    swipes: [],
    swipeIndex: 0,
  };
}

/** 人工控制时序的 fake ApiClient（用于测试 abort） */
function makeControllableApiClient(): {
  client: ApiClient;
  emit: (ev: ChatStreamEvent) => void;
  close: () => void;
  lastRequest: () => ChatRequest | undefined;
} {
  const requests: ChatRequest[] = [];
  let resolveNext: ((value: ChatStreamEvent) => void) | null = null;
  let isClosed = false;

  const client: ApiClient = {
    provider: 'controllable',
    async chat(): Promise<string> {
      return '';
    },
    async *chatStream(req: ChatRequest): ChatStream {
      requests.push(req);
      while (!isClosed) {
        const ev = await new Promise<ChatStreamEvent>((resolve) => {
          resolveNext = resolve;
        });
        if (isClosed) break;
        yield ev;
      }
    },
  };

  return {
    client,
    emit(ev: ChatStreamEvent) {
      // 优先用队列中已有的事件
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r(ev);
      }
      // 否则忽略（避免阻塞，因为 emit 后 generator 推进需要时间）
    },
    close() {
      isClosed = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ type: 'done', fullContent: '' });
      }
    },
    lastRequest() {
      return requests[requests.length - 1];
    },
  };
}

/** 等待一个微任务（让 generator 推进） */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ── 测试用例 ─

describe('ChatManager', () => {
  describe('sendMessage 流式回调', () => {
    it('应按顺序触发 onDelta → onDone', async () => {
      const apiClient = makeFakeApiClient([
        { type: 'delta', delta: 'Hello' },
        { type: 'delta', delta: ' world' },
        { type: 'delta', delta: '!' },
        { type: 'done', fullContent: 'Hello world!', finishReason: 'stop' },
      ]);
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
      });

      const deltas: Array<{ delta: string; full: string }> = [];
      const doneEvents: string[] = [];

      const result = await manager.sendMessage(
        {
          card: makeCard(),
          history: [],
          userMessage: 'hi',
        },
        {
          onDelta: (delta, full) => deltas.push({ delta, full }),
          onDone: (full, reason) => {
            doneEvents.push(`${full}|${reason ?? ''}`);
          },
        }
      );

      expect(result).toBe('Hello world!');
      expect(deltas.length).toBe(3);
      expect(deltas[0]).toEqual({ delta: 'Hello', full: 'Hello' });
      expect(deltas[1]).toEqual({ delta: ' world', full: 'Hello world' });
      expect(deltas[2]).toEqual({ delta: '!', full: 'Hello world!' });
      expect(doneEvents).toEqual(['Hello world!|stop']);
    });

    it('应在 prompt 构建后触发 onPromptBuilt，包含 tokenCount 与 trimmed', async () => {
      const apiClient = makeFakeApiClient([{ type: 'done', fullContent: 'ok' }]);
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
      });

      const promptInfos: Array<{ tokenCount: number; trimmed: boolean; messageCount: number }> = [];

      await manager.sendMessage(
        {
          card: makeCard(),
          history: [],
          userMessage: 'hello',
        },
        {
          onPromptBuilt: (info) => promptInfos.push(info),
        }
      );

      expect(promptInfos.length).toBe(1);
      expect(promptInfos[0].tokenCount).toBeGreaterThan(0);
      expect(promptInfos[0].messageCount).toBeGreaterThanOrEqual(2); // system + user
    });

    it('应忽略空 delta 事件', async () => {
      const apiClient = makeFakeApiClient([
        { type: 'delta', delta: '' },
        { type: 'delta', delta: 'Hi' },
        { type: 'delta', delta: '' },
        { type: 'done', fullContent: 'Hi' },
      ]);
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
      });

      const deltas: string[] = [];
      await manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' },
        { onDelta: (delta) => deltas.push(delta) }
      );

      expect(deltas).toEqual(['Hi']);
    });

    it('流自然结束未触发 done 时应触发 onDone', async () => {
      // 不发 done 事件
      const apiClient = makeFakeApiClient([
        { type: 'delta', delta: 'Hi' },
      ]);
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
      });

      const doneEvents: string[] = [];
      const result = await manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' },
        { onDone: (full) => doneEvents.push(full) }
      );

      expect(result).toBe('Hi');
      expect(doneEvents).toEqual(['Hi']);
    });

    it('应在 error 事件时触发 onError 并返回部分内容', async () => {
      const apiClient = makeFakeApiClient([
        { type: 'delta', delta: 'partial' },
        { type: 'error', error: '上游错误' },
      ]);
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
      });

      const errors: string[] = [];
      const result = await manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' },
        { onError: (e) => errors.push(e.message) }
      );

      expect(result).toBe('partial');
      expect(errors).toEqual(['上游错误']);
    });
  });

  describe('isGenerating 状态', () => {
    it('生成中应返回 true，结束后返回 false', async () => {
      const controllable = makeControllableApiClient();
      const manager = new ChatManager({
        apiClient: controllable.client,
        model: 'gpt-4o',
      });

      const promise = manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' }
      );

      // 等待 generator 启动并设置 resolveNext
      await tick();
      expect(manager.isGenerating).toBe(true);

      controllable.emit({ type: 'delta', delta: 'Hi' });
      await tick();
      controllable.emit({ type: 'done', fullContent: 'Hi' });
      await promise;

      expect(manager.isGenerating).toBe(false);
    }, 10000);

    it('已有生成进行中时再次 sendMessage 应抛错', async () => {
      const controllable = makeControllableApiClient();
      const manager = new ChatManager({
        apiClient: controllable.client,
        model: 'gpt-4o',
      });

      const promise = manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' }
      );
      await tick();

      await expect(
        manager.sendMessage({ card: makeCard(), history: [], userMessage: 'hi2' })
      ).rejects.toThrow(/已有生成任务进行中/);

      controllable.emit({ type: 'done', fullContent: '' });
      await promise;
    }, 10000);
  });

  describe('stop() 中止', () => {
    it('应中止进行中的生成', async () => {
      const controllable = makeControllableApiClient();
      const manager = new ChatManager({
        apiClient: controllable.client,
        model: 'gpt-4o',
      });

      const doneEvents: string[] = [];
      const promise = manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' },
        { onDone: (full) => doneEvents.push(full) }
      );

      await tick();
      expect(manager.isGenerating).toBe(true);

      controllable.emit({ type: 'delta', delta: 'partial' });
      await tick();
      manager.stop();

      // 给 abort 一点时间传播
      await tick();
      controllable.close();

      await promise;
      expect(manager.isGenerating).toBe(false);
    }, 10000);

    it('无生成任务时 stop 应为 no-op', () => {
      const apiClient = makeFakeApiClient([]);
      const manager = new ChatManager({ apiClient, model: 'gpt-4o' });
      expect(() => manager.stop()).not.toThrow();
    });
  });

  describe('updateConfig()', () => {
    it('应能在空闲时更新配置', () => {
      const apiClient = makeFakeApiClient([]);
      const manager = new ChatManager({ apiClient, model: 'gpt-4o' });

      manager.updateConfig({ model: 'claude-3-5', temperature: 0.5 });
      expect(manager.currentConfig.model).toBe('claude-3-5');
      expect(manager.currentConfig.temperature).toBe(0.5);
    });

    it('生成中更新配置应抛错', async () => {
      const controllable = makeControllableApiClient();
      const manager = new ChatManager({
        apiClient: controllable.client,
        model: 'gpt-4o',
      });

      const promise = manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' }
      );
      await tick();

      expect(() => manager.updateConfig({ model: 'x' })).toThrow(/生成进行中/);

      controllable.emit({ type: 'done', fullContent: '' });
      await promise;
    }, 10000);
  });

  describe('prompt-builder 集成', () => {
    it('应将角色定义、历史、用户消息正确组装', async () => {
      const requests: ChatRequest[] = [];
      const apiClient: ApiClient = {
        provider: 'recording',
        async chat(): Promise<string> {
          return '';
        },
        async *chatStream(req: ChatRequest): ChatStream {
          requests.push(req);
          yield { type: 'done', fullContent: 'ok' };
        },
      };
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
        userName: 'Hero',
        systemPrompt: 'You are a roleplay assistant.',
      });

      const history: ChatMessage[] = [
        makeMessage('assistant', '你好'),
        makeMessage('user', '你好啊'),
      ];

      await manager.sendMessage({
        card: makeCard({ name: 'Alice', description: '测试角色' }),
        history,
        userMessage: '继续',
      });

      expect(requests.length).toBe(1);
      const msgs = requests[0].messages;
      // 第一条应是 system，包含 systemPrompt + 角色定义
      expect(msgs[0].role).toBe('system');
      expect(msgs[0].content).toContain('You are a roleplay assistant.');
      expect(msgs[0].content).toContain('Alice');
      // 最后一条应是 user
      expect(msgs[msgs.length - 1].role).toBe('user');
      expect(msgs[msgs.length - 1].content).toBe('继续');
      // 中间应包含历史
      expect(msgs.some((m: ApiMessage) => m.content === '你好')).toBe(true);
      expect(msgs.some((m: ApiMessage) => m.content === '你好啊')).toBe(true);
    });

    it('应在 Token 超限时触发裁剪（trimmed=true）', async () => {
      const apiClient = makeFakeApiClient([{ type: 'done', fullContent: 'ok' }]);
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
        maxContextTokens: 100, // 极小预算强制裁剪
        reservedTokens: 50,
      });

      // 制造大量历史消息
      const history: ChatMessage[] = [];
      for (let i = 0; i < 20; i++) {
        history.push(makeMessage('user', `历史消息 ${i} `.repeat(10)));
        history.push(makeMessage('assistant', `历史回复 ${i} `.repeat(10)));
      }

      const promptInfos: Array<{ trimmed: boolean }> = [];
      await manager.sendMessage(
        { card: makeCard(), history, userMessage: '继续' },
        { onPromptBuilt: (info) => promptInfos.push(info) }
      );

      expect(promptInfos[0].trimmed).toBe(true);
    });

    it('应支持 characterNote 深度注入', async () => {
      const requests: ChatStreamEvent[][] = [];
      const apiClient: ApiClient = {
        provider: 'capture',
        async chat(): Promise<string> {
          return '';
        },
        async *chatStream(req: ChatRequest): ChatStream {
          requests.push([{
            type: 'done',
            fullContent: '',
          }]);
          // 收集 messages
          (apiClient as unknown as { _captured?: ApiMessage[] })._captured = req.messages;
          yield { type: 'done', fullContent: 'ok' };
        },
      };
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
      });

      await manager.sendMessage({
        card: makeCard({
          characterNote: { text: '保持神秘', depth: 1, role: 'system' },
        }),
        history: [
          makeMessage('user', '历史1'),
          makeMessage('assistant', '回复1'),
        ],
        userMessage: '当前消息',
      });

      const captured = (apiClient as unknown as { _captured?: ApiMessage[] })._captured ?? [];
      // 应包含 "保持神秘"
      expect(captured.some((m) => m.content === '保持神秘')).toBe(true);
      // depth=1 表示插入到倒数第 1 条之前（即 user 消息之前）
      const noteIdx = captured.findIndex((m) => m.content === '保持神秘');
      const userIdx = captured.findIndex((m) => m.content === '当前消息');
      expect(noteIdx).toBeGreaterThanOrEqual(0);
      expect(userIdx).toBeGreaterThan(noteIdx);
    });
  });

  describe('overrides 覆盖配置', () => {
    it('应支持单次调用覆盖 model/temperature/maxTokens', async () => {
      const requests: ChatRequest[] = [];
      const apiClient: ApiClient = {
        provider: 'capture',
        async chat(): Promise<string> {
          return '';
        },
        async *chatStream(req: ChatRequest): ChatStream {
          requests.push(req);
          yield { type: 'done', fullContent: '' };
        },
      };
      const manager = new ChatManager({
        apiClient,
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1024,
      });

      await manager.sendMessage({
        card: makeCard(),
        history: [],
        userMessage: 'hi',
        overrides: { model: 'claude-3-5', temperature: 1.2, maxTokens: 2048 },
      });

      expect(requests[0].model).toBe('claude-3-5');
      expect(requests[0].temperature).toBe(1.2);
      expect(requests[0].maxTokens).toBe(2048);
    });
  });

  describe('异常路径', () => {
    it('ApiClient 抛异常时应触发 onError 并返回部分内容', async () => {
      const apiClient: ApiClient = {
        provider: 'throwing',
        async chat(): Promise<string> {
          return '';
        },
        async *chatStream(): ChatStream {
          yield { type: 'delta', delta: 'partial' };
          throw new Error('connection reset');
        },
      };
      const manager = new ChatManager({ apiClient, model: 'gpt-4o' });

      const errors: string[] = [];
      const result = await manager.sendMessage(
        { card: makeCard(), history: [], userMessage: 'hi' },
        { onError: (e) => errors.push(e.message) }
      );

      expect(result).toBe('partial');
      expect(errors).toEqual(['connection reset']);
    });

    it('isGenerating 应在异常后恢复为 false', async () => {
      const apiClient: ApiClient = {
        provider: 'throwing',
        async chat(): Promise<string> {
          return '';
        },
        async *chatStream(): ChatStream {
          throw new Error('oops');
        },
      };
      const manager = new ChatManager({ apiClient, model: 'gpt-4o' });

      await manager.sendMessage({
        card: makeCard(),
        history: [],
        userMessage: 'hi',
      });

      expect(manager.isGenerating).toBe(false);
    });
  });

  describe('E-01/E-02 嵌入优化接线', () => {
    function makeDeps(): L0L2Deps {
      const store = new MemoryStore();
      return {
        store,
        registry: new CharacterRegistry(store),
        tracker: new EmotionTracker(),
      };
    }

    function makeRecordingClient(requests: ChatRequest[]): ApiClient {
      return {
        provider: 'recording',
        async chat(): Promise<string> {
          return '';
        },
        async *chatStream(req: ChatRequest): ChatStream {
          requests.push(req);
          yield { type: 'done', fullContent: '她感到一阵剧烈的愤怒。' };
        },
      };
    }

    it('L2 启用时:状态性旁白被精简,对白/情绪零损失', async () => {
      const requests: ChatRequest[] = [];
      const deps = makeDeps();
      const pipeline = new OptimizationPipeline({
        enabled: true,
        l0Enabled: true,
        l2Enabled: true,
        l1Enabled: false,
        stage: 'l0-l2',
      });
      const manager = new ChatManager({
        apiClient: makeRecordingClient(requests),
        model: 'gpt-4o',
        optimization: pipeline,
        l0l2: deps,
        sessionId: 'char-1',
      });

      const history: ChatMessage[] = [
        makeMessage('assistant', '他然后站起身，沉默片刻。'),
        makeMessage('user', '继续'),
      ];
      await manager.sendMessage({
        card: makeCard(),
        history,
        userMessage: '继续',
      });

      expect(requests.length).toBe(1);
      const msgs = requests[0].messages;
      // 状态性旁白被精简(删除"然后")
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).not.toContain('然后');
    });

    it('L0 启用时:注入 standing 前缀与情绪状态', async () => {
      const requests: ChatRequest[] = [];
      const deps = makeDeps();
      await deps.store.put(
        { id: 'char-1', scope: 'standing', kind: 'character', body: '测试角色设定' },
        'human'
      );
      await deps.tracker.update('1', '平静', '开场');
      const pipeline = new OptimizationPipeline({
        enabled: true,
        l0Enabled: true,
        l2Enabled: false,
        l1Enabled: false,
        stage: 'l0',
      });
      const manager = new ChatManager({
        apiClient: makeRecordingClient(requests),
        model: 'gpt-4o',
        optimization: pipeline,
        l0l2: deps,
        sessionId: '1',
      });

      await manager.sendMessage({
        card: makeCard(),
        history: [],
        userMessage: '你好',
      });

      expect(requests.length).toBe(1);
      const systemMsg = requests[0].messages.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('测试角色设定');
      expect(systemMsg?.content).toContain('平静');
    });

    it('情绪状态在回复后自动更新(onEmotionUpdated 触发)', async () => {
      const requests: ChatRequest[] = [];
      const deps = makeDeps();
      const pipeline = new OptimizationPipeline({
        enabled: true,
        l0Enabled: true,
        l2Enabled: false,
        l1Enabled: false,
        stage: 'l0',
      });
      const manager = new ChatManager({
        apiClient: makeRecordingClient(requests),
        model: 'gpt-4o',
        optimization: pipeline,
        l0l2: deps,
        sessionId: 'char-1',
      });

      const emotions: string[] = [];
      await manager.sendMessage(
        { card: makeCard(), history: [], userMessage: '你好' },
        { onEmotionUpdated: (label) => emotions.push(label) }
      );

      // 回复含"愤怒",应触发情绪更新回调
      expect(emotions).toContain('愤怒');
      const state = await deps.tracker.current('char-1');
      expect(state?.label).toBe('愤怒');
    });

    it('未启用优化时:不注入前缀/情绪,原样透传', async () => {
      const requests: ChatRequest[] = [];
      const deps = makeDeps();
      const pipeline = new OptimizationPipeline(createDefaultConfig()); // 全关
      const manager = new ChatManager({
        apiClient: makeRecordingClient(requests),
        model: 'gpt-4o',
        optimization: pipeline,
        l0l2: deps,
        sessionId: 'char-1',
      });

      await manager.sendMessage({
        card: makeCard(),
        history: [],
        userMessage: '你好',
      });

      const systemMsg = requests[0].messages.find((m) => m.role === 'system');
      expect(systemMsg?.content).not.toContain('当前情绪状态');
      expect(systemMsg?.content).not.toContain('输出纪律');
    });
  });
});

describe('classifyChatError', () => {
  it('AbortError 应分类为 aborted', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(classifyChatError(err)).toBe('aborted');
  });

  it('包含"已停止生成"消息应分类为 aborted', () => {
    expect(classifyChatError(new Error('已停止生成'))).toBe('aborted');
  });

  it('ApiError 应分类为 api', () => {
    expect(classifyChatError(new ApiError('API error', 401))).toBe('api');
  });

  it('包含 network 关键字应分类为 network', () => {
    expect(classifyChatError(new Error('network request failed'))).toBe('network');
  });

  it('其它错误应分类为 unknown', () => {
    expect(classifyChatError(new Error('something went wrong'))).toBe('unknown');
  });

  // ── 需求9：基于 ApiError.kind 字段的精确分类 ──

  it('ApiError.kind=aborted 应分类为 aborted', () => {
    const err = new ApiError('已停止生成', undefined, 'openai', 'aborted');
    expect(classifyChatError(err)).toBe('aborted');
  });

  it('ApiError.kind=network 应分类为 network', () => {
    const err = new ApiError('Failed to fetch', undefined, 'openai', 'network');
    expect(classifyChatError(err)).toBe('network');
  });

  it('ApiError.kind=cors 应分类为 network', () => {
    const err = new ApiError('CORS 拦截', undefined, 'openai', 'cors');
    expect(classifyChatError(err)).toBe('network');
  });

  it('ApiError.kind=invalid-url 应分类为 network', () => {
    const err = new ApiError('URL 格式错误', undefined, 'openai', 'invalid-url');
    expect(classifyChatError(err)).toBe('network');
  });

  it('ApiError.kind=rate-limit 应分类为 network', () => {
    const err = new ApiError('429 Too Many Requests', 429, 'openai', 'rate-limit');
    expect(classifyChatError(err)).toBe('network');
  });

  it('ApiError.kind=auth 应分类为 api', () => {
    const err = new ApiError('401 Unauthorized', 401, 'openai', 'auth');
    expect(classifyChatError(err)).toBe('api');
  });

  it('ApiError.kind=server 应分类为 api', () => {
    const err = new ApiError('500 Internal Server Error', 500, 'openai', 'server');
    expect(classifyChatError(err)).toBe('api');
  });

  it('ApiError.kind=unknown 且含 statusCode 应分类为 api', () => {
    const err = new ApiError('未知 API 错误', 400, 'openai', 'unknown');
    expect(classifyChatError(err)).toBe('api');
  });
});

// ── T-02 工具调用循环 ──

/** 按调用次数返回不同事件脚本的 fake ApiClient */
function makeScriptedApiClient(scripts: ChatStreamEvent[][]): ApiClient & { callCount: () => number } {
  let calls = 0;
  const client: ApiClient = {
    provider: 'scripted',
    async chat(): Promise<string> {
      return '';
    },
    async *chatStream(): ChatStream {
      const script = scripts[Math.min(calls, scripts.length - 1)];
      calls++;
      for (const ev of script) yield ev;
    },
  };
  return Object.assign(client, { callCount: () => calls });
}

describe('ChatManager 工具调用循环 (T-02)', () => {
  it('模型发起 tool_call → 执行工具 → 回填 → 续答 → 返回最终文本', async () => {
    const apiClient = makeScriptedApiClient([
      // 第 1 轮：仅工具调用，无文本
      [
        {
          type: 'done',
          fullContent: '',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'call_1', type: 'function', function: { name: 'get_var', arguments: '{"name":"hp"}' } },
          ],
        },
      ],
      // 第 2 轮：最终文本回复
      [{ type: 'delta', delta: '你的 HP 是 ' }, { type: 'delta', delta: '100' }, { type: 'done', fullContent: '你的 HP 是 100' }],
    ]);

    const executed: string[] = [];
    const manager = new ChatManager({
      apiClient,
      model: 'gpt-4o',
      tools: [
        { type: 'function', function: { name: 'get_var', description: '读变量' } },
      ],
      executeTool: async (call) => {
        executed.push(call.function.name);
        return '100';
      },
    });

    const deltas: string[] = [];
    const result = await manager.sendMessage(
      { card: makeCard(), history: [], userMessage: '我的 HP 是多少？' },
      { onDelta: (d) => deltas.push(d) }
    );

    expect(executed).toEqual(['get_var']);
    expect(apiClient.callCount()).toBe(2);
    expect(result).toBe('你的 HP 是 100');
    // onDelta 回调第一个参数是增量 token
    expect(deltas).toEqual(['你的 HP 是 ', '100']);
  });

  it('第二轮请求应携带 assistant(tool_calls) 与 tool 结果消息', async () => {
    const requests: ChatRequest[] = [];
    const client: ApiClient = {
      provider: 'recording',
      async chat() {
        return '';
      },
      async *chatStream(req: ChatRequest): ChatStream {
        requests.push(req);
        if (requests.length === 1) {
          yield {
            type: 'done',
            fullContent: '',
            toolCalls: [
              { id: 'call_9', type: 'function', function: { name: 'set_var', arguments: '{"name":"x","value":"1"}' } },
            ],
          };
        } else {
          yield { type: 'done', fullContent: '完成' };
        }
      },
    };

    const manager = new ChatManager({
      apiClient: client,
      model: 'm',
      tools: [{ type: 'function', function: { name: 'set_var', description: '设变量' } }],
      executeTool: async () => '已设置',
    });

    await manager.sendMessage({ card: makeCard(), history: [], userMessage: 'hi' });

    expect(requests.length).toBe(2);
    const messages = requests[1].messages;
    const assistantMsg = messages.find((m) => m.role === 'assistant' && m.toolCalls);
    expect(assistantMsg?.toolCalls).toEqual([
      { id: 'call_9', type: 'function', function: { name: 'set_var', arguments: '{"name":"x","value":"1"}' } },
    ]);
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg?.toolCallId).toBe('call_9');
    expect(toolMsg?.content).toBe('已设置');
  });

  it('工具执行抛错时应回填错误消息并继续续答', async () => {
    const apiClient = makeScriptedApiClient([
      [
        {
          type: 'done',
          fullContent: '',
          toolCalls: [
            { id: 'call_2', type: 'function', function: { name: 'boom', arguments: '{}' } },
          ],
        },
      ],
      [{ type: 'done', fullContent: '已处理' }],
    ]);

    const manager = new ChatManager({
      apiClient,
      model: 'm',
      tools: [{ type: 'function', function: { name: 'boom', description: 'x' } }],
      executeTool: async () => {
        throw new Error('执行器崩溃');
      },
    });

    const result = await manager.sendMessage({ card: makeCard(), history: [], userMessage: 'hi' });
    expect(result).toBe('已处理');
  });

  it('工具轮数超过上限时应停止循环并返回最后内容', async () => {
    const toolOnly: ChatStreamEvent[] = [
      {
        type: 'done',
        fullContent: '',
        toolCalls: [
          { id: 'call_x', type: 'function', function: { name: 'loop', arguments: '{}' } },
        ],
      },
    ];
    // 前 8 轮都是工具调用，第 9 轮（超限）应直接结束
    const scripts = Array.from({ length: 9 }, () => toolOnly);
    const apiClient = makeScriptedApiClient(scripts);

    const manager = new ChatManager({
      apiClient,
      model: 'm',
      tools: [{ type: 'function', function: { name: 'loop', description: 'x' } }],
      executeTool: async () => 'again',
    });

    let doneCalled = 0;
    const result = await manager.sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onDone: () => doneCalled++ }
    );

    // 8 轮工具 + 第 9 轮直接 done
    expect(apiClient.callCount()).toBe(9);
    expect(doneCalled).toBe(1);
    expect(result).toBe('');
  });

  it('未配置 executeTool 时工具调用直接结束', async () => {
    const apiClient = makeScriptedApiClient([
      [
        {
          type: 'done',
          fullContent: '',
          toolCalls: [
            { id: 'call_3', type: 'function', function: { name: 'get_var', arguments: '{}' } },
          ],
        },
      ],
    ]);

    const manager = new ChatManager({
      apiClient,
      model: 'm',
      tools: [{ type: 'function', function: { name: 'get_var', description: 'x' } }],
    });

    const result = await manager.sendMessage({ card: makeCard(), history: [], userMessage: 'hi' });
    expect(apiClient.callCount()).toBe(1); // 不再续答
    expect(result).toBe('');
  });
});
