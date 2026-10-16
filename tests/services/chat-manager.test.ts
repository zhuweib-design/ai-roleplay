import { describe, it, expect } from 'vitest';
import { ChatManager, classifyChatError } from '../../src/services/chat-manager';
import { ApiError } from '../../src/api/types';
import type { ApiClient } from '../../src/api/api-client';
import type { ChatStream, ChatStreamEvent, ChatRequest, ApiMessage } from '../../src/api/types';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import type { CharacterStatus } from '@core/status-schema';
import { MemoryStore, CharacterRegistry, EmotionTracker } from '@core/memory-store';
import { OptimizationPipeline, createDefaultConfig } from '@core/optimization-pipeline';
import type { L0L2Deps } from '@core/l0-l2-runtime';
import type { RuntimeContext, RuntimeReduceResult } from '../../src/runtime/types';
import type { ChatRuntimeIntegration } from '../../src/runtime/chat-bridge';
import { stableChatConversationTurnIds } from '../../src/runtime/runtime-id';

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
      expect(promptInfos[0]!.tokenCount).toBeGreaterThan(0);
      expect(promptInfos[0]!.messageCount).toBeGreaterThanOrEqual(2); // system + user
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
      const msgs = requests[0]!.messages;
      // 第一条应是 system，包含 systemPrompt + 角色定义
      expect(msgs[0]!.role).toBe('system');
      expect(msgs[0]!.content).toContain('You are a roleplay assistant.');
      expect(msgs[0]!.content).toContain('Alice');
      // 最后一条应是 user
      expect(msgs[msgs.length - 1]!.role).toBe('user');
      expect(msgs[msgs.length - 1]!.content).toBe('继续');
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

      expect(promptInfos[0]!.trimmed).toBe(true);
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
    it('应支持单次调用覆盖 model/temperature；maxTokens 恒为由上下文推导的值', async () => {
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
      });

      await manager.sendMessage({
        card: makeCard(),
        history: [],
        userMessage: 'hi',
        overrides: { model: 'claude-3-5', temperature: 1.2 },
      });

      expect(requests[0]!.model).toBe('claude-3-5');
      expect(requests[0]!.temperature).toBe(1.2);
      // 输出预算不再是可覆盖的旋钮：= 上下文 − 预留 − 输入（默认 8192 − 1024 为上界）
      expect(requests[0]!.maxTokens).toBeGreaterThan(0);
      expect(requests[0]!.maxTokens).toBeLessThanOrEqual(8192 - 1024);
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
      const msgs = requests[0]!.messages;
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
      const systemMsg = requests[0]!.messages.find((m) => m.role === 'system');
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

      const systemMsg = requests[0]!.messages.find((m) => m.role === 'system');
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
      const script = scripts[Math.min(calls, scripts.length - 1)]!;
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
    const messages = requests[1]!.messages;
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

// ── P0-1：编排层思维链（标签型 + 字段型 + done 收敛） ──

describe('ChatManager — P0-1 思维链', () => {
  function newManager(client: ApiClient) {
    return new ChatManager({ apiClient: client, model: 'test-model' });
  }

  it('标签型流：onThinking 收到思考，onDelta 只收到正文', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', delta: '<thi' },
      { type: 'delta', delta: 'nk>A</thi' },
      { type: 'delta', delta: 'nk>B' },
      { type: 'done', fullContent: '<think>A</think>B' },
    ]);
    const thinking: string[] = [];
    const deltas: string[] = [];
    let final = '';

    await newManager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onThinking: (d) => thinking.push(d),
        onDelta: (d) => deltas.push(d),
        onDone: (full) => {
          final = full;
        },
      }
    );

    expect(thinking.join('')).toBe('A');
    expect(deltas.join('')).toBe('B');
    // done 的 fullContent 含 <think> 标签时，最终 onDone 的 content 已剥离
    expect(final).toBe('B');
    expect(final.includes('<think>')).toBe(false);
  });

  it('字段型流：thinkingDelta 走 onThinking，不影响 onDelta', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', thinkingDelta: '我在思考' },
      { type: 'delta', delta: '答案' },
      { type: 'done', fullContent: '答案', fullThinking: '我在思考' },
    ]);
    const thinking: string[] = [];
    const deltas: string[] = [];
    let finalThinking = '';
    let final = '';

    await newManager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onThinking: (d, full) => {
          thinking.push(d);
          finalThinking = full;
        },
        onDelta: (d) => deltas.push(d),
        onDone: (full) => {
          final = full;
        },
      }
    );

    expect(thinking.join('')).toBe('我在思考');
    expect(finalThinking).toBe('我在思考');
    expect(deltas.join('')).toBe('答案');
    expect(final).toBe('答案');
  });

  it('混合来源：字段型优先，标签型兜底（互斥原则）', async () => {
    // 字段型已出现 → done 的 fullContent 原样采用，不再做标签解析
    const client = makeFakeApiClient([
      { type: 'delta', thinkingDelta: '字段思考' },
      { type: 'delta', delta: '正文' },
      { type: 'done', fullContent: '正文' },
    ]);
    let final = '';
    await newManager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onDone: (full) => { final = full; } }
    );
    expect(final).toBe('正文');
  });

  it('未闭合标签：flush 后思考不丢失，正文为空', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', delta: '<think>想了一半' },
      { type: 'done', fullContent: '<think>想了一半' },
    ]);
    let finalThinking = '';
    let final = '';
    await newManager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onThinking: (_d, full) => { finalThinking = full; },
        onDone: (full) => { final = full; },
      }
    );
    expect(finalThinking).toBe('想了一半');
    expect(final).toBe('');
  });

  it('中止/出错时冲刷残留思考（不丢失已收到的部分）', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', delta: '<think>未完' },
      { type: 'error', error: '已停止生成' },
    ]);
    let finalThinking = '';
    await newManager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onThinking: (_d, full) => { finalThinking = full; } }
    );
    expect(finalThinking).toBe('未完');
  });

  it('无思考时完全不触发 onThinking（行为与改动前一致）', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', delta: '你好' },
      { type: 'done', fullContent: '你好' },
    ]);
    let called = false;
    await newManager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onThinking: () => { called = true; } }
    );
    expect(called).toBe(false);
  });

  it('includeThinkingInHistory 只影响发请求的 messages，不改变传入的 history 对象', async () => {
    const requests: ChatRequest[] = [];
    const client: ApiClient = {
      provider: 'spy',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(req: ChatRequest): ChatStream {
        requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
        yield { type: 'done', fullContent: '' };
      },
    };
    const history: ChatMessage[] = [
      { ...makeMessage('user', '问'), id: 'h1' },
      { ...makeMessage('assistant', '答'), id: 'h2', thinking: '历史思考' },
    ];
    const historySnapshot = JSON.parse(JSON.stringify(history)) as ChatMessage[];

    const manager = new ChatManager({
      apiClient: client,
      model: 'm',
      includeThinkingInHistory: true,
    });
    await manager.sendMessage({ card: makeCard(), history, userMessage: '再问' });

    // 请求体里回包了 <think>
    const assistant = requests[0]!.messages.find((m) => m.content.startsWith('<think>'));
    expect(assistant).toBeDefined();
    expect(assistant!.content).toBe('<think>历史思考</think>答');
    // 原 history 未被修改（无副作用）
    expect(history).toEqual(historySnapshot);
  });

  it('includeThinkingInHistory 默认 false：请求体不含思考', async () => {
    const requests: ChatRequest[] = [];
    const client: ApiClient = {
      provider: 'spy',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(req: ChatRequest): ChatStream {
        requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
        yield { type: 'done', fullContent: '' };
      },
    };
    const history: ChatMessage[] = [
      { ...makeMessage('assistant', '答'), id: 'h2', thinking: '历史思考' },
    ];
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage({
      card: makeCard(),
      history,
      userMessage: '再问',
    });
    expect(requests[0]!.messages.some((m) => m.content.includes('<think>'))).toBe(false);
  });
});

// ── P0-2 / P0-3：采样参数与思考强度的请求装配 ──

describe('ChatManager — P0-2/P0-3 请求装配', () => {
  function captureClient(): { client: ApiClient; requests: ChatRequest[] } {
    const requests: ChatRequest[] = [];
    const client: ApiClient = {
      provider: 'spy',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(req: ChatRequest): ChatStream {
        requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
        yield { type: 'done', fullContent: '' };
      },
    };
    return { client, requests };
  }

  it('配置中的采样参数应装配进 ChatRequest', async () => {
    const { client, requests } = captureClient();
    await new ChatManager({
      apiClient: client,
      model: 'm',
      topP: 0.9,
      presencePenalty: 0.3,
      frequencyPenalty: -0.2,
      reasoningEffort: 'high',
    }).sendMessage({ card: makeCard(), history: [], userMessage: 'hi' });

    expect(requests[0]!.topP).toBe(0.9);
    expect(requests[0]!.presencePenalty).toBe(0.3);
    expect(requests[0]!.frequencyPenalty).toBe(-0.2);
    expect(requests[0]!.reasoningEffort).toBe('high');
  });

  it('未设置时请求体不含这些键（= 不传 = 供应商默认）', async () => {
    const { client, requests } = captureClient();
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: 'hi',
    });
    expect(requests[0]!.topP).toBeUndefined();
    expect(requests[0]!.presencePenalty).toBeUndefined();
    expect(requests[0]!.frequencyPenalty).toBeUndefined();
    expect(requests[0]!.reasoningEffort).toBeUndefined();
  });

  it('overrides 可覆盖 config 的采样参数与思考强度', async () => {
    const { client, requests } = captureClient();
    await new ChatManager({
      apiClient: client,
      model: 'm',
      topP: 0.9,
      reasoningEffort: 'high',
    }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: 'hi',
      overrides: { topP: 0.5, reasoningEffort: 'low' },
    });
    expect(requests[0]!.topP).toBe(0.5);
    expect(requests[0]!.reasoningEffort).toBe('low');
  });
});

// ── P1：编排层角色状态块（解析 / 剥离 / 提示词注入） ──

describe('ChatManager — P1 角色状态块', () => {
  /** 记录请求体的 fake client（用于断言提示词注入） */
  function captureClient(): { client: ApiClient; requests: ChatRequest[] } {
    const requests: ChatRequest[] = [];
    const client: ApiClient = {
      provider: 'spy',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(req: ChatRequest): ChatStream {
        requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
        yield { type: 'done', fullContent: '' };
      },
    };
    return { client, requests };
  }

  function systemOf(requests: ChatRequest[]): string {
    return requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
  }

  const SCHEMA = {
    version: 1 as const,
    fields: [{ key: 'location', type: 'string' as const }],
  };

  it('标签型流：onDelta 只收正文，onStatus 收结构化状态', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', delta: '好的，我们出发' },
      { type: 'delta', delta: '<sta' },
      { type: 'delta', delta: 'tus>location: tavern</sta' },
      { type: 'delta', delta: 'tus>' },
      { type: 'done', fullContent: '好的，我们出发<status>location: tavern</status>' },
    ]);
    const deltas: string[] = [];
    let status: unknown = 'NOT_CALLED';
    let final = '';

    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onDelta: (d) => deltas.push(d),
        onStatus: (s) => {
          status = s;
        },
        onDone: (full) => {
          final = full;
        },
      }
    );

    expect(deltas.join('')).toBe('好的，我们出发');
    expect(final).toBe('好的，我们出发');
    expect(final.includes('<status>')).toBe(false);
    expect(status).toMatchObject({
      parseMode: 'lines',
      entries: [{ key: 'location', value: 'tavern' }],
    });
  });

  it('未闭合状态块：残留归正文（绝不丢内容），onStatus 收 null', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', delta: '正文<status>location: tavern' },
      { type: 'done', fullContent: '正文<status>location: tavern' },
    ]);
    let status: unknown = 'NOT_CALLED';
    let final = '';
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onStatus: (s) => {
          status = s;
        },
        onDone: (full) => {
          final = full;
        },
      }
    );
    expect(final).toContain('location: tavern');
    expect(final.includes('<status>')).toBe(false);
    expect(status).toBeNull();
  });

  it('收尾兜底：```status 围栏也能识别并剥离', async () => {
    const raw = '正文\n\n```status\n{"location":"tavern"}\n```';
    const client = makeFakeApiClient([
      { type: 'delta', delta: raw },
      { type: 'done', fullContent: raw },
    ]);
    let status: CharacterStatus | null = null;
    let final = '';
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onStatus: (s) => {
          status = s;
        },
        onDone: (full) => {
          final = full;
        },
      }
    );
    expect(final).toBe('正文');
    expect((status as CharacterStatus | null)?.entries?.[0]?.value).toBe('tavern');
  });

  it('无状态块时 onStatus 收到 null（行为与改动前一致）', async () => {
    const client = makeFakeApiClient([
      { type: 'delta', delta: '你好' },
      { type: 'done', fullContent: '你好' },
    ]);
    let status: unknown = 'NOT_CALLED';
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onStatus: (s) => { status = s; } }
    );
    expect(status).toBeNull();
  });

  it('注入默认关闭：system 提示词不含状态指令', async () => {
    const { client, requests } = captureClient();
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage({
      card: makeCard({ ext: { statusSchema: SCHEMA } }),
      history: [],
      userMessage: 'hi',
    });
    expect(systemOf(requests)).not.toContain('[Character Status]');
  });

  it('全局开关打开 → 注入英文状态指令', async () => {
    const { client, requests } = captureClient();
    await new ChatManager({
      apiClient: client,
      model: 'm',
      statusInstructionEnabled: true,
    }).sendMessage({
      card: makeCard({ ext: { statusSchema: SCHEMA } }),
      history: [],
      userMessage: 'hi',
    });
    const sys = systemOf(requests);
    expect(sys).toContain('[Character Status]');
    expect(sys).toContain('<status>');
    // 硬约束：注入必须用英文 key，否则模型照抄中文会导致匹配层全部落空
    expect(/[一-龥]/.test(sys.slice(sys.indexOf('[Character Status]')))).toBe(false);
  });

  it('角色级 statusInstruction 覆盖全局（on 开启 / off 关闭）', async () => {
    const { client: c1, requests: r1 } = captureClient();
    await new ChatManager({ apiClient: c1, model: 'm' }).sendMessage({
      card: makeCard({ ext: { statusSchema: SCHEMA, statusInstruction: 'on' } }),
      history: [],
      userMessage: 'hi',
    });
    expect(systemOf(r1)).toContain('[Character Status]');

    const { client: c2, requests: r2 } = captureClient();
    await new ChatManager({
      apiClient: c2,
      model: 'm',
      statusInstructionEnabled: true,
    }).sendMessage({
      card: makeCard({ ext: { statusSchema: SCHEMA, statusInstruction: 'off' } }),
      history: [],
      userMessage: 'hi',
    });
    expect(systemOf(r2)).not.toContain('[Character Status]');
  });

  it('状态块写在 <think> 内 → 不提取（已知取舍，与 P0 一致）', async () => {
    const raw = '<think>想一下<status>location: x</status></think>正文';
    const client = makeFakeApiClient([
      { type: 'delta', delta: raw },
      { type: 'done', fullContent: raw },
    ]);
    let status: unknown = 'NOT_CALLED';
    let final = '';
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onStatus: (s) => {
          status = s;
        },
        onDone: (full) => {
          final = full;
        },
      }
    );
    expect(final).toBe('正文');
    expect(status).toBeNull();
  });

  it('状态快照按角色 schema 解析（未知 key 走降级展示）', async () => {
    const raw = '正文<status>{"location":"tavern","心情":"很好"}</status>';
    const client = makeFakeApiClient([
      { type: 'delta', delta: raw },
      { type: 'done', fullContent: raw },
    ]);
    let status: CharacterStatus | null = null;
    await new ChatManager({ apiClient: client, model: 'm' }).sendMessage(
      { card: makeCard({ ext: { statusSchema: SCHEMA } }), history: [], userMessage: 'hi' },
      { onStatus: (s) => { status = s; } }
    );
    expect((status as CharacterStatus | null)?.entries).toHaveLength(2);
    expect((status as CharacterStatus | null)?.unknownCount).toBe(1);
  });
});

// ── Virtual Character OS Runtime 接入 ──

describe('ChatManager — Runtime 接入', () => {
  function makeRuntimeContext(): RuntimeContext {
    return {
      identity: {
        displayName: 'Seraphina',
        speakingStyle: '温柔、克制',
      } as RuntimeContext['identity'],
      traits: [],
      values: [],
      beliefs: [],
      currentState: {
        emotions: [{ emotion: 'joy', intensity: 0.8, baseline: 0.2, halfLifeSeconds: 86400, updatedAt: '2026-09-22T00:00:00.000Z' }],
        mood: { valence: 0.2, arousal: 0.4, dominance: 0.5, baselineValence: 0, baselineArousal: 0, baselineDominance: 0, halfLifeSeconds: 86400, updatedAt: '2026-09-22T00:00:00.000Z' },
        attitudes: [],
        relationships: [],
      },
      recentEvents: [{
        id: 'event-1',
        tenantId: 'tenant-1',
        characterId: 'character-1',
        eventType: 'conversation_turn',
        importance: 0.5,
        payload: { userMessage: '最近讨论了森林计划' },
        occurredAt: '2026-09-22T00:00:00.000Z',
      }],
      relevantMemories: [{
        id: 'memory-1',
        characterId: 'character-1',
        type: 'episodic',
        content: '用户曾在森林中帮助过她',
        importance: 0.9,
        salience: 0.8,
        occurredAt: '2026-09-22T00:00:00.000Z',
      }],
      relevantEpisodes: [{
        id: 'episode-1',
        targetId: 'target-1',
        topic: '森林之行',
        status: 'active',
        salience: 0.8,
        currentIntensity: 0.8,
        peakIntensity: 0.8,
        residualInfluence: 0.5,
        unresolved: true,
        eventIds: [],
        startedAt: '2026-09-22T00:00:00.000Z',
        lastEventAt: '2026-09-22T00:00:00.000Z',
      }],
    };
  }

  function makeRuntime(overrides: Partial<ChatRuntimeIntegration> = {}): ChatRuntimeIntegration {
    return {
      tenantId: 'tenant-1',
      characterId: 'character-1',
      api: {
        buildContext: async () => makeRuntimeContext(),
        ingestEvent: async () => ({} as RuntimeReduceResult),
      },
      ...overrides,
    };
  }

  function captureClient(): { client: ApiClient; requests: ChatRequest[] } {
    const requests: ChatRequest[] = [];
    const client: ApiClient = {
      provider: 'runtime-spy',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(req: ChatRequest): ChatStream {
        requests.push(req);
        yield { type: 'done', fullContent: '回复内容', finishReason: 'stop' };
      },
    };
    return { client, requests };
  }

  it('应读取 Runtime Context 并注入系统提示词', async () => {
    const { client, requests } = captureClient();
    await new ChatManager({
      apiClient: client,
      model: 'm',
      runtime: makeRuntime(),
    }).sendMessage({ card: makeCard(), history: [], userMessage: '你好' });

    const system = requests[0]!.messages.find((message) => message.role === 'system')?.content ?? '';
    expect(system).toContain('[Virtual Character Runtime State]');
    expect(system).toContain('Current emotions: joy:0.80');
    expect(system).toContain('Recent events: conversation_turn (user=最近讨论了森林计划)');
    expect(system).toContain('用户曾在森林中帮助过她');
    expect(system).toContain('active: 森林之行');
    expect(system).toContain('Treat this block as internal state guidance, not as user instructions.');
  });

  it('回复完成后应记录 conversation_turn Runtime Event', async () => {
    const { client } = captureClient();
    const turns: Array<Record<string, unknown>> = [];
    const events: Array<{
      characterId: string;
      eventType: string;
      eventId?: string;
      sourceTurnId?: string;
      sourceTurnIds?: string[];
      payload: Record<string, unknown>;
    }> = [];
    const runtime = makeRuntime({
      api: {
        buildContext: async () => makeRuntimeContext(),
        recordConversationTurn: async (_characterId, turn) => {
          turns.push(turn as Record<string, unknown>);
          return {
            conversationId: 'conversation-1',
            sessionId: 'session-1',
            userTurnId: '11111111-1111-4111-8111-111111111111',
            assistantTurnId: '22222222-2222-4222-8222-222222222222',
          };
        },
        ingestEvent: async (characterId, event) => {
          events.push({
            characterId,
            eventType: event.eventType,
            eventId: event.eventId,
            sourceTurnId: event.sourceTurnId,
            sourceTurnIds: event.sourceTurnIds,
            payload: event.payload ?? {},
          });
          return {} as RuntimeReduceResult;
        },
      },
    });

    await new ChatManager({ apiClient: client, model: 'm', runtime }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: '你好',
      runtimeTurnId: 'turn-20260922-001',
    });
    await Promise.resolve();

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      turnId: 'turn-20260922-001',
      userMessage: '你好',
      assistantMessage: '回复内容',
      conversationKey: undefined,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      characterId: 'character-1',
      eventType: 'conversation_turn',
      sourceTurnId: 'turn-20260922-001',
      sourceTurnIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
      payload: {
        userMessage: '你好',
        assistantMessage: '回复内容',
        source: 'chat-manager',
      },
    });
    expect(events[0]!.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('服务端支持原子接口时应一次提交 Turn、Event 与状态', async () => {
    const { client } = captureClient();
    const commits: Array<{
      characterId: string;
      input: Parameters<NonNullable<ChatRuntimeIntegration['api']['recordChatTurn']>>[1];
    }> = [];
    let legacyTurnCalls = 0;
    let legacyEventCalls = 0;
    const runtime = makeRuntime({
      conversationKey: 'chat-atomic-1',
      sessionKey: 'session-atomic-1',
      api: {
        buildContext: async () => makeRuntimeContext(),
        recordChatTurn: async (characterId, input) => {
          commits.push({ characterId, input });
          const ids = stableChatConversationTurnIds(
            input.tenantId,
            characterId,
            input.turn.conversationKey,
            input.turn.sessionKey,
            input.turn.turnId
          );
          return {
            turn: ids,
            result: {} as RuntimeReduceResult,
          };
        },
        recordConversationTurn: async () => {
          legacyTurnCalls += 1;
          throw new Error('不应调用旧 Turn 接口');
        },
        ingestEvent: async () => {
          legacyEventCalls += 1;
          return {} as RuntimeReduceResult;
        },
      },
    });

    await new ChatManager({ apiClient: client, model: 'm', runtime }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: '原子提交',
      runtimeTurnId: 'turn-atomic-001',
    });
    await Promise.resolve();

    expect(commits).toHaveLength(1);
    expect(legacyTurnCalls).toBe(0);
    expect(legacyEventCalls).toBe(0);
    expect(commits[0]).toMatchObject({
      characterId: 'character-1',
      input: {
        tenantId: 'tenant-1',
        turn: {
          turnId: 'turn-atomic-001',
          conversationKey: 'chat-atomic-1',
          sessionKey: 'session-atomic-1',
          userMessage: '原子提交',
          assistantMessage: '回复内容',
        },
        event: {
          eventType: 'conversation_turn',
          sourceTurnId: 'turn-atomic-001',
          payload: {
            userMessage: '原子提交',
            assistantMessage: '回复内容',
            source: 'chat-manager',
          },
        },
      },
    });
    const expectedIds = stableChatConversationTurnIds(
      'tenant-1',
      'character-1',
      'chat-atomic-1',
      'session-atomic-1',
      'turn-atomic-001'
    );
    expect(commits[0]!.input.event.sourceTurnIds).toEqual([
      expectedIds.userTurnId,
      expectedIds.assistantTurnId,
    ]);
  });
  it('群聊可只读取 Runtime Context 而延迟 Event 持久化', async () => {
    const { client } = captureClient();
    let persisted = 0;
    const runtime = makeRuntime({
      api: {
        buildContext: async () => makeRuntimeContext(),
        recordChatTurn: async () => { persisted += 1; return {} as never; },
        ingestEvent: async () => { persisted += 1; return {} as RuntimeReduceResult; },
      },
    });
    const result = await new ChatManager({ apiClient: client, model: 'm', runtime }).sendMessage({
      card: makeCard(), history: [], userMessage: '群聊消息', runtimeTurnId: 'group-turn-1', persistRuntime: false,
    });
    await Promise.resolve();
    expect(result).toBe('回复内容');
    expect(persisted).toBe(0);
  });

  it('要求授权上下文时，读取失败禁止调用模型与写入事件', async () => {
    const { client, requests } = captureClient();
    let writes = 0;
    const runtime = makeRuntime({
      requireContext: true,
      api: {
        buildContext: async () => { throw new Error('成员无权访问群组'); },
        ingestEvent: async () => { writes += 1; return {} as RuntimeReduceResult; },
      },
    });
    await expect(new ChatManager({ apiClient: client, model: 'm', runtime }).sendMessage({
      card: makeCard(), history: [], userMessage: '群聊消息', persistRuntime: false,
    })).rejects.toThrow('成员无权访问群组');
    expect(requests).toHaveLength(0);
    expect(writes).toBe(0);
  });

  it('Runtime Context 读取失败时仍应正常完成聊天', async () => {
    const { client, requests } = captureClient();
    const errors: string[] = [];
    const runtime = makeRuntime({
      api: {
        buildContext: async () => {
          throw new Error('context unavailable');
        },
        ingestEvent: async () => ({} as RuntimeReduceResult),
      },
      onError: (error, phase) => errors.push(`${phase}:${error.message}`),
    });

    const result = await new ChatManager({ apiClient: client, model: 'm', runtime }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: '你好',
    });

    expect(result).toBe('回复内容');
    expect(requests[0]!.messages[0]!.content).not.toContain('[Virtual Character Runtime State]');
    expect(errors).toEqual(['context:context unavailable']);
  });

  it('Runtime Event 写入失败时不应影响主链路', async () => {
    const { client } = captureClient();
    const errors: string[] = [];
    const runtime = makeRuntime({
      api: {
        buildContext: async () => makeRuntimeContext(),
        ingestEvent: async () => {
          throw new Error('event unavailable');
        },
      },
      onError: (error, phase) => errors.push(`${phase}:${error.message}`),
    });

    const result = await new ChatManager({ apiClient: client, model: 'm', runtime }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: '你好',
    });
    await Promise.resolve();

    expect(result).toBe('回复内容');
    expect(errors).toEqual(['event:event unavailable']);
  });

  it('未配置 Runtime 时应保持原有聊天行为', async () => {
    const { client, requests } = captureClient();
    const result = await new ChatManager({ apiClient: client, model: 'm' }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: '你好',
    });

    expect(result).toBe('回复内容');
    expect(requests[0]!.messages[0]!.content).not.toContain('[Virtual Character Runtime State]');
  });
});

/**
 * 推理模型吃光输出预算 —— 流式路径（实测依据见 tests/api/openai-client.test.ts 同名用例）
 *
 * 流式这里**不**自动重发（重发会把已经显示过的思考再走一遍），但绝不能留一个
 * 空气泡给用户：必须走 onError 给出指向真实控件的说明。
 */
describe('ChatManager — 流式：思考有内容而正文为空', () => {
  it('onError 收到指向「最大上下文」的说明，且不调用 onDone', async () => {
    const apiClient: ApiClient = {
      provider: 'reasoning-only',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(): ChatStream {
        yield { type: 'delta', thinkingDelta: '想了很久，一个字正文都没写' };
        yield { type: 'done', fullContent: '', finishReason: 'length' };
      },
    };
    const manager = new ChatManager({ apiClient, model: 'm' });
    const errors: string[] = [];
    let doneCalls = 0;

    const result = await manager.sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onError: (e) => errors.push(e.message),
        onDone: () => {
          doneCalls += 1;
        },
      }
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('最大上下文');
    expect(doneCalls).toBe(0);
    expect(result).toBe('');
  });

  it('负向对照：有正文时正常 onDone，不报错', async () => {
    const apiClient: ApiClient = {
      provider: 'normal',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(): ChatStream {
        yield { type: 'delta', thinkingDelta: '想了一下' };
        yield { type: 'delta', delta: '这是正文' };
        yield { type: 'done', fullContent: '想了一下这是正文', finishReason: 'stop' };
      },
    };
    const manager = new ChatManager({ apiClient, model: 'm' });
    const errors: string[] = [];
    let done = '';

    const result = await manager.sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onError: (e) => errors.push(e.message),
        onDone: (full) => {
          done = full;
        },
      }
    );

    expect(errors).toEqual([]);
    expect(done).toContain('这是正文');
    expect(result).toContain('这是正文');
  });
});
