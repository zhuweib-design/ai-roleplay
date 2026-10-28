import type { RuntimeContext, RuntimeContextRequest } from './types';
import type { CreateRuntimeGroupInput, CommitRuntimeGroupTurnInput, SetRuntimeGroupStatusInput, RuntimeGroupState, RuntimeGroupOutboxEntry, RuntimeGroupTurn } from './group-runtime-contract';
import type { RuntimeHttpApiOptions } from './runtime-http';
import { createTraceId } from './runtime-trace';
import {
  sendRuntimeRequest,
  type RuntimeFetch,
} from './http-envelope';

/**
 * 群聊 Runtime 的浏览器/Tauri 客户端与服务端 handler 分成两个文件：
 * 这个文件只放客户端（前端可达），handler 与它的请求校验在
 * `runtime-group-http-handler.ts`（只由 `runtime/server.ts` 导出）。
 * `GroupRuntimeApi` 是两边共用的契约，留在客户端文件里，handler 反向 import 它。
 */

export interface GroupRuntimeApi {
  createGroup(input: CreateRuntimeGroupInput): Promise<void>;
  getGroupState(groupId: string): Promise<RuntimeGroupState>;
  setGroupStatus(input: SetRuntimeGroupStatusInput): Promise<RuntimeGroupState>;
  enqueueTurn(input: CommitRuntimeGroupTurnInput): Promise<RuntimeGroupOutboxEntry>;
  listPendingTurns(groupId: string): Promise<RuntimeGroupOutboxEntry[]>;
  retryPendingTurns(groupId: string): Promise<Array<{ turnId: string; status: 'committed' | 'failed'; error?: string }>>;
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
  private readonly generateTraceId: () => string;

  constructor(options: RuntimeHttpApiOptions) {
    if (!options.baseUrl.trim()) throw new Error('Runtime HTTP baseUrl 不能为空');
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.headers = options.headers;
    this.generateTraceId = options.traceId ?? createTraceId;
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

  async enqueueTurn(input: CommitRuntimeGroupTurnInput): Promise<RuntimeGroupOutboxEntry> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(input.groupId)}/outbox`, 'POST', input);
  }

  async listPendingTurns(groupId: string): Promise<RuntimeGroupOutboxEntry[]> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(groupId)}/outbox`, 'GET');
  }

  async retryPendingTurns(groupId: string): Promise<Array<{ turnId: string; status: 'committed' | 'failed'; error?: string }>> {
    return this.request(`/v1/runtime/groups/${encodeURIComponent(groupId)}/outbox/retry`, 'POST', {});
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    return sendRuntimeRequest<T>({
      fetcher: this.fetcher,
      // baseUrl 已在构造函数里去掉尾部 `/`，与单聊的 joinUrl 同结果
      url: this.baseUrl + path,
      method,
      baseHeaders: this.headers ?? {},
      generateTraceId: this.generateTraceId,
      body,
      fallbackCode: 'GROUP_HTTP_ERROR',
      fallbackMessage: '群聊 Runtime 请求失败',
    });
  }
}
