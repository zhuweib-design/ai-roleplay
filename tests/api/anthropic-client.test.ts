import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicClient } from '@api/anthropic-client';
import { buildMessagesUrl, buildAnthropicModelsUrl, toAnthropicMessages } from '@api/anthropic-protocol';
import { ApiError } from '@api/types';

// ── 测试辅助 ──

function toSSEStream(events: string[]): Uint8Array {
  const text = events
    .map((e) => `event: ${JSON.parse(e).type}\ndata: ${e}\n\n`)
    .join('');
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

function event(type: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, ...extra });
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

function makeClient() {
  return new AnthropicClient({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-test' });
}

// ── 协议辅助 ──

describe('anthropic-protocol', () => {
  describe('buildMessagesUrl', () => {
    it('裸域名补全 /v1/messages', () => {
      expect(buildMessagesUrl('https://api.anthropic.com')).toBe(
        'https://api.anthropic.com/v1/messages'
      );
    });
    it('已含 /v1 不重复添加', () => {
      expect(buildMessagesUrl('https://api.anthropic.com/v1')).toBe(
        'https://api.anthropic.com/v1/messages'
      );
    });
    it('已含完整 /messages 原样返回', () => {
      expect(buildMessagesUrl('https://api.anthropic.com/v1/messages')).toBe(
        'https://api.anthropic.com/v1/messages'
      );
    });
  });

  describe('buildAnthropicModelsUrl', () => {
    it('裸域名 → /v1/models', () => {
      expect(buildAnthropicModelsUrl('https://api.anthropic.com')).toBe(
        'https://api.anthropic.com/v1/models'
      );
    });
    it('已含 /v1/messages → 替换为 /models', () => {
      expect(buildAnthropicModelsUrl('https://api.anthropic.com/v1/messages')).toBe(
        'https://api.anthropic.com/v1/models'
      );
    });
  });

  describe('toAnthropicMessages', () => {
    it('system 提取为顶层参数,多条拼接', () => {
      const parts = toAnthropicMessages([
        { role: 'system', content: '规则A' },
        { role: 'user', content: '你好' },
        { role: 'system', content: '规则B' },
      ]);
      expect(parts.system).toBe('规则A\n\n规则B');
      expect(parts.messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: '你好' }] },
      ]);
    });

    it('相邻同角色消息合并(协议要求 roles 交替)', () => {
      const parts = toAnthropicMessages([
        { role: 'user', content: '第一条' },
        { role: 'user', content: '第二条' },
        { role: 'assistant', content: '回复' },
      ]);
      expect(parts.messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: '第一条' }, { type: 'text', text: '第二条' }],
        },
        { role: 'assistant', content: [{ type: 'text', text: '回复' }] },
      ]);
    });

    it('无 system 时省略 system 参数', () => {
      const parts = toAnthropicMessages([{ role: 'user', content: 'hi' }]);
      expect(parts.system).toBeUndefined();
    });
  });
});

// ── 客户端 ──

describe('AnthropicClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('chat 非流式', () => {
    it('请求正确的端点与认证头,解析 content[0].text', async () => {
      const client = makeClient();
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ content: [{ type: 'text', text: '你好' }], stop_reason: 'end_turn' }))
      );
      const text = await client.chat({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-3-5-sonnet-20241022' });
      expect(text).toBe('你好');

      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant-test');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['Authorization']).toBeUndefined();

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.max_tokens).toBe(4096); // 未指定时兜底
      expect(body.stream).toBe(false);
      expect(body.messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      ]);
    });

    it('max_tokens 使用请求指定值', async () => {
      const client = makeClient();
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }))
      );
      await client.chat({ messages: [], model: 'm', maxTokens: 128 });
      const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
      expect(body.max_tokens).toBe(128);
    });

    it('响应缺少 content[0].text 时抛 unknown 错误', async () => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(JSON.stringify({})));
      await expect(client.chat({ messages: [], model: 'm' })).rejects.toThrow(
        '缺少 content 数组'
      );
    });
  });

  describe('chatStream 流式', () => {
    it('逐 token 输出并正确结束', async () => {
      const client = makeClient();
      const chunks = [
        event('message_start', { message: { content: [] } }),
        event('content_block_delta', { delta: { type: 'text_delta', text: '你' } }),
        event('content_block_delta', { delta: { type: 'text_delta', text: '好' } }),
        event('message_delta', { delta: { stop_reason: 'end_turn' } }),
        event('message_stop'),
      ];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(makeReadableStream([toSSEStream(chunks)]))
      );

      const events = await collect(client.chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'm' }));
      expect(events).toEqual([
        { type: 'delta', delta: '你' },
        { type: 'delta', delta: '好' },
        { type: 'done', fullContent: '你好', finishReason: 'end_turn' },
      ]);
    });

    it('跨 chunk 的 SSE 事件边界正确处理', async () => {
      const client = makeClient();
      const raw =
        'event: content_block_delta\ndata: ' +
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '跨' } }) +
        '\n\n' +
        'event: message_stop\ndata: ' +
        JSON.stringify({ type: 'message_stop' }) +
        '\n\n';
      const bytes = new TextEncoder().encode(raw);
      // 故意从中间切分,模拟网络分包
      const split = Math.floor(bytes.length / 2);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(
          makeReadableStream([bytes.slice(0, split), bytes.slice(split)])
        )
      );

      const events = await collect(client.chatStream({ messages: [], model: 'm' }));
      expect(events).toEqual([
        { type: 'delta', delta: '跨' },
        { type: 'done', fullContent: '跨', finishReason: undefined },
      ]);
    });

    it('流中 error 事件转为 error 事件', async () => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(
          makeReadableStream([
            toSSEStream([
              event('error', { error: { type: 'overloaded_error', message: '服务过载' } }),
            ]),
          ])
        )
      );
      const events = await collect(client.chatStream({ messages: [], model: 'm' }));
      expect(events).toEqual([{ type: 'error', error: '服务过载' }]);
    });

    it('用户中止时输出 error 事件', async () => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'));
      const events = await collect(
        client.chatStream({ messages: [], model: 'm', signal: new AbortController().signal })
      );
      expect(events).toEqual([{ type: 'error', error: '已停止生成' }]);
    });
  });

  describe('错误映射', () => {
    it.each([
      [401, 'auth'],
      [403, 'auth'],
      [429, 'rate-limit'],
      [500, 'server'],
      [400, 'unknown'],
    ])('HTTP %s → %s', async (status, kind) => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(
          JSON.stringify({ type: 'error', error: { type: 'x', message: 'boom' } }),
          status
        )
      );
      const err = await client.chat({ messages: [], model: 'm' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).kind).toBe(kind);
      expect((err as ApiError).message).toContain('boom');
    });
  });

  describe('ping', () => {
    it('401/403/429 之外视为通过', async () => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('{}', 400));
      expect(await client.ping()).toBe(true);
    });

    it('401 视为失败', async () => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse('{}', 401));
      expect(await client.ping()).toBe(false);
    });

    it('网络错误返回 false', async () => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      expect(await client.ping()).toBe(false);
    });
  });

  describe('listModels', () => {
    it('解析 data[].id', async () => {
      const client = makeClient();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockResponse(
          JSON.stringify({
            data: [{ id: 'claude-3-5-sonnet-20241022' }, { id: 'claude-3-haiku-20240307' }],
          })
        )
      );
      expect(await client.listModels()).toEqual([
        'claude-3-5-sonnet-20241022',
        'claude-3-haiku-20240307',
      ]);
    });
  });
});

// ── T-02 工具调用 ──

describe('AnthropicClient 工具调用 (T-02)', () => {
  // P1-2(pre-launch): T-02 为独立 describe, 必须自备 spy 清理。
  // 缺失时相邻用例共享同一 fetch mock(calls 累积), 后置用例的
  // mock.calls[0] 会读到前置用例的请求体, 导致断言失败(测试卫生问题)。
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('请求应转换并透传 tools 定义(OpenAI → Anthropic 格式)', async () => {
    const client = makeClient();
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }))
    );
    await client.chat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'claude-3-5-sonnet-20241022',
      tools: [
        {
          type: 'function',
          function: { name: 'get_var', description: '读变量', parameters: { type: 'object', properties: {} } },
        },
      ],
    });
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.tools).toEqual([
      { name: 'get_var', description: '读变量', input_schema: { type: 'object', properties: {} } },
    ]);
  });

  it('请求消息:assistant.toolCalls → tool_use block;tool 消息 → tool_result block', async () => {
    const client = makeClient();
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }))
    );
    await client.chat({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'toolu_1', type: 'function', function: { name: 'get_var', arguments: '{"name":"hp"}' } }],
        },
        { role: 'tool', content: '100', toolCallId: 'toolu_1' },
        { role: 'user', content: '继续' },
      ],
      model: 'm',
    });
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string) as {
      messages: Array<{ role: string; content: unknown[] }>;
    };
    expect(body.messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'toolu_1', name: 'get_var', input: { name: 'hp' } },
      ],
    });
    // tool_result(user 角色)与后续 user 文本相邻合并为同一消息
    expect(body.messages[1]!.role).toBe('user');
    expect(body.messages[1]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '100' },
      { type: 'text', text: '继续' },
    ]);
  });

  it('流式:聚合 tool_use(input_json_delta)并在 done 时返回', async () => {
    const client = makeClient();
    const chunks = [
      event('message_start', { message: { content: [] } }),
      event('content_block_start', {
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_9', name: 'get_var', input: {} },
      }),
      event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{"name":' } }),
      event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '"hp"}' } }),
      event('content_block_stop', { index: 0 }),
      event('message_delta', { delta: { stop_reason: 'tool_use' } }),
      event('message_stop'),
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(makeReadableStream([toSSEStream(chunks)]))
    );

    const events = await collect(client.chatStream({ messages: [{ role: 'user', content: 'hi' }], model: 'm' }));
    const done = events[events.length - 1]!;
    expect(done.type).toBe('done');
    expect(done.toolCalls).toEqual([
      {
        id: 'toolu_9',
        type: 'function',
        function: { name: 'get_var', arguments: '{"name":"hp"}' },
      },
    ]);
    expect(done.finishReason).toBe('tool_use');
  });

  it('流式:文本与工具调用共存时分别输出', async () => {
    const client = makeClient();
    const chunks = [
      event('content_block_start', { index: 0, content_block: { type: 'text' } }),
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '稍等' } }),
      event('content_block_stop', { index: 0 }),
      event('content_block_start', {
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'set_var', input: {} },
      }),
      event('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } }),
      event('content_block_stop', { index: 1 }),
      event('message_stop'),
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(makeReadableStream([toSSEStream(chunks)]))
    );

    const events = await collect(client.chatStream({ messages: [], model: 'm' }));
    expect(events[0]).toEqual({ type: 'delta', delta: '稍等' });
    const done = events[events.length - 1]!;
    expect(done.type).toBe('done');
    expect(done.fullContent).toBe('稍等');
    expect(done.toolCalls).toHaveLength(1);
  });

  it('非流式:tool_use 响应(无文本)返回空串而不报错', async () => {
    const client = makeClient();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(
        JSON.stringify({
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_var', input: { name: 'hp' } }],
          stop_reason: 'tool_use',
        })
      )
    );
    const text = await client.chat({ messages: [], model: 'm' });
    expect(text).toBe('');
  });
});

// ── P0-1 / P0-2 / P0-3：Anthropic 思考强度与采样参数 ──

describe('AnthropicClient — P0-2/P0-3 body 组装', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function captureBody(
    request: Parameters<AnthropicClient['chat']>[0]
  ): Promise<Record<string, unknown>> {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }))
    );
    await makeClient().chat(request);
    return JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
  }

  it('P0-3：top_p 未设置时不写入 body', async () => {
    const body = await captureBody({ messages: [], model: 'claude-3-5-sonnet-20241022' });
    expect(body.top_p).toBeUndefined();
  });

  it('P0-3：top_p 有值时写入 body', async () => {
    const body = await captureBody({ messages: [], model: 'm', topP: 0.7, maxTokens: 8192 });
    expect(body.top_p).toBe(0.7);
  });

  it('P0-2：启用 thinking 时下发 thinking.budget_tokens（clamped）', async () => {
    const body = await captureBody({
      messages: [],
      model: 'claude-3-7-sonnet',
      maxTokens: 8192,
      reasoningEffort: 'medium',
    });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
  });

  it('P0-2：启用 thinking 时抑制 temperature 与 top_p（协议冲突降级）', async () => {
    const body = await captureBody({
      messages: [],
      model: 'claude-3-7-sonnet',
      maxTokens: 8192,
      temperature: 0.8,
      topP: 0.6,
      reasoningEffort: 'low',
    });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it('未启用 thinking 时 temperature / top_p 正常下发', async () => {
    const body = await captureBody({
      messages: [],
      model: 'm',
      maxTokens: 8192,
      temperature: 0.8,
      topP: 0.6,
    });
    expect(body.thinking).toBeUndefined();
    expect(body.temperature).toBe(0.8);
    expect(body.top_p).toBe(0.6);
  });

  it('P0-2：budget clamp 后过小（<256）时放弃启用 thinking', async () => {
    const body = await captureBody({
      messages: [],
      model: 'm',
      maxTokens: 128,
      reasoningEffort: 'high',
    });
    expect(body.thinking).toBeUndefined();
    // 放弃启用后 temperature 恢复下发（不再被抑制）
    expect(body.temperature).toBeUndefined(); // 请求未给 temperature，故仍无该键
  });

  it('P0-2：high + maxTokens=2048 → budget clamp 到 2047', async () => {
    const body = await captureBody({
      messages: [],
      model: 'm',
      maxTokens: 2048,
      reasoningEffort: 'high',
    });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 2047 });
  });

  it('P0-3：presence/frequency penalty 在 Anthropic 上静默丢弃', async () => {
    const body = await captureBody({
      messages: [],
      model: 'm',
      maxTokens: 8192,
      presencePenalty: 0.5,
      frequencyPenalty: 0.5,
    });
    expect(body.presence_penalty).toBeUndefined();
    expect(body.frequency_penalty).toBeUndefined();
  });

  it('P0-3：Anthropic 不接受 0 作为"未设置"，但 0 也应被抑制写入（协议无此字段）', async () => {
    const body = await captureBody({
      messages: [],
      model: 'm',
      maxTokens: 8192,
      presencePenalty: 0,
      frequencyPenalty: 0,
    });
    expect(body.presence_penalty).toBeUndefined();
    expect(body.frequency_penalty).toBeUndefined();
  });
});

describe('AnthropicClient — P0-1 字段型思考解析', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function streamOf(events: string[]) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(makeReadableStream([toSSEStream(events)]))
    );
    return collect(makeClient().chatStream({ messages: [], model: 'claude-3-7-sonnet', maxTokens: 8192 }));
  }

  it('thinking_delta → yield thinkingDelta', async () => {
    const events = await streamOf([
      event('content_block_start', { index: 0, content_block: { type: 'thinking' } }),
      event('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: '我在思考' } }),
      event('content_block_stop', { index: 0 }),
      event('content_block_start', { index: 1, content_block: { type: 'text', text: '' } }),
      event('content_block_delta', { index: 1, delta: { type: 'text_delta', text: '答案' } }),
      event('message_stop'),
    ]);
    expect(events.some((e) => e.thinkingDelta === '我在思考')).toBe(true);
    const done = events.find((e) => e.type === 'done');
    expect(done?.fullThinking).toBe('我在思考');
    expect(done?.fullContent).toBe('答案');
  });

  it('signature_delta 被忽略（不展示、不进正文）', async () => {
    const events = await streamOf([
      event('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'abc' } }),
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '正文' } }),
      event('message_stop'),
    ]);
    expect(events.some((e) => e.thinkingDelta)).toBe(false);
    const done = events.find((e) => e.type === 'done');
    expect(done?.fullContent).toBe('正文');
    expect(done?.fullThinking).toBeUndefined();
  });

  it('无思考时 done 不带 fullThinking', async () => {
    const events = await streamOf([
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '纯正文' } }),
      event('message_stop'),
    ]);
    expect(events.find((e) => e.type === 'done')?.fullThinking).toBeUndefined();
  });
});
