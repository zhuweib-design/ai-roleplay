import { computed } from 'vue';
import { useGroupChatStore } from '@/stores/group-chat';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import { uiCharToGroupCard } from '@/services/type-adapters';
import { t } from '@/i18n';
import type { ToastKind } from '@/composables/useGroupComposer';
import type { UICharacter } from '@/types';

export interface GroupLifecycleOptions {
  showToast: (type: ToastKind, message: string) => void;
}

/**
 * useGroupLifecycle — 群聊生命周期与 Runtime 冲突对齐（R1-1 拆出）
 *
 * 这四件事共用一条规则：**先让服务端成功，再改本地**。
 * 放在一起是为了让这条规则只写一次、只读一次；散在视图里时，
 * 每个函数各自"记得"要同步，漏一个就会本地与服务端分叉。
 *
 * 归它管：归档 / 恢复 / 采纳远端定义 / 重试未提交回合，以及它们依赖的两个派生量
 * （冲突对象、待重试回合）——这两个量只服务这四件事，视图拿去做 GroupInfoPanel
 * 的 props 即可，不再各算一遍。
 */
export function useGroupLifecycle(options: GroupLifecycleOptions) {
  const groupStore = useGroupChatStore();
  const chatStore = useChatStore();
  const characterStore = useCharacterStore();

  const { showToast } = options;

  const currentGroup = computed(() => groupStore.currentGroup);

  // 当前群组是否存在未处理的群组定义 CAS 冲突
  const currentGroupConflict = computed(() => {
    const conflict = chatStore.groupRuntimeConflict;
    if (!conflict || !currentGroup.value) return null;
    return conflict.groupId === currentGroup.value.id ? conflict : null;
  });

  const pendingRuntimeTurns = computed(() => {
    const groupId = currentGroup.value?.id;
    return groupId
      ? chatStore.pendingGroupRuntimeTurns.filter((item) => item.groupId === groupId)
      : [];
  });

  async function archiveCurrentGroup(): Promise<void> {
    const group = currentGroup.value;
    if (!group) return;
    // 远端模式先同步归档，服务端成功后才修改本地生命周期，避免本地与服务端状态分叉。
    const synced = await chatStore.syncRemoteGroupStatus({
      group,
      characters: characterStore.characters,
      status: 'archived',
    });
    if (!synced.synced) {
      showToast('error', t('group.runtimeStatusSyncFailed'));
      return;
    }
    const ok = groupStore.archiveGroup(group.id);
    if (ok) {
      showToast('info', t('group.archived'));
    } else if (groupStore.lastError) {
      showToast('error', groupStore.lastError);
    }
  }

  async function restoreCurrentGroup(): Promise<void> {
    const group = currentGroup.value;
    if (!group) return;
    const synced = await chatStore.syncRemoteGroupStatus({
      group,
      characters: characterStore.characters,
      status: 'active',
    });
    if (!synced.synced) {
      showToast('error', t('group.runtimeStatusSyncFailed'));
      return;
    }
    // 成员卡缺失校验仍由 store 负责，保持既有错误文案与行为不变。
    const ok = groupStore.restoreGroup(
      group.id,
      (charId) => characterStore.characters.some((c) => c.id === charId)
    );
    if (ok) {
      showToast('success', t('group.restored'));
    } else if (groupStore.lastError) {
      showToast('error', groupStore.lastError);
    }
  }

  /**
   * 以服务端为准：把远端成员定义与状态应用回本地群聊，清除冲突。
   * 只对齐成员与生命周期，不改写本地消息历史。
   */
  async function adoptRemoteGroupDefinition(): Promise<void> {
    const group = currentGroup.value;
    const conflict = currentGroupConflict.value;
    if (!group || !conflict) return;

    if (conflict.remoteMemberIds) {
      // 远端成员 ID 是 Runtime UUID，需映射回本地角色卡
      const runtimeToLocal = new Map(
        characterStore.characters.map((character) => [
          chatStore.runtimeCharacterIdFor(character),
          character.id,
        ]),
      );
      const remoteLocalIds = conflict.remoteMemberIds
        .map((runtimeId) => runtimeToLocal.get(runtimeId))
        .filter((id): id is string => Boolean(id));

      if (remoteLocalIds.length !== conflict.remoteMemberIds.length) {
        // 存在本地缺失的角色卡，不能静默丢弃成员
        showToast('error', t('group.runtimeConflictMissingCards'));
        return;
      }

      const kept = group.members.filter((member) => remoteLocalIds.includes(member.characterId));
      const added = remoteLocalIds
        .filter((localId) => !kept.some((member) => member.characterId === localId))
        .map((localId) => characterStore.characters.find((character) => character.id === localId))
        .filter((character): character is UICharacter => Boolean(character))
        .map((character) => uiCharToGroupCard(character));
      const removedIds = group.members
        .filter((member) => !remoteLocalIds.includes(member.characterId))
        .map((member) => member.characterId);

      if (!groupStore.replaceMembers(group.id, kept, added, removedIds)) {
        showToast('error', groupStore.lastError ?? t('group.runtimeConflictApplyFailed'));
        return;
      }
    }

    if (conflict.remoteStatus && conflict.remoteStatus !== group.lifecycleStatus) {
      if (conflict.remoteStatus === 'archived') groupStore.archiveGroup(group.id);
      else groupStore.restoreGroup(group.id);
    }

    chatStore.clearGroupRuntimeConflict();
    showToast('success', t('group.runtimeConflictAdopted'));
  }

  async function retryPendingRuntimeTurns(): Promise<void> {
    const group = currentGroup.value;
    if (!group || groupStore.isStreaming || pendingRuntimeTurns.value.length === 0) return;
    for (const pending of [...pendingRuntimeTurns.value]) {
      const result = await chatStore.retryPendingGroupRuntimeTurn({
        group,
        characters: characterStore.characters,
        groupTurnId: pending.turnId,
      });
      if (!result.committed) {
        showToast('error', t('group.runtimeRetryFailed'));
        return;
      }
    }
    showToast('success', t('group.runtimeRetrySucceeded'));
  }

  return {
    currentGroupConflict,
    pendingRuntimeTurns,
    archiveCurrentGroup,
    restoreCurrentGroup,
    adoptRemoteGroupDefinition,
    retryPendingRuntimeTurns,
  };
}
