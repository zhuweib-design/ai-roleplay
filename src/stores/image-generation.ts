/**
 * 图像生成 Store (模块3)
 *
 * 管理：
 * - Provider 配置
 * - 生成参数
 * - 生成状态与进度
 * - 图像画廊
 * - 持久化
 */

import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  ImageGenerationEngine,
  createDefaultParams,
  createDefaultProviderConfig,
  listStylePresets,
  type ImageGenerationParams,
  type ImageProviderConfig,
  type GeneratedImage,
  type GenerationProgress,
  type StylePresetId,
  type ProviderType,
} from '@/core/image-generation';
import {
  ImageGallery,
  persistImage,
  loadAllImages,
  deleteImage as deleteStoredImage,
  clearAllImages,
  type ImageGalleryStats,
} from '@/core/image-storage';

// ── 单例引擎 ──

const engine = new ImageGenerationEngine();

// ── Store ──

export const useImageGenerationStore = defineStore('imageGeneration', () => {
  // 状态
  const params = ref<ImageGenerationParams>(createDefaultParams());
  const providerConfig = ref<ImageProviderConfig>(createDefaultProviderConfig());
  const isGenerating = ref(false);
  const generationProgress = ref<GenerationProgress | null>(null);
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);
  const galleryLoaded = ref(false);

  // 画廊实例（非响应式，通过 list() 获取响应式快照）
  const gallery = new ImageGallery(200);
  const galleryVersion = ref(0); // 用于触发响应式更新

  // ── 计算属性 ──

  /** 画廊图像列表（响应式） */
  const galleryImages = computed<GeneratedImage[]>(() => {
    void galleryVersion.value; // 依赖触发
    return gallery.list();
  });

  /** 画廊统计 */
  const galleryStats = computed<ImageGalleryStats>(() => {
    void galleryVersion.value;
    return gallery.getStats();
  });

  /** 风格预设列表 */
  const stylePresets = computed(() => listStylePresets());

  /** 已注册 Provider 类型 */
  const providerTypes = computed<ProviderType[]>(() => engine.listProviderTypes());

  /** 是否可以生成 */
  const canGenerate = computed(
    () => providerConfig.value.apiKey.trim().length > 0 && params.value.prompt.trim().length > 0
  );

  // ── 动作 ──

  /** 更新生成参数 */
  function updateParams(partial: Partial<ImageGenerationParams>): void {
    params.value = { ...params.value, ...partial };
  }

  /** 更新 Provider 配置 */
  function updateProviderConfig(partial: Partial<ImageProviderConfig>): void {
    providerConfig.value = { ...providerConfig.value, ...partial };
  }

  /** 设置风格 */
  function setStyle(style: StylePresetId): void {
    params.value.style = style;
  }

  /** 生成单张图像 */
  async function generate(): Promise<GeneratedImage | null> {
    if (!canGenerate.value) {
      lastError.value = t('store.needPromptAndKey');
      return null;
    }

    isGenerating.value = true;
    lastError.value = null;

    try {
      const image = await engine.generate(params.value, providerConfig.value);
      gallery.add(image);
      galleryVersion.value++;
      lastInfo.value = t('store.genSuccess');

      // 异步持久化（不阻塞）
      void persistImage(image).catch(() => {
        // 持久化失败不影响内存画廊
      });

      return image;
    } catch (err) {
      lastError.value = t('store.genFailed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      isGenerating.value = false;
    }
  }

  /** 批量生成 */
  async function generateBatch(): Promise<GeneratedImage[]> {
    if (!canGenerate.value) {
      lastError.value = t('store.needPromptAndKey');
      return [];
    }

    isGenerating.value = true;
    lastError.value = null;
    const results: GeneratedImage[] = [];

    try {
      const images = await engine.generateBatch(
        params.value,
        providerConfig.value,
        (progress, image) => {
          generationProgress.value = progress;
          if (image) {
            gallery.add(image);
            galleryVersion.value++;
            results.push(image);
            // 异步持久化
            void persistImage(image).catch(() => {});
          }
        }
      );

      lastInfo.value = t('imgGen.batchDone2', { count: results.length });
      return images;
    } catch (err) {
      lastError.value = t('imgGen.batchFailed', { error: err instanceof Error ? err.message : String(err) });
      return results;
    } finally {
      isGenerating.value = false;
      generationProgress.value = null;
    }
  }

  /** 取消生成（当前实现仅标记状态，实际取消需 Provider 支持） */
  function cancelGeneration(): void {
    isGenerating.value = false;
    generationProgress.value = null;
    lastInfo.value = t('imgGen.cancelled');
  }

  /** 从画廊删除图像 */
  async function deleteFromGallery(id: string): Promise<void> {
    gallery.delete(id);
    galleryVersion.value++;
    void deleteStoredImage(id).catch(() => {});
  }

  /** 清空画廊 */
  async function clearGallery(): Promise<void> {
    gallery.clear();
    galleryVersion.value++;
    void clearAllImages().catch(() => {});
    lastInfo.value = t('imgGen.galleryCleared2');
  }

  /** 搜索画廊 */
  function searchGallery(query: string): GeneratedImage[] {
    return gallery.search(query);
  }

  /** 按风格筛选画廊 */
  function filterGalleryByStyle(style: string): GeneratedImage[] {
    return gallery.filterByStyle(style);
  }

  /** 从 IndexedDB 加载历史图像 */
  async function loadGallery(): Promise<void> {
    if (galleryLoaded.value) return;
    try {
      const images = await loadAllImages();
      gallery.addBatch(images);
      galleryVersion.value++;
      galleryLoaded.value = true;
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityGallery'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** 重置参数到默认 */
  function resetParams(): void {
    params.value = createDefaultParams();
  }

  function clearLastError(): void {
    lastError.value = null;
  }

  function clearLastInfo(): void {
    lastInfo.value = null;
  }

  return {
    // 状态
    params,
    providerConfig,
    isGenerating,
    generationProgress,
    lastError,
    lastInfo,
    // 计算属性
    galleryImages,
    galleryStats,
    stylePresets,
    providerTypes,
    canGenerate,
    // 动作
    updateParams,
    updateProviderConfig,
    setStyle,
    generate,
    generateBatch,
    cancelGeneration,
    deleteFromGallery,
    clearGallery,
    searchGallery,
    filterGalleryByStyle,
    loadGallery,
    resetParams,
    clearLastError,
    clearLastInfo,
  };
});
