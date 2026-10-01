import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatStore } from '../../src/stores/chat';
import { useSettingsStore } from '../../src/stores/settings';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { UICharacter, ApiProfile, UIMessage } from '@/types';

/**
 * chat store — P0-1 思维链 / P0-2 思考强度 / P0-3 采样参数
 *
 * 聚焦 store 层的行为契约：
 * - 流式思考（字段型 / 标签型）写入 liveMsg.thinking
 * - 持久化后 thinking 可回读
 * - 重新生成 / 编辑消息清空 thinking（避免"旧思考 + 新正文"错配）
 * - capability=none 时角色级思考强度静默丢弃
 * - 新采样参数走「角色级 → Profile 级」回落（不再重蹈 profile.maxTokens 死代码）
 */

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

function makeMessage(overrides: Partial<UIMessage> & { id: string }): UIMessage {
  return {
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...overrides,
  };
}

/** 构造 OpenAI 兼容 SSE 流（可带 reasoning_content） */
function makeSSEResponse(
  parts: Array<{ content?: string; reasoning?: string; finishReason?: string | null }>
): Response {
  const encoder = new TextEncoder();
  const chunks = parts.map(({ content, reasoning, finishReason }) => {
    const delta: Record<string, unknown> = {};
    if (content !== undefined) delta.content = content;
    if (reasoning !== undefined) delta.reasoning_content = reasoning;
    const payload = {
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta, finish_reason: finishReason ?? null }],
    };
    return encoder.encode('data: ' + JSON.stringify(payload) + '\n\n');
  });
  chunks.push(encoder.encode('data: [DONE]\n\n'));
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as Response;
}

async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// ── 测试用例 ──

describe('chat store — P0-1 思维链', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('字段型思考：liveMsg.thinking 被写入，content 不含思考', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile({ model: 'deepseek-r1' }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([{ reasoning: '让我想想' }, { content: '答案是 42' }])
    );

    const char = makeCharacter({ id: 'cot-char' });
    await chatStore.sendMessage(char, '1+1=?');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.thinking).toBe('让我想想');
    expect(ai.content).toBe('答案是 42');
  });

  it('标签型思考：由编排层统一剥离，thinking 与 content 分字段存', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      // 开标签与闭标签均被 chunk 撕裂（'<thi'+'nk>' 与 '</thi'+'nk>'）
      makeSSEResponse([
        { content: '<thi' },
        { content: 'nk>先分析再回答</thi' },
        { content: 'nk>最终答案' },
      ])
    );

    const char = makeCharacter({ id: 'cot-tag-char' });
    await chatStore.sendMessage(char, '问题');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.thinking).toBe('先分析再回答');
    expect(ai.content).toBe('最终答案');
  });

  it('无思考时不写入 thinking 字段', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse([{ content: '纯正文' }]));

    const char = makeCharacter({ id: 'no-cot-char' });
    await chatStore.sendMessage(char, 'hi');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.thinking).toBeUndefined();
    expect(ai.content).toBe('纯正文');
  });

  it('persistChat 后 thinking 落盘可回读', async () => {
    await resetDatabase('test-chat-thinking-persist');
    const adapter = new IndexedDBAdapter('test-chat-thinking-persist');
    await adapter.init();

    const chatStore = useChatStore();
    chatStore.setStorageAdapter(adapter);
    chatStore.setApiProfile(makeApiProfile({ model: 'deepseek-r1' }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([{ reasoning: '思考落盘' }, { content: '正文落盘' }])
    );

    const char = makeCharacter({ id: 'persist-thinking-char' });
    await chatStore.sendMessage(char, 'hi');

    const loaded = await adapter.loadChat('chat-persist-thinking-char');
    expect(loaded).not.toBeNull();
    const ai = loaded!.messages.find((m) => m.role === 'assistant');
    expect(ai?.thinking).toBe('思考落盘');
    expect(ai?.content).toBe('正文落盘');

    await adapter.close();
  });

  it('重新生成时 thinking 被清空（避免旧思考 + 新正文错配）', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse([{ content: '新回复' }]));

    const char = makeCharacter({
      id: 'regen-char',
      messages: [
        makeMessage({ id: 'u1', role: 'user', content: '问', timestamp: 1 }),
        makeMessage({ id: 'a1', content: '旧回复', thinking: '旧思考', timestamp: 2 }),
      ],
    });

    await chatStore.regenerateMessage(char, 'a1');

    const target = char.messages.find((m) => m.id === 'a1')!;
    expect(target.thinking).toBe('');
    expect(target.content).toBe('新回复');
  });

  it('editMessage 应清空 thinking（正文改写后旧思考失效）', () => {
    const chatStore = useChatStore();
    const msg = makeMessage({ id: 'm1', content: 'a', thinking: '旧思考' });

    chatStore.editMessage(msg, 'new content');

    expect(msg.content).toBe('new content');
    expect(msg.thinking).toBe('');
  });
});

describe('chat store — P0-2 思考强度 / P0-3 采样参数下发', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /** 发一条消息并抓取请求体 */
  async function captureBody(
    profile: Partial<ApiProfile>,
    character: Partial<UICharacter>
  ): Promise<Record<string, unknown>> {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile(profile));
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([{ content: 'ok' }])
    );
    await chatStore.sendMessage(makeCharacter(character), 'hi');
    const body = (spy.mock.calls[0]![1] as RequestInit).body as string;
    return JSON.parse(body) as Record<string, unknown>;
  }

  it('Profile 级 reasoningEffort 生效时下发 reasoning_effort', async () => {
    const body = await captureBody({ model: 'o3', reasoningEffort: 'high' }, { reasoningEffort: null });
    expect(body.reasoning_effort).toBe('high');
  });

  it('角色级 reasoningEffort 覆盖 Profile 级', async () => {
    const body = await captureBody({ model: 'o3', reasoningEffort: 'high' }, { reasoningEffort: 'low' });
    expect(body.reasoning_effort).toBe('low');
  });

  it('reasoningSupport=off（capability=none）时静默丢弃，不报错', async () => {
    const body = await captureBody(
      { model: 'o3', reasoningSupport: 'off', reasoningEffort: 'high' },
      { reasoningEffort: 'high' }
    );
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('未配置思考强度时不下发 reasoning_effort', async () => {
    const body = await captureBody({ model: 'gpt-4o' }, {});
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('P0-3：角色级采样参数覆盖生效，未设置字段回落到 Profile 级', async () => {
    const body = await captureBody(
      { model: 'gpt-4o', sampling: { topP: 0.9, frequencyPenalty: 0.1 } },
      { sampling: { topP: 0.5 } }
    );
    expect(body.top_p).toBe(0.5); // 角色级优先
    expect(body.frequency_penalty).toBe(0.1); // 角色级未设置 → Profile 级
  });

  it('P0-3：角色级未设置时回落到 Profile 级（新参数不走 maxTokens 死代码老路）', async () => {
    const body = await captureBody({ model: 'gpt-4o', sampling: { topP: 0.42 } }, { sampling: null });
    expect(body.top_p).toBe(0.42);
  });

  it('P0-3：三档都未设置时不传该参数（= 供应商默认）', async () => {
    // MODEL-03 之后全局默认 preset=balanced 会以最低优先级兜底 topP，
    // 本用例只验证「角色级 → Profile 级 → 供应商默认」三级回落，故切到 custom（不干预）隔离 Preset。
    useSettingsStore().setCreationPreset('custom');
    const body = await captureBody({ model: 'gpt-4o' }, { sampling: { topP: null } });
    expect(body.top_p).toBeUndefined();
    expect(body.presence_penalty).toBeUndefined();
    expect(body.frequency_penalty).toBeUndefined();
  });

  it('MODEL-03/EXP-01：三级未设置时全局默认 balanced 兜底 topP 0.9', async () => {
    const body = await captureBody({ model: 'gpt-4o' }, { sampling: { topP: null } });
    expect(body.top_p).toBe(0.9);
  });

  it('EXP-01：角色级创作模式绑定优先于全局（strict 建议 topP 0.8 + 双 penalty 0.3）', async () => {
    useSettingsStore().setCreationPreset('balanced'); // 全局 balanced，角色绑定 strict 应覆盖
    const body = await captureBody(
      { model: 'gpt-4o' },
      { sampling: { topP: null }, boundPresetId: 'strict' }
    );
    expect(body.top_p).toBe(0.8);
    expect(body.presence_penalty).toBe(0.3);
    expect(body.frequency_penalty).toBe(0.3);
  });
});

// ── P1：思考 token（ChatUsage.reasoningTokens → 消息） ──

/** 构造带独立 usage chunk 的 OpenAI 兼容 SSE 流 */
function makeSSEResponseWithUsage(usage: Record<string, unknown>): Response {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode(
      'data: ' +
        JSON.stringify({
          choices: [{ index: 0, delta: { content: '正文' }, finish_reason: null }],
        }) +
        '\n\n'
    ),
    encoder.encode('data: ' + JSON.stringify({ choices: [], usage }) + '\n\n'),
    encoder.encode('data: [DONE]\n\n'),
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as Response;
}

describe('chat store — P1 思考 token 落地', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('usage.completion_tokens_details.reasoning_tokens 写入本条消息', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile({ model: 'deepseek-r1' }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponseWithUsage({ completion_tokens_details: { reasoning_tokens: 33 } })
    );

    const char = makeCharacter({ id: 'tok-char' });
    await chatStore.sendMessage(char, 'hi');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.reasoningTokens).toBe(33);
  });

  it('usage 未上报推理 token 时消息上不产生该字段（不显示 0）', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponseWithUsage({ prompt_tokens: 1, completion_tokens: 2 })
    );

    const char = makeCharacter({ id: 'tok-char-none' });
    await chatStore.sendMessage(char, 'hi');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.reasoningTokens).toBeUndefined();
  });

  it('editMessage 清空思考 token（正文改写后旧开销失效）', () => {
    const chatStore = useChatStore();
    const msg = makeMessage({ id: 'm1', content: 'a', reasoningTokens: 99 });

    chatStore.editMessage(msg, 'new content');

    expect(msg.reasoningTokens).toBeUndefined();
  });
});

// ── T-16：修掉 profile.maxTokens 死代码（角色级 maxTokens 改为可选） ──

describe('chat store — T-16 maxTokens 逐档回落', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /** 发一条消息并抓取请求体 */
  async function captureBody(
    profile: Partial<ApiProfile>,
    character: Partial<UICharacter>
  ): Promise<Record<string, unknown>> {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile(profile));
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([{ content: 'ok' }])
    );
    await chatStore.sendMessage(makeCharacter(character), 'hi');
    const body = (spy.mock.calls[0]![1] as RequestInit).body as string;
    return JSON.parse(body) as Record<string, unknown>;
  }

  it('角色级未设置时，Profile 级 maxTokens 生效（死代码已修）', async () => {
    const body = await captureBody({ maxTokens: 1024 }, { maxTokens: undefined });
    expect(body.max_tokens).toBe(1024);
  });

  it('角色级已设置时优先于 Profile 级', async () => {
    const body = await captureBody({ maxTokens: 1024 }, { maxTokens: 2048 });
    expect(body.max_tokens).toBe(2048);
  });

  it('两档都未设置时不传 max_tokens（= 供应商默认）', async () => {
    const body = await captureBody({}, { maxTokens: undefined });
    expect(body.max_tokens).toBeUndefined();
  });

  it('角色级 0 / NaN / 负数均按未设置处理（不用魔法数字表示未设置）', async () => {
    // 合法区间是 1~32768，0 与负数不是合法值 → 回落 Profile 级
    expect((await captureBody({ maxTokens: 1024 }, { maxTokens: 0 })).max_tokens).toBe(1024);
    expect((await captureBody({ maxTokens: 1024 }, { maxTokens: -1 })).max_tokens).toBe(1024);
    expect((await captureBody({ maxTokens: 1024 }, { maxTokens: Number.NaN })).max_tokens).toBe(1024);
  });
});
