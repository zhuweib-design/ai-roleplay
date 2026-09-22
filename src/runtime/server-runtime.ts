import { RuntimeApiAdapter, type RuntimeApi } from './runtime-api';
import {
  createRuntimeHttpHandler,
  type RuntimeHttpHandler,
} from './runtime-http';
import { PostgresRuntimeStore, type SqlExecutor } from './postgres-store';
import { RuntimeCore, type RuntimeCoreOptions } from './runtime-core';

export interface PostgresRuntimeApiOptions {
  auditActorType?: 'system' | 'migration';
  core?: RuntimeCoreOptions;
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
  return createRuntimeHttpHandler(createPostgresRuntimeApi(sql, tenantId, options), {
    tenantId,
  });
}
