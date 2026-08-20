/**
 * world-generator 单元测试 (迭代27 · F06.8)
 *
 * 覆盖：
 * - WORLD_TEMPLATES 模板定义
 * - getWorldTemplateMeta / templateIdToWorldType
 * - generateWorldSeed
 * - buildWorldGenerationMessages（创建模式 Prompt）
 * - buildWorldExtendMessages（扩展模式 Prompt）
 * - parseGeneratedWorld（容错解析）
 * - parseExtendedRegions（扩展模式解析）
 */
import { describe, test, expect } from 'vitest';
import {
  WORLD_TEMPLATES,
  getWorldTemplateMeta,
  templateIdToWorldType,
  generateWorldSeed,
  buildWorldGenerationMessages,
  buildWorldExtendMessages,
  parseGeneratedWorld,
  parseExtendedRegions,
} from '@core/world-generator';
import type { LorebookEntry, WorldDescription } from '@core/lorebook';

// ── 测试夹具 ──

function makeEntry(overrides: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 9)}`,
    title: '测试条目',
    keys: ['测试'],
    content: '测试内容',
    strategy: 'keyword',
    probability: 100,
    insertionOrder: 100,
    insertionPosition: 'afterCharDefs',
    depth: 0,
    group: '',
    enabled: true,
    logic: 'AND_ANY',
    ...overrides,
  };
}

function makeWorldDesc(
  overrides: Partial<WorldDescription> = {}
): WorldDescription {
  return {
    name: '测试世界',
    type: 'fantasy',
    keys: ['关键字'],
    content: '世界描述',
    ...overrides,
  };
}

// ── 测试用例 ──

describe('world-generator (F06.8)', () => {
  describe('WORLD_TEMPLATES 模板定义', () => {
    test('包含至少 6 个模板', () => {
      expect(WORLD_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    });

    test('每个模板包含必填字段', () => {
      for (const t of WORLD_TEMPLATES) {
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.regionCount.min).toBeGreaterThan(0);
        expect(t.regionCount.max).toBeGreaterThanOrEqual(t.regionCount.min);
        expect(t.subAreaCount.min).toBeGreaterThan(0);
        expect(t.subAreaCount.max).toBeGreaterThanOrEqual(t.subAreaCount.min);
        expect(Array.isArray(t.sampleRegions)).toBe(true);
      }
    });

    test('包含关键模板 id', () => {
      const ids = WORLD_TEMPLATES.map((t) => t.id);
      expect(ids).toContain('fantasy');
      expect(ids).toContain('scifi');
      expect(ids).toContain('modern');
      expect(ids).toContain('postapoc');
      expect(ids).toContain('historical');
      expect(ids).toContain('other');
    });
  });

  describe('getWorldTemplateMeta', () => {
    test('返回存在的模板', () => {
      const meta = getWorldTemplateMeta('fantasy');
      expect(meta).toBeDefined();
      expect(meta?.label).toBe('奇幻');
    });

    test('不存在的 id 返回 undefined', () => {
      const meta = getWorldTemplateMeta('nonexistent' as never);
      expect(meta).toBeUndefined();
    });
  });

  describe('templateIdToWorldType', () => {
    test('fantasy 透传', () => {
      expect(templateIdToWorldType('fantasy')).toBe('fantasy');
    });

    test('scifi 透传', () => {
      expect(templateIdToWorldType('scifi')).toBe('scifi');
    });

    test('modern 透传', () => {
      expect(templateIdToWorldType('modern')).toBe('modern');
    });

    test('historical 透传', () => {
      expect(templateIdToWorldType('historical')).toBe('historical');
    });

    test('postapoc 归为 other', () => {
      expect(templateIdToWorldType('postapoc')).toBe('other');
    });

    test('other 透传', () => {
      expect(templateIdToWorldType('other')).toBe('other');
    });
  });

  describe('generateWorldSeed', () => {
    test('返回非空字符串', () => {
      const seed = generateWorldSeed();
      expect(typeof seed).toBe('string');
      expect(seed.length).toBeGreaterThan(0);
    });

    test('长度不超过 8', () => {
      const seed = generateWorldSeed();
      expect(seed.length).toBeLessThanOrEqual(8);
    });

    test('多次调用结果不同', () => {
      const seeds = new Set<string>();
      for (let i = 0; i < 10; i++) {
        seeds.add(generateWorldSeed());
      }
      // 至少 8 个不同值（极小概率重复）
      expect(seeds.size).toBeGreaterThanOrEqual(8);
    });
  });

  describe('buildWorldGenerationMessages 创建模式', () => {
    test('返回 system + user 两条消息', () => {
      const messages = buildWorldGenerationMessages('fantasy', 'abc123');
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe('system');
      expect(messages[1]!.role).toBe('user');
    });

    test('包含模板描述', () => {
      const messages = buildWorldGenerationMessages('scifi', 'seed1');
      const meta = getWorldTemplateMeta('scifi');
      expect(messages[1]!.content).toContain(meta!.label);
      expect(messages[1]!.content).toContain(meta!.description);
    });

    test('包含种子', () => {
      const messages = buildWorldGenerationMessages('modern', 'uniqueSeed');
      expect(messages[1]!.content).toContain('uniqueSeed');
    });

    test('包含 JSON 结构示例', () => {
      const messages = buildWorldGenerationMessages('fantasy', 's');
      expect(messages[1]!.content).toContain('"world"');
      expect(messages[1]!.content).toContain('"regions"');
      expect(messages[1]!.content).toContain('"subAreas"');
    });

    test('包含世界类型约束', () => {
      const messages = buildWorldGenerationMessages('fantasy', 's');
      expect(messages[1]!.content).toContain('"fantasy"');
    });

    test('postapoc 模板使用 other 作为世界类型', () => {
      const messages = buildWorldGenerationMessages('postapoc', 's');
      expect(messages[1]!.content).toContain('"other"');
    });

    test('historical 模板使用 historical 作为世界类型', () => {
      const messages = buildWorldGenerationMessages('historical', 's');
      expect(messages[1]!.content).toContain('"historical"');
    });

    test('包含大区数量约束', () => {
      const messages = buildWorldGenerationMessages('fantasy', 's');
      const meta = getWorldTemplateMeta('fantasy');
      expect(messages[1]!.content).toContain(String(meta!.regionCount.min));
      expect(messages[1]!.content).toContain(String(meta!.regionCount.max));
    });
  });

  describe('buildWorldExtendMessages 扩展模式', () => {
    test('返回 system + user 两条消息', () => {
      const messages = buildWorldExtendMessages([], null, 'seed');
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe('system');
      expect(messages[1]!.role).toBe('user');
    });

    test('无世界描述时显示未设置提示', () => {
      const messages = buildWorldExtendMessages([], null, 's');
      expect(messages[1]!.content).toContain('未设置整体世界描述');
    });

    test('包含世界描述信息', () => {
      const wd = makeWorldDesc({
        name: '魔法国度',
        type: 'fantasy',
        keys: ['魔法', '王国'],
        content: '一个充满魔法的世界',
      });
      const messages = buildWorldExtendMessages([], wd, 's');
      expect(messages[1]!.content).toContain('魔法国度');
      expect(messages[1]!.content).toContain('魔法/王国');
      expect(messages[1]!.content).toContain('一个充满魔法的世界');
    });

    test('包含现有条目上下文', () => {
      const entries = [
        makeEntry({
          title: '王都',
          keys: ['王都', '皇宫'],
          content: '繁华的王都中心',
          hierarchyLevel: 1,
        }),
        makeEntry({
          title: '魔法学院',
          keys: ['魔法'],
          content: '培养魔法师的学府',
          hierarchyLevel: 2,
        }),
      ];
      const messages = buildWorldExtendMessages(entries, null, 's');
      expect(messages[1]!.content).toContain('王都');
      expect(messages[1]!.content).toContain('魔法学院');
      expect(messages[1]!.content).toContain('大区');
      expect(messages[1]!.content).toContain('子区域');
    });

    test('长内容被截断', () => {
      const longContent = '长'.repeat(200);
      const entries = [
        makeEntry({ title: '长条目', content: longContent }),
      ];
      const messages = buildWorldExtendMessages(entries, null, 's');
      expect(messages[1]!.content).toContain('...');
      // 不应包含完整 200 字符长内容
      expect(messages[1]!.content).not.toContain(longContent);
    });

    test('包含种子', () => {
      const messages = buildWorldExtendMessages([], null, 'extendSeed');
      expect(messages[1]!.content).toContain('extendSeed');
    });

    test('要求返回 JSON 数组', () => {
      const messages = buildWorldExtendMessages([], null, 's');
      expect(messages[1]!.content).toContain('[');
      expect(messages[1]!.content).toContain(']');
    });
  });

  describe('parseGeneratedWorld 创建模式解析', () => {
    test('解析标准 JSON', () => {
      const raw = JSON.stringify({
        world: {
          name: '艾尔多拉',
          type: 'fantasy',
          keys: ['魔法', '王国'],
          content: '一个充满魔法的中世纪世界',
        },
        regions: [
          {
            title: '王都',
            keys: ['王都'],
            content: '繁华的王都',
            subAreas: [
              {
                title: '皇宫',
                keys: ['皇宫'],
                content: '国王居住的宫殿',
              },
            ],
          },
        ],
      });
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.world.name).toBe('艾尔多拉');
      expect(result!.world.type).toBe('fantasy');
      expect(result!.world.keys).toEqual(['魔法', '王国']);
      expect(result!.regions).toHaveLength(1);
      expect(result!.regions[0]!.title).toBe('王都');
      expect(result!.regions[0]!.subAreas).toHaveLength(1);
      expect(result!.regions[0]!.subAreas[0]!.title).toBe('皇宫');
    });

    test('解析 markdown 包裹的 JSON', () => {
      const raw = '```json\n' +
        JSON.stringify({
          world: { name: '科幻世界', type: 'scifi', keys: [], content: '...' },
          regions: [
            { title: '大区', keys: [], content: '...', subAreas: [] },
          ],
        }) +
        '\n```';
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.world.name).toBe('科幻世界');
    });

    test('解析带前后缀文本的 JSON', () => {
      const raw = '好的，以下是生成结果：\n' +
        JSON.stringify({
          world: { name: '世界', type: 'other', keys: [], content: '' },
          regions: [{ title: '大区', keys: [], content: '', subAreas: [] }],
        }) +
        '\n希望对你有帮助！';
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.world.name).toBe('世界');
    });

    test('world 字段缺失返回 null', () => {
      const raw = JSON.stringify({
        regions: [{ title: '大区', keys: [], content: '', subAreas: [] }],
      });
      expect(parseGeneratedWorld(raw)).toBeNull();
    });

    test('world.name 缺失返回 null', () => {
      const raw = JSON.stringify({
        world: { type: 'fantasy', keys: [], content: '' },
        regions: [{ title: '大区', keys: [], content: '', subAreas: [] }],
      });
      expect(parseGeneratedWorld(raw)).toBeNull();
    });

    test('regions 为空数组返回 null', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'other', keys: [], content: '' },
        regions: [],
      });
      expect(parseGeneratedWorld(raw)).toBeNull();
    });

    test('regions 字段缺失返回 null', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'other', keys: [], content: '' },
      });
      expect(parseGeneratedWorld(raw)).toBeNull();
    });

    test('无效 JSON 返回 null', () => {
      expect(parseGeneratedWorld('not json')).toBeNull();
    });

    test('空字符串返回 null', () => {
      expect(parseGeneratedWorld('')).toBeNull();
    });

    test('无效 worldType 回退为 other', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'invalid', keys: [], content: '' },
        regions: [{ title: '大区', keys: [], content: '', subAreas: [] }],
      });
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.world.type).toBe('other');
    });

    test('无效子区域被过滤', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'other', keys: [], content: '' },
        regions: [
          {
            title: '大区',
            keys: [],
            content: '',
            subAreas: [
              { title: '有效子区域', keys: ['k'], content: 'c' },
              { title: '', keys: [], content: '' }, // 无效
              { keys: ['k'] }, // 缺 title
              'invalid string', // 非对象
            ],
          },
        ],
      });
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.regions[0]!.subAreas).toHaveLength(1);
      expect(result!.regions[0]!.subAreas[0]!.title).toBe('有效子区域');
    });

    test('无效大区被过滤', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'other', keys: [], content: '' },
        regions: [
          { title: '有效大区', keys: [], content: '', subAreas: [] },
          { title: '', keys: [], content: '', subAreas: [] }, // 无效
          null,
          'invalid',
        ],
      });
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.regions).toHaveLength(1);
      expect(result!.regions[0]!.title).toBe('有效大区');
    });

    test('keys 非数组时为空数组', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'other', keys: 'invalid', content: '' },
        regions: [{ title: '大区', keys: 'invalid', content: '', subAreas: [] }],
      });
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.world.keys).toEqual([]);
      expect(result!.regions[0]!.keys).toEqual([]);
    });

    test('content 非字符串时为空字符串', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'other', keys: [], content: 123 },
        regions: [{ title: '大区', keys: [], content: null, subAreas: [] }],
      });
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.world.content).toBe('');
      expect(result!.regions[0]!.content).toBe('');
    });

    test('subAreas 非数组时为空数组', () => {
      const raw = JSON.stringify({
        world: { name: '世界', type: 'other', keys: [], content: '' },
        regions: [{ title: '大区', keys: [], content: '', subAreas: 'invalid' }],
      });
      const result = parseGeneratedWorld(raw);
      expect(result).not.toBeNull();
      expect(result!.regions[0]!.subAreas).toEqual([]);
    });
  });

  describe('parseExtendedRegions 扩展模式解析', () => {
    test('解析标准 JSON 数组', () => {
      const raw = JSON.stringify([
        {
          title: '新大区',
          keys: ['新'],
          content: '新大区描述',
          subAreas: [
            { title: '子区域', keys: ['子'], content: '子区域描述' },
          ],
        },
      ]);
      const result = parseExtendedRegions(raw);
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe('新大区');
      expect(result[0]!.subAreas).toHaveLength(1);
    });

    test('解析 markdown 包裹的 JSON 数组', () => {
      const raw = '```json\n' +
        JSON.stringify([
          { title: '大区', keys: [], content: '', subAreas: [] },
        ]) +
        '\n```';
      const result = parseExtendedRegions(raw);
      expect(result).toHaveLength(1);
    });

    test('解析带前后缀文本的 JSON 数组', () => {
      const raw = '生成结果：\n' +
        JSON.stringify([{ title: '大区', keys: [], content: '', subAreas: [] }]) +
        '\n完成';
      const result = parseExtendedRegions(raw);
      expect(result).toHaveLength(1);
    });

    test('空数组返回空数组', () => {
      const raw = '[]';
      const result = parseExtendedRegions(raw);
      expect(result).toEqual([]);
    });

    test('无效 JSON 返回空数组', () => {
      expect(parseExtendedRegions('not json')).toEqual([]);
    });

    test('空字符串返回空数组', () => {
      expect(parseExtendedRegions('')).toEqual([]);
    });

    test('解析对象（非数组）返回空数组', () => {
      const raw = JSON.stringify({ title: '大区' });
      expect(parseExtendedRegions(raw)).toEqual([]);
    });

    test('无效元素被过滤', () => {
      const raw = JSON.stringify([
        { title: '有效', keys: [], content: '', subAreas: [] },
        { title: '', keys: [], content: '', subAreas: [] },
        null,
        'invalid',
      ]);
      const result = parseExtendedRegions(raw);
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe('有效');
    });

    test('subAreas 留空时为空数组', () => {
      const raw = JSON.stringify([
        { title: '大区', keys: [], content: '', subAreas: [] },
      ]);
      const result = parseExtendedRegions(raw);
      expect(result[0]!.subAreas).toEqual([]);
    });

    test('subAreas 缺失时为空数组', () => {
      const raw = JSON.stringify([
        { title: '大区', keys: [], content: '' },
      ]);
      const result = parseExtendedRegions(raw);
      expect(result[0]!.subAreas).toEqual([]);
    });

    test('多元素解析', () => {
      const raw = JSON.stringify([
        { title: '大区1', keys: ['k1'], content: 'c1', subAreas: [] },
        { title: '大区2', keys: ['k2'], content: 'c2', subAreas: [
          { title: '子1', keys: [], content: '' },
        ] },
        { title: '大区3', keys: [], content: '', subAreas: [
          { title: '子2', keys: [], content: '' },
          { title: '子3', keys: [], content: '' },
        ] },
      ]);
      const result = parseExtendedRegions(raw);
      expect(result).toHaveLength(3);
      expect(result[1]!.subAreas).toHaveLength(1);
      expect(result[2]!.subAreas).toHaveLength(2);
    });
  });
});
