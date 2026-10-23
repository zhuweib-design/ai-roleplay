/**
 * 角色卡版本控制 —— 合并域（三方合并 / 共同祖先 / 冲突解决）
 *
 * 这三个动作只读写 commits / branches / currentBranch 三份状态，
 * 不碰锁、不碰序列化，因此从 CharacterRepository 提成顶层自由函数：
 * 类的同名方法只剩一行转发，合并逻辑可脱离仓库实例单独测试。
 */

import type { CharacterCard } from './character-card';
import { t } from '@/i18n';
import { deepClone } from './json-utils';
import {
  TRACKED_FIELDS,
  getFieldLabel,
  getPathValue,
  setPathValue,
  valuesEqual,
} from './character-version-utils';
import type {
  BranchName,
  CharacterBranch,
  CharacterVersion,
  MergeConflict,
  MergeResult,
  VersionId,
} from './character-version-types';

/** 提交索引（版本 ID → 提交） */
export type CommitMap = Map<VersionId, CharacterVersion>;
/** 分支索引（分支名 → 分支） */
export type BranchMap = Map<BranchName, CharacterBranch>;

/**
 * 查找两个分支/版本最近的共同祖先
 *
 * 简化算法：从 fromId 向上回溯，记录访问过的 ID；
 * 再从 toId 向上回溯，第一个命中即为共同祖先。
 *
 * @param fromId 起始版本 1
 * @param toId 起始版本 2
 * @returns 共同祖先版本 ID，无则 null
 */
export function findCommonAncestor(
  commits: CommitMap,
  fromId: VersionId,
  toId: VersionId
): VersionId | null {
  const visited = new Set<VersionId>();
  let cur: CharacterVersion | null = commits.get(fromId) ?? null;
  while (cur) {
    visited.add(cur.id);
    cur =
      cur.parentId !== null ? commits.get(cur.parentId) ?? null : null;
  }

  cur = commits.get(toId) ?? null;
  while (cur) {
    if (visited.has(cur.id)) return cur.id;
    cur =
      cur.parentId !== null ? commits.get(cur.parentId) ?? null : null;
  }
  return null;
}

/**
 * 合并指定分支到当前分支
 *
 * 三方合并算法：
 * 1. 找到共同祖先 base
 * 2. 对每个字段，若 base=current 则取 source（source 修改），若 base=source 则保持 current（未变）
 * 3. 若两边都修改且不同，标记冲突
 *
 * @param sourceBranch 待合并分支
 * @returns 合并结果（无冲突时自动生成新快照；有冲突时返回冲突列表）
 */
export function mergeBranch(
  commits: CommitMap,
  branches: BranchMap,
  currentBranch: BranchName,
  sourceBranch: BranchName
): MergeResult {
  const source = branches.get(sourceBranch);
  const target = branches.get(currentBranch);
  if (!source) {
    throw new Error(t('cv.sourceBranchNotFound', { name: sourceBranch }));
  }
  if (!target) {
    throw new Error(t('cv.branchNotFound', { name: currentBranch }));
  }
  if (!source.headId || !target.headId) {
    throw new Error(t('cv.noHeadMerge'));
  }

  const sourceHead = commits.get(source.headId)!;
  const targetHead = commits.get(target.headId)!;

  // 同一 HEAD，无需合并
  if (sourceHead.id === targetHead.id) {
    return {
      success: true,
      mergedSnapshot: deepClone(targetHead.snapshot),
      conflicts: [],
      autoResolvedCount: 0,
    };
  }

  const baseId = findCommonAncestor(commits, sourceHead.id, targetHead.id);
  const base = baseId ? commits.get(baseId) ?? null : null;
  const baseSnapshot = base?.snapshot ?? null;

  const merged = deepClone(targetHead.snapshot) as CharacterCard;
  const conflicts: MergeConflict[] = [];
  let autoResolved = 0;

  for (const field of TRACKED_FIELDS) {
    const baseVal = baseSnapshot
      ? getPathValue(baseSnapshot, field.path)
      : undefined;
    const curVal = getPathValue(targetHead.snapshot, field.path);
    const srcVal = getPathValue(sourceHead.snapshot, field.path);

    const baseEqCur = valuesEqual(baseVal, curVal);
    const baseEqSrc = valuesEqual(baseVal, srcVal);
    const curEqSrc = valuesEqual(curVal, srcVal);

    // 三方相同或源未改，保持 target
    if (curEqSrc || baseEqSrc) {
      continue;
    }
    // target 未改，source 改了 → 取 source
    if (baseEqCur) {
      setPathValue(merged, field.path, srcVal);
      autoResolved++;
      continue;
    }
    // 双方都改了且不同 → 冲突
    conflicts.push({
      path: field.path,
      label: getFieldLabel(field.path),
      baseValue: baseVal,
      currentValue: curVal,
      sourceValue: srcVal,
    });
  }

  if (conflicts.length > 0) {
    return {
      success: false,
      mergedSnapshot: null,
      conflicts,
      autoResolvedCount: autoResolved,
    };
  }

  return {
    success: true,
    mergedSnapshot: merged,
    conflicts: [],
    autoResolvedCount: autoResolved,
  };
}

/**
 * 在冲突解决后手动合并
 *
 * @param sourceBranch 待合并分支
 * @param resolutions 字段路径 → 选定值
 * @returns 合并后的快照
 */
export function resolveConflicts(
  commits: CommitMap,
  branches: BranchMap,
  currentBranch: BranchName,
  sourceBranch: BranchName,
  resolutions: Record<string, 'current' | 'source'>
): CharacterCard {
  const source = branches.get(sourceBranch);
  const target = branches.get(currentBranch);
  if (!source?.headId || !target?.headId) {
    throw new Error(t('cv.noHead'));
  }
  const sourceHead = commits.get(source.headId)!;
  const targetHead = commits.get(target.headId)!;
  const merged = deepClone(targetHead.snapshot) as CharacterCard;

  for (const field of TRACKED_FIELDS) {
    const choice = resolutions[field.path];
    if (choice === 'current') continue;
    if (choice === 'source') {
      const srcVal = getPathValue(sourceHead.snapshot, field.path);
      setPathValue(merged, field.path, srcVal);
    }
  }
  return merged;
}
