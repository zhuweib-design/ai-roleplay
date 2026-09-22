import type { SqlExecutor, SqlResult } from './postgres-store';

export interface PgQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

/** pg.Pool.connect() 返回对象所需的最小能力。 */
export interface PgClientLike {
  query<Row = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<PgQueryResult<Row>>;
  release(): void;
}

/** 与 node-postgres Pool 兼容的最小结构，不把 pg 依赖打进浏览器构建。 */
export interface PgPoolLike {
  query<Row = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<PgQueryResult<Row>>;
  connect(): Promise<PgClientLike>;
}

function normalizeResult<Row>(result: PgQueryResult<Row>): SqlResult<Row> {
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? 0,
  };
}

class PgClientExecutor implements SqlExecutor {
  constructor(private readonly client: PgClientLike) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    params: unknown[] = []
  ): Promise<SqlResult<Row>> {
    return normalizeResult(await this.client.query<Row>(text, params));
  }

  async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    await this.query('BEGIN');
    try {
      const result = await work(this);
      await this.query('COMMIT');
      return result;
    } catch (error) {
      await this.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
}

/**
 * 将真实 node-postgres Pool 适配为 RuntimeStore 使用的 SqlExecutor。
 *
 * 该文件只依赖结构类型，因此前端不会因为 Runtime 导出而打包 pg；服务端
 * 只需安装 pg 并把 Pool 实例传入即可。事务内所有查询固定使用同一个 client。
 */
export function createPgPoolExecutor(pool: PgPoolLike): SqlExecutor {
  return {
    async query<Row = Record<string, unknown>>(
      text: string,
      params: unknown[] = []
    ): Promise<SqlResult<Row>> {
      return normalizeResult(await pool.query<Row>(text, params));
    },
    async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      const executor = new PgClientExecutor(client);
      try {
        return await executor.transaction(work);
      } finally {
        client.release();
      }
    },
  };
}
