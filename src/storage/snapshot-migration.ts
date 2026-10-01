/**
 * 快照版本信封与前向迁移框架（MIG-01）
 *
 * 背景：历史上各 store 的 `saveSnapshot` 直接写入裸数据（数组或对象），
 * 没有任何版本标记。一旦结构变化，加载端只能靠"猜"（例如 chat.ts 里
 * 用 `'memory' in saved` 判断是 v0 还是 v1）。这既无法演练升级，也无法
 * 保证"无静默删除"——读不懂的数据会被悄悄丢掉。
 *
 * 本模块提供三件事：
 * 1. 统一版本信封 `{ __snapshot, schemaVersion, data }`，写入端始终带版本；
 * 2. 前向迁移链：旧版本 → 新版本，每一步都有描述，可被报告记录；
 * 3. 无静默删除守卫：迁移链断裂或遇到更高版本时抛错，而不是返回残缺数据。
 *
 * 设计取舍：
 * - 信封对适配器透明：适配器仍存/取任意值，版本语义只在本层解���。
 * - 旧裸数据视为 legacyVersion（默认 0），由迁移链的第一段负责升级。
 * - 不自动写回：迁移只在内存中完成，是否持久化由调用方决定。
 */

/** 当前信封格式版本；信封自身结构变化时才递增。 */
export const SNAPSHOT_ENVELOPE_VERSION = 1;

/**
 * 本文件内所有中文字符串均为「开发者诊断消息与迁移审计描述」，
 * 面向开发/运维日志与兼容性报告，不渲染到 UI，因此不走 @/i18n
 * （与 src/utils/logger.ts 的日志豁免、services 层错误码文案同一处理方式）。
 * 逐条在行尾标注 i18n-ignore，避免块级豁免误放行后续真实 UI 文案。
 */

/** 带版本的信封结构。 */
export interface SnapshotEnvelope {
  /** 信封格式标记，用于与旧裸数据区分。 */
  __snapshot: typeof SNAPSHOT_ENVELOPE_VERSION;
  /** 业务数据结构版本；迁移链以此为基准。 */
  schemaVersion: number;
  /** 实际数据。 */
  data: unknown;
}

/** 迁移失败的错误码。 */
export type SnapshotMigrationErrorCode =
  | 'INVALID_ENVELOPE' // 信封结构非法
  | 'MISSING_STEP' // 迁移链断裂，无法从 from 升到 to
  | 'VERSION_AHEAD'; // 数据版本高于当前代码支持（降级保护）

/** 迁移相关错误；携带 code 便于上层区分处理与提示。 */
export class SnapshotMigrationError extends Error {
  constructor(
    public readonly code: SnapshotMigrationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SnapshotMigrationError';
  }
}

/** 单步前向迁移：把数据从 from 版本升到 to 版本。 */
export interface SnapshotMigrationStep {
  from: number;
  to: number;
  /** 人读描述，会进入迁移报告，便于排障与文档生成。 */
  description: string;
  /** 纯函数：返回迁移后的数据，不得修改入参。 */
  migrate(data: unknown): unknown;
}

/** 某个快照键的迁移计划。 */
export interface SnapshotMigrationPlan {
  /** 快照键，仅用于报告与错误信息。 */
  key: string;
  /** 当前代码支持的最新版本。 */
  currentVersion: number;
  /** 旧裸数据（无信封）对应的版本，通常是 0。 */
  legacyVersion?: number;
  /** 有序迁移链；可跳版本，但每个区间必须连续可覆盖。 */
  steps: readonly SnapshotMigrationStep[];
}

/** 迁移报告：记录了从哪个版本到哪个版本、实际执行了哪些步骤。 */
export interface SnapshotMigrationReport {
  key: string;
  fromVersion: number;
  toVersion: number;
  /** 实际执行的步骤描述，空数组表示数据已是当前版本。 */
  applied: Array<{ from: number; to: number; description: string }>;
  /**
   * 是否执行了至少一个迁移步骤（"步骤是否运行过"，而非"数据值是否改变"）。
   * 迁移步骤本身应幂等：对已迁移数据再跑一次，data 不变但本字段仍为 true。
   * 若需判断数据是否真的变化，请比较迁移前后的 data。
   */
  changed: boolean;
  /** 是否来自旧裸数据（无信封）。 */
  fromLegacy: boolean;
}

/** 判断一个值是否为合法信封。 */
export function isSnapshotEnvelope(value: unknown): value is SnapshotEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.__snapshot === SNAPSHOT_ENVELOPE_VERSION
    && typeof candidate.schemaVersion === 'number'
    && Number.isSafeInteger(candidate.schemaVersion)
    && candidate.schemaVersion >= 0
    && 'data' in candidate;
}

/** 写入端：把数据包成带版本的信封。 */
export function wrapSnapshot(data: unknown, schemaVersion: number): SnapshotEnvelope {
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 0) {
    throw new SnapshotMigrationError('INVALID_ENVELOPE', `schemaVersion 必须是非负安全整数：${schemaVersion}`); // i18n-ignore
  }
  return { __snapshot: SNAPSHOT_ENVELOPE_VERSION, schemaVersion, data };
}

/** 解析出数据与来源版本；旧裸数据回落到 legacyVersion。 */
export function unwrapSnapshot(
  raw: unknown,
  legacyVersion = 0
): { data: unknown; schemaVersion: number; fromLegacy: boolean } {
  if (raw === null || raw === undefined) {
    return { data: raw, schemaVersion: legacyVersion, fromLegacy: true };
  }
  if (isSnapshotEnvelope(raw)) {
    return { data: raw.data, schemaVersion: raw.schemaVersion, fromLegacy: false };
  }
  // 非信封即旧裸数据；不改写、不猜测结构，只标记来源版本。
  return { data: raw, schemaVersion: legacyVersion, fromLegacy: true };
}

/**
 * 按迁移链把数据从来源版本升级到目标版本。
 *
 * 与"尽力而为"相反：链路缺失一步就抛 MISSING_STEP，宁可不迁移也不静默丢字段。
 * 数据版本高于当前代码时抛 VERSION_AHEAD，避免降级时误删（例如生产已升级、
 * 用户回退到旧客户端）。
 */
export function migrateSnapshot<T>(
  raw: unknown,
  plan: SnapshotMigrationPlan
): { data: T; report: SnapshotMigrationReport } {
  const legacyVersion = plan.legacyVersion ?? 0;
  const { data, schemaVersion, fromLegacy } = unwrapSnapshot(raw, legacyVersion);
  const report: SnapshotMigrationReport = {
    key: plan.key,
    fromVersion: schemaVersion,
    toVersion: schemaVersion,
    applied: [],
    changed: false,
    fromLegacy,
  };

  if (schemaVersion > plan.currentVersion) {
    throw new SnapshotMigrationError(
      'VERSION_AHEAD',
      `快照 ${plan.key} 的版本 ${schemaVersion} 高于当前支持的 ${plan.currentVersion}，拒绝降级读取以免丢失数据`, // i18n-ignore
      { key: plan.key, schemaVersion, currentVersion: plan.currentVersion }
    );
  }
  if (schemaVersion === plan.currentVersion) {
    return { data: data as T, report };
  }

  // 逐段推进：每步必须从当前版本出发，否则视为链路断裂。
  let cursor = schemaVersion;
  let current = data;
  const guard = plan.steps.length + 1;
  for (let i = 0; i < guard && cursor < plan.currentVersion; i += 1) {
    const step = plan.steps.find((candidate) => candidate.from === cursor);
    if (!step) {
      throw new SnapshotMigrationError(
        'MISSING_STEP',
        `快照 ${plan.key} 缺少从版本 ${cursor} 出发的迁移步骤，无法升级到 ${plan.currentVersion}`, // i18n-ignore
        { key: plan.key, cursor, currentVersion: plan.currentVersion }
      );
    }
    if (step.to <= step.from) {
      throw new SnapshotMigrationError(
        'MISSING_STEP',
        `快照 ${plan.key} 的迁移步骤必须向前推进：${step.from} → ${step.to}`, // i18n-ignore
        { key: plan.key, from: step.from, to: step.to }
      );
    }
    current = step.migrate(current);
    report.applied.push({ from: step.from, to: step.to, description: step.description });
    report.changed = true;
    cursor = step.to;
  }
  if (cursor !== plan.currentVersion) {
    throw new SnapshotMigrationError(
      'MISSING_STEP',
      `快照 ${plan.key} 迁移链止于版本 ${cursor}，未达到 ${plan.currentVersion}`, // i18n-ignore
      { key: plan.key, cursor, currentVersion: plan.currentVersion }
    );
  }
  report.toVersion = cursor;
  return { data: current as T, report };
}

/**
 * 校验迁移计划本身是否自洽（不触碰数据）。
 * 用于测试与启动自检：链路断裂的计划应在加载任何数据前暴露。
 */
export function validateMigrationPlan(plan: SnapshotMigrationPlan): string[] {
  const errors: string[] = [];
  const legacyVersion = plan.legacyVersion ?? 0;
  if (legacyVersion > plan.currentVersion) {
    errors.push(`legacyVersion(${legacyVersion}) 不能高于 currentVersion(${plan.currentVersion})`); // i18n-ignore
  }
  const byFrom = new Map<number, number>();
  for (const step of plan.steps) {
    if (step.to <= step.from) errors.push(`步骤 ${step.from} → ${step.to} 未向前推进`); // i18n-ignore
    if (byFrom.has(step.from)) errors.push(`版本 ${step.from} 存在重复的迁移步骤`); // i18n-ignore
    byFrom.set(step.from, step.to);
  }
  // 从 legacyVersion 出发能否走到 currentVersion
  let cursor = legacyVersion;
  const visited = new Set<number>();
  while (cursor < plan.currentVersion) {
    if (visited.has(cursor)) { errors.push(`迁移链在版本 ${cursor} 形成环`); break; } // i18n-ignore
    visited.add(cursor);
    const next = byFrom.get(cursor);
    if (next === undefined) { errors.push(`缺少从版本 ${cursor} 出发的迁移步骤`); break; } // i18n-ignore
    cursor = next;
  }
  if (cursor > plan.currentVersion) errors.push(`迁移链越过目标版本，止于 ${cursor}`); // i18n-ignore
  return errors;
}
