/**
 * random-event-generator F17.3 扩展测试
 *
 * 覆盖：
 * - 模板类型与常量
 * - createRandomEventTemplate / updateRandomEventTemplate / validateRandomEventTemplate
 * - createDefaultSceneConfig / validateSceneConfig
 * - createDefaultGeneratorConfig
 * - isTemplateApplicableToScene
 * - calculateEffectiveProbability
 * - isTemplateOnCooldown / isGeneratorOnCooldown
 * - selectCandidateTemplates
 * - selectTemplateByWeight
 * - buildTemplateAwareMessages
 * - createRandomEventResult / applyFeedbackToResult
 * - adjustProbabilityByFeedback
 * - computeRandomEventStats
 * - decideRandomEvent
 */
import { describe, test, expect } from 'vitest';
import {
  // 常量
  DEFAULT_TEMPLATE_WEIGHT,
  DEFAULT_TEMPLATE_COOLDOWN_MS,
  DEFAULT_FEEDBACK_ADJUST_STEP,
  FEEDBACK_ADJUST_MIN,
  FEEDBACK_ADJUST_MAX,
  SEVERITY_RANK,
  // 模板
  createRandomEventTemplate,
  updateRandomEventTemplate,
  validateRandomEventTemplate,
  // 场景配置
  createDefaultSceneConfig,
  validateSceneConfig,
  // 生成器配置
  createDefaultGeneratorConfig,
  // 多维度参数
  isTemplateApplicableToScene,
  calculateEffectiveProbability,
  // 冷却
  isTemplateOnCooldown,
  isGeneratorOnCooldown,
  // 候选筛选
  selectCandidateTemplates,
  selectTemplateByWeight,
  // 模板感知 Prompt
  buildTemplateAwareMessages,
  // 结果与反馈
  createRandomEventResult,
  applyFeedbackToResult,
  adjustProbabilityByFeedback,
  // 统计
  computeRandomEventStats,
  // 决策
  decideRandomEvent,
  // 类型
  type RandomEventTemplate,
  type RandomEventSceneConfig,
  type RandomEventGeneratorConfig,
  type RandomEventCategory,
  type RandomEventSeverity,
  type RandomEventFeedback,
} from '@core/random-event-generator';

// ── 测试夹具 ──

function makeTemplate(overrides: Partial<RandomEventTemplate> = {}): RandomEventTemplate {
  return {
    id: `tpl-test-${Math.random().toString(36).slice(2, 8)}`,
    name: '神秘访客',
    description: '一位披着斗篷的访客出现在酒馆门口',
    category: 'encounter',
    severity: 'minor',
    probability: 50,
    weight: 1,
    cooldownMs: 600000,
    applicableScenes: [],
    excludedScenes: [],
    triggerKeywords: [],
    enabled: true,
    maxTriggers: 0,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function makeSceneConfig(overrides: Partial<RandomEventSceneConfig> = {}): RandomEventSceneConfig {
  return {
    sceneName: '王都市场',
    enabled: true,
    probabilityOverride: null,
    allowedCategories: [],
    excludedCategories: [],
    maxSeverity: 'critical',
    ...overrides,
  };
}

function makeGeneratorConfig(
  overrides: Partial<RandomEventGeneratorConfig> = {}
): RandomEventGeneratorConfig {
  return {
    defaultProbability: 10,
    maxPerTurn: 1,
    globalCooldownMs: 300000,
    lastGeneratedAt: null,
    enabled: true,
    feedbackAdjustStep: 5,
    ...overrides,
  };
}

// ── 常量测试 ──

describe('F17.3 常量', () => {
  test('DEFAULT_TEMPLATE_WEIGHT 为 1', () => {
    expect(DEFAULT_TEMPLATE_WEIGHT).toBe(1);
  });

  test('DEFAULT_TEMPLATE_COOLDOWN_MS 为 10 分钟', () => {
    expect(DEFAULT_TEMPLATE_COOLDOWN_MS).toBe(10 * 60 * 1000);
  });

  test('DEFAULT_FEEDBACK_ADJUST_STEP 为 5', () => {
    expect(DEFAULT_FEEDBACK_ADJUST_STEP).toBe(5);
  });

  test('FEEDBACK_ADJUST_MIN 为 1', () => {
    expect(FEEDBACK_ADJUST_MIN).toBe(1);
  });

  test('FEEDBACK_ADJUST_MAX 为 100', () => {
    expect(FEEDBACK_ADJUST_MAX).toBe(100);
  });

  test('SEVERITY_RANK 顺序正确', () => {
    expect(SEVERITY_RANK.trivial).toBe(1);
    expect(SEVERITY_RANK.minor).toBe(2);
    expect(SEVERITY_RANK.moderate).toBe(3);
    expect(SEVERITY_RANK.major).toBe(4);
    expect(SEVERITY_RANK.critical).toBe(5);
  });
});

// ── 模板工厂测试 ──

describe('createRandomEventTemplate', () => {
  test('创建模板包含默认值', () => {
    const tpl = createRandomEventTemplate({
      name: '测试事件',
      description: '测试描述',
    });
    expect(tpl.id).toMatch(/^tpl-/);
    expect(tpl.name).toBe('测试事件');
    expect(tpl.description).toBe('测试描述');
    expect(tpl.category).toBe('custom');
    expect(tpl.severity).toBe('minor');
    expect(tpl.probability).toBe(10);
    expect(tpl.weight).toBe(DEFAULT_TEMPLATE_WEIGHT);
    expect(tpl.cooldownMs).toBe(DEFAULT_TEMPLATE_COOLDOWN_MS);
    expect(tpl.applicableScenes).toEqual([]);
    expect(tpl.excludedScenes).toEqual([]);
    expect(tpl.triggerKeywords).toEqual([]);
    expect(tpl.enabled).toBe(true);
    expect(tpl.maxTriggers).toBe(0);
    expect(tpl.triggerCount).toBe(0);
    expect(tpl.lastTriggeredAt).toBeNull();
    expect(tpl.createdAt).toBeTruthy();
    expect(tpl.updatedAt).toBeTruthy();
  });

  test('覆盖参数生效', () => {
    const tpl = createRandomEventTemplate({
      name: '战斗',
      description: '强盗袭击',
      category: 'combat',
      severity: 'major',
      probability: 80,
      weight: 3,
      cooldownMs: 1800000,
      applicableScenes: ['野外', '森林'],
      excludedScenes: ['城镇'],
      triggerKeywords: ['强盗', '夜晚'],
      enabled: false,
      maxTriggers: 5,
    });
    expect(tpl.category).toBe('combat');
    expect(tpl.severity).toBe('major');
    expect(tpl.probability).toBe(80);
    expect(tpl.weight).toBe(3);
    expect(tpl.cooldownMs).toBe(1800000);
    expect(tpl.applicableScenes).toEqual(['野外', '森林']);
    expect(tpl.excludedScenes).toEqual(['城镇']);
    expect(tpl.triggerKeywords).toEqual(['强盗', '夜晚']);
    expect(tpl.enabled).toBe(false);
    expect(tpl.maxTriggers).toBe(5);
  });

  test('生成多个模板 ID 不重复', () => {
    const t1 = createRandomEventTemplate({ name: 'A', description: 'a' });
    const t2 = createRandomEventTemplate({ name: 'B', description: 'b' });
    expect(t1.id).not.toBe(t2.id);
  });
});

// ── 模板更新测试 ──

describe('updateRandomEventTemplate', () => {
  test('返回新对象（不可变更新）', () => {
    const tpl = makeTemplate();
    const updated = updateRandomEventTemplate(tpl, { name: '新名称' });
    expect(updated).not.toBe(tpl);
    expect(updated.name).toBe('新名称');
    expect(tpl.name).toBe('神秘访客'); // 原对象不变
  });

  test('updatedAt 自动更新', () => {
    const tpl = makeTemplate({ updatedAt: '2026-07-24T00:00:00.000Z' });
    const updated = updateRandomEventTemplate(tpl, { probability: 60 });
    expect(updated.updatedAt).not.toBe('2026-07-24T00:00:00.000Z');
    expect(updated.probability).toBe(60);
  });

  test('id 与 createdAt 不可修改', () => {
    const tpl = makeTemplate({ id: 'tpl-1', createdAt: '2026-01-01T00:00:00.000Z' });
    // 即使传入也会被忽略（Omit 类型保证）
    const updated = updateRandomEventTemplate(tpl, { name: 'X' } as Partial<RandomEventTemplate>);
    expect(updated.id).toBe('tpl-1');
    expect(updated.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ── 模板校验测试 ──

describe('validateRandomEventTemplate', () => {
  test('有效模板返回空数组', () => {
    const errors = validateRandomEventTemplate(makeTemplate());
    expect(errors).toEqual([]);
  });

  test('名称为空', () => {
    const errors = validateRandomEventTemplate(makeTemplate({ name: '' }));
    expect(errors).toContain('模板名称不能为空');
  });

  test('名称超长', () => {
    const errors = validateRandomEventTemplate(makeTemplate({ name: 'a'.repeat(51) }));
    expect(errors).toContain('模板名称不能超过 50 字符');
  });

  test('描述为空', () => {
    const errors = validateRandomEventTemplate(makeTemplate({ description: '' }));
    expect(errors).toContain('模板描述不能为空');
  });

  test('描述超长', () => {
    const errors = validateRandomEventTemplate(makeTemplate({ description: 'a'.repeat(2001) }));
    expect(errors).toContain('模板描述不能超过 2000 字符');
  });

  test('概率超出范围', () => {
    expect(validateRandomEventTemplate(makeTemplate({ probability: -1 }))).toContain(
      '触发概率必须在 0-100 之间'
    );
    expect(validateRandomEventTemplate(makeTemplate({ probability: 101 }))).toContain(
      '触发概率必须在 0-100 之间'
    );
  });

  test('权重为负', () => {
    const errors = validateRandomEventTemplate(makeTemplate({ weight: -1 }));
    expect(errors).toContain('权重必须为非负数');
  });

  test('冷却时间为负', () => {
    const errors = validateRandomEventTemplate(makeTemplate({ cooldownMs: -1 }));
    expect(errors).toContain('冷却时间必须为非负数');
  });

  test('触发关键词包含空字符串', () => {
    const errors = validateRandomEventTemplate(
      makeTemplate({ triggerKeywords: ['魔法', '', '剑'] })
    );
    expect(errors).toContain('触发关键词不能为空字符串');
  });
});

// ── 场景配置工厂与校验 ──

describe('createDefaultSceneConfig', () => {
  test('创建默认场景配置', () => {
    const cfg = createDefaultSceneConfig('森林');
    expect(cfg.sceneName).toBe('森林');
    expect(cfg.enabled).toBe(true);
    expect(cfg.probabilityOverride).toBeNull();
    expect(cfg.allowedCategories).toEqual([]);
    expect(cfg.excludedCategories).toEqual([]);
    expect(cfg.maxSeverity).toBe('critical');
  });
});

describe('validateSceneConfig', () => {
  test('有效配置返回空数组', () => {
    expect(validateSceneConfig(makeSceneConfig())).toEqual([]);
  });

  test('概率覆盖超出范围', () => {
    expect(validateSceneConfig(makeSceneConfig({ probabilityOverride: -1 }))).toContain(
      '场景覆盖概率必须在 0-100 之间'
    );
    expect(validateSceneConfig(makeSceneConfig({ probabilityOverride: 101 }))).toContain(
      '场景覆盖概率必须在 0-100 之间'
    );
  });

  test('null 概率覆盖有效', () => {
    expect(validateSceneConfig(makeSceneConfig({ probabilityOverride: null }))).toEqual([]);
  });

  test('类别同时出现在允许与排除列表', () => {
    const errors = validateSceneConfig(
      makeSceneConfig({
        allowedCategories: ['encounter', 'combat'],
        excludedCategories: ['combat'],
      })
    );
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('combat');
  });
});

// ── 生成器配置工厂 ──

describe('createDefaultGeneratorConfig', () => {
  test('创建默认生成器配置', () => {
    const cfg = createDefaultGeneratorConfig();
    expect(cfg.defaultProbability).toBe(10);
    expect(cfg.maxPerTurn).toBe(1);
    expect(cfg.globalCooldownMs).toBe(5 * 60 * 1000);
    expect(cfg.lastGeneratedAt).toBeNull();
    expect(cfg.enabled).toBe(false); // 默认未启用
    expect(cfg.feedbackAdjustStep).toBe(DEFAULT_FEEDBACK_ADJUST_STEP);
  });
});

// ── 场景适配 ──

describe('isTemplateApplicableToScene', () => {
  test('applicableScenes 为空 = 所有场景适用', () => {
    const tpl = makeTemplate({ applicableScenes: [] });
    expect(isTemplateApplicableToScene(tpl, '任何场景')).toBe(true);
  });

  test('场景在 applicableScenes 中', () => {
    const tpl = makeTemplate({ applicableScenes: ['森林', '山脉'] });
    expect(isTemplateApplicableToScene(tpl, '森林')).toBe(true);
    expect(isTemplateApplicableToScene(tpl, '山脉')).toBe(true);
    expect(isTemplateApplicableToScene(tpl, '城镇')).toBe(false);
  });

  test('excludedScenes 优先于 applicableScenes', () => {
    const tpl = makeTemplate({
      applicableScenes: ['森林'],
      excludedScenes: ['森林'],
    });
    expect(isTemplateApplicableToScene(tpl, '森林')).toBe(false);
  });

  test('excludedScenes 单独排除', () => {
    const tpl = makeTemplate({
      applicableScenes: [],
      excludedScenes: ['新手村'],
    });
    expect(isTemplateApplicableToScene(tpl, '新手村')).toBe(false);
    expect(isTemplateApplicableToScene(tpl, '其他场景')).toBe(true);
  });
});

// ── 有效概率计算 ──

describe('calculateEffectiveProbability', () => {
  test('场景覆盖优先', () => {
    const tpl = makeTemplate({ probability: 50 });
    const scene = makeSceneConfig({ probabilityOverride: 80 });
    expect(calculateEffectiveProbability(tpl, scene, null)).toBe(80);
  });

  test('无场景覆盖使用模板概率', () => {
    const tpl = makeTemplate({ probability: 30 });
    const scene = makeSceneConfig({ probabilityOverride: null });
    expect(calculateEffectiveProbability(tpl, scene, null)).toBe(30);
  });

  test('无场景配置使用模板概率', () => {
    const tpl = makeTemplate({ probability: 40 });
    expect(calculateEffectiveProbability(tpl, null, null)).toBe(40);
  });

  test('场景覆盖超过 100 被截断', () => {
    const tpl = makeTemplate({ probability: 50 });
    const scene = makeSceneConfig({ probabilityOverride: 150 });
    expect(calculateEffectiveProbability(tpl, scene, null)).toBe(100);
  });

  test('场景覆盖为负被截断为 0', () => {
    const tpl = makeTemplate({ probability: 50 });
    const scene = makeSceneConfig({ probabilityOverride: -10 });
    expect(calculateEffectiveProbability(tpl, scene, null)).toBe(0);
  });
});

// ── 冷却检查 ──

describe('isTemplateOnCooldown', () => {
  test('无冷却时间', () => {
    const tpl = makeTemplate({ cooldownMs: 0 });
    expect(isTemplateOnCooldown(tpl, Date.now())).toBe(false);
  });

  test('从未触发不在冷却', () => {
    const tpl = makeTemplate({ cooldownMs: 600000, lastTriggeredAt: null });
    expect(isTemplateOnCooldown(tpl, Date.now())).toBe(false);
  });

  test('冷却中', () => {
    const now = Date.now();
    const tpl = makeTemplate({
      cooldownMs: 600000,
      lastTriggeredAt: new Date(now - 300000).toISOString(), // 5 分钟前
    });
    expect(isTemplateOnCooldown(tpl, now)).toBe(true);
  });

  test('冷却已过', () => {
    const now = Date.now();
    const tpl = makeTemplate({
      cooldownMs: 600000,
      lastTriggeredAt: new Date(now - 700000).toISOString(), // 11.67 分钟前
    });
    expect(isTemplateOnCooldown(tpl, now)).toBe(false);
  });

  test('无效的 lastTriggeredAt 不算冷却', () => {
    const tpl = makeTemplate({
      cooldownMs: 600000,
      lastTriggeredAt: 'invalid-date',
    });
    expect(isTemplateOnCooldown(tpl, Date.now())).toBe(false);
  });
});

describe('isGeneratorOnCooldown', () => {
  test('无冷却时间', () => {
    const cfg = makeGeneratorConfig({ globalCooldownMs: 0 });
    expect(isGeneratorOnCooldown(cfg, Date.now())).toBe(false);
  });

  test('从未生成不在冷却', () => {
    const cfg = makeGeneratorConfig({ lastGeneratedAt: null });
    expect(isGeneratorOnCooldown(cfg, Date.now())).toBe(false);
  });

  test('冷却中', () => {
    const now = Date.now();
    const cfg = makeGeneratorConfig({
      globalCooldownMs: 300000,
      lastGeneratedAt: new Date(now - 100000).toISOString(), // 100 秒前
    });
    expect(isGeneratorOnCooldown(cfg, now)).toBe(true);
  });

  test('冷却已过', () => {
    const now = Date.now();
    const cfg = makeGeneratorConfig({
      globalCooldownMs: 300000,
      lastGeneratedAt: new Date(now - 400000).toISOString(), // 400 秒前
    });
    expect(isGeneratorOnCooldown(cfg, now)).toBe(false);
  });
});

// ── 候选筛选 ──

describe('selectCandidateTemplates', () => {
  const now = Date.now();

  test('返回启用的模板', () => {
    const templates = [
      makeTemplate({ id: '1', enabled: true }),
      makeTemplate({ id: '2', enabled: false }),
    ];
    const result = selectCandidateTemplates(templates, '森林', null, [], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('1');
  });

  test('排除场景不适配', () => {
    const templates = [
      makeTemplate({ id: '1', excludedScenes: ['新手村'] }),
    ];
    const result = selectCandidateTemplates(templates, '新手村', null, [], now);
    expect(result).toHaveLength(0);
  });

  test('applicableScenes 不包含当前场景被过滤', () => {
    const templates = [
      makeTemplate({ id: '1', applicableScenes: ['森林'] }),
      makeTemplate({ id: '2', applicableScenes: ['城镇'] }),
    ];
    const result = selectCandidateTemplates(templates, '森林', null, [], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('1');
  });

  test('场景排除类别过滤', () => {
    const templates = [
      makeTemplate({ id: '1', category: 'combat' }),
      makeTemplate({ id: '2', category: 'encounter' }),
    ];
    const scene = makeSceneConfig({ excludedCategories: ['combat'] });
    const result = selectCandidateTemplates(templates, '森林', scene, [], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('2');
  });

  test('场景 allowedCategories 非空时仅允许指定类别', () => {
    const templates = [
      makeTemplate({ id: '1', category: 'combat' }),
      makeTemplate({ id: '2', category: 'encounter' }),
      makeTemplate({ id: '3', category: 'discovery' }),
    ];
    const scene = makeSceneConfig({ allowedCategories: ['combat', 'discovery'] });
    const result = selectCandidateTemplates(templates, '森林', scene, [], now);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['1', '3']);
  });

  test('严重度超过场景上限被过滤', () => {
    const templates = [
      makeTemplate({ id: '1', severity: 'minor' }),
      makeTemplate({ id: '2', severity: 'critical' }),
    ];
    const scene = makeSceneConfig({ maxSeverity: 'moderate' });
    const result = selectCandidateTemplates(templates, '森林', scene, [], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('1');
  });

  test('触发关键词未匹配被过滤', () => {
    const templates = [
      makeTemplate({ id: '1', triggerKeywords: ['魔法'] }),
      makeTemplate({ id: '2', triggerKeywords: [] }),
    ];
    // 消息不包含 "魔法"
    const result = selectCandidateTemplates(templates, '森林', null, ['下雨了'], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('2');
  });

  test('触发关键词匹配通过', () => {
    const templates = [
      makeTemplate({ id: '1', triggerKeywords: ['魔法', '剑'] }),
    ];
    const result = selectCandidateTemplates(templates, '森林', null, ['他用魔法攻击'], now);
    expect(result).toHaveLength(1);
  });

  test('冷却中模板被过滤', () => {
    const templates = [
      makeTemplate({
        id: '1',
        cooldownMs: 600000,
        lastTriggeredAt: new Date(now - 100000).toISOString(),
      }),
      makeTemplate({ id: '2', cooldownMs: 0 }),
    ];
    const result = selectCandidateTemplates(templates, '森林', null, [], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('2');
  });

  test('达到最大触发次数被过滤', () => {
    const templates = [
      makeTemplate({ id: '1', maxTriggers: 3, triggerCount: 3 }),
      makeTemplate({ id: '2', maxTriggers: 5, triggerCount: 2 }),
      makeTemplate({ id: '3', maxTriggers: 0, triggerCount: 100 }),
    ];
    const result = selectCandidateTemplates(templates, '森林', null, [], now);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['2', '3']);
  });

  test('多条件组合筛选', () => {
    const templates = [
      makeTemplate({ id: 'a', enabled: false }), // 被禁用
      makeTemplate({ id: 'b', excludedScenes: ['森林'] }), // 排除当前场景
      makeTemplate({
        id: 'c',
        category: 'combat',
        severity: 'critical',
        triggerKeywords: ['剑'],
      }), // 关键词不匹配
      makeTemplate({
        id: 'd',
        category: 'encounter',
        severity: 'minor',
        triggerKeywords: [],
      }), // 通过
    ];
    const scene = makeSceneConfig({ maxSeverity: 'moderate', allowedCategories: ['encounter'] });
    const result = selectCandidateTemplates(templates, '森林', scene, ['他走进来'], now);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('d');
  });
});

// ── 权重选择 ──

describe('selectTemplateByWeight', () => {
  test('空列表返回 null', () => {
    expect(selectTemplateByWeight([])).toBeNull();
  });

  test('单元素直接返回', () => {
    const tpl = makeTemplate({ id: 'only' });
    expect(selectTemplateByWeight([tpl])?.id).toBe('only');
  });

  test('所有权重相同则等概率', () => {
    const candidates = [
      makeTemplate({ id: '1', weight: 1 }),
      makeTemplate({ id: '2', weight: 1 }),
      makeTemplate({ id: '3', weight: 1 }),
    ];
    // 多次运行应能选到不同模板（概率检验）
    const selected = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = selectTemplateByWeight(candidates);
      if (r) selected.add(r.id);
    }
    // 至少选到 2 个不同的（统计学保证）
    expect(selected.size).toBeGreaterThanOrEqual(2);
  });

  test('权重为 0 的模板不会被选中', () => {
    const candidates = [
      makeTemplate({ id: 'zero', weight: 0 }),
      makeTemplate({ id: 'one', weight: 1 }),
    ];
    // 100 次都应选 one
    for (let i = 0; i < 100; i++) {
      expect(selectTemplateByWeight(candidates)?.id).toBe('one');
    }
  });

  test('所有权重为 0 时返回第一个', () => {
    const candidates = [
      makeTemplate({ id: 'a', weight: 0 }),
      makeTemplate({ id: 'b', weight: 0 }),
    ];
    expect(selectTemplateByWeight(candidates)?.id).toBe('a');
  });
});

// ── 模板感知 Prompt ──

describe('buildTemplateAwareMessages', () => {
  test('无模板时降级为 buildRandomEventMessages', () => {
    const messages = buildTemplateAwareMessages(
      {
        sceneName: '森林',
        recentMessages: [],
      },
      null
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
  });

  test('有模板时包含模板名与描述', () => {
    const tpl = makeTemplate({
      name: '神秘访客模板',
      description: '披斗篷的访客出现',
      category: 'encounter',
      severity: 'moderate',
    });
    const messages = buildTemplateAwareMessages(
      {
        sceneName: '酒馆',
        recentMessages: ['主角在喝酒'],
      },
      tpl
    );
    expect(messages[0]!.content).toContain('事件生成器');
    expect(messages[1]!.content).toContain('神秘访客模板');
    expect(messages[1]!.content).toContain('披斗篷的访客出现');
    expect(messages[1]!.content).toContain('偶遇 NPC');
    expect(messages[1]!.content).toContain('中等');
  });

  test('包含 JSON 返回要求', () => {
    const tpl = makeTemplate();
    const messages = buildTemplateAwareMessages(
      { sceneName: '酒馆', recentMessages: [] },
      tpl
    );
    expect(messages[1]!.content).toMatch(/JSON/);
  });
});

// ── 结果记录与反馈 ──

describe('createRandomEventResult', () => {
  test('基于模板创建结果', () => {
    const tpl = makeTemplate({ id: 'tpl-1', name: '模板A', category: 'encounter', severity: 'minor' });
    const result = createRandomEventResult({
      template: tpl,
      sceneName: '森林',
      generated: { name: '神秘访客', description: '描述', isOneShot: true },
      effectiveProbability: 80,
    });
    expect(result.id).toMatch(/^res-/);
    expect(result.templateId).toBe('tpl-1');
    expect(result.templateName).toBe('模板A');
    expect(result.sceneName).toBe('森林');
    expect(result.eventName).toBe('神秘访客');
    expect(result.eventDescription).toBe('描述');
    expect(result.category).toBe('encounter');
    expect(result.severity).toBe('minor');
    expect(result.effectiveProbability).toBe(80);
    expect(result.generatedAt).toBeTruthy();
    expect(result.feedback).toBe('neutral');
  });

  test('无模板时 templateId 为 null', () => {
    const result = createRandomEventResult({
      template: null,
      sceneName: '森林',
      generated: { name: '事件', description: '描述', isOneShot: true },
      effectiveProbability: 10,
    });
    expect(result.templateId).toBeNull();
    expect(result.templateName).toBe('(AI 即时生成)');
    expect(result.category).toBe('custom');
    expect(result.severity).toBe('minor');
  });

  test('备注可选', () => {
    const result = createRandomEventResult({
      template: null,
      sceneName: '森林',
      generated: { name: '事件', description: '描述', isOneShot: true },
      effectiveProbability: 10,
      note: '用户备注',
    });
    expect(result.note).toBe('用户备注');
  });
});

describe('applyFeedbackToResult', () => {
  test('应用反馈返回新对象', () => {
    const result: ReturnType<typeof createRandomEventResult> = {
      id: 'res-1',
      templateId: null,
      templateName: '(AI 即时生成)',
      sceneName: '森林',
      eventName: '事件',
      eventDescription: '描述',
      category: 'custom',
      severity: 'minor',
      effectiveProbability: 10,
      generatedAt: '2026-07-24T00:00:00.000Z',
      feedback: 'neutral',
    };
    const updated = applyFeedbackToResult(result, 'positive');
    expect(updated).not.toBe(result);
    expect(updated.feedback).toBe('positive');
    expect(result.feedback).toBe('neutral'); // 原对象不变
  });

  test('应用反馈时添加备注', () => {
    const result = {
      id: 'res-1',
      templateId: null,
      templateName: '',
      sceneName: '',
      eventName: '',
      eventDescription: '',
      category: 'custom' as RandomEventCategory,
      severity: 'minor' as RandomEventSeverity,
      effectiveProbability: 10,
      generatedAt: '',
      feedback: 'neutral' as RandomEventFeedback,
    };
    const updated = applyFeedbackToResult(result, 'negative', '太频繁了');
    expect(updated.feedback).toBe('negative');
    expect(updated.note).toBe('太频繁了');
  });
});

// ── 反馈调整概率 ──

describe('adjustProbabilityByFeedback', () => {
  test('positive 增加概率', () => {
    const tpl = makeTemplate({ probability: 50 });
    expect(adjustProbabilityByFeedback(tpl, 'positive', 5)).toBe(55);
  });

  test('negative 减少概率', () => {
    const tpl = makeTemplate({ probability: 50 });
    expect(adjustProbabilityByFeedback(tpl, 'negative', 5)).toBe(45);
  });

  test('neutral 不变', () => {
    const tpl = makeTemplate({ probability: 50 });
    expect(adjustProbabilityByFeedback(tpl, 'neutral', 5)).toBe(50);
  });

  test('positive 超过上限被截断为 100', () => {
    const tpl = makeTemplate({ probability: 98 });
    expect(adjustProbabilityByFeedback(tpl, 'positive', 5)).toBe(100);
  });

  test('negative 低于下限被截断为 1', () => {
    const tpl = makeTemplate({ probability: 3 });
    expect(adjustProbabilityByFeedback(tpl, 'negative', 5)).toBe(1);
  });

  test('使用默认步长', () => {
    const tpl = makeTemplate({ probability: 50 });
    expect(adjustProbabilityByFeedback(tpl, 'positive')).toBe(55);
  });
});

// ── 统计 ──

describe('computeRandomEventStats', () => {
  test('空列表返回零统计', () => {
    const stats = computeRandomEventStats([]);
    expect(stats.totalGenerated).toBe(0);
    expect(stats.averageProbability).toBe(0);
    expect(stats.byFeedback.positive).toBe(0);
    expect(stats.byCategory.encounter).toBe(0);
  });

  test('正确统计多个结果', () => {
    const results: ReturnType<typeof createRandomEventResult>[] = [
      {
        id: 'r1',
        templateId: null,
        templateName: '',
        sceneName: '',
        eventName: '',
        eventDescription: '',
        category: 'encounter',
        severity: 'minor',
        effectiveProbability: 50,
        generatedAt: '',
        feedback: 'positive',
      },
      {
        id: 'r2',
        templateId: null,
        templateName: '',
        sceneName: '',
        eventName: '',
        eventDescription: '',
        category: 'encounter',
        severity: 'critical',
        effectiveProbability: 70,
        generatedAt: '',
        feedback: 'negative',
      },
      {
        id: 'r3',
        templateId: null,
        templateName: '',
        sceneName: '',
        eventName: '',
        eventDescription: '',
        category: 'combat',
        severity: 'moderate',
        effectiveProbability: 30,
        generatedAt: '',
        feedback: 'neutral',
      },
    ];
    const stats = computeRandomEventStats(results);
    expect(stats.totalGenerated).toBe(3);
    expect(stats.byCategory.encounter).toBe(2);
    expect(stats.byCategory.combat).toBe(1);
    expect(stats.byCategory.discovery).toBe(0);
    expect(stats.bySeverity.minor).toBe(1);
    expect(stats.bySeverity.critical).toBe(1);
    expect(stats.bySeverity.moderate).toBe(1);
    expect(stats.byFeedback.positive).toBe(1);
    expect(stats.byFeedback.negative).toBe(1);
    expect(stats.byFeedback.neutral).toBe(1);
    // 平均概率：(50+70+30)/3 = 50
    expect(stats.averageProbability).toBe(50);
  });

  test('平均概率四舍五入到 1 位小数', () => {
    const results = [
      {
        id: 'r1',
        templateId: null,
        templateName: '',
        sceneName: '',
        eventName: '',
        eventDescription: '',
        category: 'custom' as RandomEventCategory,
        severity: 'minor' as RandomEventSeverity,
        effectiveProbability: 33,
        generatedAt: '',
        feedback: 'neutral' as RandomEventFeedback,
      },
      {
        id: 'r2',
        templateId: null,
        templateName: '',
        sceneName: '',
        eventName: '',
        eventDescription: '',
        category: 'custom' as RandomEventCategory,
        severity: 'minor' as RandomEventSeverity,
        effectiveProbability: 34,
        generatedAt: '',
        feedback: 'neutral' as RandomEventFeedback,
      },
    ];
    // (33+34)/2 = 33.5
    expect(computeRandomEventStats(results).averageProbability).toBe(33.5);
  });
});

// ── 单轮决策 ──

describe('decideRandomEvent', () => {
  const now = Date.now();

  test('生成器未启用返回 false', () => {
    const cfg = makeGeneratorConfig({ enabled: false });
    const decision = decideRandomEvent(cfg, null, [], '森林', [], now);
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.template).toBeNull();
    expect(decision.reason).toContain('未启用');
  });

  test('全局冷却中返回 false', () => {
    const cfg = makeGeneratorConfig({
      enabled: true,
      globalCooldownMs: 300000,
      lastGeneratedAt: new Date(now - 100000).toISOString(),
    });
    const decision = decideRandomEvent(cfg, null, [], '森林', [], now);
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.reason).toContain('冷却');
  });

  test('场景未启用返回 false', () => {
    const cfg = makeGeneratorConfig({ enabled: true });
    const scene = makeSceneConfig({ enabled: false });
    const decision = decideRandomEvent(cfg, scene, [], '森林', [], now);
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.reason).toContain('场景未启用');
  });

  test('生成器启用且概率 100 必触发', () => {
    const cfg = makeGeneratorConfig({ enabled: true, defaultProbability: 100 });
    const decision = decideRandomEvent(cfg, null, [], '森林', [], now);
    expect(decision.shouldTrigger).toBe(true);
    expect(decision.template).toBeNull(); // 无模板，纯 AI 即时生成
    expect(decision.effectiveProbability).toBe(100);
  });

  test('生成器启用且概率 0 必不触发', () => {
    const cfg = makeGeneratorConfig({ enabled: true, defaultProbability: 0 });
    const decision = decideRandomEvent(cfg, null, [], '森林', [], now);
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.reason).toContain('概率判定未通过');
  });

  test('有候选模板且概率 100 必触发', () => {
    const tpl = makeTemplate({ id: 't1', probability: 100, enabled: true });
    const cfg = makeGeneratorConfig({ enabled: true });
    const decision = decideRandomEvent(cfg, null, [tpl], '森林', [], now);
    expect(decision.shouldTrigger).toBe(true);
    expect(decision.template?.id).toBe('t1');
  });

  test('候选模板概率 0 不触发', () => {
    const tpl = makeTemplate({ id: 't1', probability: 0, enabled: true });
    const cfg = makeGeneratorConfig({ enabled: true });
    const decision = decideRandomEvent(cfg, null, [tpl], '森林', [], now);
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.template?.id).toBe('t1'); // 选中的模板但概率未通过
    expect(decision.reason).toContain('概率判定未通过');
  });

  test('场景覆盖概率生效', () => {
    const tpl = makeTemplate({ id: 't1', probability: 0, enabled: true });
    const scene = makeSceneConfig({ probabilityOverride: 100 });
    const cfg = makeGeneratorConfig({ enabled: true });
    const decision = decideRandomEvent(cfg, scene, [tpl], '森林', [], now);
    expect(decision.shouldTrigger).toBe(true);
    expect(decision.effectiveProbability).toBe(100);
  });

  test('场景排除模板类别时不触发该模板', () => {
    const tpl = makeTemplate({ id: 't1', category: 'combat', probability: 100 });
    const scene = makeSceneConfig({ excludedCategories: ['combat'] });
    const cfg = makeGeneratorConfig({ enabled: true, defaultProbability: 0 }); // 无候选时也 0
    const decision = decideRandomEvent(cfg, scene, [tpl], '森林', [], now);
    expect(decision.shouldTrigger).toBe(false);
  });
});
