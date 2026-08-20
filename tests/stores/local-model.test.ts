/**
 * local-model store 单元测试 (模块2)
 *
 * 覆盖：
 * - 初始状态
 * - 设置更新
 * - 缓存管理
 * - 指标管理
 * - 计算属性
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLocalModelStore } from '../../src/stores/local-model';
import { listRegisteredModels } from '../../src/core/local-model-engine';

describe('local-model store (模块2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('初始状态', () => {
    it('capability 为 null', () => {
      const store = useLocalModelStore();
      expect(store.capability).toBeNull();
    });

    it('loadedModelId 为 null', () => {
      const store = useLocalModelStore();
      expect(store.loadedModelId).toBeNull();
    });

    it('isLoading 为 false', () => {
      const store = useLocalModelStore();
      expect(store.isLoading).toBe(false);
    });

    it('isInferring 为 false', () => {
      const store = useLocalModelStore();
      expect(store.isInferring).toBe(false);
    });

    it('lastError 与 lastInfo 初始为 null', () => {
      const store = useLocalModelStore();
      expect(store.lastError).toBeNull();
      expect(store.lastInfo).toBeNull();
    });

    it('metricsHistory 为空数组', () => {
      const store = useLocalModelStore();
      expect(store.metricsHistory).toEqual([]);
    });

    it('settings 有默认值', () => {
      const store = useLocalModelStore();
      expect(store.settings.preferLocal).toBe(true);
      expect(store.settings.cacheCapacity).toBe(50);
      expect(store.settings.cacheTtlMs).toBe(30 * 60 * 1000);
      expect(store.settings.defaultTemperature).toBe(0.7);
      expect(store.settings.defaultMaxTokens).toBe(1024);
    });
  });

  describe('计算属性', () => {
    it('models 仅含已下载模型并携带 status 字段', () => {
      const store = useLocalModelStore();
      // 默认无下载：not-downloaded 被过滤 → 空数组（e770710 语义：仅展示真实已下载）
      expect(store.models).toEqual([]);

      // 注入一个已下载状态后，models 应仅含该模型且带 status
      const firstId = listRegisteredModels()[0].id;
      // Pinia setup store 解包 ref：store.modelStatuses 已是 Map 本身（无 .value）
      store.modelStatuses.set(firstId, 'ready');
      expect(store.models.length).toBe(1);
      expect(store.models[0]).toHaveProperty('status');
      expect(store.models[0].status).toBe('ready');
      expect(store.models[0].id).toBe(firstId);
    });

    it('loadedModel 在未加载时为 null', () => {
      const store = useLocalModelStore();
      expect(store.loadedModel).toBeNull();
    });

    it('isAvailable 在未检测时为 false', () => {
      const store = useLocalModelStore();
      expect(store.isAvailable).toBe(false);
    });

    it('cacheStats 返回统计信息', () => {
      const store = useLocalModelStore();
      const stats = store.cacheStats;
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxCapacity');
      expect(stats).toHaveProperty('hitRate');
    });

    it('averageMetrics 初始为 0', () => {
      const store = useLocalModelStore();
      expect(store.averageMetrics.count).toBe(0);
    });
  });

  describe('缓存管理', () => {
    it('clearCache 清空缓存', () => {
      const store = useLocalModelStore();
      store.clearCache();
      expect(store.cacheStats.size).toBe(0);
      expect(store.lastInfo).toContain('清空');
    });

    it('purgeExpiredCache 无过期时返回 0', () => {
      const store = useLocalModelStore();
      const purged = store.purgeExpiredCache();
      expect(purged).toBe(0);
    });
  });

  describe('指标管理', () => {
    it('clearMetrics 清空指标', () => {
      const store = useLocalModelStore();
      store.clearMetrics();
      expect(store.metricsHistory).toEqual([]);
      expect(store.lastInfo).toContain('清空');
    });
  });

  describe('设置更新', () => {
    it('updateSettings 更新 preferLocal', () => {
      const store = useLocalModelStore();
      store.updateSettings({ preferLocal: false });
      expect(store.settings.preferLocal).toBe(false);
    });

    it('updateSettings 更新 cacheCapacity', () => {
      const store = useLocalModelStore();
      store.updateSettings({ cacheCapacity: 100 });
      expect(store.settings.cacheCapacity).toBe(100);
      expect(store.cacheStats.maxCapacity).toBe(100);
    });

    it('updateSettings 更新 defaultTemperature', () => {
      const store = useLocalModelStore();
      store.updateSettings({ defaultTemperature: 0.5 });
      expect(store.settings.defaultTemperature).toBe(0.5);
    });

    it('updateSettings 部分更新不覆盖其他字段', () => {
      const store = useLocalModelStore();
      const original = { ...store.settings };
      store.updateSettings({ preferLocal: false });
      expect(store.settings.preferLocal).toBe(false);
      expect(store.settings.cacheCapacity).toBe(original.cacheCapacity);
      expect(store.settings.cacheTtlMs).toBe(original.cacheTtlMs);
    });
  });

  describe('错误处理', () => {
    it('clearLastError 清空错误', () => {
      const store = useLocalModelStore();
      store.clearLastError();
      expect(store.lastError).toBeNull();
    });

    it('clearLastInfo 清空信息', () => {
      const store = useLocalModelStore();
      store.clearLastInfo();
      expect(store.lastInfo).toBeNull();
    });
  });

  describe('loadModel（无 WebGPU 环境）', () => {
    it('未检测能力时加载失败', async () => {
      const store = useLocalModelStore();
      const ok = await store.loadModel('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('不可用');
    });

    it('不存在的模型 ID 加载失败', async () => {
      const store = useLocalModelStore();
      // 先模拟能力可用
      store.capability = {
        webgpuSupported: true,
        webllmInstalled: true,
        browserName: 'Test',
        estimatedVramMb: 4096,
        wasmSupported: true,
      };
      const ok = await store.loadModel('nonexistent-model');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('不在注册表');
    });
  });

  describe('infer（未加载模型）', () => {
    it('未加载模型时 infer 抛错', async () => {
      const store = useLocalModelStore();
      await expect(
        store.infer({
          modelId: 'test',
          messages: [{ role: 'user', content: 'hello' }],
        })
      ).rejects.toThrow('模型未加载');
    });
  });

  describe('resetAll', () => {
    it('重置后恢复默认设置', async () => {
      const store = useLocalModelStore();
      store.updateSettings({ preferLocal: false, cacheCapacity: 200 });
      await store.resetAll();
      expect(store.settings.preferLocal).toBe(true);
      expect(store.settings.cacheCapacity).toBe(50);
      expect(store.loadedModelId).toBeNull();
      expect(store.metricsHistory).toEqual([]);
    });
  });
});
