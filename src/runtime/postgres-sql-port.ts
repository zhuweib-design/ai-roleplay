/**
 * PostgreSQL Runtime —— 驱动端口与纯工具
 *
 * 本层零业务、零状态，被写入层（postgres-store-writer）与宿主
 * （postgres-store）共同依赖，因此必须放在依赖图最底层：
 * 两端都从这里取 SqlExecutor / isUuid / json，彼此不互相 import，
 * 避免宿主与写入层形成环形依赖（R4-8 / R4-11 的同型问题）。
 */

export interface SqlResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

/**
 * PostgreSQL 驱动的最小端口。
 * pg.Pool、Tauri Rust command 或服务端 RPC 只需要实现这个端口即可接入。
 */
export interface SqlExecutor {
  query<Row = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<SqlResult<Row>>;
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
}

function parseJson<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}

function slugify(value: string, stableId?: string): string {
  const slug = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  const base = slug || 'character';
  const suffix = stableId?.replace(/[^0-9a-z]/gi, '').slice(0, 8).toLocaleLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export { isUuid, json, parseJson, slugify };
