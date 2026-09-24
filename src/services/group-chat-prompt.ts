import type { ChatMessage } from '@core/character-card';
import type { GroupChat, GroupMember } from '@core/group-chat';

/** 群内公开消息投影：不读取其他角色的私有 Runtime 状态。 */
export function buildGroupHistory(group: GroupChat, speaker: GroupMember, currentUserMessageId: string): ChatMessage[] {
  return group.messages
    .filter((message) => message.id !== currentUserMessageId)
    .slice(-24)
    .map((message) => {
      const role = message.role === 'assistant' && message.characterId === speaker.characterId
        ? 'assistant' as const
        : 'user' as const;
      const origin = message.role === 'system'
        ? '群聊事件'
        : message.role === 'user' ? '用户' : message.characterName ?? '其他成员';
      return {
        id: message.id,
        role,
        content: role === 'assistant' ? message.content.slice(0, 2000) : `${origin}: ${message.content.slice(0, 2000)}`,
        timestamp: message.timestamp,
        swipes: [],
        swipeIndex: 0,
      };
    });
}

export function buildGroupSystemPrompt(group: GroupChat, speaker: GroupMember): string {
  const members = group.members.map((member) => member.name).join('、');
  return `你正在群聊“${group.name}”中扮演${speaker.name}。成员：${members}。只写${speaker.name}的回复，不代替其他成员发言。`;
}
