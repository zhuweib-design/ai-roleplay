/**
 * 事件系统类型定义 (F17, v1.1 新增)
 *
 * 事件系统为角色扮演对话增加可编程的事件触发机制。
 * 事件可绑定到 F06.6 世界层级结构的场景/小区域，
 * 根据前后文内容和事件状态触发。
 *
 * 依赖：F06.6 世界层级结构
 */

// ── 事件状态 ──

/**
 * 事件状态机 (F17.1)
 * - pending：待触发（等待触发条件满足）
 * - active：进行中（已触发，事件描述注入提示词）
 * - completed：已完成（事件结束，不再触发）
 * - failed：失败（事件被标记为失败，不再触发）
 */
export type EventState = 'pending' | 'active' | 'completed' | 'failed';

// ── 触发条件类型 ──

/**
 * 触发条件类型 (F17.1)
 * - keyword：前后文关键词匹配（支持正则表达式）
 * - dependency：事件前置依赖（其他事件必须已完成）
 * - time：时间触发（依赖 F16.4，当前未实现，预留接口）
 * - manual：仅手动触发（不自动触发）
 */
export type TriggerConditionType = 'keyword' | 'dependency' | 'time' | 'manual';

// ── 触发条件 ──

/**
 * 关键词触发条件
 */
export interface KeywordTrigger {
  type: 'keyword';
  /** 关键词列表（任一匹配即触发） */
  keywords: string[];
  /** 是否使用正则表达式匹配 */
  useRegex: boolean;
  /** 是否大小写敏感 */
  caseSensitive: boolean;
}

/**
 * 事件前置依赖触发条件
 */
export interface DependencyTrigger {
  type: 'dependency';
  /** 前置事件名称列表（全部需完成才触发） */
  requiredEvents: string[];
}

/**
 * 时间触发条件（依赖 F16.4，预留）
 */
export interface TimeTrigger {
  type: 'time';
  /** 触发的故事时间（如 "第 3 天"） */
  storyTime: string;
}

/**
 * 手动触发条件（不自动触发，仅通过 /event trigger 命令）
 */
export interface ManualTrigger {
  type: 'manual';
}

/**
 * 触发条件联合类型
 */
export type TriggerCondition =
  | KeywordTrigger
  | DependencyTrigger
  | TimeTrigger
  | ManualTrigger;

// ── 完成条件 ──

/**
 * 事件完成条件 (F17.2)
 * 当 active 状态的事件满足完成条件时，状态改为 completed
 */
export interface CompletionCondition {
  /** 完成关键词列表（任一匹配即完成） */
  keywords?: string[];
  /** 是否使用正则表达式 */
  useRegex?: boolean;
  /** 手动完成（仅通过 /event complete 命令） */
  manualOnly?: boolean;
}

// ── 事件实体 ──

/**
 * 故事事件 (F17.1)
 *
 * 规则约束：
 * - 单个场景或小区域最多绑定 20 个事件
 * - 事件描述内容在触发时注入提示词，占用 Token 预算
 * - 事件状态变更可通过脚本命令或触发引擎自动判定
 */
export interface StoryEvent {
  /** 事件唯一 ID（同一 Lorebook 内唯一） */
  id: string;
  /** 事件名称（用于显示和前置依赖引用） */
  name: string;
  /** 事件描述（富文本，触发时注入提示词的叙述内容） */
  description: string;
  /** 绑定的 Lorebook ID（事件所属的 Lorebook） */
  lorebookId: string;
  /**
   * 绑定的场景条目 ID（F06.6 层级结构）
   * - 指向 Region（level=1）或 Sub-area（level=2）的 LorebookEntry.id
   * - null 表示全局事件（不绑定特定场景）
   */
  sceneEntryId: string | null;
  /** 场景名称（冗余存储，用于显示） */
  sceneName: string | null;
  /** 触发条件 */
  trigger: TriggerCondition;
  /** 完成条件 */
  completion: CompletionCondition;
  /** 触发概率（0-100，默认 100） */
  probability: number;
  /** 当前状态 */
  state: EventState;
  /** 是否允许重复触发 */
  repeatable: boolean;
  /** 已触发次数 */
  triggerCount: number;
  /** 创建时间 ISO */
  createdAt: string;
  /** 更新时间 ISO */
  updatedAt: string;
  /** 最后触发时间 ISO（可选） */
  lastTriggeredAt?: string | null;
}

// ── 常量 ──

/** 单个场景或小区域最多绑定的事件数 */
export const MAX_EVENTS_PER_SCENE = 20;

// ── 工厂函数 ──

/**
 * 创建默认的关键词触发条件
 */
export function createDefaultKeywordTrigger(): KeywordTrigger {
  return {
    type: 'keyword',
    keywords: [],
    useRegex: false,
    caseSensitive: false,
  };
}

/**
 * 创建默认的完成条件
 */
export function createDefaultCompletion(): CompletionCondition {
  return {
    manualOnly: true,
  };
}

/**
 * 创建新事件的默认值
 */
export function createDefaultEvent(
  lorebookId: string,
  sceneEntryId: string | null = null,
  sceneName: string | null = null
): Omit<StoryEvent, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '',
    description: '',
    lorebookId,
    sceneEntryId,
    sceneName,
    trigger: createDefaultKeywordTrigger(),
    completion: createDefaultCompletion(),
    probability: 100,
    state: 'pending',
    repeatable: false,
    triggerCount: 0,
    lastTriggeredAt: null,
  };
}

// ── 校验 ──

/**
 * 校验事件配置
 * @returns 错误消息数组，空数组表示通过
 */
export function validateEvent(event: Partial<StoryEvent>): string[] {
  const errors: string[] = [];

  if (!event.name || event.name.trim() === '') {
    errors.push('事件名称不能为空');
  } else if (event.name.length > 50) {
    errors.push('事件名称不能超过 50 字符');
  }

  if (!event.description || event.description.trim() === '') {
    errors.push('事件描述不能为空');
  } else if (event.description.length > 2000) {
    errors.push('事件描述不能超过 2000 字符');
  }

  if (event.probability !== undefined) {
    if (typeof event.probability !== 'number' || event.probability < 0 || event.probability > 100) {
      errors.push('触发概率必须在 0-100 之间');
    }
  }

  // 触发条件校验
  if (event.trigger) {
    const t = event.trigger;
    if (t.type === 'keyword') {
      if (!Array.isArray(t.keywords) || t.keywords.length === 0) {
        errors.push('关键词触发条件必须至少包含一个关键词');
      }
      // 校验正则表达式有效性
      if (t.useRegex && Array.isArray(t.keywords)) {
        for (const kw of t.keywords) {
          try {
            new RegExp(kw);
          } catch {
            errors.push(`无效的正则表达式：${kw}`);
            break;
          }
        }
      }
    } else if (t.type === 'dependency') {
      if (!Array.isArray(t.requiredEvents) || t.requiredEvents.length === 0) {
        errors.push('前置依赖触发条件必须至少包含一个前置事件');
      }
    }
  }

  return errors;
}

// ── 辅助函数 ──

/**
 * 判断事件是否可触发（状态为 pending 或 completed（若可重复））
 */
export function isTriggerable(event: StoryEvent): boolean {
  if (event.state === 'pending') return true;
  if (event.state === 'completed' && event.repeatable) return true;
  return false;
}

/**
 * 判断事件是否为进行中（描述已注入提示词）
 */
export function isActive(event: StoryEvent): boolean {
  return event.state === 'active';
}

/**
 * 判断事件是否已结束（不再触发）
 */
export function isFinished(event: StoryEvent): boolean {
  return event.state === 'completed' || event.state === 'failed';
}
