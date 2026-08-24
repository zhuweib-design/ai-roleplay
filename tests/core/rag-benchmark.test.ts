/**
 * rag-benchmark 单元测试
 *
 * 覆盖:
 * - buildRagBenchmarkSet() 数据完整性与一致性(14 组, expected 在 KB 内)
 * - 择优结果持久化读写
 * - runEmbeddingBenchmark() 跑分逻辑(recall 计算/S4 双命中/并列取耗时/失败跳过/空集)
 * 使用 MockEmbeddingProvider 注入,验证计数与择优判定(不依赖真实模型)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildRagBenchmarkSet,
  runEmbeddingBenchmark,
  getBestEmbeddingModel,
  setBestEmbeddingModel,
  clearBestEmbeddingModel,
  type RAGBenchmarkSet,
} from '../../src/core/rag-benchmark';
import { MockEmbeddingProvider, type EmbeddingProvider } from '../../src/core/embedding';

function mockFactory(): (modelId: string) => Promise<EmbeddingProvider> {
  return async () => new MockEmbeddingProvider();
}

describe('buildRagBenchmarkSet (数据)', () => {
  let set: RAGBenchmarkSet;

  beforeEach(() => {
    set = buildRagBenchmarkSet();
  });

  it('返回 16 条知识库(6 动态 + 10 静态)', () => {
    expect(set.dynamicKb).toHaveLength(6);
    expect(set.staticKb).toHaveLength(10);
  });

  it('返回 14 组评测 case', () => {
    expect(set.cases).toHaveLength(14);
  });

  it('每个 case 的 expected 都在对应 channel 的知识库中', () => {
    const dynIds = new Set(set.dynamicKb.map((k) => k.id));
    const staIds = new Set(set.staticKb.map((k) => k.id));
    for (const c of set.cases) {
      const kbIds = c.channel === 'dynamic' ? dynIds : staIds;
      for (const id of c.expected) {
        expect(kbIds.has(id), `${c.id} 期望命中 ${id} 不在 ${c.channel} 库中`).toBe(true);
      }
    }
  });

  it('S4 期望命中 fire+light 且需 2 条', () => {
    const s4 = set.cases.find((c) => c.id === 'S4');
    expect(s4).toBeDefined();
    expect(s4!.expected).toEqual(['fire', 'light']);
    expect(s4!.expectedCount).toBe(2);
  });

  it('其余 case 的 expectedCount 与 expected 长度一致', () => {
    for (const c of set.cases) {
      expect(c.expectedCount, `${c.id}`).toBe(c.expected.length);
    }
  });
});

describe('择优结果持久化', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('aijiuguan.bestEmbeddingModel');
    } catch {
      /* 环境无 localStorage */
    }
  });

  it('未设置时返回 null', () => {
    expect(getBestEmbeddingModel()).toBeNull();
  });

  it('set 后 get 返回 id', () => {
    setBestEmbeddingModel('bge-small-zh-v1.5', 0.9, 120);
    expect(getBestEmbeddingModel()).toBe('bge-small-zh-v1.5');
  });

  it('clear 后返回 null', () => {
    setBestEmbeddingModel('x', 1, 1);
    clearBestEmbeddingModel();
    expect(getBestEmbeddingModel()).toBeNull();
  });
});

describe('runEmbeddingBenchmark (跑分)', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('aijiuguan.bestEmbeddingModel');
    } catch {
      /* 环境无 localStorage */
    }
  });

  it('空模型集返回空结果,不写入 best', async () => {
    const out = await runEmbeddingBenchmark({ listInstalled: async () => [], factory: mockFactory() });
    expect(out.results).toHaveLength(0);
    expect(out.best).toBeUndefined();
    expect(getBestEmbeddingModel()).toBeNull();
  });

  it('对每个模型产出 recall = passed/14', async () => {
    const out = await runEmbeddingBenchmark({
      listInstalled: async () => ['m1'],
      factory: mockFactory(),
    });
    expect(out.results).toHaveLength(1);
    const r = out.results[0]!;
    expect(r.recall).toBe(r.passed / 14);
    expect(r.modelId).toBe('m1');
    expect(getBestEmbeddingModel()).toBe('m1');
  });

  it('recall 高者胜出', async () => {
    const factory = async (id: string): Promise<EmbeddingProvider> => {
      if (id === 'good') {
        // 复用 mock(对评测查询命中较好)
        return new MockEmbeddingProvider();
      }
      // bad: 恒返回零向量(无命中)
      return {
        name: 'zero',
        dim: 3,
        embed: async () => ({ dim: 3, values: [0, 0, 0] }),
        embedBatch: async (t: string[]) => (await Promise.all(t.map(async () => ({ dim: 3, values: [0, 0, 0] })))),
      };
    };
    const out = await runEmbeddingBenchmark({
      listInstalled: async () => ['good', 'bad'],
      factory,
    });
    expect(out.best).toBeDefined();
    expect(out.best!.modelId).toBe('good');
    expect(getBestEmbeddingModel()).toBe('good');
  });

  it('并列 recall 取耗时短者', async () => {
    // 同步忙等,精确产生耗时差(避免 setTimeout 的 timer 量化噪声)
    const busy = (ms: number) => {
      const t = performance.now();
      while (performance.now() - t < ms) {
        /* 忙等 */
      }
    };
    const factory = (id: string): Promise<EmbeddingProvider> => {
      return Promise.resolve({
        name: id,
        dim: 3,
        embed: async () => {
          if (id === 'm2') busy(1);
          else busy(5);
          return { dim: 3, values: [1, 0, 0] };
        },
        embedBatch: async (t: string[]) => (await Promise.all(t.map(async () => ({ dim: 3, values: [1, 0, 0] })))),
      });
    };
    const out = await runEmbeddingBenchmark({
      listInstalled: async () => ['m1', 'm2'],
      factory,
    });
    expect(out.best).toBeDefined();
    expect(out.best!.modelId).toBe('m2');
    // 两个模型 recall 应并列(都因 S4 双命中失败而为同一 recall)
    const r1 = out.results.find((r) => r.modelId === 'm1');
    const r2 = out.results.find((r) => r.modelId === 'm2');
    expect(r1!.recall).toBe(r2!.recall);
    expect(r2!.latencyMs).toBeLessThan(r1!.latencyMs);
  });

  it('失败模型跳过且不破坏整体', async () => {
    const out = await runEmbeddingBenchmark({
      listInstalled: async () => ['broken', 'ok'],
      factory: async (id: string) => {
        if (id === 'broken') throw new Error('load failed');
        return new MockEmbeddingProvider();
      },
    });
    const broken = out.results.find((r) => r.modelId === 'broken');
    expect(broken?.error).toContain('load failed');
    // broken 不计入择优
    expect(out.best).toBeDefined();
    expect(out.best!.modelId).toBe('ok');
    // 空库的 broken 不被选
    expect(out.results).toHaveLength(2);
  });

  it('best 选择跳过含 error 的结果', async () => {
    const out = await runEmbeddingBenchmark({
      listInstalled: async () => ['a', 'b'],
      factory: async (id: string) => {
        if (id === 'a') throw new Error('x');
        return new MockEmbeddingProvider();
      },
    });
    expect(out.best!.modelId).toBe('b');
  });
});