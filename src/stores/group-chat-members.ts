/**
 * 群聊 store · 成员动作与临时群聊生命周期（F10.4，R4-6 自 stores/group-chat.ts 切出）
 *
 * 两块合在一个工厂：removeMember 直接调 archiveGroupInternal（最后一个临时 NPC 离开即自动归档），
 * 拆成两个工厂就要把内部函数暴露出去，反而更绕。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { CharacterCard } from '@/core/character-card';
import {
  type GroupChat,
  type GroupMember,
  MAX_GROUP_MEMBERS,
  MIN_GROUP_MEMBERS,
} from '@/core/group-chat';

export interface GroupMemberDeps {
  groups: Ref<GroupChat[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistGroup: (id: string) => Promise<void>;
}

export function createGroupMemberOps(deps: GroupMemberDeps) {
  const {
    groups,
    lastError,
    lastInfo,
    persistGroup,
  } = deps;

  /**
   * 添加成员到群聊
   */
  function addMember(
    groupId: string,
    character: CharacterCard
  ): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;

    // F10.4 归档群聊不允许添加成员
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archivedNoAdd');
      return false;
    }

    if (g.members.length >= MAX_GROUP_MEMBERS) {
      lastError.value = t('group.memberLimit2', { max: MAX_GROUP_MEMBERS });
      return false;
    }

    if (g.members.some((m) => m.characterId === character.id)) {
      lastError.value = t('group.alreadyInGroup');
      return false;
    }

    const now = new Date().toISOString();
    // F10.4 检测是否为临时 NPC（通过 isTemporary 标记或 tags 包含 __temporary_npc）
    const isTemp =
      character.isTemporary === true ||
      (Array.isArray((character as { tags?: unknown }).tags) &&
        ((character as { tags: string[] }).tags as string[]).includes('__temporary_npc'));

    g.members.push({
      characterId: character.id,
      name: character.name,
      avatar: character.avatar,
      talkativeness: character.talkativeness,
      joinedAt: now,
      allowAutoSelect: true,
      isTemporary: isTemp,
    });

    // 添加系统消息
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.joined', { name: character.name }),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'join',
    });

    void persistGroup(groupId);
    return true;
  }

  /**
   * 移除成员 (F10.4: 临时 NPC 离开后若群聊无临时 NPC 则自动归档)
   */
  function removeMember(groupId: string, characterId: string): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;

    // F10.4 归档群聊不允许移除成员
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archivedNoRemove');
      return false;
    }

    const idx = g.members.findIndex((m) => m.characterId === characterId);
    if (idx < 0) return false;

    const removed = g.members.splice(idx, 1)[0]!;
    const now = new Date().toISOString();

    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.left', { name: removed.name }),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'leave',
    });

    // F10.4 若移除的是临时 NPC，检查剩余临时 NPC 数量
    // 所有临时 NPC 都离开后，群聊自动归档
    if (removed.isTemporary) {
      const remainingTempNpc = g.members.some((m) => m.isTemporary);
      if (!remainingTempNpc) {
        archiveGroupInternal(g, now);
        lastInfo.value = t('group.autoArchived', { name: removed.name });
        void persistGroup(groupId);
        return true;
      }
    }

    void persistGroup(groupId);
    return true;
  }

  /**
   * 以服务端定义覆盖本地成员列表（CAS 冲突恢复）。
   * 只调整成员与对应系统消息，不改写历史消息内容。
   * 归档群组同样允许对齐，避免冲突无法收敛。
   */
  function replaceMembers(
    groupId: string,
    kept: GroupMember[],
    added: CharacterCard[],
    removedIds: string[]
  ): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;

    const memberIds = [...kept.map((m) => m.characterId), ...added.map((c) => c.id)];
    if (memberIds.length < MIN_GROUP_MEMBERS || memberIds.length > MAX_GROUP_MEMBERS) {
      lastError.value = t('groupChat.memberCount', { min: MIN_GROUP_MEMBERS, max: MAX_GROUP_MEMBERS });
      return false;
    }
    if (new Set(memberIds).size !== memberIds.length) {
      lastError.value = t('groupChat.memberDuplicate');
      return false;
    }

    const now = new Date().toISOString();
    const removed = g.members.filter((member) => removedIds.includes(member.characterId));
    g.members = [
      ...kept.map((member) => ({ ...member })),
      ...added.map((character) => {
        const isTemp = character.isTemporary === true ||
          (Array.isArray((character as { tags?: unknown }).tags) &&
            ((character as { tags: string[] }).tags as string[]).includes('__temporary_npc'));
        return {
          characterId: character.id,
          name: character.name,
          avatar: character.avatar,
          talkativeness: character.talkativeness,
          joinedAt: now,
          allowAutoSelect: true,
          isTemporary: isTemp,
        };
      }),
    ];

    // 只补一条汇总系统消息，避免逐条噪声
    if (removed.length > 0 || added.length > 0) {
      g.messages.push({
        id: `msg-${Date.now()}`,
        role: 'system',
        content: t('group.runtimeConflictMemberSync', {
          added: added.map((c) => c.name).join('、') || '—',
          removed: removed.map((m) => m.name).join('、') || '—',
        }),
        timestamp: now,
        swipes: [],
        swipeIndex: 0,
        eventType: 'none',
      });
    }

    void persistGroup(groupId);
    return true;
  }

  // ── F10.4 临时群聊生命周期 ──

  /**
   * 归档群聊内部实现（不触发 persistGroup，由调用方负责持久化）
   */
  function archiveGroupInternal(g: GroupChat, now: string): void {
    g.lifecycleStatus = 'archived';
    g.archivedAt = now;
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.archivedReadonly2'),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'none',
    });
  }

  /**
   * 手动归档群聊
   */
  function archiveGroup(groupId: string): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archived2');
      return false;
    }
    const now = new Date().toISOString();
    archiveGroupInternal(g, now);
    lastInfo.value = t('group.archivedDone', { name: g.name });
    void persistGroup(groupId);
    return true;
  }

  /**
   * 恢复归档的群聊（NPC 角色卡需仍存在）
   * @param groupId 群聊 ID
   * @param characterExists 校验函数，判断角色卡是否仍存在
   */
  function restoreGroup(
    groupId: string,
    characterExists?: (characterId: string) => boolean
  ): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;
    if (g.lifecycleStatus !== 'archived') {
      lastError.value = t('group.notArchived');
      return false;
    }

    // 校验所有成员的角色卡是否仍存在
    if (characterExists) {
      const missing = g.members.filter((m) => !characterExists(m.characterId));
      if (missing.length > 0) {
        lastError.value = t('group.restoreMissing', { names: missing.map((m) => m.name).join('、') });
        return false;
      }
    }

    g.lifecycleStatus = 'active';
    g.archivedAt = null;
    const now = new Date().toISOString();
    g.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      content: t('group.restoredActive'),
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'none',
    });
    lastInfo.value = t('group.restoredDone', { name: g.name });
    void persistGroup(groupId);
    return true;
  }

  return {
    addMember,
    removeMember,
    replaceMembers,
    archiveGroup,
    restoreGroup,
  };
}
