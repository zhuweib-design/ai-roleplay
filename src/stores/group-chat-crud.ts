/**
 * 群聊 store · 群聊 CRUD（R4-6 自 stores/group-chat.ts 切出）
 *
 * 游标重置（resetTurnCursor）留在宿主：只碰分页 cursor 一个 ref，下放反多一层转发。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { CharacterCard } from '@/core/character-card';
import {
  type GroupChat,
  type GroupMember,
  type GroupChatCreateInput,
  validateGroupChatInput,
} from '@/core/group-chat';

export interface GroupCrudDeps {
  groups: Ref<GroupChat[]>;
  currentGroupId: Ref<string | null>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistGroup: (id: string) => Promise<void>;
  deleteFromStorage: (id: string) => Promise<void>;
  resetTurnCursor: () => void;
}

export function createGroupCrudOps(deps: GroupCrudDeps) {
  const {
    groups,
    currentGroupId,
    lastError,
    lastInfo,
    persistGroup,
    deleteFromStorage,
    resetTurnCursor,
  } = deps;

  function selectGroup(id: string): void {
    currentGroupId.value = id;
    resetTurnCursor();
  }

  /**
   * 创建群聊
   * @param input 创建参数
   * @param characters 角色卡列表（用于构造成员和首消息）
   * @returns 新群聊 id（失败返回 null）
   */
  function createGroup(
    input: GroupChatCreateInput,
    characters: CharacterCard[]
  ): string | null {
    const errors = validateGroupChatInput(input);
    if (errors.length > 0) {
      lastError.value = t('group.createFailed', { errors: errors.join('；') });
      return null;
    }

    const id = `group-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    const now = new Date().toISOString();

    // 构造成员列表
    const members: GroupMember[] = input.memberIds.map((charId) => {
      const card = characters.find((c) => c.id === charId);
      // F10.4 临时 NPC 标记（与 addMember 判定一致；修复：此前 createGroup 路径丢失该标记）
      const isTemp =
        card?.isTemporary === true ||
        (Array.isArray(card?.tags) && card.tags.includes('__temporary_npc'));
      return {
        characterId: charId,
        name: card?.name ?? t('group.unknownChar'),
        avatar: card?.avatar,
        talkativeness: card?.talkativeness,
        joinedAt: now,
        allowAutoSelect: true,
        isTemporary: isTemp,
      };
    });

    // 生成首消息（从成员的 alternateGreetings 中随机选取）
    let firstMessage = input.firstMessage ?? '';
    let firstSpeaker = members[0];
    if (!firstMessage) {
      const candidates: { text: string; charName: string; charId: string }[] = [];
      members.forEach((m) => {
        const card = characters.find((c) => c.id === m.characterId);
        if (card?.alternateGreetings?.length) {
          card.alternateGreetings.forEach((g) => {
            if (g.trim()) {
              candidates.push({
                text: g,
                charName: m.name,
                charId: m.characterId,
              });
            }
          });
        }
      });
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
        firstMessage = pick.text;
        firstSpeaker = members.find((member) => member.characterId === pick.charId);
      } else if (members.length > 0) {
        // 兜底：使用第一个成员的 firstMessage
        const card = characters.find((c) => c.id === members[0]!.characterId);
        firstMessage = card?.firstMessage ?? '';
      }
    }

    const group: GroupChat = {
      id,
      name: input.name,
      description: input.description ?? '',
      members,
      firstMessage,
      messages: firstMessage
        ? [
            {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: firstMessage,
              timestamp: now,
              swipes: [],
              swipeIndex: 0,
              characterId: firstSpeaker?.characterId,
              characterName: firstSpeaker?.name,
              eventType: 'none',
            },
          ]
        : [],
      mode: input.mode ?? 'natural',
      lastSpeakerId: null,
      designatedSpeakerId: null,
      createdAt: now,
      updatedAt: now,
      lifecycleStatus: 'active',
      archivedAt: null,
    };

    groups.value.unshift(group);
    currentGroupId.value = id;
    resetTurnCursor();
    void persistGroup(id);
    lastInfo.value = t('group.created', { name: group.name });
    return id;
  }

  /**
   * 更新群聊元信息
   */
  function updateGroup(
    id: string,
    patch: Partial<Pick<GroupChat, 'name' | 'description' | 'mode'>>
  ): boolean {
    const g = groups.value.find((x) => x.id === id);
    if (!g) return false;
    Object.assign(g, patch);
    void persistGroup(id);
    return true;
  }

  /**
   * 删除群聊
   */
  function deleteGroup(id: string): void {
    const idx = groups.value.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const removed = groups.value.splice(idx, 1)[0]!;
    void deleteFromStorage(id);
    lastInfo.value = t('group.deleted', { name: removed.name });
    if (currentGroupId.value === id) {
      currentGroupId.value = groups.value[0]?.id ?? null;
      resetTurnCursor();
    }
  }

  return {
    selectGroup,
    createGroup,
    updateGroup,
    deleteGroup,
  };
}
