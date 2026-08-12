/**
 * F16.4 故事时间推进系统 - 核心逻辑
 *
 * 职责：
 * 1. 定义时间策略（realtime/ratio/manual）、时间单位（hour/day/week/custom）
 * 2. 格式化故事时间为人类可读字符串（"第 3 天"、"第 7 周"）
 * 3. 判断当前对话轮是否应推进时间（按策略）
 * 4. 推进时间（+1 单位）
 * 5. 构建时间提示词片段（注入 prompt-builder）
 * 6. 校验时间配置
 *
 * 不负责：
 * - 持久化（由 story store 处理）
 * - 时间触发事件判定（由 F17 trigger-engine 处理，通过 TimeTrigger.storyTime 比对）
 */

// ── 类型定义 ──

/**
 * 时间推进策略
 * - 'realtime'：每轮对话推进一个时间单位
 * - 'ratio'：每 N 轮推进一个时间单位（N 由 ratioEvery 配置）
 * - 'manual'：仅通过 /time advance 命令手动推进
 */
export type StoryTimeStrategy = 'realtime' | 'ratio' | 'manual';

/**
 * 时间单位
 * - 'hour'：小时
 * - 'day'：天
 * - 'week'：周
 * - 'custom'：自定义单位名（如"月"、"年"、"章"）
 */
export type StoryTimeUnit = 'hour' | 'day' | 'week' | 'custom';

/**
 * 时间配置（持久化，随故事保存）
 */
export interface StoryTimeConfig {
  /** 是否启用时间系统（false 时退化为普通对话，不注入时间提示词） */
  enabled: boolean;
  /** 时间推进策略 */
  strategy: StoryTimeStrategy;
  /** 时间单位 */
  unit: StoryTimeUnit;
  /** 自定义单位名（unit='custom' 时使用，如"月"） */
  customUnitName?: string;
  /** ratio 策略下每 N 轮推进一次（N >= 1） */
  ratioEvery: number;
  /** 起始时间值（默认 0 或 1） */
  startValue: number;
}

/**
 * 时间运行时状态（持久化，随故事保存）
 */
export interface StoryTimeState {
  /** 当前时间值（数值，如 3 表示"第 3 天"） */
  currentValue: number;
  /** 自上次推进以来的对话轮数（用于 ratio 策略计数） */
  turnsSinceAdvance: number;
  /** 总对话轮数（用于统计） */
  totalTurns: number;
}

// ── 常量约束 ──

/** ratioEvery 最小值 */
export const MIN_RATIO_EVERY = 1;
/** ratioEvery 最大值 */
export const MAX_RATIO_EVERY = 50;
/** 自定义单位名最大长度 */
export const MAX_CUSTOM_UNIT_NAME_LENGTH = 10;
/** 时间值上限（防止溢出） */
export const MAX_TIME_VALUE = 999999;

// ── 工厂函数 ──

export function createDefaultTimeConfig(): StoryTimeConfig {
  return {
    enabled: false,
    strategy: 'realtime',
    unit: 'day',
    customUnitName: '',
    ratioEvery: 3,
    startValue: 1,
  };
}

export function createDefaultTimeState(config?: StoryTimeConfig): StoryTimeState {
  return {
    currentValue: config?.startValue ?? 1,
    turnsSinceAdvance: 0,
    totalTurns: 0,
  };
}

// ── 单位格式化 ──

/**
 * 获取单位的中文显示名
 */
export function getUnitLabel(unit: StoryTimeUnit, customName?: string): string {
  switch (unit) {
    case 'hour':
      return '小时';
    case 'day':
      return '天';
    case 'week':
      return '周';
    case 'custom':
      return customName?.trim() || '单位';
  }
}

/**
 * 格式化故事时间为人类可读字符串
 *
 * @param config 时间配置
 * @param state 时间状态
 * @returns 格式化字符串，如 "第 3 天"、"第 7 周"、"第 2 章"
 *
 * 规则：
 * - currentValue <= 0 时返回 "故事开始前"
 * - enabled=false 或 config=null 时返回空字符串
 */
export function formatStoryTime(
  config: StoryTimeConfig | null | undefined,
  state: StoryTimeState | null | undefined
): string {
  if (!config || !state) return '';
  if (!config.enabled) return '';

  if (state.currentValue <= 0) return '故事开始前';

  const unitLabel = getUnitLabel(config.unit, config.customUnitName);
  return `第 ${state.currentValue} ${unitLabel}`;
}

// ── 策略判断 ──

/**
 * 判断当前轮结束后是否应推进时间
 *
 * @param config 时间配置
 * @param stateBeforeTurn 本轮开始前的时间状态（turnsSinceAdvance 尚未自增）
 * @returns 是否应推进
 *
 * 规则：
 * - enabled=false → false
 * - strategy='manual' → false（仅手动推进）
 * - strategy='realtime' → true（每轮推进）
 * - strategy='ratio' → (turnsSinceAdvance + 1) >= ratioEvery
 */
export function shouldAdvanceOnTurn(
  config: StoryTimeConfig | null | undefined,
  stateBeforeTurn: StoryTimeState | null | undefined
): boolean {
  if (!config || !stateBeforeTurn || !config.enabled) return false;

  switch (config.strategy) {
    case 'manual':
      return false;
    case 'realtime':
      return true;
    case 'ratio':
      return stateBeforeTurn.turnsSinceAdvance + 1 >= config.ratioEvery;
    default:
      return false;
  }
}

// ── 时间推进 ──

/**
 * 推进一个时间单位（不可变更新）
 *
 * @param config 时间配置
 * @param state 当前时间状态
 * @returns 新时间状态（currentValue +1，turnsSinceAdvance 重置为 0）
 */
export function advanceTime(
  config: StoryTimeConfig | null | undefined,
  state: StoryTimeState | null | undefined
): StoryTimeState {
  if (!config || !state) return state ?? createDefaultTimeState();

  const newValue = Math.min(state.currentValue + 1, MAX_TIME_VALUE);
  return {
    currentValue: newValue,
    turnsSinceAdvance: 0,
    totalTurns: state.totalTurns,
  };
}

/**
 * 记录一轮对话结束（更新计数，但不一定推进时间）
 *
 * @param config 时间配置
 * @param state 本轮开始前的时间状态
 * @returns 本轮结束后更新后的状态（可能已推进时间，也可能仅计数+1）
 */
export function recordTurnEnd(
  config: StoryTimeConfig | null | undefined,
  state: StoryTimeState | null | undefined
): StoryTimeState {
  if (!config || !state) return state ?? createDefaultTimeState();

  if (!config.enabled) {
    // 时间系统未启用：仅记录轮数
    return {
      ...state,
      totalTurns: state.totalTurns + 1,
    };
  }

  const shouldAdvance = shouldAdvanceOnTurn(config, state);
  if (shouldAdvance) {
    return advanceTime(config, {
      ...state,
      turnsSinceAdvance: state.turnsSinceAdvance + 1,
      totalTurns: state.totalTurns + 1,
    });
  }

  return {
    ...state,
    turnsSinceAdvance: state.turnsSinceAdvance + 1,
    totalTurns: state.totalTurns + 1,
  };
}

// ── 时间设置 ──

/**
 * 直接设置当前时间值（/time set 命令使用）
 */
export function setStoryTimeValue(
  state: StoryTimeState | null | undefined,
  value: number
): StoryTimeState {
  const safeValue = Math.max(0, Math.min(value, MAX_TIME_VALUE));
  if (!state) {
    return {
      currentValue: safeValue,
      turnsSinceAdvance: 0,
      totalTurns: 0,
    };
  }
  return {
    ...state,
    currentValue: safeValue,
  };
}

/**
 * 重置时间状态到初始值
 */
export function resetStoryTime(
  config: StoryTimeConfig | null | undefined
): StoryTimeState {
  return createDefaultTimeState(config ?? undefined);
}

// ── 提示词构建 ──

/**
 * 构建时间信息提示词片段（注入 system prompt）
 *
 * 输出格式示例：
 * ```
 * [Story Time]
 * 当前故事时间：第 3 天
 * 时间推进策略：实时模式（每轮推进）
 * ```
 *
 * @param config 时间配置
 * @param state 时间状态
 * @returns 提示词文本（未启用或为空时返回空字符串）
 */
export function buildStoryTimePrompt(
  config: StoryTimeConfig | null | undefined,
  state: StoryTimeState | null | undefined
): string {
  if (!config || !state || !config.enabled) return '';

  const lines: string[] = [];
  lines.push('[Story Time]');
  lines.push(`当前故事时间：${formatStoryTime(config, state)}`);

  const strategyLabel = getStrategyLabel(config.strategy);
  lines.push(`时间推进策略：${strategyLabel}`);

  return lines.join('\n');
}

/**
 * 获取策略的中文标签
 */
export function getStrategyLabel(strategy: StoryTimeStrategy): string {
  switch (strategy) {
    case 'realtime':
      return '实时模式（每轮推进）';
    case 'ratio':
      return '比值模式（每 N 轮推进）';
    case 'manual':
      return '手动模式（/time advance 推进）';
  }
}

// ── 校验 ──

/**
 * 校验时间配置合法性
 * @returns 错误消息数组（空表示通过）
 */
export function validateTimeConfig(
  config: Partial<StoryTimeConfig>
): string[] {
  const errors: string[] = [];

  if (config.strategy && !['realtime', 'ratio', 'manual'].includes(config.strategy)) {
    errors.push(`无效的时间策略：${config.strategy}`);
  }

  if (config.unit && !['hour', 'day', 'week', 'custom'].includes(config.unit)) {
    errors.push(`无效的时间单位：${config.unit}`);
  }

  if (config.unit === 'custom') {
    if (!config.customUnitName || config.customUnitName.trim() === '') {
      errors.push('自定义单位必须指定名称');
    } else if (config.customUnitName.length > MAX_CUSTOM_UNIT_NAME_LENGTH) {
      errors.push(`自定义单位名不能超过 ${MAX_CUSTOM_UNIT_NAME_LENGTH} 字符`);
    }
  }

  if (config.ratioEvery !== undefined) {
    if (
      typeof config.ratioEvery !== 'number' ||
      config.ratioEvery < MIN_RATIO_EVERY ||
      config.ratioEvery > MAX_RATIO_EVERY
    ) {
      errors.push(
        `比值 N 必须在 ${MIN_RATIO_EVERY}-${MAX_RATIO_EVERY} 之间`
      );
    }
  }

  if (config.startValue !== undefined) {
    if (
      typeof config.startValue !== 'number' ||
      config.startValue < 0 ||
      config.startValue > MAX_TIME_VALUE
    ) {
      errors.push(`起始时间值必须在 0-${MAX_TIME_VALUE} 之间`);
    }
  }

  return errors;
}
