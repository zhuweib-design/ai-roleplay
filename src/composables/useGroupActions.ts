/**
 * useGroupActions — 群聊页的写操作（R4-9 从 GroupChatView 拆出）
 *
 * 归它管的：建群 / 删群 / SillyTavern 导入导出 / 随机 NPC 生成 / 发言模式切换，
 * 以及这些动作背后的弹窗开关与"上线校验"。
 * 不归它管：列表选中与深链（宿主留 selectGroup）、消息发送（useGroupComposer）、
 * 成员增删（useGroupMembers）、归档恢复（useGroupLifecycle）、Toast 渲染（宿主）。
 *
 * deps 只传两项：
 * - `showToast`：四个 composable 共用的唯一出口，必须由宿主持有实例，
 *   否则同一操作会在两处弹不同 toast。
 * - `selectGroup`：建群后顺手选中新群，而选中牵着地址栏 replace 与手机两级互换的
 *   压栈顺序（见宿主 selectGroup 上的长注释），抽进来会把 useDrilldown 一起拽走。
 *
 * store 与 useViewport 内部自取：全局单例，注入只会让签名变长。
 */
import { computed, ref } from 'vue';
import { useGroupChatStore } from '@/stores/group-chat';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useViewport } from '@/core/viewport';
import { uiCharToGroupCard } from '@/services/type-adapters';
import { t } from '@/i18n';
import type { GroupChatMode } from '@/core/group-chat';
import type { CharacterTemplateId } from '@core/character-generator';
import type { ToastKind } from '@/composables/useGroupComposer';

export interface GroupActionsOptions {
  showToast: (type: ToastKind, message: string) => void;
  selectGroup: (id: string) => void;
}

export function useGroupActions(options: GroupActionsOptions) {
  const groupStore = useGroupChatStore();
  const chatStore = useChatStore();
  const characterStore = useCharacterStore();
  const settingsStore = useSettingsStore();
  const { isMobile } = useViewport();

  const { showToast, selectGroup } = options;

  const currentGroup = computed(() => groupStore.currentGroup);

  const createModalOpen = ref(false);
  const deleteGroupTargetId = ref<string | null>(null);
  const deleteModalOpen = ref(false);

  // ── F10.3 随机 NPC 生成状态 ──
  const npcModalOpen = ref(false);
  const npcGenerating = computed(() => groupStore.isGeneratingNpc);
  const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);

  function openCreateModal() {
    createModalOpen.value = true;
  }

  /** 建群向导提交：表单校验与状态都在弹窗里，这里只做"落库 + 手机进对话" */
  function confirmCreate(payload: {
    name: string;
    description: string;
    mode: GroupChatMode;
    memberIds: string[];
  }): void {
    // 取角色卡完整数据
    const characters = characterStore.characters
      .filter((c) => payload.memberIds.includes(c.id))
      .map((c) => uiCharToGroupCard(c));

    const id = groupStore.createGroup(
      {
        name: payload.name,
        description: payload.description,
        memberIds: payload.memberIds,
        mode: payload.mode,
      },
      characters
    );

    if (id) {
      createModalOpen.value = false;
      /*
       * 手机：建完直接进这个群的对话。
       * 两级互换之后，一级只有列表——新建完留在列表上，用户看到的是"我建的群在哪"，
       * 还得再点一下才进得去。用户刚建完的下一步必然是说话，所以这里替他点这一下。
       * 桌面不动：两栏并置时新群已经在右侧出现过，再改 URL 是多余行为变更。
       */
      if (isMobile.value) selectGroup(id);
    }
  }

  function deleteGroup(id: string) {
    deleteGroupTargetId.value = id;
    deleteModalOpen.value = true;
  }

  function confirmDeleteGroup() {
    if (deleteGroupTargetId.value) {
      const id = deleteGroupTargetId.value;
      groupStore.deleteGroup(id);
      void chatStore.discardPendingGroupRuntimeTurns(id);
    }
    deleteModalOpen.value = false;
    deleteGroupTargetId.value = null;
  }

  // ── T-07: SillyTavern 群聊导入 ──
  async function handleStImport(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0]!;
    input.value = '';
    const knownIds = characterStore.characters.map((c) => c.id);
    const id = await groupStore.importGroupFromStFile(file, knownIds);
    if (id) {
      groupStore.selectGroup(id);
      return;
    }
    // O-23：同名/同 id 冲突 → 弹确认（覆盖该群聊全部消息）→ 用户确认后 force 重导
    if (groupStore.lastError && groupStore.lastError.includes(t('group.importDuplicate').split('「')[0]!)) {
      const confirmed = window.confirm(t('group.importOverwriteConfirm'));
      if (confirmed) {
        const forceId = await groupStore.importGroupFromStFile(file, knownIds, { force: true });
        if (forceId) groupStore.selectGroup(forceId);
      }
    }
  }

  // ── 成员管理 ──
  function handleExportGroupSt() {
    const groupId = currentGroup.value?.id;
    if (!groupId) return;
    void groupStore.downloadGroupSt(groupId);
  }

  // ── F10.3 随机 NPC 生成 ──

  function openNpcModal() {
    if (!currentGroup.value) return;
    if (currentGroup.value.members.length >= 8) {
      showToast('error', t('group.maxMembers'));
      return;
    }
    if (!hasApiProfile.value) {
      showToast('error', t('group.apiRequired'));
      return;
    }
    npcModalOpen.value = true;
  }

  async function confirmGenerateNpc(templateId: CharacterTemplateId) {
    if (!currentGroup.value) return;
    const id = await groupStore.generateRandomNpc(currentGroup.value.id, templateId);
    if (id) {
      npcModalOpen.value = false;
      showToast('success', t('group.npcGenerated'));
    } else if (groupStore.lastError) {
      showToast('error', groupStore.lastError);
    }
  }

  function setMode(mode: GroupChatMode) {
    if (!currentGroup.value) return;
    groupStore.setMode(currentGroup.value.id, mode);
  }

  return {
    createModalOpen,
    deleteModalOpen,
    npcModalOpen,
    npcGenerating,
    openCreateModal,
    confirmCreate,
    deleteGroup,
    confirmDeleteGroup,
    handleStImport,
    handleExportGroupSt,
    openNpcModal,
    confirmGenerateNpc,
    setMode,
  };
}
