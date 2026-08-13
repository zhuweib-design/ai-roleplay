/**
 * 随机事件生成 (F17.3, v1.1 新增)
 *
 * 业务逻辑：
 * - 在每轮 AI 回复后，根据当前场景的随机事件开关与概率判定
 * - 通过 LLM 动态生成一个一次性事件（不持久化为正式 StoryEvent）
 * - 生成的事件描述直接注入到下一轮提示词中
 *
 * 规则约束：
 * - 默认 10% 概率（每个开启随机事件的场景）
 * - 单次生成消耗约 300-600 Token
 * - AI 未连接时禁用
 * - 已有 active 事件时不重复触发（避免事件堆积）
 *
 * 依赖：F17.1 事件类型、F06.6 世界层级结构
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

// ====================================================================
// F17.3 扩展：事件模板管理 / 多维度参数 / 场景级配置 / 反馈机制
// ====================================================================

// ── 多维度参数：事件类别与严重度 ──

/**
 * 随机事件类别
 * - encounter：偶遇 NPC
 * - discovery：发现物品/地点
 * - combat：战斗冲突
 * - social：社交互动
 * - environment：环境变化
 * - mystery：神秘事件
 * - custom：自定义
 */
export type RandomEventCategory =
  | 'encounter'
  | 'discovery'
  | 'combat'
  | 'social'
  | 'environment'
  | 'mystery'
  | 'custom';

/**
 * 事件严重度（从轻到重）
 */
export type RandomEventSeverity = 'trivial' | 'minor' | 'moderate' | 'major' | 'critical';

/**
 * 严重度等级映射（数值越大影响越大，用于 maxSeverity 限制比较）
 */
export const SEVERITY_RANK: Record<RandomEventSeverity, number> = {
  trivial: 1,
  minor: 2,
  moderate: 3,
  major: 4,
  critical: 5,
};

// ── 事件模板 ──

/**
 * 随机事件模板 (F17.3)
 *
 * 模板用于预定义可重复使用的随机事件类型，
 * 支持多维度参数（概率/权重/类别/严重度/冷却/场景适配）。
 */
export interface RandomEventTemplate {
  /** 模板唯一 ID */
  id: string;
  /** 模板名称（显示用） */
  name: string;
  /** 模板描述（生成时的提示上下文） */
  description: string;
  /** 类别 */
  category: RandomEventCategory;
  /** 严重度 */
  severity: RandomEventSeverity;
  /** 触发概率（0-100，覆盖默认） */
  probability: number;
  /** 权重（同时多个候选时按权重选择，默认 1） */
  weight: number;
  /** 冷却时间（毫秒，0=无冷却） */
  cooldownMs: number;
  /** 适用场景名列表（空=所有场景适用） */
  applicableScenes: string[];
  /** 排除场景名列表（优先于 applicableScenes） */
  excludedScenes: string[];
  /** 触发关键词（任一匹配才允许触发，空=无关键词约束） */
  triggerKeywords: string[];
  /** 是否启用 */
  enabled: boolean;
  /** 最大触发次数（0=无限） */
  maxTriggers: number;
  /** 已触发次数 */
  triggerCount: number;
  /** 最后触发时间 ISO（null=从未触发） */
  lastTriggeredAt: string | null;
  /** 创建时间 ISO */
  createdAt: string;
  /** 更新时间 ISO */
  updatedAt: string;
}

// ── 场景级配置 ──

/**
 * 场景级随机事件配置 (F17.3)
 *
 * 每个场景可独立配置随机事件开关与参数覆盖。
 */
export interface RandomEventSceneConfig {
  /** 场景名（唯一键） */
  sceneName: string;
  /** 是否启用随机事件 */
  enabled: boolean;
  /** 该场景的覆盖概率（null=使用全局默认） */
  probabilityOverride: number | null;
  /** 允许的类别（空=全部允许） */
  allowedCategories: RandomEventCategory[];
  /** 排除的类别（优先于 allowedCategories） */
  excludedCategories: RandomEventCategory[];
  /** 该场景最大严重度（超过此严重度的模板不触发） */
  maxSeverity: RandomEventSeverity;
}

// ── 反馈机制 ──

/**
 * 事件反馈类型
 * - positive：用户喜欢此事件
 * - neutral：中立
 * - negative：用户不喜欢
 */
export type RandomEventFeedback = 'positive' | 'neutral' | 'negative';

/**
 * 事件生成结果记录 (F17.3)
 *
 * 每次生成后记录结果与反馈，用于统计与参数自适应。
 */
export interface RandomEventResult {
  /** 结果 ID */
  id: string;
  /** 关联的模板 ID（null=AI 即时生成，无模板） */
  templateId: string | null;
  /** 模板名（用于显示） */
  templateName: string;
  /** 场景名 */
  sceneName: string;
  /** 生成的事件名 */
  eventName: string;
  /** 生成的事件描述 */
  eventDescription: string;
  /** 类别 */
  category: RandomEventCategory;
  /** 严重度 */
  severity: RandomEventSeverity;
  /** 实际使用的概率（0-100） */
  effectiveProbability: number;
  /** 生成时间 ISO */
  generatedAt: string;
  /** 用户反馈（默认 neutral） */
  feedback: RandomEventFeedback;
  /** 备注（可选） */
  note?: string;
}

// ── 生成器全局配置 ──

/**
 * 随机事件生成器全局配置 (F17.3)
 */
export interface RandomEventGeneratorConfig {
  /** 全局默认概率（0-100） */
  defaultProbability: number;
  /** 每轮最大生成数（避免一次生成太多事件） */
  maxPerTurn: number;
  /** 全局冷却时间（毫秒，两次生成之间的最小间隔） */
  globalCooldownMs: number;
  /** 上次生成时间 ISO（null=从未生成） */
  lastGeneratedAt: string | null;
  /** 是否启用全局随机事件 */
  enabled: boolean;
  /** 反馈对概率的调整幅度（百分比，默认 5） */
  feedbackAdjustStep: number;
  /**
   * 需求8：关联的世界书 ID（null 表示未关联）
   * 关联后，随机事件生成将基于该世界书的内容（场景、世界观、条目）
   * 进行逻辑联动，生成与世界观一致的事件。
   */
  boundWorldBookId?: string | null;
}

// ── 统计 ──

/**
 * 随机事件统计 (F17.3)
 */
export interface RandomEventStats {
  /** 总生成次数 */
  totalGenerated: number;
  /** 按类别统计 */
  byCategory: Record<RandomEventCategory, number>;
  /** 按严重度统计 */
  bySeverity: Record<RandomEventSeverity, number>;
  /** 按反馈统计 */
  byFeedback: Record<RandomEventFeedback, number>;
  /** 平均有效概率 */
  averageProbability: number;
}

// ── 常量 ──

/** 默认权重 */
export const DEFAULT_TEMPLATE_WEIGHT = 1;

/** 默认冷却时间（10 分钟） */
export const DEFAULT_TEMPLATE_COOLDOWN_MS = 10 * 60 * 1000;

/** 默认反馈调整幅度（5%） */
export const DEFAULT_FEEDBACK_ADJUST_STEP = 5;

/** 反馈调整上下限 */
export const FEEDBACK_ADJUST_MIN = 1;
export const FEEDBACK_ADJUST_MAX = 100;

// ── 模板工厂与校验 ──

/**
 * 创建默认模板
 */
export function createRandomEventTemplate(
  input: Partial<Omit<RandomEventTemplate, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount' | 'lastTriggeredAt'>> & {
    name: string;
    description: string;
  }
): RandomEventTemplate {
  const now = new Date().toISOString();
  return {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name,
    description: input.description,
    category: input.category ?? 'custom',
    severity: input.severity ?? 'minor',
    probability: input.probability ?? DEFAULT_RANDOM_EVENT_PROBABILITY,
    weight: input.weight ?? DEFAULT_TEMPLATE_WEIGHT,
    cooldownMs: input.cooldownMs ?? DEFAULT_TEMPLATE_COOLDOWN_MS,
    applicableScenes: input.applicableScenes ?? [],
    excludedScenes: input.excludedScenes ?? [],
    triggerKeywords: input.triggerKeywords ?? [],
    enabled: input.enabled ?? true,
    maxTriggers: input.maxTriggers ?? 0,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 更新模板（返回新对象，不可变更新）
 */
export function updateRandomEventTemplate(
  template: RandomEventTemplate,
  patch: Partial<Omit<RandomEventTemplate, 'id' | 'createdAt'>>
): RandomEventTemplate {
  return {
    ...template,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 校验模板配置
 * @returns 错误消息数组，空数组表示通过
 */
export function validateRandomEventTemplate(template: Partial<RandomEventTemplate>): string[] {
  const errors: string[] = [];

  if (!template.name || template.name.trim() === '') {
    errors.push('模板名称不能为空');
  } else if (template.name.length > 50) {
    errors.push('模板名称不能超过 50 字符');
  }

  if (!template.description || template.description.trim() === '') {
    errors.push('模板描述不能为空');
  } else if (template.description.length > 2000) {
    errors.push('模板描述不能超过 2000 字符');
  }

  if (template.probability !== undefined) {
    if (typeof template.probability !== 'number' || template.probability < 0 || template.probability > 100) {
      errors.push('触发概率必须在 0-100 之间');
    }
  }

  if (template.weight !== undefined) {
    if (typeof template.weight !== 'number' || template.weight < 0) {
      errors.push('权重必须为非负数');
    }
  }

  if (template.cooldownMs !== undefined) {
    if (typeof template.cooldownMs !== 'number' || template.cooldownMs < 0) {
      errors.push('冷却时间必须为非负数');
    }
  }

  if (template.maxTriggers !== undefined && typeof template.maxTriggers !== 'number') {
    errors.push('最大触发次数必须为数字');
  }

  // 触发关键词校验
  if (template.triggerKeywords) {
    for (const kw of template.triggerKeywords) {
      if (typeof kw !== 'string' || kw.trim() === '') {
        errors.push('触发关键词不能为空字符串');
        break;
      }
    }
  }

  return errors;
}

// ── 场景配置工厂 ──

/**
 * 创建默认场景配置
 */
export function createDefaultSceneConfig(sceneName: string): RandomEventSceneConfig {
  return {
    sceneName,
    enabled: true,
    probabilityOverride: null,
    allowedCategories: [],
    excludedCategories: [],
    maxSeverity: 'critical',
  };
}

/**
 * 校验场景配置
 */
export function validateSceneConfig(config: Partial<RandomEventSceneConfig>): string[] {
  const errors: string[] = [];

  if (config.probabilityOverride !== null && config.probabilityOverride !== undefined) {
    if (
      typeof config.probabilityOverride !== 'number' ||
      config.probabilityOverride < 0 ||
      config.probabilityOverride > 100
    ) {
      errors.push('场景覆盖概率必须在 0-100 之间');
    }
  }

  if (config.allowedCategories && config.excludedCategories) {
    const overlap = config.allowedCategories.filter((c) => config.excludedCategories!.includes(c));
    if (overlap.length > 0) {
      errors.push(`类别不能同时出现在允许与排除列表：${overlap.join(', ')}`);
    }
  }

  return errors;
}

// ── 生成器配置工厂 ──

/**
 * 创建默认生成器配置
 */
export function createDefaultGeneratorConfig(): RandomEventGeneratorConfig {
  return {
    defaultProbability: DEFAULT_RANDOM_EVENT_PROBABILITY,
    maxPerTurn: 1,
    globalCooldownMs: 5 * 60 * 1000, // 5 分钟
    lastGeneratedAt: null,
    enabled: false,
    feedbackAdjustStep: DEFAULT_FEEDBACK_ADJUST_STEP,
  };
}

// ── 多维度参数计算 ──

/**
 * 判断模板是否适用于指定场景
 */
export function isTemplateApplicableToScene(
  template: RandomEventTemplate,
  sceneName: string
): boolean {
  // 排除场景优先
  if (template.excludedScenes.includes(sceneName)) return false;
  // applicableScenes 为空 = 适用于所有场景
  if (template.applicableScenes.length === 0) return true;
  return template.applicableScenes.includes(sceneName);
}

/**
 * 计算模板的有效概率
 *
 * 优先级：模板概率 > 场景覆盖概率 > 全局默认概率
 * - 若场景配置了 probabilityOverride，则使用场景覆盖（覆盖模板概率）
 * - 否则使用模板自身的 probability
 *
 * @param template 事件模板
 * @param sceneConfig 场景配置（可选）
 * @param generatorConfig 生成器配置（可选）
 */
export function calculateEffectiveProbability(
  template: RandomEventTemplate,
  sceneConfig?: RandomEventSceneConfig | null,
  generatorConfig?: RandomEventGeneratorConfig | null
): number {
  // 场景覆盖优先
  if (sceneConfig?.probabilityOverride !== null && sceneConfig?.probabilityOverride !== undefined) {
    return clampProbability(sceneConfig.probabilityOverride);
  }
  // 模板概率
  if (template.probability !== undefined) {
    return clampProbability(template.probability);
  }
  // 全局默认
  return clampProbability(generatorConfig?.defaultProbability ?? DEFAULT_RANDOM_EVENT_PROBABILITY);
}

/**
 * 限制概率在 0-100
 */
function clampProbability(p: number): number {
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

// ── 冷却检查 ──

/**
 * 判断模板是否处于冷却中
 * @param template 模板
 * @param now 当前时间戳（毫秒）
 */
export function isTemplateOnCooldown(template: RandomEventTemplate, now: number): boolean {
  if (template.cooldownMs <= 0) return false;
  if (!template.lastTriggeredAt) return false;
  const lastTime = new Date(template.lastTriggeredAt).getTime();
  if (Number.isNaN(lastTime)) return false;
  return now - lastTime < template.cooldownMs;
}

/**
 * 判断生成器是否处于全局冷却
 */
export function isGeneratorOnCooldown(
  config: RandomEventGeneratorConfig,
  now: number
): boolean {
  if (config.globalCooldownMs <= 0) return false;
  if (!config.lastGeneratedAt) return false;
  const lastTime = new Date(config.lastGeneratedAt).getTime();
  if (Number.isNaN(lastTime)) return false;
  return now - lastTime < config.globalCooldownMs;
}

// ── 候选筛选与权重选择 ──

/**
 * 筛选当前可触发的候选模板
 *
 * 筛选条件：
 * 1. 模板启用
 * 2. 适用于当前场景
 * 3. 类别通过场景过滤（不在 excludedCategories，若 allowedCategories 非空需在其中）
 * 4. 严重度不超过场景 maxSeverity
 * 5. 触发关键词匹配（若模板配置了 triggerKeywords）
 * 6. 不在冷却中
 * 7. 未达最大触发次数
 *
 * @param templates 所有模板
 * @param sceneName 当前场景名
 * @param sceneConfig 场景配置（可选）
 * @param recentMessages 最近对话（用于关键词匹配）
 * @param now 当前时间戳（毫秒）
 */
export function selectCandidateTemplates(
  templates: RandomEventTemplate[],
  sceneName: string,
  sceneConfig: RandomEventSceneConfig | null,
  recentMessages: string[],
  now: number
): RandomEventTemplate[] {
  return templates.filter((tpl) => {
    // 1. 启用
    if (!tpl.enabled) return false;

    // 2. 场景适配
    if (!isTemplateApplicableToScene(tpl, sceneName)) return false;

    // 3. 类别过滤
    if (sceneConfig) {
      if (sceneConfig.excludedCategories.includes(tpl.category)) return false;
      if (
        sceneConfig.allowedCategories.length > 0 &&
        !sceneConfig.allowedCategories.includes(tpl.category)
      ) {
        return false;
      }
    }

    // 4. 严重度限制
    if (sceneConfig) {
      const sceneMaxRank = SEVERITY_RANK[sceneConfig.maxSeverity];
      const tplRank = SEVERITY_RANK[tpl.severity];
      if (tplRank > sceneMaxRank) return false;
    }

    // 5. 触发关键词匹配
    if (tpl.triggerKeywords.length > 0) {
      const matched = tpl.triggerKeywords.some((kw) =>
        recentMessages.some((msg) => msg.toLowerCase().includes(kw.toLowerCase()))
      );
      if (!matched) return false;
    }

    // 6. 冷却检查
    if (isTemplateOnCooldown(tpl, now)) return false;

    // 7. 最大触发次数
    if (tpl.maxTriggers > 0 && tpl.triggerCount >= tpl.maxTriggers) return false;

    return true;
  });
}

/**
 * 按权重随机选择一个候选模板
 *
 * 算法：加权随机
 * - 权重越大被选中概率越高
 * - 若所有权重相同，则等概率
 *
 * @param candidates 候选模板列表
 * @returns 选中的模板（空列表返回 null）
 */
export function selectTemplateByWeight(
  candidates: RandomEventTemplate[]
): RandomEventTemplate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const totalWeight = candidates.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return candidates[0];

  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= Math.max(0, c.weight);
    if (roll <= 0) return c;
  }

  return candidates[candidates.length - 1];
}

// ── 模板感知的 Prompt 构建 ──

/**
 * 构建模板感知的随机事件生成消息
 *
 * 当提供模板时，AI 将基于模板的类别/严重度/描述生成事件，
 * 保证事件符合模板约束。
 *
 * @param params 基础参数
 * @param template 事件模板（可选，null=纯 AI 即时生成）
 */
export function buildTemplateAwareMessages(
  params: RandomEventParams,
  template: RandomEventTemplate | null
): Array<{ role: 'system' | 'user'; content: string }> {
  if (!template) {
    return buildRandomEventMessages(params);
  }

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

  const recentText = params.recentMessages.slice(-6).join('\n');
  const activeBlock =
    params.activeEventNames && params.activeEventNames.length > 0
      ? `【已激活事件】${params.activeEventNames.join('、')}\n（避免与上述事件冲突）`
      : '';

  const categoryNames: Record<RandomEventCategory, string> = {
    encounter: '偶遇 NPC',
    discovery: '发现物品/地点',
    combat: '战斗冲突',
    social: '社交互动',
    environment: '环境变化',
    mystery: '神秘事件',
    custom: '自定义',
  };

  const severityNames: Record<RandomEventSeverity, string> = {
    trivial: '琐碎（轻微氛围）',
    minor: '轻微（小影响）',
    moderate: '中等（明显影响）',
    major: '重大（强烈影响）',
    critical: '关键（剧情转折级）',
  };

  const systemContent = `你是一个 RPG 事件生成器，根据给定的事件模板约束生成临时小事件。请严格按照用户要求生成，并以 JSON 格式返回，不要输出任何其他文字。`;

  const userContent = `请基于以下事件模板生成一个临时事件。

【随机种子】${seed}
${sceneBlock}

【事件模板约束】
- 模板名：${template.name}
- 模板描述：${template.description}
- 类别：${categoryNames[template.category]}
- 严重度：${severityNames[template.severity]}

【最近对话】
${recentText}

${activeBlock}

要求：
1. 严格遵循模板的类别与严重度约束
2. 事件不能改变主线剧情，仅作为氛围与互动切入点
3. 描述简洁生动（80-200 字），包含足够细节让 AI 继续演绎
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

// ── 结果记录与反馈 ──

/**
 * 创建事件生成结果
 */
export function createRandomEventResult(input: {
  template: RandomEventTemplate | null;
  sceneName: string;
  generated: GeneratedRandomEvent;
  effectiveProbability: number;
  note?: string;
}): RandomEventResult {
  const now = new Date().toISOString();
  return {
    id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    templateId: input.template?.id ?? null,
    templateName: input.template?.name ?? '(AI 即时生成)',
    sceneName: input.sceneName,
    eventName: input.generated.name,
    eventDescription: input.generated.description,
    category: input.template?.category ?? 'custom',
    severity: input.template?.severity ?? 'minor',
    effectiveProbability: input.effectiveProbability,
    generatedAt: now,
    feedback: 'neutral',
    note: input.note,
  };
}

/**
 * 应用用户反馈到结果（返回新对象）
 */
export function applyFeedbackToResult(
  result: RandomEventResult,
  feedback: RandomEventFeedback,
  note?: string
): RandomEventResult {
  return {
    ...result,
    feedback,
    note: note ?? result.note,
  };
}

/**
 * 基于反馈调整模板概率
 *
 * - positive：概率 +feedbackAdjustStep（上限 100）
 * - negative：概率 -feedbackAdjustStep（下限 1）
 * - neutral：不变
 *
 * @param template 当前模板
 * @param feedback 用户反馈
 * @param feedbackAdjustStep 调整步长（默认 5）
 * @returns 调整后的概率
 */
export function adjustProbabilityByFeedback(
  template: RandomEventTemplate,
  feedback: RandomEventFeedback,
  feedbackAdjustStep: number = DEFAULT_FEEDBACK_ADJUST_STEP
): number {
  if (feedback === 'neutral') return template.probability;

  let newProb = template.probability;
  if (feedback === 'positive') {
    newProb = template.probability + feedbackAdjustStep;
  } else if (feedback === 'negative') {
    newProb = template.probability - feedbackAdjustStep;
  }

  if (newProb < FEEDBACK_ADJUST_MIN) return FEEDBACK_ADJUST_MIN;
  if (newProb > FEEDBACK_ADJUST_MAX) return FEEDBACK_ADJUST_MAX;
  return newProb;
}

// ── 统计 ──

/**
 * 计算事件生成统计
 *
 * @param results 历史结果列表
 */
export function computeRandomEventStats(results: RandomEventResult[]): RandomEventStats {
  const stats: RandomEventStats = {
    totalGenerated: results.length,
    byCategory: {
      encounter: 0,
      discovery: 0,
      combat: 0,
      social: 0,
      environment: 0,
      mystery: 0,
      custom: 0,
    },
    bySeverity: {
      trivial: 0,
      minor: 0,
      moderate: 0,
      major: 0,
      critical: 0,
    },
    byFeedback: {
      positive: 0,
      neutral: 0,
      negative: 0,
    },
    averageProbability: 0,
  };

  if (results.length === 0) return stats;

  let probSum = 0;
  for (const r of results) {
    stats.byCategory[r.category] += 1;
    stats.bySeverity[r.severity] += 1;
    stats.byFeedback[r.feedback] += 1;
    probSum += r.effectiveProbability;
  }
  stats.averageProbability = Math.round((probSum / results.length) * 10) / 10;

  return stats;
}

// ── 高层编排：单轮生成决策 ──

/**
 * 单轮生成决策结果
 */
export interface RandomEventDecision {
  /** 是否触发 */
  shouldTrigger: boolean;
  /** 选中的模板（null=纯 AI 即时生成 或 无模板可用） */
  template: RandomEventTemplate | null;
  /** 实际使用的概率 */
  effectiveProbability: number;
  /** 跳过原因（未触发时填充） */
  reason?: string;
}

/**
 * 决策单轮是否触发随机事件，并选择模板
 *
 * 算法：
 * 1. 全局开关与冷却检查
 * 2. 场景开关检查
 * 3. 候选模板筛选
 * 4. 按权重选择模板
 * 5. 计算有效概率
 * 6. 概率判定
 *
 * @param generatorConfig 生成器配置
 * @param sceneConfig 场景配置（null=无场景配置）
 * @param templates 全部模板
 * @param sceneName 当前场景名
 * @param recentMessages 最近对话
 * @param now 当前时间戳（毫秒）
 */
export function decideRandomEvent(
  generatorConfig: RandomEventGeneratorConfig,
  sceneConfig: RandomEventSceneConfig | null,
  templates: RandomEventTemplate[],
  sceneName: string,
  recentMessages: string[],
  now: number
): RandomEventDecision {
  // 1. 全局开关
  if (!generatorConfig.enabled) {
    return { shouldTrigger: false, template: null, effectiveProbability: 0, reason: '生成器未启用' };
  }

  // 2. 全局冷却
  if (isGeneratorOnCooldown(generatorConfig, now)) {
    return { shouldTrigger: false, template: null, effectiveProbability: 0, reason: '全局冷却中' };
  }

  // 3. 场景开关
  if (sceneConfig && !sceneConfig.enabled) {
    return { shouldTrigger: false, template: null, effectiveProbability: 0, reason: '场景未启用随机事件' };
  }

  // 4. 候选筛选
  const candidates = selectCandidateTemplates(
    templates,
    sceneName,
    sceneConfig,
    recentMessages,
    now
  );

  // 5. 无候选：使用全局默认概率决定是否纯 AI 即时生成
  if (candidates.length === 0) {
    const defaultProb = sceneConfig?.probabilityOverride ?? generatorConfig.defaultProbability;
    if (!shouldTriggerRandomEvent(defaultProb)) {
      return { shouldTrigger: false, template: null, effectiveProbability: defaultProb, reason: '概率判定未通过（无候选）' };
    }
    return { shouldTrigger: true, template: null, effectiveProbability: defaultProb };
  }

  // 6. 按权重选择模板
  const selected = selectTemplateByWeight(candidates);
  if (!selected) {
    return { shouldTrigger: false, template: null, effectiveProbability: 0, reason: '权重选择失败' };
  }

  // 7. 计算有效概率
  const effectiveProb = calculateEffectiveProbability(selected, sceneConfig, generatorConfig);

  // 8. 概率判定
  if (!shouldTriggerRandomEvent(effectiveProb)) {
    return { shouldTrigger: false, template: selected, effectiveProbability: effectiveProb, reason: '概率判定未通过' };
  }

  return { shouldTrigger: true, template: selected, effectiveProbability: effectiveProb };
}
// i18n-ignore-end
