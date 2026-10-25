/**
 * 检索留痕的裁剪视图（C-03 记忆可见化第一步）
 *
 * 判据要回答的是"界面上会出现什么"，不是"函数跑没跑"：
 * 条数上限、label 怎么从正文裁、找不到来源时怎么办、分数保留几位。
 */
import { describe, it, expect } from 'vitest';
import { toRetrievalTraceItems, RETRIEVAL_TRACE_MAX } from '@core/retrieval-trace';
import type { VectorRagSource } from '@core/dual-channel-runtime';

const sources = (...items: Array<[string, string]>): VectorRagSource[] =>
  items.map(([id, text]) => ({ id, text, meta: {} }));

const hit = (id: string, score: number, channel: 'dynamic' | 'static' = 'dynamic') => ({ id, score, channel });

describe('toRetrievalTraceItems', () => {
  it('按命中顺序产出，label 取来源正文的短裁剪', () => {
    const out = toRetrievalTraceItems(
      [hit('memory:a', 0.91), hit('doc:b', 0.42, 'static')],
      sources(['memory:a', '用户喜欢在下雨天读书'], ['doc:b', '设定集：城市的地下铁网'])
    );
    expect(out).toEqual([
      { id: 'memory:a', label: '用户喜欢在下雨天读书', score: 0.91, channel: 'dynamic' },
      { id: 'doc:b', label: '设定集：城市的地下铁网', score: 0.42, channel: 'static' },
    ]);
  });

  it('label 折叠换行与多余空白，超长截到 40 字并加省略号', () => {
    const long = '第一段\n  有换行   和多余空格\n\n' + '补'.repeat(60);
    const [only] = toRetrievalTraceItems([hit('memory:x', 0.5)], sources(['memory:x', long]));
    expect(only!.label.startsWith('第一段 有换行 和多余空格 补')).toBe(true);
    expect(only!.label.endsWith('…'), `label 应以省略号结尾：${only!.label}`).toBe(true);
    // 40 个内容字 + 1 个省略号
    expect([...only!.label].length).toBe(41);
  });

  it('来源表里没有这个 id 时不抛，label 落到占位符', () => {
    const out = toRetrievalTraceItems([hit('memory:gone', 0.3)], sources(['memory:other', '别的']));
    expect(out[0]!.label).toBe('—');
  });

  it('分数保留三位小数（界面上要能横向比较，但不假装更精确）', () => {
    const out = toRetrievalTraceItems([hit('memory:a', 0.123456789)], sources(['memory:a', 'x']));
    expect(out[0]!.score).toBe(0.123);
  });

  it('空命中产出空数组（调用方据此不写字段，旧数据零迁移）', () => {
    expect(toRetrievalTraceItems([], [])).toEqual([]);
    expect(toRetrievalTraceItems(undefined, undefined)).toEqual([]);
  });

  it('上限是 8 条：再多界面也读不完，且持久化体积要封顶', () => {
    // 期望值写死字面量，不引用 RETRIEVAL_TRACE_MAX：拿同一个常量同时当输入和期望，
    // 把上限从 8 调到 99 时两边一起变，这条判据就永远红不了（实测过这个洞）。
    expect(RETRIEVAL_TRACE_MAX).toBe(8);
    const many = Array.from({ length: 11 }, (_, i) => hit(`memory:m${i}`, 1 - i * 0.01));
    const src = many.map((h): [string, string] => [h.id, `条目 ${h.id}`]);
    const out = toRetrievalTraceItems(many, sources(...src));
    expect(out.map((o) => o.id)).toEqual(many.slice(0, 8).map((h) => h.id));
    expect(out).toHaveLength(8);
  });
});
