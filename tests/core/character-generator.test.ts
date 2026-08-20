import { describe, test, expect } from 'vitest';
import {
  CHARACTER_TEMPLATES,
  getTemplateMeta,
  generateSeed,
  buildGenerationMessages,
  parseGeneratedCharacter,
  type CharacterTemplateId,
} from '@core/character-generator';

// ── 模板定义 ──

describe('生成模板定义 (F01.7)', () => {
  test('预设 4 个模板（奇幻/科幻/现代/末日）', () => {
    expect(CHARACTER_TEMPLATES).toHaveLength(4);
    const ids = CHARACTER_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(['fantasy', 'scifi', 'modern', 'postapoc']);
  });

  test('每个模板有 label、description、sampleStats', () => {
    for (const tpl of CHARACTER_TEMPLATES) {
      expect(tpl.label).toBeTruthy();
      expect(tpl.description.length).toBeGreaterThan(5);
      expect(tpl.sampleStats.length).toBeGreaterThan(0);
      for (const s of tpl.sampleStats) {
        expect(s.name).toBeTruthy();
        expect(s.type === 'number' || s.type === 'text').toBe(true);
      }
    }
  });

  test('getTemplateMeta 根据 id 返回模板', () => {
    const meta = getTemplateMeta('fantasy');
    expect(meta).toBeDefined();
    expect(meta!.label).toBe('奇幻');
  });

  test('getTemplateMeta 非法 id 返回 undefined', () => {
    expect(getTemplateMeta('nonexistent' as CharacterTemplateId)).toBeUndefined();
  });
});

// ── 随机种子 ──

describe('随机种子生成 (F01.7)', () => {
  test('生成 8 位字符串', () => {
    const seed = generateSeed();
    expect(typeof seed).toBe('string');
    expect(seed.length).toBeLessThanOrEqual(8);
    expect(seed.length).toBeGreaterThan(0);
  });

  test('多次生成的种子不同（概率极高）', () => {
    const seeds = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seeds.add(generateSeed());
    }
    // 100 个种子中应有至少 95 个不同（允许极少数碰撞）
    expect(seeds.size).toBeGreaterThan(95);
  });
});

// ── Prompt 构建 ──

describe('生成 Prompt 构建 (F01.7)', () => {
  test('返回 system + user 两条消息', () => {
    const messages = buildGenerationMessages('fantasy', 'abc12345');
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
  });

  test('系统消息定义角色创作助手', () => {
    const messages = buildGenerationMessages('fantasy', 'abc12345');
    expect(messages[0]!.content).toContain('角色创作助手');
    expect(messages[0]!.content).toContain('JSON');
  });

  test('用户消息包含模板标签', () => {
    const messages = buildGenerationMessages('scifi', 'seed123');
    expect(messages[1]!.content).toContain('科幻');
  });

  test('用户消息包含随机种子', () => {
    const messages = buildGenerationMessages('modern', 'myseed99');
    expect(messages[1]!.content).toContain('myseed99');
  });

  test('用户消息要求纯 JSON 返回', () => {
    const messages = buildGenerationMessages('fantasy', 'abc12345');
    expect(messages[1]!.content).toContain('JSON');
    expect(messages[1]!.content).toContain('不要');
  });

  test('不同模板生成不同的 stats 示例', () => {
    const fantasy = buildGenerationMessages('fantasy', 'seed');
    const postapoc = buildGenerationMessages('postapoc', 'seed');
    // 奇幻模板应包含"力量"，末日模板应包含"生存"
    expect(fantasy[1]!.content).toContain('力量');
    expect(postapoc[1]!.content).toContain('生存');
  });
});

// ── 解析：合法输入 ──

describe('生成结果解析 - 合法输入 (F01.7)', () => {
  const validJson = JSON.stringify({
    name: '艾莉娅',
    description: '一位银发精灵法师，守护古老森林。',
    personality: '温柔但内心坚韧，对朋友忠诚。',
    scenario: '勇者在森林中遭遇野兽袭击',
    firstMessage: '*你猛然醒来* "你终于醒了。"',
    tags: ['奇幻', '法师', '精灵'],
    attributes: {
      profession: '法师',
      level: 5,
      experience: 1200,
      stats: [
        { name: '力量', value: '8', type: 'number' },
        { name: '智力', value: '18', type: 'number' },
      ],
    },
  });

  test('解析纯 JSON 字符串', () => {
    const result = parseGeneratedCharacter(validJson);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('艾莉娅');
    expect(result!.description).toContain('银发精灵');
    expect(result!.tags).toEqual(['奇幻', '法师', '精灵']);
  });

  test('解析 ```json 代码块包裹', () => {
    const wrapped = '```json\n' + validJson + '\n```';
    const result = parseGeneratedCharacter(wrapped);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('艾莉娅');
  });

  test('解析 ``` 代码块包裹（无 json 标记）', () => {
    const wrapped = '```\n' + validJson + '\n```';
    const result = parseGeneratedCharacter(wrapped);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('艾莉娅');
  });

  test('解析前后有非 JSON 文本', () => {
    const withPrefix = '好的，这是生成的角色：\n' + validJson + '\n希望你喜欢！';
    const result = parseGeneratedCharacter(withPrefix);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('艾莉娅');
  });

  test('解析属性字段', () => {
    const result = parseGeneratedCharacter(validJson);
    expect(result!.attributes).toBeDefined();
    expect(result!.attributes!.profession).toBe('法师');
    expect(result!.attributes!.level).toBe(5);
    expect(result!.attributes!.experience).toBe(1200);
    expect(result!.attributes!.stats).toHaveLength(2);
  });

  test('first_mes 字段名兼容', () => {
    const json = JSON.stringify({
      name: 'Test',
      first_mes: '首消息内容',
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.firstMessage).toBe('首消息内容');
  });

  test('数值类型的 level 字符串形式能解析', () => {
    const json = JSON.stringify({
      name: 'Test',
      attributes: { level: '10', experience: '500' },
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.attributes!.level).toBe(10);
    expect(result!.attributes!.experience).toBe(500);
  });

  test('数值类型的 value 字段转字符串', () => {
    const json = JSON.stringify({
      name: 'Test',
      attributes: {
        stats: [{ name: '力量', value: 15, type: 'number' }],
      },
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.attributes!.stats![0]!.value).toBe('15');
  });
});

// ── 解析：边界与非法输入 ──

describe('生成结果解析 - 边界处理 (F01.7)', () => {
  test('空字符串返回 null', () => {
    expect(parseGeneratedCharacter('')).toBeNull();
  });

  test('null/undefined 返回 null', () => {
    expect(parseGeneratedCharacter(null as unknown as string)).toBeNull();
    expect(parseGeneratedCharacter(undefined as unknown as string)).toBeNull();
  });

  test('非 JSON 文本返回 null', () => {
    expect(parseGeneratedCharacter('这不是 JSON')).toBeNull();
  });

  test('JSON 缺失 name 字段返回 null', () => {
    const json = JSON.stringify({ description: '无名称' });
    expect(parseGeneratedCharacter(json)).toBeNull();
  });

  test('name 为空字符串返回 null', () => {
    const json = JSON.stringify({ name: '' });
    expect(parseGeneratedCharacter(json)).toBeNull();
  });

  test('name 为空白字符串返回 null', () => {
    const json = JSON.stringify({ name: '   ' });
    expect(parseGeneratedCharacter(json)).toBeNull();
  });

  test('缺失可选字段使用默认值', () => {
    const json = JSON.stringify({ name: 'Test' });
    const result = parseGeneratedCharacter(json);
    expect(result!.description).toBe('');
    expect(result!.personality).toBe('');
    expect(result!.scenario).toBe('');
    expect(result!.firstMessage).toBe('');
    expect(result!.tags).toEqual([]);
    expect(result!.attributes).toBeUndefined();
  });

  test('tags 非数组时返回空数组', () => {
    const json = JSON.stringify({ name: 'Test', tags: 'notarray' });
    const result = parseGeneratedCharacter(json);
    expect(result!.tags).toEqual([]);
  });

  test('tags 含非字符串元素被过滤', () => {
    const json = JSON.stringify({
      name: 'Test',
      tags: ['合法', 123, null, '也合法'],
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.tags).toEqual(['合法', '也合法']);
  });

  test('非法 type 被修正为 text', () => {
    const json = JSON.stringify({
      name: 'Test',
      attributes: {
        stats: [{ name: '力量', value: '10', type: 'invalid' }],
      },
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.attributes!.stats![0]!.type).toBe('text');
  });

  test('非法 level（字符串非数字）被忽略', () => {
    const json = JSON.stringify({
      name: 'Test',
      attributes: { level: 'abc' },
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.attributes).toBeDefined();
    expect(result!.attributes!.level).toBeUndefined();
  });

  test('重复属性名只保留第一个', () => {
    const json = JSON.stringify({
      name: 'Test',
      attributes: {
        stats: [
          { name: '力量', value: '10', type: 'number' },
          { name: '力量', value: '20', type: 'number' },
        ],
      },
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.attributes!.stats).toHaveLength(1);
    expect(result!.attributes!.stats![0]!.value).toBe('10');
  });

  test('全空属性返回 undefined', () => {
    const json = JSON.stringify({
      name: 'Test',
      attributes: {},
    });
    const result = parseGeneratedCharacter(json);
    expect(result!.attributes).toBeUndefined();
  });

  test('多个 ```json 代码块取第一个', () => {
    const json1 = JSON.stringify({ name: '第一个' });
    const json2 = JSON.stringify({ name: '第二个' });
    const wrapped = '```\n' + json1 + '\n```\n说明文字\n```\n' + json2 + '\n```';
    const result = parseGeneratedCharacter(wrapped);
    expect(result!.name).toBe('第一个');
  });
});
