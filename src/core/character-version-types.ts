/**
 * 角色卡版本控制 —— 类型定义层
 *
 * 本层零函数、零副作用，只描述数据结构。它被 utils / merge / repository / engine
 * 四层共同依赖，因此必须放在依赖图最底层：任何一层反过来都不许 import 上面三层，
 * 否则 merge 与 repository 之间会形成环形依赖（R4-8 的同型问题）。
 */

import type { CharacterCard } from './character-card';

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

// ── 序列化结构 ──

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
