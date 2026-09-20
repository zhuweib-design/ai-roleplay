import type { ApiClient } from './api-client';
import type { ChatRequest, ChatStream, ApiErrorKind, ChatUsage } from './types';
import { ApiError } from './types';
import {
  buildMessagesUrl,
  buildAnthropicModelsUrl,
  toAnthropicMessages,
  toAnthropicTools,
} from './anthropic-protocol';
import { toDevProxyUrl } from './openai-protocol';
import {
  toAnthropicBudget,
  resolveAnthropicThinkingMode,
} from './reasoning-capability';
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

    /**
     * P0-2 修正 B：Anthropic 思考下发按模型版本分流 adaptive / extended
     *
     * 版本边界（官方 extended thinking 文档）：
     * `thinking:{type:'enabled',budget_tokens}` 自 4.6 起 deprecated、**4.7+ 直接 400**，
     * 故新模型改发 `thinking:{type:'adaptive'}` + `output_config:{effort}`（effort 即三档，
     * 无需 budget 换算）；旧模型沿用 extended + budget。
     * 判定规则集中在 `resolveAnthropicThinkingMode()`（纯函数、可单测、易随文档调整）。
     *
     * 修正 A：此处**不再抑制** temperature / top_p。
     * 官方并未规定 thinking 与采样参数冲突；抑制的真实后果是"静默丢弃用户显式设置"
     * （调了滑块毫无效果且无提示），比服务端报错更糟。统一为与 OpenAI 侧一致的策略：
     * 只加思考参数，不动采样参数；真不兼容就让服务端报错走既有错误链路。
     */
    const maxTokens = request.maxTokens ?? AnthropicClient.DEFAULT_MAX_TOKENS;
    if (request.reasoningEffort) {
      if (resolveAnthropicThinkingMode(request.model) === 'adaptive') {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: request.reasoningEffort };
      } else {
        // 预算由 toAnthropicBudget 按 max_tokens 做 clamp；clamp 后低于官方下限
        // （1024）返回 null → 放弃启用，降级为不传，避免协议 400 打断对话。
        const budget = toAnthropicBudget(request.reasoningEffort, maxTokens);
        if (budget !== null) {
          body.thinking = { type: 'enabled', budget_tokens: budget };
        }
      }
    }

    // 采样参数：启用 thinking 时**照常下发**（修正 A，理由见上）
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    // P0-3：top_p
    if (request.topP !== undefined && request.topP !== null) {
      body.top_p = request.topP;
    }
    // P0-3：presence_penalty / frequency_penalty 为 OpenAI 兼容层专有，
    // Anthropic Messages 协议无对应字段 → 静默忽略（不写 body、不报错）。
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
    // P0-1：Anthropic 字段型思考累计值（标签型由编排层处理）
    let fullThinking = '';
    let finishReason: string | undefined;
    /**
     * P1：用量统计（message_start 的初始 usage + message_delta 的最终 usage）
     * 后到的事件覆盖同名已上报字段，未上报的字段恒为 undefined（不显示 0）。
     */
    let usage: ChatUsage | undefined;
    const mergeUsage = (raw: AnthropicUsage | undefined): void => {
      if (!raw) return;
      const next = toAnthropicChatUsage(raw);
      // 一个字段都没上报时不带 usage（保持"拿不到就不给"的语义，不产生空对象）
      if (Object.keys(next).length === 0) return;
      usage = { ...usage, ...next };
      // Anthropic 不返回 total_tokens；两个分项分别来自不同事件，故合并后再算一次
      if (usage.promptTokens !== undefined && usage.completionTokens !== undefined) {
        usage.totalTokens = usage.promptTokens + usage.completionTokens;
      }
    };
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
          } else if (parsed.kind === 'thinkingDelta' && parsed.text) {
            fullThinking += parsed.text;
            yield { type: 'delta', thinkingDelta: parsed.text };
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
              ...(fullThinking ? { fullThinking } : {}),
              ...(usage ? { usage } : {}),
              ...(toolCallAgg.size > 0 ? { toolCalls: toAnthropicToolCalls(toolCallAgg) } : {}),
            };
            return;
          } else if (parsed.kind === 'finish') {
            finishReason = parsed.finishReason;
            mergeUsage(parsed.usage);
          } else if (parsed.kind === 'usage') {
            mergeUsage(parsed.usage);
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
        ...(fullThinking ? { fullThinking } : {}),
        ...(usage ? { usage } : {}),
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

/**
 * Anthropic usage 原始形态（P1：思考 token 展示）
 *
 * 官方口径：思考消耗在 `usage.output_tokens_details.thinking_tokens`
 * （见 platform.claude.com → Extended thinking："monitor the
 * usage.output_tokens_details.thinking_tokens field in the response"）。
 * 流式下 `message_start.message.usage` 与 `message_delta.usage` 都会带 usage，
 * 后者是最终累计值。
 *
 * 缓存字段（cache_read/creation_input_tokens）**刻意不映射**：
 * 只映射其一会让上层"前缀缓存命中率"算出 100% 的假数字，宁缺。
 */
interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  output_tokens_details?: { thinking_tokens?: number };
}

/** 单个 SSE 事件解析结果 */
type ParsedAnthropicEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'thinkingDelta'; text: string }
  | { kind: 'finish'; finishReason: string; usage?: AnthropicUsage }
  | { kind: 'usage'; usage: AnthropicUsage }
  | { kind: 'stop' }
  | { kind: 'error'; message: string }
  | { kind: 'toolStart'; index: number; id: string; name: string }
  | { kind: 'toolDelta'; index: number; json: string }
  | { kind: 'other' };

/**
 * Anthropic usage → ChatUsage
 *
 * 只输出**已上报**的字段：拿不到就是 undefined（UI 不展示，绝不显示 0）。
 * Anthropic 不返回 total_tokens，由 input + output 自行相加。
 */
export function toAnthropicChatUsage(raw: AnthropicUsage | undefined): ChatUsage {
  const out: ChatUsage = {};
  if (!raw) return out;
  const input = raw.input_tokens;
  const output = raw.output_tokens;
  if (typeof input === 'number' && Number.isFinite(input)) out.promptTokens = input;
  if (typeof output === 'number' && Number.isFinite(output)) out.completionTokens = output;
  if (out.promptTokens !== undefined && out.completionTokens !== undefined) {
    out.totalTokens = out.promptTokens + out.completionTokens;
  }
  const thinking = raw.output_tokens_details?.thinking_tokens;
  if (typeof thinking === 'number' && Number.isFinite(thinking)) out.reasoningTokens = thinking;
  return out;
}

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
      delta?: {
        type?: string;
        text?: string;
        thinking?: string;
        stop_reason?: string;
        partial_json?: string;
      };
      /** P1：message_start 事件携带初始 usage（message.usage） */
      message?: { usage?: AnthropicUsage };
      /** P1：message_delta 事件携带最终 usage */
      usage?: AnthropicUsage;
      error?: { type?: string; message?: string };
    };

    switch (parsed.type) {
      // P1：message_start 的 usage（含 input_tokens；output 通常为 1，随后被 message_delta 覆盖）
      case 'message_start': {
        return parsed.message?.usage ? { kind: 'usage', usage: parsed.message.usage } : null;
      }
      case 'content_block_start': {
        const block = parsed.content_block;
        if (block?.type === 'tool_use' && block.id && block.name) {
          return { kind: 'toolStart', index: parsed.index ?? 0, id: block.id, name: block.name };
        }
        // P0-1：thinking block 开始（仅标记，思考内容由 thinking_delta 逐段送达）
        return null;
      }
      case 'content_block_delta': {
        if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
          return { kind: 'delta', text: parsed.delta.text };
        }
        // P0-1：Anthropic extended thinking 的思考增量
        if (parsed.delta?.type === 'thinking_delta' && parsed.delta.thinking) {
          return { kind: 'thinkingDelta', text: parsed.delta.thinking };
        }
        // signature_delta 不展示（signature 仅用于工具调用回传），忽略
        if (parsed.delta?.type === 'input_json_delta' && parsed.delta.partial_json) {
          return { kind: 'toolDelta', index: parsed.index ?? 0, json: parsed.delta.partial_json };
        }
        return null;
      }
      case 'message_delta': {
        // P1：message_delta 同时带 stop_reason 与最终 usage —— 一条事件两个信息都不能丢
        const stopReason = parsed.delta?.stop_reason;
        if (stopReason) {
          return {
            kind: 'finish',
            finishReason: stopReason,
            ...(parsed.usage ? { usage: parsed.usage } : {}),
          };
        }
        return parsed.usage ? { kind: 'usage', usage: parsed.usage } : null;
      }
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
