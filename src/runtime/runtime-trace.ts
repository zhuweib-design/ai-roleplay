/**
 * Runtime 请求关联 ID（correlation / trace id）
 *
 * 目标（对应代码审查 OBS-01「全仓缺少 correlation/trace ID」项）：
 * - 每个 Runtime 请求都有稳定的关联 ID，可把「客户端 → HTTP → 服务端 → outbox」
 *   串成同一次调用，便于排障时按一个 ID 捞出全部相关记录
 * - 客户端在请求头注入；服务端解析后在响应头回显；缺失或非法时服务端自行生成兜底
 * - 该 ID 不含任何用户数据或凭据，可安全落日志与回传前端
 *
 * 设计取舍：
 * - 零依赖，且不使用 import.meta.env，保证 runtime 层仍可在 Node 服务端复用
 * - 不直接写 console：服务端日志由宿主通过 onTrace 回调接管，避免绑定具体日志实现
 */

/** 关联 ID 使用的请求/响应头名。全链路统一，客户端与服务端共用同一常量。 */
export const RUNTIME_TRACE_HEADER = 'x-runtime-request-id';

/**
 * 允许出现在关联 ID 中的字符集与长度。
 * 收紧白名单是为了避免日志注入（换行/控制字符）与响应头污染。
 */
const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** 生成一个新的关联 ID；优先使用 crypto.randomUUID，环境不支持时退化为时间戳 + 随机串。 */
export function createTraceId(): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof globalCrypto?.randomUUID === 'function') return globalCrypto.randomUUID();
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 校验并归一化外部传入的关联 ID；非法值返回 null，交由调用方决定兜底策略。 */
export function normalizeTraceId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return TRACE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** 从请求头解析关联 ID；缺失或非法时生成新的，保证服务端永远有一个可用 ID。 */
export function resolveTraceId(request: Request): string {
  return normalizeTraceId(request.headers.get(RUNTIME_TRACE_HEADER)) ?? createTraceId();
}

/** 单次请求的关联观测事件；宿主据此落日志或指标。 */
export interface RuntimeTraceEvent {
  /** 本次调用的关联 ID。 */
  traceId: string;
  method: string;
  path: string;
  /** HTTP 状态码。 */
  status: number;
  /** 端到端处理耗时（毫秒）。 */
  durationMs: number;
}

/** 关联事件回调；返回值为空，实现方自行决定同步或异步落盘。 */
export type RuntimeTraceSink = (event: RuntimeTraceEvent) => void;
