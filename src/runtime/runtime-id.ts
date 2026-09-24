/**
 * Runtime 跨适配器稳定 ID 规则。
 *
 * 该模块只包含纯函数，供聊天桥接、Runtime Core 与 PostgreSQL Store 共同依赖，
 * 避免持久化实现反向依赖上层聊天编排模块。
 */
export function stableRuntimeUuid(...parts: string[]): string {
  const input = parts.join('\u0000');
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

export function isRuntimeUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function stableChatEventId(tenantId: string, characterId: string, turnId: string): string {
  return stableRuntimeUuid(tenantId, characterId, turnId);
}

export function stableChatCharacterId(tenantId: string, sourceCharacterId: string): string {
  return stableRuntimeUuid('chat-character', tenantId, sourceCharacterId);
}

export function stableChatTargetId(tenantId: string, sourceTargetId: string): string {
  return stableRuntimeUuid('chat-target', tenantId, sourceTargetId);
}

export interface StableChatConversationTurnIds {
  conversationId: string;
  sessionId: string;
  userTurnId: string;
  assistantTurnId: string;
}

export function stableChatConversationTurnIds(
  tenantId: string,
  characterId: string,
  conversationKey: string | undefined,
  sessionKey: string | undefined,
  logicalTurnId: string
): StableChatConversationTurnIds {
  const conversationId = isRuntimeUuid(conversationKey)
    ? conversationKey
    : stableRuntimeUuid('conversation', tenantId, characterId, conversationKey ?? 'default');
  const sessionId = isRuntimeUuid(sessionKey)
    ? sessionKey
    : stableRuntimeUuid('session', conversationId, sessionKey ?? 'default');
  return {
    conversationId,
    sessionId,
    userTurnId: stableRuntimeUuid('conversation-turn', sessionId, logicalTurnId, 'user'),
    assistantTurnId: stableRuntimeUuid('conversation-turn', sessionId, logicalTurnId, 'character'),
  };
}
