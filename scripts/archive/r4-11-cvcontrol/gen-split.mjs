/**
 * R4-11 行号切片生成器 —— character-version-control.ts 969 → 五个模块 + barrel
 *
 * 铁律（O-4 / O-11 / O-14 / O-15 / O-16 / O-17 沿用）：
 *  ① 基准只读归档副本，绝不读源文件（读源文件会被覆写，二次跑越界静默回空串）
 *  ② seg(start,end) 越界/切空立即抛错
 *  ③ 断言一律 A[n-1]，行号不心算，逐行 awk 打印核对后再写
 *  ④ 尾部空串先 pop()，让内存行数与 wc -l 对齐
 *  ⑤ CRLF 仓库：内存归一 LF，写回 writeCRLF
 *
 * 形态判据（O-14：类拆分优先「提自由函数 + 一行转发」）：
 *  合并域 findCommonAncestor / mergeBranch / resolveConflicts 三方法共 154 行，
 *  只依赖 commits / branches / currentBranch 三份状态 ⇒ 提成顶层自由函数，
 *  类里留三行转发。其余方法都是单状态读写，留在类里。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'scripts/archive/r4-11-cvcontrol/character-version-control.orig.ts.txt');
const raw = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const A = raw.split('\n');
while (A[A.length - 1] === '') A.pop();

// ── 结构断言（行号已 awk 逐行核对） ───────────────────────────
function assertLine(n, x, tag) {
  const got = A[n - 1];
  if (got !== x) {
    throw new Error(`[${tag}] 第 ${n} 行不符\n  期望: ${JSON.stringify(x)}\n  实际: ${JSON.stringify(got)}`);
  }
}
assertLine(1, '/**', '文件头');
assertLine(21, ' */', '文件头闭');
assertLine(23, "import type { CharacterCard } from './character-card';", 'CharacterCard import');
assertLine(24, "import { t, type MessageKey } from '@/i18n';", 'i18n import');
assertLine(25, "import { deepClone } from './json-utils';", 'deepClone import');
assertLine(29, '/** 版本 ID（短哈希） */', 'types 首');
assertLine(163, '}', 'RepositoryInfo 闭');
assertLine(167, '/**', 'utils 首（generateVersionId JSDoc）');
assertLine(172, 'export function generateVersionId(): VersionId {', 'generateVersionId');
assertLine(183, 'export function isValidBranchName(name: string): boolean {', 'isValidBranchName');
assertLine(193, 'function getPathValue(obj: unknown, path: string): unknown {', 'getPathValue');
assertLine(213, 'export const TRACKED_FIELDS: ReadonlyArray<{ path: string; labelKey: MessageKey }> = [', 'TRACKED_FIELDS');
assertLine(240, 'export function getFieldLabel(path: string): string {', 'getFieldLabel');
assertLine(251, 'function valuesEqual(a: unknown, b: unknown): boolean {', 'valuesEqual');
assertLine(260, '}', 'valuesEqual 闭');
assertLine(262, '// ── 核心引擎：版本仓库 ──', 'repo 段标记');
assertLine(270, 'export class CharacterRepository {', 'CharacterRepository 开');
assertLine(537, '  }', 'diffVersions 闭');
assertLine(539, '  /**', 'findCommonAncestor JSDoc 开');
assertLine(549, '  findCommonAncestor(', 'findCommonAncestor 签名');
assertLine(568, '  }', 'findCommonAncestor 闭');
assertLine(570, '  /**', 'mergeBranch JSDoc 开');
assertLine(581, '  mergeBranch(sourceBranch: BranchName): MergeResult {', 'mergeBranch 签名');
assertLine(661, '  }', 'mergeBranch 闭');
assertLine(663, '  /**', 'resolveConflicts JSDoc 开');
assertLine(670, '  resolveConflicts(', 'resolveConflicts 签名');
assertLine(692, '  }', 'resolveConflicts 闭');
assertLine(694, '  /**', 'rollbackTo JSDoc 开');
assertLine(837, '}', 'CharacterRepository 闭');
assertLine(839, '/**', 'SerializedRepository JSDoc 开');
assertLine(842, 'export interface SerializedRepository {', 'SerializedRepository 开');
assertLine(848, '}', 'SerializedRepository 闭');
assertLine(850, '// ── 辅助：设置对象路径值 ──', 'setPath 段标记');
assertLine(857, 'function setPathValue(obj: unknown, path: string, value: unknown): void {', 'setPathValue');
assertLine(870, '}', 'setPathValue 闭');
assertLine(872, '// ── 顶层引擎：管理多个角色卡仓库 ──', 'engine 段标记');
assertLine(883, 'export class VersionControlEngine {', 'VersionControlEngine 开');
assertLine(965, '}', 'VersionControlEngine 闭');
assertLine(969, 'export default VersionControlEngine;', '默认导出');

function seg(start, end, tag) {
  if (!(start >= 1 && end <= A.length && start <= end)) {
    throw new Error(`[${tag}] 区间越界: ${start}-${end}（共 ${A.length} 行）`);
  }
  const out = A.slice(start - 1, end);
  if (out.join('').trim() === '') throw new Error(`[${tag}] 切出空片段: ${start}-${end}`);
  return out;
}
/** 整体左移 n 级（每级 2 空格） */
function dedent(lines, levels) {
  const pad = ' '.repeat(levels * 2);
  return lines.map((l) => (l.startsWith(pad) ? l.slice(pad.length) : l));
}
function replaceAll(lines, from, to, tag) {
  const idx = lines.findIndex((l) => l.includes(from));
  if (idx < 0) throw new Error(`[${tag}] 未找到待替换片段: ${JSON.stringify(from)}`);
  return lines.flatMap((l) => (l.includes(from) ? l.split(from).join(to) : l));
}

const out = {};
const w = (name, lines) => {
  out[name] = [...lines].join('\n');
};

// ── ① types（纯类型层，零函数、零 import 副作用） ──────────────
w('character-version-types.ts', [
  '/**',
  ' * 角色卡版本控制 —— 类型定义层',
  ' *',
  ' * 本层零函数、零副作用，只描述数据结构。它被 utils / merge / repository / engine',
  ' * 四层共同依赖，因此必须放在依赖图最底层：任何一层反过来都不许 import 上面三层，',
  ' * 否则 merge 与 repository 之间会形成环形依赖（R4-8 的同型问题）。',
  ' */',
  '',
  "import type { CharacterCard } from './character-card';",
  '',
  ...seg(29, 163, 'types'),
  '',
  '// ── 序列化结构 ──',
  '',
  ...seg(839, 848, 'SerializedRepository'),
]);

// ── ② utils（纯函数 + 字段元数据） ────────────────────────────
w('character-version-utils.ts', [
  '/**',
  ' * 角色卡版本控制 —— 纯工具层',
  ' *',
  ' * 全部是无状态纯函数与常量，不持有任何仓库实例状态，可单独测试。',
  ' * TRACKED_FIELDS 同时被 diff（repository）与合并（merge）消费，',
  ' * 放这里让两个上层模块都只依赖本层、彼此不互相依赖。',
  ' */',
  '',
  "import { t, type MessageKey } from '@/i18n';",
  // 分层后本层 import 面要按「本层实际用到什么」重算，不能沿用宿主的
  // import 块（O-18 第 ② 条）：generateVersionId(): VersionId 用到
  // VersionId，宿主原 import 里没有 ⇒ 必须补类型导入，否则 TS2304。
  "import type { VersionId } from './character-version-types';",
  '',
  ...seg(165, 203, 'utils-1'), // 段标记 + generateVersionId + isValidBranchName + getPathValue
  '// ── 角色卡字段元数据（用于 diff 显示与合并） ──',
  '',
  ...seg(207, 260, 'utils-2'), // TRACKED_FIELDS + FIELD_LABEL_MAP + getFieldLabel + valuesEqual
  '',
  '// ── 辅助：设置对象路径值 ──',
  '',
  ...seg(852, 870, 'setPathValue'),
  '',
  'export { getPathValue, setPathValue, valuesEqual };',
]);

// ── ③ merge（合并域，从类里提成自由函数） ─────────────────────
let mergeBody = [...seg(539, 692, 'merge-domain')];
// 类方法缩进 2 空格，提到模块顶层目标是 0 空格 ⇒ 只减 1 级（O-17 第 ③ 条：
// dedent 级数 = (原缩进 − 新宿主目标缩进) / 2 = (2 − 0) / 2 = 1）
mergeBody = dedent(mergeBody, 1);

// 签名改写：实例方法 → 顶层导出函数，状态改为显式入参
// 归档核对：findCommonAncestor 与 resolveConflicts 是多行签名，mergeBranch 是单行签名
{
  const i = mergeBody.indexOf('findCommonAncestor(');
  if (i < 0) throw new Error('[merge] findCommonAncestor 签名未找到');
  mergeBody[i] = 'export function findCommonAncestor(';
  mergeBody.splice(i + 1, 0, '  commits: CommitMap,');
}
{
  const i = mergeBody.indexOf('mergeBranch(sourceBranch: BranchName): MergeResult {');
  if (i < 0) throw new Error('[merge] mergeBranch 单行签名未找到');
  mergeBody.splice(
    i,
    1,
    'export function mergeBranch(',
    '  commits: CommitMap,',
    '  branches: BranchMap,',
    '  currentBranch: BranchName,',
    '  sourceBranch: BranchName',
    '): MergeResult {'
  );
}
{
  const i = mergeBody.indexOf('resolveConflicts(');
  if (i < 0) throw new Error('[merge] resolveConflicts 签名未找到');
  mergeBody[i] = 'export function resolveConflicts(';
  mergeBody.splice(
    i + 1,
    0,
    '  commits: CommitMap,',
    '  branches: BranchMap,',
    '  currentBranch: BranchName,'
  );
}

// this.x → 显式入参（先换 this.commits 再换 this.findCommonAncestor，二者互不干扰）
mergeBody = replaceAll(mergeBody, 'this.commits', 'commits', 'merge-this');
mergeBody = replaceAll(mergeBody, 'this.branches', 'branches', 'merge-this');
mergeBody = replaceAll(mergeBody, 'this.currentBranch', 'currentBranch', 'merge-this');
mergeBody = replaceAll(mergeBody, 'this.findCommonAncestor(', 'findCommonAncestor(commits, ', 'merge-self-call');

// 断言：改写后不应残留任何 this.
{
  const left = mergeBody.filter((l) => /\bthis\./.test(l));
  if (left.length > 0) throw new Error(`[merge] 残留 this. 引用 ${left.length} 处：\n${left.join('\n')}`);
}
// 断言：三个导出函数都在
{
  const n = mergeBody.filter((l) => /^export function (findCommonAncestor|mergeBranch|resolveConflicts)\(/.test(l)).length;
  if (n !== 3) throw new Error(`[merge] 顶层导出函数应为 3 个，实际 ${n}`);
}

w('character-version-merge.ts', [
  '/**',
  ' * 角色卡版本控制 —— 合并域（三方合并 / 共同祖先 / 冲突解决）',
  ' *',
  ' * 这三个动作只读写 commits / branches / currentBranch 三份状态，',
  ' * 不碰锁、不碰序列化，因此从 CharacterRepository 提成顶层自由函数：',
  ' * 类的同名方法只剩一行转发，合并逻辑可脱离仓库实例单独测试。',
  ' */',
  '',
  "import type { CharacterCard } from './character-card';",
  "import { t } from '@/i18n';",
  "import { deepClone } from './json-utils';",
  'import {',
  '  TRACKED_FIELDS,',
  '  getFieldLabel,',
  '  getPathValue,',
  '  setPathValue,',
  '  valuesEqual,',
  "} from './character-version-utils';",
  'import type {',
  '  BranchName,',
  '  CharacterBranch,',
  '  CharacterVersion,',
  '  MergeConflict,',
  '  MergeResult,',
  '  VersionId,',
  "} from './character-version-types';",
  '',
  '/** 提交索引（版本 ID → 提交） */',
  'export type CommitMap = Map<VersionId, CharacterVersion>;',
  '/** 分支索引（分支名 → 分支） */',
  'export type BranchMap = Map<BranchName, CharacterBranch>;',
  '',
  ...mergeBody,
]);

// ── ④ repository（类的骨架 + 三行转发） ───────────────────────
const repoHead = [...seg(264, 537, 'repo-head')];
const repoForwarders = [
  '  /**',
  '   * 查找两个分支/版本最近的共同祖先',
  '   *',
  '   * 实现见 character-version-merge.ts（自由函数），此处只转发。',
  '   */',
  '  findCommonAncestor(fromId: VersionId, toId: VersionId): VersionId | null {',
  '    return findCommonAncestor(this.commits, fromId, toId);',
  '  }',
  '',
  '  /**',
  '   * 合并指定分支到当前分支',
  '   *',
  '   * 实现见 character-version-merge.ts（自由函数），此处只转发。',
  '   */',
  '  mergeBranch(sourceBranch: BranchName): MergeResult {',
  '    return mergeBranch(this.commits, this.branches, this.currentBranch, sourceBranch);',
  '  }',
  '',
  '  /**',
  '   * 在冲突解决后手动合并',
  '   *',
  '   * 实现见 character-version-merge.ts（自由函数），此处只转发。',
  '   */',
  '  resolveConflicts(',
  '    sourceBranch: BranchName,',
  "    resolutions: Record<string, 'current' | 'source'>",
  '  ): CharacterCard {',
  '    return resolveConflicts(this.commits, this.branches, this.currentBranch, sourceBranch, resolutions);',
  '  }',
  '',
];
const repoFoot = [...seg(694, 836, 'repo-foot')];

w('character-version-repository.ts', [
  '/**',
  ' * 角色卡版本控制 —— 仓库层（单角色卡的分支 / 提交 / 锁）',
  ' *',
  ' * 管理一个角色的全部分支、提交链与操作锁。合并域三个方法已提到',
  ' * character-version-merge.ts，本类只保留一行转发。',
  ' */',
  '',
  "import type { CharacterCard } from './character-card';",
  "import { t } from '@/i18n';",
  "import { deepClone } from './json-utils';",
  'import {',
  '  generateVersionId,',
  '  isValidBranchName,',
  '  TRACKED_FIELDS,',
  '  getFieldLabel,',
  '  getPathValue,',
  '  valuesEqual,',
  "} from './character-version-utils';",
  "import { findCommonAncestor, mergeBranch, resolveConflicts } from './character-version-merge';",
  'import type {',
  '  BranchName,',
  '  CharacterBranch,',
  '  CharacterVersion,',
  '  FieldDiff,',
  '  MergeResult,',
  '  OperationLock,',
  '  RepositoryInfo,',
  '  SerializedRepository,',
  '  VersionAuthor,',
  '  VersionDiff,',
  '  VersionId,',
  "} from './character-version-types';",
  '',
  ...repoHead,
  '',
  ...repoForwarders,
  ...repoFoot,
  '}',
]);

// ── ⑤ engine（多仓库编排） ───────────────────────────────────
const engineBody = [...seg(874, 965, 'engine')];
w('version-control-engine.ts', [
  '/**',
  ' * 角色卡版本控制 —— 顶层引擎（多仓库编排）',
  ' *',
  ' * 维护 characterId → CharacterRepository 映射与当前操作者。',
  ' * 持久化由调用方（Pinia store）经 toJSON/fromJSON 驱动，引擎自身不碰存储。',
  ' */',
  '',
  "import { t } from '@/i18n';",
  "import { CharacterRepository } from './character-version-repository';",
  "import type { CharacterCard } from './character-card';",
  'import type { RepositoryInfo, SerializedRepository, VersionAuthor } from \'./character-version-types\';',
  '',
  ...engineBody,
]);

// ── ⑥ 宿主 barrel ───────────────────────────────────────────
w('character-version-control.ts', [
  '/**',
  ' * 角色卡版本控制系统 (模块4) —— 汇总出口',
  ' *',
  ' * 提供本地化的版本管理能力（无后端依赖）：',
  ' * - 完整版本历史记录（commit 链）',
  ' * - 分支管理（创建/切换/删除/列出）',
  ' * - 差异对比（字段级 diff）',
  ' * - 合并功能（基于共同祖先的三方合并）',
  ' * - 回滚至历史版本',
  ' *',
  ' * 数据模型：一个角色卡对应一个 CharacterRepository，内含多个 Branch，',
  ' * 每个 Branch 是一条 commit 链，每个 Commit 保存完整的 CharacterCard 快照。',
  ' *',
  ' * 文件分层（依赖单向，无环）：',
  ' * ',
  ' *   character-version-types.ts       纯类型，零函数',
  ' *        ↑',
  ' *   character-version-utils.ts       纯函数与字段元数据',
  ' *        ↑',
  ' *   character-version-merge.ts       合并域自由函数',
  ' *        ↑',
  ' *   character-version-repository.ts  CharacterRepository（合并域三行转发）',
  ' *        ↑',
  ' *   version-control-engine.ts        VersionControlEngine（多仓库编排）',
  ' *',
  ' * 本文件只做 re-export，不承载任何实现。公共导出面与拆分前逐字一致：',
  ' * 不导出 `export *`，逐个符号显式列举，避免内部类型（CommitMap / BranchMap）',
  ' * 或未来新增的内部工具函数意外泄给外部（O-14 的教训）。',
  ' */',
  '',
  'export type {',
  '  BranchName,',
  '  CharacterBranch,',
  '  CharacterVersion,',
  '  FieldDiff,',
  '  MergeConflict,',
  '  MergeResult,',
  '  OperationLock,',
  '  RepositoryInfo,',
  '  SerializedRepository,',
  '  VersionAuthor,',
  '  VersionDiff,',
  '  VersionId,',
  "} from './character-version-types';",
  'export {',
  '  generateVersionId,',
  '  isValidBranchName,',
  '  getFieldLabel,',
  '  TRACKED_FIELDS,',
  "} from './character-version-utils';",
  "export { CharacterRepository } from './character-version-repository';",
  "export { VersionControlEngine } from './version-control-engine';",
  '',
  "export { VersionControlEngine as default } from './version-control-engine';",
]);

// ── 写出（CRLF 仓库，写回时还原） ─────────────────────────────
// 末尾换行必须补：源仓库全部文本文件以换行结尾，缺了会让 git diff 显示
// 「\ No newline at end of file」，也会让后续按行切片（split('\n') 尾部
// 空串判定）产生不一致（O-15）。
const writeCRLF = (path, text) => {
  const norm = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const withEol = norm.endsWith('\n') ? norm : `${norm}\n`;
  writeFileSync(path, withEol.replace(/\n/g, '\r\n'), 'utf8');
  return withEol.split('\n').length;
};

const DIR = join(ROOT, 'src/core');
const counts = {};
for (const [name, text] of Object.entries(out)) {
  counts[name] = writeCRLF(join(DIR, name), text);
}
console.log('生成完成：');
for (const [name, n] of Object.entries(counts)) {
  console.log(`  ${String(n).padStart(4)}  src/core/${name}`);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`  ---- 合计 ${total} 行（原 969，+${total - 969} / +${(((total - 969) / 969) * 100).toFixed(1)}%）`);
