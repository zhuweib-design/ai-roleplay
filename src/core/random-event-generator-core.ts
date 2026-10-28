/**
 * 随机事件生成 —— 基础层 (F17.3)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。本层是 v1.1 最初的那一套：
 * 参数 / 结果类型、两个概率常量、概率判定、Prompt 构建、容错解析、转临时 StoryEvent。
 *
 * 依赖方向：本层**不引用任何其它拆出模块**；factories 层与 runtime 层都单向依赖本层。
 *
 * i18n：Prompt 文案是模型面提示词而非 UI 文案，故整块在 i18n-ignore 内，本文件自持一对标记。
 */

import type { StoryEvent } from './event-types';
import { parseAiJson } from './json-utils';

// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）


// ── 类型 ──

/**
 * 随机事件生成参数
 */
export interface RandomEventParams {
  /** 当前场景名称（Region/Sub-area 标题） */
  sceneName: string;
  /** 当前场景描述（Region/Sub-area content，可选） */
  sceneDescription?: string;
  /** 世界名称（来自 Lorebook worldDescription） */
  worldName?: string;
  /** 世界类型 */
  worldType?: string;
  /** 最近对话消息（用于让 AI 知道上下文） */
  recentMessages: string[];
  /** 当前已激活事件名称（避免重复） */
  activeEventNames?: string[];
  /** 随机种子（可选） */
  seed?: string;
}

/**
 * AI 生成的随机事件结构
 */
export interface GeneratedRandomEvent {
  /** 事件名称（用于显示） */
  name: string;
  /** 事件描述（注入提示词的叙述内容） */
  description: string;
  /** 是否为一次性事件（生成即触发，无后续状态机） */
  isOneShot: true;
}

// ── 常量 ──

/** 默认随机事件触发概率（10%） */
export const DEFAULT_RANDOM_EVENT_PROBABILITY = 10;

/** 单个场景随机事件上限（避免堆积） */
export const MAX_ACTIVE_RANDOM_EVENTS = 1;

// ── 概率判定 ──

/**
 * 判定本轮是否触发随机事件
 *
 * @param probability 触发概率（0-100）
 * @returns true 表示触发
 */
export function shouldTriggerRandomEvent(
  probability: number = DEFAULT_RANDOM_EVENT_PROBABILITY
): boolean {
  if (probability <= 0) return false;
  if (probability >= 100) return true;
  const roll = Math.random() * 100;
  return roll <= probability;
}

// ── Prompt 构建 ──

/**
 * 构建随机事件生成的 LLM 消息
 *
 * @param params 生成参数
 * @returns 发送给 LLM 的消息列表
 */
export function buildRandomEventMessages(
  params: RandomEventParams
): Array<{ role: 'system' | 'user'; content: string }> {
  const seed = params.seed ?? Math.random().toString(36).slice(2, 10);

  // 场景上下文
  const sceneParts: string[] = [];
  if (params.worldName) sceneParts.push(`【世界】${params.worldName}`);
  if (params.worldType) sceneParts.push(`【世界类型】${params.worldType}`);
  if (params.sceneName) sceneParts.push(`【当前场景】${params.sceneName}`);
  if (params.sceneDescription) {
    sceneParts.push(`【场景描述】${params.sceneDescription}`);
  }
  const sceneBlock = sceneParts.length > 0 ? sceneParts.join('\n') : '（无场景上下文）';

  // 最近对话（限制长度避免 Token 浪费）
  const recentText = params.recentMessages.slice(-6).join('\n');
  const activeBlock =
    params.activeEventNames && params.activeEventNames.length > 0
      ? `【已激活事件】${params.activeEventNames.join('、')}\n（避免与上述事件冲突）`
      : '';

  const systemContent = `你是一个 RPG 事件生成器，擅长为角色扮演场景创造临时的小型事件（不是主线剧情），事件将作为当前轮次的背景叙述注入对话。请严格按照用户的要求生成，并以 JSON 格式返回，不要输出任何其他文字。`;

  const userContent = `请根据以下场景与对话上下文，生成一个适合当前情境的临时小事件。

【随机种子】${seed}
${sceneBlock}

【最近对话】
${recentText}

${activeBlock}

要求：
1. 事件类型：小型互动事件（如偶遇 NPC、突发小状况、环境变化、发现物品）
2. 事件不能改变主线剧情，仅作为氛围与互动切入点
3. 描述简洁生动（80-200 字），包含足够的细节让 AI 继续演绎
4. 避免与已激活事件冲突或重复
5. 事件名简短（2-10字）

返回纯 JSON（不要 markdown 代码块），结构如下：
{
  "name": "事件名",
  "description": "事件描述（用于注入提示词的叙述）"
}`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ── 解析 ──

/**
 * 解析 AI 返回的随机事件
 *
 * @param raw AI 返回的原始文本
 * @returns 解析成功返回 GeneratedRandomEvent，失败返回 null
 */
export function parseGeneratedRandomEvent(raw: string): GeneratedRandomEvent | null {
  if (!raw || typeof raw !== 'string') return null;

  const obj = parseAiJson<Record<string, unknown>>(raw);
  if (!obj || typeof obj !== 'object') return null;

  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';

  if (!name || !description) return null;
  if (name.length > 50) return null;
  if (description.length > 2000) return null;

  return {
    name,
    description,
    isOneShot: true,
  };
}

// ── 转换为 StoryEvent ──

/**
 * 将随机生成的事件转换为临时 StoryEvent（一次性，不持久化）
 *
 * 生成的 StoryEvent：
 * - state 直接为 'active'（即触发即激活）
 * - repeatable 为 false
 * - sceneEntryId 为 null（不绑定到具体场景，因为是临时事件）
 *
 * @param generated 生成的随机事件
 * @param lorebookId 所属 Lorebook
 * @returns 临时 StoryEvent
 */
export function generatedRandomEventToStoryEvent(
  generated: GeneratedRandomEvent,
  lorebookId: string
): StoryEvent {
  const now = new Date().toISOString();
  return {
    id: `rand-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: generated.name,
    description: generated.description,
    lorebookId,
    sceneEntryId: null,
    sceneName: null,
    trigger: { type: 'manual' }, // 随机事件不通过触发条件，已直接 active
    completion: { manualOnly: true },
    probability: 100,
    state: 'active',
    repeatable: false,
    triggerCount: 1,
    createdAt: now,
    updatedAt: now,
    lastTriggeredAt: now,
  };
}

// i18n-ignore-end