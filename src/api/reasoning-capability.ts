import type { ApiProfile, SamplingOverrides } from '@/types';
import type { ReasoningEffort } from './types';

/**
 * 推理能力判定与采样参数合并 (P0-2 / P0-3)
 *
 * 本模块是「对外统一概念 → 各 provider 实际下发形态」的唯一翻译层：
 * - P0-2：对外只有 `ReasoningEffort = 'low' | 'medium' | 'high'`，
 *   对内翻译成 `reasoning_effort` / `thinking.budget_tokens` / 不下发。
 * - P0-3：判定某采样参数在当前 Profile 上是否可下发，并做三档合并。
 *
 * 纯函数、零副作用，便于单测与在 UI / store / client 多处复用。
 */

/** 某 Profile 的思考强度下发方式 */
export type ReasoningCapability = 'none' | 'openai-effort' | 'anthropic-budget';

/**
 * 推理模型的启发式正则（**仅作提示依据，不作隐藏依据**）
 *
 * 决策说明：正则必然滞后于新模型发布，用它隐藏控件会让功能对大多数用户不可见。
 * 因此命中与否只决定「是否显示『当前模型可能不支持推理强度』提示」，
 * 控件本身对非硬边界 provider 一律显示。Profile 表单保留 on/off 手动纠偏。
 */
export const REASONING_MODEL_RE =
  /(^o\d|gpt-5|deepseek-r1|qwq|qwen3|glm-4\.5|-reasoner|thinking)/i;

/**
 * Anthropic `budget_tokens` 下限：低于此值启用 extended thinking 无意义，
 * 且极易触发协议 400，故放弃启用（降级为不传）
 */
export const ANTHROPIC_MIN_BUDGET_TOKENS = 256;

/**
 * Anthropic 启用 extended thinking 时与之冲突、必须抑制的采样参数
 *
 * 依据 Anthropic 官方 extended thinking 文档：开启 thinking 时
 * `temperature` 与 `top_p` 不被接受（top_k 亦不建议同用）。
 * 抑制清单写成常量，便于随官方文档更新调整。
 */
export const ANTHROPIC_THINKING_CONFLICT_PARAMS: readonly string[] = ['temperature', 'top_p'];

/** Anthropic 各档位的 budget_tokens */
const ANTHROPIC_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
};

/** Anthropic `max_tokens` 协议必填，请求未指定时的兜底值（与 anthropic-client 保持一致） */
const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

/**
 * P0-2：模型名是否命中推理模型启发式（仅用于 UI 提示，不用于隐藏控件）
 */
export function matchesReasoningModelPattern(model: string | undefined): boolean {
  if (!model) return false;
  return REASONING_MODEL_RE.test(model);
}

/**
 * P0-2：判定某 Profile 的思考强度下发方式
 *
 * 三层递进：
 * 1. 硬边界：`provider === 'local'`（WebLLM 无对应参数）→ `'none'`
 * 2. 用户显式：`reasoningSupport === 'on' | 'off'` → 直接采信
 * 3. 其余 provider：**一律可下发**（未命中启发式正则时 UI 只提示，仍允许设置）
 */
export function resolveReasoningCapability(profile: ApiProfile): ReasoningCapability {
  // 第 1 层：硬边界 —— 浏览器内 WebLLM 无 reasoning_effort / thinking 参数
  if (profile.provider === 'local') return 'none';

  // 第 2 层：用户显式纠偏优先于一切启发式
  if (profile.reasoningSupport === 'off') return 'none';

  if (profile.provider === 'anthropic') {
    return 'anthropic-budget';
  }
  // openai / custom / deepseek 等 OpenAI 兼容层
  return 'openai-effort';
}

/**
 * P0-2：effort → Anthropic `budget_tokens`（已按 maxTokens 做 clamp）
 *
 * 协议约束：`budget_tokens` 必须 **< `max_tokens`**，否则服务端 400。
 * clamp 规则：`min(BUDGET[effort], max(1, maxTokens - 1))`
 * 若 clamp 结果 < 256 → 返回 null（放弃启用 thinking，降级为不传），避免打断对话。
 */
export function toAnthropicBudget(
  effort: ReasoningEffort,
  maxTokens: number | undefined
): number | null {
  const budget = ANTHROPIC_BUDGET[effort];
  const limit = Math.max(1, (maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS) - 1);
  const clamped = Math.min(budget, limit);
  if (clamped < ANTHROPIC_MIN_BUDGET_TOKENS) return null;
  return clamped;
}

/**
 * P0-3：判定某采样参数在该 Profile 上是否可下发
 *
 * - `topP`：OpenAI 兼容层 / Anthropic / WebLLM 均支持 → 恒 true
 * - `presencePenalty` / `frequencyPenalty`：仅 OpenAI 兼容层支持；
 *   Anthropic（协议无此字段）与 local（WebLLM 无此参数）静默丢弃
 */
export function supportsSamplingParam(
  profile: ApiProfile,
  param: 'topP' | 'presencePenalty' | 'frequencyPenalty'
): boolean {
  if (param === 'topP') return true;
  return profile.provider !== 'anthropic' && profile.provider !== 'local';
}

/**
 * 三档合并后的采样参数
 * 键恒存在（便于调用方解构），值为 number 或 undefined（undefined = 不传）
 */
export interface ResolvedSampling {
  topP: number | undefined;
  presencePenalty: number | undefined;
  frequencyPenalty: number | undefined;
}

/**
 * 把 `null` / 非有限值统一视为「未设置」
 */
function numOrUndefined(v: number | null | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * P0-3：三档合并 —— 角色级 ?? Profile 级 ?? 全局默认 ?? undefined（不传）
 *
 * 这是绕开 `profile.maxTokens` 死代码（角色级必填导致 Profile 值永不生效）的关键：
 * 新参数在**每一档都是可选**的，未设置即向下回落。
 */
export function resolveSampling(
  characterSampling: SamplingOverrides | null | undefined,
  profileSampling: SamplingOverrides | null | undefined,
  globalDefaults: SamplingOverrides | null | undefined
): ResolvedSampling {
  const pick = (key: keyof SamplingOverrides): number | undefined =>
    numOrUndefined(characterSampling?.[key]) ??
    numOrUndefined(profileSampling?.[key]) ??
    numOrUndefined(globalDefaults?.[key]);

  return {
    topP: pick('topP'),
    presencePenalty: pick('presencePenalty'),
    frequencyPenalty: pick('frequencyPenalty'),
  };
}
