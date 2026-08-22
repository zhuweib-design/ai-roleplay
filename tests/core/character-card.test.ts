import { describe, test, expect } from 'vitest';
import { validateCharacterCard, importV2Card, exportV2Card } from '@core/character-card';
import type { CharacterCard } from '@core/character-card';

describe('角色卡验证 (F01.1)', () => {
  test('角色名为空时验证失败', () => {
    const errors = validateCharacterCard({ name: '' } as Partial<CharacterCard>);
    expect(errors).toContain('角色名不能为空');
  });

  test('角色名超过50字符时验证失败', () => {
    const longName = 'a'.repeat(51);
    const errors = validateCharacterCard({ name: longName } as Partial<CharacterCard>);
    expect(errors).toContain('角色名不能超过50个字符');
  });

  test('有效角色卡验证通过', () => {
    const card: Partial<CharacterCard> = {
      name: 'Seraphina',
      description: '精灵法师',
      personality: '温柔',
      firstMessage: '你好',
    };
    const errors = validateCharacterCard(card);
    expect(errors).toHaveLength(0);
  });

  test('健谈度超出0-100范围时验证失败', () => {
    const errors = validateCharacterCard({ name: 'Test', talkativeness: 150 } as Partial<CharacterCard>);
    expect(errors).toContain('健谈度必须在0-100之间');
  });
});

describe('角色卡 V2 导入 (F01.2)', () => {
  test('导入合法的 V2 JSON 角色卡', () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Seraphina',
        description: '一位守护森林的精灵法师',
        personality: '温柔但内心坚韧',
        scenario: '{{user}} 在森林中遭遇野兽袭击',
        first_mes: '*你猛然醒来* "啊，你终于醒了。"',
        alternate_greetings: ['*另一个开场*'],
        mes_example: '<START>\n{{user}}: 你好\n{{char}}: 你好呀',
        creator_notes: '测试角色',
        system_prompt: '',
        tags: ['奇幻', '温柔'],
        avatar: 'none',
      },
    };

    const card = importV2Card(v2Json);
    expect(card.name).toBe('Seraphina');
    expect(card.description).toBe('一位守护森林的精灵法师');
    expect(card.firstMessage).toBe('*你猛然醒来* "啊，你终于醒了。"');
    expect(card.alternateGreetings).toEqual(['*另一个开场*']);
    expect(card.tags).toEqual(['奇幻', '温柔']);
    expect(card.id).toBeDefined();
  });

  test('spec 字段不是 chara_card_v2 时抛出错误', () => {
    const invalidJson = { spec: 'unknown', data: { name: 'Test' } };
    expect(() => importV2Card(invalidJson)).toThrow('无法识别的角色卡格式');
  });

  test('V2 缺失字段使用默认值填充', () => {
    const partialV2 = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: 'Minimal' },
    };
    const card = importV2Card(partialV2);
    expect(card.name).toBe('Minimal');
    expect(card.description).toBe('');
    expect(card.firstMessage).toBe('');
    expect(card.alternateGreetings).toEqual([]);
    expect(card.talkativeness).toBe(50);
  });

  test('V2 未知字段保留不丢弃', () => {
    const v2WithExtra = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        custom_field: '保留这个字段',
        another_unknown: 42,
      },
    };
    const card = importV2Card(v2WithExtra);
    const cardAny = card as unknown as Record<string, unknown>;
    expect(cardAny.custom_field).toBe('保留这个字段');
    expect(cardAny.another_unknown).toBe(42);
  });

  test('忽略 __proto__ 键防原型污染（P2-5）', () => {
    // JSON.parse 构造真实的自有 __proto__ 键（对象字面量语法会设置原型而非建键）
    const malicious = JSON.parse(
      '{"spec":"chara_card_v2","spec_version":"2.0",' +
        '"data":{"name":"Safe","description":"","personality":"","scenario":"",' +
        '"first_mes":"","mes_example":"","__proto__":{"polluted":true}}}'
    );
    const card = importV2Card(malicious);
    const cardAny = card as unknown as Record<string, unknown>;
    expect(cardAny.polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(card, 'polluted')).toBe(false);
    const protoAny = {} as unknown as Record<string, unknown>;
    expect(protoAny.polluted).toBeUndefined();
  });
});

describe('角色卡 V2 导出 (F01.3)', () => {
  test('导出为 V2 格式包含 spec 字段', () => {
    const card: CharacterCard = {
      id: 'test-id',
      name: 'Seraphina',
      description: '精灵法师',
      personality: '温柔',
      scenario: '森林',
      firstMessage: '你好',
      alternateGreetings: [],
      exampleMessages: '',
      characterNote: null,
      talkativeness: 50,
      tags: ['奇幻'],
      favorite: false,
      version: '1.0',
      createdAt: '2026-07-10T00:00:00Z',
      updatedAt: '2026-07-10T00:00:00Z',
    };

    const exported = exportV2Card(card);
    expect(exported.spec).toBe('chara_card_v2');
    expect(exported.spec_version).toBe('2.0');
    expect(exported.data.name).toBe('Seraphina');
    expect(exported.data.description).toBe('精灵法师');
    expect(exported.data.first_mes).toBe('你好');
  });
});

describe('角色卡导入运行时验证 (C-01)', () => {
  test('传入 null 抛出明确错误', () => {
    expect(() => importV2Card(null)).toThrow('无法识别的角色卡格式');
  });

  test('传入非对象抛出明确错误', () => {
    expect(() => importV2Card('not an object')).toThrow('无法识别的角色卡格式');
  });

  test('data 字段为 null 抛出明确错误', () => {
    expect(() => importV2Card({ spec: 'chara_card_v2', data: null })).toThrow();
  });

  test('data 字段为字符串抛出明确错误', () => {
    expect(() => importV2Card({ spec: 'chara_card_v2', data: 'invalid' })).toThrow();
  });

  test('alternate_greetings 为字符串而非数组时安全处理', () => {
    const malformedJson = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        alternate_greetings: '不是数组',
      },
    };
    const card = importV2Card(malformedJson);
    expect(Array.isArray(card.alternateGreetings)).toBe(true);
  });

  test('tags 为数字而非数组时安全处理', () => {
    const malformedJson = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Test',
        tags: 123,
      },
    };
    const card = importV2Card(malformedJson);
    expect(Array.isArray(card.tags)).toBe(true);
  });

  test('name 为非字符串时安全转换为空字符串', () => {
    const malformedJson = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 12345,
      },
    };
    const card = importV2Card(malformedJson);
    expect(card.name).toBe('');
  });
});

describe('角色卡 ID 生成 (C-04)', () => {
  test('生成的 ID 符合 UUID v4 格式', () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: 'Test' },
    };
    const card = importV2Card(v2Json);
    // UUID v4 格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(card.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('连续导入多个角色卡 ID 不碰撞', () => {
    const v2Json = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: 'Test' },
    };
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const card = importV2Card(v2Json);
      ids.add(card.id);
    }
    expect(ids.size).toBe(100);
  });
});
