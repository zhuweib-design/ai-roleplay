import { describe, it, expect } from 'vitest';
import {
  resolveReasoningCapability,
  toAnthropicBudget,
  supportsSamplingParam,
  resolveSampling,
  matchesReasoningModelPattern,
  REASONING_MODEL_RE,
  ANTHROPIC_THINKING_CONFLICT_PARAMS,
  ANTHROPIC_MIN_BUDGET_TOKENS,
} from '../../src/api/reasoning-capability';
import type { ApiProfile } from '@/types';

function makeProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'p1',
    name: 'Test',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    ...overrides,
  };
}

describe('reasoning-capability — resolveReasoningCapability', () => {
  it('local（WebLLM 硬边界）→ none', () => {
    expect(resolveReasoningCapability(makeProfile({ provider: 'local' }))).toBe('none');
  });

  it('anthropic + reasoningSupport=on → anthropic-budget', () => {
    expect(
      resolveReasoningCapability(
        makeProfile({ provider: 'anthropic', reasoningSupport: 'on' })
      )
    ).toBe('anthropic-budget');
  });

  it('openai + 模型 deepseek-r1（auto）→ openai-effort', () => {
    expect(
      resolveReasoningCapability(makeProfile({ provider: 'openai', model: 'deepseek-r1' }))
    ).toBe('openai-effort');
  });

  it('openai + 模型 gpt-4o（auto，未命中正则）→ 仍为 openai-effort（正则不隐藏控件）', () => {
    // 决策：正则只作提示依据，不作隐藏依据，避免功能对大多数用户不可见
    expect(
      resolveReasoningCapability(makeProfile({ provider: 'openai', model: 'gpt-4o' }))
    ).toBe('openai-effort');
  });

  it('explicit off 强制 none（优先于启发式）', () => {
    expect(
      resolveReasoningCapability(
        makeProfile({ provider: 'anthropic', reasoningSupport: 'off' })
      )
    ).toBe('none');
    expect(
      resolveReasoningCapability(
        makeProfile({ provider: 'openai', model: 'o1', reasoningSupport: 'off' })
      )
    ).toBe('none');
  });

  it('explicit on 强制可下发（优先于硬边界之外的启发式）', () => {
    expect(
      resolveReasoningCapability(makeProfile({ provider: 'custom', reasoningSupport: 'on' }))
    ).toBe('openai-effort');
  });

  it('deepseek / custom provider → openai-effort', () => {
    expect(resolveReasoningCapability(makeProfile({ provider: 'deepseek' }))).toBe('openai-effort');
    expect(resolveReasoningCapability(makeProfile({ provider: 'custom' }))).toBe('openai-effort');
  });
});

describe('reasoning-capability — toAnthropicBudget', () => {
  it('high + maxTokens=2048 → clamp 到 2047（budget 必须 < max_tokens）', () => {
    expect(toAnthropicBudget('high', 2048)).toBe(2047);
  });

  it('low + maxTokens=128 → null（clamp 后 < 256，放弃启用）', () => {
    expect(toAnthropicBudget('low', 128)).toBeNull();
  });

  it('low / medium / high 的基准档位', () => {
    expect(toAnthropicBudget('low', 8192)).toBe(1024);
    expect(toAnthropicBudget('medium', 8192)).toBe(4096);
    expect(toAnthropicBudget('high', 32768)).toBe(16384);
  });

  it('maxTokens 未指定时按默认 4096 兜底', () => {
    // medium 基准 4096 > 4096-1=4095 → clamp 到 4095
    expect(toAnthropicBudget('medium', undefined)).toBe(4095);
  });

  it('clamp 结果低于下限（256）时返回 null —— 放弃启用而非触发协议 400', () => {
    // maxTokens=256 → limit=255 → clamped=255 < 256
    expect(toAnthropicBudget('low', ANTHROPIC_MIN_BUDGET_TOKENS)).toBeNull();
    // maxTokens=257 → limit=256 → clamped=256，刚好达到下限
    expect(toAnthropicBudget('low', ANTHROPIC_MIN_BUDGET_TOKENS + 1)).toBe(
      ANTHROPIC_MIN_BUDGET_TOKENS
    );
  });
});

describe('reasoning-capability — supportsSamplingParam', () => {
  it('topP 对所有 provider 均支持', () => {
    for (const provider of ['openai', 'anthropic', 'custom', 'deepseek', 'local'] as const) {
      expect(supportsSamplingParam(makeProfile({ provider }), 'topP')).toBe(true);
    }
  });

  it('presence/frequency penalty 仅 OpenAI 兼容层支持', () => {
    expect(supportsSamplingParam(makeProfile({ provider: 'openai' }), 'presencePenalty')).toBe(true);
    expect(supportsSamplingParam(makeProfile({ provider: 'openai' }), 'frequencyPenalty')).toBe(true);
    expect(supportsSamplingParam(makeProfile({ provider: 'custom' }), 'presencePenalty')).toBe(true);
    expect(supportsSamplingParam(makeProfile({ provider: 'deepseek' }), 'frequencyPenalty')).toBe(true);
  });

  it('anthropic / local 不支持 presence/frequency penalty', () => {
    expect(supportsSamplingParam(makeProfile({ provider: 'anthropic' }), 'presencePenalty')).toBe(false);
    expect(supportsSamplingParam(makeProfile({ provider: 'anthropic' }), 'frequencyPenalty')).toBe(false);
    expect(supportsSamplingParam(makeProfile({ provider: 'local' }), 'presencePenalty')).toBe(false);
    expect(supportsSamplingParam(makeProfile({ provider: 'local' }), 'frequencyPenalty')).toBe(false);
  });
});

describe('reasoning-capability — resolveSampling（三档合并）', () => {
  it('角色级优先于 Profile 级与全局默认', () => {
    const r = resolveSampling({ topP: 0.1 }, { topP: 0.5 }, { topP: 0.9 });
    expect(r.topP).toBe(0.1);
  });

  it('角色级未设置时回落到 Profile 级', () => {
    const r = resolveSampling({ topP: null }, { topP: 0.5 }, { topP: 0.9 });
    expect(r.topP).toBe(0.5);
  });

  it('Profile 级未设置时回落到全局默认', () => {
    const r = resolveSampling(null, { topP: null }, { topP: 0.9 });
    expect(r.topP).toBe(0.9);
  });

  it('三档都未设置时为 undefined（= 不传 = 供应商默认）', () => {
    const r = resolveSampling(null, null, null);
    expect(r).toEqual({
      topP: undefined,
      presencePenalty: undefined,
      frequencyPenalty: undefined,
    });
  });

  it('绝不用 0 表示未设置：0 是合法值，应被保留', () => {
    const r = resolveSampling({ topP: 0, frequencyPenalty: 0 }, null, null);
    expect(r.topP).toBe(0);
    expect(r.frequencyPenalty).toBe(0);
    expect(r.presencePenalty).toBeUndefined();
  });

  it('逐字段独立回落（不同字段可来自不同档）', () => {
    const r = resolveSampling(
      { topP: 0.2 },
      { presencePenalty: 0.3 },
      { frequencyPenalty: 0.4 }
    );
    expect(r).toEqual({ topP: 0.2, presencePenalty: 0.3, frequencyPenalty: 0.4 });
  });

  it('非有限值（NaN）按未设置处理', () => {
    const r = resolveSampling({ topP: Number.NaN }, { topP: 0.5 }, null);
    expect(r.topP).toBe(0.5);
  });
});

describe('reasoning-capability — 启发式正则与抑制清单', () => {
  it('REASONING_MODEL_RE 命中已知推理模型', () => {
    for (const m of ['o1', 'o3-mini', 'gpt-5', 'deepseek-r1', 'QwQ-32B', 'qwen3-8b', 'glm-4.5-air', 'deepseek-reasoner', 'kimi-thinking']) {
      expect(matchesReasoningModelPattern(m)).toBe(true);
    }
  });

  it('REASONING_MODEL_RE 未命中普通模型（仅提示，不隐藏控件）', () => {
    expect(matchesReasoningModelPattern('gpt-4o')).toBe(false);
    expect(matchesReasoningModelPattern('claude-3-5-sonnet')).toBe(false);
  });

  it('模型名为空/未定义时按未命中处理', () => {
    expect(matchesReasoningModelPattern('')).toBe(false);
    expect(matchesReasoningModelPattern(undefined)).toBe(false);
  });

  it('正则带 i 标志（大小写不敏感）', () => {
    expect(REASONING_MODEL_RE.flags).toContain('i');
  });

  it('Anthropic 抑制清单含 temperature 与 top_p（写成常量便于随文档调整）', () => {
    expect(ANTHROPIC_THINKING_CONFLICT_PARAMS).toContain('temperature');
    expect(ANTHROPIC_THINKING_CONFLICT_PARAMS).toContain('top_p');
  });
});
