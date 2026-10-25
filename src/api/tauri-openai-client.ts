import type { ApiClient } from './api-client';
import type { ChatRequest, ChatStream } from './types';
import { ApiError } from './types';
import { buildChatCompletionsUrl, buildModelsUrl, toOpenAIMessage } from './openai-protocol';
import { usageReasoningTokens } from './openai-client';
import { t } from '@/i18n';

/**
 * P0-1/P0-2/P0-3：组装发给 Rust 端的请求参数中的采样与推理部分
 *
 * 关键约定：`undefined` / `null` 一律**不下发**该键（= 供应商默认），
 * 避免把 0 当成"未设置"。Rust 侧字段为 Option + serde(default)，缺失即不注入 body。
 */
function buildSamplingArgs(request: {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  reasoningEffort?: string;
}): Record<string, number | string> {
  const args: Record<string, number | string> = {};
  if (request.temperature !== undefined && request.temperature !== null) {
    args.temperature = request.temperature;
  }
  if (request.maxTokens !== undefined && request.maxTokens !== null) {
    args.max_tokens = request.maxTokens;
  }
  if (request.topP !== undefined && request.topP !== null) {
    args.topP = request.topP;
  }
  if (request.presencePenalty !== undefined && request.presencePenalty !== null) {
    args.presencePenalty = request.presencePenalty;
  }
  if (request.frequencyPenalty !== undefined && request.frequencyPenalty !== null) {
    args.frequencyPenalty = request.frequencyPenalty;
  }
  if (request.reasoningEffort) {
    args.reasoningEffort = request.reasoningEffort;
  }
  return args;
}

/**
 * Tauri OpenAI 兼容客户端 (Phase H4)
 *
 * 在 Tauri 桌面应用环境中使用 Rust reqwest 建立 SSE 流式连接，
 * 通过 Tauri 事件机制接收增量 token，绕过浏览器 CORS 限制。
 *
 * 与 OpenAIClient 的差异：
 * - OpenAIClient（Web）：fetch + ReadableStream，受 CORS 限制
 * - TauriOpenAIClient（Tauri）：Rust reqwest + Tauri events，原生网络栈
 *
 * 完整事件协议（见 src-tauri/src/commands/chat_stream.rs）：
 *   - { type: 'delta', delta: 'token', thinking?: '思考增量' }  // P0-1
 *   - { type: 'done', full_content: '...', full_thinking?: '...', finish_reason: 'stop' }
 *   - { type: 'error', error: '...', status?: number }
 *   - { type: 'ping' }  // 心跳
 *
 * 注：Rust 侧 ChatStreamRequest 使用 `#[serde(rename_all = "camelCase")]`，
 * 因此采样参数以 camelCase（topP / presencePenalty / ...）下发。
 */
export class TauriOpenAIClient implements ApiClient {
  readonly provider = 'openai';

  /**
   * 检测是否运行在 Tauri 环境中
   */
  static isTauriEnv(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    );
  }

  /**
   * 判断 baseUrl 是否为本地/局域网地址（P0-2：回环/私网需显式放行）
   */
  private static isLocalOrPrivateUrl(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]'
      ) {
        return true;
      }
      const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        return (
          a === 10 ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168)
        );
      }
    } catch {
      // 非法 URL 交由 Rust 端校验报错
    }
    return false;
  }

  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      extraHeaders?: Record<string, string>;
    }
  ) {}

  /**
   * 计算完整的 chat completions 端点 URL
   * 与 OpenAIClient 共享协议辅助，确保两端行为相同（迭代33）
   */
  private get endpoint(): string {
    return buildChatCompletionsUrl(this.config.baseUrl);
  }

  /**
   * 动态导入 Tauri invoke（避免在非 Tauri 环境下加载时报错）
   */
  private static async invoke<T>(
    cmd: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }

  /**
   * 动态导入 Tauri 事件 listen
   */
  private static async listen<T>(
    channel: string,
    cb: (event: { payload: T }) => void
  ): Promise<() => void> {
    const { listen } = await import('@tauri-apps/api/event');
    return listen<T>(channel, cb);
  }

  /**
   * 非流式对话：通过流式接口模拟（设 stream=true 但同步等待 done）
   *
   * Tauri 端仅实现流式接口，非流式场景在客户端等待完整响应
   */
  async chat(request: ChatRequest): Promise<string> {
    // 创建一次性事件 channel
    const channel = `chat-nonstream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let fullContent = '';
    let error: { message: string; status?: number } | null = null;

    const unlisten = await TauriOpenAIClient.listen<{
      type: string;
      delta?: string;
      full_content?: string;
      finish_reason?: string;
      error?: string;
      status?: number;
    }>(channel, (event) => {
      const payload = event.payload;
      if (payload.type === 'delta' && payload.delta) {
        fullContent += payload.delta;
      } else if (payload.type === 'done') {
        if (payload.full_content) fullContent = payload.full_content;
      } else if (payload.type === 'error') {
        error = {
          message: payload.error || t('api.unknownError'),
          status: payload.status,
        };
      }
    });

    try {
      await TauriOpenAIClient.invoke<string>('chat_stream', {
        request: {
          endpoint: this.endpoint,
          apiKey: this.config.apiKey,
          model: request.model,
          messages: request.messages.map(toOpenAIMessage),
          ...buildSamplingArgs(request),
          extraHeaders: this.config.extraHeaders,
          allowPrivate: TauriOpenAIClient.isLocalOrPrivateUrl(this.endpoint),
        },
        channel,
      });

      if (error !== null) {
        // 显式类型断言：TypeScript 控制流分析无法识别闭包内的赋值
        const e = error as { message: string; status?: number };
        throw new ApiError(e.message, e.status, this.provider);
      }

      return fullContent;
    } finally {
      unlisten();
    }
  }

  /**
   * 流式对话：通过 Tauri 事件接收增量
   */
  async *chatStream(request: ChatRequest): ChatStream {
    // abort 事件是一次性的：信号在调用之前就已经 aborted 时，挂监听器等于永远等不到
    // （本地 WebLLM 客户端 `local-api-client.ts:97` 早就挡了这一手，这里此前漏了）。
    // 此时既不订阅事件也不发请求，直接按"已停止"收尾。
    if (request.signal?.aborted) {
      yield { type: 'error', error: t('api.stopped') };
      return;
    }

    const channel = `chat-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 创建事件队列 + 通知机制（生产者-消费者模式，事件到达时唤醒消费者，替代忙轮询）
    const queue: StreamEventPayload[] = [];
    let done = false;
    let doneContent = '';
    let doneThinking = '';
    let doneFinishReason: string | undefined;
    let doneUsage: import('./types').ChatUsage | undefined;
    let streamError: { message: string; status?: number } | null = null;
    let waiter: { resolve: () => void } | null = null;
    const notify = () => {
      if (waiter) {
        waiter.resolve();
        waiter = null;
      }
    };

    const unlisten = await TauriOpenAIClient.listen<StreamEventPayload>(
      channel,
      (event) => {
        const payload = event.payload;
        queue.push(payload);
        if (payload.type === 'done') {
          done = true;
          doneContent = payload.full_content || '';
          doneThinking = payload.full_thinking || '';
          doneFinishReason = payload.finish_reason;
          if (payload.usage) {
            doneUsage = {
              promptTokens: payload.usage.prompt_tokens,
              completionTokens: payload.usage.completion_tokens,
              totalTokens: payload.usage.total_tokens,
              promptCacheHitTokens: payload.usage.prompt_cache_hit_tokens,
              promptCacheMissTokens: payload.usage.prompt_cache_miss_tokens,
              /**
               * P1：Rust 侧把 usage 整块透传（serde_json::Value），
               * 官方字段在 `completion_tokens_details.reasoning_tokens` 里，
               * 顶层 `reasoning_tokens` 只是部分网关的平铺写法 —— 两者都要读。
               */
              reasoningTokens: usageReasoningTokens(payload.usage),
            };
          }
        } else if (payload.type === 'error') {
          done = true;
          streamError = {
            message: payload.error || t('api.unknownError'),
            status: payload.status,
          };
        }
        notify();
      }
    );

    // 中止信号处理
    let aborted = false;
    if (request.signal) {
      request.signal.addEventListener('abort', () => {
        aborted = true;
        // 队列空时消费者正挂在 waiter 上，不唤醒就永远醒不过来（Rust 侧要等总超时）
        notify();
        TauriOpenAIClient.invoke<boolean>('cancel_chat_stream', {
          channel,
        }).catch(() => {
          /* 忽略取消失败的错误 */
        });
      });
    }

    try {
      // 异步触发流（不等待，通过事件接收）
      const invokePromise = TauriOpenAIClient.invoke<string>('chat_stream', {
        request: {
          endpoint: this.endpoint,
          apiKey: this.config.apiKey,
          model: request.model,
          messages: request.messages.map(toOpenAIMessage),
          ...buildSamplingArgs(request),
          extraHeaders: this.config.extraHeaders,
          allowPrivate: TauriOpenAIClient.isLocalOrPrivateUrl(this.endpoint),
        },
        channel,
      }).catch((err: unknown) => {
        // Rust 端返回 Err 时在此处捕获
        const message = err instanceof Error ? err.message : String(err);
        streamError = { message };
        done = true;
        notify();
      });

      let fullContent = '';
      // P0-1：字段型思考累计值
      let fullThinking = '';

      // 通过事件队列消费增量（事件驱动唤醒，非忙轮询）；点停止即退出，不等 Rust 下一块数据
      while ((!done || queue.length > 0) && !aborted) {
        // 队列空且未完成：挂起等待事件通知
        if (queue.length === 0 && !done) {
          await new Promise<void>((resolve) => {
            waiter = { resolve };
          });
          if (queue.length === 0 && !done) continue;
        }

        while (queue.length > 0) {
          const payload = queue.shift()!;

          if (payload.type === 'delta') {
            if (payload.delta) fullContent += payload.delta;
            if (payload.thinking) fullThinking += payload.thinking;
            // 正文与思考可能同时到达，合并为一次 delta 事件
            yield {
              type: 'delta',
              ...(payload.delta ? { delta: payload.delta } : {}),
              ...(payload.thinking ? { thinkingDelta: payload.thinking } : {}),
            };
          } else if (payload.type === 'done') {
            if (payload.full_content) fullContent = payload.full_content;
            if (payload.full_thinking) fullThinking = payload.full_thinking;
          } else if (payload.type === 'error') {
            // 已经在 listen 回调中处理
          }
          // ping 事件忽略
        }

        if (done) break;
      }

      // 中止优先：这里不能 await 一个还在等 Rust 总超时的 promise，否则"停止"要点满 300 秒
      if (aborted) {
        yield { type: 'error', error: t('api.stopped') };
        return;
      }

      // 确保 invoke promise 已完成（捕获潜在错误）
      await invokePromise;

      if (streamError) {
        // 显式类型断言：闭包（notify/listen 回调）内的赋值无法被控制流分析识别
        const e = streamError as { message: string; status?: number };
        yield {
          type: 'error',
          error: e.message,
        };
        // 不抛异常，仅通过 yield error 通知调用方
        // 调用方（ChatManager）会通过 onError 回调处理
        return;
      }

      yield {
        type: 'done',
        fullContent: doneContent || fullContent,
        finishReason: doneFinishReason,
        ...(doneThinking || fullThinking ? { fullThinking: doneThinking || fullThinking } : {}),
        ...(doneUsage ? { usage: doneUsage } : {}),
      };
    } finally {
      unlisten();
    }
  }

  /**
   * 预检：以最简请求验证 API Key
   * 通过非流式 chat 接口发送 ping 请求
   */
  async ping(): Promise<boolean> {
    try {
      await this.chat({
        messages: [{ role: 'user', content: 'ping' }],
        model: 'gpt-3.5-turbo',
        maxTokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取模型列表：通过 Rust fetch_models 命令请求 GET {baseUrl}/v1/models（第8条）
   * 与 OpenAIClient 的 baseUrl 形态处理保持一致
   */
  async listModels(): Promise<string[]> {
    const modelsUrl = buildModelsUrl(this.config.baseUrl);

    const models = await TauriOpenAIClient.invoke<string[]>('fetch_models', {
      endpoint: modelsUrl,
      apiKey: this.config.apiKey,
      extraHeaders: this.config.extraHeaders,
      allowPrivate: TauriOpenAIClient.isLocalOrPrivateUrl(modelsUrl),
    });
    return models ?? [];
  }
}

/** Tauri 端流式事件 payload 类型 */
interface StreamEventPayload {
  type: 'delta' | 'done' | 'error' | 'ping';
  delta?: string;
  /** P0-1：思考增量（Rust 侧从 delta.reasoning_content 读取） */
  thinking?: string;
  full_content?: string;
  /** P0-1：完整思考（done 事件带出） */
  full_thinking?: string;
  finish_reason?: string;
  error?: string;
  status?: number;
  /** 用量统计(DeepSeek 系含前缀缓存拆解) */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    /** P0-1：推理 token（completion_tokens_details.reasoning_tokens） */
    reasoning_tokens?: number;
  };
}

/** 将通用 ApiMessage 转为 OpenAI 协议格式 */

