/**
 * PG handler 的认证旋钮——本机可跑的证明
 *
 * 背景：CI 上 `postgres-runtime.integration` 与 `postgres-group.integration` 两条红，
 * 报 `RuntimeApiError: Runtime 请求需要认证`。成因是 B1/B2 之后 HTTP 信封默认拒绝
 * 未认证请求，而这两个集成用例直接 `createPgPoolRuntimeHttpHandler(pool, tenant)`
 * 建处理器、没给任何认证参数——测试没跟上产品变化，不是产品缺陷。修法是用工厂本来就
 * 留着的旋钮（`server-runtime.ts` 的 `httpAuth` 注释写明"仅 allowAnonymous 可显式放开"）。
 *
 * 但那条修版本机验不了：本机没有 PostgreSQL（5432 无监听、无 psql），集成用例会整条跳过。
 * 所以这里用假执行器把**修法的机制前提**钉住，两条互为对照、唯一变量就是那个旋钮：
 * - 不带 allowAnonymous ⇒ 401 AUTHENTICATION_REQUIRED，且执行器一次都没被调用（门在碰库之前）；
 * - 带 allowAnonymous ⇒ 不被 401 挡下（要么走到执行器、要么执行器抛出）。
 * 这两条一起证明"补上的那个参数确实是生效的那一颗"，而不是一句猜测。
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createPostgresRuntimeHttpHandler } from '@/runtime/server-runtime';
import type { SqlExecutor } from '@/runtime/postgres-sql-port';

/** 记录是否被调用；被调用即抛出，好让"穿过认证门"这件事可见 */
function spyExecutor(calls: string[]): SqlExecutor {
  const boom = async (kind: 'query' | 'transaction'): Promise<never> => {
    calls.push(kind);
    throw new Error(`执行器被调用：${kind}`);
  };
  // 零参数函数可赋给带参签名，Promise<never> 可赋给任意 Promise<T>——不需要 as 强转
  return {
    query: () => boom('query'),
    transaction: () => boom('transaction'),
  };
}

const request = () => new Request('http://runtime.test/v1/runtime/characters/c1');

// 租户 id 在构造期就被 uuid() 校验挡下（不是 UUID 直接抛），所以这里给真 UUID
const TENANT = randomUUID();

describe('createPostgresRuntimeHttpHandler 的 httpAuth.allowAnonymous', () => {
  it('不配置 ⇒ 401 AUTHENTICATION_REQUIRED，且执行器一次都没被调用', async () => {
    const calls: string[] = [];
    const handler = createPostgresRuntimeHttpHandler(spyExecutor(calls), TENANT);
    const response = await handler(request());

    expect(response.status).toBe(401);
    expect((await response.json() as { error?: string }).error).toBe('AUTHENTICATION_REQUIRED');
    expect(calls).toEqual([]);
  });

  it('配置 allowAnonymous ⇒ 不再被认证门挡下（同一请求、只多这一个参数）', async () => {
    const calls: string[] = [];
    const handler = createPostgresRuntimeHttpHandler(spyExecutor(calls), TENANT, {
      httpAuth: { allowAnonymous: true },
    });

    let status: number | 'threw' = 'threw';
    try {
      const response = await handler(request());
      status = response.status;
    } catch {
      // 执行器被调用才走到这里；能到这里就说明认证门已经放行
    }

    expect(status === 'threw' || status !== 401, `实际 status=${String(status)}`).toBe(true);
    if (status !== 'threw' && status === 404) {
      // 路由没命中也算穿过认证（404 不是 401），但不该被误读成"验证过了库"
      expect(calls).toEqual([]);
    }
  });
});
