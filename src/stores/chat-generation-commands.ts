/**
 * chat-generation-commands — F11.1 斜杠命令执行（R4-4 拆分）
 *
 * 把以 / 开头的输入路由到命令引擎：装配故事时间 / 事件上下文与扩展命令，
 * 执行管道，把命令文本与结果各 push 成一条消息，最后持久化。
 *
 * 需要宿主的 stop / sendMessage / persistChat，以依赖对象注入，
 * 不让模块反向 import store（避环形依赖）。
 */
import type { Ref } from 'vue';
import { t } from '@/i18n';
import type { UIMessage, UICharacter } from '@/types';
import { executePipeline } from '@/core/slash-command';
import { createSlashCommandContext } from '@/core/variable-store';
import { extensionRegistry } from '@/core/extension-loader';
import { useEventsStore } from './events';
import { useStoryStore } from './story';
import { collectLorebooksForCharacter } from './chat-context';

export interface SlashCommandDeps {
  chatVariables: Ref<Record<string, string>>;
  stop: () => void;
  sendMessage: (character: UICharacter, text: string) => Promise<boolean>;
  persistChat: (character: UICharacter) => Promise<void>;
}

export async function executeSlashCommand(
  character: UICharacter,
  text: string,
  deps: SlashCommandDeps
): Promise<void> {
/**
 * F11.1 执行斜杠命令
 *
 * 将命令文本路由到斜杠命令引擎，执行结果作为消息显示在对话区。
 * /setvar 修改的局部变量写入 chatVariables（随对话保留）。
 */

  const userName = collectLorebooksForCharacter(character.id)
    .find((lb) => lb.userProfile?.name?.trim())?.userProfile?.name?.trim() || 'User';

  // F16.4: 构造故事时间命令上下文（若角色关联了故事）
  const storyStore = useStoryStore();
  const storyId = character.storyId ?? null;
  const storyTimeContext = storyId
    ? {
        storyId,
        onAdvance: () => storyStore.advanceStoryTime(storyId),
        onSet: (value: number) => storyStore.setStoryTime(storyId, value),
        getStatus: () => storyStore.getFormattedStoryTime(storyId),
        onReset: () => storyStore.resetStoryTime(storyId),
      }
    : null;

  // F17.2: 构造事件命令上下文（角色关联 Lorebook 含事件时注入）
  const eventsStore = useEventsStore();
  const characterLorebooks = collectLorebooksForCharacter(character.id);
  const characterLorebookIds = new Set(characterLorebooks.map((lb) => lb.id));
  const characterEvents = eventsStore.events.filter((e) =>
    characterLorebookIds.has(e.lorebookId)
  );
  const eventsContext =
    characterEvents.length > 0
      ? {
          events: characterEvents.map((e) => ({
            id: e.id,
            name: e.name,
            state: e.state,
            sceneName: e.sceneName,
            triggerCount: e.triggerCount,
          })),
          findEvent: (idOrName: string) => {
            const byId = eventsStore.getEvent(idOrName);
            if (byId && characterLorebookIds.has(byId.lorebookId)) return byId;
            const byName = eventsStore.getEventByName(idOrName);
            if (byName && characterLorebookIds.has(byName.lorebookId)) return byName;
            return null;
          },
          trigger: (id: string) => {
            const ok = eventsStore.triggerEvent(id);
            return {
              success: ok,
              message: ok
                ? t('char.eventTriggered', { name: eventsStore.getEvent(id)?.name ?? id })
                : (eventsStore.lastError ?? t('store.triggerFailed', { id })),
            };
          },
          complete: (id: string) => {
            const ok = eventsStore.completeEvent(id);
            return {
              success: ok,
              message: ok
                ? t('char.eventDone', { name: eventsStore.getEvent(id)?.name ?? id })
                : (eventsStore.lastError ?? t('store.completeFailed', { id })),
            };
          },
        }
      : null;

  // 构造执行上下文（chatVariables 引用传入，/setvar 直接修改）
  const ctx = createSlashCommandContext(deps.chatVariables.value, character.name, userName, {
    onAbort: () => deps.stop(),
    storyTimeContext,
    eventsContext,
  });

  // 收集 F12 扩展系统注册的斜杠命令
  const extraCommands = extensionRegistry.getSlashCommands();

  // 执行命令管道
  const result = await executePipeline(text, ctx, extraCommands);

  // push 用户消息（命令文本，让用户看到自己输入的命令）
  const userMsg: UIMessage = {
    id: `m-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  };
  character.messages.push(userMsg);

  // push 命令结果作为 assistant 消息
  const resultContent = result.message
    ? result.message
    : result.success
      ? t('char.cmdDone')
      : t('char.cmdFailed');
  const resultMsg: UIMessage = {
    id: `m-${Date.now() + 1}`,
    role: 'assistant',
    content: resultContent,
    timestamp: Date.now() + 1,
  };
  character.messages.push(resultMsg);

  // 持久化对话
  await deps.persistChat(character);

  // 命令请求中断生成
  if (result.shouldAbort) {
    deps.stop();
  }

  // 命令产生 sendMessage：递归调用触发 AI 回复
  if (result.sendMessage) {
    await deps.sendMessage(character, result.sendMessage);
  }
}
