import { describe, expect, it } from 'vitest';
// GroupRuntimeError 的家在 group-runtime-contract；它此前是从 barrel 顺带出来的，
// 而 barrel 现在不再转导出 postgres-*（服务端模块），所以按真实出处导入。
import { GroupRuntimeError } from '@/runtime/group-runtime-contract';
import {
  HttpGroupRuntimeApi,
  createGroupRuntimeHttpHandler,
  type GroupRuntimeApi,
} from '@/runtime';

function fakeApi(): GroupRuntimeApi & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    async createGroup(input) { calls.push({ method: 'createGroup', args: [input] }); },
    async getGroupState(...args) {
      calls.push({ method: 'getGroupState', args });
      return { groupId: args[0] as string, name: '群聊', status: 'active' as const, version: 3, memberIds: ['a', 'b'] };
    },
    async enqueueTurn(input) {
      calls.push({ method: 'enqueueTurn', args: [input] });
      return {
        groupId: input.groupId, turnId: input.turnId, speakerId: input.speakerId,
        userMessage: input.userMessage, assistantMessage: input.assistantMessage,
        occurredAt: input.occurredAt ?? '2026-09-23T00:00:00.000Z', status: 'pending' as const,
        attempts: 0, createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
      };
    },
    async listPendingTurns(...args) {
      calls.push({ method: 'listPendingTurns', args });
      return [];
    },
    async retryPendingTurns(...args) {
      calls.push({ method: 'retryPendingTurns', args });
      return [];
    },
    async setGroupStatus(input) {
      calls.push({ method: 'setGroupStatus', args: [input] });
      return { groupId: input.groupId, name: '群聊', status: input.status, version: 6, memberIds: ['a', 'b'] };
    },
    async addMember(...args) {
      calls.push({ method: 'addMember', args });
      return { groupId: args[0] as string, name: '群聊', status: 'active' as const, version: 4, memberIds: ['a', 'b', args[1] as string] };
    },
    async removeMember(...args) {
      calls.push({ method: 'removeMember', args });
      return { groupId: args[0] as string, name: '群聊', status: 'active' as const, version: 5, memberIds: ['a', 'b'] };
    },
    async listTurns(...args) {
      calls.push({ method: 'listTurns', args });
      return [{ id: '11111111-1111-4111-8111-111111111111', groupId: args[0] as string,
        turnId: 'r1', sequenceNo: 0, speakerId: '22222222-2222-4222-8222-222222222222',
        userMessage: '问', assistantMessage: '答', occurredAt: '2026-09-23T00:00:00.000Z', eventIds: {} }];
    },
    async buildMemberContext(...args) {
      calls.push({ method: 'buildMemberContext', args });
      return { identity: { displayName: '角色' }, traits: [], values: [], beliefs: [],
        currentState: { emotions: [], mood: { valence: 0, arousal: 0, dominance: 0.5, baselineValence: 0, baselineArousal: 0, baselineDominance: 0.5, halfLifeSeconds: 3600, updatedAt: '2026-09-23T00:00:00.000Z' }, attitudes: [], relationships: [] },
        recentEvents: [], relevantMemories: [], relevantEpisodes: [] };
    },
    async commitTurn(input) {
      calls.push({ method: 'commitTurn', args: [input] });
      return { id: '33333333-3333-4333-8333-333333333333', groupId: input.groupId, turnId: input.turnId,
        sequenceNo: 0, speakerId: input.speakerId, userMessage: input.userMessage,
        assistantMessage: input.assistantMessage, occurredAt: input.occurredAt ?? '2026-09-23T00:00:00.000Z', eventIds: {} };
    },
  };
}

describe('群聊 Runtime HTTP 边界', () => {
  it('开启强制认证后拒绝匿名请求，并向认证解析器传递原始 Request', async () => {
    const api = fakeApi();
    const seen: string[] = [];
    const handler = createGroupRuntimeHttpHandler(api, {
      requireAuthentication: true,
      authenticate: (request) => {
        seen.push(request.headers.get('Authorization') ?? '');
        return request.headers.get('Authorization') === 'Bearer valid'
          ? { subject: 'user-1', tenantId: 'tenant-a' }
          : null;
      },
    });
    const anonymous = await handler(new Request('http://runtime.test/v1/runtime/groups/g'));
    expect(anonymous.status).toBe(401);
    const authenticated = await handler(new Request('http://runtime.test/v1/runtime/groups/g', {
      headers: { Authorization: 'Bearer valid' },
    }));
    expect(authenticated.status).toBe(200);
    expect(seen).toEqual(['', 'Bearer valid']);
  });

  it('静态租户绑定拒绝 tenant 不匹配的认证 principal', async () => {
    const api = fakeApi();
    const handler = createGroupRuntimeHttpHandler(api, {
      tenantId: 'tenant-a',
      requireAuthentication: true,
      authenticate: () => ({ subject: 'user-1', tenantId: 'tenant-b' }),
    });
    const response = await handler(new Request('http://runtime.test/v1/runtime/groups/g'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'TENANT_FORBIDDEN' });
  });

  it('可以注入成员授权器并拒绝群聊资源访问', async () => {
    const api = fakeApi();
    const handler = createGroupRuntimeHttpHandler(api, {
      requireAuthentication: true,
      authenticate: () => ({ subject: 'user-1', tenantId: 'tenant-a' }),
      authorize: (_request, _principal, context) => context.path === '/v1/runtime/groups',
    });
    const denied = await handler(new Request('http://runtime.test/v1/runtime/groups/g'));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: 'MEMBER_FORBIDDEN' });
  });

  it('Handler 路由全部群组操作并映射领域错误', async () => {
    const api = fakeApi();
    const handler = createGroupRuntimeHttpHandler(api, { allowAnonymous: true });
    const create = await handler(new Request('http://runtime.test/v1/runtime/groups', {
      method: 'POST', body: JSON.stringify({ groupId: 'g', name: '群聊', memberIds: ['a', 'b'] }),
    }));
    expect(create.status).toBe(200);
    const state = await handler(new Request('http://runtime.test/v1/runtime/groups/g'));
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({ version: 3 });
    const turn = await handler(new Request('http://runtime.test/v1/runtime/groups/g/turns', {
      method: 'POST', body: JSON.stringify({ turnId: 'r1', speakerId: 'a', userMessage: '问', assistantMessage: '答' }),
    }));
    expect(turn.status).toBe(200);
    const list = await handler(new Request('http://runtime.test/v1/runtime/groups/g/turns?memberId=b'));
    expect(list.status).toBe(200);
    const context = await handler(new Request('http://runtime.test/v1/runtime/groups/g/context', {
      method: 'POST', body: JSON.stringify({ memberId: 'b', request: { query: '状态' } }),
    }));
    expect(context.status).toBe(200);
    const add = await handler(new Request('http://runtime.test/v1/runtime/groups/g/members', {
      method: 'POST', body: JSON.stringify({ characterId: 'c' }),
    }));
    expect(add.status).toBe(200);
    const remove = await handler(new Request('http://runtime.test/v1/runtime/groups/g/members/c', { method: 'DELETE' }));
    expect(remove.status).toBe(200);
    const archive = await handler(new Request('http://runtime.test/v1/runtime/groups/g/status', {
      method: 'PUT', body: JSON.stringify({ status: 'archived', expectedVersion: 3 }),
    }));
    expect(archive.status).toBe(200);
    expect(await archive.json()).toMatchObject({ status: 'archived' });
    expect(api.calls.map((call) => call.method)).toEqual([
      'createGroup', 'getGroupState', 'commitTurn', 'listTurns', 'buildMemberContext', 'addMember', 'removeMember',
      'setGroupStatus',
    ]);
    expect(api.calls.at(-1)?.args[0]).toMatchObject({ groupId: 'g', status: 'archived', expectedVersion: 3 });
  });

  it('Handler 路由服务端 outbox 的入队、查询与重放', async () => {
    const api = fakeApi();
    const handler = createGroupRuntimeHttpHandler(api, { allowAnonymous: true });

    const enqueue = await handler(new Request('http://runtime.test/v1/runtime/groups/g/outbox', {
      method: 'POST',
      body: JSON.stringify({ turnId: 'r1', speakerId: 'a', userMessage: '问', assistantMessage: '答' }),
    }));
    expect(enqueue.status).toBe(200);
    expect(await enqueue.json()).toMatchObject({ turnId: 'r1', status: 'pending' });

    const list = await handler(new Request('http://runtime.test/v1/runtime/groups/g/outbox'));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([]);

    const retry = await handler(new Request('http://runtime.test/v1/runtime/groups/g/outbox/retry', {
      method: 'POST', body: JSON.stringify({}),
    }));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual([]);

    expect(api.calls.map((call) => call.method)).toEqual([
      'enqueueTurn', 'listPendingTurns', 'retryPendingTurns',
    ]);
  });

  it('Http 客户端发送 outbox 请求', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = new HttpGroupRuntimeApi({
      baseUrl: 'https://runtime.test',
      fetch: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify([]), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await client.listPendingTurns('g');
    await client.retryPendingTurns('g');
    expect(requests[0]?.input).toBe('https://runtime.test/v1/runtime/groups/g/outbox');
    expect(requests[0]?.init?.method).toBe('GET');
    expect(requests[1]?.input).toBe('https://runtime.test/v1/runtime/groups/g/outbox/retry');
    expect(requests[1]?.init?.method).toBe('POST');
  });

  it('拒绝非法 status 与 expectedVersion 且不调用领域层', async () => {
    const api = fakeApi();
    const handler = createGroupRuntimeHttpHandler(api, { allowAnonymous: true });

    const badStatus = await handler(new Request('http://runtime.test/v1/runtime/groups/g/status', {
      method: 'PUT', body: JSON.stringify({ status: 'deleted' }),
    }));
    expect(badStatus.status).toBe(400);

    const badVersion = await handler(new Request('http://runtime.test/v1/runtime/groups/g/status', {
      method: 'PUT', body: JSON.stringify({ status: 'active', expectedVersion: -1 }),
    }));
    expect(badVersion.status).toBe(400);

    const wrongMethod = await handler(new Request('http://runtime.test/v1/runtime/groups/g/status', {
      method: 'GET',
    }));
    expect(wrongMethod.status).toBe(405);

    expect(api.calls).toHaveLength(0);
  });

  it('Http 客户端发送群组状态与期望版本', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = new HttpGroupRuntimeApi({
      baseUrl: 'https://runtime.test',
      fetch: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ groupId: 'g', name: '群', status: 'archived', version: 4, memberIds: [] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await client.setGroupStatus({ groupId: 'g', status: 'archived', expectedVersion: 3 });
    expect(requests[0]?.input).toBe('https://runtime.test/v1/runtime/groups/g/status');
    expect(requests[0]?.init?.method).toBe('PUT');
    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual({ status: 'archived', expectedVersion: 3 });
  });

  it('Http 客户端发送成员变更的期望版本', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = new HttpGroupRuntimeApi({
      baseUrl: 'https://runtime.test',
      fetch: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ groupId: 'g', name: '群', status: 'active', version: 2, memberIds: [] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await client.addMember('g', 'c', 1);
    await client.removeMember('g', 'c', 2);
    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual({ characterId: 'c', expectedVersion: 1 });
    expect(JSON.parse(String(requests[1]!.init?.body))).toEqual({ expectedVersion: 2 });
  });

  it('Http 客户端保留路径、认证头和领域错误状态', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = new HttpGroupRuntimeApi({
      baseUrl: 'https://runtime.test/api/', headers: { Authorization: 'Bearer group-token' },
      fetch: async (input, init) => {
        calls.push({ input, init });
        return new Response(JSON.stringify({ error: 'MEMBER_FORBIDDEN', message: '无权访问群组' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await expect(client.listTurns('group/1', 'member/1')).rejects.toMatchObject({
      status: 403, code: 'MEMBER_FORBIDDEN',
    });
    expect(calls[0]?.input).toBe('https://runtime.test/api/v1/runtime/groups/group%2F1/turns?memberId=member%2F1');
    expect((calls[0]?.init?.headers as Headers).get('Authorization')).toBe('Bearer group-token');
  });

  it('Handler 不把未知异常泄露给客户端', async () => {
    const handler = createGroupRuntimeHttpHandler({
      ...fakeApi(),
      async commitTurn() { throw new Error('数据库连接串不应返回'); },
    }, { allowAnonymous: true });
    const response = await handler(new Request('http://runtime.test/v1/runtime/groups/g/turns', {
      method: 'POST', body: JSON.stringify({ turnId: 'r', speakerId: 's', userMessage: '问', assistantMessage: '答' }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'GROUP_INTERNAL_ERROR', message: '群聊 Runtime 内部错误' });
  });

  it('领域错误按状态和错误码返回', async () => {
    const api = fakeApi();
    api.createGroup = async () => { throw new GroupRuntimeError(409, 'GROUP_CONFLICT', '群组定义冲突'); };
    const response = await createGroupRuntimeHttpHandler(api, { allowAnonymous: true })(new Request('http://runtime.test/v1/runtime/groups', {
      method: 'POST', body: JSON.stringify({ groupId: 'g', name: '群聊', memberIds: ['a', 'b'] }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'GROUP_CONFLICT', message: '群组定义冲突' });
  });
  it.each(['turns/extra', 'context/extra', 'members/a/extra', ''])('拒绝不存在的子路由 %s 且不调用领域层', async (suffix) => {
    const api = fakeApi();
    const response = await createGroupRuntimeHttpHandler(api, { allowAnonymous: true })(new Request(
      'http://runtime.test/v1/runtime/groups/g' + (suffix ? '/' + suffix : ''),
      { method: 'POST', body: JSON.stringify({ memberId: 'a', turnId: 't', speakerId: 'a', userMessage: '问', assistantMessage: '答' }) }
    ));
    expect(response.status).toBe(404);
    expect(api.calls).toHaveLength(0);
  });

  it.each([
    { maxEvents: -1 }, { maxEvents: 1.5 }, { maxMemories: '3' }, { maxEpisodes: null },
    { query: [] }, { targetId: 1 }, { now: '无效时间' }, { now: 1 },
  ])('拒绝无效的 Context 参数 %j', async (request) => {
    const api = fakeApi();
    const response = await createGroupRuntimeHttpHandler(api, { allowAnonymous: true })(new Request('http://runtime.test/v1/runtime/groups/g/context', {
      method: 'POST', body: JSON.stringify({ memberId: 'a', request }),
    }));
    expect(response.status).toBe(400);
    expect(api.calls).toHaveLength(0);
  });

  it('Context 零数量限制有效', async () => {
    const api = fakeApi();
    const request = { maxEvents: 0, maxMemories: 0, maxEpisodes: 0, query: '', now: '2026-09-23T00:00:00.000Z' };
    const response = await createGroupRuntimeHttpHandler(api, { allowAnonymous: true })(new Request('http://runtime.test/v1/runtime/groups/g/context', {
      method: 'POST', body: JSON.stringify({ memberId: 'a', request }),
    }));
    expect(response.status).toBe(200);
    expect(api.calls[0]?.args).toEqual(['g', 'a', request]);
  });

});
