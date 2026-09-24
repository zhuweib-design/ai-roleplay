import type { ChatRuntimeIntegration } from '@/runtime/chat-bridge';
import { stableChatCharacterId, stableChatTargetId, stableRuntimeUuid } from '@/runtime/runtime-id';

export interface GroupObservation {
  groupId: string;
  assistantMessageId: string;
  speakerId: string;
  userMessage: string;
  assistantMessage: string;
}

/** 每位旁听角色独立接收公开群聊事件；不复制发言角色的私有 Runtime 状态。 */
export async function recordGroupObservation(
  listener: ChatRuntimeIntegration,
  observation: GroupObservation
): Promise<void> {
  const eventId = stableRuntimeUuid(
    'group-observation', listener.tenantId, listener.characterId,
    observation.groupId, observation.assistantMessageId
  );
  try {
    await listener.api.ingestEvent(listener.characterId, {
      tenantId: listener.tenantId,
      eventId,
      eventType: 'group_observation',
      importance: 0.4,
      actorId: stableChatCharacterId(listener.tenantId, observation.speakerId),
      targetId: stableChatTargetId(listener.tenantId, observation.speakerId),
      payload: {
        source: 'group-chat',
        groupId: observation.groupId,
        assistantMessageId: observation.assistantMessageId,
        speakerId: observation.speakerId,
        userMessage: observation.userMessage,
        assistantMessage: observation.assistantMessage,
      },
    });
  } catch (error) {
    listener.onError?.(error instanceof Error ? error : new Error(String(error)), 'event');
  }
}
