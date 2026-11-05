/**
 * lorebook-io — 世界书导入导出的纯解析/序列化（R4-3 拆分）
 *
 * 从 `stores/lorebook.ts` 切出。这里只做 SillyTavern 兼容格式与内部结构之间的
 * 双向转换，不碰 store 状态、持久化、i18n 提示——读写失败的分类与文案留在 store。
 */
import { t } from '@/i18n';
import type {
  Lorebook,
  LorebookEntry,
  LorebookHierarchyEntry,
  WorldDescription,
  WorldUserProfile,
} from '@/core/lorebook';

// ── SillyTavern 格式转换辅助 ──

export function logicToNumber(logic: LorebookEntry['logic']): number {
  // 与 SillyTavern world_info_logic 一致
  switch (logic) {
    case 'AND_ANY':
      return 0;
    case 'NOT_ALL':
      return 1;
    case 'NOT_ANY':
      return 2;
    case 'AND_ALL':
      return 3;
    default:
      return 0;
  }
}

export function numberToLogic(n: number): LorebookEntry['logic'] {
  switch (n) {
    case 0:
      return 'AND_ANY';
    case 1:
      return 'NOT_ALL';
    case 2:
      return 'NOT_ANY';
    case 3:
      return 'AND_ALL';
    default:
      return 'AND_ANY';
  }
}

export function positionToNumber(pos: LorebookEntry['insertionPosition']): number {
  // SillyTavern position: 0=before char, 1=after char, 2=ANTop, 3=atDepth
  switch (pos) {
    case 'beforeCharDefs':
      return 0;
    case 'afterCharDefs':
      return 1;
    case 'atDepth':
      return 3;
    default:
      return 1;
  }
}

export function numberToPosition(n: number): LorebookEntry['insertionPosition'] {
  switch (n) {
    case 0:
      return 'beforeCharDefs';
    case 3:
      return 'atDepth';
    case 1:
    default:
      return 'afterCharDefs';
  }
}

export function parseEntryFromJson(
  raw: Record<string, unknown>,
  idx: number
): LorebookEntry {
  const keys = Array.isArray(raw.key)
    ? (raw.key as unknown[]).filter((k): k is string => typeof k === 'string')
    : [];

  // F06.6 若 raw 附带 entryId 字段，则保留原 ID 以便层级关系映射
  // 旧版 SillyTavern 导入无此字段，使用新生成的 ID
  const rawEntryId = typeof raw.entryId === 'string' ? raw.entryId : null;

  return {
    id: rawEntryId ?? `entry-${Date.now()}-${idx}-${Math.floor(Math.random() * 1e6)}`,
    title: typeof raw.comment === 'string' ? raw.comment : t('lb.entryComment', { index: idx + 1 }),
    keys,
    content: typeof raw.content === 'string' ? raw.content : '',
    strategy: raw.constant === true ? 'constant' : 'keyword',
    probability: typeof raw.probability === 'number' ? raw.probability : 100,
    insertionOrder: typeof raw.order === 'number' ? raw.order : idx,
    insertionPosition: numberToPosition(
      typeof raw.position === 'number' ? raw.position : 1
    ),
    depth: typeof raw.depth === 'number' ? raw.depth : 4,
    group: typeof raw.group === 'string' ? raw.group : '',
    enabled: raw.disable !== true,
    logic: numberToLogic(
      typeof raw.selectiveLogic === 'number' ? raw.selectiveLogic : 0
    ),
    // F06.6 默认顶层节点（导入后由 parseLorebookImport 根据 hierarchy 字段覆盖）
    hierarchyLevel: 0,
    parentId: null,
  };
}

/**
 * 导出为 SillyTavern 兼容 JSON 字符串
 *
 * F06.6 扩展（v1.1）：当任一条目存在层级关系时，附加 `hierarchy` 字段。
 * - 键为条目 ID，值为 { level, parentId }
 * - 旧版导入器无 hierarchy 字段时按扁平处理，保持向后兼容
 */
export function serializeLorebook(lb: Lorebook): string {
  const entries: Record<string, unknown> = {};
  lb.entries.forEach((entry, idx) => {
    const uidStr = String(idx);
    entries[uidStr] = {
      uid: idx,
      key: entry.keys,
      keysecondary: [],
      comment: entry.title,
      content: entry.content,
      constant: entry.strategy === 'constant',
      selective: entry.strategy === 'keyword' && entry.keys.length > 0,
      selectiveLogic: logicToNumber(entry.logic),
      order: entry.insertionOrder,
      position: positionToNumber(entry.insertionPosition),
      disable: !entry.enabled,
      probability: entry.probability,
      useProbability: entry.strategy === 'probability',
      depth: entry.depth,
      group: entry.group,
      role: '0',
      // F06.6 附带条目 ID 便于 hierarchy 引用（旧版导入器忽略此字段）
      entryId: entry.id,
    };
  });

  // F06.6 构建 hierarchy 映射（仅当存在非默认层级时才附加）
  const hierarchy: Record<string, LorebookHierarchyEntry> = {};
  let hasHierarchy = false;
  for (const entry of lb.entries) {
    const level = entry.hierarchyLevel ?? 0;
    const parentId = entry.parentId ?? null;
    // 非顶层 或 有父节点 → 视为有层级关系
    if (level !== 0 || parentId !== null) {
      hasHierarchy = true;
    }
    // 键使用条目 ID（优先），便于导入时直接对照
    hierarchy[entry.id] = { level, parentId };
  }

  const payload: Record<string, unknown> = {
    type: 'lorebook',
    name: lb.name,
    entries,
  };
  if (hasHierarchy) {
    payload.hierarchy = hierarchy;
  }
  if (lb.worldDescription) payload.worldDescription = lb.worldDescription;
  if (lb.userProfile) payload.userProfile = lb.userProfile;

  return JSON.stringify(payload, null, 2);
}

/** 导入解析结果（id / 时间戳由 store 补齐） */
export interface ParsedLorebookImport {
  name: string;
  entries: LorebookEntry[];
  worldDescription: WorldDescription | null;
  userProfile: WorldUserProfile | null;
}

/**
 * 解析导入 JSON
 *
 * F06.6 扩展（v1.1）：若 JSON 包含 `hierarchy` 字段，恢复条目的层级关系。
 * - hierarchy 键为条目 ID（与条目内 entryId 字段对应）
 * - 值为 { level, parentId }
 * - 若无 hierarchy 字段或解析失败，按扁平顶层处理（向后兼容）
 */
export function parseLorebookImport(
  json: {
    name?: string;
    entries?: unknown;
    hierarchy?: Record<string, unknown>;
    worldDescription?: WorldDescription | null;
    userProfile?: WorldUserProfile | null;
  },
  fileName: string
): ParsedLorebookImport {
  const entries: LorebookEntry[] = [];

  // 兼容 SillyTavern 格式（entries 为对象）或本项目数组格式
  const rawEntries = json.entries;
  if (Array.isArray(rawEntries)) {
    rawEntries.forEach((e, idx) => {
      entries.push(parseEntryFromJson(e as Record<string, unknown>, idx));
    });
  } else if (rawEntries && typeof rawEntries === 'object') {
    const obj = rawEntries as Record<string, unknown>;
    Object.keys(obj).forEach((k, idx) => {
      entries.push(parseEntryFromJson(obj[k] as Record<string, unknown>, idx));
    });
  }

  // F06.6 恢复层级关系（仅当存在 hierarchy 字段时）
  if (json.hierarchy && typeof json.hierarchy === 'object') {
    const hierarchyMap = json.hierarchy;
    const entryById = new Map(entries.map((e) => [e.id, e]));
    for (const [entryId, raw] of Object.entries(hierarchyMap)) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = entryById.get(entryId);
      if (!entry) continue;
      const h = raw as { level?: number; parentId?: string | null };

      // 校验 parentId 合法性：null 或指向存在的条目
      const validParentId =
        h.parentId === null ||
        (typeof h.parentId === 'string' && entryById.has(h.parentId));

      // 仅当 level 合法且 parentId 合法时才应用层级关系
      // 否则忽略该条记录（保持默认顶层节点），避免数据不一致
      if (validParentId && (h.level === 0 || h.level === 1 || h.level === 2)) {
        entry.hierarchyLevel = h.level;
        entry.parentId = h.parentId as string | null;
      }
    }
  }

  return {
    name: json.name ?? fileName.replace(/\.json$/i, ''),
    entries,
    worldDescription: json.worldDescription ?? null,
    userProfile: json.userProfile ?? null,
  };
}
