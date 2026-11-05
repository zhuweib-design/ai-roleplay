/**
 * 切换供应商时的预填规则（C-01 零配置首聊）
 *
 * 现场缺陷：新建配置的初值是 OpenAI（端点 api.openai.com、模型 gpt-4o），
 * 用户切到 Anthropic 时两者都不跟着换，点"测试连接"必然失败，且界面上看不出哪一步错了。
 * 规则只有一条边界：**手填过的不动，没动过的跟着换**。
 */
import { describe, it, expect } from 'vitest';
import { resolveProviderDefaults, type ProviderPreset } from '@/composables/useModelProfileForm';

const openai: ProviderPreset = { value: 'openai', defaultBaseUrl: 'https://api.openai.com', defaultModel: 'gpt-4o' };
const anthropic: ProviderPreset = { value: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-5' };
const custom: ProviderPreset = { value: 'custom', defaultBaseUrl: '', defaultModel: '' };

describe('resolveProviderDefaults', () => {
  it('端点与模型都还是上一家的默认值 → 两个都跟着换', () => {
    expect(
      resolveProviderDefaults(
        { baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
        openai,
        anthropic
      )
    ).toEqual({ baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' });
  });

  it('留空也算没动过 → 补上新家的值', () => {
    expect(resolveProviderDefaults({ baseUrl: '  ', model: '' }, custom, anthropic)).toEqual({
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    });
  });

  it('用户手填过的端点和模型一律不动（自建反代不能被覆盖）', () => {
    expect(
      resolveProviderDefaults(
        { baseUrl: 'https://my-proxy.example/v1', model: 'my-model' },
        openai,
        anthropic
      )
    ).toEqual({});
  });

  it('只改了一半：端点手填、模型没动 → 只换模型', () => {
    expect(
      resolveProviderDefaults({ baseUrl: 'https://my-proxy.example/v1', model: 'gpt-4o' }, openai, anthropic)
    ).toEqual({ model: 'claude-sonnet-4-5' });
  });

  it('切到"自定义"时把上一家的默认端点清空，而不是留着让人以为已填好', () => {
    expect(
      resolveProviderDefaults({ baseUrl: 'https://api.openai.com', model: 'gpt-4o' }, openai, custom)
    ).toEqual({ baseUrl: '', model: '' });
  });

  it('同值不产生变更（避免无谓地触发输入框更新）', () => {
    expect(resolveProviderDefaults({ baseUrl: 'https://api.openai.com', model: 'gpt-4o' }, openai, openai)).toEqual({});
  });

  it('拿不到上一家的预设（首次进入、旧数据）时，只补空值，不覆盖任何已填内容', () => {
    expect(resolveProviderDefaults({ baseUrl: 'https://x.test', model: 'm' }, undefined, anthropic)).toEqual({});
    expect(resolveProviderDefaults({ baseUrl: '', model: '' }, undefined, anthropic)).toEqual({
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    });
  });
});
