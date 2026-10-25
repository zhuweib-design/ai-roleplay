import type {
  RuntimeApi,
  RuntimeApiRequest,
  RuntimeApiResponse,
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
  resolveRuntimePrincipal,
  runtimeAuthorizationResponse,
  runtimeAuthenticationResponse,
  type RuntimeTenantBindingOptions,
} from './runtime-auth';
import {
  RUNTIME_TRACE_HEADER,
  createTraceId,
  normalizeTraceId,
  resolveTraceId,
  type RuntimeTraceSink,
} from './runtime-trace';

export type RuntimeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface RuntimeHttpApiOptions {
  /** 服务端根地址，例如 https://runtime.example.com。 */
  baseUrl: string;
  /** 允许注入 fetch，便于 Tauri、SSR 和测试环境复用同一契约。 */
  fetch?: RuntimeFetch;
  headers?: HeadersInit;
  /** 关联 ID 生成器；默认使用 createTraceId，测试可注入确定性值。 */
  traceId?: () => string;
}

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

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path;
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false;
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
    const headers = new Headers(this.headers);
    headers.set('Accept', 'application/json');
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    // 每个请求注入关联 ID；服务端会原样回显，失败时一并带在错误上。
    headers.set(RUNTIME_TRACE_HEADER, this.generateTraceId());
    const response = await this.fetcher(joinUrl(this.baseUrl, path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = isJsonResponse(response) ? await response.json() : await response.text();
    // 以服务端回显为准（服务端可能生成了兜底 ID），否则退回客户端注入值。
    const traceId = normalizeTraceId(response.headers.get(RUNTIME_TRACE_HEADER))
      ?? normalizeTraceId(headers.get(RUNTIME_TRACE_HEADER))
      ?? undefined;
    if (!response.ok) {
      const errorBody = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      throw new RuntimeApiError(
        response.status,
        typeof errorBody.error === 'string' ? errorBody.error : 'RUNTIME_HTTP_ERROR',
        typeof errorBody.message === 'string' ? errorBody.message : 'Runtime HTTP 请求失败',
        errorBody.issues,
        traceId
      );
    }
    return payload as T;
  }
}

export type RuntimeHttpHandler = (request: Request) => Promise<Response>;

export type RuntimeHttpHandlerOptions = RuntimeTenantBindingOptions & {
  /** 关联事件接收器；宿主据此落日志或指标。缺省时不产生任何日志副作用。 */
  onTrace?: RuntimeTraceSink;
};

function jsonResponse(response: RuntimeApiResponse, traceId?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (traceId) headers[RUNTIME_TRACE_HEADER] = traceId;
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers,
  });
}

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
  return async (request) => {
    const startedAt = Date.now();
    const traceId = resolveTraceId(request);
    const finish = (response: Response): Response => {
      response.headers.set(RUNTIME_TRACE_HEADER, traceId);
      options.onTrace?.({
        traceId,
        method: request.method.toUpperCase(),
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    };
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      return finish(jsonResponse({ status: 405, body: { error: 'METHOD_NOT_ALLOWED' } }));
    }
    const url = new URL(request.url);
    const principal = await resolveRuntimePrincipal(request, options);
    if (!principal && !options.allowAnonymous && url.pathname !== '/v1/runtime/health') {
      return finish(runtimeAuthenticationResponse());
    }
    if (principal && options.tenantId && principal.tenantId !== options.tenantId) {
      return finish(runtimeAuthorizationResponse());
    }
    const boundTenantId = principal?.tenantId ?? options.tenantId;
    let body: unknown;
    if (method === 'POST') {
      try {
        body = await request.json();
      } catch {
        return finish(jsonResponse({ status: 400, body: { error: 'INVALID_JSON' } }));
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
      return finish(runtimeAuthorizationResponse('MEMBER_FORBIDDEN'));
    }
    const result = await handleRuntimeRequest(api, {
      method,
      path: url.pathname as RuntimeRoute,
      body,
      query: { ...Object.fromEntries(url.searchParams), ...(boundTenantId ? { tenantId: boundTenantId } : {}) },
    });
    return finish(jsonResponse(result));
  };
}
