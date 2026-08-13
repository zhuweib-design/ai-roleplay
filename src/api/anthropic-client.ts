import type { ApiClient } from './api-client';
import type { ChatRequest, ChatStream, ApiErrorKind } from './types';
import { ApiError } from './types';
import {
  buildMessagesUrl,
  buildAnthropicModelsUrl,
  toAnthropicMessages,
  toAnthropicTools,
} from './anthropic-protocol';
import { toDevProxyUrl } from './openai-protocol';
import { t } from '@/i18n';

/**
 * Anthropic Messages API 客户端 (T-01)
 *
 * 官方端点:https://api.anthropic.com/v1/messages
 * 认证:x-api-key 头 + anthropic-version 头(非 Bearer)
 * 流式:SSE,事件含 message_start / content_block_delta / message_delta / message_stop
 *
 * 浏览器直连(Anthropic 官方 API 支持 CORS),Web 与 Tauri 环境通用。
 * 本地/内网兼容端点(如代理)在 Vite dev 下走 /llm-proxy 绕过 CORS。
 */
export class AnthropicClient implements ApiClient {
  readonly provider = 'anthropic';

  private static readonly API_VERSION = '2023-06-01';
  /** max_tokens 为协议必填字段,请求未指定时的兜底值 */
  private static readonly DEFAULT_MAX_TOKENS = 4096;

  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
    }
  ) {}

  private get endpoint(): string {
    return toDevProxyUrl(buildMessagesUrl(this.config.baseUrl));
  }

  private buildHeaders(stream: boolean): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': AnthropicClient.API_VERSION,
      ...(stream ? { Accept: 'text/event-stream' } : {}),
    };
  }

  private buildBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
    const { system, messages } = toAnthropicMessages(request.messages);
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? AnthropicClient.DEFAULT_MAX_TOKENS,
      messages,
      stream,
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    // T-02：工具调用定义（Anthropic 格式转换）
    if (request.tools && request.tools.length > 0) {
      body.tools = toAnthropicTools(request.tools);
    }
    return body;
  }

  /**
   * 非流式对话
   * 响应:data.content[0].text
   */
  async chat(request: ChatRequest): Promise<string> {
    const res = await this.fetchWithDiagnostics(this.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(false),
      body: JSON.stringify(this.buildBody(request, false)),
      signal: request.signal,
    });

    if (!res.ok) {
      throw await this.toApiError(res);
    }

    const data = await res.json();
    const blocks = data?.content;
    if (!Array.isArray(blocks)) {
      throw new ApiError(
        t('api.respMissingContent'),
        res.status,
        this.provider,
        'unknown'
      );
    }
    // T-02：文本 block 拼接返回；tool_use block 存在时（工具调用响应）
    // 可能无文本，返回空串。完整工具调用处理走 chatStream（done 携带 toolCalls）
    const text = blocks
      .filter((b: { type?: string; text?: string }) => b?.type === 'text')
      .map((b: { text?: string }) => b.text ?? '')
      .join('');
    const hasToolUse = blocks.some(
      (b: { type?: string }) => b?.type === 'tool_use'
    );
    if (!text && !hasToolUse) {
      throw new ApiError(
        t('api.respMissingBlock'),
        res.status,
        this.provider,
        'unknown'
      );
    }
    return text;
  }

  /**
   * 流式对话(SSE)
   * 事件:message_start → content_block_delta(text_delta) → message_delta(stop_reason) → message_stop
   */
  async *chatStream(request: ChatRequest): ChatStream {
    const body = this.buildBody(request, true);
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.buildHeaders(true),
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (err) {
      // 用户中止或网络错误（DOMException 在部分环境不满足 instanceof Error，按 name 判断）
      if (err instanceof Error && err.name === 'AbortError') {
        yield { type: 'error', error: t('api.stopped') };
        return;
      }
      if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError') {
        yield { type: 'error', error: t('api.stopped') };
        return;
      }
      throw this.classifyFetchError(err);
    }

    if (!res.ok) {
      throw await this.toApiError(res);
    }
    if (!res.body) {
      throw new ApiError(t('api.respMissingBody'), res.status, this.provider, 'server');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullContent = '';
    let finishReason: string | undefined;
    // T-02：tool_use block 增量聚合（按 index，input_json 逐段拼接）
    const toolCallAgg = new Map<number, { id: string; name: string; args: string }>();

    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          const isAbort =
            (err instanceof Error && err.name === 'AbortError') ||
            (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError');
          if (isAbort) {
            yield { type: 'error', error: t('api.stopped') };
            return;
          }
          throw err;
        }

        if (chunk.done) break;

        buffer += decoder.decode(chunk.value, { stream: true });

        let eventEnd: number;
        while ((eventEnd = buffer.indexOf('\n\n')) >= 0) {
          const rawEvent = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          const parsed = parseAnthropicSSEEvent(rawEvent);
          if (!parsed) continue;

          if (parsed.kind === 'delta' && parsed.text) {
            fullContent += parsed.text;
            yield { type: 'delta', delta: parsed.text };
          } else if (parsed.kind === 'toolStart') {
            const agg = toolCallAgg.get(parsed.index) ?? { id: '', name: '', args: '' };
            agg.id = parsed.id;
            agg.name = parsed.name;
            toolCallAgg.set(parsed.index, agg);
          } else if (parsed.kind === 'toolDelta') {
            const agg = toolCallAgg.get(parsed.index) ?? { id: '', name: '', args: '' };
            agg.args += parsed.json;
            toolCallAgg.set(parsed.index, agg);
          } else if (parsed.kind === 'stop') {
            yield {
              type: 'done',
              fullContent,
              finishReason,
              ...(toolCallAgg.size > 0 ? { toolCalls: toAnthropicToolCalls(toolCallAgg) } : {}),
            };
            return;
          } else if (parsed.kind === 'finish') {
            finishReason = parsed.finishReason;
          } else if (parsed.kind === 'error') {
            yield { type: 'error', error: parsed.message };
            return;
          }
        }
      }

      // 流自然结束(未收到 message_stop)
      yield {
        type: 'done',
        fullContent,
        finishReason,
        ...(toolCallAgg.size > 0 ? { toolCalls: toAnthropicToolCalls(toolCallAgg) } : {}),
      };
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }
  }

  /**
   * 预检:最小请求验证 API Key(Anthropic 会返回 400 而非 200,
   * 因此以"非 401/403/429"视为通过)
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.buildHeaders(false),
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      return res.status !== 401 && res.status !== 403 && res.status !== 429;
    } catch {
      return false;
    }
  }

  /** 获取模型列表:GET {baseUrl}/v1/models */
  async listModels(): Promise<string[]> {
    const modelsUrl = toDevProxyUrl(buildAnthropicModelsUrl(this.config.baseUrl));
    const res = await this.fetchWithDiagnostics(modelsUrl, {
      method: 'GET',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': AnthropicClient.API_VERSION,
      },
    });
    if (!res.ok) throw await this.toApiError(res);

    const data = await res.json();
    const list = data?.data;
    if (!Array.isArray(list)) {
      throw new ApiError(
        '响应格式错误：缺少 data 数组（该服务可能不支持 /models 接口，请手动输入模型名）',
        res.status,
        this.provider,
        'unknown'
      );
    }
    return list
      .map((m: { id?: unknown }) => (typeof m?.id === 'string' ? m.id : ''))
      .filter((id: string) => id.length > 0);
  }

  // ── 内部工具 ──

  private async fetchWithDiagnostics(
    input: string,
    init: RequestInit
  ): Promise<Response> {
    try {
      return await fetch(input, init);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(t('api.stopped'), undefined, this.provider, 'aborted');
      }
      throw this.classifyFetchError(err);
    }
  }

  private classifyFetchError(err: unknown): ApiError {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const lower = rawMsg.toLowerCase();

    if (/failed to construct|invalid url|malformed|illegal/i.test(rawMsg)) {
      return new ApiError(
        `URL 格式错误：${rawMsg}（请检查 baseUrl 是否以 http:// 或 https:// 开头）`,
        undefined,
        this.provider,
        'invalid-url'
      );
    }
    if (
      err instanceof TypeError &&
      /failed to fetch|network request failed|load failed/i.test(rawMsg)
    ) {
      return new ApiError(
        t('api.networkFailed', { msg: rawMsg }),
        undefined,
        this.provider,
        'network'
      );
    }
    if (/timeout|timed out|aborted/i.test(lower)) {
      return new ApiError(t('api.timeout', { msg: rawMsg }), undefined, this.provider, 'network');
    }
    return new ApiError(t('api.networkFailed2', { msg: rawMsg }), undefined, this.provider, 'unknown');
  }

  private async toApiError(res: Response): Promise<ApiError> {
    let detail = '';
    try {
      const data = await res.json();
      // Anthropic 错误体: { error: { type, message } }
      detail = data?.error?.message || data?.error?.type || data?.message || JSON.stringify(data);
    } catch {
      detail = await res.text().catch(() => '');
    }
    return new ApiError(
      `API 错误 ${res.status}: ${detail || res.statusText}`,
      res.status,
      this.provider,
      statusToKind(res.status)
    );
  }
}

/** 将 HTTP 状态码映射为 ApiErrorKind */
function statusToKind(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status >= 500 && status < 600) return 'server';
  return 'unknown';
}

/** 单个 SSE 事件解析结果 */
type ParsedAnthropicEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'finish'; finishReason: string }
  | { kind: 'stop' }
  | { kind: 'error'; message: string }
  | { kind: 'toolStart'; index: number; id: string; name: string }
  | { kind: 'toolDelta'; index: number; json: string }
  | { kind: 'other' };

/**
 * 解析 Anthropic SSE 事件块(按 data: 行解析,type 字段区分事件)
 * 事件类型:
 * - message_start / content_block_stop → 忽略
 * - content_block_start: { content_block: { type: 'tool_use', id, name } }
 * - content_block_delta: { delta: { type: 'text_delta', text } | { type: 'input_json_delta', partial_json } }
 * - message_delta: { delta: { stop_reason } }
 * - message_stop: 流结束
 * - error: { error: { type, message } }
 * - ping: 心跳,忽略
 */
function parseAnthropicSSEEvent(raw: string): ParsedAnthropicEvent | null {
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // 注释
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join('\n');

  try {
    const parsed = JSON.parse(data) as {
      type?: string;
      index?: number;
      content_block?: { type?: string; id?: string; name?: string };
      delta?: { type?: string; text?: string; stop_reason?: string; partial_json?: string };
      error?: { type?: string; message?: string };
    };

    switch (parsed.type) {
      case 'content_block_start': {
        const block = parsed.content_block;
        if (block?.type === 'tool_use' && block.id && block.name) {
          return { kind: 'toolStart', index: parsed.index ?? 0, id: block.id, name: block.name };
        }
        return null;
      }
      case 'content_block_delta': {
        if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
          return { kind: 'delta', text: parsed.delta.text };
        }
        if (parsed.delta?.type === 'input_json_delta' && parsed.delta.partial_json) {
          return { kind: 'toolDelta', index: parsed.index ?? 0, json: parsed.delta.partial_json };
        }
        return null;
      }
      case 'message_delta':
        return parsed.delta?.stop_reason
          ? { kind: 'finish', finishReason: parsed.delta.stop_reason }
          : null;
      case 'message_stop':
        return { kind: 'stop' };
      case 'error':
        return { kind: 'error', message: parsed.error?.message || t('api.unknownError') };
      default:
        return { kind: 'other' }; // message_start / ping / content_block_stop 忽略
    }
  } catch {
    return null;
  }
}

/** T-02：将 tool_use 聚合结果转为 ToolCall[]（按 index 升序） */
function toAnthropicToolCalls(
  agg: Map<number, { id: string; name: string; args: string }>
): import('./types').ToolCall[] {
  return [...agg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      id: v.id,
      type: 'function' as const,
      function: { name: v.name, arguments: v.args },
    }));
}
