/**
 * B6：character-version store 的合并域。
 *
 * 这一域自带状态：`pendingConflicts`（冲突待解决时把源分支与冲突字段暂存在
 * 这里，由 UI 逐字段选 current / source 后再提交），以及它的派生值
 * `hasPendingConflicts`。三个动作 mergeBranch / resolveConflicts / cancelMerge
 * 都围着这一份状态转，不碰别的域。
 *
 * 合并成功路径会顺手在当前分支补一次提交（自动合并与手工裁决都是），所以
 * 需要宿主的 `author` 与 `commitTick`；引擎抛出的错误照旧写进 `lastError`。
 */
import { t } from '@/i18n';
import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type {
  BranchName,
  CharacterRepository,
  MergeConflict,
  MergeResult,
  VersionAuthor,
} from '@/core/character-version-control';

export interface VersionMergingCtx {
  currentRepository: Ref<CharacterRepository | null>;
  author: Ref<VersionAuthor>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  commitTick: () => void;
}

export function createVersionMerging(ctx: VersionMergingCtx) {
  const { currentRepository, author, lastError, lastInfo, commitTick } = ctx;

  /** 当前是否在合并冲突待解决状态 */
  const pendingConflicts = ref<{
    sourceBranch: BranchName;
    conflicts: MergeConflict[];
  } | null>(null);

  /** 是否有未解决的合并冲突 */
  const hasPendingConflicts = computed(() => pendingConflicts.value !== null);

  /**
   * 尝试合并指定分支到当前分支
   *
   * 自动合并成功时直接提交新版本；
   * 冲突时存储到 pendingConflicts，由 resolveConflicts 解决。
   *
   * @param sourceBranch 待合并分支
   * @param message 提交信息（成功时使用）
   * @returns 是否无冲突自动合并成功
   */
  function mergeBranch(
    sourceBranch: string,
    message?: string
  ): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    if (sourceBranch === repo.currentBranch) {
      lastError.value = t('cv2.cannotMergeSelf');
      return false;
    }
    try {
      const result: MergeResult = repo.mergeBranch(sourceBranch);
      if (result.success) {
        // 自动合并成功 → 直接提交
        const commitMessage = message ?? t('cv2.mergeCommitMsg', { branch: sourceBranch });
        repo.commit(
          result.mergedSnapshot!,
          author.value,
          commitMessage
        );
        lastInfo.value = t('cv2.merged', { branch: sourceBranch, count: result.autoResolvedCount });
        commitTick();
        return true;
      } else {
        // 冲突 → 暂存待解决
        pendingConflicts.value = {
          sourceBranch,
          conflicts: result.conflicts,
        };
        lastError.value = t('cv2.mergeConflict', { count: result.conflicts.length, auto: result.autoResolvedCount });
        commitTick();
        return false;
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 解决合并冲突
   *
   * @param resolutions 字段路径 → 'current' | 'source'
   * @param message 提交信息
   */
  function resolveConflicts(
    resolutions: Record<string, 'current' | 'source'>,
    message?: string
  ): boolean {
    const repo = currentRepository.value;
    if (!repo || !pendingConflicts.value) {
      lastError.value = t('cv2.noPendingConflicts');
      return false;
    }
    try {
      const merged = repo.resolveConflicts(
        pendingConflicts.value.sourceBranch,
        resolutions
      );
      const commitMessage =
        message ?? t('cv2.mergeResolvedMsg', { branch: pendingConflicts.value.sourceBranch });
      repo.commit(merged, author.value, commitMessage);
      lastInfo.value = t('cv2.conflictsResolved2');
      pendingConflicts.value = null;
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 取消合并（清除 pendingConflicts）
   */
  function cancelMerge(): void {
    pendingConflicts.value = null;
    lastInfo.value = t('cv2.mergeCancelled2');
  }

  return {
    pendingConflicts,
    hasPendingConflicts,
    mergeBranch,
    resolveConflicts,
    cancelMerge,
  };
}
