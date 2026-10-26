import { RuntimeApiAdapter, type RuntimeApi } from './runtime-api';
import {
  createRuntimeHttpHandler,
} from './runtime-http-handler';
import {
  type RuntimeHttpHandler,
} from './http-envelope';
import { PostgresRuntimeStore, type SqlExecutor } from './postgres-store';
import { createPgPoolExecutor, type PgPoolLike } from './postgres-executor';
import { RuntimeCore, type RuntimeCoreOptions } from './runtime-core';
import { PostgresGroupRuntime } from './postgres-group-runtime';
import { createGroupRuntimeHttpHandler } from './runtime-group-http-handler';
import type { RuntimeAuthOptions } from './runtime-auth';
import type { RuntimeTraceSink } from './runtime-trace';

export interface PostgresRuntimeApiOptions {
  auditActorType?: 'system' | 'migration';
  core?: RuntimeCoreOptions;
  /** HTTP 宿主注入的认证解析器；未配置时默认拒绝未认证请求（仅 allowAnonymous 可显式放开）。 */
  httpAuth?: RuntimeAuthOptions;
  /**
   * 关联事件接收器（OBS-01）；宿主注入后，每个 Runtime 请求的
   * 关联 ID、方法、路径、状态与耗时都会回调，便于落日志与指标。
   * 缺省不产生任何日志副作用，保持 runtime 层零依赖。
   */
  onTrace?: RuntimeTraceSink;
}

/**
 * 服务端唯一的 Runtime 组合入口。
 *
 * SQL 执行器由服务端注入（例如 pg.Pool 包装器）；浏览器不应调用此工厂。
 * 返回值仍然是 RuntimeApi，因此 HTTP、Tauri command 和测试可以复用同一边界。
 */
export function createPostgresRuntimeApi(
  sql: SqlExecutor,
  tenantId: string,
  options: PostgresRuntimeApiOptions = {}
): RuntimeApi {
  const store = new PostgresRuntimeStore(sql, tenantId, options.auditActorType);
  return new RuntimeApiAdapter(new RuntimeCore(store, options.core));
}

/** 将 PostgreSQL RuntimeApi 暴露为可挂载到 Node、Bun、Deno 或 Tauri 网关的 Fetch Handler。 */
export function createPostgresRuntimeHttpHandler(
  sql: SqlExecutor,
  tenantId: string,
  options: PostgresRuntimeApiOptions = {}
): RuntimeHttpHandler {
  const httpOptions = { ...options.httpAuth, tenantId, ...(options.onTrace ? { onTrace: options.onTrace } : {}) };
  const characters = createRuntimeHttpHandler(createPostgresRuntimeApi(sql, tenantId, options), httpOptions);
  const groups = createPostgresGroupRuntimeHttpHandler(sql, tenantId, options.httpAuth, options.onTrace);
  return (request) => {
    const pathname = new URL(request.url).pathname;
    return pathname === '/v1/runtime/groups' || pathname.startsWith('/v1/runtime/groups/')
      ? groups(request)
      : characters(request);
  };
}

/** 使用真实 node-postgres Pool 的服务端 Runtime 组合入口。 */
export function createPgPoolRuntimeApi(
  pool: PgPoolLike,
  tenantId: string,
  options: PostgresRuntimeApiOptions = {}
): RuntimeApi {
  return createPostgresRuntimeApi(createPgPoolExecutor(pool), tenantId, options);
}

/** 使用真实 node-postgres Pool 的 Runtime Fetch Handler。 */
export function createPgPoolRuntimeHttpHandler(
  pool: PgPoolLike,
  tenantId: string,
  options: PostgresRuntimeApiOptions = {}
): RuntimeHttpHandler {
  return createPostgresRuntimeHttpHandler(createPgPoolExecutor(pool), tenantId, options);
}

/** 服务端群聊事务入口；组与成员身份由已认证的租户作用域约束。 */
export function createPostgresGroupRuntime(sql: SqlExecutor, tenantId: string): PostgresGroupRuntime {
  return new PostgresGroupRuntime(sql, tenantId);
}

/** node-postgres Pool 的群聊事务入口。 */
export function createPgPoolGroupRuntime(pool: PgPoolLike, tenantId: string): PostgresGroupRuntime {
  return createPostgresGroupRuntime(createPgPoolExecutor(pool), tenantId);
}

/** 将已认证租户作用域内的群聊 Runtime 暴露为 Fetch Handler。 */
export function createPostgresGroupRuntimeHttpHandler(
  sql: SqlExecutor,
  tenantId: string,
  authOptions: RuntimeAuthOptions = {},
  onTrace?: RuntimeTraceSink
): RuntimeHttpHandler {
  return createGroupRuntimeHttpHandler(createPostgresGroupRuntime(sql, tenantId), {
    ...authOptions,
    tenantId,
    ...(onTrace ? { onTrace } : {}),
  });
}

/** 使用 node-postgres Pool 的群聊 HTTP Handler。 */
export function createPgPoolGroupRuntimeHttpHandler(
  pool: PgPoolLike,
  tenantId: string,
  authOptions: RuntimeAuthOptions = {},
  onTrace?: RuntimeTraceSink
): RuntimeHttpHandler {
  return createPostgresGroupRuntimeHttpHandler(createPgPoolExecutor(pool), tenantId, authOptions, onTrace);
}
