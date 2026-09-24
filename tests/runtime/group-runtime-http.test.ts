import { describe, expect, it } from 'vitest';
import {
  GroupRuntimeError,
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
  it('Handler 路由全部群组操作并映射领域错误', async () => {
    const api = fakeApi();
    const handler = createGroupRuntimeHttpHandler(api);
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
    expect(api.calls.map((call) => call.method)).toEqual([
      'createGroup', 'getGroupState', 'commitTurn', 'listTurns', 'buildMemberContext', 'addMember', 'removeMember',
    ]);
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
    });
    const response = await handler(new Request('http://runtime.test/v1/runtime/groups/g/turns', {
      method: 'POST', body: JSON.stringify({ turnId: 'r', speakerId: 's', userMessage: '问', assistantMessage: '答' }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'GROUP_INTERNAL_ERROR', message: '群聊 Runtime 内部错误' });
  });

  it('领域错误按状态和错误码返回', async () => {
    const api = fakeApi();
    api.createGroup = async () => { throw new GroupRuntimeError(409, 'GROUP_CONFLICT', '群组定义冲突'); };
    const response = await createGroupRuntimeHttpHandler(api)(new Request('http://runtime.test/v1/runtime/groups', {
      method: 'POST', body: JSON.stringify({ groupId: 'g', name: '群聊', memberIds: ['a', 'b'] }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'GROUP_CONFLICT', message: '群组定义冲突' });
  });
  it.each(['turns/extra', 'context/extra', 'members/a/extra', ''])('拒绝不存在的子路由 %s 且不调用领域层', async (suffix) => {
    const api = fakeApi();
    const response = await createGroupRuntimeHttpHandler(api)(new Request(
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
    const response = await createGroupRuntimeHttpHandler(api)(new Request('http://runtime.test/v1/runtime/groups/g/context', {
      method: 'POST', body: JSON.stringify({ memberId: 'a', request }),
    }));
    expect(response.status).toBe(400);
    expect(api.calls).toHaveLength(0);
  });

  it('Context 零数量限制有效', async () => {
    const api = fakeApi();
    const request = { maxEvents: 0, maxMemories: 0, maxEpisodes: 0, query: '', now: '2026-09-23T00:00:00.000Z' };
    const response = await createGroupRuntimeHttpHandler(api)(new Request('http://runtime.test/v1/runtime/groups/g/context', {
      method: 'POST', body: JSON.stringify({ memberId: 'a', request }),
    }));
    expect(response.status).toBe(200);
    expect(api.calls[0]?.args).toEqual(['g', 'a', request]);
  });

});
