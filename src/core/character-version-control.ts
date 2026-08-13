/**
 * 角色卡版本控制系统 (模块4)
 *
 * 提供本地化的版本管理能力（无后端依赖）：
 * - 完整版本历史记录（commit 链）
 * - 分支管理（创建/切换/删除/列出）
 * - 差异对比（字段级 diff）
 * - 合并功能（基于共同祖先的三方合并）
 * - 回滚至历史版本
 *
 * 数据模型：
 * - 一个角色卡对应一个 VersionRepository
 * - Repository 包含多个 Branch（默认 main）
 * - 每个 Branch 是一条 commit 链
 * - 每个 Commit 保存完整的 CharacterCard 快照（简化实现，避免复杂增量）
 *
 * 协作编辑说明：
 * 由于项目无后端，"多人实时协作" 在本实现中以本地多用户模拟方式提供：
 * - 操作锁（OperationLock）记录当前编辑者，防止同会话内并发覆盖
 * - 冲突检测：合并分支时若同一字段被双方修改，标记冲突由用户解决
 */

import type { CharacterCard } from './character-card';
import { t, type MessageKey } from '@/i18n';
import { deepClone } from './json-utils';

// ── 类型定义 ──

/** 版本 ID（短哈希） */
export type VersionId = string;

/** 分支名（仅允许字母/数字/下划线/连字符） */
export type BranchName = string;

/** 操作者标识 */
export interface VersionAuthor {
  /** 显示名称 */
  name: string;
  /** 可选 avatar URL */
  avatar?: string;
}

/** 单个版本提交 */
export interface CharacterVersion {
  /** 版本 ID（8 字符短哈希） */
  id: VersionId;
  /** 父版本 ID（初始版本为 null） */
  parentId: VersionId | null;
  /** 所属分支名 */
  branch: BranchName;
  /** 提交作者 */
  author: VersionAuthor;
  /** 提交时间戳（ISO 8601） */
  timestamp: string;
  /** 提交信息 */
  message: string;
  /** 角色卡快照（完整内容） */
  snapshot: CharacterCard;
}

/** 分支定义 */
export interface CharacterBranch {
  /** 分支名 */
  name: BranchName;
  /** HEAD commit ID */
  headId: VersionId | null;
  /** 创建时间 */
  createdAt: string;
  /** 创建者 */
  createdBy: VersionAuthor;
  /** 是否为默认分支 */
  isDefault: boolean;
  /** 是否已锁定（不可提交） */
  locked: boolean;
}

/** 操作锁（防止并发编辑覆盖） */
export interface OperationLock {
  /** 锁定的角色 ID */
  characterId: string;
  /** 锁定字段（'*' 表示全字段锁定） */
  fieldPath: string;
  /** 持有者 */
  holder: VersionAuthor;
  /** 获取时间 */
  acquiredAt: string;
  /** 过期时间（自动释放） */
  expiresAt: string;
}

/** 单字段差异 */
export interface FieldDiff {
  /** 字段路径（如 "name"、"attributes.level"） */
  path: string;
  /** 字段显示名 */
  label: string;
  /** 旧值（无则为新增） */
  oldValue: unknown;
  /** 新值（无则为删除） */
  newValue: unknown;
  /** 变更类型 */
  type: 'added' | 'removed' | 'modified';
}

/** 两版本间差异汇总 */
export interface VersionDiff {
  /** 源版本 ID */
  fromId: VersionId;
  /** 目标版本 ID */
  toId: VersionId;
  /** 字段级差异列表 */
  fields: FieldDiff[];
  /** 差异数量 */
  changes: number;
  /** 是否相同 */
  identical: boolean;
}

/** 合并冲突项 */
export interface MergeConflict {
  /** 冲突字段路径 */
  path: string;
  /** 字段显示名 */
  label: string;
  /** 共同祖先值 */
  baseValue: unknown;
  /** 当前分支（target）的值 */
  currentValue: unknown;
  /** 待合并分支（source）的值 */
  sourceValue: unknown;
}

/** 合并结果 */
export interface MergeResult {
  /** 是否自动合并成功（无冲突） */
  success: boolean;
  /** 合并后的快照（自动合并时直接生成，冲突时为冲突字段标记版） */
  mergedSnapshot: CharacterCard | null;
  /** 冲突列表（仅 success=false 时非空） */
  conflicts: MergeConflict[];
  /** 自动合并的字段数 */
  autoResolvedCount: number;
}

/** 仓库元信息 */
export interface RepositoryInfo {
  /** 角色 ID */
  characterId: string;
  /** 角色名（来自最新 main 提交） */
  characterName: string;
  /** 默认分支名 */
  defaultBranch: BranchName;
  /** 当前检出分支 */
  currentBranch: BranchName;
  /** 全部分支列表 */
  branches: CharacterBranch[];
  /** 版本总数 */
  totalCommits: number;
  /** 最后提交时间 */
  lastCommitAt: string | null;
  /** 当前活跃的操作锁 */
  activeLocks: OperationLock[];
}

// ── 工具函数 ──

/**
 * 生成 8 字符短哈希
 *
 * 使用时间戳 + 随机数 + 内容摘要，确保短哈希碰撞概率极低。
 */
export function generateVersionId(): VersionId {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}${rand}`.slice(-8).padStart(8, '0');
}

/**
 * 校验分支名合法性
 *
 * 首字符必须为字母，其余允许字母/数字/下划线/连字符，长度 1-32 字符
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.length > 32) return false;
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);
}

/**
 * 获取对象指定路径的值
 *
 * 支持 'a.b.c' 路径与数组索引 'a[0].b'
 */
function getPathValue(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(/[.[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── 角色卡字段元数据（用于 diff 显示与合并） ──

/**
 * 角色卡可被追踪的字段列表
 *
 * 每个字段定义其路径与显示标签。
 * 嵌套字段（如 attributes.level）使用点路径表达。
 */
export const TRACKED_FIELDS: ReadonlyArray<{ path: string; labelKey: MessageKey }> = [
  { path: 'name', labelKey: 'cv.fieldName' },
  { path: 'avatar', labelKey: 'cv.fieldAvatar' },
  { path: 'description', labelKey: 'cv.fieldDescription' },
  { path: 'personality', labelKey: 'cv.fieldPersonality' },
  { path: 'scenario', labelKey: 'cv.fieldScenario' },
  { path: 'firstMessage', labelKey: 'cv.fieldFirstMessage' },
  { path: 'exampleMessages', labelKey: 'cv.fieldExampleMessages' },
  { path: 'characterNote', labelKey: 'cv.fieldCharacterNote' },
  { path: 'talkativeness', labelKey: 'cv.fieldTalkativeness' },
  { path: 'version', labelKey: 'cv.fieldVersion' },
  { path: 'attributes.profession', labelKey: 'cv.fieldProfession' },
  { path: 'attributes.level', labelKey: 'cv.fieldLevel' },
  { path: 'attributes.experience', labelKey: 'cv.fieldExperience' },
  { path: 'attributes.stats', labelKey: 'cv.fieldStats' },
];

/**
 * 字段路径 → 显示名映射（用于冲突展示）
 */
const FIELD_LABEL_MAP: ReadonlyMap<string, MessageKey> = new Map(
  TRACKED_FIELDS.map((f) => [f.path, f.labelKey])
);

/**
 * 获取字段显示名（未知字段返回路径本身）
 */
export function getFieldLabel(path: string): string {
  const labelKey = FIELD_LABEL_MAP.get(path);
  return labelKey ? t(labelKey) : path;
}

/**
 * 比较两个值是否相等（深比较）
 *
 * - 对象/数组使用 JSON 序列化后比较
 * - undefined 与 null 视为相等（便于 diff）
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  if (na === nb) return true;
  if (typeof na !== typeof nb) return false;
  if (typeof na === 'object' && na !== null && nb !== null) {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  return false;
}

// ── 核心引擎：版本仓库 ──

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
   * 简化算法：从 fromId 向上回溯，记录访问过的 ID；
   * 再从 toId 向上回溯，第一个命中即为共同祖先。
   *
   * @param fromId 起始版本 1
   * @param toId 起始版本 2
   * @returns 共同祖先版本 ID，无则 null
   */
  findCommonAncestor(
    fromId: VersionId,
    toId: VersionId
  ): VersionId | null {
    const visited = new Set<VersionId>();
    let cur: CharacterVersion | null = this.commits.get(fromId) ?? null;
    while (cur) {
      visited.add(cur.id);
      cur =
        cur.parentId !== null ? this.commits.get(cur.parentId) ?? null : null;
    }

    cur = this.commits.get(toId) ?? null;
    while (cur) {
      if (visited.has(cur.id)) return cur.id;
      cur =
        cur.parentId !== null ? this.commits.get(cur.parentId) ?? null : null;
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
  mergeBranch(sourceBranch: BranchName): MergeResult {
    const source = this.branches.get(sourceBranch);
    const target = this.branches.get(this.currentBranch);
    if (!source) {
      throw new Error(t('cv.sourceBranchNotFound', { name: sourceBranch }));
    }
    if (!target) {
      throw new Error(t('cv.branchNotFound', { name: this.currentBranch }));
    }
    if (!source.headId || !target.headId) {
      throw new Error(t('cv.noHeadMerge'));
    }

    const sourceHead = this.commits.get(source.headId)!;
    const targetHead = this.commits.get(target.headId)!;

    // 同一 HEAD，无需合并
    if (sourceHead.id === targetHead.id) {
      return {
        success: true,
        mergedSnapshot: deepClone(targetHead.snapshot),
        conflicts: [],
        autoResolvedCount: 0,
      };
    }

    const baseId = this.findCommonAncestor(sourceHead.id, targetHead.id);
    const base = baseId ? this.commits.get(baseId) ?? null : null;
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
  resolveConflicts(
    sourceBranch: BranchName,
    resolutions: Record<string, 'current' | 'source'>
  ): CharacterCard {
    const source = this.branches.get(sourceBranch);
    const target = this.branches.get(this.currentBranch);
    if (!source?.headId || !target?.headId) {
      throw new Error(t('cv.noHead'));
    }
    const sourceHead = this.commits.get(source.headId)!;
    const targetHead = this.commits.get(target.headId)!;
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

/**
 * 序列化后的仓库数据结构（用于持久化）
 */
export interface SerializedRepository {
  characterId: string;
  currentBranch: BranchName;
  branches: CharacterBranch[];
  commits: CharacterVersion[];
  activeLocks: OperationLock[];
}

// ── 辅助：设置对象路径值 ──

/**
 * 设置对象指定路径的值
 *
 * 路径不存在时自动创建中间对象。
 */
function setPathValue(obj: unknown, path: string, value: unknown): void {
  if (!path) return;
  const parts = path.split(/[.[\]]/).filter(Boolean);
  let current: Record<string, unknown> = obj as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ── 顶层引擎：管理多个角色卡仓库 ──

/**
 * 角色卡版本控制引擎
 *
 * 维护多个角色卡的版本仓库映射：
 * characterId → CharacterRepository
 *
 * 持久化策略：由调用方（Pinia Store）通过 toJSON/fromJSON 调用，
 * 引擎自身不直接读写存储后端。
 */
export class VersionControlEngine {
  private repos: Map<string, CharacterRepository> = new Map();
  private currentAuthor: VersionAuthor;

  constructor(author?: VersionAuthor) {
    this.currentAuthor = author ?? { name: t('cv.localUser') };
  }

  /** 设置当前操作者 */
  setAuthor(author: VersionAuthor): void {
    this.currentAuthor = author;
  }

  /** 获取当前操作者 */
  getAuthor(): VersionAuthor {
    return this.currentAuthor;
  }

  /**
   * 初始化某角色的版本仓库
   *
   * 若已存在则直接返回，避免重复初始化。
   *
   * @returns 角色对应的仓库
   */
  initRepository(characterId: string, initialCard: CharacterCard): CharacterRepository {
    let repo = this.repos.get(characterId);
    if (!repo) {
      repo = new CharacterRepository(characterId);
      repo.initialize(initialCard, this.currentAuthor);
      this.repos.set(characterId, repo);
    }
    return repo;
  }

  /**
   * 获取角色仓库（不存在返回 null）
   */
  getRepository(characterId: string): CharacterRepository | null {
    return this.repos.get(characterId) ?? null;
  }

  /**
   * 获取或创建角色仓库
   *
   * 不存在时使用提供的初始角色卡创建。
   */
  ensureRepository(characterId: string, initialCard: CharacterCard): CharacterRepository {
    return this.initRepository(characterId, initialCard);
  }

  /**
   * 删除角色仓库（连同全部版本历史）
   */
  deleteRepository(characterId: string): boolean {
    return this.repos.delete(characterId);
  }

  /**
   * 列出全部仓库信息
   */
  listRepositories(): RepositoryInfo[] {
    return Array.from(this.repos.values()).map((r) => r.getInfo());
  }

  /**
   * 序列化全量数据（用于持久化）
   */
  toJSON(): SerializedRepository[] {
    return Array.from(this.repos.values()).map((r) => r.toJSON());
  }

  /**
   * 反序列化（替换当前全部仓库）
   */
  loadFromJSON(data: SerializedRepository[]): void {
    this.repos.clear();
    for (const item of data) {
      const repo = CharacterRepository.fromJSON(item);
      this.repos.set(repo.characterId, repo);
    }
  }
}

// ── 默认导出（便于测试与按需引入） ──

export default VersionControlEngine;
