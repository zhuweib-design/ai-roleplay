/**
 * 对话上下文深模块（候选1+2）
 *
 * 为"一次 AI 生成"组装全部注入上下文，是 sendMessage / regenerateMessage
 * 共用的唯一流水线入口。此前 regenerateMessage 遗漏 RAG / 主角 / 故事时间
 * 注入（真实 bug），由本模块统一修复。
 *
 * 依赖 5 个 store（lorebook / persona / data-bank / story / events），属编排层；
 * 核心引擎函数（scanTriggers / buildActiveEventsInjection / buildProtagonistPrompt）
 * 全部复用，不在本模块内重复实现。
 */
import { useLorebookStore } from './lorebook';
import { usePersonaStore } from './persona';
import { useCharacterStore } from './character';
import { useDataBankStore } from './data-bank';
import { useStoryStore } from './story';
import { useEventsStore } from './events';
import { scanTriggers, buildActiveEventsInjection } from '@/core/trigger-engine';
import { buildProtagonistPrompt } from '@core/protagonist';
import type { UICharacter } from '@/types';
import type { Lorebook } from '@/core/lorebook';
import type { StoryEvent } from '@/core/event-types';
import type { PromptContexts } from '@core/prompt-builder';

export interface ChatSessionContextOptions {
  /** RAG 关键词检索与事件扫描用的最近消息（含当前输入文本） */
  ragMessages: string[];
  /**
   * 事件引擎行为：
   * - true：扫描并应用触发结果（sendMessage 语义，可能触发/完成新事件）
   * - false：仅注入已激活事件描述，不改变事件状态（regenerateMessage 语义）
   */
  allowEventTrigger: boolean;
}

export interface ChatSessionContext extends PromptContexts {
  /** 当前激活 Persona 的 {{user}} 宏替换值 */
  userName: string;
}

/**
 * 收集与指定角色相关的 Lorebook 列表（W6 · F06.2 扫描范围）
 *
 * 包含：
 * - scope === 'global' 的世界书
 * - 角色页绑定（boundWorldBookIds，唯一正向数据源）的世界书
 * - 兼容旧数据：scope === 'character' 且 characterId === character.id 的世界书
 * - scope === 'persona' 且 personaId === 当前激活 Persona ID 的世界书（迭代22 · F07.2）
 *
 * 不包含：
 * - 仅绑定到 chat 的世界书（避免在错误上下文中激活）
 * - 已删除或未持久化的世界书
 */
export function collectLorebooksForCharacter(characterId: string): Lorebook[] {
  const lorebookStore = useLorebookStore();
  const personaStore = usePersonaStore();
  const characterStore = useCharacterStore();
  const activePersona = personaStore.activePersona;
  // 角色页绑定的世界书 ID 集合（角色 ↔ 世界书 双向绑定的正向数据源）
  const boundIds = new Set(
    characterStore.characters.find((c) => c.id === characterId)?.boundWorldBookIds ?? []
  );
  return lorebookStore.lorebooks.filter((lb) => {
    if (lb.scope === 'global') return true;
    // 需求7: 角色页绑定的世界书
    if (boundIds.has(lb.id)) return true;
    // 兼容旧数据: lorebook 自身标记的 character scope
    if (lb.scope === 'character' && lb.characterId === characterId) return true;
    // 迭代22 · F07.2: Persona scope 激活
    if (
      lb.scope === 'persona' &&
      activePersona &&
      lb.personaId === activePersona.id
    ) {
      return true;
    }
    return false;
  });
}

/**
 * F17.2 事件触发引擎：扫描并应用触发结果
 *
 * 流程：
 * 1. 用 scanTriggers 扫描候选事件
 * 2. 完成的事件 → eventsStore.completeEvent
 * 3. 触发的事件 → eventsStore.triggerEvent（设置为 active）
 * 4. 返回激活事件描述注入文本（buildActiveEventsInjection）
 *
 * @param eventsStore 事件 store 实例
 * @param events 当前角色相关 Lorebook 的事件列表
 * @param recentMessages 最近对话消息（用于关键词匹配）
 * @param currentStoryTime F16.4 当前格式化故事时间（用于 TimeTrigger 比对，无故事上下文传 null）
 * @returns 注入到 prompt 的事件描述文本（无激活事件返回空字符串）
 */
function scanAndApplyTriggers(
  eventsStore: ReturnType<typeof useEventsStore>,
  events: StoryEvent[],
  recentMessages: string[],
  currentStoryTime: string | null = null
): string {
  if (events.length === 0) return '';

  const triggerContext = {
    recentMessages,
    // 1-on-1 chat 不绑定场景，仅匹配全局事件
    currentSceneId: null as string | null,
    getEventByName: (name: string) => eventsStore.getEventByName(name),
    // F17.2 TimeTrigger 对接 F16.4 故事时间
    currentStoryTime,
  };

  const result = scanTriggers(events, triggerContext);

  // 应用完成
  for (const evt of result.completed) {
    eventsStore.completeEvent(evt.id);
  }

  // 应用触发
  if (result.triggered) {
    eventsStore.triggerEvent(result.triggered.id);
  }

  // 重新读取事件列表（应用触发后状态已更新）
  const eventIds = new Set(events.map((e) => e.id));
  const updatedEvents = eventsStore.events.filter((e) => eventIds.has(e.id));

  return buildActiveEventsInjection(updatedEvents);
}

/**
 * 为"一次 AI 生成"组装全部注入上下文
 *
 * sendMessage 与 regenerateMessage 共用此唯一流水线，保证两种入口
 * 注入一致：Lorebook / Persona / RAG / 事件 / 主角身份 / 故事时间。
 *
 * @param character 当前角色（仅需 id 与 storyId）
 * @param options ragMessages 为参与检索/扫描的最近消息；allowEventTrigger
 *   决定事件引擎是否允许改变事件状态（sendMessage=true，regenerate=false）
 */
export function buildChatSessionContext(
  character: Pick<UICharacter, 'id' | 'storyId'>,
  options: ChatSessionContextOptions
): ChatSessionContext {
  const { ragMessages, allowEventTrigger } = options;

  // W6 · F06.2-F06.3: 收集与当前角色相关的 Lorebook
  const lorebooks = collectLorebooksForCharacter(character.id);

  // 迭代22 · F07: 当前激活 Persona 的 userName 作为 {{user}} 宏替换值
  const userName = usePersonaStore().activeUserName;

  // 迭代26 · F09.2: RAG 检索
  const ragContext = useDataBankStore().retrieveAndBuildContext(
    ragMessages,
    'character',
    character.id
  );

  // F16.3/F16.4: 故事主角身份与时间上下文
  const storyStore = useStoryStore();
  const storyId = character.storyId ?? null;
  const protagonistContext = storyId
    ? buildProtagonistPrompt(
        storyStore.stories.find((s) => s.id === storyId)?.protagonist ?? null
      )
    : '';
  const storyTimeContext = storyId ? storyStore.getStoryTimePrompt(storyId) : '';
  const currentStoryTime = storyId ? storyStore.getFormattedStoryTime(storyId) : null;

  // 迭代29 · F17.2: 事件触发引擎
  const eventsStore = useEventsStore();
  const lorebookIds = lorebooks.map((lb) => lb.id);
  const relevantEvents = eventsStore.events.filter((e) =>
    lorebookIds.includes(e.lorebookId)
  );
  const eventsContext = allowEventTrigger
    ? scanAndApplyTriggers(eventsStore, relevantEvents, ragMessages, currentStoryTime)
    : buildActiveEventsInjection(relevantEvents);

  return {
    lorebooks,
    userName,
    ragContext: ragContext || undefined,
    eventsContext: eventsContext || undefined,
    protagonistContext: protagonistContext || undefined,
    storyTimeContext: storyTimeContext || undefined,
  };
}
