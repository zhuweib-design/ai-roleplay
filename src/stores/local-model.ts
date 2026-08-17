/**
 * 本地模型 Store (模块2)
 *
 * 管理本地模型推理的状态与操作：
 * - 引擎能力检测状态
 * - 模型加载/卸载
 * - 推理执行（带缓存）
 * - 性能指标展示
 * - 缓存管理
 * - 设置持久化
 */

import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  LocalModelEngine,
  detectEngineCapability,
  listRegisteredModels,
  findModel,
  type EngineCapability,
  type LocalModelMeta,
  type ModelStatus,
  type LoadProgress,
  type InferenceMetrics,
  type LocalInferenceRequest,
} from '@/core/local-model-engine';
import {
  InferenceCache,
  buildCacheKey,
  type CacheStats,
} from '@/core/inference-cache';

// ── 类型 ──

export interface LocalModelSettings {
  /** 是否优先使用本地推理 */
  preferLocal: boolean;
  /** 缓存容量 */
  cacheCapacity: number;
  /** 缓存 TTL（毫秒） */
  cacheTtlMs: number;
  /** 默认温度 */
  defaultTemperature: number;
  /** T-05:默认 top-p 采样（0-1，默认 0.95） */
  defaultTopP: number;
  /** 默认最大 tokens */
  defaultMaxTokens: number;
}

// ── 默认配置 ──

function createDefaultSettings(): LocalModelSettings {
  return {
    preferLocal: true,
    cacheCapacity: 50,
    cacheTtlMs: 30 * 60 * 1000,
    defaultTemperature: 0.7,
    defaultTopP: 0.95,
    defaultMaxTokens: 1024,
  };
}

// ── 单例引擎 ──

const engine = new LocalModelEngine();

// ── Store ──

export const useLocalModelStore = defineStore('localModel', () => {
  // 状态
  const capability = ref<EngineCapability | null>(null);
  const isDetecting = ref(false);
  const loadedModelId = ref<string | null>(null);
  const isLoading = ref(false);
  const loadProgress = ref<LoadProgress | null>(null);
  const modelStatuses = ref<Map<string, ModelStatus>>(new Map());
  const settings = ref<LocalModelSettings>(createDefaultSettings());
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);
  const metricsHistory = ref<InferenceMetrics[]>([]);
  const isInferring = ref(false);

  // 缓存实例（非响应式）
  const cache = new InferenceCache<string>(
    settings.value.cacheCapacity,
    settings.value.cacheTtlMs
  );

  // ── 计算属性 ──

  /** 已下载/可用的本地模型（过滤掉未下载的预设注册项，仅读真实数据） */
  const models = computed<Array<LocalModelMeta & { status: ModelStatus }>>(() => {
    return listRegisteredModels()
      .map((m) => ({
        ...m,
        status: modelStatuses.value.get(m.id) ?? 'not-downloaded',
      }))
      .filter((m) => m.status !== 'not-downloaded');
  });

  /** 当前已加载模型元数据 */
  const loadedModel = computed<LocalModelMeta | null>(() => {
    if (!loadedModelId.value) return null;
    return findModel(loadedModelId.value);
  });

  /** 是否可用本地推理（WebGPU 或 WASM 降级，T-05） */
  const isAvailable = computed(
    () =>
      capability.value?.webllmInstalled === true &&
      (capability.value?.webgpuSupported === true || capability.value?.wasmSupported === true)
  );

  /** T-05:当前实际运行后端（webgpu | wasm | none） */
  const activeBackend = computed<'webgpu' | 'wasm' | 'none'>(() => {
    if (!capability.value) return 'none';
    if (capability.value.webgpuSupported) return 'webgpu';
    if (capability.value.wasmSupported) return 'wasm';
    return 'none';
  });

  /** 缓存统计 */
  const cacheStats = computed<CacheStats>(() => cache.getStats());

  /** 平均性能指标 */
  const averageMetrics = computed(() => engine.getAverageMetrics());

  // ── 动作 ──

  /** 检测引擎能力 */
  async function detectCapability(): Promise<void> {
    isDetecting.value = true;
    lastError.value = null;
    try {
      capability.value = await detectEngineCapability();
      if (!capability.value.webgpuSupported) {
        lastError.value = capability.value.reason ?? t('store.webgpuUnavailable');
      } else if (!capability.value.webllmInstalled) {
        lastError.value = t('store.webllmNotInstalled');
      }
    } catch (err) {
      lastError.value = t('store.detectFailed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      isDetecting.value = false;
    }
  }

  /** 加载模型 */
  async function loadModel(modelId: string): Promise<boolean> {
    const meta = findModel(modelId);
    if (!meta) {
      lastError.value = t('store.modelNotInRegistry', { id: modelId });
      return false;
    }

    if (!isAvailable.value) {
      lastError.value = t('lm.unavailableFirst');
      return false;
    }

    if (loadedModelId.value === modelId) {
      lastInfo.value = t('lm.loaded3', { name: meta.name });
      return true;
    }

    isLoading.value = true;
    loadProgress.value = null;
    modelStatuses.value.set(modelId, 'loading');

    try {
      await engine.loadModel(modelId, (progress) => {
        loadProgress.value = progress;
        if (progress.progress > 0 && progress.progress < 1) {
          modelStatuses.value.set(modelId, 'downloading');
        }
      });

      loadedModelId.value = modelId;
      modelStatuses.value.set(modelId, 'loaded');
      lastInfo.value = t('lm.loadedReady', { name: meta.name });
      loadProgress.value = null;
      return true;
    } catch (err) {
      modelStatuses.value.set(modelId, 'error');
      lastError.value = t('lm.loadFailed2', { error: err instanceof Error ? err.message : String(err) });
      loadProgress.value = null;
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /** 卸载当前模型 */
  async function unloadModel(): Promise<void> {
    if (!loadedModelId.value) return;
    const oldId = loadedModelId.value;
    await engine.unloadModel();
    loadedModelId.value = null;
    modelStatuses.value.set(oldId, 'ready');
    lastInfo.value = t('lm.unloaded2');
  }

  /**
   * 执行推理（带缓存）
   *
   * @param request 推理请求
   * @param onDelta 流式回调
   * @returns 完整结果
   */
  async function infer(
    request: LocalInferenceRequest,
    onDelta?: (delta: string, fullContent: string) => void
  ): Promise<string> {
    if (!loadedModelId.value || loadedModelId.value !== request.modelId) {
      throw new Error(t('lm.modelNotLoaded'));
    }

    // 缓存命中检查（仅当无 onDelta 时使用缓存，流式场景不走缓存）
    if (!onDelta) {
      const cacheKey = buildCacheKey(
        request.modelId,
        request.messages,
        request.temperature ?? settings.value.defaultTemperature
      );
      const cached = cache.get(cacheKey);
      if (cached !== null) {
        lastInfo.value = t('lm.cacheHit2');
        return cached;
      }

      // 执行推理
      isInferring.value = true;
      try {
        const result = await engine.infer(request);
        cache.set(cacheKey, result);
        metricsHistory.value = engine.getMetricsHistory();
        return result;
      } finally {
        isInferring.value = false;
      }
    }

    // 流式推理（完成后同样写入缓存，P2-3 修复：此前流式路径永不缓存，命中率≈0）
    isInferring.value = true;
    try {
      const cacheKey = buildCacheKey(
        request.modelId,
        request.messages,
        request.temperature ?? settings.value.defaultTemperature
      );
      const result = await engine.infer(request, onDelta);
      cache.set(cacheKey, result);
      metricsHistory.value = engine.getMetricsHistory();
      return result;
    } finally {
      isInferring.value = false;
    }
  }

  /** 清空缓存 */
  function clearCache(): void {
    cache.clear();
    lastInfo.value = t('lm.cacheCleared2');
  }

  /** 清理过期缓存 */
  function purgeExpiredCache(): number {
    const purged = cache.purgeExpired();
    if (purged > 0) {
      lastInfo.value = t('lm.purged2', { count: purged });
    }
    return purged;
  }

  /** 清空性能指标 */
  function clearMetrics(): void {
    engine.clearMetrics();
    metricsHistory.value = [];
    lastInfo.value = t('lm.metricsCleared2');
  }

  /** 更新设置 */
  function updateSettings(partial: Partial<LocalModelSettings>): void {
    settings.value = { ...settings.value, ...partial };

    if (partial.cacheCapacity) {
      cache.resize(partial.cacheCapacity);
    }
    if (partial.cacheTtlMs) {
      cache.setTtl(partial.cacheTtlMs);
    }
  }

  /** 重置全部 */
  async function resetAll(): Promise<void> {
    await unloadModel();
    clearCache();
    clearMetrics();
    settings.value = createDefaultSettings();
    cache.resize(settings.value.cacheCapacity);
    cache.setTtl(settings.value.cacheTtlMs);
    modelStatuses.value.clear();
    lastError.value = null;
    lastInfo.value = t('lm.settingsReset');
  }

  function clearLastError(): void {
    lastError.value = null;
  }

  function clearLastInfo(): void {
    lastInfo.value = null;
  }

  return {
    // 状态
    capability,
    isDetecting,
    loadedModelId,
    isLoading,
    loadProgress,
    modelStatuses,
    settings,
    lastError,
    lastInfo,
    metricsHistory,
    isInferring,
    // 计算属性
    models,
    loadedModel,
    isAvailable,
    activeBackend,
    cacheStats,
    averageMetrics,
    // 动作
    detectCapability,
    loadModel,
    unloadModel,
    infer,
    clearCache,
    purgeExpiredCache,
    clearMetrics,
    updateSettings,
    resetAll,
    clearLastError,
    clearLastInfo,
  };
});
