/**
 * B6：character-version store 的分支域。
 *
 * 四个动作：建分支（带分支名校验）、切分支、删分支、锁/解锁分支。
 * 引擎侧的守卫（锁住的分支不能切过去、重名要报错）都在 try/catch 里透出来，
 * 这里只补 `lastError` / `lastInfo` 与 `commitTick`。
 *
 * `currentRepository` 是宿主的 computed，传进来当 ref 读：每次读都仍然走
 * 引擎 + versionTick 那条响应式链，拆文件不改变它何时重算。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import {
  isValidBranchName,
  type CharacterRepository,
  type VersionAuthor,
} from '@/core/character-version-control';

export interface VersionBranchingCtx {
  currentRepository: Ref<CharacterRepository | null>;
  author: Ref<VersionAuthor>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  commitTick: () => void;
}

export function createVersionBranching(ctx: VersionBranchingCtx) {
  const { currentRepository, author, lastError, lastInfo, commitTick } = ctx;

  /**
   * 创建新分支
   */
  function createBranch(name: string, fromBranch?: string): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    if (!isValidBranchName(name)) {
      lastError.value = t('cv2.branchNameInvalid');
      return false;
    }
    try {
      repo.createBranch(name, author.value, fromBranch);
      lastInfo.value = t('cv2.branchCreated', { name });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 切换分支
   */
  function switchBranch(name: string): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    try {
      repo.switchBranch(name);
      lastInfo.value = t('cv2.branchSwitched', { name });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 删除分支
   */
  function deleteBranch(name: string): boolean {
    const repo = currentRepository.value;
    if (!repo) {
      lastError.value = t('cv.noCharSelected');
      return false;
    }
    try {
      repo.deleteBranch(name);
      lastInfo.value = t('cv2.branchDeleted', { name });
      commitTick();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * 锁定/解锁分支
   */
  function toggleBranchLock(name: string): boolean {
    const repo = currentRepository.value;
    if (!repo) return false;
    const branch = repo.branches.get(name);
    if (!branch) {
      lastError.value = t('cv2.branchNotExist', { name });
      return false;
    }
    branch.locked = !branch.locked;
    lastInfo.value = branch.locked
      ? t('cv2.branchLocked', { name })
      : t('cv2.branchUnlocked', { name });
    commitTick();
    return true;
  }

  return {
    createBranch,
    switchBranch,
    deleteBranch,
    toggleBranchLock,
  };
}
