import type { ApiClient } from './api-client';
import type { ChatRequest, ChatStream, ApiErrorKind } from './types';
import { ApiError } from './types';
import { buildChatCompletionsUrl, buildModelsUrl, toOpenAIMessage, toDevProxyUrl } from './openai-protocol';
import { t } from '@/i18n';

/**
 * OpenAI Chat Completions 兼容客户端 (F02.1)
 *
 * 兼容协议：
 * - 官方 OpenAI: https://api.openai.com/v1
 * - Azure OpenAI: https://{resource}.openai.azure.com/openai/deployments/{deployment}
 * - 第三方兼容（DeepSeek / Moonshot / Together / OpenRouter / Ollama 等）
 *
 * 流式响应格式遵循 SSE 规范：
 * - 每行以 `data: ` 开头
 * - 事件间以 `\n\n` 分隔
 * - `data: [DONE]` 标记流结束
 * - chunk.choices[0].delta.content 包含增量 token
 */
export class OpenAIClient implements ApiClient {
  readonly provider = 'openai';

  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      /** 可选：自定义 headers（如 Azure 的 api-key） */
      extraHeaders?: Record<string, string>;
    }
  ) {}

  private get endpoint(): string {
    return toDevProxyUrl(buildChatCompletionsUrl(this.config.baseUrl));
  }

  private buildHeaders(stream: boolean): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      ...(stream ? { Accept: 'text/event-stream' } : {}),
      ...this.config.extraHeaders,
    };
  }

  /**
   * 非流式对话
   */
  async chat(request: ChatRequest): Promise<string> {
    const body = this.buildBody(request, false);
    const res = await this.fetchWithDiagnostics(this.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(false),
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!res.ok) {
      throw await this.toApiError(res);
    }

    const data = await res.json();
    const message = data?.choices?.[0]?.message;
    const content = message?.content;
    if (typeof content !== 'string' && !message?.tool_calls) {
      throw new ApiError(
        t('api.respMissingChoices'),
        res.status,
        this.provider,
        'unknown'
      );
    }
    // T-02：工具调用响应可能无文本内容（content 为 null），返回空串；
    // 工具调用的完整处理走 chatStream（done 事件携带 toolCalls）
    return typeof content === 'string' ? content : '';
  }

  /**
   * 流式对话
   * 使用 async generator，每个 delta 事件 yield 一次
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
      // 用户中止或网络错误
      if (err instanceof Error && err.name === 'AbortError') {
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
    // T-02：流式 tool_calls 增量聚合（按 index，arguments 逐段拼接）
    const toolCallAgg = new Map<
      number,
      { id: string; name: string; args: string }
    >();
    // 用量统计(通常出现在流式最后一个 chunk)
    let usage: import('./types').ChatUsage | undefined;

    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            yield { type: 'error', error: t('api.stopped') };
            return;
          }
          throw err;
        }

        if (chunk.done) {
          break;
        }

        buffer += decoder.decode(chunk.value, { stream: true });

        // 按事件边界（\n\n）切分
        let eventEnd: number;
        while ((eventEnd = buffer.indexOf('\n\n')) >= 0) {
          const rawEvent = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          const event = parseSSEEvent(rawEvent);
          if (!event) continue;

          if (event.done) {
            yield {
              type: 'done',
              fullContent,
              finishReason,
              ...(usage ? { usage } : {}),
              ...(toolCallAgg.size > 0 ? { toolCalls: toOpenAIToolCalls(toolCallAgg) } : {}),
            };
            return;
          }

          if (event.delta !== undefined) {
            fullContent += event.delta;
            yield { type: 'delta', delta: event.delta };
          }

          // T-02：聚合流式 tool_calls 增量
          if (event.toolCalls) {
            for (const tc of event.toolCalls) {
              const agg = toolCallAgg.get(tc.index) ?? { id: '', name: '', args: '' };
              if (tc.id) agg.id = tc.id;
              if (tc.function?.name) agg.name = tc.function.name;
              if (tc.function?.arguments) agg.args += tc.function.arguments;
              toolCallAgg.set(tc.index, agg);
            }
          }

          // 用量统计(末 chunk;含前缀缓存拆解)
          if (event.usage) {
            usage = {
              promptTokens: event.usage.prompt_tokens,
              completionTokens: event.usage.completion_tokens,
              totalTokens: event.usage.total_tokens,
              promptCacheHitTokens: event.usage.prompt_cache_hit_tokens,
              promptCacheMissTokens: event.usage.prompt_cache_miss_tokens,
            };
          }

          if (event.finishReason) {
            finishReason = event.finishReason;
          }
        }
      }

      // 流自然结束（未显式 [DONE]）
      yield {
        type: 'done',
        fullContent,
        finishReason,
        ...(usage ? { usage } : {}),
        ...(toolCallAgg.size > 0 ? { toolCalls: toOpenAIToolCalls(toolCallAgg) } : {}),
      };
    } finally {
      // 释放 reader（若已 abort 也会触发）
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }
  }

  /**
   * 预检：以最简请求验证 API Key
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.buildHeaders(false),
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取模型列表：GET {baseUrl}/v1/models（第8条）
   * 支持 baseUrl 三种形态：裸域名 / 已含 /v1 / 已含完整 chat/completions
   */
  async listModels(): Promise<string[]> {
    const modelsUrl = toDevProxyUrl(buildModelsUrl(this.config.baseUrl));

    const res = await this.fetchWithDiagnostics(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.extraHeaders,
      },
    });
    if (!res.ok) throw await this.toApiError(res);

    const data = await res.json();
    const list = data?.data;
    if (!Array.isArray(list)) {
      throw new ApiError(
        t('api.respMissingData'),
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

  /**
   * 带错误诊断的 fetch 封装
   * 用于非流式请求（chat / ping），将网络层错误转为分类的 ApiError
   */
  private async fetchWithDiagnostics(
    input: string,
    init: RequestInit
  ): Promise<Response> {
    try {
      return await fetch(input, init);
    } catch (err) {
      // 用户中止
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(t('api.stopped'), undefined, this.provider, 'aborted');
      }
      throw this.classifyFetchError(err);
    }
  }

  /**
   * 将 fetch 抛出的原始错误分类为带 kind 的 ApiError
   *
   * 浏览器在以下场景会抛出 TypeError("Failed to fetch")：
   * 1. 网络断开 / DNS 解析失败 / 连接超时
   * 2. CORS 预检失败（OPTIONS 请求被拒）
   * 3. HTTPS 证书无效（混合内容拦截等）
   * 4. URL 格式错误（如缺少协议头）
   */
  private classifyFetchError(err: unknown): ApiError {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const lower = rawMsg.toLowerCase();

    // URL 格式错误（如缺少 https://、含空格未编码等）
    if (/failed to construct|invalid url|malformed|illegal/i.test(rawMsg)) {
      return new ApiError(
        t('api.urlInvalid', { msg: rawMsg }),
        undefined,
        this.provider,
        'invalid-url'
      );
    }

    // 网络层错误（含浏览器典型的 "Failed to fetch" / Safari 的 "Load failed"）
    if (
      err instanceof TypeError &&
      /failed to fetch|network request failed|load failed/i.test(rawMsg)
    ) {
      // 进一步细分：若 baseUrl 是跨域且未配置 CORS，多半是 CORS 问题
      // 但 TypeError 信息无法直接区分，这里按"网络或 CORS"统一返回 network kind
      return new ApiError(
        t('api.networkFailed', { msg: rawMsg }),
        undefined,
        this.provider,
        'network'
      );
    }

    // 超时
    if (/timeout|timed out|aborted/i.test(lower)) {
      return new ApiError(
        t('api.timeout', { msg: rawMsg }),
        undefined,
        this.provider,
        'network'
      );
    }

    // 兜底
    return new ApiError(
      t('api.networkFailed2', { msg: rawMsg }),
      undefined,
      this.provider,
      'unknown'
    );
  }

  private buildBody(
    request: ChatRequest,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(toOpenAIMessage),
      stream,
    };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      // OpenAI 字段为 max_tokens（v1）或 max_completion_tokens（v2 较新模型）
      body.max_tokens = request.maxTokens;
    }
    // T-02：工具调用定义透传
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }
    return body;
  }

  private async toApiError(res: Response): Promise<ApiError> {
    let detail = '';
    try {
      const data = await res.json();
      detail = data?.error?.message || data?.error || data?.message || JSON.stringify(data);
    } catch {
      detail = await res.text().catch(() => '');
    }
    return new ApiError(
      t('api.httpError', { status: res.status, detail: detail || res.statusText }),
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

/** 将通用 ApiMessage 转为 OpenAI 协议格式 */
/** 将 SSE 单事件解析结果 */
interface SSEParsed {
  delta?: string;
  finishReason?: string;
  done?: boolean;
  /** T-02：流式 tool_calls 增量（按 index 分段） */
  toolCalls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
  /** 用量统计(OpenAI 兼容:流式末 chunk 携带 usage) */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

/**
 * 解析单个 SSE 事件块
 * 支持标准格式：
 *   data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}
 *   data: [DONE]
 *
 * 同时容错处理：
 * - 多行 data 字段拼接
 * - 注释行（: heartbeat）
 * - 非标准 event/字段（忽略）
 */
function parseSSEEvent(raw: string): SSEParsed | null {
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // 注释
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
    // 忽略 event: / id: / retry: 等其它字段
  }

  if (dataLines.length === 0) return null;
  const data = dataLines.join('\n');

  if (data === '[DONE]') {
    return { done: true };
  }

  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          role?: string;
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string | null;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
      };
      error?: { message?: string };
    };

    if (parsed.error) {
      // 服务商在流中返回错误
      return { delta: '', finishReason: 'error' };
    }

    const usage = parsed.usage
      ? {
          ...(parsed.usage.prompt_tokens !== undefined
            ? { prompt_tokens: parsed.usage.prompt_tokens }
            : {}),
          ...(parsed.usage.completion_tokens !== undefined
            ? { completion_tokens: parsed.usage.completion_tokens }
            : {}),
          ...(parsed.usage.total_tokens !== undefined
            ? { total_tokens: parsed.usage.total_tokens }
            : {}),
          ...(parsed.usage.prompt_cache_hit_tokens !== undefined
            ? { prompt_cache_hit_tokens: parsed.usage.prompt_cache_hit_tokens }
            : {}),
          ...(parsed.usage.prompt_cache_miss_tokens !== undefined
            ? { prompt_cache_miss_tokens: parsed.usage.prompt_cache_miss_tokens }
            : {}),
        }
      : undefined;

    const choice = parsed.choices?.[0];
    // usage chunk(choices 为空数组):仅携带用量统计
    if (!choice) {
      if (usage) {
        return {
          delta: undefined,
          finishReason: undefined,
          ...(usage ? { usage } : {}),
        };
      }
      return null;
    }

    // 空字符串 content（如 OpenAI 首个 chunk 的角色宣告）不应作为 delta yield
    const deltaContent = choice.delta?.content;
    const toolCalls = choice.delta?.tool_calls
      ?.filter((tc) => tc.index !== undefined)
      .map((tc) => ({
        index: tc.index as number,
        ...(tc.id !== undefined ? { id: tc.id } : {}),
        ...(tc.function ? { function: tc.function } : {}),
      }));

    return {
      delta: deltaContent ? deltaContent : undefined,
      finishReason: choice.finish_reason ?? undefined,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      ...(usage ? { usage } : {}),
    };
  } catch {
    // 非 JSON，忽略（可能是心跳或注释）
    return null;
  }
}

/** T-02：将流式聚合结果转为 ToolCall[]（按 index 升序） */
function toOpenAIToolCalls(
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

// 使用 lib.dom.d.ts 中已定义的 ReadableStreamReadResult<T> 类型
// 无需自定义别名
