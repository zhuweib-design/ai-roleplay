/**
 * 群聊 store · 消息动作（R4-6 自 stores/group-chat.ts 切出）
 *
 * setInput / setStreaming 只碰一个 ref，留在宿主（§7.12 O-11 "单 ref 薄方法不下放"）。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { GroupChat, GroupChatMessage, GroupChatMode } from '@/core/group-chat';

export interface GroupMessageDeps {
  groups: Ref<GroupChat[]>;
  lastError: Ref<string | null>;
  persistGroup: (id: string) => Promise<void>;
}

export function createGroupMessageOps(deps: GroupMessageDeps) {
  const {
    groups,
    lastError,
    persistGroup,
  } = deps;

  /**
   * 添加用户消息
   */
  function addUserMessage(groupId: string, content: string): boolean {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return false;

    // F10.4 归档群聊为只读状态，不能发新消息
    if (g.lifecycleStatus === 'archived') {
      lastError.value = t('group.archivedNoSend');
      return false;
    }

    const now = new Date().toISOString();
    g.messages.push({
      id: `msg-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
      role: 'user',
      content,
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      eventType: 'none',
    });

    void persistGroup(groupId);
    return true;
  }

  /**
   * 添加 AI 消息（流式过程中调用）
   */
  function addAssistantMessage(
    groupId: string,
    characterId: string,
    characterName: string,
    content: string
  ): string | null {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return null;

    const now = new Date().toISOString();
    const messageId = `msg-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    g.messages.push({
      id: messageId,
      role: 'assistant',
      content,
      timestamp: now,
      swipes: [],
      swipeIndex: 0,
      characterId,
      characterName,
      eventType: 'none',
    });

    g.lastSpeakerId = characterId;
    void persistGroup(groupId);
    return messageId;
  }

  function updateAssistantMessage(groupId: string, messageId: string, patch: Partial<Pick<GroupChatMessage, 'content' | 'thinking' | 'status'>>): void {
    const group = groups.value.find((item) => item.id === groupId);
    const message = group?.messages.find((item) => item.id === messageId && item.role === 'assistant');
    if (!message) return;
    Object.assign(message, patch);
    void persistGroup(groupId);
  }

  /**
   * 更新最后一条 AI 消息内容（流式更新）
   */
  function updateLastAssistantMessage(
    groupId: string,
    content: string
  ): void {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return;

    // 从末尾向前找最近的 assistant 消息
    for (let i = g.messages.length - 1; i >= 0; i--) {
      const msg = g.messages[i]!;
      if (msg.role === 'assistant' && msg.characterId) {
        msg.content = content;
        void persistGroup(groupId);
        return;
      }
    }
  }

  /**
   * 切换发言模式
   */
  function setMode(groupId: string, mode: GroupChatMode): void {
    const g = groups.value.find((x) => x.id === groupId);
    if (!g) return;
    g.mode = mode;
    void persistGroup(groupId);
  }

  return {
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    updateLastAssistantMessage,
    setMode,
  };
}
