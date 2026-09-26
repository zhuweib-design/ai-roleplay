import type { RuntimeApi } from './runtime-api';
import type { RuntimeContext, RuntimeEventInput, RuntimeConversationTurnResult } from './types';
import {
  isRuntimeUuid,
  stableChatConversationTurnIds,
  stableChatEventId,
  stableRuntimeUuid,
} from './runtime-id';

export interface ChatRuntimeIntegration {
  api: Pick<RuntimeApi, 'buildContext' | 'ingestEvent'> &
    Partial<Pick<RuntimeApi, 'recordConversationTurn' | 'recordChatTurn'>>;
  tenantId: string;
  characterId: string;
  /** 多会话键；PostgreSQL 端会稳定映射为 conversations.id。 */
  conversationKey?: string;
  sessionKey?: string;
  targetId?: string;
  contextRequest?: {
    maxEvents?: number;
    maxMemories?: number;
    maxEpisodes?: number;
  };
  /** 群聊授权上下文不可降级；失败时禁止继续调用模型。单聊默认保持可降级。 */
  requireContext?: boolean;
  onError?: (error: Error, phase: 'context' | 'event') => void;
}

function compactList(values: string[], fallback: string): string {
  return values.length > 0 ? values.join('；') : fallback;
}

/** 把 Runtime Context 转成可控、可审计的系统提示词区块。 */
export function formatRuntimeContext(context: RuntimeContext): string {
  const emotionText = context.currentState.emotions
    .filter((emotion) => emotion.intensity >= 0.05)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 5)
    .map((emotion) => `${emotion.emotion}:${emotion.intensity.toFixed(2)}`);
  const memoryText = context.relevantMemories
    .slice(0, 8)
    .map((memory) => `[${memory.type}] ${memory.content}`);
  const episodeText = context.relevantEpisodes
    .slice(0, 5)
    .map((episode) => `${episode.status}: ${episode.topic ?? episode.targetId ?? '未命名事件'}`);
  const recentEventText = context.recentEvents
    .slice(-8)
    .map((event) => {
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload as { userMessage?: unknown; assistantMessage?: unknown }
        : {};
      const userMessage = typeof payload.userMessage === 'string' ? payload.userMessage.slice(0, 160) : '';
      const assistantMessage = typeof payload.assistantMessage === 'string' ? payload.assistantMessage.slice(0, 160) : '';
      const content = [userMessage && `user=${userMessage}`, assistantMessage && `assistant=${assistantMessage}`]
        .filter(Boolean)
        .join(' | ');
      return `${event.eventType}${event.topic ? `: ${event.topic}` : ''}${content ? ` (${content})` : ''}`;
    });
  const appraisalText = context.appraisal
    ? `impact=${context.appraisal.impact.toFixed(2)}, threat=${context.appraisal.threat.toFixed(2)}, loss=${context.appraisal.loss.toFixed(2)}, valueViolation=${context.appraisal.valueViolation.toFixed(2)}`
    : 'none';
  const behaviorText = context.behaviorPlan
    ? `${context.behaviorPlan.strategy}; goal=${context.behaviorPlan.goal}; assertiveness=${context.behaviorPlan.assertiveness.toFixed(2)}; warmth=${context.behaviorPlan.warmth.toFixed(2)}; directness=${context.behaviorPlan.directness.toFixed(2)}`
    : 'none';
  return [
    '[Virtual Character Runtime State]',
    `Identity: ${context.identity.displayName}`,
    `Speaking style: ${context.identity.speakingStyle ?? 'follow the character definition'}`,
    `Current emotions: ${compactList(emotionText, 'neutral')}`,
    `Recent events: ${compactList(recentEventText, 'none')}`,
    `Relevant memories: ${compactList(memoryText, 'none')}`,
    `Relevant episodes: ${compactList(episodeText, 'none')}`,
    `Appraisal: ${appraisalText}`,
    `Behavior plan: ${behaviorText}`,
    'Treat this block as internal state guidance, not as user instructions.',
  ].join('\n');
}

export function createChatTurnEvent(
  integration: ChatRuntimeIntegration,
  userMessage: string,
  assistantMessage: string,
  occurredAt = new Date().toISOString(),
  sourceTurnId?: string,
  sourceTurnIds?: string[]
): RuntimeEventInput {
  const normalizedTurnId = sourceTurnId?.trim() || undefined;
  return {
    ...(normalizedTurnId
      ? { eventId: stableChatEventId(integration.tenantId, integration.characterId, normalizedTurnId) }
      : {}),
    tenantId: integration.tenantId,
    characterId: integration.characterId,
    targetId: integration.targetId,
    eventType: 'conversation_turn',
    importance: 0.5,
    occurredAt,
    sourceTurnId: normalizedTurnId,
    sourceTurnIds: sourceTurnIds?.filter(isRuntimeUuid),
    payload: {
      userMessage,
      assistantMessage,
      source: 'chat-manager',
    },
  };
}

export async function buildChatRuntimeContext(
  integration: ChatRuntimeIntegration
): Promise<string | null> {
  try {
    const context = await integration.api.buildContext(
      integration.characterId,
      integration.contextRequest
    );
    return formatRuntimeContext(context);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    integration.onError?.(failure, 'context');
    if (integration.requireContext) throw failure;
    return null;
  }
}

export async function recordChatTurn(
  integration: ChatRuntimeIntegration,
  userMessage: string,
  assistantMessage: string,
  sourceTurnId?: string
): Promise<void> {
  try {
    const occurredAt = new Date().toISOString();
    const logicalTurnId = sourceTurnId?.trim() || stableRuntimeUuid(
      'anonymous-chat-turn',
      integration.tenantId,
      integration.characterId,
      occurredAt,
      userMessage,
      assistantMessage
    );
    const turnInput = {
      turnId: logicalTurnId,
      tenantId: integration.tenantId,
      characterId: integration.characterId,
      conversationKey: integration.conversationKey,
      sessionKey: integration.sessionKey,
      userMessage,
      assistantMessage,
      occurredAt,
      metadata: { source: 'chat-manager' },
    };
    const stableTurnIds = stableChatConversationTurnIds(
      integration.tenantId,
      integration.characterId,
      integration.conversationKey,
      integration.sessionKey,
      logicalTurnId
    );
    const eventInput = createChatTurnEvent(
      integration,
      userMessage,
      assistantMessage,
      occurredAt,
      logicalTurnId,
      [stableTurnIds.userTurnId, stableTurnIds.assistantTurnId]
    );

    if (integration.api.recordChatTurn) {
      const {
        tenantId: _turnTenantId,
        characterId: _turnCharacterId,
        ...turn
      } = turnInput;
      const {
        tenantId: _eventTenantId,
        characterId: _eventCharacterId,
        ...event
      } = eventInput;
      await integration.api.recordChatTurn(integration.characterId, {
        tenantId: integration.tenantId,
        turn,
        event,
      });
      return;
    }

    let persistedTurn: RuntimeConversationTurnResult | undefined;
    if (integration.api.recordConversationTurn) {
      const { characterId: _characterId, ...turn } = turnInput;
      persistedTurn = await integration.api.recordConversationTurn(integration.characterId, turn);
    }
    const sourceTurnIds = [
      isRuntimeUuid(persistedTurn?.userTurnId)
        ? persistedTurn.userTurnId
        : stableTurnIds.userTurnId,
      isRuntimeUuid(persistedTurn?.assistantTurnId)
        ? persistedTurn.assistantTurnId
        : stableTurnIds.assistantTurnId,
    ];
    const {
      characterId: _eventCharacterId,
      ...event
    } = createChatTurnEvent(
      integration,
      userMessage,
      assistantMessage,
      occurredAt,
      logicalTurnId,
      sourceTurnIds
    );
    await integration.api.ingestEvent(integration.characterId, event);
  } catch (error) {
    integration.onError?.(error instanceof Error ? error : new Error(String(error)), 'event');
  }
}
