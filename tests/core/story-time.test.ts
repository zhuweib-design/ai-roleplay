/**
 * F16.4 故事时间推进系统 - 核心逻辑测试
 */
import { describe, it, expect } from 'vitest';
import {
  createDefaultTimeConfig,
  createDefaultTimeState,
  getUnitLabel,
  formatStoryTime,
  shouldAdvanceOnTurn,
  advanceTime,
  recordTurnEnd,
  setStoryTimeValue,
  resetStoryTime,
  buildStoryTimePrompt,
  getStrategyLabel,
  validateTimeConfig,
  MAX_RATIO_EVERY,
  MAX_CUSTOM_UNIT_NAME_LENGTH,
  MAX_TIME_VALUE,
  type StoryTimeConfig,
  type StoryTimeState,
} from '@core/story-time';

// ── 工厂函数 ──

function makeConfig(overrides: Partial<StoryTimeConfig> = {}): StoryTimeConfig {
  return { ...createDefaultTimeConfig(), ...overrides };
}

function makeState(overrides: Partial<StoryTimeState> = {}): StoryTimeState {
  return { ...createDefaultTimeState(), ...overrides };
}

// ── createDefaultTimeConfig / createDefaultTimeState ──

describe('createDefaultTimeConfig', () => {
  it('默认未启用、实时模式、天单位', () => {
    const config = createDefaultTimeConfig();
    expect(config.enabled).toBe(false);
    expect(config.strategy).toBe('realtime');
    expect(config.unit).toBe('day');
    expect(config.ratioEvery).toBe(3);
    expect(config.startValue).toBe(1);
  });
});

describe('createDefaultTimeState', () => {
  it('默认从 startValue 开始', () => {
    const state = createDefaultTimeState();
    expect(state.currentValue).toBe(1);
    expect(state.turnsSinceAdvance).toBe(0);
    expect(state.totalTurns).toBe(0);
  });

  it('从指定 config 的 startValue 开始', () => {
    const config = makeConfig({ startValue: 5 });
    const state = createDefaultTimeState(config);
    expect(state.currentValue).toBe(5);
  });
});

// ── getUnitLabel ──

describe('getUnitLabel', () => {
  it('内置单位返回中文', () => {
    expect(getUnitLabel('hour')).toBe('小时');
    expect(getUnitLabel('day')).toBe('天');
    expect(getUnitLabel('week')).toBe('周');
  });

  it('custom 单位返回自定义名称', () => {
    expect(getUnitLabel('custom', '月')).toBe('月');
  });

  it('custom 单位名为空时返回默认', () => {
    expect(getUnitLabel('custom', '')).toBe('单位');
    expect(getUnitLabel('custom', undefined)).toBe('单位');
  });
});

// ── formatStoryTime ──

describe('formatStoryTime', () => {
  it('config 为 null/undefined 时返回空字符串', () => {
    expect(formatStoryTime(null, makeState())).toBe('');
    expect(formatStoryTime(undefined, makeState())).toBe('');
  });

  it('未启用时返回空字符串', () => {
    const config = makeConfig({ enabled: false });
    expect(formatStoryTime(config, makeState())).toBe('');
  });

  it('正确格式化天数', () => {
    const config = makeConfig({ enabled: true, unit: 'day' });
    const state = makeState({ currentValue: 3 });
    expect(formatStoryTime(config, state)).toBe('第 3 天');
  });

  it('正确格式化周数', () => {
    const config = makeConfig({ enabled: true, unit: 'week' });
    const state = makeState({ currentValue: 7 });
    expect(formatStoryTime(config, state)).toBe('第 7 周');
  });

  it('正确格式化自定义单位', () => {
    const config = makeConfig({
      enabled: true,
      unit: 'custom',
      customUnitName: '章',
    });
    const state = makeState({ currentValue: 2 });
    expect(formatStoryTime(config, state)).toBe('第 2 章');
  });

  it('currentValue <= 0 返回"故事开始前"', () => {
    const config = makeConfig({ enabled: true });
    const state = makeState({ currentValue: 0 });
    expect(formatStoryTime(config, state)).toBe('故事开始前');
  });
});

// ── shouldAdvanceOnTurn ──

describe('shouldAdvanceOnTurn', () => {
  it('未启用时返回 false', () => {
    const config = makeConfig({ enabled: false, strategy: 'realtime' });
    expect(shouldAdvanceOnTurn(config, makeState())).toBe(false);
  });

  it('manual 策略永远返回 false', () => {
    const config = makeConfig({ enabled: true, strategy: 'manual' });
    expect(shouldAdvanceOnTurn(config, makeState())).toBe(false);
  });

  it('realtime 策略永远返回 true', () => {
    const config = makeConfig({ enabled: true, strategy: 'realtime' });
    expect(shouldAdvanceOnTurn(config, makeState())).toBe(true);
  });

  it('ratio 策略：turnsSinceAdvance + 1 >= ratioEvery 时返回 true', () => {
    const config = makeConfig({ enabled: true, strategy: 'ratio', ratioEvery: 3 });
    expect(shouldAdvanceOnTurn(config, makeState({ turnsSinceAdvance: 0 }))).toBe(false);
    expect(shouldAdvanceOnTurn(config, makeState({ turnsSinceAdvance: 1 }))).toBe(false);
    expect(shouldAdvanceOnTurn(config, makeState({ turnsSinceAdvance: 2 }))).toBe(true);
  });
});

// ── advanceTime ──

describe('advanceTime', () => {
  it('currentValue +1，turnsSinceAdvance 重置为 0', () => {
    const config = makeConfig({ enabled: true });
    const state = makeState({ currentValue: 5, turnsSinceAdvance: 3, totalTurns: 10 });
    const result = advanceTime(config, state);
    expect(result.currentValue).toBe(6);
    expect(result.turnsSinceAdvance).toBe(0);
    expect(result.totalTurns).toBe(10); // 不变
  });

  it('不修改原对象', () => {
    const config = makeConfig({ enabled: true });
    const state = makeState({ currentValue: 5, turnsSinceAdvance: 3 });
    advanceTime(config, state);
    expect(state.currentValue).toBe(5);
    expect(state.turnsSinceAdvance).toBe(3);
  });

  it('达到上限时不再增加', () => {
    const config = makeConfig({ enabled: true });
    const state = makeState({ currentValue: MAX_TIME_VALUE });
    const result = advanceTime(config, state);
    expect(result.currentValue).toBe(MAX_TIME_VALUE);
  });

  it('config/state 为 null 时返回默认状态', () => {
    const result = advanceTime(null, null);
    expect(result.currentValue).toBe(1);
  });
});

// ── recordTurnEnd ──

describe('recordTurnEnd', () => {
  it('realtime 策略：每轮推进时间', () => {
    const config = makeConfig({ enabled: true, strategy: 'realtime' });
    const state = makeState({ currentValue: 1, turnsSinceAdvance: 0, totalTurns: 0 });
    const result = recordTurnEnd(config, state);
    expect(result.currentValue).toBe(2);
    expect(result.turnsSinceAdvance).toBe(0);
    expect(result.totalTurns).toBe(1);
  });

  it('ratio 策略：未到阈值时不推进，仅计数+1', () => {
    const config = makeConfig({ enabled: true, strategy: 'ratio', ratioEvery: 3 });
    const state = makeState({ currentValue: 1, turnsSinceAdvance: 0, totalTurns: 0 });
    const r1 = recordTurnEnd(config, state);
    expect(r1.currentValue).toBe(1);
    expect(r1.turnsSinceAdvance).toBe(1);
    expect(r1.totalTurns).toBe(1);
  });

  it('ratio 策略：达到阈值时推进并重置计数', () => {
    const config = makeConfig({ enabled: true, strategy: 'ratio', ratioEvery: 3 });
    const state = makeState({ currentValue: 1, turnsSinceAdvance: 2, totalTurns: 2 });
    const result = recordTurnEnd(config, state);
    expect(result.currentValue).toBe(2);
    expect(result.turnsSinceAdvance).toBe(0);
    expect(result.totalTurns).toBe(3);
  });

  it('manual 策略：不推进，仅计数', () => {
    const config = makeConfig({ enabled: true, strategy: 'manual' });
    const state = makeState({ currentValue: 5, turnsSinceAdvance: 0, totalTurns: 0 });
    const result = recordTurnEnd(config, state);
    expect(result.currentValue).toBe(5);
    expect(result.turnsSinceAdvance).toBe(1);
    expect(result.totalTurns).toBe(1);
  });

  it('未启用时：仅记录 totalTurns', () => {
    const config = makeConfig({ enabled: false });
    const state = makeState({ currentValue: 5, turnsSinceAdvance: 0, totalTurns: 0 });
    const result = recordTurnEnd(config, state);
    expect(result.currentValue).toBe(5);
    expect(result.turnsSinceAdvance).toBe(0);
    expect(result.totalTurns).toBe(1);
  });
});

// ── setStoryTimeValue ──

describe('setStoryTimeValue', () => {
  it('直接设置时间值', () => {
    const state = makeState({ currentValue: 1 });
    const result = setStoryTimeValue(state, 10);
    expect(result.currentValue).toBe(10);
  });

  it('负值被限制为 0', () => {
    const state = makeState({ currentValue: 5 });
    const result = setStoryTimeValue(state, -3);
    expect(result.currentValue).toBe(0);
  });

  it('超过上限被限制', () => {
    const state = makeState({ currentValue: 1 });
    const result = setStoryTimeValue(state, MAX_TIME_VALUE + 100);
    expect(result.currentValue).toBe(MAX_TIME_VALUE);
  });

  it('state 为 null 时创建新状态', () => {
    const result = setStoryTimeValue(null, 7);
    expect(result.currentValue).toBe(7);
  });
});

// ── resetStoryTime ──

describe('resetStoryTime', () => {
  it('重置到 startValue', () => {
    const config = makeConfig({ startValue: 1 });
    const result = resetStoryTime(config);
    expect(result.currentValue).toBe(1);
    expect(result.turnsSinceAdvance).toBe(0);
    expect(result.totalTurns).toBe(0);
  });

  it('重置到自定义 startValue', () => {
    const config = makeConfig({ startValue: 10 });
    const result = resetStoryTime(config);
    expect(result.currentValue).toBe(10);
  });
});

// ── buildStoryTimePrompt ──

describe('buildStoryTimePrompt', () => {
  it('未启用时返回空字符串', () => {
    const config = makeConfig({ enabled: false });
    expect(buildStoryTimePrompt(config, makeState())).toBe('');
  });

  it('生成正确格式', () => {
    const config = makeConfig({ enabled: true, unit: 'day', strategy: 'realtime' });
    const state = makeState({ currentValue: 3 });
    const prompt = buildStoryTimePrompt(config, state);
    expect(prompt).toContain('[Story Time]');
    expect(prompt).toContain('当前故事时间：第 3 天');
    expect(prompt).toContain('时间推进策略：实时模式');
  });

  it('包含策略标签', () => {
    const config = makeConfig({ enabled: true, strategy: 'manual' });
    const prompt = buildStoryTimePrompt(config, makeState());
    expect(prompt).toContain('手动模式');
  });
});

// ── getStrategyLabel ──

describe('getStrategyLabel', () => {
  it('返回正确标签', () => {
    expect(getStrategyLabel('realtime')).toContain('实时');
    expect(getStrategyLabel('ratio')).toContain('比值');
    expect(getStrategyLabel('manual')).toContain('手动');
  });
});

// ── validateTimeConfig ──

describe('validateTimeConfig', () => {
  it('合法配置返回空数组', () => {
    const errors = validateTimeConfig(makeConfig());
    expect(errors).toEqual([]);
  });

  it('无效策略报错', () => {
    const errors = validateTimeConfig({ strategy: 'invalid' as never });
    expect(errors.some((e) => e.includes('无效的时间策略'))).toBe(true);
  });

  it('无效单位报错', () => {
    const errors = validateTimeConfig({ unit: 'invalid' as never });
    expect(errors.some((e) => e.includes('无效的时间单位'))).toBe(true);
  });

  it('custom 单位未指定名称报错', () => {
    const errors = validateTimeConfig({
      unit: 'custom',
      customUnitName: '',
    });
    expect(errors.some((e) => e.includes('自定义单位必须指定名称'))).toBe(true);
  });

  it('custom 单位名超长报错', () => {
    const errors = validateTimeConfig({
      unit: 'custom',
      customUnitName: 'A'.repeat(MAX_CUSTOM_UNIT_NAME_LENGTH + 1),
    });
    expect(errors.some((e) => e.includes('不能超过'))).toBe(true);
  });

  it('ratioEvery 超出范围报错', () => {
    expect(
      validateTimeConfig({ ratioEvery: 0 }).some((e) => e.includes('比值 N 必须在'))
    ).toBe(true);
    expect(
      validateTimeConfig({ ratioEvery: MAX_RATIO_EVERY + 1 }).some((e) =>
        e.includes('比值 N 必须在')
      )
    ).toBe(true);
  });

  it('startValue 负数报错', () => {
    const errors = validateTimeConfig({ startValue: -1 });
    expect(errors.some((e) => e.includes('起始时间值必须'))).toBe(true);
  });
});
