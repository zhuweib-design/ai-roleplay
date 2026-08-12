/**
 * Lorebook 扫描引擎单元测试 (W7 · F06.2-F06.4)
 *
 * 覆盖：
 * - 关键词激活策略（constant / keyword / probability）
 * - 四种关键词逻辑运算（AND_ANY / AND_ALL / NOT_ANY / NOT_ALL）
 * - 正则表达式关键词支持
 * - 包含组过滤（同组仅激活一条）
 * - 按 insertionOrder 排序
 * - 按插入位置分组（beforeCharDefs / afterCharDefs / atDepth）
 * - 禁用条目跳过
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanLorebooks,
  groupByInsertionPosition,
  type ScanContext,
} from '@core/lorebook-scanner';
import type { Lorebook, LorebookEntry } from '@core/lorebook';

// ── 测试辅助 ──

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

describe('lorebook-scanner', () => {
  beforeEach(() => {
    // 固定 Math.random 避免概率测试抖动
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  // ── 激活策略 ──

  describe('激活策略', () => {
    it('constant 策略始终激活，无需关键词', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'c1',
          strategy: 'constant',
          keys: [],
          content: '常量内容',
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['无关消息']));
      expect(activated).toHaveLength(1);
      expect(activated[0].entry.id).toBe('c1');
      expect(activated[0].matchedKeys).toEqual([]);
    });

    it('keyword 策略：无关键词则不激活', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'k1', strategy: 'keyword', keys: [] }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['消息']));
      expect(activated).toHaveLength(0);
    });

    it('keyword 策略：关键词命中则激活', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'k2', strategy: 'keyword', keys: ['魔法'] }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['使用魔法攻击']));
      expect(activated).toHaveLength(1);
      expect(activated[0].entry.id).toBe('k2');
      expect(activated[0].matchedKeys).toEqual(['魔法']);
    });

    it('probability 策略：关键词命中后按概率决定（random=0.5, p=60 命中）', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'p1',
          strategy: 'probability',
          keys: ['剑'],
          probability: 60,
        }),
      ]);
      // Math.random 返回 0.5，0.5 * 100 = 50 < 60，命中
      const activated = scanLorebooks([lb], makeCtx(['挥剑攻击']));
      expect(activated).toHaveLength(1);
    });

    it('probability 策略：关键词命中但概率未达标（random=0.5, p=40 未命中）', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'p2',
          strategy: 'probability',
          keys: ['剑'],
          probability: 40,
        }),
      ]);
      // Math.random 返回 0.5，0.5 * 100 = 50 >= 40，未命中
      const activated = scanLorebooks([lb], makeCtx(['挥剑攻击']));
      expect(activated).toHaveLength(0);
    });

    it('probability 策略：关键词未命中则不激活（无论概率）', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'p3',
          strategy: 'probability',
          keys: ['剑'],
          probability: 100,
        }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['空手攻击']));
      expect(activated).toHaveLength(0);
    });
  });

  // ── 关键词逻辑运算 ──

  describe('关键词逻辑运算', () => {
    it('AND_ANY：任一关键词命中即激活', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'a1',
          keys: ['剑', '盾'],
          logic: 'AND_ANY',
        }),
      ]);
      expect(scanLorebooks([lb], makeCtx(['挥剑']))).toHaveLength(1);
      expect(scanLorebooks([lb], makeCtx(['举盾']))).toHaveLength(1);
      expect(scanLorebooks([lb], makeCtx(['空手']))).toHaveLength(0);
    });

    it('AND_ALL：所有关键词都命中才激活', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'a2',
          keys: ['剑', '盾'],
          logic: 'AND_ALL',
        }),
      ]);
      expect(scanLorebooks([lb], makeCtx(['挥剑']))).toHaveLength(0);
      expect(scanLorebooks([lb], makeCtx(['挥剑举盾']))).toHaveLength(1);
    });

    it('NOT_ANY：任一关键词命中则不激活', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'a3',
          keys: ['禁止'],
          logic: 'NOT_ANY',
        }),
      ]);
      // 命中 "禁止" → 不激活
      expect(scanLorebooks([lb], makeCtx(['禁止入内']))).toHaveLength(0);
      // 未命中 → 激活
      expect(scanLorebooks([lb], makeCtx(['欢迎进入']))).toHaveLength(1);
    });

    it('NOT_ALL：所有关键词都不命中才激活（与 NOT_ANY 在单关键词时等价）', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'a4',
          keys: ['夜晚', '雨天'],
          logic: 'NOT_ALL',
        }),
      ]);
      // 两个关键词都未命中 → 激活
      expect(scanLorebooks([lb], makeCtx(['晴朗白天']))).toHaveLength(1);
      // 命中一个 → 不激活
      expect(scanLorebooks([lb], makeCtx(['夜晚']))).toHaveLength(0);
      // 命中两个 → 不激活
      expect(scanLorebooks([lb], makeCtx(['夜晚雨天']))).toHaveLength(0);
    });
  });

  // ── 正则关键词 ──

  describe('正则表达式关键词', () => {
    it('支持 /pattern/flags 格式', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'r1',
          // 字符串字面量中反斜杠需双重转义：\\d 表示字面 \d
          keys: ['/\\d{4}-\\d{2}-\\d{2}/'],
        }),
      ]);
      expect(scanLorebooks([lb], makeCtx(['日期是 2025-01-01']))).toHaveLength(1);
      expect(scanLorebooks([lb], makeCtx(['无日期文本']))).toHaveLength(0);
    });

    it('正则失败时降级为普通文本', () => {
      const lb = makeLorebook([
        makeEntry({
          id: 'r2',
          keys: ['/(invalid'],
        }),
      ]);
      // 降级为普通文本 "/(invalid"，匹配文本需包含该子串
      expect(scanLorebooks([lb], makeCtx(['/(invalid 内容']))).toHaveLength(1);
    });
  });

  // ── 大小写 ──

  describe('大小写不敏感', () => {
    it('关键词匹配不区分大小写', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'case1', keys: ['Magic'] }),
      ]);
      expect(scanLorebooks([lb], makeCtx(['use MAGIC']))).toHaveLength(1);
      expect(scanLorebooks([lb], makeCtx(['use magic']))).toHaveLength(1);
      expect(scanLorebooks([lb], makeCtx(['use Magic']))).toHaveLength(1);
    });
  });

  // ── 禁用条目 ──

  describe('禁用条目', () => {
    it('enabled=false 的条目不参与扫描', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'd1', strategy: 'constant', enabled: false }),
        makeEntry({ id: 'd2', strategy: 'constant', enabled: true }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['']));
      expect(activated).toHaveLength(1);
      expect(activated[0].entry.id).toBe('d2');
    });
  });

  // ── 包含组 ──

  describe('包含组 (F06.4)', () => {
    it('同组同时激活仅保留一条', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'g1', strategy: 'constant', group: '天气', insertionOrder: 1 }),
        makeEntry({ id: 'g2', strategy: 'constant', group: '天气', insertionOrder: 2 }),
        makeEntry({ id: 'g3', strategy: 'constant', group: '天气', insertionOrder: 3 }),
      ]);
      // Math.random = 0.5，3 个候选中选取 index = floor(0.5 * 3) = 1
      const activated = scanLorebooks([lb], makeCtx(['']));
      expect(activated).toHaveLength(1);
      expect(activated[0].entry.id).toBe('g2');
    });

    it('无 group 的条目直接保留', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'ng1', strategy: 'constant', group: '' }),
        makeEntry({ id: 'ng2', strategy: 'constant', group: '' }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['']));
      expect(activated).toHaveLength(2);
    });

    it('支持逗号分隔的多组', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'm1', strategy: 'constant', group: 'A, B' }),
        makeEntry({ id: 'm2', strategy: 'constant', group: 'A' }),
      ]);
      // m1 同时在 A 和 B 组；A 组随机选一个（含 m1, m2）
      // Math.random = 0.5，2 个候选 index = floor(0.5*2) = 1 → m2
      // 然后 B 组只剩 m1（已处理 m2 不会被处理，但 m1 未处理）
      const activated = scanLorebooks([lb], makeCtx(['']));
      // 应有 2 条：A 组选中的 + B 组剩下的 m1
      const ids = activated.map((a) => a.entry.id).sort();
      expect(ids).toEqual(['m1', 'm2']);
    });
  });

  // ── 排序 ──

  describe('按 insertionOrder 排序', () => {
    it('激活条目按 insertionOrder 升序排列', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'o3', strategy: 'constant', insertionOrder: 30 }),
        makeEntry({ id: 'o1', strategy: 'constant', insertionOrder: 10 }),
        makeEntry({ id: 'o2', strategy: 'constant', insertionOrder: 20 }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['']));
      expect(activated.map((a) => a.entry.id)).toEqual(['o1', 'o2', 'o3']);
    });
  });

  // ── 多 Lorebook 扫描 ──

  describe('多 Lorebook 扫描', () => {
    it('合并多个 Lorebook 的激活结果', () => {
      const lb1 = makeLorebook(
        [makeEntry({ id: 'lb1-1', strategy: 'constant' })],
        'lb-1'
      );
      const lb2 = makeLorebook(
        [makeEntry({ id: 'lb2-1', strategy: 'constant' })],
        'lb-2'
      );
      const activated = scanLorebooks([lb1, lb2], makeCtx(['']));
      expect(activated).toHaveLength(2);
      expect(activated.map((a) => a.lorebookId).sort()).toEqual(['lb-1', 'lb-2']);
    });

    it('携带 lorebookName 用于调试', () => {
      const lb = makeLorebook([makeEntry({ id: 'n1', strategy: 'constant' })]);
      lb.name = '自定义名称';
      const activated = scanLorebooks([lb], makeCtx(['']));
      expect(activated[0].lorebookName).toBe('自定义名称');
    });
  });

  // ── additionalText 扫描 ──

  describe('additionalText 扫描', () => {
    it('additionalText 也参与关键词扫描', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'at1', keys: ['精灵'] }),
      ]);
      // 消息中无关键词，但 additionalText 中有
      const activated = scanLorebooks(
        [lb],
        makeCtx(['你好'], '种族：精灵族')
      );
      expect(activated).toHaveLength(1);
      expect(activated[0].entry.id).toBe('at1');
    });
  });

  // ── groupByInsertionPosition ──

  describe('groupByInsertionPosition', () => {
    it('按插入位置分组激活条目', () => {
      const lb = makeLorebook([
        makeEntry({ id: 'b1', strategy: 'constant', insertionPosition: 'beforeCharDefs' }),
        makeEntry({ id: 'a1', strategy: 'constant', insertionPosition: 'afterCharDefs' }),
        makeEntry({ id: 'd1', strategy: 'constant', insertionPosition: 'atDepth', depth: 2 }),
        makeEntry({ id: 'd2', strategy: 'constant', insertionPosition: 'atDepth', depth: 2 }),
        makeEntry({ id: 'd3', strategy: 'constant', insertionPosition: 'atDepth', depth: 4 }),
      ]);
      const activated = scanLorebooks([lb], makeCtx(['']));
      const grouped = groupByInsertionPosition(activated);

      expect(grouped.beforeCharDefs.map((e) => e.entry.id)).toEqual(['b1']);
      expect(grouped.afterCharDefs.map((e) => e.entry.id)).toEqual(['a1']);
      expect(grouped.atDepth.get(2)?.map((e) => e.entry.id)).toEqual(['d1', 'd2']);
      expect(grouped.atDepth.get(4)?.map((e) => e.entry.id)).toEqual(['d3']);
    });

    it('空列表返回空分组', () => {
      const grouped = groupByInsertionPosition([]);
      expect(grouped.beforeCharDefs).toEqual([]);
      expect(grouped.afterCharDefs).toEqual([]);
      expect(grouped.atDepth.size).toBe(0);
    });
  });
});
