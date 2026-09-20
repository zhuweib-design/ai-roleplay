/**
 * LocalApiClient — 本地推理 token 级流式（T-04）测试
 *
 * 覆盖：
 * - chatStream 逐 token 产出（而非一次性）并正确 done
 * - done 事件 fullContent 为完整内容
 * - 中止：signal abort 时输出 error 事件
 * - 引擎错误映射为 error 事件
 * - chat 非流式不受影响
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** mock local-model store:可控 onDelta 时序 */
function makeMockStore(overrides: {
  isAvailable?: boolean;
  loadedModelId?: string;
  onInfer?: (
    request: { modelId: string },
    onDelta?: (delta: string, full: string) => void
  ) => Promise<string>;
}) {
  const store = {
    isAvailable: overrides.isAvailable ?? true,
    loadedModelId: 'test-model',
    loadModel: vi.fn().mockResolvedValue(true),
    lastError: null,
    infer: vi.fn().mockImplementation(overrides.onInfer ?? (async () => '')),
  };
  return store;
}

/** 注入 mock store 到 local-model 模块 */
function mockLocalModelStore(store: ReturnType<typeof makeMockStore>) {
  const mod = {
    useLocalModelStore: () => store,
  };
  vi.doMock('@/stores/local-model', () => mod);
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

describe('LocalApiClient 流式 (T-04)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.doUnmock('@/stores/local-model');
  });

  it('逐 token 产出并正确 done', async () => {
    mockLocalModelStore(
      makeMockStore({
        onInfer: async (_req, onDelta) => {
          let full = '';
          for (const t of ['你', '好', '世', '界']) {
            full += t;
            onDelta?.(t, full);
          }
          return full;
        },
      })
    );

    const { LocalApiClient: LocalClient } = await import('@api/local-api-client');
    const client = new LocalClient('test-model');
    const events = await collect(
      client.chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'test-model' })
    );

    expect(events.filter((e) => e.type === 'delta')).toEqual([
      { type: 'delta', delta: '你' },
      { type: 'delta', delta: '好' },
      { type: 'delta', delta: '世' },
      { type: 'delta', delta: '界' },
    ]);
    const done = events[events.length - 1]!;
    expect(done.type).toBe('done');
    expect(done.fullContent).toBe('你好世界');
  });

  it('中止:signal abort 时输出 error 事件', async () => {
    mockLocalModelStore(
      makeMockStore({
        onInfer: async (_req, onDelta) => {
          // 模拟生成中挂起,等待外部触发
          await new Promise((r) => setTimeout(r, 50));
          onDelta?.('迟到', '迟到');
          return '迟到';
        },
      })
    );

    const { LocalApiClient: LocalClient } = await import('@api/local-api-client');
    const client = new LocalClient('test-model');
    const controller = new AbortController();
    const iter = client.chatStream({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'test-model',
      signal: controller.signal,
    });

    const reader = iter[Symbol.asyncIterator]();
    // 先开始消费(挂起在等待)
    const first = reader.next();
    // 立即中止
    controller.abort();
    const result = await first;
    expect(result.value).toEqual({ type: 'error', error: '已停止生成' });
  });

  it('引擎错误映射为 error 事件', async () => {
    mockLocalModelStore(
      makeMockStore({
        onInfer: async () => {
          throw new Error('WebGPU 设备丢失');
        },
      })
    );

    const { LocalApiClient: LocalClient } = await import('@api/local-api-client');
    const client = new LocalClient('test-model');
    const events = await collect(
      client.chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'test-model' })
    );
    expect(events).toEqual([{ type: 'error', error: 'WebGPU 设备丢失' }]);
  });

  it('chat 非流式返回完整结果', async () => {
    mockLocalModelStore(
      makeMockStore({
        onInfer: async () => '完整回复',
      })
    );

    const { LocalApiClient: LocalClient } = await import('@api/local-api-client');
    const client = new LocalClient('test-model');
    const text = await client.chat({ messages: [{ role: 'user', content: 'hi' }], model: 'test-model' });
    expect(text).toBe('完整回复');
  });
});

// ── P0-3：top_p 读取修复（请求优先于硬编码 0.95） ──

describe('LocalApiClient — P0-3 top_p 取值优先级', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.doUnmock('@/stores/local-model');
  });

  /** 抓取传给引擎的 topP */
  async function captureTopP(
    store: ReturnType<typeof makeMockStore>,
    request: { messages: Array<{ role: 'user'; content: string }>; model: string; topP?: number }
  ): Promise<number | undefined> {
    const infer = store.infer as unknown as { mock: { calls: unknown[][] } };
    mockLocalModelStore(store);
    const { LocalApiClient: LocalClient } = await import('@api/local-api-client');
    const client = new LocalClient('test-model');
    await client.chat(request);
    const call = infer.mock.calls[0]?.[0] as { topP?: number } | undefined;
    return call?.topP;
  }

  it('request.topP 有值时优先于 store 默认（修既有漏洞）', async () => {
    const store = makeMockStore({});
    (store as unknown as { settings: { defaultTopP: number } }).settings = { defaultTopP: 0.5 };
    const topP = await captureTopP(store, {
      messages: [{ role: 'user', content: 'hi' }],
      model: 'test-model',
      topP: 0.3,
    });
    expect(topP).toBe(0.3);
  });

  it('request.topP 为 0 时也应被采信（0 是合法值，不是"未设置"）', async () => {
    const store = makeMockStore({});
    (store as unknown as { settings: { defaultTopP: number } }).settings = { defaultTopP: 0.5 };
    const topP = await captureTopP(store, {
      messages: [{ role: 'user', content: 'hi' }],
      model: 'test-model',
      topP: 0,
    });
    expect(topP).toBe(0);
  });

  it('request.topP 未设置时回落到 store.settings.defaultTopP', async () => {
    const store = makeMockStore({});
    (store as unknown as { settings: { defaultTopP: number } }).settings = { defaultTopP: 0.66 };
    const topP = await captureTopP(store, {
      messages: [{ role: 'user', content: 'hi' }],
      model: 'test-model',
    });
    expect(topP).toBe(0.66);
  });

  it('两者都未设置时回落到 0.95（保持既有默认行为）', async () => {
    const store = makeMockStore({});
    const topP = await captureTopP(store, {
      messages: [{ role: 'user', content: 'hi' }],
      model: 'test-model',
    });
    expect(topP).toBe(0.95);
  });
});
