/**
 * 事件触发引擎 (F17.2, v1.1 新增)
 *
 * 职责：
 * 1. 每轮扫描事件触发条件
 * 2. 关键词匹配（支持正则、大小写敏感）
 * 3. 前置依赖检查（requiredEvents 必须 state==='completed'）
 * 4. 概率判定（Math.random() * 100 <= probability）
 * 5. 检查 active 事件的完成条件
 *
 * 规则约束：
 * - 每轮最多触发 1 个事件（按 probability 降序，第一个通过概率判定的触发）
 * - 已 active 的事件不再触发（避免重复激活）
 * - 已 completed 的事件仅当 repeatable=true 才可重新触发
 * - 已 failed 的事件不再触发
 * - manual / time 触发类型不自动触发
 *
 * 依赖：F17.1 事件类型
 */

import type { StoryEvent } from './event-types';
import { isTriggerable } from './event-types';
import { t } from '@/i18n';

// ── 上下文 ──

/**
 * 触发扫描上下文
 */
export interface TriggerContext {
  /** 最近的对话消息内容（用于关键词匹配） */
  recentMessages: string[];
  /** 当前激活的场景 ID（来自 LorebookEntry，null 表示无场景上下文） */
  currentSceneId?: string | null;
  /**
   * 通过事件名称查找事件的回调（用于前置依赖检查）
   * 若不提供，dependency 触发条件始终视为未满足
   */
  getEventByName?: (name: string) => StoryEvent | undefined;
  /**
   * F16.4 当前格式化的故事时间（如 "第 3 天"）
   * 用于 time 触发条件比对（TimeTrigger.storyTime === currentStoryTime）
   * null/undefined 表示无时间上下文，time 触发条件不会满足
   */
  currentStoryTime?: string | null;
}

// ── 结果 ──

/**
 * 单次扫描结果
 */
export interface TriggerResult {
  /** 本轮触发的事件（每轮最多 1 个，未触发时为 null） */
  triggered: StoryEvent | null;
  /** 因完成条件满足而应标记为 completed 的事件列表 */
  completed: StoryEvent[];
  /** 跳过的事件及原因（用于调试与日志） */
  skipped: { eventName: string; reason: string }[];
}

// ── 主扫描函数 ──

/**
 * 扫描事件，返回触发结果
 *
 * 算法：
 * 1. 检查 active 事件的完成条件（manualOnly 跳过）
 * 2. 筛选可触发事件（state pending 或 completed+repeatable）
 * 3. 按场景过滤（全局事件或匹配当前场景的事件）
 * 4. 依次检查触发条件（keyword/dependency/manual/time）
 * 5. 通过触发条件的进行概率判定
 * 6. 第一个通过概率判定的触发，剩余跳过
 *
 * @param events 当前 Lorebook 中的全部事件
 * @param context 触发扫描上下文
 */
export function scanTriggers(
  events: StoryEvent[],
  context: TriggerContext
): TriggerResult {
  const skipped: { eventName: string; reason: string }[] = [];
  const completed: StoryEvent[] = [];

  // 1. 检查 active 事件的完成条件
  for (const evt of events) {
    if (evt.state !== 'active') continue;
    if (evt.completion.manualOnly) continue;
    const keywords = evt.completion.keywords ?? [];
    if (keywords.length === 0) continue;

    const matched = matchKeywords(
      keywords,
      context.recentMessages,
      evt.completion.useRegex ?? false,
      false // 完成关键词默认大小写不敏感
    );
    if (matched) {
      completed.push(evt);
    }
  }

  // 2. 筛选可触发事件
  const candidates = events.filter(isTriggerable);

  // 3. 按场景过滤
  const sceneFiltered = candidates.filter((e) => {
    if (e.sceneEntryId === null) return true; // 全局事件始终匹配
    return e.sceneEntryId === context.currentSceneId;
  });

  // 4. 检查触发条件
  const matched: StoryEvent[] = [];
  for (const evt of sceneFiltered) {
    const result = checkTriggerCondition(evt, context);
    if (!result.success) {
      skipped.push({ eventName: evt.name, reason: result.reason ?? t('trig.condNotMet') });
      continue;
    }
    matched.push(evt);
  }

  if (matched.length === 0) {
    return { triggered: null, skipped, completed };
  }

  // 5. 按优先级排序：probability 降序，同概率时按创建时间升序（先创建的优先）
  matched.sort((a, b) => {
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });

  // 6. 依次概率判定，第一个通过的触发
  for (const evt of matched) {
    const roll = Math.random() * 100;
    if (roll <= evt.probability) {
      return { triggered: evt, skipped, completed };
    }
    skipped.push({
      eventName: evt.name,
      reason: t('trig.probFailed', { roll: roll.toFixed(1), prob: evt.probability }),
    });
  }

  return { triggered: null, skipped, completed };
}

// ── 内部辅助函数 ──

/**
 * 检查单个事件的触发条件
 */
function checkTriggerCondition(
  evt: StoryEvent,
  context: TriggerContext
): { success: boolean; reason?: string } {
  const trigger = evt.trigger;

  if (trigger.type === 'keyword') {
    const ok = matchKeywords(
      trigger.keywords,
      context.recentMessages,
      trigger.useRegex,
      trigger.caseSensitive
    );
    return ok
      ? { success: true }
      : { success: false, reason: t('trig.keywordNoMatch') };
  }

  if (trigger.type === 'dependency') {
    if (!context.getEventByName) {
      return { success: false, reason: t('trig.depCheckFailed') };
    }
    const allComplete = trigger.requiredEvents.every((name) => {
      const dep = context.getEventByName!(name);
      return dep?.state === 'completed';
    });
    return allComplete
      ? { success: true }
      : { success: false, reason: t('trig.prereqIncomplete') };
  }

  if (trigger.type === 'manual') {
    return { success: false, reason: t('trig.manualOnly') };
  }

  if (trigger.type === 'time') {
    // F16.4 对接：比对 TimeTrigger.storyTime 与当前故事时间
    if (!context.currentStoryTime) {
      return { success: false, reason: t('trig.noStoryTime') };
    }
    return trigger.storyTime === context.currentStoryTime
      ? { success: true }
      : { success: false, reason: t('trig.timeMismatch', { current: context.currentStoryTime, required: trigger.storyTime }) };
  }

  return { success: false, reason: t('trig.unknownType') };
}

/**
 * 关键词匹配
 *
 * @param keywords 关键词列表（任一匹配即返回 true）
 * @param messages 待匹配的消息列表
 * @param useRegex 是否使用正则表达式
 * @param caseSensitive 是否大小写敏感
 * @returns 任一关键词匹配则返回 true
 */
export function matchKeywords(
  keywords: string[],
  messages: string[],
  useRegex: boolean,
  caseSensitive: boolean
): boolean {
  if (keywords.length === 0) return false;
  if (messages.length === 0) return false;

  const text = messages.join('\n');

  for (const kw of keywords) {
    if (useRegex) {
      try {
        // 正则始终基于原文本，通过 flags 控制大小写
        const flags = caseSensitive ? '' : 'i';
        const re = new RegExp(kw, flags);
        if (re.test(text)) return true;
      } catch {
        // 无效正则忽略
      }
    } else {
      // 普通字符串 includes
      if (caseSensitive) {
        if (text.includes(kw)) return true;
      } else {
        const textLower = text.toLowerCase();
        const kwLower = kw.toLowerCase();
        if (textLower.includes(kwLower)) return true;
      }
    }
  }

  return false;
}

// ── 高层 API：构建系统提示注入 ──

/**
 * 构建激活事件的注入文本（用于 prompt-builder）
 *
 * 将所有 state==='active' 的事件描述聚合为一段文本，
 * 注入到系统提示中，让 AI 知道当前正在进行的事件。
 *
 * @param events 当前 Lorebook 的事件
 * @returns 注入文本（无激活事件时返回空字符串）
 */
export function buildActiveEventsInjection(events: StoryEvent[]): string {
  const active = events.filter((e) => e.state === 'active');
  if (active.length === 0) return '';

  const lines = active.map((e) => {
    const sceneTag = e.sceneName ? `[${e.sceneName}] ` : '';
    return t('trig.eventItem', { tag: sceneTag, name: e.name, desc: e.description });
  });

  return t('trig.activeEvents', { list: lines.join('\n\n') });
}
