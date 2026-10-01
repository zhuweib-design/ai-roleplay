import { describe, expect, it } from 'vitest';
import {
  SnapshotMigrationError,
  isSnapshotEnvelope,
  validateMigrationPlan,
  wrapSnapshot,
  unwrapSnapshot,
  migrateSnapshot,
  type SnapshotMigrationPlan,
} from '@storage/snapshot-migration';
import {
  SNAPSHOT_MIGRATION_PLANS,
  LOCAL_MEMORY_MIGRATION_PLAN,
  PENDING_GROUP_TURNS_MIGRATION_PLAN,
  CHARACTER_VERSIONS_MIGRATION_PLAN,
} from '@storage/snapshot-plans';

/**
 * MIG-01 · 跨版本迁移套件
 *
 * 覆盖计划要求的四项交付物：
 * - migration fixtures：真实历史形态样本（见下方各 describe 的初始数据）
 * - forward migration：旧版本 → 当前版本，且可重复执行（幂等）
 * - restore verification：迁移后数据仍可被加载端消费（字段齐全、无丢失）
 * - 兼容性报告：迁移报告记录版本与已执行步骤
 * 核心不变式：**无静默删除**——链路断裂或版本超前必须抛错，不得返回残缺数据。
 */

/** 代表性样本：0.4.0 前直接保存的 MemoryStore 裸序列化结果。 */
const LEGACY_MEMORY = {
  version: 1,
  facts: [
    { id: 'fact-1', scope: 'scoped', kind: 'session', snapshots: [{ value: '用户喜欢红茶' }] },
  ],
};

/** 代表性样本：0.3.0 的群聊投递记录，缺 occurredAt 与 status。 */
const LEGACY_PENDING_TURNS = [
  {
    groupId: 'g1', turnId: 't1', speakerCharacterId: 'c1',
    userMessage: '问', assistantMessage: '答', attempts: 1, createdAt: '2026-09-01T00:00:00.000Z',
  },
];

/** 代表性样本：早期角色版本仓库，缺 activeLocks。 */
const LEGACY_REPOS = [{ characterId: 'c1', currentBranch: 'main', branches: [], commits: [] }];

/** 故障数据样本：人为损坏的迁移链，用于验证"不静默"行为。 */
const BROKEN_PLAN: SnapshotMigrationPlan = {
  key: 'test:broken',
  currentVersion: 3,
  legacyVersion: 0,
  steps: [{ from: 0, to: 2, description: '跳到 2 后断链', migrate: (d) => d }],
};

describe('信封与版本识别', () => {
  it('wrapSnapshot 产出可被识别的信封，并可无损拆回', () => {
    const envelope = wrapSnapshot({ a: 1 }, 2);
    expect(isSnapshotEnvelope(envelope)).toBe(true);
    const parsed = unwrapSnapshot(envelope, 0);
    expect(parsed).toMatchObject({ schemaVersion: 2, fromLegacy: false });
    expect(parsed.data).toEqual({ a: 1 });
  });

  it('旧裸数据被标记为 legacy，且不被改写', () => {
    const parsed = unwrapSnapshot([1, 2, 3], 0);
    expect(parsed).toMatchObject({ schemaVersion: 0, fromLegacy: true });
    expect(parsed.data).toEqual([1, 2, 3]);
  });

  it('拒绝非法 schemaVersion 写入', () => {
    expect(() => wrapSnapshot({}, -1)).toThrow(SnapshotMigrationError);
    expect(() => wrapSnapshot({}, 1.5)).toThrow(SnapshotMigrationError);
  });
});

describe('真实快照的向前迁移（fixtures 全部来自仓库既有兼容分支）', () => {
  it('本地记忆：裸 MemoryStore → 三段式，facts 不丢失', () => {
    const { data, report } = migrateSnapshot<{ memory?: unknown; emotions?: unknown }>(
      LEGACY_MEMORY, LOCAL_MEMORY_MIGRATION_PLAN,
    );
    expect(report).toMatchObject({ fromVersion: 0, toVersion: 1, changed: true, fromLegacy: true });
    expect(report.applied).toHaveLength(1);
    expect((data.memory as { facts: unknown[] }).facts).toHaveLength(1);
    expect(data.emotions).toBeNull();
  });

  it('本地记忆：已是三段式时不二次包裹（幂等）', () => {
    const current = { version: 1, memory: LEGACY_MEMORY, emotions: { joy: 0.5 } };
    const { data } = migrateSnapshot(current, LOCAL_MEMORY_MIGRATION_PLAN);
    expect(data).toEqual(current);
  });

  it('群聊投递队列：补 occurredAt 与 status，原字段保留', () => {
    const { data } = migrateSnapshot<Array<Record<string, unknown>>>(
      LEGACY_PENDING_TURNS, PENDING_GROUP_TURNS_MIGRATION_PLAN,
    );
    expect(data[0]).toMatchObject({
      occurredAt: '2026-09-01T00:00:00.000Z',
      status: 'failed',
      userMessage: '问',
      attempts: 1,
    });
  });

  it('群聊投递队列：已有 occurredAt/status 时保持不变', () => {
    const item = { ...LEGACY_PENDING_TURNS[0], occurredAt: '2026-09-02T00:00:00.000Z', status: 'pending' };
    const { data } = migrateSnapshot<Array<Record<string, unknown>>>([item], PENDING_GROUP_TURNS_MIGRATION_PLAN);
    expect(data[0]).toMatchObject({ occurredAt: '2026-09-02T00:00:00.000Z', status: 'pending' });
  });

  it('角色版本仓库：补 activeLocks 空数组', () => {
    const { data } = migrateSnapshot<Array<Record<string, unknown>>>(
      LEGACY_REPOS, CHARACTER_VERSIONS_MIGRATION_PLAN,
    );
    expect(data[0]!.activeLocks).toEqual([]);
  });

  it('迁移对已迁移数据幂等：二次执行数据不变', () => {
    const first = migrateSnapshot(LEGACY_MEMORY, LOCAL_MEMORY_MIGRATION_PLAN);
    const second = migrateSnapshot(first.data, LOCAL_MEMORY_MIGRATION_PLAN);
    // 步骤会再次执行（无信封数据仍视为 legacy），但结果必须一致——这才是幂等。
    expect(second.data).toEqual(first.data);
  });

  it('已带信封的数据直接通过，报告标注来源', () => {
    const envelope = wrapSnapshot({ version: 1, memory: LEGACY_MEMORY, emotions: null }, 1);
    const { report } = migrateSnapshot(envelope, LOCAL_MEMORY_MIGRATION_PLAN);
    expect(report).toMatchObject({ fromLegacy: false, changed: false, fromVersion: 1, toVersion: 1 });
  });
});

describe('无静默删除守卫', () => {
  it('迁移链断裂时抛 MISSING_STEP，而非返回残缺数据', () => {
    const error = (() => {
      try { migrateSnapshot({}, BROKEN_PLAN); return null; } catch (e) { return e; }
    })();
    expect(error).toBeInstanceOf(SnapshotMigrationError);
    expect((error as SnapshotMigrationError).code).toBe('MISSING_STEP');
  });

  it('数据版本高于当前代码时抛 VERSION_AHEAD，避免降级误删', () => {
    const ahead = wrapSnapshot({}, 5);
    expect(() => migrateSnapshot(ahead, LOCAL_MEMORY_MIGRATION_PLAN)).toThrow(SnapshotMigrationError);
    try {
      migrateSnapshot(ahead, LOCAL_MEMORY_MIGRATION_PLAN);
    } catch (e) {
      expect((e as SnapshotMigrationError).code).toBe('VERSION_AHEAD');
    }
  });

  it('非数组/非对象的损坏记录不会导致整体崩溃', () => {
    const { data } = migrateSnapshot<unknown>([null, 42, 'str', LEGACY_REPOS[0]], CHARACTER_VERSIONS_MIGRATION_PLAN);
    expect(data).toHaveLength(4);
    // 损坏项原样保留，不静默丢弃
    expect((data as unknown[])[0]).toBeNull();
    expect((data as unknown[])[1]).toBe(42);
  });
});

describe('计划自检与兼容性报告', () => {
  it('仓库内全部已登记计划均自洽（链路连续、无环）', () => {
    for (const plan of SNAPSHOT_MIGRATION_PLANS) {
      expect(validateMigrationPlan(plan), `计划 ${plan.key} 不自洽`).toEqual([]);
    }
  });

  it('自检能识别断裂的计划', () => {
    expect(validateMigrationPlan(BROKEN_PLAN)).toContain('缺少从版本 2 出发的迁移步骤');
  });

  it('迁移报告记录版本区间与实际步骤，可用于兼容性归档', () => {
    const { report } = migrateSnapshot(LEGACY_MEMORY, LOCAL_MEMORY_MIGRATION_PLAN);
    expect(report).toMatchObject({ key: 'runtime:local-memory-store:v1', fromVersion: 0, toVersion: 1 });
    expect(report.applied[0]!.description).toContain('三段式');
  });
});
