/**
 * B6：character-version store 的持久化域。
 *
 * 管的是"全量版本数据怎么落盘、开机怎么读回来"：一个快照键、迁移信封的
 * 包与解、旧 localStorage 存量的一次性迁移，以及 `commitTick`
 * （bump 响应式计数器 + 顺手保存）。
 *
 * `versionTick` 是这个 store 里最承重的一条线：仓库/分支/提交/锁都是命令式
 * 对象，改了不会动任何 ref，只有 bump 它，宿主那批 computed 才会重算。
 * 所以引擎、author / loaded / versionTick 全部由宿主传进来共用同一份 ref，
 * 拆文件不改变响应式边界（与 `community-market/persistence.ts` 同一形状）。
 */
import type { Ref } from 'vue';
import type {
  VersionControlEngine,
  SerializedRepository,
  VersionAuthor,
} from '@/core/character-version-control';
import type { StorageAdapter } from '@storage/storage-adapter';
import { migrateLegacyLocalStorage } from '@storage/legacy-migration';
import { migrateSnapshot, wrapSnapshot } from '@storage/snapshot-migration';
import { CHARACTER_VERSIONS_MIGRATION_PLAN } from '@storage/snapshot-plans';
import { logger } from '@/utils/logger';

/** 快照键（沿用旧 localStorage 键名，便于一次性迁移存量数据） */
const SNAPSHOT_KEY = 'ai-roleplay:character-versions';

/** 依赖注入槽：模块级单例，语义与拆分前完全一致 */
let storageAdapter: StorageAdapter | null = null;

export interface VersionPersistenceCtx {
  engine: VersionControlEngine;
  /** loadFromDisk 末尾要把它重新交给引擎（作者身份是引擎侧状态） */
  author: Ref<VersionAuthor>;
  loaded: Ref<boolean>;
  versionTick: Ref<number>;
}

export function createVersionPersistence(ctx: VersionPersistenceCtx) {
  const { engine, author, loaded, versionTick } = ctx;

  /**
   * 保存全部版本数据到存储层（fire-and-forget）
   * 失败仅记录日志，不阻塞主流程。
   */
  async function persist(): Promise<void> {
    if (!storageAdapter) return;
    try {
      // MIG-01：写入带版本信封，配合前向迁移链支持后续结构演进。
      await storageAdapter.saveSnapshot(
        SNAPSHOT_KEY,
        wrapSnapshot(engine.toJSON(), CHARACTER_VERSIONS_MIGRATION_PLAN.currentVersion),
      );
    } catch (err) {
      logger.error('character-version', '持久化失败', err);
    }
  }

  /** 触发响应式更新并持久化 */
  function commitTick(): void {
    versionTick.value++;
    void persist();
  }

  /**
   * 从存储层加载版本数据（含旧 localStorage 数据一次性迁移）
   *
   * 应用启动时调用一次。
   */
  async function loadFromDisk(): Promise<void> {
    if (!storageAdapter) {
      loaded.value = true;
      return;
    }
    await migrateLegacyLocalStorage(storageAdapter, SNAPSHOT_KEY);
    try {
      const raw = await storageAdapter.loadSnapshot<unknown>(SNAPSHOT_KEY);
      // MIG-01：旧裸数组经迁移链补 activeLocks；链路断裂抛错而非静默丢弃。
      const { data, report } = raw === null
        ? { data: null, report: null }
        : migrateSnapshot<SerializedRepository[]>(raw, CHARACTER_VERSIONS_MIGRATION_PLAN);
      if (report?.changed) {
        logger.info('character-version', `版本仓库已迁移：${report.fromVersion} → ${report.toVersion}`);
      }
      if (Array.isArray(data) && data.length > 0) {
        engine.loadFromJSON(data);
      }
    } catch (err) {
      logger.error('character-version', '加载失败', err);
    }
    engine.setAuthor(author.value);
    loaded.value = true;
    versionTick.value++;
  }

  /**
   * 强制保存到存储层
   */
  async function persistNow(): Promise<void> {
    await persist();
  }

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  return {
    persist,
    commitTick,
    loadFromDisk,
    persistNow,
    setStorageAdapter,
  };
}
