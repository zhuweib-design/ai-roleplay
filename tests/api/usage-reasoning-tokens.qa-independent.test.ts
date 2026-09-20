import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnthropicClient, toAnthropicChatUsage } from '../../src/api/anthropic-client';
import { usageReasoningTokens } from '../../src/api/openai-client';
import type { ChatStreamEvent } from '../../src/api/types';
import { initLocale } from '@/i18n';

/**
 * QA 独立验证 —— 任务 2：思考 token（reasoningTokens）解析
 *
 * 与工程师用例的差异：
 * - Anthropic 侧重点验证 **双路合并的正确性**：message_start 的 output_tokens 通常是 1，
 *   message_delta 才是最终值；断言合并后 totalTokens 不是 1 + 1 的错值
 * - 断言「缓存字段刻意不映射」这个取舍是对的（不产生假命中率）
 * - 断言本地引擎不上报时**消息上根本没有该字段**（不是 0）
 */

// ── 夹具 ──

function sse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(`data: ${l}\n\n`));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as Response;
}

async function collect(gen: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

function anthropicClient(): AnthropicClient {
  return new AnthropicClient({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant' });
}

// ── 1. Anthropic：新增 usage 解析 + 双路合并 ──

describe('Anthropic usage —— 思考 token（QA 独立）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    initLocale('zh');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('message_start + message_delta 双路合并：thinking_tokens 取到，total 按合并值重算', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sse([
        JSON.stringify({
          type: 'message_start',
          message: { usage: { input_tokens: 100, output_tokens: 1 } },
        }),
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }),
        JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 800, output_tokens_details: { thinking_tokens: 320 } },
        }),
        JSON.stringify({ type: 'message_stop' }),
      ])
    ) as unknown as typeof globalThis.fetch;

    const events = await collect(
      anthropicClient().chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-5' })
    );
    const done = events.find((e) => e.type === 'done')!;

    expect(done.usage?.reasoningTokens).toBe(320);
    expect(done.usage?.promptTokens).toBe(100);
    expect(done.usage?.completionTokens).toBe(800);
    // Anthropic 不返回 total_tokens —— 必须按合并后的 input+output 算，不能是 101
    expect(done.usage?.totalTokens).toBe(900);
  });

  it('只有 message_start（无 delta usage）时不编造 reasoningTokens', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      sse([
        JSON.stringify({
          type: 'message_start',
          message: { usage: { input_tokens: 100, output_tokens: 1 } },
        }),
        JSON.stringify({ type: 'message_stop' }),
      ])
    ) as unknown as typeof globalThis.fetch;

    const events = await collect(
      anthropicClient().chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-5' })
    );
    const done = events.find((e) => e.type === 'done')!;

    expect(done.usage?.reasoningTokens).toBeUndefined();
    expect('reasoningTokens' in (done.usage ?? {})).toBe(false);
  });

  it('thinking_tokens 上报 0 时保持 0（由上层按"未上报"处理，不在此处伪造）', () => {
    const u = toAnthropicChatUsage({ input_tokens: 10, output_tokens: 20, output_tokens_details: { thinking_tokens: 0 } });
    expect(u.reasoningTokens).toBe(0);
  });

  it('缓存字段刻意不映射（只映射其一会让命中率算出 100% 假数字）', () => {
    const u = toAnthropicChatUsage({
      input_tokens: 100,
      output_tokens: 50,
    } as never);
    // 不得凭空出现任何 cache 相关字段
    for (const k of Object.keys(u)) {
      expect(k).not.toMatch(/cache/i);
    }
    expect(u.promptCacheHitTokens).toBeUndefined();
    expect(u.promptCacheMissTokens).toBeUndefined();
  });

  it('NaN / 非数字的 usage 字段不泄漏', () => {
    const u = toAnthropicChatUsage({
      input_tokens: Number.NaN,
      output_tokens: 'x',
      output_tokens_details: { thinking_tokens: Number.NaN },
    } as never);
    expect(u.promptTokens).toBeUndefined();
    expect(u.completionTokens).toBeUndefined();
    expect(u.totalTokens).toBeUndefined();
    expect(u.reasoningTokens).toBeUndefined();
  });
});

// ── 2. OpenAI 兼容：官方字段优先 + 网关平铺兜底 ──

describe('OpenAI 兼容 usage —— 思考 token（QA 独立）', () => {
  it('官方 completion_tokens_details.reasoning_tokens 优先', () => {
    expect(
      usageReasoningTokens({
        completion_tokens_details: { reasoning_tokens: 42 },
        reasoning_tokens: 7,
      })
    ).toBe(42);
  });

  it('网关平铺 usage.reasoning_tokens 兜底', () => {
    expect(usageReasoningTokens({ reasoning_tokens: 7 })).toBe(7);
  });

  it('两者都无 → undefined（不返回 0）', () => {
    expect(usageReasoningTokens({ prompt_tokens: 1, completion_tokens: 2 })).toBeUndefined();
    expect(usageReasoningTokens(undefined)).toBeUndefined();
    expect(usageReasoningTokens('nope')).toBeUndefined();
  });

  it('非法值（NaN / 字符串）按未上报处理', () => {
    expect(usageReasoningTokens({ reasoning_tokens: Number.NaN })).toBeUndefined();
    expect(usageReasoningTokens({ completion_tokens_details: { reasoning_tokens: '9' } })).toBeUndefined();
  });
});

// ── 3. Tauri：Rust 整块透传，必须读到官方的 completion_tokens_details ──

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));

function createMockChannel(): { emit: (p: unknown) => void } {
  const listeners: Array<(e: { payload: unknown }) => void> = [];
  listenMock.mockImplementation(async (_c: string, cb: (e: { payload: unknown }) => void) => {
    listeners.push(cb);
    return async () => undefined;
  });
  return { emit: (p: unknown) => listeners.forEach((l) => l({ payload: p })) };
}

describe('Tauri usage —— 思考 token（QA 独立）', () => {
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

  async function runWithUsage(usage: Record<string, unknown>) {
    const { TauriOpenAIClient: C } = await import('../../src/api/tauri-openai-client');
    const client = new C({ baseUrl: 'https://api.openai.com', apiKey: 'sk' });
    const channel = createMockChannel();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'chat_stream') {
        setTimeout(() => {
          channel.emit({
            type: 'done',
            full_content: 'ok',
            finish_reason: 'stop',
            usage,
          });
        }, 0);
        return Promise.resolve('ok');
      }
      return Promise.resolve(null);
    });
    const events = await collect(
      client.chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' })
    );
    return events.find((e) => e.type === 'done');
  }

  it('Rust 透传的 completion_tokens_details 能被读到（修复前只能读顶层）', async () => {
    const done = await runWithUsage({
      prompt_tokens: 10,
      completion_tokens: 20,
      completion_tokens_details: { reasoning_tokens: 55 },
    });
    expect(done?.usage?.reasoningTokens).toBe(55);
  });

  it('网关平铺用法同样可读（两条路都通）', async () => {
    const done = await runWithUsage({ prompt_tokens: 1, completion_tokens: 2, reasoning_tokens: 12 });
    expect(done?.usage?.reasoningTokens).toBe(12);
  });

  it('未上报时 reasoningTokens 为 undefined（不显示 0）', async () => {
    const done = await runWithUsage({ prompt_tokens: 1, completion_tokens: 2 });
    // 注：Tauri 侧恒写该键（值 undefined），键存在但值不是数字 —— 下游一律按
    // `typeof === 'number' && > 0` 判定，故不会显示 0；此处只断言值语义。
    expect(done?.usage?.reasoningTokens).toBeUndefined();
    expect(typeof done?.usage?.reasoningTokens).not.toBe('number');
  });
});
