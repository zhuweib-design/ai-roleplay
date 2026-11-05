/**
 * lorebook-hierarchy — 世界书条目的层级（父子/树）纯逻辑（R4-3 拆分）
 *
 * 从 `stores/lorebook.ts` 切出：这里只做 `LorebookEntry[]` 上的读与就地改写，
 * 不碰 store 状态、持久化和 i18n 提示——那些留在 store 的包装层。
 * 这样每个函数都能脱离 pinia 单测，也避免"取不到 lorebook 就返回空"的分支散落。
 */
import type { LorebookEntry } from '@/core/lorebook';

/**
 * F06.6 树状层级节点（v1.1）
 * 用于 buildEntryTree 返回的树状结构，便于 UI 递归渲染。
 */
export interface HierarchyTreeNode {
  /** 当前节点对应的条目 */
  entry: LorebookEntry;
  /** 子节点列表（递归） */
  children: HierarchyTreeNode[];
}

/** moveEntryToLevel 的失败原因码（由 store 映射为对应文案） */
export type MoveLevelFailure = 'invalid-level' | 'need-parent' | 'child-level-invalid';

/** 获取指定父节点的直接子节点列表（parentId 传 null 取顶层） */
export function getEntryChildren(
  entries: LorebookEntry[],
  parentId: string | null
): LorebookEntry[] {
  return entries.filter((e) => (e.parentId ?? null) === parentId);
}

/** 获取指定节点的所有后代（递归，不含自身）；环路安全 */
export function getEntryDescendants(
  entries: LorebookEntry[],
  entryId: string
): LorebookEntry[] {
  const result: LorebookEntry[] = [];
  const stack = [entryId];
  const visited = new Set<string>([entryId]);
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    const children = entries.filter((e) => (e.parentId ?? null) === currentId);
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push(child);
      stack.push(child.id);
    }
  }
  return result;
}

/** 获取指定节点的所有祖先（从父节点到根） */
export function getEntryAncestors(
  entries: LorebookEntry[],
  entryId: string
): LorebookEntry[] {
  const result: LorebookEntry[] = [];
  const visited = new Set<string>([entryId]);
  let currentParentId = entries.find((e) => e.id === entryId)?.parentId ?? null;
  while (currentParentId !== null && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const ancestor = entries.find((e) => e.id === currentParentId);
    if (!ancestor) break;
    result.push(ancestor);
    currentParentId = ancestor.parentId ?? null;
  }
  return result;
}

/**
 * 检查是否可以将 entryId 的父节点设置为 newParentId
 * 规则：
 * - 不能自引用（entryId === newParentId）
 * - newParentId 不能是 entryId 的后代（否则形成循环）
 * - newParentId 必须存在（或为 null）
 */
export function canSetEntryParent(
  entries: LorebookEntry[],
  entryId: string,
  newParentId: string | null
): boolean {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return false;

  // null 表示设为顶层，总是允许
  if (newParentId === null) return true;

  // 不能自引用
  if (entryId === newParentId) return false;

  // newParentId 必须存在
  const newParent = entries.find((e) => e.id === newParentId);
  if (!newParent) return false;

  // newParentId 不能是 entryId 的后代（防止循环）
  const descendants = getEntryDescendants(entries, entryId);
  if (descendants.some((d) => d.id === newParentId)) return false;

  // 检查层级深度约束：新父节点的层级 + 1 不能超过 2
  const newParentLevel = newParent.hierarchyLevel ?? 0;
  const newChildLevel = newParentLevel + 1;
  if (newChildLevel > 2) return false;

  return true;
}

/**
 * 就地设置父节点并递归修正层级（调用方须先过 canSetEntryParent 与整体校验）
 */
export function applyEntryParent(
  entries: LorebookEntry[],
  entryId: string,
  newParentId: string | null
): void {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;

  entry.parentId = newParentId;

  // 计算新的层级并递归调整所有后代
  const newLevel = newParentId === null
    ? 0
    : (entries.find((e) => e.id === newParentId)?.hierarchyLevel ?? 0) + 1;
  entry.hierarchyLevel = newLevel as 0 | 1 | 2;

  // 递归调整所有后代的层级（保持相对深度）
  const descendants = getEntryDescendants(entries, entryId);
  for (const desc of descendants) {
    const ancestorChain = getEntryAncestors(entries, desc.id);
    const descLevel = ancestorChain.length;
    desc.hierarchyLevel = Math.min(2, descLevel) as 0 | 1 | 2;
  }
}

/**
 * 移动条目到指定层级深度（level=0 由调用方转成 setEntryParent(null)）
 * @returns null 表示成功，否则为失败原因码
 */
export function moveEntryToLevelIn(
  entries: LorebookEntry[],
  entryId: string,
  level: 0 | 1 | 2
): MoveLevelFailure | null {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return 'need-parent';

  if (level !== 0 && level !== 1 && level !== 2) {
    return 'invalid-level';
  }

  // level>0：仅调整 hierarchyLevel 字段，parentId 由调用者通过 setEntryParent 设置
  const currentParentId = entry.parentId ?? null;
  if (currentParentId === null && level > 0) {
    return 'need-parent';
  }

  if (currentParentId !== null) {
    const parent = entries.find((e) => e.id === currentParentId);
    const parentLevel = parent?.hierarchyLevel ?? 0;
    if (level <= parentLevel) {
      return 'child-level-invalid';
    }
  }

  entry.hierarchyLevel = level;
  return null;
}

/**
 * 在同级中重新排序条目（'up' 或 'down'），并重排 insertionOrder
 * @returns 是否真的换了位置
 */
export function reorderEntryInLevel(
  entries: LorebookEntry[],
  entryId: string,
  direction: 'up' | 'down'
): boolean {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return false;

  const parentId = entry.parentId ?? null;
  // 获取同级的兄弟节点（保持 entries 数组中的顺序）
  const siblings = entries.filter((e) => (e.parentId ?? null) === parentId);
  const currentIdx = siblings.findIndex((e) => e.id === entryId);
  if (currentIdx < 0) return false;

  const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
  if (targetIdx < 0 || targetIdx >= siblings.length) return false;

  const target = siblings[targetIdx]!;
  // 交换两个条目在 entries 数组中的位置
  const entryArrayIdx = entries.findIndex((e) => e.id === entryId);
  const targetArrayIdx = entries.findIndex((e) => e.id === target.id);
  if (entryArrayIdx < 0 || targetArrayIdx < 0) return false;

  [entries[entryArrayIdx], entries[targetArrayIdx]] = [
    entries[targetArrayIdx]!,
    entries[entryArrayIdx]!,
  ];

  // 重新计算 insertionOrder（按数组顺序）
  entries.forEach((e, i) => {
    e.insertionOrder = i + 1;
  });

  return true;
}

/**
 * 构建树状结构，用于 UI 渲染
 * 返回顶层节点列表，每个节点带 children 数组（递归）
 */
export function buildEntryTree(entries: LorebookEntry[]): HierarchyTreeNode[] {
  const nodeMap = new Map<string, HierarchyTreeNode>();
  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [] });
  }

  const roots: HierarchyTreeNode[] = [];
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    const parentId = entry.parentId ?? null;
    if (parentId === null || !nodeMap.has(parentId)) {
      roots.push(node);
    } else {
      nodeMap.get(parentId)!.children.push(node);
    }
  }

  return roots;
}
