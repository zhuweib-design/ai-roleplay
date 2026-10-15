/**
 * 心理活动（旁白段）的核心行为（OPT_PLAN_2026-10-15 专项 C）
 *
 * 覆盖四件事，每件都配一条"改坏了会红"的对照：
 * 1. `⟦…⟧` 的分段解析（含模型不守规矩时的三种畸形输入）；
 * 2. 去标记（复制/朗读/翻译/导出共用，漏一处就把裸符号交给用户）；
 * 3. 提示词规则段：两种视角各含哪条人称约束；
 * 4. 设置项：默认 'me'、脏值回落、未显式给视角时**不注入**规则。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import {
  parseNarrationSegments,
  stripNarrationMarkers,
  buildNarrationRules,
  normalizeNarrationPerspective,
  NARRATION_OPEN,
  NARRATION_CLOSE,
} from '@/core/narration';
import { buildPrompt } from '@/core/prompt-builder';
import { useSettingsStore } from '@/stores/settings';
import type { CharacterCard } from '@/core/character-card';

const seg = (text: string) => parseNarrationSegments(text).map((s) => `${s.kind}:${s.text}`);

describe('旁白分段解析', () => {
  it('对白—心理—对白 切成三段，顺序与归属都由标记决定', () => {
    expect(seg(`你先坐。\n${NARRATION_OPEN}她有点紧张的看着我。${NARRATION_CLOSE}\n水刚烧上。`)).toEqual([
      'speech:你先坐。\n',
      'psy:她有点紧张的看着我。',
      'speech:\n水刚烧上。',
    ]);
  });

  it('负向对照：没有标记时整条就是一段对白（与改造前完全一致）', () => {
    expect(seg('一整段没有任何标记的回复')).toEqual(['speech:一整段没有任何标记的回复']);
  });

  it('负向对照：心理放在开头或结尾仍按标记判类型（不是靠位置猜）', () => {
    expect(seg(`${NARRATION_OPEN}先想后说。${NARRATION_CLOSE}原来如此。`)).toEqual([
      'psy:先想后说。',
      'speech:原来如此。',
    ]);
    expect(seg(`说了。${NARRATION_OPEN}末尾才想${NARRATION_CLOSE}`)).toEqual([
      'speech:说了。',
      'psy:末尾才想',
    ]);
  });

  it('只开不闭（输出被截断）时尾巴归心理，文字不丢', () => {
    expect(seg(`开场白${NARRATION_OPEN}写到一半被截断`)).toEqual([
      'speech:开场白',
      'psy:写到一半被截断',
    ]);
  });

  it('落单的闭符号当普通字符丢掉，不改变归属', () => {
    expect(seg(`前半${NARRATION_CLOSE}后半`)).toEqual(['speech:前半后半']);
  });

  it('空输入不抛错、不产出空段', () => {
    expect(parseNarrationSegments('')).toEqual([]);
  });

  it('单字符标记 ⇒ 流式不存在半个标签：每个前缀都能解析且文字不丢', () => {
    const full = `你先坐。\n${NARRATION_OPEN}她有点紧张的看着我。${NARRATION_CLOSE}\n水刚烧上。`;
    let acc = '';
    for (const ch of full) {
      acc += ch;
      const parts = parseNarrationSegments(acc);
      expect(parts.length).toBeGreaterThanOrEqual(1);
      // 每个中间态：分段拼回去 == 去掉标记的原文（一字不丢、不吞不换序）
      expect(parts.map((p) => p.text).join('')).toBe(stripNarrationMarkers(acc));
    }
  });
});

describe('去标记（复制 / 朗读 / 翻译 / 导出用的文本形态）', () => {
  it('去掉成对符号但保留心理段文字', () => {
    expect(stripNarrationMarkers(`a\n${NARRATION_OPEN}b${NARRATION_CLOSE}\nc`)).toBe('a\nb\nc');
  });

  it('负向对照：没有标记的文本原样返回（不吞字、不改动换行）', () => {
    const plain = '第一行\n第二行\n\n第三行';
    expect(stripNarrationMarkers(plain)).toBe(plain);
  });
});

describe('提示词规则段', () => {
  it("「我」视角：用户是「我」，且明令角色在旁白里不得自称我", () => {
    const r = buildNarrationRules('me', '沈知微');
    expect(r).toContain('「我」指用户');
    expect(r).toContain('不得自称「我」');
    expect(r).toContain(`${NARRATION_OPEN}沈知微有点紧张的看着我`);
    // 反例必须在：模型对反例比对的更敏感
    expect(r).toContain('反例');
    expect(r).toContain(`${NARRATION_OPEN}我有点紧张的看着他。${NARRATION_CLOSE}`);
  });

  it("「你」视角：用户是「你」，示例与反例同步换人称", () => {
    const r = buildNarrationRules('you', '沈知微');
    expect(r).toContain('「你」指用户');
    expect(r).toContain(`${NARRATION_OPEN}沈知微有点紧张的看着你`);
    expect(r).toContain(`${NARRATION_OPEN}我有点紧张的看着你。${NARRATION_CLOSE}`);
  });

  it('两种视角的差别只在指代用户的代词上，其余约束逐条相同', () => {
    const a = buildNarrationRules('me', '沈知微').split('\n');
    const b = buildNarrationRules('you', '沈知微').split('\n');
    expect(a).toHaveLength(b.length);
    const diff = a.filter((line, i) => line !== b[i]);
    // 4 行差异：视角说明 / 不得描写用户心理 / 示例 / 反例 —— 全部含「我」或「你」
    expect(diff.length).toBeLessThanOrEqual(4);
    for (const line of diff) expect(line).toMatch(/[我你]/);
    // 关键约束行必须两边都在
    for (const r of [a.join('\n'), b.join('\n')]) {
      expect(r).toContain('旁白里提到你自己时一律用名字');
      expect(r).toContain('标记之外的对白里，你可以照常自称「我」');
      expect(r).toContain('1 到 3 句');
    }
  });
});

describe('设置项与注入开关', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("默认视角是「我」，脏值归一回默认", () => {
    const settings = useSettingsStore();
    expect(settings.narrationPerspective).toBe('me');
    settings.setNarrationPerspective('you');
    expect(settings.narrationPerspective).toBe('you');
    settings.setNarrationPerspective('nonsense');
    expect(settings.narrationPerspective).toBe('me');
    expect(normalizeNarrationPerspective(undefined)).toBe('me');
  });

  const card = {
    name: '沈知微',
    description: '测试角色',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    messages: [],
  } as unknown as CharacterCard;

  const baseSettings = {
    systemPrompt: '',
    maxContextTokens: 8192,
    reservedTokens: 1024,
    userName: '访客',
  };

  it('给了视角才注入叙事格式段；没给视角时系统段与改造前一致', async () => {
    const withMe = await buildPrompt(card, [], '你好', {
      ...baseSettings,
      narrationPerspective: 'me',
    });
    expect(withMe.messages[0]!.content).toContain('[叙事格式]');
    expect(withMe.messages[0]!.content).toContain('「我」指用户');

    const without = await buildPrompt(card, [], '你好', { ...baseSettings });
    expect(without.messages[0]!.content).not.toContain('[叙事格式]');
  });

  it('切换设置项会换掉系统段里指代用户的代词', async () => {
    const asMe = await buildPrompt(card, [], '你好', {
      ...baseSettings,
      narrationPerspective: 'me',
    });
    const asYou = await buildPrompt(card, [], '你好', {
      ...baseSettings,
      narrationPerspective: 'you',
    });
    expect(asMe.messages[0]!.content).toContain('「我」指用户');
    expect(asYou.messages[0]!.content).toContain('「你」指用户');
    expect(asYou.messages[0]!.content).not.toContain('「我」指用户');
  });

  it('规则段落在系统提示**末尾**（越靠末尾影响越大）', async () => {
    const built = await buildPrompt(card, [], '你好', {
      ...baseSettings,
      narrationPerspective: 'me',
    });
    const content = built.messages[0]!.content;
    expect(content.indexOf('[叙事格式]')).toBeGreaterThan(content.indexOf('沈知微'));
    expect(content.trimEnd().endsWith('。') || content.includes('反例')).toBe(true);
  });
});
