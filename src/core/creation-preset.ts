import type { SamplingOverrides } from '@/types';
import { t } from '@/i18n';

/**
 * 创作模式与 Preset 抽象（MODEL-03）
 *
 * 计划要求：把「采样参数 + 上下文预算 + 输出约束」包装成面向**创作意图**的
 * Preset，同时保留高级自定义。三条验收：
 *
 * 1. 切换 Preset 后实际请求参数可检查 → `resolvePresetParams()`
 * 2. Preset 变更可追溯 → `PresetId` 与 `presetVersion` 记入请求元信息
 * 3. 高级用户可查看/覆盖具体参数 → 返回结构含 `sources`，逐字段标注来源
 *
 * 设计取舍：
 * - Preset 只产出**建议值**，不直接改用户设置；由调用方决定是否套用。
 * - `custom` 模式不携带任何建议值（等价于"不干预"），保持既有逐档回落语义。
 * - 模式名称刻意保持中性（自由/均衡/严谨），避免产生不应有的质量承诺
 *   （计划风险项明确提示：模式名不应暗示质量高低）。
 * - Provider 专属字段（如某些供应商专有采样参数）**不**进入 Schema，
 *   由各 client 自行处理，避免预设层绑定单一 Provider 能力。
 */

/** Preset 标识。`custom` = 用户自行指定，不套用任何建议值。 */
export type PresetId = 'free' | 'balanced' | 'strict' | 'custom';

/** 首版提供的 Preset 顺序（UI 展示用）。 */
export const PRESET_IDS: readonly PresetId[] = ['free', 'balanced', 'strict', 'custom'] as const;

/**
 * Preset Schema 版本。
 * 变更映射规则或字段语义时递增，并在发布说明记录——满足"Preset 变更可追溯"。
 */
export const PRESET_SCHEMA_VERSION = 1;

/** 单个 Preset 的定义。 */
export interface PresetDefinition {
  id: PresetId;
  /** 是否携带建议参数；`custom` 为 false。 */
  applies: boolean;
  /** 采样参数建议值；字段缺省 = 不干预（保持既有回落）。 */
  sampling?: SamplingOverrides;
  /**
   * 上下文预算策略：相对于全局 `maxContextTokens` 的乘数。
   * 1 = 用满全局预算；< 1 = 收窄（留给更精确的输出约束）。
   */
  contextBudgetFactor?: number;
  /** 输出约束：是否要求模型产出状态块（P1 状态 HUD 的注入开关）。 */
  statusInstruction?: boolean;
}

/** 解析结果的逐字段来源标注，供高级用户"查看具体参数"。 */
export interface PresetResolvedField<T> {
  value: T;
  /** `preset` = 由 Preset 提供；`inherit` = Preset 未干预，沿用既有层级。 */
  source: 'preset' | 'inherit';
}

/** Preset 解析结果。 */
export interface PresetResolution {
  presetId: PresetId;
  presetVersion: number;
  sampling: Record<keyof SamplingOverrides, PresetResolvedField<number | null>>;
  contextBudgetFactor: PresetResolvedField<number>;
  statusInstruction: PresetResolvedField<boolean>;
}

/**
 * 首版 Preset 定义。
 *
 * 映射依据（非质量承诺，仅为意图对齐）：
 * - free：更发散——高温度、放开惩罚项，适合头脑风暴与即兴对话。
 * - balanced：接近供应商默认——只轻微收敛，作为日常默认。
 * - strict：更收敛——低温度、增强重复惩罚、收窄上下文预算并要求状态块，
 *   适合需要稳定人设与结构化输出的场景。
 */
export const PRESET_DEFINITIONS: Record<PresetId, PresetDefinition> = {
  free: {
    id: 'free',
    applies: true,
    sampling: { topP: 0.95 },
    contextBudgetFactor: 1,
    statusInstruction: false,
  },
  balanced: {
    id: 'balanced',
    applies: true,
    sampling: { topP: 0.9 },
    contextBudgetFactor: 1,
    statusInstruction: false,
  },
  strict: {
    id: 'strict',
    applies: true,
    sampling: { topP: 0.8, presencePenalty: 0.3, frequencyPenalty: 0.3 },
    contextBudgetFactor: 0.85,
    statusInstruction: true,
  },
  custom: {
    id: 'custom',
    applies: false,
  },
};

/** 归一化任意输入为合法 PresetId；非法值回落 `balanced`（不静默用 custom）。 */
export function normalizePresetId(value: unknown): PresetId {
  return typeof value === 'string' && (PRESET_IDS as readonly string[]).includes(value)
    ? (value as PresetId)
    : 'balanced';
}

/** Preset 的展示名（i18n）。 */
export function presetLabel(id: PresetId): string {
  return t(`preset.${id}.label`);
}

/** Preset 的说明（i18n）。 */
export function presetDescription(id: PresetId): string {
  return t(`preset.${id}.description`);
}

/**
 * 解析 Preset 为具体参数，并逐字段标注来源。
 *
 * 返回的 `source: 'inherit'` 表示该字段 Preset 不干预——调用方应保持既有
 * 逐档回落（角色级 > Profile 级 > 全局默认 > 供应商默认）。
 */
export function resolvePresetParams(id: PresetId): PresetResolution {
  const definition = PRESET_DEFINITIONS[normalizePresetId(id)];
  const samplingField = (
    key: keyof SamplingOverrides,
  ): PresetResolvedField<number | null> => {
    const value = definition.sampling?.[key];
    return typeof value === 'number'
      ? { value, source: 'preset' }
      : { value: null, source: 'inherit' };
  };
  return {
    presetId: definition.id,
    presetVersion: PRESET_SCHEMA_VERSION,
    sampling: {
      topP: samplingField('topP'),
      presencePenalty: samplingField('presencePenalty'),
      frequencyPenalty: samplingField('frequencyPenalty'),
    },
    contextBudgetFactor: definition.contextBudgetFactor === undefined
      ? { value: 1, source: 'inherit' }
      : { value: definition.contextBudgetFactor, source: 'preset' },
    statusInstruction: definition.statusInstruction === undefined
      ? { value: false, source: 'inherit' }
      : { value: definition.statusInstruction, source: 'preset' },
  };
}

/**
 * 把 Preset 的建议采样值合并为 `SamplingOverrides`（仅含 `source: 'preset'` 的字段）。
 * 供调用方按既定优先级（最低档）合入请求。
 */
export function presetSamplingOverrides(id: PresetId): SamplingOverrides | null {
  const resolved = resolvePresetParams(id);
  const out: SamplingOverrides = {};
  for (const key of ['topP', 'presencePenalty', 'frequencyPenalty'] as const) {
    const field = resolved.sampling[key];
    if (field.source === 'preset' && typeof field.value === 'number') out[key] = field.value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * 依据 Preset 的预算乘数计算实际上下文预算。
 * 结果向下取整且不低于 512（避免预算被压到不可用）。
 */
export function presetContextBudget(id: PresetId, globalMaxContextTokens: number): number {
  const factor = resolvePresetParams(id).contextBudgetFactor.value;
  return Math.max(512, Math.floor(globalMaxContextTokens * factor));
}
