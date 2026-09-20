/**
 * P0-2 / P0-3 —— 四个 client 的**实际下发 body** QA 独立验证
 *
 * 与工程师用例的差异：本文件不复用其断言，改为从「协议契约」出发重新设计：
 * - OpenAI：chat() 与 chatStream() **两条路径**都要带对参数；三档 effort 全测
 * - Anthropic：adaptive/extended/不可解析三分支 × 采样参数回归（85e1d76 修正点）
 * - Tauri：非流式 chat() 路径（工程师只测了 chatStream）
 * - Local：chatStream 路径的 topP 优先级（工程师只测了 chat）+ 不支持项静默丢弃
 *
 * 核心红线：`undefined` / `null` = 不传 = 供应商默认，**绝不能用 0 表示未设置**。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { ChatRequest } from '@api/types';
import { OpenAIClient } from '@api/openai-client';
import { AnthropicClient } from '@api/anthropic-client';

// vi.mock 会被提升到文件顶部，工厂内不能引用普通顶层变量 → 必须用 vi.hoisted
const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));

// Tauri 客户端在模块内动态 import @tauri-apps/*，需先注册 mock 再取模块
const { TauriOpenAIClient } = await import('@api/tauri-openai-client');

// ── OpenAI / Anthropic 公用的 fetch mock ──

function jsonResponse(payload: unknown, status = 200): Response {
  const text = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

/** fetch spy 的类型（避免 ReturnType<typeof vi.spyOn> 丢掉重载签名） */
type FetchSpy = MockInstance<typeof globalThis.fetch>;

function captureBodyFrom(spy: FetchSpy): Record<string, unknown> {
  const init = spy.mock.calls[0]![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('OpenAIClient — QA 独立验证（chat + chatStream 双路径）', () => {
  let spy: FetchSpy;

  beforeEach(() => {
    spy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function client() {
    return new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-qa' });
  }

  it('未设置时三个采样参数 + effort 一律不出现在 body（不得用 0 兜底）', async () => {
    spy.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await client().chat({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' });
    const body = captureBodyFrom(spy);
    expect('top_p' in body).toBe(false);
    expect('presence_penalty' in body).toBe(false);
    expect('frequency_penalty' in body).toBe(false);
    expect('reasoning_effort' in body).toBe(false);
  });

  it('null 与 undefined 等价：都不写键', async () => {
    spy.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await client().chat({
      messages: [],
      model: 'gpt-4o',
      topP: null,
      presencePenalty: undefined,
      frequencyPenalty: null,
    } as unknown as ChatRequest);
    const body = captureBodyFrom(spy);
    expect('top_p' in body).toBe(false);
    expect('presence_penalty' in body).toBe(false);
    expect('frequency_penalty' in body).toBe(false);
  });

  it('0 是合法值：必须原样下发（top_p=0 语义是"只取概率最高 token"）', async () => {
    spy.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await client().chat({
      messages: [],
      model: 'gpt-4o',
      topP: 0,
      presencePenalty: 0,
      frequencyPenalty: 0,
    });
    const body = captureBodyFrom(spy);
    expect(body.top_p).toBe(0);
    expect(body.presence_penalty).toBe(0);
    expect(body.frequency_penalty).toBe(0);
  });

  it('负值 / 大于 1 的值原样透传（不做 clamp，交给服务端判定）', async () => {
    spy.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await client().chat({
      messages: [],
      model: 'gpt-4o',
      topP: 1.5,
      frequencyPenalty: -2,
      presencePenalty: 2,
    });
    const body = captureBodyFrom(spy);
    expect(body.top_p).toBe(1.5);
    expect(body.frequency_penalty).toBe(-2);
    expect(body.presence_penalty).toBe(2);
  });

  it('三档 reasoning_effort 各自下发字面值', async () => {
    for (const effort of ['low', 'medium', 'high'] as const) {
      vi.restoreAllMocks();
      spy = vi.spyOn(globalThis, 'fetch');
      spy.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
      await client().chat({ messages: [], model: 'o3', reasoningEffort: effort });
      expect(captureBodyFrom(spy).reasoning_effort).toBe(effort);
    }
  });

  it('chatStream 路径同样下发采样参数（工程师只验证了 chat）', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n')
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    spy.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response);

    const events = [];
    for await (const ev of client().chatStream({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4o',
      topP: 0.42,
      presencePenalty: 0.11,
      frequencyPenalty: 0.22,
      reasoningEffort: 'medium',
    })) {
      events.push(ev);
    }
    const body = captureBodyFrom(spy);
    expect(body.stream).toBe(true);
    expect(body.top_p).toBe(0.42);
    expect(body.presence_penalty).toBe(0.11);
    expect(body.frequency_penalty).toBe(0.22);
    expect(body.reasoning_effort).toBe('medium');
  });

  it('P0-1：reasoning_content 与 reasoning 两个字段都能读出 thinkingDelta', async () => {
    const encoder = new TextEncoder();
    const mk = (payload: unknown) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

    for (const key of ['reasoning_content', 'reasoning'] as const) {
      vi.restoreAllMocks();
      spy = vi.spyOn(globalThis, 'fetch');
      spy.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: mk({ choices: [{ index: 0, delta: { [key]: '思考片段' } }] }),
        json: async () => ({}),
        text: async () => '',
      } as unknown as Response);

      const out = [];
      for await (const ev of client().chatStream({ messages: [], model: 'deepseek-r1' })) {
        out.push(ev);
      }
      expect(out.some((e) => e.type === 'delta' && e.thinkingDelta === '思考片段')).toBe(true);
    }
  });
});

describe('AnthropicClient — QA 独立验证（adaptive / extended 分流）', () => {
  let spy: FetchSpy;

  beforeEach(() => {
    spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function client() {
    return new AnthropicClient({ baseUrl: 'https://api.anthropic.com', apiKey: 'qa-key' });
  }

  async function bodyOf(req: Partial<ChatRequest>): Promise<Record<string, unknown>> {
    await client().chat({ messages: [], ...req } as ChatRequest);
    return captureBodyFrom(spy);
  }

  // ── adaptive 分支（4.6+ / 5+）──

  it('adaptive：claude-sonnet-4-6 → thinking.type=adaptive + output_config.effort，无 budget', async () => {
    const body = await bodyOf({ model: 'claude-sonnet-4-6', maxTokens: 8192, reasoningEffort: 'high' });
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'high' });
    expect(body.budget_tokens).toBeUndefined();
  });

  it('adaptive：主版本 ≥5（claude-opus-5.2）同样走 adaptive', async () => {
    const body = await bodyOf({ model: 'claude-opus-5.2', maxTokens: 8192, reasoningEffort: 'low' });
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'low' });
  });

  it('adaptive 不做 maxTokens clamp：maxTokens=128 时仍下发 adaptive（无 budget 概念）', async () => {
    const body = await bodyOf({ model: 'claude-sonnet-4-6', maxTokens: 128, reasoningEffort: 'high' });
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'high' });
  });

  it('【85e1d76 重点回归】adaptive 分支下 temperature / top_p **照常下发**（不得抑制）', async () => {
    const body = await bodyOf({
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      temperature: 0.15,
      topP: 0.75,
      reasoningEffort: 'medium',
    });
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'medium' });
    expect(body.temperature).toBe(0.15);
    expect(body.top_p).toBe(0.75);
  });

  it('temperature=0 也必须下发（0 是合法值，不是"未设置"）', async () => {
    const body = await bodyOf({ model: 'claude-sonnet-4-6', temperature: 0, topP: 0 });
    expect(body.temperature).toBe(0);
    expect(body.top_p).toBe(0);
  });

  // ── extended 分支（4.5 及更早 / 无法解析）──

  it('extended：4.5 → thinking.type=enabled + budget_tokens，无 output_config', async () => {
    const body = await bodyOf({ model: 'claude-opus-4.5', maxTokens: 8192, reasoningEffort: 'medium' });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
    expect(body.output_config).toBeUndefined();
  });

  it('extended：无法解析版本号（claude-alias）默认 extended（保守，避免 400）', async () => {
    const body = await bodyOf({ model: 'claude-alias', maxTokens: 8192, reasoningEffort: 'medium' });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
  });

  it('extended：日期戳次版本（claude-sonnet-4-20250514）不当作 20250514 次版本', async () => {
    const body = await bodyOf({
      model: 'claude-sonnet-4-20250514',
      maxTokens: 32768, // 放宽上限以隔离"版本分流"判定，避免与 budget clamp 混淆
      reasoningEffort: 'high',
    });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 16384 });
    expect(body.output_config).toBeUndefined();
  });

  it('extended：budget 必须 >= 1024 且 < max_tokens（high + maxTokens=2048 → 2047）', async () => {
    const body = await bodyOf({ model: 'claude-3-7-sonnet', maxTokens: 2048, reasoningEffort: 'high' });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 2047 });
  });

  it('extended：clamp 后 < 1024 → 放弃启用 thinking（不写 thinking 键）', async () => {
    const body = await bodyOf({ model: 'claude-3-7-sonnet', maxTokens: 512, reasoningEffort: 'high' });
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
  });

  it('【85e1d76 重点回归】extended 分支下 temperature / top_p 同样照常下发', async () => {
    const body = await bodyOf({
      model: 'claude-3-7-sonnet',
      maxTokens: 8192,
      temperature: 1.4,
      topP: 0.33,
      reasoningEffort: 'low',
    });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
    expect(body.temperature).toBe(1.4);
    expect(body.top_p).toBe(0.33);
  });

  // ── 不支持的字段 ──

  it('presence / frequency penalty 静默丢弃（Anthropic 协议无此字段）', async () => {
    const body = await bodyOf({
      model: 'claude-3-7-sonnet',
      maxTokens: 8192,
      presencePenalty: 0.7,
      frequencyPenalty: -0.7,
    });
    expect('presence_penalty' in body).toBe(false);
    expect('frequency_penalty' in body).toBe(false);
  });

  it('未设置 reasoningEffort → 既无 thinking 也无 output_config', async () => {
    const body = await bodyOf({ model: 'claude-sonnet-4-6', maxTokens: 8192 });
    expect('thinking' in body).toBe(false);
    expect('output_config' in body).toBe(false);
  });

  it('max_tokens 未指定时按 4096 兜底（协议必填）', async () => {
    const body = await bodyOf({ model: 'm' });
    expect(body.max_tokens).toBe(4096);
  });
});

describe('TauriOpenAIClient — QA 独立验证（含非流式 chat 路径）', () => {
  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };
    invokeMock.mockReset();
    listenMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  /** listen 返回的 channel：可手动 emit */
  function channel() {
    const listeners: Array<(e: { payload: unknown }) => void> = [];
    listenMock.mockImplementation(
      async (_c: string, cb: (e: { payload: unknown }) => void) => {
        listeners.push(cb);
        return async () => {};
      }
    );
    return {
      emit: (p: unknown) => listeners.forEach((l) => l({ payload: p })),
    };
  }

  it('非流式 chat() 同样按 camelCase 下发采样参数（工程师只测了 chatStream）', async () => {
    const ch = channel();
    let captured: Record<string, unknown> | null = null;
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'chat_stream') {
        captured = args?.request as Record<string, unknown>;
        // 非流式 chat() 是「await invoke → 读 fullContent」，必须**同步** emit，
        // 否则 setTimeout 会在 invoke 已 resolve 之后才送达
        ch.emit({ type: 'done', full_content: 'ok', finish_reason: 'stop' });
      }
      return null;
    });

    const text = await new TauriOpenAIClient({
      baseUrl: 'https://api.openai.com',
      apiKey: 'k',
    }).chat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4o',
      topP: 0.9,
      presencePenalty: 0.3,
      frequencyPenalty: -0.4,
      reasoningEffort: 'high',
    } as ChatRequest);

    expect(text).toBe('ok');
    expect(captured!.topP).toBe(0.9);
    expect(captured!.presencePenalty).toBe(0.3);
    expect(captured!.frequencyPenalty).toBe(-0.4);
    expect(captured!.reasoningEffort).toBe('high');
    expect(captured!.max_tokens).toBeUndefined(); // 未设置 → 不写键
  });

  it('非流式 chat() 未设置参数时键完全缺失（不得用 0 兜底）', async () => {
    const ch = channel();
    let captured: Record<string, unknown> | null = null;
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'chat_stream') {
        captured = args?.request as Record<string, unknown>;
        ch.emit({ type: 'done', full_content: 'ok' });
      }
      return null;
    });

    await new TauriOpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'k' }).chat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4o',
    } as ChatRequest);

    expect('topP' in captured!).toBe(false);
    expect('presencePenalty' in captured!).toBe(false);
    expect('frequencyPenalty' in captured!).toBe(false);
    expect('reasoningEffort' in captured!).toBe(false);
  });

  it('maxTokens 走 snake_case 的 max_tokens（Rust 侧既有字段，勿改）', async () => {
    const ch = channel();
    let captured: Record<string, unknown> | null = null;
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'chat_stream') {
        captured = args?.request as Record<string, unknown>;
        ch.emit({ type: 'done', full_content: 'ok' });
      }
      return null;
    });

    await new TauriOpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'k' }).chat({
      messages: [],
      model: 'gpt-4o',
      maxTokens: 1024,
      temperature: 0.5,
    } as ChatRequest);

    expect(captured!.max_tokens).toBe(1024);
    expect(captured!.temperature).toBe(0.5);
  });
});

describe('LocalApiClient — QA 独立验证（chatStream 路径 topP 优先级）', () => {
  function makeStore(settings?: { defaultTopP?: number }) {
    return {
      isAvailable: true,
      loadedModelId: 'm',
      loadModel: vi.fn().mockResolvedValue(true),
      lastError: null,
      settings,
      infer: vi.fn().mockImplementation(async () => 'ok'),
    };
  }

  async function withStore<T>(
    store: ReturnType<typeof makeStore>,
    fn: (C: typeof import('@api/local-api-client').LocalApiClient) => Promise<T>
  ): Promise<T> {
    vi.resetModules();
    vi.doMock('@/stores/local-model', () => ({ useLocalModelStore: () => store }));
    const mod = await import('@api/local-api-client');
    try {
      return await fn(mod.LocalApiClient);
    } finally {
      vi.doUnmock('@/stores/local-model');
    }
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@/stores/local-model');
  });

  it('chatStream：request.topP 有值时优先于 store 默认（修既有硬编码 0.95 漏洞）', async () => {
    const store = makeStore({ defaultTopP: 0.5 });
    await withStore(store, async (C) => {
      const client = new C('m');
      const events = [];
      for await (const ev of client.chatStream({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
        topP: 0.21,
      } as ChatRequest)) {
        events.push(ev);
      }
    });
    expect((store.infer.mock.calls[0]![0] as { topP: number }).topP).toBe(0.21);
  });

  it('chatStream：request.topP = 0 也必须采信（0 ≠ 未设置）', async () => {
    const store = makeStore({ defaultTopP: 0.5 });
    await withStore(store, async (C) => {
      for await (const _ev of new C('m').chatStream({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
        topP: 0,
      } as ChatRequest)) {
        /* consume */
      }
    });
    expect((store.infer.mock.calls[0]![0] as { topP: number }).topP).toBe(0);
  });

  it('chatStream：request 未设置时回落到 store.settings.defaultTopP', async () => {
    const store = makeStore({ defaultTopP: 0.66 });
    await withStore(store, async (C) => {
      for await (const _ev of new C('m').chatStream({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
      } as ChatRequest)) {
        /* consume */
      }
    });
    expect((store.infer.mock.calls[0]![0] as { topP: number }).topP).toBe(0.66);
  });

  it('chatStream：都未设置 → 兜底 0.95', async () => {
    const store = makeStore();
    await withStore(store, async (C) => {
      for await (const _ev of new C('m').chatStream({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
      } as ChatRequest)) {
        /* consume */
      }
    });
    expect((store.infer.mock.calls[0]![0] as { topP: number }).topP).toBe(0.95);
  });

  it('local 硬边界：presence/frequency penalty 与 reasoningEffort 静默丢弃（不下发引擎）', async () => {
    const store = makeStore();
    await withStore(store, async (C) => {
      await new C('m').chat({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
        presencePenalty: 0.8,
        frequencyPenalty: 0.9,
        reasoningEffort: 'high',
      } as ChatRequest);
    });
    const arg = store.infer.mock.calls[0]![0] as Record<string, unknown>;
    expect('presencePenalty' in arg).toBe(false);
    expect('frequencyPenalty' in arg).toBe(false);
    expect('reasoningEffort' in arg).toBe(false);
  });
});
