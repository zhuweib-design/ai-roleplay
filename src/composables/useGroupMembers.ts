import { computed, ref } from 'vue';
import { useGroupChatStore } from '@/stores/group-chat';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import { uiCharToGroupCard } from '@/services/type-adapters';
import { t } from '@/i18n';
import type { GroupMember } from '@/core/group-chat';
import type { ToastKind } from '@/composables/useGroupComposer';

export interface GroupMembersOptions {
  showToast: (type: ToastKind, message: string) => void;
}

/** 群聊成员上限（与建群向导、随机 NPC 的判据同一处来源） */
const MAX_MEMBERS = 8;
/** 群聊成员下限（少于两人不叫群聊） */
const MIN_MEMBERS = 2;

/**
 * useGroupMembers — 成员增删与上限校验（R1-1 从 GroupChatView 拆出）
 *
 * 归它管的：加人弹窗的开关与目标群、可选候选、加人/删人的远端同步顺序。
 * 不归它管：成员渲染（GroupInfoPanel）、@提及（useGroupComposer）。
 *
 * `addMemberTargetGroupId` 存在的理由：加人是异步的（先同步远端再改本地），
 * 期间用户可能切了群。没有这个 id 就会把成员加到"现在选中的群"而不是
 * "打开弹窗时那个群"——M12-a 那次"写到别的角色身上"是同一类错误。
 */
export function useGroupMembers(options: GroupMembersOptions) {
  const groupStore = useGroupChatStore();
  const chatStore = useChatStore();
  const characterStore = useCharacterStore();

  const { showToast } = options;

  const addMemberModalOpen = ref(false);
  const addMemberTargetGroupId = ref<string | null>(null);

  const currentGroup = computed(() => groupStore.currentGroup);

  // 添加成员弹窗中可选的角色卡（排除已在群聊中的）
  const addMemberAvailable = computed(() => {
    if (!currentGroup.value) return [];
    const memberIds = new Set(currentGroup.value.members.map((m) => m.characterId));
    return characterStore.characters.filter((c) => !memberIds.has(c.id));
  });

  function openAddMemberModal(): void {
    if (!currentGroup.value) return;
    if (currentGroup.value.members.length >= MAX_MEMBERS) {
      showToast('error', t('group.maxMembers'));
      return;
    }
    addMemberTargetGroupId.value = currentGroup.value.id;
    addMemberModalOpen.value = true;
  }

  async function confirmAddMembers(characterIds: string[]): Promise<void> {
    const group = currentGroup.value;
    if (!addMemberTargetGroupId.value || !group || group.id !== addMemberTargetGroupId.value) return;
    const targets = characterStore.characters.filter((c) => characterIds.includes(c.id));
    for (const char of targets) {
      const synced = await chatStore.syncRemoteGroupMember({
        group,
        characters: characterStore.characters,
        memberCharacterId: char.id,
        operation: 'add',
      });
      if (!synced.synced) {
        showToast('error', t('group.runtimeMemberSyncFailed'));
        break;
      }
      groupStore.addMember(group.id, uiCharToGroupCard(char));
    }
    addMemberModalOpen.value = false;
    addMemberTargetGroupId.value = null;
  }

  async function removeMember(member: GroupMember, e: Event): Promise<void> {
    e.stopPropagation();
    const group = currentGroup.value;
    if (!group) return;
    if (group.members.length <= MIN_MEMBERS) {
      showToast('error', t('group.minMembers'));
      return;
    }
    const synced = await chatStore.syncRemoteGroupMember({
      group,
      characters: characterStore.characters,
      memberCharacterId: member.characterId,
      operation: 'remove',
    });
    if (!synced.synced) {
      showToast('error', t('group.runtimeMemberSyncFailed'));
      return;
    }
    groupStore.removeMember(group.id, member.characterId);
  }

  return {
    addMemberModalOpen,
    addMemberAvailable,
    openAddMemberModal,
    confirmAddMembers,
    removeMember,
  };
}
