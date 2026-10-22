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
 *
 * 本文件自 R4-8 起是**纯公共面 barrel**，不含任何实现，四层实现在：
 * - core：类型 / 常量 / 概率判定 / Prompt / 解析 / 转 StoryEvent
 * - types：扩展层的共享类型与默认值常量（零函数）
 * - factories：模板 / 场景配置 / 生成器配置的构造与校验
 * - runtime：适用性 / 有效概率 / 冷却 / 加权选择 / 结果 / 反馈 / 统计 / 决策
 *
 * 之所以保留 barrel 而不让调用方直连子模块：本模块有 9 个外部引用点
 * （3 个 Vue 面板 / 2 个 store / random-events-shared / 3 个测试文件），
 * barrel 让这次拆分对调用方零改动，也把「公共面」变成一份可审计的显式清单。
 * 注意这里**不做 export ***——子层私有化的符号（如 clampProbability）不会被外泄。
 */

// ── 基础层 ──
export {
  DEFAULT_RANDOM_EVENT_PROBABILITY,
  MAX_ACTIVE_RANDOM_EVENTS,
  shouldTriggerRandomEvent,
  buildRandomEventMessages,
  parseGeneratedRandomEvent,
  generatedRandomEventToStoryEvent,
} from './random-event-generator-core';
export type { RandomEventParams, GeneratedRandomEvent } from './random-event-generator-core';

// ── 共享类型与常量层 ──
export {
  SEVERITY_RANK,
  DEFAULT_TEMPLATE_WEIGHT,
  DEFAULT_TEMPLATE_COOLDOWN_MS,
  DEFAULT_FEEDBACK_ADJUST_STEP,
  FEEDBACK_ADJUST_MIN,
  FEEDBACK_ADJUST_MAX,
} from './random-event-generator-types';
export type {
  RandomEventCategory,
  RandomEventSeverity,
  RandomEventTemplate,
  RandomEventSceneConfig,
  RandomEventFeedback,
  RandomEventResult,
  RandomEventGeneratorConfig,
  RandomEventStats,
} from './random-event-generator-types';

// ── 工厂层 ──
export {
  createRandomEventTemplate,
  updateRandomEventTemplate,
  validateRandomEventTemplate,
  createDefaultSceneConfig,
  validateSceneConfig,
  createDefaultGeneratorConfig,
} from './random-event-generator-factories';

// ── 运行时层 ──
export {
  isTemplateApplicableToScene,
  calculateEffectiveProbability,
  isTemplateOnCooldown,
  isGeneratorOnCooldown,
  selectCandidateTemplates,
  selectTemplateByWeight,
  buildTemplateAwareMessages,
  createRandomEventResult,
  applyFeedbackToResult,
  adjustProbabilityByFeedback,
  computeRandomEventStats,
  decideRandomEvent,
} from './random-event-generator-runtime';
// RandomEventDecision 声明在原文件 976 行，落在 runtime 片段内，故从 runtime 侧导出
export type { RandomEventDecision } from './random-event-generator-runtime';
