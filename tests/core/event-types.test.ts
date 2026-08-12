/**
 * event-types 单元测试 (迭代29 · F17.1)
 *
 * 覆盖：
 * - MAX_EVENTS_PER_SCENE 常量
 * - createDefaultKeywordTrigger / createDefaultCompletion 工厂函数
 * - createDefaultEvent 默认事件工厂
 * - validateEvent 校验函数（名称/描述/概率/触发条件）
 * - isTriggerable / isActive / isFinished 状态判定
 */
import { describe, test, expect } from 'vitest';
import {
  MAX_EVENTS_PER_SCENE,
  createDefaultKeywordTrigger,
  createDefaultCompletion,
  createDefaultEvent,
  validateEvent,
  isTriggerable,
  isActive,
  isFinished,
  type StoryEvent,
  type TriggerCondition,
} from '@core/event-types';

// ── 测试夹具 ──

/** 构造完整事件（基于 createDefaultEvent 填充 id/timestamps，带合法 trigger） */
function makeEvent(overrides: Partial<StoryEvent> = {}): StoryEvent {
  const base = createDefaultEvent('lb-1', 'scene-1', '王都');
  return {
    ...base,
    id: 'evt-test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: '测试事件',
    description: '测试事件描述',
    // 默认带合法的 keyword trigger（keywords 非空），避免 validateEvent 报错
    trigger: {
      type: 'keyword',
      keywords: ['测试关键词'],
      useRegex: false,
      caseSensitive: false,
    },
    ...overrides,
  };
}

/** 构造合法的关键词触发条件 */
function makeKeywordTrigger(
  overrides: Partial<Extract<TriggerCondition, { type: 'keyword' }>> = {}
): Extract<TriggerCondition, { type: 'keyword' }> {
  return {
    type: 'keyword',
    keywords: ['宝藏'],
    useRegex: false,
    caseSensitive: false,
    ...overrides,
  };
}

// ── 测试用例 ──

describe('event-types (F17.1)', () => {
  // ── 常量 ──

  describe('MAX_EVENTS_PER_SCENE', () => {
    test('值为 20', () => {
      expect(MAX_EVENTS_PER_SCENE).toBe(20);
    });
  });

  // ── 工厂函数 ──

  describe('createDefaultKeywordTrigger', () => {
    test('返回默认关键词触发条件', () => {
      const trigger = createDefaultKeywordTrigger();
      expect(trigger.type).toBe('keyword');
      expect(trigger.keywords).toEqual([]);
      expect(trigger.useRegex).toBe(false);
      expect(trigger.caseSensitive).toBe(false);
    });
  });

  describe('createDefaultCompletion', () => {
    test('返回默认手动完成条件', () => {
      const completion = createDefaultCompletion();
      expect(completion.manualOnly).toBe(true);
      expect(completion.keywords).toBeUndefined();
      expect(completion.useRegex).toBeUndefined();
    });
  });

  describe('createDefaultEvent', () => {
    test('创建全局事件（无场景绑定）', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.name).toBe('');
      expect(evt.description).toBe('');
      expect(evt.lorebookId).toBe('lb-1');
      expect(evt.sceneEntryId).toBeNull();
      expect(evt.sceneName).toBeNull();
    });

    test('创建场景事件（带场景绑定）', () => {
      const evt = createDefaultEvent('lb-1', 'scene-1', '王都');
      expect(evt.lorebookId).toBe('lb-1');
      expect(evt.sceneEntryId).toBe('scene-1');
      expect(evt.sceneName).toBe('王都');
    });

    test('默认值为关键词触发条件', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.trigger.type).toBe('keyword');
      expect(evt.trigger).toEqual({
        type: 'keyword',
        keywords: [],
        useRegex: false,
        caseSensitive: false,
      });
    });

    test('默认完成条件为手动', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.completion.manualOnly).toBe(true);
    });

    test('默认概率为 100', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.probability).toBe(100);
    });

    test('默认状态为 pending', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.state).toBe('pending');
    });

    test('默认不可重复', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.repeatable).toBe(false);
    });

    test('默认触发次数为 0', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.triggerCount).toBe(0);
    });

    test('默认 lastTriggeredAt 为 null', () => {
      const evt = createDefaultEvent('lb-1');
      expect(evt.lastTriggeredAt).toBeNull();
    });

    test('不含 id / createdAt / updatedAt', () => {
      const evt = createDefaultEvent('lb-1');
      expect((evt as { id?: unknown }).id).toBeUndefined();
      expect((evt as { createdAt?: unknown }).createdAt).toBeUndefined();
      expect((evt as { updatedAt?: unknown }).updatedAt).toBeUndefined();
    });
  });

  // ── validateEvent ──

  describe('validateEvent', () => {
    test('合法事件返回空数组', () => {
      const errors = validateEvent(makeEvent());
      expect(errors).toEqual([]);
    });

    test('名称为空时报错', () => {
      const errors = validateEvent(makeEvent({ name: '' }));
      expect(errors).toContain('事件名称不能为空');
    });

    test('名称为空白字符时报错', () => {
      const errors = validateEvent(makeEvent({ name: '   ' }));
      expect(errors).toContain('事件名称不能为空');
    });

    test('名称超过 50 字符时报错', () => {
      const errors = validateEvent(makeEvent({ name: '一'.repeat(51) }));
      expect(errors).toContain('事件名称不能超过 50 字符');
    });

    test('名称恰好 50 字符通过', () => {
      const errors = validateEvent(makeEvent({ name: '一'.repeat(50) }));
      expect(errors).toEqual([]);
    });

    test('描述为空时报错', () => {
      const errors = validateEvent(makeEvent({ description: '' }));
      expect(errors).toContain('事件描述不能为空');
    });

    test('描述超过 2000 字符时报错', () => {
      const errors = validateEvent(makeEvent({ description: '一'.repeat(2001) }));
      expect(errors).toContain('事件描述不能超过 2000 字符');
    });

    test('描述恰好 2000 字符通过', () => {
      const errors = validateEvent(makeEvent({ description: '一'.repeat(2000) }));
      expect(errors).toEqual([]);
    });

    test('概率为负数时报错', () => {
      const errors = validateEvent(makeEvent({ probability: -1 }));
      expect(errors).toContain('触发概率必须在 0-100 之间');
    });

    test('概率超过 100 时报错', () => {
      const errors = validateEvent(makeEvent({ probability: 101 }));
      expect(errors).toContain('触发概率必须在 0-100 之间');
    });

    test('概率为 0 通过', () => {
      const errors = validateEvent(makeEvent({ probability: 0 }));
      expect(errors).toEqual([]);
    });

    test('概率为 100 通过', () => {
      const errors = validateEvent(makeEvent({ probability: 100 }));
      expect(errors).toEqual([]);
    });

    test('概率为非数字时报错', () => {
      const errors = validateEvent(
        makeEvent({ probability: '50' as unknown as number })
      );
      expect(errors).toContain('触发概率必须在 0-100 之间');
    });

    test('概率 undefined 时不校验', () => {
      const errors = validateEvent({ name: '事件', description: '描述' });
      expect(errors).toEqual([]);
    });
  });

  // ── 触发条件校验 ──

  describe('validateEvent 触发条件', () => {
    test('关键词触发条件无关键词时报错', () => {
      const errors = validateEvent(
        makeEvent({ trigger: makeKeywordTrigger({ keywords: [] }) })
      );
      expect(errors).toContain('关键词触发条件必须至少包含一个关键词');
    });

    test('关键词触发条件有关键词时通过', () => {
      const errors = validateEvent(
        makeEvent({ trigger: makeKeywordTrigger({ keywords: ['宝藏', '金币'] }) })
      );
      expect(errors).toEqual([]);
    });

    test('正则触发条件无关键词时报错', () => {
      const errors = validateEvent(
        makeEvent({
          trigger: makeKeywordTrigger({ keywords: [], useRegex: true }),
        })
      );
      expect(errors).toContain('关键词触发条件必须至少包含一个关键词');
    });

    test('正则触发条件含无效正则时报错', () => {
      const errors = validateEvent(
        makeEvent({
          trigger: makeKeywordTrigger({
            keywords: ['[unclosed'],
            useRegex: true,
          }),
        })
      );
      expect(errors.some((e) => e.includes('无效的正则表达式'))).toBe(true);
    });

    test('正则触发条件含有效正则时通过', () => {
      const errors = validateEvent(
        makeEvent({
          trigger: makeKeywordTrigger({
            keywords: ['^宝藏.*'],
            useRegex: true,
          }),
        })
      );
      expect(errors).toEqual([]);
    });

    test('依赖触发条件无前置事件时报错', () => {
      const errors = validateEvent(
        makeEvent({
          trigger: { type: 'dependency', requiredEvents: [] },
        })
      );
      expect(errors).toContain('前置依赖触发条件必须至少包含一个前置事件');
    });

    test('依赖触发条件有前置事件时通过', () => {
      const errors = validateEvent(
        makeEvent({
          trigger: { type: 'dependency', requiredEvents: ['前置事件A'] },
        })
      );
      expect(errors).toEqual([]);
    });

    test('时间触发条件不校验内容（预留）', () => {
      const errors = validateEvent(
        makeEvent({
          trigger: { type: 'time', storyTime: '第 3 天' },
        })
      );
      // time 类型当前无校验规则，应通过
      expect(errors).toEqual([]);
    });

    test('手动触发条件不校验内容', () => {
      const errors = validateEvent(
        makeEvent({
          trigger: { type: 'manual' },
        })
      );
      expect(errors).toEqual([]);
    });

    test('触发条件 undefined 时跳过校验', () => {
      const errors = validateEvent({ name: '事件', description: '描述' });
      expect(errors).toEqual([]);
    });

    test('多个错误同时返回', () => {
      const errors = validateEvent(
        makeEvent({
          name: '',
          description: '',
          probability: 200,
          trigger: makeKeywordTrigger({ keywords: [] }),
        })
      );
      expect(errors.length).toBeGreaterThanOrEqual(4);
      expect(errors).toContain('事件名称不能为空');
      expect(errors).toContain('事件描述不能为空');
      expect(errors).toContain('触发概率必须在 0-100 之间');
      expect(errors).toContain('关键词触发条件必须至少包含一个关键词');
    });
  });

  // ── isTriggerable ──

  describe('isTriggerable', () => {
    test('pending 状态可触发', () => {
      expect(isTriggerable(makeEvent({ state: 'pending' }))).toBe(true);
    });

    test('active 状态不可触发', () => {
      expect(isTriggerable(makeEvent({ state: 'active' }))).toBe(false);
    });

    test('completed 状态默认不可触发', () => {
      expect(isTriggerable(makeEvent({ state: 'completed', repeatable: false }))).toBe(false);
    });

    test('completed 状态且可重复时可触发', () => {
      expect(isTriggerable(makeEvent({ state: 'completed', repeatable: true }))).toBe(true);
    });

    test('failed 状态不可触发', () => {
      expect(isTriggerable(makeEvent({ state: 'failed' }))).toBe(false);
    });

    test('active 状态即使可重复也不触发（已在进行中）', () => {
      expect(isTriggerable(makeEvent({ state: 'active', repeatable: true }))).toBe(false);
    });
  });

  // ── isActive ──

  describe('isActive', () => {
    test('active 状态返回 true', () => {
      expect(isActive(makeEvent({ state: 'active' }))).toBe(true);
    });

    test('pending 状态返回 false', () => {
      expect(isActive(makeEvent({ state: 'pending' }))).toBe(false);
    });

    test('completed 状态返回 false', () => {
      expect(isActive(makeEvent({ state: 'completed' }))).toBe(false);
    });

    test('failed 状态返回 false', () => {
      expect(isActive(makeEvent({ state: 'failed' }))).toBe(false);
    });
  });

  // ── isFinished ──

  describe('isFinished', () => {
    test('completed 状态返回 true', () => {
      expect(isFinished(makeEvent({ state: 'completed' }))).toBe(true);
    });

    test('failed 状态返回 true', () => {
      expect(isFinished(makeEvent({ state: 'failed' }))).toBe(true);
    });

    test('pending 状态返回 false', () => {
      expect(isFinished(makeEvent({ state: 'pending' }))).toBe(false);
    });

    test('active 状态返回 false', () => {
      expect(isFinished(makeEvent({ state: 'active' }))).toBe(false);
    });
  });
});
