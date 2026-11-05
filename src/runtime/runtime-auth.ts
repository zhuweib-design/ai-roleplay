/** Runtime HTTP 请求经过认证后得到的最小可信身份。 */
export interface RuntimePrincipal {
  subject: string;
  tenantId: string;
  scopes?: readonly string[];
}

export type RuntimeAuthenticator = (
  request: Request
) => RuntimePrincipal | null | Promise<RuntimePrincipal | null>;

export interface RuntimeAuthorizationContext {
  path: string;
  method: string;
  body?: unknown;
  query: URLSearchParams;
}

/** 成员授权由宿主服务注入，避免 Runtime 核心绑定具体账户系统。 */
export type RuntimeAuthorizer = (
  request: Request,
  principal: RuntimePrincipal,
  context: RuntimeAuthorizationContext
) => boolean | Promise<boolean>;

export interface RuntimeAuthOptions {
  /** 服务端注入的认证解析器；解析失败时应返回 null。 */
  authenticate?: RuntimeAuthenticator;
  /** 已由网关解析出的 principal，适合 Tauri command 和测试。 */
  principal?: RuntimePrincipal;
  /** 开启后，除公开健康检查外的请求必须有可信 principal。 */
  requireAuthentication?: boolean;
  /**
   * 仅用于受信任的本地部署或测试：允许没有 principal 的请求继续，
   * 并在显式传入 tenantId 时合成 legacy 租户绑定。默认关闭（fail-closed）。
   */
  allowAnonymous?: boolean;
  /** 可选的成员/资源授权器；返回 false 时拒绝请求。 */
  authorize?: RuntimeAuthorizer;
}

export interface RuntimeTenantBindingOptions extends RuntimeAuthOptions {
  /** 兼容已绑定租户的服务端组合入口；认证 principal 优先。 */
  tenantId?: string;
}

function validPrincipal(value: RuntimePrincipal | null | undefined): value is RuntimePrincipal {
  return Boolean(
    value &&
    typeof value.subject === 'string' && value.subject.trim() &&
    typeof value.tenantId === 'string' && value.tenantId.trim()
  );
}

/** 统一解析认证身份，不记录或回传凭据内容。 */
export async function resolveRuntimePrincipal(
  request: Request,
  options: RuntimeTenantBindingOptions
): Promise<RuntimePrincipal | null> {
  try {
    const candidate = options.authenticate
      ? await options.authenticate(request)
      : options.principal ?? (options.allowAnonymous && options.tenantId
        ? { subject: 'legacy-tenant-binding', tenantId: options.tenantId }
        : null);
    return validPrincipal(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function runtimeAuthenticationResponse(code = 'AUTHENTICATION_REQUIRED'): Response {
  return new Response(JSON.stringify({
    error: code,
    message: code === 'AUTHENTICATION_REQUIRED' ? 'Runtime 请求需要认证' : 'Runtime 认证失败',
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function runtimeAuthorizationResponse(code = 'TENANT_FORBIDDEN'): Response {
  return new Response(JSON.stringify({
    error: code,
    message: code === 'TENANT_FORBIDDEN' ? 'Runtime 资源不属于当前租户' : 'Runtime 请求未通过授权',
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function authorizeRuntimeRequest(
  request: Request,
  principal: RuntimePrincipal | null,
  options: RuntimeAuthOptions,
  context: RuntimeAuthorizationContext
): Promise<boolean> {
  if (!principal || !options.authorize) return true;
  try {
    return await options.authorize(request, principal, context);
  } catch {
    return false;
  }
}
