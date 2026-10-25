import type {
  RuntimeApi,
  RuntimeApiRequest,
  RuntimeBatchCreateResult,
  RuntimeRoute,
} from './runtime-api';
import { handleRuntimeRequest } from './runtime-api';
import type {
  CharacterCompileInput,
  RuntimeContext,
  RuntimeContextRequest,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult,
  RuntimeConversationTurnEventInput,
  RuntimeConversationTurnCommitResult,
  RuntimeEventInput,
  RuntimeReduceResult,
  RuntimeSnapshot,
  RuntimeCharacterListRequest,
  RuntimeCharacterListResult,
  MemoryReviewAction,
} from './types';
import {
  authorizeRuntimeRequest,
  runtimeAuthorizationResponse,
  type RuntimeTenantBindingOptions,
} from './runtime-auth';
import { createTraceId, type RuntimeTraceSink } from './runtime-trace';
import {
  joinUrl,
  resolveRuntimeAccess,
  runtimeJsonResponse,
  sendRuntimeRequest,
  withRuntimeTrace,
  type RuntimeFetch,
} from './http-envelope';

/** 错误类型与 fetch 注入点已上移到 http-envelope；这里再导出，保持既有导入路径不变 */
export { RuntimeApiError, type RuntimeFetch } from './http-envelope';

export interface RuntimeHttpApiOptions {
  /** 服务端根地址，例如 https://runtime.example.com。 */
  baseUrl: string;
  /** 允许注入 fetch，便于 Tauri、SSR 和测试环境复用同一契约。 */
  fetch?: RuntimeFetch;
  headers?: HeadersInit;
  /** 关联 ID 生成器；默认使用 createTraceId，测试可注入确定性值。 */
  traceId?: () => string;
}

/**
 * 面向浏览器/Tauri 的 Runtime HTTP 客户端。
 *
 * 客户端只知道 RuntimeApi，不接触 PostgreSQL、SQL 或投影表；服务端负责
 * 认证、租户边界和事务。这样 ChatManager 可以在本地 Runtime 与远端 Runtime
 * 之间切换，而不改变上下文注入和 Event 记录逻辑。
 */
export class HttpRuntimeApi implements RuntimeApi {
  private readonly baseUrl: string;
  private readonly fetcher: RuntimeFetch;
  private readonly headers?: HeadersInit;
  private readonly generateTraceId: () => string;

  constructor(options: RuntimeHttpApiOptions) {
    if (!options.baseUrl.trim()) throw new Error('Runtime HTTP baseUrl 不能为空');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.headers = options.headers;
    this.generateTraceId = options.traceId ?? createTraceId;
  }

  async listCharacters(input: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult> {
    const query = new URLSearchParams({ tenantId: input.tenantId });
    if (input.limit !== undefined) query.set('limit', String(input.limit));
    if (input.cursor !== undefined) query.set('cursor', input.cursor);
    return this.request(`/v1/runtime/characters?${query}`, 'GET');
  }

  async createCharacter(input: CharacterCompileInput): Promise<RuntimeSnapshot> {
    return this.request('/v1/runtime/characters', 'POST', input);
  }

  async createCharacters(inputs: CharacterCompileInput[]): Promise<RuntimeBatchCreateResult> {
    return this.request('/v1/runtime/characters/batch', 'POST', { characters: inputs });
  }

  async getCharacter(characterId: string): Promise<RuntimeSnapshot> {
    return this.request('/v1/runtime/characters/' + encodeURIComponent(characterId), 'GET');
  }

  async ingestEvent(
    characterId: string,
    input: Omit<RuntimeEventInput, 'characterId'>
  ): Promise<RuntimeReduceResult> {
    return this.request(
      '/v1/runtime/characters/' + encodeURIComponent(characterId) + '/events',
      'POST',
      input
    );
  }

  async recordConversationTurn(
    characterId: string,
    input: Omit<RuntimeConversationTurnInput, 'characterId'>
  ): Promise<RuntimeConversationTurnResult> {
    return this.request(
      '/v1/runtime/characters/' + encodeURIComponent(characterId) + '/turns',
      'POST',
      input
    );
  }

  async recordChatTurn(
    characterId: string,
    input: RuntimeConversationTurnEventInput
  ): Promise<RuntimeConversationTurnCommitResult> {
    return this.request(
      '/v1/runtime/characters/' + encodeURIComponent(characterId) + '/turns',
      'POST',
      input
    );
  }

  async buildContext(characterId: string, input?: RuntimeContextRequest): Promise<RuntimeContext> {
    return this.request(
      '/v1/runtime/characters/' + encodeURIComponent(characterId) + '/context',
      'POST',
      input ?? {}
    );
  }

  async reviewMemory(characterId: string, input: { tenantId: string; memoryId: string; action: MemoryReviewAction }): Promise<RuntimeSnapshot> {
    return this.request(
      `/v1/runtime/characters/${encodeURIComponent(characterId)}/memories/${encodeURIComponent(input.memoryId)}/review`,
      'POST',
      input
    );
  }

  private async request<T>(
    path: string,
    method: RuntimeApiRequest['method'],
    body?: unknown
  ): Promise<T> {
    return sendRuntimeRequest<T>({
      fetcher: this.fetcher,
      url: joinUrl(this.baseUrl, path),
      method,
      baseHeaders: this.headers ?? {},
      generateTraceId: this.generateTraceId,
      body,
      fallbackCode: 'RUNTIME_HTTP_ERROR',
      fallbackMessage: 'Runtime HTTP 请求失败',
    });
  }
}

/** 不带凭据也必须通过的探针路径 */
const HEALTH_PATH = '/v1/runtime/health';

export type RuntimeHttpHandler = (request: Request) => Promise<Response>;

export type RuntimeHttpHandlerOptions = RuntimeTenantBindingOptions & {
  /** 关联事件接收器；宿主据此落日志或指标。缺省时不产生任何日志副作用。 */
  onTrace?: RuntimeTraceSink;
};

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
