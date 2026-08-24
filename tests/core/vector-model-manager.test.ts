/**
 * vector-model-manager — 向量模型选择与生命周期 (需求 3) 测试
 *
 * 覆盖:
 * - 模型注册表:各模型维度/浏览器安全/角色
 * - 浏览器端自动降级 bge-small-zh-v1.5(不论角色)
 * - 桌面端按角色默认(gte-large-quant 动态 / bge-large-zh-v1.5 静态)
 * - 用户显式选择优先于自动
 * - 常驻/按需加载与卸载(仿 VectorModelManager)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  selectVectorModel,
  VectorModelManager,
  VECTOR_MODELS,
  isBrowserRuntime,
  type VectorModelId,
} from '@core/vector-model-manager';
import { setBestEmbeddingModel, clearBestEmbeddingModel } from '@core/rag-benchmark';
import { MockEmbeddingProvider } from '@core/embedding';

describe('VECTOR_MODELS 注册表', () => {
  it('四个模型齐备且维度正确', () => {
    expect(VECTOR_MODELS['bge-large-zh-v1.5'].dim).toBe(1024);
    expect(VECTOR_MODELS['bge-large-zh-v1.5-int8-onnx'].dim).toBe(1024);
    expect(VECTOR_MODELS['bge-small-zh-v1.5'].dim).toBe(512);
    expect(VECTOR_MODELS['gte-large-zh-int8-onnx'].dim).toBe(1024);
    expect(VECTOR_MODELS['bge-small-zh-v1.5'].browserSafe).toBe(true);
    expect(VECTOR_MODELS['gte-large-zh-int8-onnx'].role).toBe('dynamic');
  });
});

describe('selectVectorModel (需求 3:自动切换)', () => {
  const original = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    try {
      localStorage.removeItem('aijiuguan.bestEmbeddingModel');
    } catch {
      /* 环境无 localStorage */
    }
  });
  afterEach(() => {
    if (original === undefined) {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    } else {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = original;
    }
  });

  it('浏览器端:未选择时自动切 bge-small-zh-v1.5(无论动态/静态)', () => {
    expect(selectVectorModel(undefined, 'dynamic')).toBe('bge-small-zh-v1.5');
    expect(selectVectorModel(undefined, 'static')).toBe('bge-small-zh-v1.5');
    expect(isBrowserRuntime()).toBe(true);
  });

  it('桌面端:按角色默认', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(isBrowserRuntime()).toBe(false);
    expect(selectVectorModel(undefined, 'dynamic')).toBe('gte-large-zh-int8-onnx');
    expect(selectVectorModel(undefined, 'static')).toBe('bge-large-zh-v1.5');
  });

  it('用户显式选择优先于自动切换', () => {
    expect(selectVectorModel('gte-large-zh-int8-onnx', 'static')).toBe('gte-large-zh-int8-onnx');
    expect(selectVectorModel('bge-large-zh-v1.5', 'dynamic')).toBe('bge-large-zh-v1.5');
  });

  it('择优记录作为最高优先级(超越浏览器默认)', () => {
    setBestEmbeddingModel('bge-large-zh-v1.5', 1, 100);
    expect(selectVectorModel(undefined, 'dynamic')).toBe('bge-large-zh-v1.5');
  });

  it('用户显式选择仍优先于择优记录', () => {
    setBestEmbeddingModel('bge-large-zh-v1.5', 1, 100);
    expect(selectVectorModel('bge-small-zh-v1.5', 'dynamic')).toBe('bge-small-zh-v1.5');
  });

  it('择优记录为用户自定义模型 id 时生效', () => {
    setBestEmbeddingModel('user-123-abc', 0.9, 50);
    expect(selectVectorModel(undefined, 'dynamic')).toBe('user-123-abc');
  });

  it('择优记录失效(非法 id)时回退默认', () => {
    setBestEmbeddingModel('not-a-real-model', 1, 1);
    expect(selectVectorModel(undefined, 'dynamic')).toBe('bge-small-zh-v1.5');
    clearBestEmbeddingModel();
  });
});

describe('VectorModelManager (仿附件:常驻/延迟加载/卸载)', () => {
  it('动态层常驻;静态层延迟加载;unload 释放', async () => {
    const created: VectorModelId[] = [];
    const mgr = new VectorModelManager((model) => {
      created.push(model);
      return new MockEmbeddingProvider();
    });

    // 动态层:首次调用创建
    const d1 = await mgr.providerForDynamic();
    expect(d1.name).toBe('mock');
    expect(created).toContain('bge-small-zh-v1.5');

    // 再次调用复用(不重建)
    const d2 = await mgr.providerForDynamic();
    expect(d2).toBe(d1);

    // 静态层:按需加载
    await mgr.providerForStatic();
    expect(created).toContain('bge-small-zh-v1.5');

    // 卸载静态
    mgr.unloadOnDemand();
    expect(mgr.loadedModels()).toEqual(['bge-small-zh-v1.5']);
  });

  it('默认工厂:无配置时创建成功(本地存储无远程配置→mock)', () => {
    localStorage.removeItem('aijiuguan.remoteEmbedding');
    const mgr = VectorModelManager.defaultFactory();
    expect(mgr).toBeInstanceOf(VectorModelManager);
  });
});