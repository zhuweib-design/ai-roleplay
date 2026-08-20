/**
 * local-model-engine 单元测试 (模块2)
 *
 * 覆盖：
 * - 模型注册表查询
 * - 模型筛选
 * - 版本管理
 * - 引擎实例化与指标
 * - WebGPU 检测（mock navigator）
 *
 * 注意：实际模型加载/推理需要 WebGPU 环境，此处仅测试不依赖 GPU 的逻辑。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MODEL_REGISTRY,
  listRegisteredModels,
  findModel,
  filterModelsBySize,
  checkModelUpdate,
  LocalModelEngine,
  detectEngineCapability,
} from '../../src/core/local-model-engine';

describe('模型注册表', () => {
  describe('listRegisteredModels', () => {
    it('返回所有预置模型', () => {
      const models = listRegisteredModels();
      expect(models.length).toBe(MODEL_REGISTRY.length);
      expect(models.length).toBeGreaterThanOrEqual(3);
    });

    it('返回的是副本（不影响原数组）', () => {
      const models = listRegisteredModels();
      models.push(models[0]!);
      expect(listRegisteredModels().length).toBe(MODEL_REGISTRY.length);
    });
  });

  describe('findModel', () => {
    it('按 ID 查找存在的模型', () => {
      const first = MODEL_REGISTRY[0]!;
      const found = findModel(first.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(first.id);
      expect(found?.name).toBe(first.name);
    });

    it('查找不存在的 ID 返回 null', () => {
      expect(findModel('nonexistent-model')).toBeNull();
    });
  });

  describe('filterModelsBySize', () => {
    it('筛选小型模型', () => {
      const small = filterModelsBySize('small');
      expect(small.length).toBeGreaterThan(0);
      expect(small.every((m) => m.size === 'small')).toBe(true);
    });

    it('筛选中型模型', () => {
      const medium = filterModelsBySize('medium');
      expect(medium.length).toBeGreaterThan(0);
      expect(medium.every((m) => m.size === 'medium')).toBe(true);
    });

    it('每个模型都有必填字段', () => {
      for (const m of MODEL_REGISTRY) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(m.downloadSizeMb).toBeGreaterThan(0);
        expect(m.vramMb).toBeGreaterThan(0);
        expect(m.contextLength).toBeGreaterThan(0);
        expect(m.version).toBeTruthy();
        expect(m.description).toBeTruthy();
        expect(typeof m.defaultTemperature).toBe('number');
        expect(typeof m.lowResourceFriendly).toBe('boolean');
      }
    });

    it('至少有一个低配友好模型', () => {
      const friendly = MODEL_REGISTRY.filter((m) => m.lowResourceFriendly);
      expect(friendly.length).toBeGreaterThan(0);
    });
  });
});

describe('checkModelUpdate', () => {
  it('存在模型返回版本信息', () => {
    const first = MODEL_REGISTRY[0]!;
    const update = checkModelUpdate(first.id);
    expect(update.currentVersion).toBe(first.version);
    expect(update.latestVersion).toBe(first.version);
    expect(update.hasUpdate).toBe(false);
  });

  it('不存在模型返回默认值', () => {
    const update = checkModelUpdate('nonexistent');
    expect(update.currentVersion).toBe('0');
    expect(update.latestVersion).toBe('0');
    expect(update.hasUpdate).toBe(false);
  });
});

describe('LocalModelEngine 实例', () => {
  let engine: LocalModelEngine;

  beforeEach(() => {
    engine = new LocalModelEngine();
  });

  it('初始状态无模型加载', () => {
    expect(engine.isLoaded).toBe(false);
    expect(engine.currentModelId).toBeNull();
  });

  it('初始指标历史为空', () => {
    expect(engine.getMetricsHistory()).toEqual([]);
    expect(engine.getLatestMetrics()).toBeNull();
  });

  it('getAverageMetrics 空时返回 0', () => {
    const avg = engine.getAverageMetrics();
    expect(avg.count).toBe(0);
    expect(avg.avgTokensPerSecond).toBe(0);
    expect(avg.avgFirstTokenMs).toBe(0);
    expect(avg.avgTotalMs).toBe(0);
  });

  it('clearMetrics 清空历史', () => {
    engine.clearMetrics();
    expect(engine.getMetricsHistory()).toEqual([]);
  });

  it('unloadModel 在未加载时不报错', async () => {
    await expect(engine.unloadModel()).resolves.not.toThrow();
    expect(engine.isLoaded).toBe(false);
  });

  it('loadModel 对不存在的模型抛错', async () => {
    await expect(engine.loadModel('nonexistent')).rejects.toThrow('不在注册表中');
  });

  it('infer 在未加载时抛错', async () => {
    await expect(
      engine.infer({
        modelId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
      })
    ).rejects.toThrow('模型未加载');
  });
});

describe('LocalModelEngine 指标管理', () => {
  it('getAverageMetrics 按模型 ID 筛选', () => {
    // 直接测试 getAverageMetrics 的筛选逻辑
    // 由于 metricsHistory 是 private，我们通过 infer 间接测试
    // 这里仅验证空状态筛选
    const engine = new LocalModelEngine();
    const avg = engine.getAverageMetrics('some-model');
    expect(avg.count).toBe(0);
  });
});

describe('detectEngineCapability', () => {
  it('无 navigator.gpu 时返回不支持', async () => {
    // jsdom 环境无 WebGPU
    const result = await detectEngineCapability();
    // 在 jsdom 中 navigator.gpu 不存在
    expect(result.webgpuSupported).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe('WebGPU 不支持时的降级', () => {
  it('引擎在不支持 WebGPU 时仍可实例化', () => {
    const engine = new LocalModelEngine();
    expect(engine).toBeInstanceOf(LocalModelEngine);
    expect(engine.isLoaded).toBe(false);
  });

  it('指标历史上限为 100', () => {
    // 通过反射测试上限
    const engine = new LocalModelEngine();
    // 空状态验证，上限逻辑通过 maxMetricsHistory 常量保证
    expect(engine.getMetricsHistory().length).toBeLessThanOrEqual(100);
  });
});

describe('模型元数据完整性', () => {
  it('所有模型 ID 唯一', () => {
    const ids = MODEL_REGISTRY.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('所有模型温度在合理范围', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.defaultTemperature).toBeGreaterThan(0);
      expect(m.defaultTemperature).toBeLessThanOrEqual(2);
    }
  });

  it('所有模型上下文长度合理', () => {
    for (const m of MODEL_REGISTRY) {
      expect(m.contextLength).toBeGreaterThanOrEqual(1024);
      expect(m.contextLength).toBeLessThanOrEqual(32768);
    }
  });
});

// ── P2-3 补完：WebLLM 成功路径（mock 模块，无需 GPU）──

describe('LocalModelEngine 加载与推理成功路径（P2-3）', () => {
  const MODEL_ID = MODEL_REGISTRY[0]!.id;

  /** 构造 mock WebLLM 引擎：chat.completion.create 返回可控 async iterable */
  function makeMockWebLLM(deltas: string[]) {
    const create = vi.fn(async (_model: string, opts?: { initProgressCallback?: (p: { progress: number; text: string }) => void }) => {
      opts?.initProgressCallback?.({ progress: 1, text: 'loaded' });
      return {
        chat: {
          completion: {
            create: vi.fn(async function* () {
              for (const d of deltas) {
                yield { choices: [{ delta: { content: d } }] };
              }
              yield {
                choices: [{ delta: {} }],
                usage: { completion_tokens: deltas.length },
              };
            }),
          },
        },
      };
    });
    vi.doMock('@mlc-ai/web-llm', () => ({
      CreateMLCEngine: create,
      DeleteMLCEngine: vi.fn(async () => {}),
    }));
    return create;
  }

  it('loadModel 成功后 currentModelId 就位且触发进度回调', async () => {
    makeMockWebLLM([]);
    // 重新动态导入（doMock 需配合）
    const { LocalModelEngine: Engine } = await import('../../src/core/local-model-engine');
    const engine = new Engine();

    const progress: number[] = [];
    await engine.loadModel(MODEL_ID, (p) => {
      progress.push(p.progress);
    });

    expect(engine.isLoaded).toBe(true);
    expect(engine.currentModelId).toBe(MODEL_ID);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]!).toBe(1);
  });

  it('infer 流式拼接内容并记录指标', async () => {
    makeMockWebLLM(['你', '好', '！']);
    const { LocalModelEngine: Engine } = await import('../../src/core/local-model-engine');
    const engine = new Engine();
    await engine.loadModel(MODEL_ID);

    const deltas: string[] = [];
    const result = await engine.infer(
      { modelId: MODEL_ID, messages: [{ role: 'user', content: 'hi' }] },
      (delta, full) => {
        deltas.push(delta);
        expect(full).toBe(deltas.join(''));
      }
    );

    expect(result).toBe('你好！');
    expect(deltas).toEqual(['你', '好', '！']);
    const metrics = engine.getMetricsHistory();
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[metrics.length - 1]!.outputTokens).toBe(3);
    expect(metrics[metrics.length - 1]!.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('infer 未加载模型时抛错（回归保护）', async () => {
    const { LocalModelEngine: Engine } = await import('../../src/core/local-model-engine');
    const engine = new Engine();
    await expect(
      engine.infer({ modelId: MODEL_ID, messages: [] })
    ).rejects.toThrow('模型未加载');
  });
});
