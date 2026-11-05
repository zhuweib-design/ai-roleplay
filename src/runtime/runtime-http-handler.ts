import type { RuntimeApi, RuntimeRoute } from './runtime-api';
import { handleRuntimeRequest } from './runtime-api';
import {
  authorizeRuntimeRequest,
  runtimeAuthorizationResponse,
  type RuntimeTenantBindingOptions,
} from './runtime-auth';
import type { RuntimeTraceSink } from './runtime-trace';
import {
  resolveRuntimeAccess,
  runtimeJsonResponse,
  withRuntimeTrace,
  type RuntimeHttpHandler,
} from './http-envelope';

/**
 * 单聊 Runtime 的 HTTP handler —— 服务端专用。
 *
 * 从 `runtime-http.ts` 拆出来（B2 的续）：那个文件同时装着浏览器客户端
 * `HttpRuntimeApi` 与这个 handler，整文件挪进 `runtime/server.ts` 会把客户端一起带走，
 * 于是前端入口只能继续把 handler 挂在可达集合里。拆开后 `runtime-http.ts` 只剩客户端，
 * 这个文件进服务端入口，边界由 tests/tooling/runtime-entry-boundary.test.ts 守着。
 */

export type { RuntimeHttpHandler };

export type RuntimeHttpHandlerOptions = RuntimeTenantBindingOptions & {
  /** 关联事件接收器；宿主据此落日志或指标。缺省时不产生任何日志副作用。 */
  onTrace?: RuntimeTraceSink;
};

/** 不带凭据也必须通过的探针路径 */
const HEALTH_PATH = '/v1/runtime/health';

/**
 * 把框架无关的 RuntimeApiRequest 适配成标准 Fetch Handler。
 *
 * 认证解析器由宿主服务注入。开启 requireAuthentication 后，除健康检查外的
 * 请求必须携带可信 principal；数据库连接和事务只存在于 api 实例。
 *
 * 关联可观测：解析（或生成）关联 ID，在响应头回显，并通过 onTrace 上报
 * 方法、路径、状态与耗时，用于分布式排障与时延观测。
 */
export function createRuntimeHttpHandler(
  api: RuntimeApi,
  options: RuntimeHttpHandlerOptions = {}
): RuntimeHttpHandler {
  return withRuntimeTrace(async (request) => {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      return runtimeJsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
    }
    const url = new URL(request.url);
    // 判定顺序保持原样：方法 → 认证 → 租户 → 授权 → 领域
    const access = await resolveRuntimeAccess(request, options, url.pathname, [HEALTH_PATH]);
    if (!access.granted) return access.response;
    const { principal } = access;
    const boundTenantId = access.tenantId;
    let body: unknown;
    if (method === 'POST') {
      try {
        body = await request.json();
      } catch {
        return runtimeJsonResponse(400, { error: 'INVALID_JSON' });
      }
      if (boundTenantId && url.pathname === '/v1/runtime/characters/batch' &&
        body && typeof body === 'object' && !Array.isArray(body)) {
        const payload = body as Record<string, unknown>;
        if (Array.isArray(payload.characters)) {
          body = { ...payload, characters: payload.characters.map((item) =>
            item && typeof item === 'object' && !Array.isArray(item)
              ? { ...(item as Record<string, unknown>), tenantId: boundTenantId }
              : item
          ) };
        }
      }
      const isTenantBoundWrite =
        url.pathname === '/v1/runtime/characters' || url.pathname.endsWith('/events') ||
        url.pathname.endsWith('/turns') || url.pathname.endsWith('/review');
      if (boundTenantId && isTenantBoundWrite && body && typeof body === 'object' && !Array.isArray(body)) {
        body = { ...(body as Record<string, unknown>), tenantId: boundTenantId };
      }
    }
    if (!await authorizeRuntimeRequest(request, principal, options, {
      path: url.pathname,
      method,
      body,
      query: url.searchParams,
    })) {
      return runtimeAuthorizationResponse('MEMBER_FORBIDDEN');
    }
    const result = await handleRuntimeRequest(api, {
      method,
      path: url.pathname as RuntimeRoute,
      body,
      query: { ...Object.fromEntries(url.searchParams), ...(boundTenantId ? { tenantId: boundTenantId } : {}) },
    });
    return runtimeJsonResponse(result.status, result.body);
  }, options.onTrace);
}
