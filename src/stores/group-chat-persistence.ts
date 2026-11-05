/**
 * 群聊 store · 持久化（R4-6 自 stores/group-chat.ts 切出）
 *
 * 工厂形态：storageAdapter / loadInFlight 是实例状态，封在闭包里，
 * 避免模块级单例被多个 store 实例共享（DEV_PLAN §7.12 O-11）。
 * `loaded` 由宿主持有并传入（深链闸门与视图都要读它）。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { StorageAdapter } from '@/storage/storage-adapter';
import { mergeKeptLocal } from '@/core/store-merge';
import type { GroupChat } from '@/core/group-chat';

export interface GroupPersistenceDeps {
  groups: Ref<GroupChat[]>;
  currentGroupId: Ref<string | null>;
  loaded: Ref<boolean>;
  lastError: Ref<string | null>;
}

export function createGroupPersistenceOps(deps: GroupPersistenceDeps) {
  const {
    groups,
    currentGroupId,
    loaded,
    lastError,
  } = deps;

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

  // loadInFlight 保证并发调用只起一次读（loaded 由宿主持有，见 deps）
  let loadInFlight: Promise<void> | null = null;

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const list = await storageAdapter.loadGroupChats();
      // 首帧窗口内新建的群聊要留住，理由同世界书（见 core/store-merge）
      groups.value = mergeKeptLocal(list, groups.value);
      if (list.length > 0 && !currentGroupId.value) {
        currentGroupId.value = list[0]!.id;
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityGroup'), error: err instanceof Error ? err.message : String(err) });
    } finally {
      loaded.value = true;
    }
  }

  /**
   * 等群列表读完（还没开始就自己开始），并保证只读一遍。
   *
   * `/group?group=<id>` 要在读库完成之后才认得出那个 id；没闸门时深链会静默不命中
   * （M12-a 在版本页上踩过的同一件事）。App.vue 的启动加载也走这里，两处不再各起一次读。
   */
  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return;
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      try {
        await loadFromStorage();
      } finally {
        loadInFlight = null;
      }
    })();
    return loadInFlight;
  }

  async function persistGroup(id: string): Promise<void> {
    if (!storageAdapter) return;
    const g = groups.value.find((x) => x.id === id);
    if (!g) return;
    try {
      g.updatedAt = new Date().toISOString();
      await storageAdapter.saveGroupChat(g);
    } catch (err) {
      lastError.value = t('store.saveFailed', { name: t('store.entityGroup'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deleteGroupChat(id);
    } catch (err) {
      lastError.value = t('store.deleteFailed', { name: t('store.entityGroup'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** 供 NPC 工厂保存新建角色卡（适配器归本工厂所有，不再另存一份） */
  function getStorageAdapter(): StorageAdapter | null {
    return storageAdapter;
  }

  return {
    setStorageAdapter,
    getStorageAdapter,
    loadFromStorage,
    ensureLoaded,
    persistGroup,
    deleteFromStorage,
  };
}
