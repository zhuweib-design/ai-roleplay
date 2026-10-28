/**
 * 检索留痕的合并视图（C-03）
 *
 * 判据要回答的是"界面上会出现什么"：三路命中怎么合并、同一对象去重留哪份、
 * 顺序怎么定、label 怎么从正文裁、条数上限怎么生效。
 */
import { describe, it, expect } from 'vitest';
import {
  mergeRetrievalTrace,
  toVectorRetrievalHits,
  sourceOfVectorId,
  canonicalRetrievalKey,
  RETRIEVAL_TRACE_MAX,
} from '@core/retrieval-trace';
import type { RawRetrievalHit } from '@core/retrieval-trace';
import type { VectorRagSource } from '@core/dual-channel-runtime';
import { uiMsgToChatMsg, chatMsgToUiMsg } from '@/services/type-adapters';
import type { UIMessage } from '@/types';

const sources = (...items: Array<[string, string]>): VectorRagSource[] =>
  items.map(([id, text]) => ({ id, text, meta: {} }));

const raw = (
  id: string,
  score: number,
  source: RawRetrievalHit['source'],
  text = `正文 ${id}`
): RawRetrievalHit => ({ id, score, source, text });

describe('mergeRetrievalTrace', () => {
  it('三路合并后按来源分组：记忆 → 资料 → 设定，组内按各自分数降序', () => {
    const out = mergeRetrievalTrace([
      raw('lorebook:lb1:e1', 0.3, 'lore'),
      raw('document:d1:d1-2', 0.5, 'document'),
      raw('memory:m1', 0.2, 'memory'),
      raw('memory:m2', 0.9, 'memory'),
      raw('d1-1', 2, 'document'),
    ]);
    expect(out.map((o) => `${o.source}:${o.id}`)).toEqual([
      // 记忆组内 0.9 > 0.2
      'memory:memory:m2',
      'memory:memory:m1',
      // 资料组内关键词命中数 2 > 相似度 0.5（不跨来源比，只在组内排）
      'document:d1-1',
      'document:document:d1:d1-2',
      'lore:lorebook:lb1:e1',
    ]);
  });

  it('同一个对象被同一路的两种 id 写法命中时，只留分数更高的那条', () => {
    // 同一个资料库分块：向量那路 0.95、关键词那路 1（同一个 chunk 的两种 id 写法）
    const out = mergeRetrievalTrace([
      raw('document:d1:d1-3', 0.95, 'document', '资料库分块正文'),
      raw('d1-3', 1, 'document', '同一分块的关键词命中'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('d1-3');
  });

  it('去重键带来源：资料库的裸 id 是分块，不会被当成记忆事实', () => {
    expect(canonicalRetrievalKey('fact-1', 'memory')).toBe('fact:fact-1');
    expect(canonicalRetrievalKey('fact-1', 'document')).toBe('chunk:fact-1');
    expect(canonicalRetrievalKey('memory:fact-1', 'memory')).toBe(canonicalRetrievalKey('fact-1', 'memory'));
  });

  it('向量 memory: 前缀与 L0 裸 id 视为同一条（同属记忆那一路）', () => {
    const out = mergeRetrievalTrace([raw('memory:fact-9', 0.8, 'memory'), raw('fact-9', 3, 'memory')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBe(3);
  });

  it('label 折叠换行与多余空白，超长截到 40 字并加省略号', () => {
    const long = '第一段\n  有换行   和多余空格\n\n' + '补'.repeat(60);
    const [only] = mergeRetrievalTrace([raw('memory:x', 0.5, 'memory', long)]);
    expect(only!.label.startsWith('第一段 有换行 和多余空格 补')).toBe(true);
    expect(only!.label.endsWith('…'), `label 应以省略号结尾：${only!.label}`).toBe(true);
    expect([...only!.label].length).toBe(41);
  });

  it('文本为空时不猜，label 落到占位符', () => {
    const [only] = mergeRetrievalTrace([raw('memory:gone', 0.3, 'memory', '')]);
    expect(only!.label).toBe('—');
  });

  it('分数保留三位小数（界面上要能横向比较，但不假装更精确）', () => {
    const [only] = mergeRetrievalTrace([raw('memory:a', 0.123456789, 'memory')]);
    expect(only!.score).toBe(0.123);
  });

  it('空命中产出空数组（调用方据此不写字段，旧数据零迁移）', () => {
    expect(mergeRetrievalTrace([])).toEqual([]);
    expect(mergeRetrievalTrace(undefined)).toEqual([]);
  });

  it('上限是 8 条，且对三路合并后的清单生效', () => {
    // 期望值写死字面量，不引用 RETRIEVAL_TRACE_MAX：拿同一个常量同时当输入和期望，
    // 把上限从 8 调到 99 时两边一起变，这条判据就永远红不了（实测过这个洞）。
    expect(RETRIEVAL_TRACE_MAX).toBe(8);
    const many = Array.from({ length: 11 }, (_, i) => raw(`memory:m${i}`, 1 - i * 0.01, 'memory'));
    const out = mergeRetrievalTrace(many);
    expect(out.map((o) => o.id)).toEqual(many.slice(0, 8).map((h) => h.id));
    expect(out).toHaveLength(8);
  });
});

describe('向量那一路的适配', () => {
  it('dynamic 归记忆；static 按 id 前缀分流到资料 / 设定', () => {
    expect(sourceOfVectorId('memory:m1')).toBe('memory');
    expect(sourceOfVectorId('document:d1:d1-0')).toBe('document');
    expect(sourceOfVectorId('lorebook:lb1:e1')).toBe('lore');
    expect(sourceOfVectorId('world:lb1:description')).toBe('lore');
  });

  it('文本取自当轮来源表；找不到时留空串（由合并那步落到占位符）', () => {
    const hits = toVectorRetrievalHits(
      [
        { id: 'memory:a', score: 0.91, channel: 'dynamic' },
        { id: 'document:d1:d1-0', score: 0.4, channel: 'static' },
        { id: 'lorebook:lb1:e1', score: 0.2, channel: 'static' },
      ],
      sources(['memory:a', '用户喜欢在下雨天读书'], ['document:d1:d1-0', '文档正文'])
    );
    expect(hits.map((h) => h.source)).toEqual(['memory', 'document', 'lore']);
    expect(hits.map((h) => h.text)).toEqual(['用户喜欢在下雨天读书', '文档正文', '']);
  });
});

/**
 * 持久化往返（照 promptTrace 的同名段落）
 *
 * 为什么单独立这条：e2e 那边种的是 characters 记录，走不到 `chatMsgToUiMsg`
 * （从 chats 记录回读时才用得上，见 chat-generation-persistence.ts:195）。
 * 实测过：把回读那行摘掉，e2e 仍然全绿 ⇒ 这一环只有这里测得到。
 */
describe('retrievalTrace 持久化往返', () => {
  const base: UIMessage = {
    id: 'm1',
    role: 'assistant',
    content: '你喜欢下雨天。',
    timestamp: 1700000000000,
  };
  const trace = mergeRetrievalTrace([raw('memory:a', 0.9123, 'memory', '用户喜欢在下雨天读书')]);

  it('有痕迹时写入并可回读', () => {
    const chat = uiMsgToChatMsg({ ...base, retrievalTrace: trace });
    expect(chat.retrievalTrace).toHaveLength(1);
    expect(chatMsgToUiMsg(chat)).toMatchObject({
      retrievalTrace: [{ id: 'memory:a', label: '用户喜欢在下雨天读书', score: 0.912, source: 'memory' }],
    });
  });

  it('空痕迹不写字段，旧数据回读为 undefined（零迁移）', () => {
    expect(uiMsgToChatMsg({ ...base, retrievalTrace: [] })).not.toHaveProperty('retrievalTrace');
    expect(uiMsgToChatMsg(base)).not.toHaveProperty('retrievalTrace');
    expect(
      chatMsgToUiMsg({ id: 'm1', role: 'assistant', content: 'x', timestamp: '2026-01-01T00:00:00.000Z', swipes: [], swipeIndex: 0 })
    ).not.toHaveProperty('retrievalTrace');
  });
});
