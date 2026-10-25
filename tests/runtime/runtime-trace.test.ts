import { describe, expect, it } from 'vitest';
import {
  HttpGroupRuntimeApi,
  HttpRuntimeApi,
  InMemoryRuntimeStore,
  RUNTIME_TRACE_HEADER,
  RuntimeApiAdapter,
  RuntimeApiError,
  RuntimeCore,
  createGroupRuntimeHttpHandler,
  createRuntimeHttpHandler,
  createTraceId,
  normalizeTraceId,
  type GroupRuntimeApi,
  type RuntimeTraceEvent,
} from '@/runtime';

/**
 * OBS-01 · Runtime 关联 ID（correlation / trace id）
 *
 * 验证「客户端注入 → 服务端解析/回显 → 日志上报」这条链路，确保一次调用
 * 的客户端与服务端记录可以用同一个 ID 串起来。
 */

function createApi(): RuntimeApiAdapter {
  return new RuntimeApiAdapter(new RuntimeCore(new InMemoryRuntimeStore()));
}

const TRACE = 'trace-fixed-0001';

describe('关联 ID 工具', () => {
  it('生成的 ID 满足白名单字符集与长度', () => {
    expect(normalizeTraceId(createTraceId())).not.toBeNull();
  });

  it('拒绝会污染日志或响应头的非法值', () => {
    expect(normalizeTraceId('short')).toBeNull();
    expect(normalizeTraceId('bad id with space')).toBeNull();
    expect(normalizeTraceId('bad\nid-injection-value')).toBeNull();
    expect(normalizeTraceId(undefined)).toBeNull();
    expect(normalizeTraceId('  ' + TRACE + '  ')).toBe(TRACE);
  });
});

describe('单聊 Runtime HTTP 关联 ID', () => {
  it('服务端回显客户端注入的 ID，并通过 onTrace 上报时延', async () => {
    const events: RuntimeTraceEvent[] = [];
    const handler = createRuntimeHttpHandler(createApi(), { tenantId: 'tenant-a', allowAnonymous: true, onTrace: (e) => events.push(e) });
    const response = await handler(new Request('http://runtime.test/v1/runtime/health', {
      headers: { [RUNTIME_TRACE_HEADER]: TRACE },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get(RUNTIME_TRACE_HEADER)).toBe(TRACE);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ traceId: TRACE, method: 'GET', status: 200 });
    expect(events[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('客户端未注入时服务端生成兜底 ID，保证仍可关联', async () => {
    const events: RuntimeTraceEvent[] = [];
    const handler = createRuntimeHttpHandler(createApi(), { tenantId: 'tenant-a', allowAnonymous: true, onTrace: (e) => events.push(e) });
    const response = await handler(new Request('http://runtime.test/v1/runtime/health'));
    const echoed = response.headers.get(RUNTIME_TRACE_HEADER);
    expect(echoed).toBeTruthy();
    expect(events[0]!.traceId).toBe(echoed);
  });

  it('失败请求同样回显 ID，并带在 RuntimeApiError 上', async () => {
    const handler = createRuntimeHttpHandler(createApi(), {
      requireAuthentication: true,
      authenticate: () => null,
    });
    const client = new HttpRuntimeApi({
      baseUrl: 'http://runtime.test',
      fetch: (input, init) => handler(new Request(input, init)),
      traceId: () => TRACE,
    });
    const error = await client.listCharacters({ tenantId: 'tenant-a' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RuntimeApiError);
    expect((error as RuntimeApiError).status).toBe(401);
    expect((error as RuntimeApiError).traceId).toBe(TRACE);
  });

  it('客户端注入的 ID 能到达服务端（认证解析器可读到同一头）', async () => {
    const seen: Array<string | null> = [];
    const handler = createRuntimeHttpHandler(createApi(), {
      tenantId: 'tenant-a',
      onTrace: () => {},
      authenticate: (request) => {
        seen.push(request.headers.get(RUNTIME_TRACE_HEADER));
        return { subject: 'user-1', tenantId: 'tenant-a' };
      },
    });
    const client = new HttpRuntimeApi({
      baseUrl: 'http://runtime.test',
      fetch: (input, init) => handler(new Request(input, init)),
      traceId: () => TRACE,
    });
    await client.listCharacters({ tenantId: 'tenant-a' });
    expect(seen).toEqual([TRACE]);
  });
});

describe('群聊 Runtime HTTP 关联 ID', () => {
  it('Handler 回显客户端 ID 并上报，客户端错误带同一 ID', async () => {
    const events: RuntimeTraceEvent[] = [];
    const api = {
      async getGroupState() {
        throw new Error('boom');
      },
    } as unknown as GroupRuntimeApi;
    const handler = createGroupRuntimeHttpHandler(api, { allowAnonymous: true, onTrace: (e) => events.push(e) });
    const response = await handler(new Request('http://runtime.test/v1/runtime/groups/g', {
      headers: { [RUNTIME_TRACE_HEADER]: TRACE },
    }));
    expect(response.status).toBe(500);
    expect(response.headers.get(RUNTIME_TRACE_HEADER)).toBe(TRACE);
    expect(events[0]).toMatchObject({ traceId: TRACE, status: 500, method: 'GET' });
  });

  it('群聊客户端把关联 ID 注入请求头并在失败时保留', async () => {
    let captured: string | null = null;
    const client = new HttpGroupRuntimeApi({
      baseUrl: 'http://runtime.test',
      traceId: () => TRACE,
      fetch: async (_input, init) => {
        captured = new Headers(init?.headers).get(RUNTIME_TRACE_HEADER);
        return new Response(JSON.stringify({ error: 'GROUP_VERSION_CONFLICT' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', [RUNTIME_TRACE_HEADER]: TRACE },
        });
      },
    });
    const error = await client.setGroupStatus({ groupId: 'g', status: 'archived' }).catch((e: unknown) => e);
    expect(captured).toBe(TRACE);
    expect(error).toBeInstanceOf(RuntimeApiError);
    expect((error as RuntimeApiError).traceId).toBe(TRACE);
  });
});
