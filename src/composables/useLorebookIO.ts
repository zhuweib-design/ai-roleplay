/**
 * useLorebookIO — 导入 / 导出 / AI 生成与扩写（R1-3）
 *
 * 自 WorldBookView（原 3115 行）提出。Toast 由宿主注入（`showToast`）：
 * 反馈提示是**页级** UI 状态，不是这套 IO 逻辑的私有物，两条 composable 各存一份
 * 就会有两个 Toast。
 *
 * `hasApiProfile` 读的是 settings store 的 activeApiProfileId —— 这里刻意不用
 * 当前角色的 per-role 绑定：这一页是**管理页**，生成世界书走的是全局配置，
 * 角色绑定只影响对话时用哪个模型。
 */
import { ref, computed } from 'vue';
import { useLorebookStore } from '@/stores/lorebook';
import { useSettingsStore } from '@/stores/settings';
import { useCharacterStore } from '@/stores/character';
import type { WorldTemplateId } from '@core/world-generator';
import { t } from '@/i18n';

type ToastKind = 'info' | 'success' | 'error';

export function useLorebookIO(showToast: (type: ToastKind, message: string) => void) {
  const store = useLorebookStore();
  const settingsStore = useSettingsStore();
  const characterStore = useCharacterStore();

  // 迭代27 · F06.8: 世界生成 Modal 状态
  const generateModalOpen = ref(false);
  const selectedTemplateId = ref<WorldTemplateId>('fantasy');
  const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);

  /**
   * 生成的这本世界归谁：'' = 全局（所有角色都注入），否则归属该角色并自动绑到他身上。
   */
  const generateOwnerId = ref('');

  function exportLorebook(id: string) {
    void store.downloadLorebook(id);
  }

  /** 打开生成 Modal */
  function openGenerateModal() {
    if (!hasApiProfile.value) {
      showToast('error', t('wb.needApi'));
      return;
    }
    generateModalOpen.value = true;
  }

  /** 关闭生成 Modal */
  function closeGenerateModal() {
    if (store.isGeneratingWorld) return; // 生成中禁止关闭
    generateModalOpen.value = false;
  }

  /** 选择模板 */
  function selectTemplate(id: WorldTemplateId) {
    selectedTemplateId.value = id;
  }

  /** 执行 AI 生成新世界 */
  async function confirmGenerate() {
    const ownerId = generateOwnerId.value;
    const lbId = await store.generateRandomWorldbook(
      selectedTemplateId.value,
      ownerId ? 'character' : 'global',
      undefined,
      ownerId || undefined
    );
    if (lbId) {
      // 角色侧的 boundWorldBookIds 才是生效判定的正向数据源，光写书上的 characterId 不够
      if (ownerId) {
        characterStore.bindWorldBook(ownerId, lbId);
        // 回显要说清"绑给谁、这次对话能吃到几条"
        const ownerName = characterStore.characters.find((c) => c.id === ownerId)?.name ?? ownerId;
        const count = store.lorebooks.find((l) => l.id === lbId)?.entries.length ?? 0;
        showToast('success', t('wb.genDoneBound', { owner: ownerName, count }));
      } else {
        showToast('success', store.lastInfo ?? t('wb.generated'));
      }
      generateModalOpen.value = false;
    } else {
      showToast('error', store.lastError ?? t('wb.generateFailed'));
    }
  }

  /** 扩展当前 Lorebook */
  async function extendCurrentWorldbook() {
    if (!store.currentLorebookId) {
      showToast('error', t('wb.selectWorldbook'));
      return;
    }
    if (!hasApiProfile.value) {
      showToast('error', t('wb.needApi'));
      return;
    }
    const added = await store.extendWorldbook(store.currentLorebookId);
    if (added > 0) {
      showToast('success', store.lastInfo ?? t('wb.extended', { count: added }));
    } else {
      showToast('error', store.lastError ?? t('wb.extendFailed'));
    }
  }

  return {
    generateModalOpen,
    selectedTemplateId,
    generateOwnerId,
    hasApiProfile,
    exportLorebook,
    openGenerateModal,
    closeGenerateModal,
    selectTemplate,
    confirmGenerate,
    extendCurrentWorldbook,
  };
}
