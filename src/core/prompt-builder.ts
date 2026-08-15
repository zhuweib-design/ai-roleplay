import type { CharacterCard, ChatMessage } from './character-card';
import type { Lorebook } from './lorebook';
import { replaceMacros } from './macro';
import { countMessageTokens } from './token-counter';
// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）
import {
  scanLorebooks,
  groupByInsertionPosition,
  type ScanContext,
  type ActivatedEntry,
} from './lorebook-scanner';

export interface PromptSettings {
  systemPrompt: string;
  maxContextTokens: number;
  reservedTokens: number;
  userName: string;
}

export interface BuiltMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BuiltPrompt {
  messages: BuiltMessage[];
  tokenCount: number;
  trimmed: boolean;
  /** W6 新增：激活并注入的 Lorebook 条目（用于调试与可视化） */
  activatedEntries?: ActivatedEntry[];
}

/**
 * 可选的注入上下文（迭代33 收拢为单一对象，替代逐个位置参数）
 *
 * 此前 6 个可选 context 以位置参数传递，每次新增上下文要改签名 +
 * 两层透传（chat-manager → buildPrompt）。收拢后签名稳定，
 * 新增上下文只扩展本接口与 prompt-builder 内部组装。
 */
export interface PromptContexts {
  /** W6 新增：可选的 Lorebook 列表，用于关键词扫描与注入 */
  lorebooks?: Lorebook[];
  /** F09.2 RAG 检索上下文文本（由 data-bank store 构建后传入） */
  ragContext?: string;
  /** F09.2 RAG 注入深度（默认 0，与作者笔记规则相同：用户消息之前） */
  ragDepth?: number;
  /** F17.2 当前激活事件的注入文本（由 trigger-engine.buildActiveEventsInjection 生成） */
  eventsContext?: string;
  /** F16.3 主角身份上下文文本（由 protagonist.buildProtagonistPrompt 生成） */
  protagonistContext?: string;
  /** F16.4 故事时间上下文文本（由 story-time.buildStoryTimePrompt 生成） */
  storyTimeContext?: string;
}

/**
 * 提示词构建引擎 (F03)
 * 将角色定义、对话历史、作者笔记等组装为最终发送给 LLM 的消息列表。
 *
 * W6 扩展：支持 Lorebook 条目注入 (F06.2-F06.3)
 */
export async function buildPrompt(
  card: CharacterCard,
  history: ChatMessage[],
  userMessage: string,
  settings: PromptSettings,
  /** 迭代33：可选注入上下文收拢为单一对象 */
  contexts: PromptContexts = {}
): Promise<BuiltPrompt> {
  const {
    lorebooks,
    ragContext,
    ragDepth,
    eventsContext,
    protagonistContext,
    storyTimeContext,
  } = contexts;
  const macroCtx = { user: settings.userName, char: card.name };

  // 1. 构建角色定义
  const charDef = [
    `Name: ${card.name}`,
    card.description && `Description: ${card.description}`,
    card.personality && `Personality: ${card.personality}`,
    card.scenario && `Scenario: ${card.scenario}`,
  ].filter(Boolean).join('\n');

  // F01.6 构建"角色属性"区块（注入到角色定义之后）
  let attributesText = '';
  if (card.attributes) {
    const lines: string[] = [];
    if (card.attributes.profession) {
      lines.push(`职业：${card.attributes.profession}`);
    }
    if (card.attributes.level !== undefined) {
      lines.push(`等级：${card.attributes.level}`);
    }
    if (card.attributes.experience !== undefined) {
      lines.push(`经验值：${card.attributes.experience}`);
    }
    if (Array.isArray(card.attributes.stats) && card.attributes.stats.length > 0) {
      for (const stat of card.attributes.stats) {
        lines.push(`${stat.name}: ${stat.value}`);
      }
    }
    if (lines.length > 0) {
      attributesText = '\n\n[角色属性]\n' + lines.join('\n');
    }
  }

  // 2. 扫描 Lorebook 条目（W6 新增）
  let activatedEntries: ActivatedEntry[] = [];
  let groupedEntries: ReturnType<typeof groupByInsertionPosition> | null = null;

  if (lorebooks && lorebooks.length > 0) {
    // 收集最近消息文本用于扫描（默认全部上下文）
    const recentMessages = history.map((m) => m.content);
    recentMessages.push(userMessage);

    const scanCtx: ScanContext = {
      recentMessages,
      additionalText: charDef,
    };

    activatedEntries = scanLorebooks(lorebooks, scanCtx);
    groupedEntries = groupByInsertionPosition(activatedEntries);
  }

  // 3. 构建系统提示词（注入 beforeCharDefs 条目）
  const beforeEntries = groupedEntries?.beforeCharDefs ?? [];
  const beforeText = beforeEntries.length > 0
    ? beforeEntries.map((e) => e.entry.content).join('\n\n') + '\n\n'
    : '';

  const afterEntries = groupedEntries?.afterCharDefs ?? [];
  const afterText = afterEntries.length > 0
    ? '\n\n' + afterEntries.map((e) => e.entry.content).join('\n\n')
    : '';

  // F06.7: 收集 Lorebook 顶层 worldDescription，作为常量注入 beforeCharDefs 之前
  // 多个 Lorebook 的 worldDescription 按顺序拼接（全局 → 角色 → Persona）
  let worldDescText = '';
  if (lorebooks && lorebooks.length > 0) {
    const worldDescs = lorebooks
      .map((lb) => lb.worldDescription)
      .filter((wd): wd is NonNullable<typeof wd> => !!wd && !!wd.content);
    if (worldDescs.length > 0) {
      worldDescText =
        worldDescs
          .map((wd) => {
            const header = wd.name
              ? `[World: ${wd.name} (${wd.type})]`
              : `[World Type: ${wd.type}]`;
            return `${header}\n${wd.content}`;
          })
          .join('\n\n') + '\n\n';
    }
  }

  const systemContent = replaceMacros(
    `${settings.systemPrompt}\n\n${worldDescText}${beforeText}${charDef}${attributesText}${afterText}${eventsContext ? '\n\n' + eventsContext : ''}${protagonistContext ? '\n\n' + protagonistContext : ''}${storyTimeContext ? '\n\n' + storyTimeContext : ''}`,
    macroCtx
  );

  // 4. 构建消息列表
  const messages: BuiltMessage[] = [
    { role: 'system', content: systemContent },
  ];

  // 添加对话历史
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // 5. 注入 @D 深度条目（W6 新增）
  if (groupedEntries && groupedEntries.atDepth.size > 0) {
    // 按 depth 升序处理（小 depth 离末尾远）
    const sortedDepths = Array.from(groupedEntries.atDepth.keys()).sort(
      (a, b) => a - b
    );
    for (const depth of sortedDepths) {
      const entries = groupedEntries.atDepth.get(depth)!;
      const text = entries.map((e) => e.entry.content).join('\n\n');
      const msg: BuiltMessage = { role: 'system', content: text };
      // depth 0 = 历史最后一条之后（用户消息之前）
      // depth N = 从历史末尾往前数第 N 条之后
      const insertIdx = Math.max(1, messages.length - depth);
      messages.splice(insertIdx, 0, msg);
    }
  }

  // 6. 注入作者笔记
  if (card.characterNote) {
    const noteContent = replaceMacros(card.characterNote.text, macroCtx);
    const noteMsg: BuiltMessage = { role: card.characterNote.role, content: noteContent };
    const depth = card.characterNote.depth;
    const insertIdx = Math.max(1, messages.length - depth);
    messages.splice(insertIdx, 0, noteMsg);
  }

  // 6.5 注入 RAG 检索结果 (F09.2)
  if (ragContext) {
    const ragMsg: BuiltMessage = { role: 'system', content: ragContext };
    const ragDepthValue = ragDepth ?? 0;
    const insertIdx = Math.max(1, messages.length - ragDepthValue);
    messages.splice(insertIdx, 0, ragMsg);
  }

  // 7. 添加用户消息
  messages.push({ role: 'user', content: userMessage });

  // 8. Token 预算裁剪
  const budget = settings.maxContextTokens - settings.reservedTokens;
  let tokenCount = await countMessageTokens(messages);
  let trimmed = false;

  // 从最早的历史消息开始裁剪（保留 system 消息和最后的 user 消息）
  // 低 insertionOrder 的 Lorebook 条目优先裁剪（F06.3 规则约束）
  while (tokenCount > budget && messages.length > 2) {
    messages.splice(1, 1); // 移除 system 之后的第一条历史消息
    tokenCount = await countMessageTokens(messages);
    trimmed = true;
  }

  return {
    messages,
    tokenCount,
    trimmed,
    activatedEntries: activatedEntries.length > 0 ? activatedEntries : undefined,
  };
}
// i18n-ignore-end
