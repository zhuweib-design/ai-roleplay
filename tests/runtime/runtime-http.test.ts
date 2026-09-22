import { describe, expect, it } from 'vitest';
import {
  HttpRuntimeApi,
  InMemoryRuntimeStore,
  RuntimeApiAdapter,
  RuntimeApiError,
  RuntimeCore,
  createRuntimeHttpHandler,
} from '@/runtime';

describe('Runtime HTTP 持久化边界', () => {
  it('Fetch Handler 可以承载角色、Event、Snapshot 和 Context 的完整请求链', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api);

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
    expect((await eventResponse.json()).event.id).toBe('http-turn-1');

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
    expect((await getResponse.json()).version).toBe(1);
  });

  it('服务端 Handler 使用认证租户覆盖请求体，避免客户端伪造 tenantId', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api, { tenantId: 'tenant-authenticated' });
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

  it('Handler 拒绝不支持方法和非法 JSON', async () => {
    const api = new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
    const handler = createRuntimeHttpHandler(api);
    const methodResponse = await handler(new Request('http://runtime.test/v1/runtime/health', { method: 'PUT' }));
    const jsonResponse = await handler(new Request('http://runtime.test/v1/runtime/characters', { method: 'POST', body: '{' }));
    expect(methodResponse.status).toBe(405);
    expect(jsonResponse.status).toBe(400);
  });
});
