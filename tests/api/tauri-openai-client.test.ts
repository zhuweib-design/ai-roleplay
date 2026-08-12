import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mock Tauri APIs ──
// 模拟 @tauri-apps/api/core.invoke 和 @tauri-apps/api/event.listen

const invokeMock = vi.fn();
const listenMock = vi.fn();

beforeEach(() => {
  // 模拟 Tauri 环境
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: invokeMock,
  };

  // 模拟 ESM 模块
  vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
  }));
  vi.mock('@tauri-apps/api/event', () => ({
    listen: listenMock,
  }));

  invokeMock.mockReset();
  listenMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

// 辅助：模拟 listen 函数（创建一个可手动 emit 的 channel）
function createMockChannel() {
  const listeners: Array<(event: { payload: unknown }) => void> = [];
  listenMock.mockImplementation(async (_channel: string, cb: (e: { payload: unknown }) => void) => {
    listeners.push(cb);
    return async () => {
      // unlisten
    };
  });

  return {
    emit(payload: unknown) {
      for (const l of listeners) l({ payload });
    },
    clear() {
      listeners.length = 0;
    },
  };
}

const { TauriOpenAIClient } = await import('@/api/tauri-openai-client');

describe('TauriOpenAIClient', () => {
  describe('isTauriEnv', () => {
    it('在 window.__TAURI_INTERNALS__ 存在时返回 true', () => {
      expect(TauriOpenAIClient.isTauriEnv()).toBe(true);
    });

    it('在 window.__TAURI_INTERNALS__ 不存在时返回 false', () => {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      expect(TauriOpenAIClient.isTauriEnv()).toBe(false);
    });
  });

  describe('endpoint 计算', () => {
    // 通过实例行为测试 endpoint 逻辑（私有属性通过 chat 调用间接验证）

    it('基础 URL 自动补全 /v1/chat/completions', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'test-key',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          // 立即触发完成事件
          setTimeout(() => {
            channel.emit({ type: 'done', full_content: '响应', finish_reason: 'stop' });
          }, 0);
          return Promise.resolve('响应');
        }
        return Promise.resolve(null);
      });

      await client.chat({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4',
      });

      expect(invokeMock).toHaveBeenCalledWith(
        'chat_stream',
        expect.objectContaining({
          request: expect.objectContaining({
            endpoint: 'https://api.openai.com/v1/chat/completions',
          }),
        })
      );
    });

    it('已含 /v1 路径补全 /chat/completions', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'test-key',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          setTimeout(() => {
            channel.emit({ type: 'done', full_content: '响应' });
          }, 0);
          return Promise.resolve('响应');
        }
        return Promise.resolve(null);
      });

      await client.chat({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'deepseek-chat',
      });

      expect(invokeMock).toHaveBeenCalledWith(
        'chat_stream',
        expect.objectContaining({
          request: expect.objectContaining({
            endpoint: 'https://api.deepseek.com/v1/chat/completions',
          }),
        })
      );
    });
  });

  describe('chat (非流式)', () => {
    it('正常接收流式增量并返回完整内容', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'test-key',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          // 等到事件全部触发后再 resolve，确保 chat 能正确收到内容
          return new Promise<string>((resolve) => {
            setTimeout(() => {
              channel.emit({ type: 'delta', delta: 'Hello' });
              channel.emit({ type: 'delta', delta: ', ' });
              channel.emit({ type: 'delta', delta: 'World!' });
              channel.emit({ type: 'done', full_content: 'Hello, World!', finish_reason: 'stop' });
              setTimeout(() => resolve('Hello, World!'), 10);
            }, 0);
          });
        }
        return Promise.resolve(null);
      });

      const result = await client.chat({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4',
      });

      expect(result).toBe('Hello, World!');
    });

    it('API 错误时抛出 ApiError', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'invalid-key',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          // 等到错误事件触发后再 resolve，确保 chat 能正确捕获错误
          return new Promise<string>((resolve) => {
            setTimeout(() => {
              channel.emit({
                type: 'error',
                error: 'Invalid API key',
                status: 401,
              });
              // 给 listen 回调一个 tick 执行后再 resolve
              setTimeout(() => resolve(''), 10);
            }, 0);
          });
        }
        return Promise.resolve(null);
      });

      await expect(
        client.chat({
          messages: [{ role: 'user', content: 'hi' }],
          model: 'gpt-4',
        })
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('chatStream (流式)', () => {
    it('通过 async generator yield 增量 token', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'test-key',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          setTimeout(() => {
            channel.emit({ type: 'delta', delta: 'Hello' });
            channel.emit({ type: 'delta', delta: ' World' });
            channel.emit({ type: 'done', full_content: 'Hello World', finish_reason: 'stop' });
          }, 0);
          return Promise.resolve('Hello World');
        }
        return Promise.resolve(null);
      });

      const events: Array<{ type: string; delta?: string; fullContent?: string }> = [];
      const stream = client.chatStream({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4',
      });

      for await (const ev of stream) {
        events.push(ev);
      }

      // 应该收到 2 个 delta + 1 个 done
      const deltaEvents = events.filter((e) => e.type === 'delta');
      const doneEvents = events.filter((e) => e.type === 'done');

      expect(deltaEvents).toHaveLength(2);
      expect(deltaEvents[0].delta).toBe('Hello');
      expect(deltaEvents[1].delta).toBe(' World');
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0].fullContent).toBe('Hello World');
    });

    it('错误事件后 yield error 并结束', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'invalid',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          setTimeout(() => {
            channel.emit({ type: 'error', error: 'API 限流', status: 429 });
          }, 0);
          return Promise.resolve('');
        }
        return Promise.resolve(null);
      });

      const stream = client.chatStream({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4',
      });

      const events = [];
      for await (const ev of stream) {
        events.push(ev);
      }

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error).toBe('API 限流');
    });

    it('Rust 端 invoke 抛错时也能正常处理', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'test-key',
      });

      createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          throw new Error('Rust 端错误');
        }
        return Promise.resolve(null);
      });

      const stream = client.chatStream({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4',
      });

      const events = [];
      for await (const ev of stream) {
        events.push(ev);
      }

      // 应该有错误事件
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ping', () => {
    it('成功时返回 true', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'test-key',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          setTimeout(() => {
            channel.emit({ type: 'done', full_content: 'pong', finish_reason: 'stop' });
          }, 0);
          return Promise.resolve('pong');
        }
        return Promise.resolve(null);
      });

      const result = await client.ping();
      expect(result).toBe(true);
    });

    it('失败时返回 false', async () => {
      const client = new TauriOpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'invalid',
      });

      const channel = createMockChannel();

      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === 'chat_stream') {
          return new Promise<string>((resolve) => {
            setTimeout(() => {
              channel.emit({ type: 'error', error: 'Unauthorized', status: 401 });
              setTimeout(() => resolve(''), 10);
            }, 0);
          });
        }
        return Promise.resolve(null);
      });

      const result = await client.ping();
      expect(result).toBe(false);
    });
  });
});

describe('createApiClient 工厂', () => {
  it('Tauri 环境返回 TauriOpenAIClient', async () => {
    const { createApiClient } = await import('@/api');
    const { TauriOpenAIClient: Client } = await import('@/api/tauri-openai-client');

    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };

    const client = createApiClient({
      id: 'p-1',
      name: 'test',
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'key',
      model: 'gpt-4',
    });

    expect(client).toBeInstanceOf(Client);
  });

  it('Web 环境返回 OpenAIClient', async () => {
    const { createApiClient } = await import('@/api');
    const { OpenAIClient } = await import('@/api/openai-client');

    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    const client = createApiClient({
      id: 'p-1',
      name: 'test',
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'key',
      model: 'gpt-4',
    });

    expect(client).toBeInstanceOf(OpenAIClient);
  });
});

// ── Tauri usage 统计 ──

describe('TauriOpenAIClient usage 统计', () => {
  it('done 事件携带 usage(含前缀缓存拆解)时透传', async () => {
    const channel = createMockChannel();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'chat_stream') {
        setTimeout(() => {
          channel.emit({
            type: 'done',
            full_content: 'ok',
            finish_reason: 'stop',
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              total_tokens: 120,
              prompt_cache_hit_tokens: 60,
              prompt_cache_miss_tokens: 40,
            },
          });
        }, 0);
        return Promise.resolve('ok');
      }
      return Promise.resolve(null);
    });
    const client = new TauriOpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });

    const iter = client.chatStream({ messages: [], model: 'm' });
    const reader = iter[Symbol.asyncIterator]();
    // 先让生成器挂起等待事件
    const nextPromise = reader.next();

    await new Promise((r) => setTimeout(r, 30));

    const result = await nextPromise;
    expect(result.value).toMatchObject({
      type: 'done',
      fullContent: 'ok',
      usage: {
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        promptCacheHitTokens: 60,
        promptCacheMissTokens: 40,
      },
    });
  });

  it('done 无 usage 时不携带', async () => {
    const channel = createMockChannel();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'chat_stream') {
        setTimeout(() => {
          channel.emit({ type: 'done', full_content: 'ok' });
        }, 0);
        return Promise.resolve('ok');
      }
      return Promise.resolve(null);
    });
    const client = new TauriOpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });

    const iter = client.chatStream({ messages: [], model: 'm' });
    const reader = iter[Symbol.asyncIterator]();
    const nextPromise = reader.next();

    await new Promise((r) => setTimeout(r, 30));

    const result = await nextPromise;
    expect(result.value.usage).toBeUndefined();
  });
});
