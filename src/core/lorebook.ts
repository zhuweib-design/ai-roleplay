/**
 * Lorebook（世界书）核心类型定义 (F06)
 *
 * 参考：SillyTavern world-info 设计，符合 PRD F06.1-F06.5 规格
 *
 * 一个 Lorebook 包含：
 * - 元信息（id / name / description / 绑定范围）
 * - 条目数组（每个条目含 keys / content / 激活策略 / 插入位置等）
 *
 * 数据存储：Tauri 版 lorebooks/{id}.json，Web 版 IndexedDB lorebooks store
 */

import { t } from '@/i18n';

/** 条目激活策略 (F06.2) */
export type LorebookStrategy = 'keyword' | 'constant' | 'probability';

/** 条目插入位置 (F06.3) */
export type LorebookInsertionPosition =
  | 'beforeCharDefs' // 角色定义前
  | 'afterCharDefs' // 角色定义后
  | 'atDepth'; // 指定深度 @D

/** 关键词逻辑运算 (F06.2) — 与 SillyTavern 一致 */
export type LorebookLogic = 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL';

/**
 * Lorebook 单条目 (F06.1)
 *
 * 规则约束：
 * - 单条内容上限 20000 字符
 * - 关键词和标题不注入提示词，仅 Content 字段注入
 * - 条目需自包含完整描述
 *
 * F06.6 层级结构（v1.1 新增）：
 * - hierarchyLevel 表示节点在树中的深度（0=World / 1=Region / 2=Sub-area）
 * - parentId 指向父节点 ID；null 或 undefined 表示顶层节点
 * - 扁平条目（无层级）默认 hierarchyLevel=0 且 parentId=null，向后兼容
 * - 层级深度固定为三层（World → Region → Sub-area）
 */
export interface LorebookEntry {
  /** 条目唯一 ID（同一 Lorebook 内唯一） */
  id: string;
  /** 条目标题（用于列表显示，不注入提示词） */
  title: string;
  /** 关键词数组（不区分大小写；支持正则 /pattern/flags 格式） */
  keys: string[];
  /** 注入提示词的内容 */
  content: string;
  /** 激活策略 */
  strategy: LorebookStrategy;
  /** 概率（仅 strategy='probability' 时使用，0-100） */
  probability: number;
  /** 插入顺序（数字越大越靠近上下文末尾，影响越大） */
  insertionOrder: number;
  /** 插入位置 */
  insertionPosition: LorebookInsertionPosition;
  /** 深度（仅 insertionPosition='atDepth' 时使用，从最新消息向前第 D 条后） */
  depth: number;
  /** 包含组标签（同组同时激活仅插入一条，逗号分隔多组） */
  group: string;
  /** 是否启用 */
  enabled: boolean;
  /** 关键词逻辑运算 */
  logic: LorebookLogic;
  /** 可选过滤器（正则表达式字符串，对消息预过滤） */
  filter?: string;
  /**
   * F06.6 层级深度（v1.1 新增，可选）
   * - 0: World（整体世界层，默认值）
   * - 1: Region（世界场景/地区层）
   * - 2: Sub-area（小区域层，如遗迹/酒馆/村落）
   * 未设置时按 0 处理（扁平条目兼容）
   */
  hierarchyLevel?: 0 | 1 | 2;
  /**
   * F06.6 父节点 ID（v1.1 新增，可选）
   * 指向同一 Lorebook 内的另一条目；null 或 undefined 表示顶层节点。
   * 父节点激活时自动激活子节点；子节点继承父节点的关键字。
   */
  parentId?: string | null;
  /**
   * F17.3 随机事件开关（v1.1 新增，可选）
   * 仅 hierarchyLevel >= 1 的场景条目有效；
   * 开启后该场景每轮对话可能触发 AI 生成一次性随机事件。
   */
  randomEventEnabled?: boolean;
  /**
   * F17.3 随机事件触发概率（v1.1 新增，可选，0-100，默认 10）
   * 仅 randomEventEnabled=true 时生效。
   */
  randomEventProbability?: number;
}

/**
 * Lorebook 文件 (F06.1)
 *
 * 规则约束：
 * - 每个 Lorebook 条目数上限 500 条
 * - 可绑定到角色（角色级）/Persona（Persona级）/特定聊天（聊天级）/全局
 */
export interface Lorebook {
  /** 唯一 ID */
  id: string;
  /** Lorebook 名称 */
  name: string;
  /** 描述（可选，用于列表显示） */
  description: string;
  /** 条目数组 */
  entries: LorebookEntry[];
  /**
   * 绑定范围
   * - character: 绑定到指定角色（characterId 字段）
   * - persona: 绑定到 Persona（personaId 字段）
   * - chat: 绑定到特定聊天（chatId 字段）
   * - global: 全局生效
   */
  scope: 'character' | 'persona' | 'chat' | 'global';
  /** 绑定的角色 ID（仅 scope='character' 时） */
  characterId?: string;
  /** 绑定的 Persona ID（仅 scope='persona' 时） */
  personaId?: string;
  /** 绑定的对话 ID（仅 scope='chat' 时） */
  chatId?: string;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 更新时间 ISO 字符串 */
  updatedAt: string;
  /**
   * F06.7 整体世界描述（v1.1 新增）
   * 顶层世界描述字段，作为常量条目始终注入提示词。
   * 未设置时为 null/undefined（向后兼容）。
   */
  worldDescription?: WorldDescription | null;
}

/** Lorebook 创建时的可选字段 */
export type LorebookCreateInput = Omit<Lorebook, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<Lorebook, 'id'>>;

/** Lorebook 条目创建时的可选字段 */
export type LorebookEntryCreateInput = Omit<LorebookEntry, 'id'> &
  Partial<Pick<LorebookEntry, 'id'>>;

/**
 * Lorebook 导入导出格式（兼容 SillyTavern）
 * SillyTavern 格式：{ entries: { "0": { ...entry }, "1": { ... } } }
 *
 * F06.6 扩展（v1.1）：新增可选 hierarchy 字段保存层级关系。
 * 导入旧版扁平 Lorebook（无 hierarchy 字段）时，所有条目按顶层处理。
 */
export interface LorebookExportFormat {
  /** 格式标识，固定为 'lorebook'（兼容 SillyTavern 的 'world_info'） */
  type?: 'lorebook' | 'world_info';
  /** Lorebook 名称 */
  name: string;
  /**
   * 条目映射（SillyTavern 用数字字符串作为 key）
   * 本项目也接受数组形式
   */
  entries: Record<string, SillyTavernEntry> | SillyTavernEntry[];
  /**
   * F06.6 层级关系映射（v1.1 新增，可选）
   * 键为条目 ID（或 SillyTavern 的 uid 字符串），值为层级信息。
   * 导入时若无此字段，所有条目按扁平（顶层）处理。
   */
  hierarchy?: Record<string, LorebookHierarchyEntry>;
}

/**
 * F06.6 层级关系单条记录（v1.1 新增）
 * 用于导入导出时持久化条目的层级深度与父节点关系。
 */
export interface LorebookHierarchyEntry {
  /** 层级深度：0=World / 1=Region / 2=Sub-area */
  level: 0 | 1 | 2;
  /** 父节点 ID（null 表示顶层节点） */
  parentId: string | null;
}

/** SillyTavern 兼容的条目格式 */
export interface SillyTavernEntry {
  uid?: number | string;
  key?: string[];
  keysecondary?: string[];
  comment?: string;
  content: string;
  constant?: boolean;
  vectorized?: boolean;
  selective?: boolean;
  selectiveLogic?: number;
  addMemo?: string;
  order: number;
  position: number;
  disable?: boolean;
  excludeRecursion?: boolean;
  preventRecursion?: boolean;
  delayUntilRecursion?: boolean;
  probability?: number;
  useProbability?: boolean;
  depth?: number;
  group?: string;
  groupOverride?: boolean;
  groupWeight?: number;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  automationId?: string;
  role?: number | string;
  sticky?: number;
  cooldown?: number;
}

/** 条目数上限（F06.1 规则约束） */
export const MAX_LOREBOOK_ENTRIES = 500;

/** 单条内容字符上限（F06.1 规则约束） */
export const MAX_ENTRY_CONTENT_LENGTH = 20000;

/** 世界描述内容字符上限（F06.7 规则约束） */
export const MAX_WORLD_DESCRIPTION_LENGTH = 2000;

/**
 * 世界类型枚举 (F06.7)
 * 用于整体世界描述的类型分类，影响层级结构上下文关联
 */
export type WorldType = 'fantasy' | 'scifi' | 'modern' | 'historical' | 'other';

/**
 * 整体世界描述 (F06.7)
 *
 * Lorebook 顶层世界描述字段，存储整体世界/星球描述。
 * 作为常量条目始终注入提示词，为对话提供全局世界观上下文。
 *
 * 规则约束：
 * - 内容建议不超过 2000 字符（占用永久 Token）
 * - 关键字用于 F06.6 层级结构中所有子节点的上下文关联
 */
export interface WorldDescription {
  /** 世界名称 */
  name: string;
  /** 世界类型 */
  type: WorldType;
  /** 关键字数组（用于层级结构上下文关联） */
  keys: string[];
  /** 世界描述内容（富文本） */
  content: string;
}

/** 验证 Lorebook 条目，返回错误消息数组（空表示通过） */
export function validateLorebookEntry(entry: Partial<LorebookEntry>): string[] {
  const errors: string[] = [];

  if (entry.content !== undefined && entry.content.length > MAX_ENTRY_CONTENT_LENGTH) {
    errors.push(t('lorebook.entryContentTooLong', { max: MAX_ENTRY_CONTENT_LENGTH }));
  }

  if (
    entry.probability !== undefined &&
    (entry.probability < 0 || entry.probability > 100)
  ) {
    errors.push(t('lorebook.probabilityRange'));
  }

  if (entry.insertionOrder !== undefined && entry.insertionOrder < 0) {
    errors.push(t('lorebook.orderNonNegative'));
  }

  if (entry.depth !== undefined && entry.depth < 0) {
    errors.push(t('lorebook.depthNonNegative'));
  }

  // F06.6 层级深度校验（v1.1）
  if (
    entry.hierarchyLevel !== undefined &&
    entry.hierarchyLevel !== 0 &&
    entry.hierarchyLevel !== 1 &&
    entry.hierarchyLevel !== 2
  ) {
    errors.push(t('lorebook.levelRange'));
  }

  return errors;
}

/** 验证 Lorebook，返回错误消息数组（空表示通过） */
export function validateLorebook(lorebook: Partial<Lorebook>): string[] {
  const errors: string[] = [];

  if (!lorebook.name || lorebook.name.trim() === '') {
    errors.push(t('lorebook.nameRequired'));
  } else if (lorebook.name.length > 100) {
    errors.push(t('lorebook.nameTooLong'));
  }

  if (
    lorebook.entries &&
    lorebook.entries.length > MAX_LOREBOOK_ENTRIES
  ) {
    errors.push(t('lorebook.entriesLimit', { max: MAX_LOREBOOK_ENTRIES }));
  }

  // F06.7 整体世界描述验证
  if (lorebook.worldDescription) {
    const wd = lorebook.worldDescription;
    if (wd.content && wd.content.length > MAX_WORLD_DESCRIPTION_LENGTH) {
      errors.push(t('lorebook.worldDescTooLong', { max: MAX_WORLD_DESCRIPTION_LENGTH }));
    }
    if (wd.name && wd.name.length > 100) {
      errors.push(t('lorebook.worldNameTooLong'));
    }
  }

  // F06.6 层级结构验证（v1.1）
  if (lorebook.entries && lorebook.entries.length > 0) {
    const entries = lorebook.entries;
    const idSet = new Set(entries.map((e) => e.id));

    for (const entry of entries) {
      // parentId 必须指向同 Lorebook 内存在的条目
      if (entry.parentId !== undefined && entry.parentId !== null) {
        if (!idSet.has(entry.parentId)) {
          errors.push(t('lorebook.parentNotFound', { title: entry.title }));
        }
      }

      // 子节点深度必须严格大于父节点深度
      if (entry.parentId !== undefined && entry.parentId !== null) {
        const parent = entries.find((e) => e.id === entry.parentId);
        const childLevel = entry.hierarchyLevel ?? 0;
        const parentLevel = parent?.hierarchyLevel ?? 0;
        if (parent && childLevel <= parentLevel) {
          errors.push(
            `条目 "${entry.title}" 的层级深度（${childLevel}）必须大于父节点深度（${parentLevel}）`
          );
        }
      }
    }

    // 循环检测：沿 parentId 链向上追溯，若回到起点则存在循环
    for (const entry of entries) {
      const visited = new Set<string>();
      let current: string | null | undefined = entry.id;
      while (current !== null && current !== undefined) {
        if (visited.has(current)) {
          errors.push(t('lorebook.circularRef', { title: entry.title }));
          break;
        }
        visited.add(current);
        const node = entries.find((e) => e.id === current);
        if (!node) break;
        // 沿父链向上：当前节点查自己的 parentId
        if (current === entry.id) {
          // 起点用 entry 自身的 parentId
          current = entry.parentId ?? null;
        } else {
          current = node.parentId ?? null;
        }
      }
    }
  }

  return errors;
}
