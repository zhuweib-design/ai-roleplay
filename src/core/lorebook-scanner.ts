/**
 * Lorebook 关键词扫描与条目激活引擎 (W6 · F06.2-F06.3)
 *
 * 职责：
 * 1. 扫描最近 N 条消息，匹配 Lorebook 条目关键词
 * 2. 根据激活策略（常量/关键词/概率）决定激活
 * 3. 应用关键词逻辑（AND ANY / AND ALL / NOT ANY / NOT ALL）
 * 4. 处理包含组（同组同时激活仅插入一条）
 * 5. 按 insertionOrder 排序激活条目
 *
 * 不负责：
 * - 实际注入到提示词（由 prompt-builder 负责）
 * - Token 预算裁剪（由 prompt-builder 负责）
 *
 * 参考：SillyTavern world-info.js 的扫描逻辑
 */

import type { Lorebook, LorebookEntry, LorebookLogic } from './lorebook';

/** 扫描上下文 */
export interface ScanContext {
  /** 最近 N 条消息文本（用于关键词扫描，从最早到最新） */
  recentMessages: string[];
  /** 可选的全局文本（如角色描述、场景设定，也参与扫描） */
  additionalText?: string;
}

/** 激活的条目（带来源 Lorebook 引用） */
export interface ActivatedEntry {
  /** 条目数据 */
  entry: LorebookEntry;
  /** 来源 Lorebook id */
  lorebookId: string;
  /** 来源 Lorebook 名称 */
  lorebookName: string;
  /** 命中的关键词（用于调试） */
  matchedKeys: string[];
}

/**
 * 将关键词字符串解析为 RegExp 或字符串
 * 支持 /pattern/flags 格式
 */
function parseKey(rawKey: string): { type: 'regex'; regex: RegExp } | { type: 'text'; text: string } | null {
  const trimmed = rawKey.trim();
  if (!trimmed) return null;

  // 检测 /pattern/flags 格式
  const regexMatch = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexMatch) {
    try {
      const regex = new RegExp(regexMatch[1]!, regexMatch[2]);
      return { type: 'regex', regex };
    } catch {
      // 正则解析失败，降级为普通文本
      return { type: 'text', text: trimmed };
    }
  }

  return { type: 'text', text: trimmed.toLowerCase() };
}

/**
 * 检查单个关键词是否在文本中匹配
 * 关键词不区分大小写（按 F06.2 规则约束）
 */
function matchKey(key: string, text: string): boolean {
  const parsed = parseKey(key);
  if (!parsed) return false;

  if (parsed.type === 'regex') {
    return parsed.regex.test(text);
  }

  // 普通文本：不区分大小写
  return text.toLowerCase().includes(parsed.text);
}

/**
 * 应用关键词逻辑运算 (F06.2)
 * - AND_ANY: 任一关键词命中即激活
 * - AND_ALL: 所有关键词都命中才激活
 * - NOT_ANY: 任一关键词命中则不激活
 * - NOT_ALL: 所有关键词都不命中才激活
 *
 * @param keys 关键词数组
 * @param text 待扫描文本
 * @param logic 逻辑运算
 * @returns { activated, matchedKeys }
 */
function applyLogic(
  keys: string[],
  text: string,
  logic: LorebookLogic
): { activated: boolean; matchedKeys: string[] } {
  const matchedKeys: string[] = [];
  for (const key of keys) {
    if (matchKey(key, text)) {
      matchedKeys.push(key);
    }
  }

  switch (logic) {
    case 'AND_ANY':
      return { activated: matchedKeys.length > 0, matchedKeys };
    case 'AND_ALL':
      return { activated: matchedKeys.length === keys.length, matchedKeys };
    case 'NOT_ANY':
      return { activated: matchedKeys.length === 0, matchedKeys };
    case 'NOT_ALL':
      // 所有关键词都不命中才激活
      return { activated: matchedKeys.length === 0, matchedKeys };
    default:
      return { activated: matchedKeys.length > 0, matchedKeys };
  }
}

/**
 * 扫描单个 Lorebook，返回激活的条目
 *
 * F06.6 层级结构扩展（v1.1）：
 * - 父节点激活时自动激活所有子节点（递归）
 * - 子节点继承父节点的关键字（自身 keys + 所有祖先 keys）
 * - 扁平条目（无 parentId）行为不变，向后兼容
 */
function scanLorebook(
  lorebook: Lorebook,
  context: ScanContext
): ActivatedEntry[] {
  // 合并所有待扫描文本
  const fullText = [
    ...context.recentMessages,
    context.additionalText ?? '',
  ].join('\n');

  // F06.6 构建层级索引
  const entryMap = new Map<string, LorebookEntry>();
  const childrenMap = new Map<string, LorebookEntry[]>();
  for (const entry of lorebook.entries) {
    entryMap.set(entry.id, entry);
    const parentId = entry.parentId ?? null;
    if (parentId !== null) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(entry);
    }
  }

  /**
   * 获取节点继承的关键字（自身 + 所有祖先节点的 keys）
   * 用于 F06.6 "子节点继承父节点的关键字" 规则。
   * 使用 visited 集合防止循环引用导致死循环。
   */
  const inheritedKeysCache = new Map<string, string[]>();
  function getInheritedKeys(entry: LorebookEntry): string[] {
    if (inheritedKeysCache.has(entry.id)) return inheritedKeysCache.get(entry.id)!;
    const keys = [...entry.keys];
    const visited = new Set<string>([entry.id]);
    let currentParentId = entry.parentId ?? null;
    while (currentParentId !== null && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = entryMap.get(currentParentId);
      if (!parent) break;
      keys.push(...parent.keys);
      currentParentId = parent.parentId ?? null;
    }
    inheritedKeysCache.set(entry.id, keys);
    return keys;
  }

  /**
   * 判断单个节点是否通过自身策略激活（不考虑父节点级联）
   */
  function isEntrySelfActivated(entry: LorebookEntry): {
    activated: boolean;
    matchedKeys: string[];
  } {
    if (!entry.enabled) return { activated: false, matchedKeys: [] };

    switch (entry.strategy) {
      case 'constant':
        return { activated: true, matchedKeys: [] };

      case 'keyword': {
        if (entry.keys.length === 0) return { activated: false, matchedKeys: [] };
        // F06.6：使用继承的关键字（自身 + 祖先）
        const effectiveKeys = getInheritedKeys(entry);
        if (effectiveKeys.length === 0) return { activated: false, matchedKeys: [] };
        return applyLogic(effectiveKeys, fullText, entry.logic);
      }

      case 'probability': {
        if (entry.keys.length === 0) return { activated: false, matchedKeys: [] };
        const effectiveKeys = getInheritedKeys(entry);
        if (effectiveKeys.length === 0) return { activated: false, matchedKeys: [] };
        const r = applyLogic(effectiveKeys, fullText, entry.logic);
        if (r.activated) {
          return {
            activated: Math.random() * 100 < entry.probability,
            matchedKeys: r.matchedKeys,
          };
        }
        return { activated: false, matchedKeys: [] };
      }

      default:
        return { activated: false, matchedKeys: [] };
    }
  }

  // 第一轮：扫描所有节点，记录通过自身策略激活的节点
  const activatedSet = new Set<string>();
  const matchedKeysMap = new Map<string, string[]>();
  for (const entry of lorebook.entries) {
    const r = isEntrySelfActivated(entry);
    if (r.activated) {
      activatedSet.add(entry.id);
      matchedKeysMap.set(entry.id, r.matchedKeys);
    }
  }

  // 第二轮：F06.6 父节点激活时自动激活所有子节点（递归）
  const toExpand = [...activatedSet];
  while (toExpand.length > 0) {
    const parentId = toExpand.pop()!;
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      if (!child.enabled) continue;
      if (activatedSet.has(child.id)) continue;
      activatedSet.add(child.id);
      // 通过父节点级联激活，matchedKeys 为空（非关键字命中）
      if (!matchedKeysMap.has(child.id)) {
        matchedKeysMap.set(child.id, []);
      }
      toExpand.push(child.id); // 递归激活孙子节点
    }
  }

  // 构建结果（保持原条目顺序）
  const result: ActivatedEntry[] = [];
  for (const entry of lorebook.entries) {
    if (activatedSet.has(entry.id)) {
      result.push({
        entry,
        lorebookId: lorebook.id,
        lorebookName: lorebook.name,
        matchedKeys: matchedKeysMap.get(entry.id) ?? [],
      });
    }
  }

  return result;
}

/**
 * 处理包含组 (F06.4)
 * 同组同时激活仅插入一条（默认按随机权重选取）
 *
 * @param activated 已激活的条目列表
 * @returns 处理后的条目列表
 */
function applyGroupFilter(activated: ActivatedEntry[]): ActivatedEntry[] {
  const result: ActivatedEntry[] = [];
  const processed = new Set<string>(); // 已处理的 entry id

  // 按 group 字段分组（支持逗号分隔多组）
  const groupMap = new Map<string, ActivatedEntry[]>();
  const noGroup: ActivatedEntry[] = [];

  for (const item of activated) {
    const group = item.entry.group.trim();
    if (!group) {
      noGroup.push(item);
      continue;
    }
    // 拆分多个组
    const groups = group.split(',').map((g) => g.trim()).filter(Boolean);
    for (const g of groups) {
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(item);
    }
  }

  // 无组的条目直接保留
  result.push(...noGroup);
  for (const item of noGroup) {
    processed.add(item.entry.id);
  }

  // 对每个组：随机选取一个
  for (const [, items] of groupMap) {
    // 过滤已处理的（避免被多个组同时选中导致重复）
    const available = items.filter((i) => !processed.has(i.entry.id));
    if (available.length === 0) continue;

    // 简单随机选取（PRD 提到"默认按随机权重"，这里使用 Math.random）
    const pick = available[Math.floor(Math.random() * available.length)]!;
    result.push(pick);
    processed.add(pick.entry.id);
  }

  return result;
}

/**
 * 按 insertionOrder 排序激活的条目 (F06.3)
 * 数字越大越靠近上下文末尾（影响越大）
 */
function sortByInsertionOrder(activated: ActivatedEntry[]): ActivatedEntry[] {
  return [...activated].sort(
    (a, b) => a.entry.insertionOrder - b.entry.insertionOrder
  );
}

/**
 * 扫描多个 Lorebook，返回最终激活并排序的条目列表
 *
 * @param lorebooks 待扫描的 Lorebook 数组（已按角色级/全局过滤）
 * @param context 扫描上下文（最近消息等）
 * @returns 激活并排序后的条目（按 insertionOrder 升序）
 */
export function scanLorebooks(
  lorebooks: Lorebook[],
  context: ScanContext
): ActivatedEntry[] {
  // 1. 扫描每个 Lorebook
  const allActivated: ActivatedEntry[] = [];
  for (const lb of lorebooks) {
    const items = scanLorebook(lb, context);
    allActivated.push(...items);
  }

  // 2. 应用包含组过滤
  const filtered = applyGroupFilter(allActivated);

  // 3. 按 insertionOrder 排序
  return sortByInsertionOrder(filtered);
}

/**
 * 按插入位置分组激活的条目 (F06.3)
 * 便于 prompt-builder 在正确位置注入
 */
export interface GroupedActivatedEntries {
  /** 角色定义前 */
  beforeCharDefs: ActivatedEntry[];
  /** 角色定义后 */
  afterCharDefs: ActivatedEntry[];
  /** 指定深度 @D（按 depth 分组） */
  atDepth: Map<number, ActivatedEntry[]>;
}

/**
 * 将激活的条目按插入位置分组
 */
export function groupByInsertionPosition(
  activated: ActivatedEntry[]
): GroupedActivatedEntries {
  const result: GroupedActivatedEntries = {
    beforeCharDefs: [],
    afterCharDefs: [],
    atDepth: new Map(),
  };

  for (const item of activated) {
    switch (item.entry.insertionPosition) {
      case 'beforeCharDefs':
        result.beforeCharDefs.push(item);
        break;
      case 'afterCharDefs':
        result.afterCharDefs.push(item);
        break;
      case 'atDepth': {
        const depth = item.entry.depth;
        if (!result.atDepth.has(depth)) {
          result.atDepth.set(depth, []);
        }
        result.atDepth.get(depth)!.push(item);
        break;
      }
    }
  }

  return result;
}
