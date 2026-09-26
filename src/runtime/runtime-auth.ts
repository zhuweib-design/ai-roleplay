/** Runtime HTTP 请求经过认证后得到的最小可信身份。 */
export interface RuntimePrincipal {
  subject: string;
  tenantId: string;
  scopes?: readonly string[];
}

export type RuntimeAuthenticator = (
  request: Request
) => RuntimePrincipal | null | Promise<RuntimePrincipal | null>;

export interface RuntimeAuthOptions {
  /** 服务端注入的认证解析器；解析失败时应返回 null。 */
  authenticate?: RuntimeAuthenticator;
  /** 已由网关解析出的 principal，适合 Tauri command 和测试。 */
  principal?: RuntimePrincipal;
  /** 开启后，除公开健康检查外的请求必须有可信 principal。 */
  requireAuthentication?: boolean;
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
      : options.principal ?? (!options.requireAuthentication && options.tenantId
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
