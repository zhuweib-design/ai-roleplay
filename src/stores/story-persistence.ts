/**
 * 故事 store · 持久化（R4-5 自 stores/story.ts 切出）
 *
 * 工厂形态：storageAdapter / libraryLoaded / loadInFlight 是实例状态，封在闭包里，
 * 避免模块级单例被多个 store 实例共享（见 R4-4 O-11）。
 */
import { ref, type Ref } from 'vue';
import { t } from '@/i18n';
import type { StorageAdapter } from '@/storage/storage-adapter';
import { getStorageAdapter } from '@/storage/storage-factory';
import { mergeKeptLocal } from '@/core/store-merge';
import type { StoryAnalysisResult } from '@core/story-types';

export interface StoryPersistenceDeps {
  stories: Ref<StoryAnalysisResult[]>;
  currentStoryId: Ref<string | null>;
  lastError: Ref<string | null>;
}

export function createStoryPersistenceOps(deps: StoryPersistenceDeps) {
  const { stories, currentStoryId, lastError } = deps;

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

  /**
   * 故事列表是否已从存档读完。深链（`?story=<id>`）据此决定何时解析 id——
   * 读库没完成时 `stories` 还是空的/旧的，直接判会"静默不选中"（M12-a 的角色版本
   * 更糟，会悄悄写到另一条记录上，见 stores/character.ts 的同名闸门）。
   */
  const libraryLoaded = ref(false);
  let loadInFlight: Promise<void> | null = null;

  // ── 依赖注入 ──

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  // ── 持久化 ──

  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const list = await storageAdapter.loadStories();
      // 首帧窗口内新建的故事线要留住，理由同世界书（见 core/store-merge）
      stories.value = mergeKeptLocal(list, stories.value);
      if (list.length > 0 && !currentStoryId.value) {
        currentStoryId.value = list[0]!.id;
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityStory'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** 视图可能比 App.vue 的注入更早挂载，所以自己把适配器准备好 */
  async function ensureStorageAdapter(): Promise<StorageAdapter | null> {
    if (storageAdapter) return storageAdapter;
    try {
      const adapter = getStorageAdapter();
      await adapter.init();
      storageAdapter = adapter;
      return adapter;
    } catch {
      return null;
    }
  }

  /**
   * 等故事列表读完（没开始就自己开始，并发只读一遍）。
   * 与 `stores/character.ts` 的同名方法是同一个契约，深链视图必须先等它再按 id 找数据。
   */
  async function ensureLoaded(): Promise<void> {
    if (libraryLoaded.value) return;
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      try {
        await ensureStorageAdapter();
        await loadFromStorage();
      } finally {
        libraryLoaded.value = true;
        loadInFlight = null;
      }
    })();
    return loadInFlight;
  }

  async function persistStory(id: string): Promise<void> {
    if (!storageAdapter) return;
    const story = stories.value.find((s) => s.id === id);
    if (!story) return;
    try {
      await storageAdapter.saveStory(story);
    } catch (err) {
      lastError.value = t('store.saveFailed', { name: t('store.entityStory'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deleteStory(id);
    } catch (err) {
      lastError.value = t('store.deleteFailed', { name: t('store.entityStory'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    setStorageAdapter,
    loadFromStorage,
    ensureStorageAdapter,
    ensureLoaded,
    persistStory,
    deleteFromStorage,
    libraryLoaded,
  };
}
