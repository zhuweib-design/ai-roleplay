import { describe, expect, it } from 'vitest';
import {
  ensureTarget,
  insertEpisode,
  insertMemory,
  insertStateChange,
} from '@/runtime/postgres-store-writer';
import type { SqlExecutor, SqlResult } from '@/runtime/postgres-sql-port';
import type { StateChange } from '@/runtime/types';

const tenantId = '11111111-1111-4111-8111-111111111111';
const characterId = '22222222-2222-4222-8222-222222222222';
const targetId = '77777777-7777-4777-8777-777777777777';
const episodeId = '44444444-4444-4444-8444-444444444444';
const eventId = '33333333-3333-4333-8333-333333333333';

/**
 * 这些用例证明 SQL 写入层已经脱离 PostgresRuntimeStore：
 * 只造一个 SqlExecutor 假体就能直接驱动，不需要构造 store 实例、
 * 也不需要伪造 characters 行的版本锁。
 */
function recordingSql(rowsFor: (text: string) => unknown[] = () => []) {
  const queries: string[] = [];
  const params: unknown[][] = [];
  const sql: SqlExecutor = {
    async query<Row = Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = []
    ): Promise<SqlResult<Row>> {
      queries.push(text);
      params.push([...values]);
      const rows = rowsFor(text) as Row[];
      return { rows, rowCount: rows.length || 1 };
    },
    async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
      return work(sql);
    },
  };
  return { sql, queries, params };
}

describe('postgres-store-writer', () => {
  it('ensureTarget 用显式 tenantId 建占位 Target 并校验租户', async () => {
    const { sql, params } = recordingSql(() => [{ tenant_id: tenantId }]);
    const result = await ensureTarget(sql, tenantId, targetId, {
      type: 'preference',
      canonicalName: 'music',
    });
    expect(result).toBe(targetId);
    expect(params[0]?.[1]).toBe(tenantId);
    expect(params[0]?.[2]).toBe('preference');
  });

  it('ensureTarget 拒绝跨租户 Target', async () => {
    const { sql } = recordingSql(() => [{ tenant_id: 'other-tenant' }]);
    await expect(ensureTarget(sql, tenantId, targetId)).rejects.toThrow('租户隔离校验失败');
  });

  it('ensureTarget 对非 UUID 直接返回 null，不落库', async () => {
    const { sql, queries } = recordingSql();
    expect(await ensureTarget(sql, tenantId, 'not-a-uuid')).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('insertMemory 显式传 tenantId 校验来源事件归属', async () => {
    const { sql, params } = recordingSql((text) =>
      text.includes('SELECT 1 FROM events') ? [{ 1: 1 }] : []
    );
    await insertMemory(sql, tenantId, {
      id: eventId,
      characterId,
      type: 'episodic',
      content: '记得那场雨',
      importance: 0.6,
      salience: 0.7,
      occurredAt: '2026-10-22T00:00:00.000Z',
      sourceEventId: eventId,
    } as never);
    const eventLookup = params.find((p) => p[2] === tenantId);
    expect(eventLookup?.[0]).toBe(eventId);
    expect(eventLookup?.[1]).toBe(characterId);
  });

  it('insertEpisode 不带 tenantId 参数（纯表写入）', async () => {
    const { sql, queries } = recordingSql();
    await insertEpisode(sql, characterId, {
      id: episodeId,
      topic: '争执',
      startedAt: '2026-10-22T00:00:00.000Z',
      lastEventAt: '2026-10-22T01:00:00.000Z',
      peakIntensity: 0.8,
      status: 'active',
      currentIntensity: 0.5,
      salience: 0.6,
      residualInfluence: 0.2,
      unresolved: true,
      eventIds: [],
    } as never);
    expect(queries.some((q) => q.includes('INSERT INTO emotion_episodes'))).toBe(true);
  });

  it('insertStateChange 把显式 tenantId 用于 Target 兜底', async () => {
    const { sql, queries, params } = recordingSql(() => [{ tenant_id: tenantId }]);
    const change = {
      id: eventId,
      eventId,
      characterId,
      stateType: 'emotion',
      targetId,
      dimension: 'joy',
      delta: 0.2,
      newValue: 0.7,
      changes: {},
    } as unknown as StateChange;
    await insertStateChange(sql, tenantId, change);
    expect(params[0]?.[1]).toBe(tenantId);
    expect(queries.some((q) => q.includes('INSERT INTO state_changes'))).toBe(true);
  });
});
