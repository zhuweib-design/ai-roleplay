import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIClient } from '@api/openai-client';
import { ApiError } from '@api/types';
import type { ChatRequest } from '@api/types';

// ── 测试辅助 ──

function toSSEStream(events: string[]): Uint8Array {
  const text = events.map((e) => `data: ${e}\n\n`).join('');
  return new TextEncoder().encode(text);
}

function makeReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

function deltaChunk(content: string, finishReason: string | null = null): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
  });
}

function mockResponse(body: ReadableStream<Uint8Array> | string, status = 200): Response {
  const isStream = typeof body !== 'string';
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    body: isStream ? (body as ReadableStream<Uint8Array>) : null,
    json: async () => JSON.parse(body as string),
    text: async () => (body as string) ?? '',
  } as Response;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

// ── 测试用例 ─

describe('OpenAIClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('endpoint 构造', () => {
    it('应在 baseUrl 缺少 /v1 时自动补全', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      );
      await client.chat({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' });
      expect(spy).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.anything());
    });

    it('应在 baseUrl 已含 /v1 时不重复添加', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test' });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      );
      await client.chat({ messages: [], model: 'm' });
      expect(spy).toHaveBeenCalledWith('https://api.deepseek.com/v1/chat/completions', expect.anything());
    });

    it('应在 baseUrl 已含完整路径时直接使用', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://custom.example.com/api/chat/completions', apiKey: 'sk-test' });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      );
      await client.chat({ messages: [], model: 'm' });
      expect(spy).toHaveBeenCalledWith('https://custom.example.com/api/chat/completions', expect.anything());
    });
  });

  describe('listModels()', () => {
    it('应在裸 baseUrl 时请求 /v1/models', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-3.5-turbo' }] }))
      );
      const models = await client.listModels();
      expect(spy).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.anything());
      expect(models).toEqual(['gpt-4o', 'gpt-3.5-turbo']);
    });

    it('应在 baseUrl 已含 /v1 时请求 /models', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test' });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ data: [{ id: 'deepseek-chat' }] }))
      );
      const models = await client.listModels();
      expect(spy).toHaveBeenCalledWith('https://api.deepseek.com/v1/models', expect.anything());
      expect(models).toEqual(['deepseek-chat']);
    });

    it('应在 baseUrl 已含 chat/completions 时改为 /models', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://proxy.example.com/v1/chat/completions', apiKey: 'sk-test' });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ data: [{ id: 'model-a' }] }))
      );
      await client.listModels();
      expect(spy).toHaveBeenCalledWith('https://proxy.example.com/v1/models', expect.anything());
    });

    it('应过滤掉无 id 或空 id 的条目', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ data: [{ id: 'a' }, {}, { id: '' }, { id: 'b' }] }))
      );
      expect(await client.listModels()).toEqual(['a', 'b']);
    });

    it('应在响应缺少 data 数组时抛 ApiError', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(JSON.stringify({ object: 'list' })));
      await expect(client.listModels()).rejects.toThrow(ApiError);
    });

    it('应在非 2xx 时抛 ApiError', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-bad' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Invalid API key' } }), 401)
      );
      await expect(client.listModels()).rejects.toThrow(ApiError);
    });
  });

  describe('非流式 chat()', () => {
    it('应正确解析非流式响应', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({
          id: 'chatcmpl-1',
          choices: [{ message: { role: 'assistant', content: '你好！' } }],
        }))
      );

      const result = await client.chat({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(result).toBe('你好！');
    });

    it('应在响应缺少 content 时抛 ApiError', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ choices: [{ message: {} }] }))
      );
      await expect(client.chat({ messages: [], model: 'm' })).rejects.toThrow(ApiError);
    });

    it('应在 HTTP 错误时抛 ApiError 并包含状态码', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-invalid' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Invalid API key' } }), 401)
      );
      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).message).toContain('Invalid API key');
      }
    });

    it('应在请求中包含 Authorization 头与 body 参数', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test-123' });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      );

      await client.chat({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4o',
        temperature: 1.2,
        maxTokens: 500,
      });

      const [, init] = spy.mock.calls[0]!;
      expect(init?.method).toBe('POST');
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-test-123');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(init?.body as string);
      expect(body.model).toBe('gpt-4o');
      expect(body.stream).toBe(false);
      expect(body.temperature).toBe(1.2);
      expect(body.max_tokens).toBe(500);
    });
  });

  describe('流式 chatStream()', () => {
    it('应正确解析标准 OpenAI SSE 流', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      const stream = makeReadableStream([
        toSSEStream([
          deltaChunk(''),
          deltaChunk('Hello'),
          deltaChunk(' world'),
          deltaChunk('!', 'stop'),
          '[DONE]',
        ]),
      ]);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(stream));

      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4o',
      };

      const events = await collect(client.chatStream(request));
      const deltas = events.filter((e) => e.type === 'delta');
      const dones = events.filter((e) => e.type === 'done');

      expect(deltas.length).toBe(3);
      expect(deltas[0]!.delta).toBe('Hello');
      expect(deltas[1]!.delta).toBe(' world');
      expect(deltas[2]!.delta).toBe('!');
      expect(dones.length).toBe(1);
      expect(dones[0]!.fullContent).toBe('Hello world!');
      expect(dones[0]!.finishReason).toBe('stop');
    });

    it('应支持分块切分的 SSE（一个事件跨多个 chunk）', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      const fullText = `data: ${deltaChunk('Hi', 'stop')}\n\ndata: [DONE]\n\n`;
      const chunks: Uint8Array[] = [
        new TextEncoder().encode(fullText.slice(0, 10)),
        new TextEncoder().encode(fullText.slice(10, 40)),
        new TextEncoder().encode(fullText.slice(40)),
      ];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(makeReadableStream(chunks)));

      const events = await collect(client.chatStream({ messages: [], model: 'm' }));
      const deltas = events.filter((e) => e.type === 'delta');
      expect(deltas.length).toBe(1);
      expect(deltas[0]!.delta).toBe('Hi');
      const done = events.find((e) => e.type === 'done');
      expect(done?.fullContent).toBe('Hi');
      expect(done?.finishReason).toBe('stop');
    });

    it('应忽略注释行与空行', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      // 模拟服务商发送 heartbeat 注释
      const raw = [
        ': heartbeat',
        '',
        `data: ${deltaChunk('ok')}`,
        '',
        `data: ${deltaChunk('', 'stop')}`,
        '',
        'data: [DONE]',
        '',
      ].join('\n');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(makeReadableStream([new TextEncoder().encode(raw)]))
      );

      const events = await collect(client.chatStream({ messages: [], model: 'm' }));
      const deltas = events.filter((e) => e.type === 'delta');
      expect(deltas.length).toBe(1);
      expect(deltas[0]!.delta).toBe('ok');
    });

    it('应在流结束时若未收到 [DONE] 也能正常 done', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      // 不带 [DONE]，只靠 finish_reason=stop
      const raw = `data: ${deltaChunk('Hello', 'stop')}\n\n`;
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(makeReadableStream([new TextEncoder().encode(raw)]))
      );

      const events = await collect(client.chatStream({ messages: [], model: 'm' }));
      const done = events.find((e) => e.type === 'done');
      expect(done).toBeDefined();
      expect(done?.fullContent).toBe('Hello');
    });

    it('应在 HTTP 错误时抛出 ApiError', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-bad' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), 429)
      );

      await expect(
        collect(client.chatStream({ messages: [], model: 'm' }))
      ).rejects.toThrow(ApiError);
    });

    it('应在响应缺少 body 时抛出 ApiError', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      } as Response);

      await expect(
        collect(client.chatStream({ messages: [], model: 'm' }))
      ).rejects.toThrow(ApiError);
    });

    it('应在请求中包含 stream:true 与 Accept 头', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      const sse = new TextEncoder().encode('data: [DONE]\n\n');
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(makeReadableStream([sse]))
      );

      await collect(client.chatStream({ messages: [], model: 'm' }));

      const [, init] = spy.mock.calls[0]!;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['Accept']).toBe('text/event-stream');
      const body = JSON.parse(init?.body as string);
      expect(body.stream).toBe(true);
    });

    it('应支持 AbortSignal 中止请求', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      const controller = new AbortController();
      const sse = new TextEncoder().encode('data: ' + deltaChunk('Hello') + '\n\n');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(makeReadableStream([sse]))
      );

      const iter = client.chatStream({
        messages: [],
        model: 'm',
        signal: controller.signal,
      })[Symbol.asyncIterator]();

      const first = await iter.next();
      expect(first.value.type).toBe('delta');

      controller.abort();
      const second = await iter.next();
      // abort 后应返回 error 事件
      expect(['error', 'done']).toContain(second.value.type);
    });
  });

  describe('ping()', () => {
    it('应在 2xx 返回时返回 true', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      );

      const ok = await client.ping();
      expect(ok).toBe(true);
    });

    it('应在 HTTP 错误时返回 false', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-bad' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Unauthorized' } }), 401)
      );

      const ok = await client.ping();
      expect(ok).toBe(false);
    });

    it('应在网络错误时返回 false', async () => {
      const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const ok = await client.ping();
      expect(ok).toBe(false);
    });
  });

  describe('额外配置', () => {
    it('应支持 extraHeaders（如 Azure api-key 头）', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://example.openai.azure.com',
        apiKey: 'ignored',
        extraHeaders: { 'api-key': 'azure-key-123' },
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      );

      await client.chat({ messages: [], model: 'm' });

      const [, init] = spy.mock.calls[0]!;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['api-key']).toBe('azure-key-123');
      // Authorization 仍应存在
      expect(headers['Authorization']).toBe('Bearer ignored');
    });
  });

  // ── 需求9：错误诊断分类测试 ──

  describe('错误诊断分类（classifyFetchError）', () => {
    it('Failed to fetch 错误应分类为 network kind', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
      });
      // 模拟浏览器典型的网络错误：TypeError("Failed to fetch")
      const fetchErr = new TypeError('Failed to fetch');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(fetchErr);

      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).kind).toBe('network');
        expect((err as ApiError).message).toContain('Failed to fetch');
        expect((err as ApiError).message).toContain('可能原因');
      }
    });

    it('NetworkRequest failed 错误也应分类为 network kind', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
      });
      const fetchErr = new TypeError('Network request failed');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(fetchErr);

      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).kind).toBe('network');
      }
    });

    it('AbortError 应分类为 aborted kind', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
      });
      const abortErr = new Error('The user aborted a request');
      abortErr.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);

      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).kind).toBe('aborted');
      }
    });
  });

  describe('HTTP 状态码到 kind 映射（toApiError）', () => {
    it('401 应映射为 auth kind', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-invalid',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Invalid API key' } }), 401)
      );

      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).kind).toBe('auth');
      }
    });

    it('429 应映射为 rate-limit kind', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), 429)
      );

      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).kind).toBe('rate-limit');
      }
    });

    it('500 应映射为 server kind', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Internal server error' } }), 500)
      );

      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).kind).toBe('server');
      }
    });

    it('400 应映射为 unknown kind', async () => {
      const client = new OpenAIClient({
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ error: { message: 'Bad request' } }), 400)
      );

      try {
        await client.chat({ messages: [], model: 'm' });
        expect.fail('应抛出 ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).kind).toBe('unknown');
      }
    });
  });
});

// ── T-02 工具调用 ──

function toolDeltaChunk(
  index: number,
  partial: { id?: string; name?: string; arguments?: string },
  finishReason: string | null = null
): string {
  return JSON.stringify({
    id: 'chatcmpl-tool',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index,
              ...(partial.id !== undefined ? { id: partial.id } : {}),
              type: 'function',
              function: {
                ...(partial.name !== undefined ? { name: partial.name } : {}),
                ...(partial.arguments !== undefined ? { arguments: partial.arguments } : {}),
              },
            },
          ],
        },
        finish_reason: finishReason,
      },
    ],
  });
}

describe('OpenAIClient 工具调用 (T-02)', () => {
  it('请求应透传 tools 定义', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
    );
    await client.chat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4o',
      tools: [{ type: 'function', function: { name: 'get_var', description: '读变量' } }],
    });
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'get_var', description: '读变量' } }]);
  });

  it('流式:按 index 聚合 tool_calls 增量并在 done 时返回', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
    const chunks = [
      toolDeltaChunk(0, { id: 'call_1', name: 'get_var', arguments: '' }),
      toolDeltaChunk(0, { arguments: '{"name":' }),
      toolDeltaChunk(0, { arguments: '"hp"}' }, 'tool_calls'),
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(makeReadableStream([toSSEStream(chunks)]))
    );

    const events = await collect(client.chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' }));
    const done = events[events.length - 1]!;
    expect(done.type).toBe('done');
    expect(done.toolCalls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'get_var', arguments: '{"name":"hp"}' },
      },
    ]);
    expect(done.finishReason).toBe('tool_calls');
  });

  it('流式:多个 tool_calls 按 index 独立聚合', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
    const chunks = [
      toolDeltaChunk(0, { id: 'call_a', name: 'get_var', arguments: '{"name":"a"}' }),
      toolDeltaChunk(1, { id: 'call_b', name: 'get_var', arguments: '{"name":"b"}' }),
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(makeReadableStream([toSSEStream(chunks)]))
    );

    const events = await collect(client.chatStream({ messages: [], model: 'm' }));
    const done = events[events.length - 1]!;
    expect(done.toolCalls?.map((t) => t.function.arguments)).toEqual([
      '{"name":"a"}',
      '{"name":"b"}',
    ]);
  });

  it('非流式:tool_calls 响应(content 为 null)返回空串而不报错', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'x', arguments: '{}' } }],
              },
            },
          ],
        })
      )
    );
    const text = await client.chat({ messages: [], model: 'm' });
    expect(text).toBe('');
  });
});

// ── 缓存命中率 usage 解析 ──

describe('OpenAIClient usage 统计', () => {
  it('流式末 chunk 携带 usage(含前缀缓存拆解)并在 done 返回', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
    const chunks = [
      deltaChunk('你好'),
      JSON.stringify({
        id: 'chatcmpl-u',
        object: 'chat.completion.chunk',
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_cache_hit_tokens: 60,
          prompt_cache_miss_tokens: 40,
        },
      }),
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(makeReadableStream([toSSEStream(chunks)]))
    );

    const events = await collect(client.chatStream({ messages: [], model: 'm' }));
    const done = events[events.length - 1]!;
    expect(done.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      promptCacheHitTokens: 60,
      promptCacheMissTokens: 40,
    });
  });

  it('无 usage 字段时不携带', async () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.openai.com', apiKey: 'sk-test' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(makeReadableStream([toSSEStream([deltaChunk('ok')])]))
    );
    const events = await collect(client.chatStream({ messages: [], model: 'm' }));
    expect(events[events.length - 1]!.usage).toBeUndefined();
  });
});
