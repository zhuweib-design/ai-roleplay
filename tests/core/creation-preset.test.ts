import { describe, expect, it } from 'vitest';
import {
  PRESET_DEFINITIONS,
  PRESET_IDS,
  PRESET_SCHEMA_VERSION,
  normalizePresetId,
  presetContextBudget,
  presetSamplingOverrides,
  resolvePresetParams,
} from '@core/creation-preset';

/**
 * MODEL-03 · 创作模式 / Preset 抽象
 *
 * 对应计划三条验收：
 * 1. 切换 Preset 后实际请求参数可检查 → resolvePresetParams / presetSamplingOverrides
 * 2. Preset 变更可追溯 → presetVersion + id
 * 3. 高级用户可查看/覆盖 → 逐字段 source 标注，custom 不干预
 */

describe('Preset 定义与归一化', () => {
  it('首版提供四个模式，custom 不携带建议值', () => {
    expect(PRESET_IDS).toEqual(['free', 'balanced', 'strict', 'custom']);
    expect(PRESET_DEFINITIONS.custom.applies).toBe(false);
    expect(PRESET_DEFINITIONS.custom.sampling).toBeUndefined();
  });

  it('非法输入归一为 balanced，而非静默选 custom', () => {
    expect(normalizePresetId('free')).toBe('free');
    expect(normalizePresetId('strict')).toBe('strict');
    expect(normalizePresetId('nonsense')).toBe('balanced');
    expect(normalizePresetId(undefined)).toBe('balanced');
    expect(normalizePresetId(42)).toBe('balanced');
  });
});

describe('参数解析（可检查 / 可覆盖）', () => {
  it('strict 产出采样建议，并逐字段标注来源', () => {
    const resolved = resolvePresetParams('strict');
    expect(resolved.sampling.topP).toEqual({ value: 0.8, source: 'preset' });
    expect(resolved.sampling.presencePenalty).toEqual({ value: 0.3, source: 'preset' });
    expect(resolved.sampling.frequencyPenalty).toEqual({ value: 0.3, source: 'preset' });
    expect(resolved.contextBudgetFactor).toEqual({ value: 0.85, source: 'preset' });
  });

  it('free/balanced 只建议 topP，惩罚项标记为沿用用户设置', () => {
    const resolved = resolvePresetParams('free');
    expect(resolved.sampling.topP.source).toBe('preset');
    expect(resolved.sampling.presencePenalty).toEqual({ value: null, source: 'inherit' });
    expect(resolved.sampling.frequencyPenalty.source).toBe('inherit');
  });

  it('custom 全部标记为 inherit（不干预任何参数）', () => {
    const resolved = resolvePresetParams('custom');
    expect(resolved.contextBudgetFactor.source).toBe('inherit');
    expect(resolved.statusInstruction.source).toBe('inherit');
    for (const key of ['topP', 'presencePenalty', 'frequencyPenalty'] as const) {
      expect(resolved.sampling[key].source).toBe('inherit');
    }
  });

  it('presetSamplingOverrides 只含预设实际建议的字段', () => {
    expect(presetSamplingOverrides('balanced')).toEqual({ topP: 0.9 });
    expect(presetSamplingOverrides('custom')).toBeNull();
  });

  it('Preset 版本号随解析结果返回，满足变更可追溯', () => {
    for (const id of PRESET_IDS) {
      expect(resolvePresetParams(id).presetVersion).toBe(PRESET_SCHEMA_VERSION);
      expect(resolvePresetParams(id).presetId).toBe(id);
    }
  });
});

describe('上下文预算', () => {
  it('strict 收窄预算，free/balanced 用满', () => {
    expect(presetContextBudget('free', 8192)).toBe(8192);
    expect(presetContextBudget('balanced', 8192)).toBe(8192);
    expect(presetContextBudget('strict', 8192)).toBe(6963);
  });

  it('预算不低于下限，避免被压到不可用', () => {
    expect(presetContextBudget('strict', 100)).toBe(512);
  });
});
