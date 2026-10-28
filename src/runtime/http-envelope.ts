import {
  resolveRuntimePrincipal,
  runtimeAuthenticationResponse,
  runtimeAuthorizationResponse,
  type RuntimePrincipal,
  type RuntimeTenantBindingOptions,
} from './runtime-auth';
import {
  RUNTIME_TRACE_HEADER,
  normalizeTraceId,
  resolveTraceId,
  type RuntimeTraceSink,
} from './runtime-trace';

/**
 * Runtime HTTP 的公共外壳（后端优化计划 B1）
 *
 * 单聊与群聊两个 handler 此前各写了一份：关联 ID 的解析/回显/上报、
 * principal → 401 → 租户不匹配 403 的判定链、JSON 响应构造；两个客户端
 * 又各写了一份：请求头注入、traceId 回读、错误映射。字段同名同序的重复
 * 意味着改一处忘一处（2B 评审就是按"两边不同步"记的条目）。
 *
 * 这里只收"外壳"，不收判定顺序：单聊仍是 方法 → 认证 → 租户 → 授权 → 领域，
 * 群聊仍是 认证 → 租户 → 授权 → 路由 → 领域。顺序是各自的行为契约，
 * 有测试钉着，抽公共函数不该顺手改它。
 */

/** 两个 handler 共用的签名；放在这里是为了让客户端文件不必为了一个类型转导出 handler */
export type RuntimeHttpHandler = (request: Request) => Promise<Response>;

export class RuntimeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    /** 本次失败请求的关联 ID，便于用同一 ID 捞取服务端日志。 */
    public readonly traceId?: string
  ) {
    super(message);
    this.name = 'RuntimeApiError';
  }
}

export type RuntimeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** 去掉 baseUrl 尾部的 `/`，避免拼出 `//v1/...` */
export function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path;
}

export function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false;
}

/** JSON 响应；关联 ID 的头由 `withRuntimeTrace` 统一补，这里不管。 */
export function runtimeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export type RuntimeAccess =
  | {
      granted: true;
      principal: RuntimePrincipal | null;
      /** principal 优先，其次宿主配置绑定的租户；两者都没有时不出现该键 */
      tenantId?: string;
    }
  | { granted: false; response: Response };

/**
 * 认证与租户判定链。
 *
 * `publicPaths` 是给健康检查留的口子：它不带凭据也必须能通。调用方决定传什么，
 * 这一层不猜"哪个路径算公开"。
 */
export async function resolveRuntimeAccess(
  request: Request,
  options: RuntimeTenantBindingOptions,
  pathname: string,
  publicPaths: readonly string[] = []
): Promise<RuntimeAccess> {
  const principal = await resolveRuntimePrincipal(request, options);
  if (!principal && !options.allowAnonymous && !publicPaths.includes(pathname)) {
    return { granted: false, response: runtimeAuthenticationResponse() };
  }
  if (principal && options.tenantId && principal.tenantId !== options.tenantId) {
    return { granted: false, response: runtimeAuthorizationResponse() };
  }
  const tenantId = principal?.tenantId ?? options.tenantId;
  return tenantId ? { granted: true, principal, tenantId } : { granted: true, principal };
}

/**
 * 关联 ID 的外壳：解析（或生成）→ 交给业务处理 → 回显响应头 → 上报一次事件。
 *
 * 业务处理函数抛错时**不**上报也不回显——这与抽取前的行为一致（原来也没有 try/catch），
 * 保持"抛出去就是宿主的错"这一语义，不在重构里顺手改成兜底 500。
 */
export function withRuntimeTrace(
  handle: (request: Request, traceId: string) => Promise<Response>,
  onTrace?: RuntimeTraceSink
): RuntimeHttpHandler {
  return async (request) => {
    const startedAt = Date.now();
    const traceId = resolveTraceId(request);
    const response = await handle(request, traceId);
    response.headers.set(RUNTIME_TRACE_HEADER, traceId);
    onTrace?.({
      traceId,
      method: request.method.toUpperCase(),
      path: new URL(request.url).pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  };
}

/**
 * 客户端一次请求的外壳：注入关联 ID → 发 → 回读服务端回显的 ID → 非 2xx 抛
 * `RuntimeApiError`（带上错误码、消息、issues 与 traceId）。
 *
 * URL 由调用方拼好传进来：两个客户端的拼法目前不同（单聊走 `joinUrl`，群聊是直接
 * 相加），这属于各自的行为，不在抽取里统一——要统一得先确认没有宿主依赖尾部斜杠。
 */
export async function sendRuntimeRequest<T>(input: {
  fetcher: RuntimeFetch;
  url: string;
  method: string;
  baseHeaders: HeadersInit;
  generateTraceId: () => string;
  body?: unknown;
  /** 服务端没给 error/message 时的兜底文案（两家的默认值不同，保持各自原值） */
  fallbackCode: string;
  fallbackMessage: string;
}): Promise<T> {
  const headers = new Headers(input.baseHeaders);
  headers.set('Accept', 'application/json');
  if (input.body !== undefined) headers.set('Content-Type', 'application/json');
  // 每个请求注入关联 ID；服务端会原样回显，失败时一并带在错误上。
  headers.set(RUNTIME_TRACE_HEADER, input.generateTraceId());
  const response = await input.fetcher(input.url, {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const payload = isJsonResponse(response) ? await response.json() : await response.text();
  // 以服务端回显为准（服务端可能生成了兜底 ID），否则退回客户端注入值。
  const traceId = normalizeTraceId(response.headers.get(RUNTIME_TRACE_HEADER))
    ?? normalizeTraceId(headers.get(RUNTIME_TRACE_HEADER))
    ?? undefined;
  if (!response.ok) {
    const details = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    throw new RuntimeApiError(
      response.status,
      typeof details.error === 'string' ? details.error : input.fallbackCode,
      typeof details.message === 'string' ? details.message : input.fallbackMessage,
      details.issues,
      traceId
    );
  }
  return payload as T;
}
