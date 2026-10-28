import { computed } from 'vue';
import { useGroupChatStore } from '@/stores/group-chat';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { createApiClient } from '@/api';
import { uiCharToCard } from '@/services/type-adapters';
import { buildGroupHistory, buildGroupSystemPrompt } from '@/services/group-chat-prompt';
import { recordGroupObservation } from '@/services/group-chat-runtime';
import { ChatManager, classifyChatError } from '@/services/chat-manager';
import { t } from '@/i18n';
import type { GroupMember } from '@/core/group-chat';
import type { UICharacter } from '@/types';

/** Toast 的三种语义，与 `Toast.vue` 的 type 对齐 */
export type ToastKind = 'info' | 'success' | 'error';

export interface GroupComposerOptions {
  /** 父级持有 Toast 组件，这里只发消息 */
  showToast: (type: ToastKind, message: string) => void;
}

/**
 * useGroupComposer — 群聊发送链路（R1-1 从 GroupChatView 拆出）
 *
 * 归它管的：本轮生成的状态机（activeManager / aborted）、流式增量落到 store、
 * 中止、@提及确认后的指定发言。
 * 不归它管：输入文本本身（在 groupStore.inputText）、消息区的滚动（在 GroupMessageList）。
 *
 * 为什么这两个 `let` 放在 composable 闭包里而不是模块级：一个视图一份实例，
 * 模块级会让"两个群聊页同时打开"共享同一个 manager——那正是要避免的串扰。
 */
export function useGroupComposer(options: GroupComposerOptions) {
  const groupStore = useGroupChatStore();
  const chatStore = useChatStore();
  const characterStore = useCharacterStore();
  const settingsStore = useSettingsStore();

  const { showToast } = options;

  const currentGroup = computed(() => groupStore.currentGroup);

  // ── 群聊生成中止 ──
  // 当前进行中的 ChatManager；同一时刻只允许一个群聊生成，避免并发中止串扰。
  let activeGroupManager: ChatManager | null = null;
  // 本轮是否由用户主动中止；中止后不得提交公共回合，也不得投递旁听事件。
  let groupGenerationAborted = false;

  // O-12（REAL_DEVICE_TEST_2026-10-03）：归档只读态显式化——输入框与发送按钮直接禁用，
  // 不再等用户提交后才收到失败 toast（业务拦截仍保留，双保险）
  const isArchivedReadonly = computed(() => currentGroup.value?.lifecycleStatus === 'archived');

  /**
   * 停止当前群聊生成。
   * 保留已生成的部分内容，但本轮不提交公共回合，也不投递旁听事件。
   */
  function stopGroupGeneration(): void {
    if (!activeGroupManager) return;
    groupGenerationAborted = true;
    activeGroupManager.stop();
  }

  function sendMessage(): void {
    const group = currentGroup.value;
    if (!group || groupStore.isStreaming) return;
    if (group.lifecycleStatus === 'archived') {
      showToast('error', t('group.archivedReadonly'));
      return;
    }
    const text = groupStore.inputText.trim();
    if (!text) return;
    const speaker = group.mode === 'natural'
      ? groupStore.pickNextSpeaker(group.id)
      : group.members.find((member) => member.characterId === group.designatedSpeakerId && member.allowAutoSelect);
    if (!speaker) {
      showToast('info', t('group.selectSpeaker'));
      return;
    }
    const character = characterStore.characters.find((item) => item.id === speaker.characterId);
    if (!character) {
      showToast('error', t('group.memberMissing'));
      return;
    }
    const profile = settingsStore.activeProfile;
    if (!profile) {
      showToast('error', t('group.apiRequired'));
      return;
    }
    if (!groupStore.addUserMessage(group.id, text)) {
      if (groupStore.lastError) showToast('error', groupStore.lastError);
      return;
    }
    const userMessageId = group.messages.at(-1)!.id;
    groupStore.setInput('');
    void generateGroupReply(group.id, speaker, character, userMessageId, text, profile);
  }

  async function generateGroupReply(
    groupId: string,
    speaker: GroupMember,
    character: UICharacter,
    userMessageId: string,
    text: string,
    profile: NonNullable<ReturnType<typeof useSettingsStore>['activeProfile']>
  ): Promise<void> {
    const current = groupStore.groups.find((item) => item.id === groupId);
    if (!current) return;
    // 固定本轮的群组定义与历史，避免生成期间 UI 变更导致上下文和提交使用不同成员。
    const group = { ...current, members: current.members.map((member) => ({ ...member })),
      messages: current.messages.map((message) => ({ ...message })) };
    groupStore.setStreaming(true);
    groupGenerationAborted = false;
    const card = uiCharToCard(character);
    let messageId: string | null = null;
    let thinking = '';
    const generationErrors: Error[] = [];
    try {
      const runtime = await chatStore.ensureGroupRuntimeIntegration({
        group, characters: characterStore.characters, speakerCharacterId: speaker.characterId,
      });
      const manager = new ChatManager({
        apiClient: createApiClient(profile),
        model: profile.model,
        systemPrompt: buildGroupSystemPrompt(group, speaker),
        // 旁白人称：群聊已接同一套分段渲染（见 segmentsOf 与 .msg-psy），所以这里照常注入；
        // 规则文本由 buildPrompt 追加，不在 buildGroupSystemPrompt 里另写一份
        narrationPerspective: settingsStore.narrationPerspective,
      });
      activeGroupManager = manager;
      const reply = await manager.sendMessage({
        card,
        history: buildGroupHistory(group, speaker, userMessageId),
        userMessage: text,
        runtimeTurnId: userMessageId,
        // 服务端群聊模式下由公共 Turn 事务统一写入所有成员 Event。
        persistRuntime: !(typeof import.meta.env.VITE_RUNTIME_BASE_URL === 'string' && import.meta.env.VITE_RUNTIME_BASE_URL.trim()),
        runtime: runtime ?? undefined,
      }, {
        onThinking: (_delta, full) => { thinking = full; },
        onDelta: (_delta, full) => {
          if (!full) return;
          if (!messageId) messageId = groupStore.addAssistantMessage(groupId, speaker.characterId, speaker.name, full);
          else groupStore.updateAssistantMessage(groupId, messageId, { content: full, thinking });
        },
        onStatus: (status) => {
          if (messageId && status) groupStore.updateAssistantMessage(groupId, messageId, { status });
        },
        onError: (error) => {
          if (classifyChatError(error) === 'aborted') groupGenerationAborted = true;
          else generationErrors.push(error);
        },
      });
      if (reply) {
        if (!messageId) messageId = groupStore.addAssistantMessage(groupId, speaker.characterId, speaker.name, reply);
        if (messageId) groupStore.updateAssistantMessage(groupId, messageId, { content: reply, thinking });
        // 用户主动中止：保留已生成的部分内容，但不提交公共回合，也不投递旁听事件。
        const runtimeCommit = !groupGenerationAborted && generationErrors.length === 0 && messageId
          ? await chatStore.commitRuntimeGroupTurn({
            group,
            characters: characterStore.characters,
            speakerCharacterId: speaker.characterId,
            turnId: userMessageId,
            userMessage: text,
            assistantMessage: reply,
          })
          : { enabled: false, committed: false };
        if (runtimeCommit.enabled) {
          if (runtimeCommit.committed && group.mode === 'designated') {
            groupStore.clearDesignatedSpeaker(groupId, speaker.characterId);
          }
          if (!runtimeCommit.committed) showToast('error', t('group.runtimeCommitFailed'));
        } else if (!groupGenerationAborted && generationErrors.length === 0 && messageId) {
          if (group.mode === 'designated') groupStore.clearDesignatedSpeaker(groupId, speaker.characterId);
          // 本地 Runtime 模式下保留原有逐成员旁听路径；远程模式由服务端事务统一扇出。
          await Promise.allSettled(group.members
            .filter((member) => member.characterId !== speaker.characterId)
            .map(async (member) => {
              const listener = characterStore.characters.find((item) => item.id === member.characterId);
              if (!listener) return;
              const integration = await chatStore.ensureRuntimeIntegration(listener, uiCharToCard(listener), 'group-' + groupId);
              if (!integration) return;
              await recordGroupObservation(integration, {
                groupId,
                assistantMessageId: messageId!,
                speakerId: speaker.characterId,
                userMessage: text,
                assistantMessage: reply,
              });
            }));
        }
      }
      if (groupGenerationAborted) {
        showToast('info', t('chat.stopGenerating'));
      } else if (generationErrors.length > 0 || !reply) {
        showToast('error', generationErrors[0]?.message ?? t('group.emptyReply'));
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      activeGroupManager = null;
      groupStore.setStreaming(false);
    }
  }

  /** @提及确认：把这一轮的发言权指定给该成员（指定模式的写操作） */
  function onMention(member: GroupMember): void {
    const group = currentGroup.value;
    if (!group) return;
    const speaker = groupStore.designateSpeaker(group.id, member.characterId);
    if (speaker) {
      showToast('info', t('group.mentionAssigned', { name: member.name }));
    }
  }

  return {
    isArchivedReadonly,
    sendMessage,
    stopGroupGeneration,
    onMention,
  };
}
