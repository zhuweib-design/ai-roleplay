/**
 * useCharacterImport — 角色卡 V2 导入 / 拖拽 / 运行时同步重试
 *
 * 从 CharactersView 抽出（O-9 二次瘦身）。这一整块是「把用户给的 .json 文件
 * 变成 store 里的角色，再把它们同步到聊天运行时」的独立流程，与页面的
 * 头部/筛选/排序/删除/生成互不相干，只通过三个入口与宿主耦合：
 *
 * - `showToast`：统一反馈出口（宿主持有 Toast 状态与 store 错误监听）
 * - `pendingRuntimeIds`：跨会话的「未同步成功」队列（宿主负责 localStorage 持久化，
 *   因为它在 setup 期就要读一次，早于本 composable 的调用时机）
 * - `fileInput`：模板 ref，必须在宿主 setup 里用 `useTemplateRef` 创建
 *
 * 状态全部是 ref，随组件实例生灭；模块级零可变状态（O-5 的纪律）。
 */
import { ref, type Ref, type ShallowRef } from 'vue';
import type { useCharacterStore } from '@/stores/character';
import type { useChatStore } from '@/stores/chat';
import type { UICharacter } from '@/types';
import { t } from '@/i18n';

type ToastType = 'info' | 'success' | 'error';

export interface CharacterImportDeps {
  characterStore: ReturnType<typeof useCharacterStore>;
  chatStore: ReturnType<typeof useChatStore>;
  showToast: (type: ToastType, message: string) => void;
  pendingRuntimeIds: Ref<string[]>;
  fileInput: Readonly<ShallowRef<HTMLInputElement | null>>;
}

export function useCharacterImport(deps: CharacterImportDeps) {
  const { characterStore, chatStore, showToast, pendingRuntimeIds, fileInput } = deps;

  const isDragging = ref(false);
  const importBusy = ref(false);
  const importProgress = ref(0);
  const importTotal = ref(0);

  function triggerFileInput(): void {
    fileInput.value?.click();
  }

  /**
   * 把刚导入的角色批量同步到聊天运行时。
   *
   * 每 50 个一批：单个请求体积有上限，且失败时能只重试失败的那一批。
   * 返回成功同步的数量；失败与部分失败的 id 会并回 `pendingRuntimeIds`，
   * 由页面上的「重试」按钮兜底。
   */
  async function syncImportedCharacters(ids: string[]): Promise<number> {
    const characters = ids.map((id) => characterStore.characters.find((character) => character.id === id))
      .filter((character): character is UICharacter => Boolean(character));
    const failed: string[] = [];
    let synced = 0;
    for (let index = 0; index < characters.length; index += 50) {
      const batch = characters.slice(index, index + 50);
      const result = await chatStore.createRuntimeCharactersBatch(batch);
      if (!result) {
        failed.push(...batch.map((character) => character.id));
        continue;
      }
      failed.push(...result.items.filter((item) => item.status === 'invalid')
        .map((item) => batch[item.index]?.id)
        .filter((id): id is string => Boolean(id)));
      synced += result.items.filter((item) => item.status !== 'invalid').length;
    }
    pendingRuntimeIds.value = [...new Set([...pendingRuntimeIds.value.filter((id) => !ids.includes(id)), ...failed])];
    return synced;
  }

  async function importFiles(files: File[]): Promise<void> {
    if (importBusy.value || files.length === 0) return;
    if (files.length > 50) {
      showToast('error', t('characters.importLimit'));
      return;
    }
    importBusy.value = true;
    importTotal.value = files.length;
    importProgress.value = 0;
    const importedIds: string[] = [];
    let failed = 0;
    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
          failed += 1;
        } else {
          const id = await characterStore.importV2File(file);
          if (id) importedIds.push(id);
          else failed += 1;
        }
        importProgress.value += 1;
      }
      const synced = importedIds.length ? await syncImportedCharacters(importedIds) : 0;
      if (failed > 0 || synced < importedIds.length) {
        showToast('error', t('characters.importSummary', {
          count: importedIds.length, synced, failed: failed + importedIds.length - synced,
        }));
      } else {
        showToast('success', t('characters.importSummary', { count: importedIds.length, synced, failed: 0 }));
      }
    } finally {
      importBusy.value = false;
    }
  }

  async function retryRuntimeSync(): Promise<void> {
    if (importBusy.value || pendingRuntimeIds.value.length === 0) return;
    importBusy.value = true;
    try {
      const ids = [...pendingRuntimeIds.value];
      const synced = await syncImportedCharacters(ids);
      showToast(pendingRuntimeIds.value.length ? 'error' : 'success', t('characters.importSummary', {
        count: ids.length, synced, failed: pendingRuntimeIds.value.length,
      }));
    } finally {
      importBusy.value = false;
    }
  }

  async function handleFileSelected(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    await importFiles(files);
  }

  async function handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    isDragging.value = false;
    await importFiles([...(e.dataTransfer?.files ?? [])]);
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    isDragging.value = true;
  }

  function handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      isDragging.value = false;
    }
  }

  return {
    isDragging,
    importBusy,
    importProgress,
    importTotal,
    triggerFileInput,
    importFiles,
    retryRuntimeSync,
    handleFileSelected,
    handleDrop,
    handleDragOver,
    handleDragLeave,
  };
}
