/**
 * 随机事件生成 —— 模板 / 场景配置 / 生成器配置工厂层 (F17.3 扩展)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。纯构造与纯校验，无随机、无副作用。
 *
 * 依赖方向：types 层（类型与默认值）+ core 层（默认概率）。
 * **不引用 runtime 层**——这是四层方案能成立的关键，已用交叉引用实测验证。
 *
 * i18n：校验错误信息是开发者面文案，但沿用整块 i18n-ignore（与原文件一致）。
 */

import { DEFAULT_RANDOM_EVENT_PROBABILITY } from './random-event-generator-core';
import type {
  RandomEventGeneratorConfig,
  RandomEventSceneConfig,
  RandomEventTemplate,
} from './random-event-generator-types';
import {
  DEFAULT_FEEDBACK_ADJUST_STEP,
  DEFAULT_TEMPLATE_COOLDOWN_MS,
  DEFAULT_TEMPLATE_WEIGHT,
} from './random-event-generator-types';

// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）


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

// i18n-ignore-end