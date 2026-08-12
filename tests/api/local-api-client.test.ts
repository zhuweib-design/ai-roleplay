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
    const done = events[events.length - 1];
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
