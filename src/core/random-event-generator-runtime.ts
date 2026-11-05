/**
 * 随机事件生成 —— 判定与计算运行时层 (F17.3 扩展)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。模板适用性、有效概率、冷却、加权选择、
 * 模板化 Prompt、结果构造、反馈调整、统计、最终决策。
 *
 * 依赖方向：core 层（Prompt 与概率判定）+ types 层（类型与默认值）。
 * **不引用 factories 层**——工厂只被外部装配时调用，运行时不回头依赖构造逻辑。
 *
 * i18n：模板化 Prompt 是模型面提示词而非 UI 文案，整块在 i18n-ignore 内。
 */

import type { GeneratedRandomEvent, RandomEventParams } from './random-event-generator-core';
import {
  DEFAULT_RANDOM_EVENT_PROBABILITY,
  buildRandomEventMessages,
  shouldTriggerRandomEvent,
} from './random-event-generator-core';
import type {
  RandomEventCategory,
  RandomEventFeedback,
  RandomEventGeneratorConfig,
  RandomEventResult,
  RandomEventSceneConfig,
  RandomEventSeverity,
  RandomEventStats,
  RandomEventTemplate,
} from './random-event-generator-types';
import {
  DEFAULT_FEEDBACK_ADJUST_STEP,
  FEEDBACK_ADJUST_MAX,
  FEEDBACK_ADJUST_MIN,
  SEVERITY_RANK,
} from './random-event-generator-types';

// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）


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
  if (candidates.length === 1) return candidates[0]!;

  const totalWeight = candidates.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return candidates[0]!;

  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= Math.max(0, c.weight);
    if (roll <= 0) return c;
  }

  return candidates[candidates.length - 1]!;
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