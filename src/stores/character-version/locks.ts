/**
 * B6：character-version store 的操作锁域。
 *
 * 项目无后端，"多人实时协作"是本地多用户模拟：锁按字段记持有者，
 * 切作者（`setAuthor`）之后同字段就抢不到了。四个动作 acquireLock /
 * releaseLock / releaseAllLocks / purgeExpiredLocks 全部只跟当前仓库的
 * `activeLocks` 打交道，改完要 bump `commitTick`（锁列表在 RepositoryInfo
 * 上是引擎侧数组，不 bump 界面看不见）。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { CharacterRepository, VersionAuthor } from '@/core/character-version-control';

export interface VersionLocksCtx {
  currentRepository: Ref<CharacterRepository | null>;
  author: Ref<VersionAuthor>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  commitTick: () => void;
}

export function createVersionLocks(ctx: VersionLocksCtx) {
  const { currentRepository, author, lastError, lastInfo, commitTick } = ctx;

  /**
   * 获取操作锁
   *
   * @param fieldPath 锁定字段（'*' 表示全字段）
   * @param durationMs 持续时长（默认 30 分钟）
   */
  function acquireLock(
    fieldPath: string,
    durationMs?: number
  ): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    const ok = repo.acquireLock(fieldPath, author.value, durationMs);
    if (!ok) {
      lastError.value = t('cv2.fieldLockedByOther', { field: fieldPath });
    } else {
      lastInfo.value = t('cv2.fieldLocked', { field: fieldPath });
    }
    commitTick();
    return ok;
  }

  /**
   * 释放操作锁
   */
  function releaseLock(fieldPath: string): void {
    const repo = currentRepository.value;
    if (!repo) return;
    repo.releaseLock(fieldPath, author.value);
    lastInfo.value = t('cv2.fieldUnlocked', { field: fieldPath });
    commitTick();
  }

  /**
   * 释放当前作者持有的全部锁
   */
  function releaseAllLocks(): void {
    const repo = currentRepository.value;
    if (!repo) return;
    repo.releaseAllLocks(author.value);
    lastInfo.value = t('cv2.allLocksReleased');
    commitTick();
  }

  /**
   * 清理过期锁
   */
  function purgeExpiredLocks(): number {
    const repo = currentRepository.value;
    if (!repo) return 0;
    const n = repo.purgeExpiredLocks();
    if (n > 0) commitTick();
    return n;
  }

  return {
    acquireLock,
    releaseLock,
    releaseAllLocks,
    purgeExpiredLocks,
  };
}
