import { describe, expect, it } from 'vitest';
import { createPgPoolExecutor, type PgClientLike, type PgPoolLike } from '@/runtime/postgres-executor';

function makePool() {
  const calls: string[] = [];
  let released = false;
  const client: PgClientLike = {
    async query<Row = Record<string, unknown>>(text: string): Promise<{ rows: Row[]; rowCount: number }> {
      calls.push(text);
      return { rows: [] as Row[], rowCount: 1 };
    },
    release: () => {
      released = true;
    },
  };
  const pool: PgPoolLike = {
    async query<Row = Record<string, unknown>>(text: string): Promise<{ rows: Row[]; rowCount: number }> {
      calls.push(`pool:${text}`);
      return { rows: [{ value: 1 }] as Row[], rowCount: 1 };
    },
    async connect() {
      return client;
    },
  };
  return { pool, calls, get released() { return released; } };
}

describe('PostgreSQL Pool Executor', () => {
  it('将 Pool 查询结果适配为 SqlExecutor', async () => {
    const fixture = makePool();
    const executor = createPgPoolExecutor(fixture.pool);

    await expect(executor.query<{ value: number }>('SELECT 1')).resolves.toEqual({
      rows: [{ value: 1 }],
      rowCount: 1,
    });
    expect(fixture.calls).toEqual(['pool:SELECT 1']);
  });

  it('在同一个 client 上提交事务并释放连接', async () => {
    const fixture = makePool();
    const executor = createPgPoolExecutor(fixture.pool);

    await expect(executor.transaction(async (transaction) => {
      await transaction.query('INSERT INTO events');
      return 'committed';
    })).resolves.toBe('committed');

    expect(fixture.calls).toEqual(['BEGIN', 'INSERT INTO events', 'COMMIT']);
    expect(fixture.released).toBe(true);
  });

  it('业务异常时回滚并继续释放连接，且保留原始异常', async () => {
    const fixture = makePool();
    const executor = createPgPoolExecutor(fixture.pool);
    const failure = new Error('write failed');

    await expect(executor.transaction(async () => {
      throw failure;
    })).rejects.toBe(failure);

    expect(fixture.calls).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fixture.released).toBe(true);
  });
});
