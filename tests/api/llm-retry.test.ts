import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ChatStreamEvent } from '@api/types';
import {
  DEFAULT_RETRY_POLICY,
  isRetryableError,
  retryDelayMs,
  withLlmRetry,
  withStreamRetry,
  type RetryPolicy,
} from '@api/llm-retry';

/**
 * MODEL-02 · LLM 调用层自动重试
 *
 * 核心不变式：**只在连接阶段（无产出）重试**。已产出内容后失败必须抛出，
 * 否则重发的流会从头生成，导致正文重复。
 */

/** 无等待的策略（测试不真实休眠）。 */
function instantPolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy {
  return { ...DEFAULT_RETRY_POLICY, sleep: async () => {}, ...overrides };
}

function apiError(kind: ConstructorParameters<typeof ApiError>[3], message = 'boom'): ApiError {
  return new ApiError(message, 500, 'test', kind);
}

/** 构造一个先失败若干次、再成功的异步生成器工厂。 */
function failsThenSucceeds(failures: unknown[], events: ChatStreamEvent[]): () => AsyncGenerator<ChatStreamEvent> {
  let call = 0;
  return async function* () {
    const index = call++;
    if (index < failures.length) throw failures[index];
    for (const event of events) yield event;
  };
}

describe('错误分类与退避', () => {
  it('只有瞬时错误可重试（限流/5xx/网络）', () => {
    expect(isRetryableError(apiError('rate-limit'))).toBe(true);
    expect(isRetryableError(apiError('server'))).toBe(true);
    expect(isRetryableError(apiError('network'))).toBe(true);
  });

  it('确定性错误不重试（鉴权/非法地址/跨域/中止）', () => {
    for (const kind of ['auth', 'invalid-url', 'cors', 'aborted', 'unknown'] as const) {
      expect(isRetryableError(apiError(kind)), `${kind} 不应重试`).toBe(false);
    }
  });

  it('非 ApiError 不重试', () => {
    expect(isRetryableError(new Error('plain'))).toBe(false);
    expect(isRetryableError('string')).toBe(false);
  });

  it('退避指数增长并封顶', () => {
    const policy = instantPolicy({ baseDelayMs: 100, maxDelayMs: 500 });
    expect(retryDelayMs(1, policy)).toBe(100);
    expect(retryDelayMs(2, policy)).toBe(200);
    expect(retryDelayMs(3, policy)).toBe(400);
    expect(retryDelayMs(4, policy)).toBe(500); // 封顶
    expect(retryDelayMs(10, policy)).toBe(500);
  });
});

describe('withLlmRetry（一次性请求）', () => {
  it('瞬时错误后成功：返回结果并按策略重试', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const result = await withLlmRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw apiError('server');
        return 'ok';
      },
      () => false,
      instantPolicy({ onRetry }),
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('超过最大重试次数后抛出原错误', async () => {
    let calls = 0;
    await expect(withLlmRetry(
      async () => { calls += 1; throw apiError('rate-limit'); },
      () => false,
      instantPolicy({ maxRetries: 2 }),
    )).rejects.toThrow('boom');
    expect(calls).toBe(3); // 首次 + 2 次重试
  });

  it('确定性错误立即抛出，不消耗重试次数', async () => {
    let calls = 0;
    await expect(withLlmRetry(
      async () => { calls += 1; throw apiError('auth'); },
      () => false,
      instantPolicy(),
    )).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('已产出内容时不重试（安全边界）', async () => {
    let calls = 0;
    await expect(withLlmRetry(
      async () => { calls += 1; throw apiError('server'); },
      () => true, // 声称已产出
      instantPolicy(),
    )).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe('withStreamRetry（流式请求）', () => {
  const events: ChatStreamEvent[] = [
    { type: 'delta', delta: '你好' },
    { type: 'done', fullContent: '你好' },
  ];

  async function collect(stream: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
    const out: ChatStreamEvent[] = [];
    for await (const event of stream) out.push(event);
    return out;
  }

  it('连接阶段失败后重试成功，事件完整', async () => {
    const create = failsThenSucceeds([apiError('server'), apiError('network')], events);
    const result = await collect(withStreamRetry(create, instantPolicy()));
    expect(result).toEqual(events);
  });

  it('已 yield 事件后失败：不重放（避免正文重复）', async () => {
    let calls = 0;
    const create = async function* () {
      calls += 1;
      yield { type: 'delta', delta: '部分内容' } as ChatStreamEvent;
      throw apiError('server');
    };
    const received: ChatStreamEvent[] = [];
    await expect((async () => {
      for await (const event of withStreamRetry(create, instantPolicy())) received.push(event);
    })()).rejects.toThrow();
    // 只调用了一次：产出一旦发生，绝不再请求
    expect(calls).toBe(1);
    expect(received).toHaveLength(1);
  });

  it('确定性错误不重试', async () => {
    let calls = 0;
    const create = failsThenSucceeds([apiError('auth')], events);
    await expect(collect(withStreamRetry(
      async function* () { calls += 1; yield* create(); },
      instantPolicy(),
    ))).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('重试次数用尽后抛出', async () => {
    let calls = 0;
    const create = async function* (): AsyncGenerator<ChatStreamEvent> {
      calls += 1;
      throw apiError('server');
      yield { type: 'done' } as ChatStreamEvent;
    };
    await expect(collect(withStreamRetry(create, instantPolicy({ maxRetries: 1 })))).rejects.toThrow();
    expect(calls).toBe(2);
  });
});
