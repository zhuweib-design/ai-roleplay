/**
 * 角色卡版本控制 —— 仓库层（单角色卡的分支 / 提交 / 锁）
 *
 * 管理一个角色的全部分支、提交链与操作锁。合并域三个方法已提到
 * character-version-merge.ts，本类只保留一行转发。
 */

import type { CharacterCard } from './character-card';
import { t } from '@/i18n';
import { deepClone } from './json-utils';
import {
  generateVersionId,
  isValidBranchName,
  TRACKED_FIELDS,
  getFieldLabel,
  getPathValue,
  valuesEqual,
} from './character-version-utils';
import { findCommonAncestor, mergeBranch, resolveConflicts } from './character-version-merge';
import type {
  BranchName,
  CharacterBranch,
  CharacterVersion,
  FieldDiff,
  MergeResult,
  OperationLock,
  RepositoryInfo,
  SerializedRepository,
  VersionAuthor,
  VersionDiff,
  VersionId,
} from './character-version-types';

/**
 * 单个角色卡的版本仓库
 *
 * 管理该角色的全部分支、提交历史与操作锁。
 * 实例通过 VersionControlEngine 创建。
 */
export class CharacterRepository {
  /** 角色 ID */
  readonly characterId: string;
  /** 当前检出分支 */
  currentBranch: BranchName;
  /** 全部分支（按名称索引） */
  branches: Map<BranchName, CharacterBranch> = new Map();
  /** 全部提交（按 ID 索引） */
  commits: Map<VersionId, CharacterVersion> = new Map();
  /** 活跃操作锁列表 */
  activeLocks: OperationLock[] = [];

  constructor(characterId: string) {
    this.characterId = characterId;
    this.currentBranch = 'main';
  }

  /**
   * 初始化仓库（创建默认 main 分支与首个提交）
   *
   * @param initialCard 初始角色卡
   * @param author 操作者
   * @param message 提交信息
   */
  initialize(
    initialCard: CharacterCard,
    author: VersionAuthor,
    message: string = t('cv.initialVersion')
  ): CharacterVersion {
    if (!this.branches.has('main')) {
      const branch: CharacterBranch = {
        name: 'main',
        headId: null,
        createdAt: new Date().toISOString(),
        createdBy: author,
        isDefault: true,
        locked: false,
      };
      this.branches.set('main', branch);
      this.currentBranch = 'main';
    }
    return this.commit(initialCard, author, message);
  }

  /**
   * 在当前分支上提交新版本
   *
   * @param card 角色卡快照
   * @param author 提交者
   * @param message 提交信息
   * @throws 若当前分支不存在或被锁定
   */
  commit(
    card: CharacterCard,
    author: VersionAuthor,
    message: string
  ): CharacterVersion {
    const branch = this.branches.get(this.currentBranch);
    if (!branch) {
      throw new Error(t('cv.branchNotFound', { name: this.currentBranch }));
    }
    if (branch.locked) {
      throw new Error(t('cv.branchLockedCommit', { name: this.currentBranch }));
    }

    // 校验锁：若有人持有全字段锁且非当前作者，拒绝
    const blocker = this.activeLocks.find(
      (l) =>
        l.fieldPath === '*' &&
        l.holder.name !== author.name &&
        new Date(l.expiresAt) > new Date()
    );
    if (blocker) {
      throw new Error(t('cv.editedBy', { name: blocker.holder.name }));
    }

    const parentId = branch.headId;
    const version: CharacterVersion = {
      id: generateVersionId(),
      parentId,
      branch: this.currentBranch,
      author,
      timestamp: new Date().toISOString(),
      message,
      snapshot: deepClone(card),
    };
    this.commits.set(version.id, version);
    branch.headId = version.id;

    // 释放本人持有的锁
    this.activeLocks = this.activeLocks.filter(
      (l) => l.holder.name !== author.name
    );

    return version;
  }

  /**
   * 创建新分支
   *
   * @param name 新分支名
   * @param fromBranch 从哪个分支创建（默认当前分支）
   * @param author 创建者
   * @throws 分支名非法或已存在
   */
  createBranch(
    name: BranchName,
    author: VersionAuthor,
    fromBranch: BranchName = this.currentBranch
  ): CharacterBranch {
    if (!isValidBranchName(name)) {
      throw new Error(t('cv.invalidBranchName', { name }));
    }
    if (this.branches.has(name)) {
      throw new Error(t('cv.branchExists', { name }));
    }
    const source = this.branches.get(fromBranch);
    if (!source) {
      throw new Error(t('cv.sourceBranchNotFound', { name: fromBranch }));
    }

    const branch: CharacterBranch = {
      name,
      headId: source.headId,
      createdAt: new Date().toISOString(),
      createdBy: author,
      isDefault: false,
      locked: false,
    };
    this.branches.set(name, branch);
    return branch;
  }

  /**
   * 切换当前分支
   *
   * @throws 分支不存在或被锁定
   */
  switchBranch(name: BranchName): void {
    const branch = this.branches.get(name);
    if (!branch) {
      throw new Error(t('cv.branchNotFound', { name }));
    }
    if (branch.locked) {
      throw new Error(t('cv.branchLockedSwitch', { name }));
    }
    this.currentBranch = name;
  }

  /**
   * 删除分支
   *
   * @throws 不能删除默认分支或当前所在分支
   */
  deleteBranch(name: BranchName): void {
    const branch = this.branches.get(name);
    if (!branch) {
      throw new Error(t('cv.branchNotFound', { name }));
    }
    if (branch.isDefault) {
      throw new Error(t('cv.cannotDeleteDefault'));
    }
    if (name === this.currentBranch) {
      throw new Error(t('cv.cannotDeleteCurrent'));
    }
    this.branches.delete(name);
  }

  /**
   * 列出全部分支
   */
  listBranches(): CharacterBranch[] {
    return Array.from(this.branches.values());
  }

  /**
   * 获取指定分支的提交链（从 HEAD 倒序至初始）
   */
  getBranchHistory(branchName: BranchName): CharacterVersion[] {
    const branch = this.branches.get(branchName);
    if (!branch) return [];

    const history: CharacterVersion[] = [];
    let current: CharacterVersion | null =
      branch.headId !== null ? this.commits.get(branch.headId) ?? null : null;
    while (current) {
      history.push(current);
      current =
        current.parentId !== null
          ? this.commits.get(current.parentId) ?? null
          : null;
    }
    return history;
  }

  /**
   * 获取当前分支 HEAD 提交
   */
  getHead(): CharacterVersion | null {
    const branch = this.branches.get(this.currentBranch);
    if (!branch || !branch.headId) return null;
    return this.commits.get(branch.headId) ?? null;
  }

  /**
   * 按版本 ID 查询提交
   */
  getVersion(id: VersionId): CharacterVersion | null {
    return this.commits.get(id) ?? null;
  }

  /**
   * 获取全部提交总数
   */
  getTotalCommits(): number {
    return this.commits.size;
  }

  /**
   * 计算两个版本的差异
   *
   * @param fromId 源版本 ID
   * @param toId 目标版本 ID
   * @throws 版本不存在
   */
  diffVersions(fromId: VersionId, toId: VersionId): VersionDiff {
    const from = this.commits.get(fromId);
    const to = this.commits.get(toId);
    if (!from) {
      throw new Error(t('cv.versionNotFound', { id: fromId }));
    }
    if (!to) {
      throw new Error(t('cv.versionNotFound', { id: toId }));
    }

    const fields: FieldDiff[] = [];
    for (const field of TRACKED_FIELDS) {
      const oldVal = getPathValue(from.snapshot, field.path);
      const newVal = getPathValue(to.snapshot, field.path);

      if (valuesEqual(oldVal, newVal)) continue;

      let type: FieldDiff['type'];
      if (oldVal === undefined || oldVal === null || oldVal === '') {
        type = 'added';
      } else if (newVal === undefined || newVal === null || newVal === '') {
        type = 'removed';
      } else {
        type = 'modified';
      }

      fields.push({
        path: field.path,
        label: getFieldLabel(field.path),
        oldValue: oldVal,
        newValue: newVal,
        type,
      });
    }

    return {
      fromId,
      toId,
      fields,
      changes: fields.length,
      identical: fields.length === 0,
    };
  }

  /**
   * 查找两个分支/版本最近的共同祖先
   *
   * 实现见 character-version-merge.ts（自由函数），此处只转发。
   */
  findCommonAncestor(fromId: VersionId, toId: VersionId): VersionId | null {
    return findCommonAncestor(this.commits, fromId, toId);
  }

  /**
   * 合并指定分支到当前分支
   *
   * 实现见 character-version-merge.ts（自由函数），此处只转发。
   */
  mergeBranch(sourceBranch: BranchName): MergeResult {
    return mergeBranch(this.commits, this.branches, this.currentBranch, sourceBranch);
  }

  /**
   * 在冲突解决后手动合并
   *
   * 实现见 character-version-merge.ts（自由函数），此处只转发。
   */
  resolveConflicts(
    sourceBranch: BranchName,
    resolutions: Record<string, 'current' | 'source'>
  ): CharacterCard {
    return resolveConflicts(this.commits, this.branches, this.currentBranch, sourceBranch, resolutions);
  }

  /**
   * 回滚当前分支到指定历史版本
   *
   * 创建一个新提交，内容为指定版本的快照（不破坏历史链）。
   *
   * @param versionId 要回滚到的版本 ID
   * @param author 操作者
   * @param message 提交信息（默认 "回滚至 <id>"）
   */
  rollbackTo(
    versionId: VersionId,
    author: VersionAuthor,
    message?: string
  ): CharacterVersion {
    const target = this.commits.get(versionId);
    if (!target) {
      throw new Error(t('cv.versionNotFound', { id: versionId }));
    }
    return this.commit(
      deepClone(target.snapshot),
      author,
      message ?? t('cv.rollbackTo', { id: versionId })
    );
  }

  // ── 操作锁 ──

  /**
   * 获取操作锁
   *
   * @param fieldPath 锁定字段（'*' 表示全字段）
   * @param holder 持有者
   * @param durationMs 持续时长（毫秒，默认 30 分钟）
   * @returns 是否获取成功
   */
  acquireLock(
    fieldPath: string,
    holder: VersionAuthor,
    durationMs: number = 30 * 60 * 1000
  ): boolean {
    const now = new Date();
    // 清理过期锁
    this.activeLocks = this.activeLocks.filter(
      (l) => new Date(l.expiresAt) > now
    );

    // 检查冲突
    const conflict = this.activeLocks.find(
      (l) =>
        (l.fieldPath === fieldPath || l.fieldPath === '*' || fieldPath === '*') &&
        l.holder.name !== holder.name
    );
    if (conflict) return false;

    const expiresAt = new Date(now.getTime() + durationMs);
    this.activeLocks.push({
      characterId: this.characterId,
      fieldPath,
      holder,
      acquiredAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return true;
  }

  /**
   * 释放操作锁
   *
   * @param fieldPath 字段路径
   * @param holder 释放者
   */
  releaseLock(fieldPath: string, holder: VersionAuthor): void {
    this.activeLocks = this.activeLocks.filter(
      (l) =>
        !(l.fieldPath === fieldPath && l.holder.name === holder.name)
    );
  }

  /**
   * 释放某持有者的全部锁
   */
  releaseAllLocks(holder: VersionAuthor): void {
    this.activeLocks = this.activeLocks.filter(
      (l) => l.holder.name !== holder.name
    );
  }

  /**
   * 清理过期锁
   */
  purgeExpiredLocks(): number {
    const before = this.activeLocks.length;
    const now = new Date();
    this.activeLocks = this.activeLocks.filter(
      (l) => new Date(l.expiresAt) > now
    );
    return before - this.activeLocks.length;
  }

  // ── 序列化 ──

  /**
   * 序列化为可持久化的 JSON 结构
   */
  toJSON(): SerializedRepository {
    return {
      characterId: this.characterId,
      currentBranch: this.currentBranch,
      branches: Array.from(this.branches.values()),
      commits: Array.from(this.commits.values()),
      activeLocks: this.activeLocks,
    };
  }

  /**
   * 从 JSON 结构反序列化
   */
  static fromJSON(data: SerializedRepository): CharacterRepository {
    const repo = new CharacterRepository(data.characterId);
    repo.currentBranch = data.currentBranch;
    for (const b of data.branches) repo.branches.set(b.name, b);
    for (const c of data.commits) repo.commits.set(c.id, c);
    repo.activeLocks = data.activeLocks ?? [];
    return repo;
  }

  /**
   * 获取仓库信息（用于列表展示）
   */
  getInfo(): RepositoryInfo {
    const branches = this.listBranches();
    const head = this.getHead();
    return {
      characterId: this.characterId,
      characterName: head?.snapshot.name ?? this.characterId,
      defaultBranch: 'main',
      currentBranch: this.currentBranch,
      branches,
      totalCommits: this.commits.size,
      lastCommitAt: head?.timestamp ?? null,
      activeLocks: [...this.activeLocks],
    };
  }
}
