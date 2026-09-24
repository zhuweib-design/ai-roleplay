import { describe, expect, it } from 'vitest';
import { buildGroupHistory, buildGroupSystemPrompt } from '@/services/group-chat-prompt';
import type { GroupChat } from '@/core/group-chat';

describe('群聊模型上下文', () => {
  it('只使用公共消息，当前用户消息不重复，其他角色回复不伪装为当前角色', () => {
    const group: GroupChat = {
      id: 'group-1', name: '讨论组', description: '', firstMessage: '', mode: 'natural',
      lastSpeakerId: null, createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z',
      members: [
        { characterId: 'a', name: '甲', joinedAt: '', allowAutoSelect: true },
        { characterId: 'b', name: '乙', joinedAt: '', allowAutoSelect: true },
      ],
      messages: [
        { id: 'm1', role: 'assistant', characterId: 'b', characterName: '乙', content: '乙的意见', timestamp: '', swipes: [], swipeIndex: 0 },
        { id: 'm2', role: 'assistant', characterId: 'a', characterName: '甲', content: '甲的意见', timestamp: '', swipes: [], swipeIndex: 0 },
        { id: 'm3', role: 'user', content: '新的问题', timestamp: '', swipes: [], swipeIndex: 0 },
      ],
    };
    const history = buildGroupHistory(group, group.members[0]!, 'm3');
    expect(history.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: '乙: 乙的意见' },
      { role: 'assistant', content: '甲的意见' },
    ]);
    expect(buildGroupSystemPrompt(group, group.members[0]!)).toContain('只写甲的回复');
  });
});
