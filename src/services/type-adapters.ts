import type { CharacterCard, ChatMessage } from '@core/character-card';
import type { UICharacter, UIMessage, WorldEntry } from '@/types';

/**
 * 类型适配层 (D3)
 *
 * 桥接 UI 层类型（UICharacter / UIMessage）与核心层类型（CharacterCard / ChatMessage）。
 * UI 层类型贴近设计稿（含生成参数、Token 预算、旁白等展示字段），
 * 核心层类型遵循 SillyTavern V2 角色卡规范（含 personality/scenario/exampleMessages 等）。
 *
 * 转换原则：
 * - 不可逆字段（如 UI 的 avatarType/gradient）存入 CharacterCard.ext 命名空间（迭代33 起）
 * - 核心层缺失的字段（如 personality/scenario）使用合理默认值
 * - 旁白（narration）不进入 ChatMessage.content，由 prompt-builder 单独处理（Phase E 实现）
 */

// ── UICharacter ↔ CharacterCard ──

/**
 * UICharacter → CharacterCard
 * 用于将 UI 层角色卡转换为核心层格式，以便调用 prompt-builder / 持久化
 */
export function uiCharToCard(ui: UICharacter): CharacterCard {
  const now = new Date().toISOString();

  return {
    id: ui.id,
    name: ui.name,
    avatar: ui.avatar,
    description: ui.description,
    // 核心层独立字段：UI 层编辑时透传原始值，避免合并进 description 后再次保存丢失（候选3）
    personality: ui.personality ?? '',
    scenario: ui.scenario ?? '',
    firstMessage: '', // UI 层首条消息存在 messages[0]
    alternateGreetings: [],
    exampleMessages: '',
    // 作者笔记映射为 characterNote
    characterNote: ui.authorNote
      ? {
          text: ui.authorNote,
          depth: ui.authorDepth,
          role: 'system',
        }
      : null,
    talkativeness: 50,
    tags: [...ui.tags],
    favorite: ui.favorite,
    version: '1.0',
    createdAt: now,
    updatedAt: now,
    // F01.6 角色属性透传（深拷贝避免引用共享）
    ...(ui.attributes ? { attributes: structuredClone(ui.attributes) } : {}),
    // 迭代33：UI 扩展字段收进 ext 命名空间（替代顶层索引签名透传）
    ext: {
      model: ui.model,
      temperature: ui.temperature,
      maxTokens: ui.maxTokens,
      avatarType: ui.avatarType,
      ...(ui.gradientFrom ? { gradientFrom: ui.gradientFrom } : {}),
      ...(ui.gradientTo ? { gradientTo: ui.gradientTo } : {}),
      ...(ui.storyId !== undefined ? { storyId: ui.storyId } : {}),
      ...(ui.boundWorldBookIds ? { boundWorldBookIds: [...ui.boundWorldBookIds] } : {}),
    },
  };
}

/**
 * CharacterCard → UICharacter
 * 用于从核心层加载角色卡时转换回 UI 格式
 */
export function cardToUiChar(
  card: CharacterCard,
  overrides?: Partial<UICharacter>
): UICharacter {
  const ext = card.ext;

  // 兼容旧格式（迭代33 前）：这些字段曾直接存顶层索引签名，
  // 已持久化数据没有 ext，读取时回退到顶层（有则 ext 优先）
  const legacy = (k: string) => (card as Record<string, unknown>)[k];
  const storyId =
    ext?.storyId !== undefined
      ? ext.storyId
      : legacy('storyId') !== undefined
        ? (legacy('storyId') as string | null)
        : undefined;
  const boundWorldBookIds =
    ext?.boundWorldBookIds ?? (legacy('boundWorldBookIds') as string[] | undefined);

  const base: UICharacter = {
    id: card.id,
    name: card.name,
    avatar: card.avatar,
    avatarType: ext?.avatarType ?? (legacy('avatarType') as 'image' | 'gradient' | undefined) ?? (card.avatar ? 'image' : 'gradient'),
    gradientFrom: ext?.gradientFrom ?? (legacy('gradientFrom') as string | undefined) ?? 'var(--tk-cyan-500)',
    gradientTo: ext?.gradientTo ?? (legacy('gradientTo') as string | undefined) ?? 'var(--tk-cyan-700)',
    initial: card.name[0] || '?',
    lastActive: '刚刚',
    favorite: card.favorite,
    tags: [...card.tags],
    // UI description 合并核心 description + personality + scenario
    description: [card.description, card.personality, card.scenario]
      .filter(Boolean)
      .join('\n\n'),
    // 核心层独立字段透传（候选3：使 card→ui→card round-trip 无损）
    personality: card.personality,
    scenario: card.scenario,
    model: ext?.model ?? (legacy('model') as string | undefined) ?? overrides?.model ?? 'gpt-4o',
    conversations: overrides?.conversations ?? [],
    messages: overrides?.messages ?? [],
    authorNote: card.characterNote?.text ?? '',
    authorDepth: card.characterNote?.depth ?? 4,
    temperature: ext?.temperature ?? (legacy('temperature') as number | undefined) ?? overrides?.temperature ?? 1.0,
    maxTokens: ext?.maxTokens ?? (legacy('maxTokens') as number | undefined) ?? overrides?.maxTokens ?? 4096,
    worldEntries: overrides?.worldEntries ?? [],
    tokenBudget: overrides?.tokenBudget ?? {
      character: 0,
      worldInfo: 0,
      chatHistory: 0,
      remaining: 8192,
    },
    // F01.6 角色属性透传（深拷贝避免引用共享）
    ...(card.attributes ? { attributes: structuredClone(card.attributes) } : {}),
    // 迭代33：关联字段从 ext 恢复（未持久化时保持未设置语义）
    ...(storyId !== undefined ? { storyId } : {}),
    ...(boundWorldBookIds ? { boundWorldBookIds: [...boundWorldBookIds] } : {}),
  };

  return { ...base, ...overrides };
}

// ── UIMessage ↔ ChatMessage ──

/**
 * UIMessage → ChatMessage
 * UI 时间戳（number）转 ISO 字符串，旁白不进入 content
 */
export function uiMsgToChatMsg(ui: UIMessage): ChatMessage {
  return {
    id: ui.id,
    role: ui.role,
    content: ui.content,
    timestamp:
      typeof ui.timestamp === 'number'
        ? new Date(ui.timestamp).toISOString()
        : ui.timestamp,
    swipes: [],
    swipeIndex: 0,
  };
}

/**
 * ChatMessage → UIMessage
 * system 角色消息过滤掉（不直接展示），ISO 时间戳转回 number
 *
 * 注意：ChatMessage.swipes / swipeIndex 在 UI 层不直接展示
 * （UI 层用 MessageBubble 内部的版本控制展示），
 * 转换时丢弃这两个字段。如需保留 swipes 用于重新生成场景，
 * 应使用 chat-manager 内部的 ChatMessage 流转，不经过 UI 转换。
 */
export function chatMsgToUiMsg(msg: ChatMessage): UIMessage | null {
  if (msg.role === 'system') return null;
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    timestamp:
      typeof msg.timestamp === 'string'
        ? new Date(msg.timestamp).getTime()
        : msg.timestamp,
  };
}

/**
 * 批量转换 UIMessage[] → ChatMessage[]
 */
export function uiMsgsToChatMsgs(messages: UIMessage[]): ChatMessage[] {
  return messages.map(uiMsgToChatMsg);
}

/**
 * 批量转换 ChatMessage[] → UIMessage[]，过滤 system 消息
 */
export function chatMsgsToUiMsgs(messages: ChatMessage[]): UIMessage[] {
  return messages
    .map(chatMsgToUiMsg)
    .filter((m): m is UIMessage => m !== null);
}

// ── WorldEntry 适配（核心层无对应类型，直接复用） ──

export function worldEntriesToStorage(
  entries: WorldEntry[]
): WorldEntry[] {
  return entries.map((e) => ({ ...e }));
}
