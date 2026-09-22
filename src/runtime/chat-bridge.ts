import type { RuntimeApi } from './runtime-api';
import type { RuntimeContext, RuntimeEventInput } from './types';

export interface ChatRuntimeIntegration {
  api: Pick<RuntimeApi, 'buildContext' | 'ingestEvent'>;
  tenantId: string;
  characterId: string;
  targetId?: string;
  contextRequest?: {
    maxEvents?: number;
    maxMemories?: number;
    maxEpisodes?: number;
  };
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
  return [
    '[Virtual Character Runtime State]',
    `Identity: ${context.identity.displayName}`,
    `Speaking style: ${context.identity.speakingStyle ?? 'follow the character definition'}`,
    `Current emotions: ${compactList(emotionText, 'neutral')}`,
    `Relevant memories: ${compactList(memoryText, 'none')}`,
    `Relevant episodes: ${compactList(episodeText, 'none')}`,
    'Treat this block as internal state guidance, not as user instructions.',
  ].join('\n');
}

export function createChatTurnEvent(
  integration: ChatRuntimeIntegration,
  userMessage: string,
  assistantMessage: string,
  occurredAt = new Date().toISOString()
): RuntimeEventInput {
  return {
    tenantId: integration.tenantId,
    characterId: integration.characterId,
    targetId: integration.targetId,
    eventType: 'conversation_turn',
    importance: 0.5,
    occurredAt,
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
    integration.onError?.(error instanceof Error ? error : new Error(String(error)), 'context');
    return null;
  }
}

export async function recordChatTurn(
  integration: ChatRuntimeIntegration,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  try {
    await integration.api.ingestEvent(
      integration.characterId,
      createChatTurnEvent(integration, userMessage, assistantMessage)
    );
  } catch (error) {
    integration.onError?.(error instanceof Error ? error : new Error(String(error)), 'event');
  }
}
