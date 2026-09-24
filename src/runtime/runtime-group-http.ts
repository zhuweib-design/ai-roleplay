import type { RuntimeContext, RuntimeContextRequest } from './types';
import type { CreateRuntimeGroupInput, CommitRuntimeGroupTurnInput, SetRuntimeGroupStatusInput, RuntimeGroupState, RuntimeGroupTurn } from './group-runtime-contract';
import { GroupRuntimeError } from './group-runtime-contract';
import { RuntimeApiError, type RuntimeFetch, type RuntimeHttpApiOptions, type RuntimeHttpHandler } from './runtime-http';

export interface GroupRuntimeApi {
  createGroup(input: CreateRuntimeGroupInput): Promise<void>;
  getGroupState(groupId: string): Promise<RuntimeGroupState>;
  setGroupStatus(input: SetRuntimeGroupStatusInput): Promise<RuntimeGroupState>;
  addMember(groupId: string, characterId: string, expectedVersion?: number): Promise<RuntimeGroupState>;
  removeMember(groupId: string, characterId: string, expectedVersion?: number): Promise<RuntimeGroupState>;
  listTurns(groupId: string, memberId: string): Promise<RuntimeGroupTurn[]>;
  buildMemberContext(groupId: string, memberId: string, request?: RuntimeContextRequest): Promise<RuntimeContext>;
  commitTurn(input: CommitRuntimeGroupTurnInput): Promise<RuntimeGroupTurn>;
}

/** 群聊 Runtime HTTP 客户端：只传角色标识和公共内容，不接触 SQL。 */
export class HttpGroupRuntimeApi implements GroupRuntimeApi {
  private readonly baseUrl: string;
  private readonly fetcher: RuntimeFetch;
  private readonly headers?: HeadersInit;

  constructor(options: RuntimeHttpApiOptions) {
    if (!options.baseUrl.trim()) throw new Error('Runtime HTTP baseUrl 不能为空');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.headers = options.headers;
  }

  async createGroup(input: CreateRuntimeGroupInput): Promise<void> {
    await this.request('/v1/runtime/groups', 'POST', input);
  }

  async getGroupState(groupId: string): Promise<RuntimeGroupState> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(groupId)}`, 'GET');
  }

  async setGroupStatus(input: SetRuntimeGroupStatusInput): Promise<RuntimeGroupState> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(input.groupId)}/status`, 'PUT', {
      status: input.status,
      ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
    });
  }

  async addMember(groupId: string, characterId: string, expectedVersion?: number): Promise<RuntimeGroupState> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(groupId)}/members`, 'POST', {
      characterId, ...(expectedVersion === undefined ? {} : { expectedVersion }),
    });
  }

  async removeMember(groupId: string, characterId: string, expectedVersion?: number): Promise<RuntimeGroupState> {
    return this.request(
      `/v1/runtime/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(characterId)}`,
      'DELETE', expectedVersion === undefined ? undefined : { expectedVersion }
    );
  }

  async listTurns(groupId: string, memberId: string): Promise<RuntimeGroupTurn[]> {
    return this.request(
      `/v1/runtime/groups/${encodeURIComponent(groupId)}/turns?memberId=${encodeURIComponent(memberId)}`, 'GET'
    );
  }

  async buildMemberContext(groupId: string, memberId: string, request: RuntimeContextRequest = {}): Promise<RuntimeContext> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(groupId)}/context`, 'POST', { memberId, request });
  }

  async commitTurn(input: CommitRuntimeGroupTurnInput): Promise<RuntimeGroupTurn> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(input.groupId)}/turns`, 'POST', input);
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const headers = new Headers(this.headers);
    headers.set('Accept', 'application/json');
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await this.fetcher(this.baseUrl + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload: unknown = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() : await response.text();
    if (!response.ok) {
      const details = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      throw new RuntimeApiError(response.status,
        typeof details.error === 'string' ? details.error : 'GROUP_HTTP_ERROR',
        typeof details.message === 'string' ? details.message : '群聊 Runtime 请求失败');
    }
    return payload as T;
  }
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function invalid(message: string): never {
  throw new GroupRuntimeError(400, 'INVALID_REQUEST', message);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('请求体必须是对象');
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} 不能为空`);
  return value as string;
}

function contextRequest(value: unknown): RuntimeContextRequest {
  const input = value === undefined ? {} : object(value);
  for (const key of ['query', 'targetId', 'now'] as const) {
    if (input[key] !== undefined && typeof input[key] !== 'string') invalid(key + ' 必须是字符串');
  }
  if (input.now !== undefined && !Number.isFinite(Date.parse(input.now as string))) invalid('now 必须是有效时间');
  for (const key of ['maxEvents', 'maxMemories', 'maxEpisodes'] as const) {
    const limit = input[key];
    if (limit !== undefined && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0)) {
      invalid(key + ' 必须是非负安全整数');
    }
  }
  return input as RuntimeContextRequest;
}

function optionalVersion(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid('expectedVersion 必须是非负安全整数');
  }
  return value;
}

/** 认证和租户解析必须在外层完成；此 Handler 仅复用已绑定租户的 GroupRuntimeApi。 */
export function createGroupRuntimeHttpHandler(api: GroupRuntimeApi): RuntimeHttpHandler {
  return async (request) => {
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      let body: Record<string, unknown> | undefined;
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        try {
          const raw = await request.text();
          body = raw.trim() ? object(JSON.parse(raw) as unknown) : {};
        } catch (error) {
          if (error instanceof GroupRuntimeError) throw error;
          invalid('JSON 格式无效');
        }
      }
      if (url.pathname === '/v1/runtime/groups') {
        if (method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' });
        const payload = body!;
        if (!Array.isArray(payload.memberIds) || !payload.memberIds.every((id) => typeof id === 'string')) {
          invalid('memberIds 必须是字符串数组');
        }
        await api.createGroup({
          groupId: string(payload.groupId, 'groupId'), name: string(payload.name, 'name'),
          memberIds: payload.memberIds as string[],
        });
        return respond(200, { groupId: payload.groupId });
      }
      const match = url.pathname.match(/^\/v1\/runtime\/groups\/([^/]+)(?:\/(turns|context|members|status)(?:\/([^/]+))?)?$/);
      if (!match || (match[3] && match[2] !== 'members')) {
        return respond(404, { error: 'NOT_FOUND' });
      }
      const groupId = decodeURIComponent(match[1]!);
      const resource = match[2];
      if (!resource && method === 'GET') {
        return respond(200, await api.getGroupState(groupId));
      }
      // 群组资源本身只提供 GET；其它方法不应被误判为有效子路由。
      // 返回 404 可避免把不完整路径暴露成可调用的领域操作。
      if (!resource) return respond(404, { error: 'NOT_FOUND' });
      if (resource === 'turns' && method === 'GET') {
        return respond(200, await api.listTurns(groupId, string(url.searchParams.get('memberId'), 'memberId')));
      }
      if (resource === 'turns' && method === 'POST') {
        const payload = body!;
        return respond(200, await api.commitTurn({
          groupId, turnId: string(payload.turnId, 'turnId'), speakerId: string(payload.speakerId, 'speakerId'),
          userMessage: string(payload.userMessage, 'userMessage'),
          assistantMessage: string(payload.assistantMessage, 'assistantMessage'),
          ...(payload.occurredAt === undefined ? {} : { occurredAt: string(payload.occurredAt, 'occurredAt') }),
        }));
      }
      if (resource === 'context' && method === 'POST') {
        const payload = body!;
        return respond(200, await api.buildMemberContext(groupId,
          string(payload.memberId, 'memberId'), contextRequest(payload.request)));
      }
      if (resource === 'status' && !match[3] && method === 'PUT') {
        const payload = body!;
        const status = payload.status;
        if (status !== 'active' && status !== 'archived') invalid('status 必须是 active 或 archived');
        const expectedVersion = optionalVersion(payload.expectedVersion);
        return respond(200, await api.setGroupStatus({
          groupId, status, ...(expectedVersion === undefined ? {} : { expectedVersion }),
        }));
      }
      if (resource === 'members' && !match[3] && method === 'POST') {
        const expectedVersion = optionalVersion(body!.expectedVersion);
        return respond(200, await api.addMember(groupId, string(body!.characterId, 'characterId'), expectedVersion));
      }
      if (resource === 'members' && match[3] && method === 'DELETE') {
        const expectedVersion = method === 'DELETE' && body ? optionalVersion(body.expectedVersion) : undefined;
        return respond(200, await api.removeMember(groupId, decodeURIComponent(match[3]), expectedVersion));
      }
      return respond(405, { error: 'METHOD_NOT_ALLOWED' });
    } catch (error) {
      if (error instanceof GroupRuntimeError) {
        return respond(error.status, { error: error.code, message: error.message });
      }
      if (error instanceof URIError) return respond(400, { error: 'INVALID_PATH' });
      return respond(500, { error: 'GROUP_INTERNAL_ERROR', message: '群聊 Runtime 内部错误' });
    }
  };
}
