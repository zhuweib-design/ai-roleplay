/**
 * 已知快照的迁移计划登记表（MIG-01）
 *
 * 每个计划对应仓库里一个真实存在的历史形态差异，来源均有代码注释或
 * 兼容分支为证，不凭空构造版本：
 *
 * 1. `localMemory`：0.4.0 前的实验快照直接保存 MemoryStore JSON（裸 `{version,facts}`），
 *    0.4.0 起改为 `{version, memory, emotions}` 三段式。见 chat.ts 加载分支。
 * 2. `pendingGroupTurns`：0.3.0 的可靠投递记录没有 `occurredAt` 与 `status`，
 *    0.3.1 起补齐。见 chat.ts `loadRuntimePendingGroupTurns` 的兼容注释。
 * 3. `characterVersions`：早期仓库快照没有 `activeLocks` 字段，后续补上。
 *    见 character-version-control.ts `repo.activeLocks = data.activeLocks ?? []`。
 *
 * 版本号约定：0 表示"无信封的旧裸数据"，1 表示当前形态。
 * 新增结构变更时，在这里追加一步 step，并同步 compatibility 报告。
 */

import type { SnapshotMigrationPlan } from './snapshot-migration';

/** 本地长期记忆快照。键带 profileId 后缀，这里用前缀匹配的泛化键描述。 */
export const LOCAL_MEMORY_MIGRATION_PLAN: SnapshotMigrationPlan = {
  key: 'runtime:local-memory-store:v1',
  currentVersion: 1,
  legacyVersion: 0,
  steps: [
    {
      from: 0,
      to: 1,
      description: 'MemoryStore 裸 JSON 包进 {version, memory, emotions} 三段式；已是三段式的原样通过', // i18n-ignore
      migrate: (data) => {
        // 两种历史形态并存：
        // - 0.4.0 前：直接保存 MemoryStore 序列化结果（裸 {version,facts}）
        // - 0.4.0 起：{version:1, memory, emotions} 三段式（当时仍无信封）
        // 用 'memory' 键区分，与加载端原有判定保持一致，避免二次包裹。
        if (data && typeof data === 'object' && !Array.isArray(data) && 'memory' in data) {
          return data;
        }
        // emotions 无法从旧数据恢复，置为 null 让加载端跳过，而非伪造空状态。
        return { version: 1, memory: data, emotions: null };
      },
    },
  ],
};

/** 远程群聊可靠投递队列快照。 */
export const PENDING_GROUP_TURNS_MIGRATION_PLAN: SnapshotMigrationPlan = {
  key: 'runtime:pending-group-turns:v1',
  currentVersion: 1,
  legacyVersion: 0,
  steps: [
    {
      from: 0,
      to: 1,
      description: '为 0.3.0 旧记录补 occurredAt（回落 createdAt）与 status（保守置 failed 以待重试）', // i18n-ignore
      migrate: (data) => {
        if (!Array.isArray(data)) return data;
        return data.map((item) => {
          if (!item || typeof item !== 'object') return item;
          const record = item as Record<string, unknown>;
          return {
            ...record,
            occurredAt: typeof record.occurredAt === 'string' ? record.occurredAt : record.createdAt,
            status: typeof record.status === 'string' ? record.status : 'failed',
          };
        });
      },
    },
  ],
};

/** 角色版本仓库快照（全量数组）。 */
export const CHARACTER_VERSIONS_MIGRATION_PLAN: SnapshotMigrationPlan = {
  key: 'ai-roleplay:character-versions',
  currentVersion: 1,
  legacyVersion: 0,
  steps: [
    {
      from: 0,
      to: 1,
      description: '为早期仓库补 activeLocks 空数组，避免加载端依赖 undefined 的空值语义', // i18n-ignore
      migrate: (data) => {
        if (!Array.isArray(data)) return data;
        return data.map((item) => {
          if (!item || typeof item !== 'object') return item;
          const repo = item as Record<string, unknown>;
          return { ...repo, activeLocks: Array.isArray(repo.activeLocks) ? repo.activeLocks : [] };
        });
      },
    },
  ],
};

/** 全部已知计划；供自检与兼容性报告遍历。 */
export const SNAPSHOT_MIGRATION_PLANS: readonly SnapshotMigrationPlan[] = [
  LOCAL_MEMORY_MIGRATION_PLAN,
  PENDING_GROUP_TURNS_MIGRATION_PLAN,
  CHARACTER_VERSIONS_MIGRATION_PLAN,
];
