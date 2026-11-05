/**
 * 群聊 store · 发言顺序控制（F10.2）与远端回合合并（R4-6 自 stores/group-chat.ts 切出）
 *
 * 注意：pickNextSpeaker 内 `const t = m.talkativeness ?? 50` 是局部权重变量，与 i18n 的 t 同名。
 * 本模块**不 import i18n 的 t**，勿"顺手补上"造成遮蔽（TS2448 或静默取错值）。
 */
import type { Ref } from 'vue';
import type { GroupChat, GroupMember } from '@/core/group-chat';

export interface GroupSpeakingDeps {
  groups: Ref<GroupChat[]>;
  persistGroup: (id: string) => Promise<void>;
}

export function createGroupSpeakingOps(deps: GroupSpeakingDeps) {
  const {
    groups,
    persistGroup,
  } = deps;

  /**
   * 自然轮换：按健谈度概率选择下一位发言者
   * 同一角色不会连续两轮发言
   * @returns 选中的成员，或 null（无可用发言者）
   */
  function pickNextSpeaker(groupId: string): GroupMember | null {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return null;

    const candidates = g.members.filter(
      (m) => m.allowAutoSelect && m.characterId !== g.lastSpeakerId
    );

    if (candidates.length === 0) {
      // 退而求其次：允许 lastSpeaker 之外的所有成员
      const all = g.members.filter((m) => m.allowAutoSelect);
      if (all.length === 0) return null;
      // 唯一选择只能是上一位发言者
      return all[0]!;
    }

    // 按健谈度加权随机选择
    const weights = candidates.map((m) => {
      const t = m.talkativeness ?? 50;
      return Math.max(1, t); // 权重最低为 1
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return candidates[i]!;
    }
    return candidates[candidates.length - 1]!;
  }

  /**
   * 指定下一位发言者（@角色名）
   */
  function designateSpeaker(
    groupId: string,
    characterId: string
  ): GroupMember | null {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return null;
    const speaker = g.members.find((m) => m.characterId === characterId && m.allowAutoSelect) ?? null;
    if (speaker) {
      g.designatedSpeakerId = characterId;
      void persistGroup(groupId);
    }
    return speaker;
  }

  function clearDesignatedSpeaker(groupId: string, characterId: string): void {
    const group = groups.value.find((item) => item.id === groupId);
    if (group?.designatedSpeakerId !== characterId) return;
    group.designatedSpeakerId = null;
    void persistGroup(groupId);
  }

  /**
   * 合并服务端公共回合到本地消息历史（跨设备历史同步）。
   *
   * 语义：
   * - 以 `logicalTurnId` 为幂等键：本地已存在同一回合（任一侧）则跳过，重复拉取不会产生重复消息。
   * - 服务端回合没有「本地消息 ID」概念，这里用 `remote:${turnId}:user|assistant` 作为稳定 ID，
   *   保证多次拉取与跨刷新后仍是同一条消息。
   * - 只追加，不删除、不覆盖本地已有消息；本地未同步的回合在下次提交后自然补齐。
   *
   * @returns 新增的消息条数（0 表示已是最新）
   */
  function mergeRemoteTurns(
    groupId: string,
    turns: Array<{
      id: string;
      turnId: string;
      speakerId: string;
      userMessage: string;
      assistantMessage: string;
      occurredAt: string;
    }>,
    runtimeToLocalCharacterId: Map<string, string>
  ): number {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g || turns.length === 0) return 0;

    // 已是本地的回合键（用户消息 ID 即逻辑回合键）
    const knownTurnIds = new Set<string>();
    for (const message of g.messages) {
      if (message.role === 'user') knownTurnIds.add(message.id);
      // 服务端来源的消息 ID 形如 remote:<turnId>:user|assistant
      const remoteMatch = /^remote:(.+):(?:user|assistant)$/.exec(message.id);
      if (remoteMatch) knownTurnIds.add(remoteMatch[1]!);
    }

    let added = 0;
    const ordered = turns
      .slice()
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

    for (const turn of ordered) {
      if (knownTurnIds.has(turn.turnId)) continue;
      const localCharacterId = runtimeToLocalCharacterId.get(turn.speakerId) ?? turn.speakerId;
      const member = g.members.find((item) => item.characterId === localCharacterId);
      const speakerName = member?.name ?? localCharacterId;

      g.messages.push({
        id: `remote:${turn.turnId}:user`,
        role: 'user',
        content: turn.userMessage,
        timestamp: turn.occurredAt,
        swipes: [],
        swipeIndex: 0,
        eventType: 'none',
      });
      g.messages.push({
        id: `remote:${turn.turnId}:assistant`,
        role: 'assistant',
        content: turn.assistantMessage,
        timestamp: turn.occurredAt,
        swipes: [],
        swipeIndex: 0,
        characterId: localCharacterId,
        characterName: speakerName,
        eventType: 'none',
      });
      knownTurnIds.add(turn.turnId);
      added += 2;
    }

    if (added > 0) {
      // 保持按时间排序，服务端历史可能早于本地首条消息
      g.messages.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      g.lastSpeakerId = g.messages.filter((m) => m.role === 'assistant').at(-1)?.characterId ?? g.lastSpeakerId;
      void persistGroup(groupId);
    }
    return added;
  }

  return {
    pickNextSpeaker,
    designateSpeaker,
    clearDesignatedSpeaker,
    mergeRemoteTurns,
  };
}
