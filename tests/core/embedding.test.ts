/**
 * embedding — 双通道向量检索核心 (双通道 RAG) 测试
 *
 * 覆盖：
 * - cosineSimilarity 基本性质
 * - VectorStore:增删查 Top-k/导出导入
 * - MockEmbeddingProvider:相似文本得到高相似度向量
 * - DualChannelRetriever:动态每轮 + 静态按需触发(未触发时不查静态库)
 * - 世界设定分块:元数据标题命中优先于正文(需求 1 的检索形态)
 */
import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  VectorStore,
  MockEmbeddingProvider,
  DualChannelRetriever,
  type EmbeddingVector,
} from '@core/embedding';

describe('cosineSimilarity (向量检索)', () => {
  it('相同向量相似度 1,正交向量 0', () => {
    const a: EmbeddingVector = { dim: 2, values: [1, 0] };
    const b: EmbeddingVector = { dim: 2, values: [1, 0] };
    const c: EmbeddingVector = { dim: 2, values: [0, 1] };
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, c)).toBeCloseTo(0, 5);
  });

  it('维度不一致返回 0', () => {
    expect(
      cosineSimilarity({ dim: 2, values: [1, 0] }, { dim: 3, values: [1, 0, 0] })
    ).toBe(0);
  });
});

describe('VectorStore', () => {
  it('增删查与 Top-k 排序', () => {
    const store = new VectorStore();
    store.add({ id: 'a', vector: { dim: 2, values: [1, 0] }, text: 'A', meta: {} });
    store.add({ id: 'b', vector: { dim: 2, values: [0.9, 0.1] }, text: 'B', meta: {} });
    store.add({ id: 'c', vector: { dim: 2, values: [0, 1] }, text: 'C', meta: {} });

    const hits = store.query({ dim: 2, values: [1, 0] }, 2);
    expect(hits.map((h) => h.entry.id)).toEqual(['a', 'b']);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);

    store.remove('a');
    expect(store.size()).toBe(2);
    expect(store.get('a')).toBeUndefined();
  });

  it('导出/导入往返', () => {
    const store = new VectorStore();
    store.add({ id: 'x', vector: { dim: 2, values: [1, 0] }, text: 'X', meta: { scope: 'world' } });
    const data = store.exportAll();
    const store2 = new VectorStore();
    store2.importAll(data);
    expect(store2.size()).toBe(1);
    expect(store2.get('x')?.meta.scope).toBe('world');
  });
});

describe('MockEmbeddingProvider', () => {
  it('语义相似文本相似度显著高于无关文本', async () => {
    const p = new MockEmbeddingProvider();
    const v1 = await p.embed('星陨之剑的封印被解开');
    const v2 = await p.embed('星陨之剑的封印被解开了吗');
    const v3 = await p.embed('今天天气很好适合散步');
    expect(cosineSimilarity(v1, v2)).toBeGreaterThan(0.8);
    expect(cosineSimilarity(v1, v3)).toBeLessThan(cosineSimilarity(v1, v2));
    expect(p.dim).toBe(64);
  });
});

describe('DualChannelRetriever (双通道)', () => {
  it('动态通道每轮检索;静态通道按需触发', async () => {
    const p = new MockEmbeddingProvider();
    const trigger = (() => {
      let count = 0;
      return async () => {
        count++;
        return count > 1; // 第 2 轮起触发静态
      };
    })();

    const r = new DualChannelRetriever(p, { dynamicTopK: 2, staticTopK: 2 }, trigger);
    await r.addDynamic({ id: 'm1', text: '主角感到愤怒', meta: { kind: 'emotion' } });
    await r.addStatic({ id: 'w1', text: '星陨之剑的封印', meta: { scope: 'world' } });

    // 第 1 轮:仅动态
    const hits1 = await r.retrieve({ query: '主角的情绪' });
    expect(hits1.every((h) => h.channel === 'dynamic')).toBe(true);

    // 第 2 轮:动态 + 静态
    const hits2 = await r.retrieve({ query: '星陨之剑' });
    expect(hits2.some((h) => h.channel === 'static' && h.entry.id === 'w1')).toBe(true);
    expect(hits2.some((h) => h.channel === 'dynamic' && h.entry.id === 'm1')).toBe(true);
  });

  it('世界设定分块:标题+摘要命中优先(需求 1)', async () => {
    const p = new MockEmbeddingProvider();
    const r = new DualChannelRetriever(p, { dynamicTopK: 1, staticTopK: 3 }, () => true);
    // 超长世界设定入库时分块,meta.title 为块标题
    await r.addStatic({ id: 'w-block-1', text: '精灵王国的历史沿革与王位更迭', meta: { scope: 'world', title: '精灵王国' } });
    await r.addStatic({ id: 'w-block-2', text: '矮人山脉的矿藏分布与锻造工艺', meta: { scope: 'world', title: '矮人山脉' } });

    const hits = await r.retrieve({ query: '精灵王国' });
    expect(hits[0]!.entry.id).toBe('w-block-1');
    expect(hits[0]!.entry.meta.title).toBe('精灵王国');
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });
});