import { describe, test, expect } from 'vitest';
import {
  validateCharacterCard,
  importV2Card,
  exportV2Card,
} from '@core/character-card';
import type { CharacterCard, CharacterAttributes } from '@core/character-card';
import { buildPrompt } from '@core/prompt-builder';
import type { PromptSettings } from '@core/prompt-builder';
import type { ChatMessage } from '@core/character-card';

// ── 测试夹具 ──

function makeAttributes(
  overrides: Partial<CharacterAttributes> = {}
): CharacterAttributes {
  return {
    profession: '法师',
    level: 5,
    experience: 1200,
    stats: [
      { name: '力量', value: '8', type: 'number' },
      { name: '智力', value: '18', type: 'number' },
      { name: '阵营', value: '守序善良', type: 'text' },
    ],
    ...overrides,
  };
}

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'test-id',
    name: 'Seraphina',
    description: '精灵法师',
    personality: '温柔',
    scenario: '',
    firstMessage: '你好',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-07-10T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PromptSettings> = {}): PromptSettings {
  return {
    systemPrompt: 'You are a roleplay assistant.',
    maxContextTokens: 8192,
    reservedTokens: 1024,
    userName: 'User',
    ...overrides,
  };
}

const emptyHistory: ChatMessage[] = [];

// ── F01.6 属性校验 ──

describe('角色属性校验 (F01.6)', () => {
  test('合法属性验证通过', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: makeAttributes(),
    } as Partial<CharacterCard>);
    expect(errors).toHaveLength(0);
  });

  test('无属性字段时验证通过（可选字段）', async () => {
    const errors = validateCharacterCard({ name: 'Test' } as Partial<CharacterCard>);
    expect(errors).toHaveLength(0);
  });

  test('职业超过30字符时验证失败', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: { profession: 'a'.repeat(31) },
    } as Partial<CharacterCard>);
    expect(errors).toContain('职业不能超过30个字符');
  });

  test('等级为负数时验证失败', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: { level: -1 },
    } as Partial<CharacterCard>);
    expect(errors).toContain('等级必须是非负整数');
  });

  test('等级为非整数时验证失败', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: { level: 1.5 },
    } as Partial<CharacterCard>);
    expect(errors).toContain('等级必须是非负整数');
  });

  test('经验值为负数时验证失败', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: { experience: -10 },
    } as Partial<CharacterCard>);
    expect(errors).toContain('经验值必须是非负整数');
  });

  test('属性名为空时验证失败', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: { stats: [{ name: '', value: '10', type: 'number' }] },
    } as Partial<CharacterCard>);
    expect(errors.some((e) => e.includes('属性名不能为空'))).toBe(true);
  });

  test('属性类型非法时验证失败', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: {
        stats: [{ name: '力量', value: '10', type: 'invalid' as 'number' }],
      },
    } as Partial<CharacterCard>);
    expect(errors.some((e) => e.includes('类型必须为'))).toBe(true);
  });

  test('属性名重复时验证失败', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: {
        stats: [
          { name: '力量', value: '10', type: 'number' },
          { name: '力量', value: '12', type: 'number' },
        ],
      },
    } as Partial<CharacterCard>);
    expect(errors.some((e) => e.includes('重复'))).toBe(true);
  });

  test('空字符串职业不触发长度校验', async () => {
    const errors = validateCharacterCard({
      name: 'Test',
      attributes: { profession: '' },
    } as Partial<CharacterCard>);
    expect(errors).toHaveLength(0);
  });
});

// ── F01.6 V2 导入 ──

describe('角色属性 V2 导入 (F01.6)', () => {
  test('从 data.extensions.attributes 导入完整属性', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        extensions: {
          attributes: {
            profession: '战士',
            level: 10,
            experience: 5000,
            stats: [
              { name: '力量', value: '15', type: 'number' },
              { name: '阵营', value: '中立', type: 'text' },
            ],
          },
        },
      },
    };

    const card = importV2Card(v2Json);
    expect(card.attributes).toBeDefined();
    expect(card.attributes!.profession).toBe('战士');
    expect(card.attributes!.level).toBe(10);
    expect(card.attributes!.experience).toBe(5000);
    expect(card.attributes!.stats).toHaveLength(2);
    expect(card.attributes!.stats![0]).toEqual({
      name: '力量',
      value: '15',
      type: 'number',
    });
  });

  test('无 extensions 字段时 attributes 为 undefined', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: 'Test' },
    };
    const card = importV2Card(v2Json);
    expect(card.attributes).toBeUndefined();
  });

  test('extensions 无 attributes 字段时 attributes 为 undefined', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: 'Test', extensions: { other: 'data' } },
    };
    const card = importV2Card(v2Json);
    expect(card.attributes).toBeUndefined();
  });

  test('非法 level（负数）被忽略', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        extensions: {
          attributes: { level: -5, profession: '法师' },
        },
      },
    };
    const card = importV2Card(v2Json);
    expect(card.attributes).toBeDefined();
    expect(card.attributes!.level).toBeUndefined();
    expect(card.attributes!.profession).toBe('法师');
  });

  test('非法 stats（空名）被过滤', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        extensions: {
          attributes: {
            stats: [
              { name: '', value: '10', type: 'number' },
              { name: '力量', value: '15', type: 'number' },
            ],
          },
        },
      },
    };
    const card = importV2Card(v2Json);
    expect(card.attributes!.stats).toHaveLength(1);
    expect(card.attributes!.stats![0].name).toBe('力量');
  });

  test('重复属性名只保留第一个', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        extensions: {
          attributes: {
            stats: [
              { name: '力量', value: '10', type: 'number' },
              { name: '力量', value: '20', type: 'number' },
            ],
          },
        },
      },
    };
    const card = importV2Card(v2Json);
    expect(card.attributes!.stats).toHaveLength(1);
    expect(card.attributes!.stats![0].value).toBe('10');
  });

  test('全空属性时 attributes 为 undefined', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        extensions: { attributes: {} },
      },
    };
    const card = importV2Card(v2Json);
    expect(card.attributes).toBeUndefined();
  });

  test('非法 type 被修正为 text', async () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        extensions: {
          attributes: {
            stats: [{ name: '力量', value: '10', type: 'invalid' }],
          },
        },
      },
    };
    const card = importV2Card(v2Json);
    expect(card.attributes!.stats![0].type).toBe('text');
  });
});

// ── F01.6 V2 导出 ──

describe('角色属性 V2 导出 (F01.6)', () => {
  test('导出时 attributes 写入 data.extensions.attributes', async () => {
    const card = makeCard({ attributes: makeAttributes() });
    const v2 = exportV2Card(card);
    const ext = v2.data.extensions as Record<string, unknown> | undefined;
    expect(ext).toBeDefined();
    expect(ext!.attributes).toBeDefined();
    const attrs = ext!.attributes as CharacterAttributes;
    expect(attrs.profession).toBe('法师');
    expect(attrs.level).toBe(5);
    expect(attrs.stats).toHaveLength(3);
  });

  test('无 attributes 时不写入 extensions', async () => {
    const card = makeCard();
    const v2 = exportV2Card(card);
    const ext = v2.data.extensions as Record<string, unknown> | undefined;
    expect(ext).toBeUndefined();
  });

  test('保留已有 extensions 字段并合并 attributes', async () => {
    const card = makeCard({
      attributes: { profession: '法师' },
      extensions: { customField: 'value' },
    } as Partial<CharacterCard>);
    const v2 = exportV2Card(card);
    const ext = v2.data.extensions as Record<string, unknown>;
    expect(ext.customField).toBe('value');
    expect(ext.attributes).toBeDefined();
  });
});

// ── F01.6 导入导出 Round-trip ──

describe('角色属性导入导出 Round-trip (F01.6)', () => {
  test('导出后导入能完整还原属性', async () => {
    const original = makeCard({ attributes: makeAttributes() });
    const v2 = exportV2Card(original);
    const reimported = importV2Card(v2);

    expect(reimported.attributes).toBeDefined();
    expect(reimported.attributes!.profession).toBe('法师');
    expect(reimported.attributes!.level).toBe(5);
    expect(reimported.attributes!.experience).toBe(1200);
    expect(reimported.attributes!.stats).toHaveLength(3);
    expect(reimported.attributes!.stats![2]).toEqual({
      name: '阵营',
      value: '守序善良',
      type: 'text',
    });
  });

  test('无属性的卡 round-trip 后仍无属性', async () => {
    const original = makeCard();
    const v2 = exportV2Card(original);
    const reimported = importV2Card(v2);
    expect(reimported.attributes).toBeUndefined();
  });
});

// ── F01.6 提示词注入 ──

describe('角色属性提示词注入 (F01.6)', () => {
  test('属性区块注入到系统提示词', async () => {
    const card = makeCard({ attributes: makeAttributes() });
    const result = await buildPrompt(card, emptyHistory, '你好', makeSettings());

    expect(result.messages[0].role).toBe('system');
    const content = result.messages[0].content;
    expect(content).toContain('[角色属性]');
    expect(content).toContain('职业：法师');
    expect(content).toContain('等级：5');
    expect(content).toContain('经验值：1200');
    expect(content).toContain('力量: 8');
    expect(content).toContain('智力: 18');
    expect(content).toContain('阵营: 守序善良');
  });

  test('无属性时不注入 [角色属性] 区块', async () => {
    const card = makeCard();
    const result = await buildPrompt(card, emptyHistory, '你好', makeSettings());
    expect(result.messages[0].content).not.toContain('[角色属性]');
  });

  test('仅职业时只注入职业行', async () => {
    const card = makeCard({
      attributes: { profession: '战士' },
    });
    const result = await buildPrompt(card, emptyHistory, '你好', makeSettings());
    const content = result.messages[0].content;
    expect(content).toContain('[角色属性]');
    expect(content).toContain('职业：战士');
    expect(content).not.toContain('等级：');
    expect(content).not.toContain('经验值：');
  });

  test('属性区块位于角色定义之后', async () => {
    const card = makeCard({
      description: '精灵法师',
      attributes: makeAttributes(),
    });
    const result = await buildPrompt(card, emptyHistory, '你好', makeSettings());
    const content = result.messages[0].content;
    const descIdx = content.indexOf('精灵法师');
    const attrIdx = content.indexOf('[角色属性]');
    expect(descIdx).toBeGreaterThan(-1);
    expect(attrIdx).toBeGreaterThan(descIdx);
  });
});
