/**
 * 角色卡版本控制系统 (模块4) —— 汇总出口
 *
 * 提供本地化的版本管理能力（无后端依赖）：
 * - 完整版本历史记录（commit 链）
 * - 分支管理（创建/切换/删除/列出）
 * - 差异对比（字段级 diff）
 * - 合并功能（基于共同祖先的三方合并）
 * - 回滚至历史版本
 *
 * 数据模型：一个角色卡对应一个 CharacterRepository，内含多个 Branch，
 * 每个 Branch 是一条 commit 链，每个 Commit 保存完整的 CharacterCard 快照。
 *
 * 文件分层（依赖单向，无环）：
 * 
 *   character-version-types.ts       纯类型，零函数
 *        ↑
 *   character-version-utils.ts       纯函数与字段元数据
 *        ↑
 *   character-version-merge.ts       合并域自由函数
 *        ↑
 *   character-version-repository.ts  CharacterRepository（合并域三行转发）
 *        ↑
 *   version-control-engine.ts        VersionControlEngine（多仓库编排）
 *
 * 本文件只做 re-export，不承载任何实现。公共导出面与拆分前逐字一致：
 * 不导出 `export *`，逐个符号显式列举，避免内部类型（CommitMap / BranchMap）
 * 或未来新增的内部工具函数意外泄给外部（O-14 的教训）。
 */

export type {
  BranchName,
  CharacterBranch,
  CharacterVersion,
  FieldDiff,
  MergeConflict,
  MergeResult,
  OperationLock,
  RepositoryInfo,
  SerializedRepository,
  VersionAuthor,
  VersionDiff,
  VersionId,
} from './character-version-types';
export {
  generateVersionId,
  isValidBranchName,
  getFieldLabel,
  TRACKED_FIELDS,
} from './character-version-utils';
export { CharacterRepository } from './character-version-repository';
export { VersionControlEngine } from './version-control-engine';

export { VersionControlEngine as default } from './version-control-engine';
