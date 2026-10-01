import { ApiError, type ApiErrorKind, type ChatStream } from './types';
/**
 * LLM 调用层自动重试（MODEL-02）
 *
 * 背景：4 个 client 已能**分类**错误（auth / rate-limit / server / network …），
 * 但编排层只把错误交给 UI 让用户**手动**重试。群聊 outbox 早就有指数退避，
 * LLM 层却没有——同一类瞬时故障（限流、5xx、断连）需要用户点按钮才能恢复。
 *
 * 本模块补齐这一层，但严守一条安全边界：
 *
 *   **只在"本轮尚未产出任何内容"时重试。**
 *
 * 原因：流式响应的增量已经回调给 UI 并累加进 `fullContent`。若在已推送部分
 * 内容后重发请求，第二次响应会从头生成，导致正文重复、状态块错乱。因此
 * "已产出后失败"一律交给上层（用户手动重试 / 群聊 outbox），不在本层自动重试。
 *
 * 设计取舍：
 * - 只对**瞬时**错误重试：rate-limit / server / network；auth / invalid-url / cors /
 *   aborted 属确定性错误，重试无意义且会放大问题。
 * - `aborted` 永不重试（用户主动停止）。
 * - 退避封顶，避免长时间无反馈地挂起。
 */

/** 可自动重试的错误类型（瞬时故障）。 */
const RETRYABLE_KINDS: ReadonlySet<ApiErrorKind> = new Set(['rate-limit', 'server', 'network']);

/** 默认配置。 */
export interface RetryPolicy {
  /** 最大重试次数（不含首次尝试）。 */
  maxRetries: number;
  /** 首次退避毫秒数，之后指数增长。 */
  baseDelayMs: number;
  /** 单次退避上限毫秒数。 */
  maxDelayMs: number;
  /** 注入的休眠函数，便于测试不真实等待。 */
  sleep?: (ms: number) => Promise<void>;
  /** 重试前的观测回调。 */
  onRetry?: (info: { attempt: number; delayMs: number; kind: ApiErrorKind; message: string }) => void;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
};

/** 判断一个错误是否值得自动重试。 */
export function isRetryableError(error: unknown): boolean {
  return error instanceof ApiError && RETRYABLE_KINDS.has(error.kind);
}

/** 计算第 attempt 次重试的退避时长（attempt 从 1 开始）。 */
export function retryDelayMs(attempt: number, policy: RetryPolicy): number {
  const raw = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(policy.maxDelayMs, raw);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带自动重试地执行一次 LLM 请求。
 *
 * @param run 发起请求的函数；每次调用应是**全新**的请求（不要在内部复用已消费的流）。
 * @param hasProducedOutput 返回"本轮是否已产出内容"。
 *        - 返回 true 时**不再重试**：流已推送内容，重发会导致重复。
 *        - 典型实现：`() => roundContent.length > 0 || thinkingBuf.length > 0`。
 * @param policy 重试策略。
 */
export async function withLlmRetry<T>(
  run: () => Promise<T>,
  hasProducedOutput: () => boolean,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): Promise<T> {
  const sleep = policy.sleep ?? defaultSleep;
  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;
      const canRetry =
        attempt <= policy.maxRetries &&
        isRetryableError(error) &&
        // 安全边界：已产出内容则不重试，避免正文重复
        !hasProducedOutput();
      if (!canRetry) throw error;
      const delayMs = retryDelayMs(attempt, policy);
      const kind = (error as ApiError).kind;
      policy.onRetry?.({ attempt, delayMs, kind, message: (error as Error).message });
      await sleep(delayMs);
    }
  }
}

/**
 * 包装一个流式请求，使**连接阶段失败**可自动重试。
 *
 * 与 `withLlmRetry` 的关键区别：这里作用于 `ChatStream`。安全边界同样严格——
 * 只有"尚未 yield 过任何事件"时才会重试。一旦已经产出（哪怕一个 delta），
 * 后续错误直接抛给上层，绝不重放，避免正文重复。
 *
 * @param createStream 每次调用都必须返回**全新的**流（不能复用已消费的）。
 * @param policy 重试策略。
 */
export async function* withStreamRetry(
  createStream: () => ChatStream,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): ChatStream {
  const sleep = policy.sleep ?? defaultSleep;
  let attempt = 0;
  while (true) {
    let produced = false;
    try {
      for await (const event of createStream()) {
        produced = true;
        yield event;
      }
      return;
    } catch (error) {
      attempt += 1;
      const canRetry =
        attempt <= policy.maxRetries &&
        isRetryableError(error) &&
        // 安全边界：连接阶段（无产出）才可重试
        !produced;
      if (!canRetry) throw error;
      const delayMs = retryDelayMs(attempt, policy);
      const kind = (error as ApiError).kind;
      policy.onRetry?.({ attempt, delayMs, kind, message: (error as Error).message });
      await sleep(delayMs);
    }
  }
}
