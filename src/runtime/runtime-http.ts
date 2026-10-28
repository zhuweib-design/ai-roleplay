import type {
  RuntimeApi,
  RuntimeApiRequest,
  RuntimeBatchCreateResult,
} from './runtime-api';
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
import { createTraceId } from './runtime-trace';
import {
  joinUrl,
  sendRuntimeRequest,
  type RuntimeFetch,
} from './http-envelope';

/**
 * 错误类型、fetch 注入点与 handler 签名已上移到 http-envelope；这里再导出，
 * 保持既有导入路径不变。服务端 handler 本体在 `runtime-http-handler.ts`。
 */
export { RuntimeApiError, type RuntimeFetch, type RuntimeHttpHandler } from './http-envelope';

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
