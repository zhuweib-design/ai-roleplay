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

/**
 * 将聊天调用方提供的稳定 Turn ID 映射为 PostgreSQL 可接受的 UUID。
 * 这里只用于幂等键，不承担认证或安全哈希职责。
 */
function stableChatEventId(tenantId: string, characterId: string, turnId: string): string {
  const input = `${tenantId}\u0000${characterId}\u0000${turnId}`;
  const seeds = [0x811c9dc5, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35];
  const hex = seeds.map((seed, lane) => {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= (input.charCodeAt(index) + lane * 31 + index) & 0xff;
      hash = Math.imul(hash, 0x01000193 + lane * 2) >>> 0;
      hash ^= hash >>> 13;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
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
  occurredAt = new Date().toISOString(),
  sourceTurnId?: string
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
  assistantMessage: string,
  sourceTurnId?: string
): Promise<void> {
  try {
    await integration.api.ingestEvent(
      integration.characterId,
      createChatTurnEvent(integration, userMessage, assistantMessage, new Date().toISOString(), sourceTurnId)
    );
  } catch (error) {
    integration.onError?.(error instanceof Error ? error : new Error(String(error)), 'event');
  }
}
