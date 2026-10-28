import { describe, expect, it } from 'vitest';
import {
  HttpRuntimeApi,
  InMemoryRuntimeStore,
  RuntimeApiAdapter,
  RuntimeApiError,
  RuntimeCore,
  stableChatConversationTurnIds,
} from '@/runtime';
// handler 是服务端专用模块，已从前端 barrel 挪到 runtime/server 一侧
import { createRuntimeHttpHandler } from '@/runtime/runtime-http-handler';

describe('Runtime HTTP 持久化边界', () => {
  it('Fetch Handler 可以承载角色、Event、Snapshot 和 Context 的完整请求链', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, {
      tenantId: 'tenant-a',
      principal: { subject: 'test-user', tenantId: 'tenant-a' },
    });

    const createResponse = await handler(
      new Request('http://runtime.test/v1/runtime/characters', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-a',
          profile: { displayName: 'HTTP 角色', speakingStyle: '克制' },
          now: '2026-09-22T00:00:00.000Z',
        }),
      })
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { character: { id: string } };

    const eventResponse = await handler(
      new Request('http://runtime.test/v1/runtime/characters/' + created.character.id + '/events', {
        method: 'POST',
        body: JSON.stringify({
          eventId: 'http-turn-1',
          tenantId: 'tenant-a',
          eventType: 'greeting',
          importance: 0.6,
          occurredAt: '2026-09-22T00:01:00.000Z',
          effects: { memory: { type: 'semantic', content: '用户问候了角色' } },
        }),
      })
    );
    expect(eventResponse.status).toBe(200);
    const eventPayload = await eventResponse.json();
    expect(eventPayload.event.id).toBe('http-turn-1');

    const bypassReviewResponse = await handler(
      new Request(`http://runtime.test/v1/runtime/characters/${created.character.id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-a',
          eventType: 'memory.review',
          effects: { memoryReview: { memoryId: eventPayload.createdMemory.id, action: 'confirm' } },
        }),
      })
    );
    expect(bypassReviewResponse.status).toBe(422);

    const turnResponse = await handler(
      new Request('http://runtime.test/v1/runtime/characters/' + created.character.id + '/turns', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-a',
          turnId: 'http-turn-1',
          conversationKey: 'chat-http-1',
          userMessage: '你好',
          assistantMessage: '你好，我在。',
          occurredAt: '2026-09-22T00:01:00.000Z',
        }),
      })
    );
    expect(turnResponse.status).toBe(200);

    const memoryId = eventPayload.createdMemory.id as string;
    const client = new HttpRuntimeApi({
      baseUrl: 'http://runtime.test',
      fetch: (input, init) => handler(new Request(input, init)),
    });
    const reviewedSnapshot = await client.reviewMemory(created.character.id, {
      tenantId: 'forged-tenant',
      memoryId,
      action: 'confirm',
    });
    expect(reviewedSnapshot.memories[0]?.reviewStatus).toBe('confirmed');
    const turn = await turnResponse.json() as { conversationId: string; sessionId: string };
    expect(turn).toMatchObject(stableChatConversationTurnIds(
      'tenant-a', created.character.id, 'chat-http-1', undefined, 'http-turn-1'
    ));

    const contextResponse = await handler(
      new Request('http://runtime.test/v1/runtime/characters/' + created.character.id + '/context', {
        method: 'POST',
        body: JSON.stringify({ query: '问候' }),
      })
    );
    expect(contextResponse.status).toBe(200);
    expect((await contextResponse.json()).relevantMemories).toHaveLength(1);

    const getResponse = await handler(
      new Request('http://runtime.test/v1/runtime/characters/' + created.character.id)
    );
    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).version).toBe(2);
  });

  it('批量创建多个角色返回逐项结果，可用稳定 ID 重试并隔离状态', async () => {
    const store = new InMemoryRuntimeStore();
    const handler = createRuntimeHttpHandler(new RuntimeApiAdapter(new RuntimeCore(store)), {
      tenantId: 'server-tenant',
      principal: { subject: 'test-user', tenantId: 'server-tenant' },
    });
    const client = new HttpRuntimeApi({
      baseUrl: 'http://runtime.test',
      fetch: (input, init) => handler(new Request(input, init)),
    });
    const inputs = [
      { id: '11111111-1111-4111-8111-111111111111', tenantId: 'forged-tenant', profile: { displayName: '甲' } },
      { id: '22222222-2222-4222-8222-222222222222', tenantId: 'forged-tenant', profile: { displayName: '乙' } },
      { id: '33333333-3333-4333-8333-333333333333', tenantId: 'forged-tenant', profile: { displayName: '  ' } },
    ];
    const first = await client.createCharacters(inputs);
    expect(first.items.map((item) => item.status)).toEqual(['created', 'created', 'invalid']);
    expect(first.items[2]?.issues?.length).toBeGreaterThan(0);
    expect((await store.load(inputs[0]!.id))?.character.tenantId).toBe('server-tenant');
    expect((await store.load(inputs[1]!.id))?.character.tenantId).toBe('server-tenant');
    const firstPage = await client.listCharacters({ tenantId: 'forged-tenant', limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.tenantId).toBe('server-tenant');
    expect(firstPage.nextCursor).toBeDefined();
    const secondPage = await client.listCharacters({ tenantId: 'forged-tenant', limit: 1, cursor: firstPage.nextCursor });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)))
      .toEqual(new Set([inputs[0]!.id, inputs[1]!.id]));
    const retry = await client.createCharacters(inputs);
    expect(retry.items.map((item) => item.status)).toEqual(['already_exists', 'already_exists', 'invalid']);
    expect((await store.load(inputs[0]!.id))?.character.profile.displayName).toBe('甲');
    const duplicate = await handler(new Request('http://runtime.test/v1/runtime/characters/batch', {
      method: 'POST',
      body: JSON.stringify({ characters: [inputs[0], inputs[0]] }),
    }));
    expect(duplicate.status).toBe(422);
    const empty = await handler(new Request('http://runtime.test/v1/runtime/characters/batch', {
      method: 'POST', body: JSON.stringify({ characters: [] }),
    }));
    expect(empty.status).toBe(422);
    const badPage = await handler(new Request('http://runtime.test/v1/runtime/characters?limit=0&tenantId=forged-tenant'));
    expect(badPage.status).toBe(422);
  });

  it('Turn 路由识别 turn + event 请求并执行原子提交', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const created = await api.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '原子 HTTP 角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const handler = createRuntimeHttpHandler(api, { allowAnonymous: true });
    const response = await handler(new Request(
      `http://runtime.test/v1/runtime/characters/${created.character.id}/turns`,
      {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-a',
          turn: {
            turnId: 'http-atomic-turn-1',
            conversationKey: 'chat-http-atomic',
            userMessage: '你好',
            assistantMessage: '你好，我在。',
            occurredAt: '2026-09-22T00:01:00.000Z',
          },
          event: {
            eventId: 'http-atomic-event-1',
            eventType: 'conversation_turn',
            occurredAt: '2026-09-22T00:01:00.000Z',
            payload: { userMessage: '你好', assistantMessage: '你好，我在。' },
          },
        }),
      }
    ));

    expect(response.status).toBe(200);
    const body = await response.json() as {
      turn: { userTurnId: string; assistantTurnId: string };
      result: { snapshot: { version: number }; event: { sourceTurnIds: string[] } };
    };
    expect(body.result.snapshot.version).toBe(1);
    expect(body.result.event.sourceTurnIds).toHaveLength(2);
    expect(body.result.event.sourceTurnIds).toEqual([
      body.turn.userTurnId,
      body.turn.assistantTurnId,
    ]);
  });
  it('服务端 Handler 使用认证租户覆盖请求体，避免客户端伪造 tenantId', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, {
      tenantId: 'tenant-authenticated',
      principal: { subject: 'test-user', tenantId: 'tenant-authenticated' },
    });
    const response = await handler(
      new Request('http://runtime.test/v1/runtime/characters', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-forged',
          profile: { displayName: '租户边界角色' },
          now: '2026-09-22T00:00:00.000Z',
        }),
      })
    );
    expect(response.status).toBe(201);
    const snapshot = await response.json() as { character: { tenantId: string } };
    expect(snapshot.character.tenantId).toBe('tenant-authenticated');
  });

  it('默认拒绝没有认证的 Runtime 请求（fail-closed）', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, { tenantId: 'tenant-legacy' });
    const response = await handler(new Request('http://runtime.test/v1/runtime/characters', {
      method: 'POST',
      body: JSON.stringify({ profile: { displayName: '匿名写入' } }),
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'AUTHENTICATION_REQUIRED' });
  });

  it('开启强制认证后拒绝匿名 Runtime 请求，并使用认证 principal 的租户', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, {
      requireAuthentication: true,
      authenticate: async (request) => request.headers.get('Authorization') === 'Bearer valid'
        ? { subject: 'user-1', tenantId: 'tenant-trusted' }
        : null,
    });
    const anonymous = await handler(new Request('http://runtime.test/v1/runtime/characters', {
      method: 'POST', body: JSON.stringify({ tenantId: 'tenant-forged', profile: { displayName: '匿名' } }),
    }));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ error: 'AUTHENTICATION_REQUIRED' });

    const authenticated = await handler(new Request('http://runtime.test/v1/runtime/characters', {
      method: 'POST', headers: { Authorization: 'Bearer valid' },
      body: JSON.stringify({ tenantId: 'tenant-forged', profile: { displayName: '可信身份' } }),
    }));
    expect(authenticated.status).toBe(201);
    expect((await authenticated.json()).character.tenantId).toBe('tenant-trusted');
  });

  it('健康检查在强制认证模式下保持公开', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, { requireAuthentication: true });
    const response = await handler(new Request('http://runtime.test/v1/runtime/health'));
    expect(response.status).toBe(200);
  });

  it('认证租户不能读取其他租户的角色或 Context', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const created = await api.createCharacter({
      tenantId: 'tenant-owner',
      profile: { displayName: '私有角色' },
    });
    const handler = createRuntimeHttpHandler(api, {
      requireAuthentication: true,
      authenticate: () => ({ subject: 'user-other', tenantId: 'tenant-other' }),
    });
    const get = await handler(new Request(`http://runtime.test/v1/runtime/characters/${created.character.id}`));
    expect(get.status).toBe(403);
    const context = await handler(new Request(
      `http://runtime.test/v1/runtime/characters/${created.character.id}/context`,
      { method: 'POST', body: JSON.stringify({ query: '私有' }) }
    ));
    expect(context.status).toBe(403);
  });

  it('可以注入成员授权器并拒绝未授权请求', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, {
      requireAuthentication: true,
      authenticate: () => ({ subject: 'user-1', tenantId: 'tenant-a' }),
      authorize: (_request, principal, context) =>
        principal.subject === 'user-1' && context.path === '/v1/runtime/characters',
    });
    const denied = await handler(new Request('http://runtime.test/v1/runtime/characters/not-owned'));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: 'MEMBER_FORBIDDEN' });
  });

  it('HttpRuntimeApi 保留服务端路径、认证头和错误语义', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const api = new HttpRuntimeApi({
      baseUrl: 'https://runtime.test/api/',
      headers: { Authorization: 'Bearer test-token' },
      fetch: async (input, init) => {
        calls.push({ input, init });
        return new Response(JSON.stringify({
          identity: { displayName: '远端角色' },
          traits: [],
          values: [],
          beliefs: [],
          currentState: { emotions: [], mood: {}, attitudes: [], relationships: [] },
          recentEvents: [],
          relevantMemories: [],
          relevantEpisodes: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const context = await api.buildContext('character/1', { query: '当前状态' });
    expect(context.identity.displayName).toBe('远端角色');
    expect(calls[0]?.input).toBe('https://runtime.test/api/v1/runtime/characters/character%2F1/context');
    expect(calls[0]?.init?.headers).toBeInstanceOf(Headers);
    expect((calls[0]?.init?.headers as Headers).get('Authorization')).toBe('Bearer test-token');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ query: '当前状态' });
  });

  it('HttpRuntimeApi 将 409 版本冲突转换为可判定错误', async () => {
    const api = new HttpRuntimeApi({
      baseUrl: 'https://runtime.test',
      fetch: async () => new Response(JSON.stringify({
        error: 'VERSION_CONFLICT',
        message: '版本冲突',
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    await expect(api.getCharacter('character-1')).rejects.toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: '版本冲突',
    } satisfies Partial<RuntimeApiError>);
  });

  it('重复创建同一角色返回明确的 409 已存在语义', async () => {
    const handler = createRuntimeHttpHandler(
      new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore())),
      { allowAnonymous: true }
    );
    const body = JSON.stringify({
      tenantId: 'tenant-a',
      id: '33333333-3333-4333-8333-333333333333',
      profile: { displayName: '已存在角色' },
    });
    const send = () => handler(new Request('http://runtime.test/v1/runtime/characters', {
      method: 'POST', body,
    }));
    expect((await send()).status).toBe(201);
    const duplicate = await send();
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: 'ALREADY_EXISTS' });
  });

  it('Handler 将重复 Event 内容冲突映射为 409', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const created = await api.createCharacter({
      tenantId: 'tenant-a',
      profile: { displayName: '幂等冲突角色' },
      now: '2026-09-22T00:00:00.000Z',
    });
    const handler = createRuntimeHttpHandler(api, { allowAnonymous: true });
    const path = `/v1/runtime/characters/${created.character.id}/events`;
    const first = await handler(new Request(`http://runtime.test${path}`, {
      method: 'POST',
      body: JSON.stringify({
        tenantId: 'tenant-a',
        eventId: 'same-event',
        eventType: 'first',
      }),
    }));
    const conflict = await handler(new Request(`http://runtime.test${path}`, {
      method: 'POST',
      body: JSON.stringify({
        tenantId: 'tenant-a',
        eventId: 'same-event',
        eventType: 'changed',
      }),
    }));
    expect(first.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'IDEMPOTENCY_CONFLICT' });
  });

  it('Handler 对畸形请求返回校验错误，且不泄露内部异常', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, { allowAnonymous: true });
    const post = (route: string, body: unknown) => handler(new Request(
      `http://runtime.test/v1/runtime/characters/character-1/${route}`,
      { method: 'POST', body: JSON.stringify(body) }
    ));
    const invalidAtomic = await post('turns', {
      tenantId: 'tenant-a',
      turn: { turnId: 1, userMessage: '你好', assistantMessage: '收到' },
      event: { eventType: 'conversation_turn' },
    });
    expect(invalidAtomic.status).toBe(422);
    expect(await invalidAtomic.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    const incompleteAtomic = await post('turns', {
      tenantId: 'tenant-a',
      turn: { turnId: 'turn-1', userMessage: '你好', assistantMessage: '收到' },
    });
    expect(incompleteAtomic.status).toBe(422);
    const invalidLegacy = await post('turns', { tenantId: 'tenant-a', turnId: 'turn-1' });
    expect(invalidLegacy.status).toBe(422);
    const invalidEvent = await post('events', { tenantId: 'tenant-a', eventType: 'greeting', payload: [] });
    expect(invalidEvent.status).toBe(422);
    const invalidContext = await post('context', null);
    expect(invalidContext.status).toBe(422);
    const invalidCharacter = await handler(new Request('http://runtime.test/v1/runtime/characters', {
      method: 'POST', body: 'null',
    }));
    expect(invalidCharacter.status).toBe(422);

    const brokenApi = new RuntimeApiAdapter(new RuntimeCore({
      load: async () => null,
      commit: async () => { throw new Error('内部数据库密码不可泄露'); },
    }));
    const brokenHandler = createRuntimeHttpHandler(brokenApi, { allowAnonymous: true });
    const internalError = await brokenHandler(new Request('http://runtime.test/v1/runtime/characters', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 'tenant-a', profile: { displayName: '安全测试' } }),
    }));
    expect(internalError.status).toBe(500);
    expect(await internalError.json()).toEqual({ error: 'RUNTIME_ERROR', message: 'Runtime 处理失败' });
  });

  it('Handler 拒绝不支持方法和非法 JSON', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, { allowAnonymous: true });
    const methodResponse = await handler(new Request('http://runtime.test/v1/runtime/health', { method: 'PUT' }));
    const jsonResponse = await handler(new Request('http://runtime.test/v1/runtime/characters', { method: 'POST', body: '{' }));
    expect(methodResponse.status).toBe(405);
    expect(jsonResponse.status).toBe(400);
  });
});
