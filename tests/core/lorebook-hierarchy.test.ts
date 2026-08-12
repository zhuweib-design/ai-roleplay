/**
 * F06.6 世界层级结构单元测试 (v1.1)
 *
 * 覆盖：
 * - lorebook-scanner 两轮扫描算法（父节点级联激活子节点）
 * - 子节点继承父节点关键字
 * - 孙子节点递归激活
 * - 禁用子节点不被级联
 * - 已激活节点不重复处理
 * - validateLorebook 层级结构校验（parentId 存在性、深度递增、循环检测）
 * - validateLorebookEntry hierarchyLevel 校验
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanLorebooks,
  type ScanContext,
} from '@core/lorebook-scanner';
import {
  validateLorebook,
  validateLorebookEntry,
  type Lorebook,
  type LorebookEntry,
} from '@core/lorebook';

// ── 测试夹具 ──

function makeEntry(patch: Partial<LorebookEntry>): LorebookEntry {
  return {
    id: patch.id ?? `entry-${Math.random().toString(36).slice(2, 9)}`,
    title: patch.title ?? '测试条目',
    keys: patch.keys ?? [],
    content: patch.content ?? '条目内容',
    strategy: patch.strategy ?? 'keyword',
    probability: patch.probability ?? 100,
    insertionOrder: patch.insertionOrder ?? 1,
    insertionPosition: patch.insertionPosition ?? 'afterCharDefs',
    depth: patch.depth ?? 4,
    group: patch.group ?? '',
    enabled: patch.enabled ?? true,
    logic: patch.logic ?? 'AND_ANY',
    filter: patch.filter,
    // F06.6 层级字段（默认顶层节点）
    hierarchyLevel: patch.hierarchyLevel ?? 0,
    parentId: patch.parentId ?? null,
  };
}

function makeLorebook(entries: LorebookEntry[], id = 'lb-1'): Lorebook {
  return {
    id,
    name: '测试世界书',
    description: '',
    entries,
    scope: 'global',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeCtx(messages: string[], additionalText?: string): ScanContext {
  return {
    recentMessages: messages,
    additionalText,
  };
}

// ── 测试用例 ──

describe('F06.6 lorebook-scanner 层级激活', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  describe('父节点级联激活子节点', () => {
    it('父节点 constant 激活时，所有子节点自动激活', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'parent',
          strategy: 'constant',
          hierarchyLevel: 0,
          parentId: null,
        }),
        makeEntry({
          id: 'child1',
          keys: ['不会匹配的关键词'],
          hierarchyLevel: 1,
          parentId: 'parent',
        }),
        makeEntry({
          id: 'child2',
          keys: ['另一个不匹配的关键词'],
          hierarchyLevel: 1,
          parentId: 'parent',
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['无关消息']));
      const ids = activated.map((a) => a.entry.id).sort();
      expect(ids).toEqual(['child1', 'child2', 'parent']);
    });

    it('父节点 keyword 匹配时，子节点自动激活', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'world',
          keys: ['魔法'],
          hierarchyLevel: 0,
          parentId: null,
        }),
        makeEntry({
          id: 'region',
          keys: ['完全不匹配的词'],
          hierarchyLevel: 1,
          parentId: 'world',
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['魔法师施展了魔法']));
      const ids = activated.map((a) => a.entry.id).sort();
      expect(ids).toEqual(['region', 'world']);
    });

    it('孙子节点递归激活（三层）', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'world',
          strategy: 'constant',
          hierarchyLevel: 0,
          parentId: null,
        }),
        makeEntry({
          id: 'region',
          keys: ['不匹配词1'],
          hierarchyLevel: 1,
          parentId: 'world',
        }),
        makeEntry({
          id: 'subarea',
          keys: ['不匹配词2'],
          hierarchyLevel: 2,
          parentId: 'region',
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['']));
      const ids = activated.map((a) => a.entry.id).sort();
      expect(ids).toEqual(['region', 'subarea', 'world']);
    });

    it('禁用的子节点不被级联激活', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'parent',
          strategy: 'constant',
          hierarchyLevel: 0,
        }),
        makeEntry({
          id: 'enabled-child',
          keys: ['x'],
          hierarchyLevel: 1,
          parentId: 'parent',
          enabled: true,
        }),
        makeEntry({
          id: 'disabled-child',
          keys: ['x'],
          hierarchyLevel: 1,
          parentId: 'parent',
          enabled: false,
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['']));
      const ids = activated.map((a) => a.entry.id).sort();
      // 父节点 + 启用子节点；禁用子节点不激活
      expect(ids).toEqual(['enabled-child', 'parent']);
    });

    it('子节点已激活不重复添加', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'parent',
          strategy: 'constant',
          hierarchyLevel: 0,
        }),
        // 子节点自身也匹配关键词（会被第一轮激活）
        makeEntry({
          id: 'child',
          keys: ['魔法'],
          hierarchyLevel: 1,
          parentId: 'parent',
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['魔法']));
      // 应只有一条记录
      const childEntries = activated.filter((a) => a.entry.id === 'child');
      expect(childEntries).toHaveLength(1);
    });
  });

  describe('子节点继承父节点关键字', () => {
    it('子节点无 keys 时继承父节点 keys 参与匹配', () => {
      // 子节点 keys=[]，父节点 keys=['魔法']
      // 子节点继承的 keys=['魔法']，消息含"魔法"时子节点自身也激活
      const lb = makeLorebook([
        makeEntry({
          id: 'world',
          keys: ['魔法'],
          hierarchyLevel: 0,
        }),
        makeEntry({
          id: 'region',
          keys: [], // 自身无关键字
          hierarchyLevel: 1,
          parentId: 'world',
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['魔法']));
      expect(activated.map((a) => a.entry.id).sort()).toEqual(['region', 'world']);
    });

    it('孙子节点继承祖父节点关键字', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'world',
          keys: ['大陆'],
          hierarchyLevel: 0,
        }),
        makeEntry({
          id: 'region',
          keys: [], // 自身无关键词
          hierarchyLevel: 1,
          parentId: 'world',
        }),
        makeEntry({
          id: 'subarea',
          keys: [], // 自身无关键词
          hierarchyLevel: 2,
          parentId: 'region',
        }),
      ]);
      // 消息含"大陆"，三层节点均应激活
      const activated = scanLorebooks([lb], makeCtx(['这片大陆上']));
      const ids = activated.map((a) => a.entry.id).sort();
      expect(ids).toEqual(['region', 'subarea', 'world']);
    });

    it('AND_ALL 逻辑下继承的关键字也参与匹配', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'parent',
          keys: ['魔法'],
          logic: 'AND_ALL',
          hierarchyLevel: 0,
        }),
        makeEntry({
          id: 'child',
          keys: ['法师'],
          logic: 'AND_ALL',
          hierarchyLevel: 1,
          parentId: 'parent',
        }),
      ]);
      // 消息同时含"魔法"和"法师"，子节点需要匹配两者
      const activated = scanLorebooks([lb], makeCtx(['魔法师施展法术']));
      // 父节点匹配"魔法"，激活
      // 子节点继承"魔法"+自身"法师"，消息含两者，激活
      const ids = activated.map((a) => a.entry.id).sort();
      expect(ids).toEqual(['child', 'parent']);
    });
  });

  describe('已激活子节点的 matchedKeys 处理', () => {
    it('级联激活的子节点 matchedKeys 默认为空数组', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'parent',
          strategy: 'constant',
          hierarchyLevel: 0,
        }),
        makeEntry({
          id: 'child',
          keys: ['不匹配'],
          hierarchyLevel: 1,
          parentId: 'parent',
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['']));
      const child = activated.find((a) => a.entry.id === 'child');
      expect(child).toBeDefined();
      expect(child!.matchedKeys).toEqual([]);
    });
  });
});

// ── validateLorebook 层级校验 ──

describe('F06.6 validateLorebook 层级校验', () => {
  describe('validateLorebookEntry hierarchyLevel 校验', () => {
    it('合法层级值（0/1/2）通过校验', () => {
      expect(validateLorebookEntry({ hierarchyLevel: 0 })).toHaveLength(0);
      expect(validateLorebookEntry({ hierarchyLevel: 1 })).toHaveLength(0);
      expect(validateLorebookEntry({ hierarchyLevel: 2 })).toHaveLength(0);
    });

    it('非法层级值（3/-1）报错', () => {
      expect(validateLorebookEntry({ hierarchyLevel: 3 as 0 | 1 | 2 })).toContain(
        '层级深度必须为 0（World）、1（Region）或 2（Sub-area）'
      );
      expect(validateLorebookEntry({ hierarchyLevel: -1 as 0 | 1 | 2 })).toContain(
        '层级深度必须为 0（World）、1（Region）或 2（Sub-area）'
      );
    });

    it('未指定 hierarchyLevel 时通过校验（可选字段）', () => {
      expect(validateLorebookEntry({})).toHaveLength(0);
    });
  });

  describe('parentId 存在性校验', () => {
    it('parentId 指向不存在的条目时报错', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'e1',
          parentId: 'nonexistent',
        }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors.some((e) => e.includes('parentId 指向不存在的条目'))).toBe(true);
    });

    it('parentId 指向同 Lorebook 内存在的条目时通过', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'parent', hierarchyLevel: 0 }),
        makeEntry({ id: 'child', hierarchyLevel: 1, parentId: 'parent' }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors).toHaveLength(0);
    });

    it('parentId 为 null 时通过', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'e1', parentId: null, hierarchyLevel: 0 }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors).toHaveLength(0);
    });
  });

  describe('深度递增校验', () => {
    it('子节点深度 ≤ 父节点深度时报错', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'parent', hierarchyLevel: 1 }),
        makeEntry({
          id: 'child',
          hierarchyLevel: 1, // 同级深度，应报错
          parentId: 'parent',
        }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors.some((e) => e.includes('必须大于父节点深度'))).toBe(true);
    });

    it('子节点深度 > 父节点深度时通过', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'parent', hierarchyLevel: 0 }),
        makeEntry({ id: 'child', hierarchyLevel: 1, parentId: 'parent' }),
        makeEntry({ id: 'grandchild', hierarchyLevel: 2, parentId: 'child' }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors).toHaveLength(0);
    });

    it('未指定 hierarchyLevel 时默认按 0 处理', () => {
      const lb: Lorebook = {
        id: 'lb-test',
        name: '测试',
        description: '',
        entries: [
          { ...makeEntry({ id: 'parent' }), hierarchyLevel: undefined },
          { ...makeEntry({ id: 'child', parentId: 'parent' }), hierarchyLevel: undefined },
        ],
        scope: 'global',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      const errors = validateLorebook(lb);
      // 两者均默认 0，子节点深度 0 ≤ 父节点 0，应报错
      expect(errors.some((e) => e.includes('必须大于父节点深度'))).toBe(true);
    });
  });

  describe('循环引用检测', () => {
    it('两节点互相引用时报错', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'a', hierarchyLevel: 0, parentId: 'b' }),
        makeEntry({ id: 'b', hierarchyLevel: 1, parentId: 'a' }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors.some((e) => e.includes('循环引用'))).toBe(true);
    });

    it('三节点循环引用时报错', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'a', hierarchyLevel: 0, parentId: 'c' }),
        makeEntry({ id: 'b', hierarchyLevel: 1, parentId: 'a' }),
        makeEntry({ id: 'c', hierarchyLevel: 2, parentId: 'b' }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors.some((e) => e.includes('循环引用'))).toBe(true);
    });

    it('自引用时报错', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'self', hierarchyLevel: 0, parentId: 'self' }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors.some((e) => e.includes('循环引用'))).toBe(true);
    });

    it('合法树状结构无循环引用时通过', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'root', hierarchyLevel: 0 }),
        makeEntry({ id: 'a', hierarchyLevel: 1, parentId: 'root' }),
        makeEntry({ id: 'b', hierarchyLevel: 2, parentId: 'a' }),
        makeEntry({ id: 'c', hierarchyLevel: 1, parentId: 'root' }),
      ]);
      const errors = validateLorebook(lb);
      expect(errors).toHaveLength(0);
    });
  });

  describe('空 entries 边界', () => {
    it('空 Lorebook 通过校验', () => {
      const lb = makeLorebook([]);
      const errors = validateLorebook(lb);
      expect(errors).toHaveLength(0);
    });
  });
});
