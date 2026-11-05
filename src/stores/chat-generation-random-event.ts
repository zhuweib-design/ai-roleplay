/**
 * chat-generation-random-event — F17.3 随机事件生成决策点（R4-4 拆分）
 *
 * 每轮 AI 回复完成后异步调用：读生成器配置 → 决策 → 调 LLM 生成事件 → 落事件表。
 * 整段 fail-open：任何失败只记日志，绝不打断主对话链路。
 *
 * 无宿主实例状态依赖（所需 store 全在函数内惰性获取），故保持自由函数。
 */
import { useEventsStore } from './events';
import { useRandomEventsStore } from './random-events';
import { collectLorebooksForCharacter } from './chat-context';
import { createApiClient } from '../api';
import { prepareGenerationPrompt, resolveContextWindow } from '@core/token-budget';
import {
  buildRandomEventMessages,
  parseGeneratedRandomEvent,
  generatedRandomEventToStoryEvent,
  createRandomEventResult,
  type RandomEventParams,
} from '@/core/random-event-generator';
import type { UICharacter } from '@/types';
import { logger } from '@/utils/logger';

/**
 * F17.3: 随机事件生成决策点
 *
 * 在每轮 AI 回复完成后异步调用：检查生成器 → 决策 → LLM 生成事件内容。
 * 集成失败不影响主对话流程。
 */
export async function maybeGenerateRandomEvent(
  character: UICharacter,
  recentMessages: string[]
): Promise<void> {
  try {
    const randomEventsStore = useRandomEventsStore();
    // 未启用则跳过
    if (!randomEventsStore.generatorConfig.enabled) return;

    // 获取场景名（当前简化为角色名，后续可从故事 store 获取当前场景）
    const sceneName = character.name;

    // 执行决策
    const decision = randomEventsStore.decide(sceneName, recentMessages);
    if (!decision.shouldTrigger) {
      // 记录跳过原因（仅 console，不污染结果历史）
      if (decision.reason) {
        logger.debug('F17.3', `随机事件未触发：${decision.reason}`);
      }
      return;
    }

    // 检查 API 配置（无 API 则无法调用 LLM 生成）
    const { useSettingsStore } = await import('./settings');
    const settingsStore = useSettingsStore();
    const profile = settingsStore.activeProfile;
    if (!profile) {
      logger.debug('F17.3', '随机事件决策触发但未配置 API，跳过 LLM 生成');
      return;
    }

    // 已有 active 随机事件时不重复生成（避免事件堆积）
    const eventsStore = useEventsStore();
    const existingActive = eventsStore
      .getActiveEvents()
      .some((e) => e.id.startsWith('rand-evt-'));
    if (existingActive) {
      logger.debug('F17.3', '已有激活的随机事件，跳过本次生成');
      return;
    }

    // 收集角色相关 Lorebook 用于场景上下文
    const lorebooks = collectLorebooksForCharacter(character.id);

    // 构建 LLM 生成参数
    // 若决策选中了模板，将模板的类别/严重度/触发关键词作为生成提示
    const tpl = decision.template;
    const templateHint = tpl
      ? `[Event Template] name=${tpl.name}; category=${tpl.category}; severity=${tpl.severity}${
          tpl.triggerKeywords.length > 0 ? `; keywords=${tpl.triggerKeywords.join('、')}` : ''
        }; description=${tpl.description}`
      : '';

    const params: RandomEventParams = {
      sceneName,
      sceneDescription: templateHint || undefined,
      worldName: lorebooks[0]?.worldDescription?.name,
      worldType: lorebooks[0]?.worldDescription?.type,
      recentMessages,
      activeEventNames: eventsStore.getActiveEvents().map((e) => e.name),
    };

    // 输出预算由模型上下文推导（不再写死 600）
    const prepared = await prepareGenerationPrompt(
      () => buildRandomEventMessages(params),
      undefined,
      resolveContextWindow(profile, settingsStore.maxContextTokens),
      settingsStore.reservedTokens
    );

    // 调用 LLM 生成事件内容
    const apiClient = createApiClient(profile);
    const raw = await apiClient.chat({
      messages: prepared.messages,
      model: profile.model,
      temperature: 1.0,
      maxTokens: prepared.maxTokens,
    });

    const generated = parseGeneratedRandomEvent(raw);
    if (!generated) {
      logger.debug('F17.3', 'LLM 返回内容解析失败，跳过记录');
      return;
    }

    // 记录生成结果到随机事件 store（用于统计与反馈）
    const result = createRandomEventResult({
      template: tpl,
      sceneName,
      generated,
      effectiveProbability: decision.effectiveProbability,
    });
    randomEventsStore.recordResult(result);

    // 转换为临时 StoryEvent 并注入到事件 store（供下一轮 prompt 注入）
    const lbId = lorebooks[0]?.id ?? 'random';
    const storyEvent = generatedRandomEventToStoryEvent(generated, lbId);
    eventsStore.events.push(storyEvent);

    logger.info(
      'F17.3',
      `Random event generated: ${generated.name} (template=${
        tpl?.name ?? '(instant)'
      }, probability=${decision.effectiveProbability}%)`
    );
  } catch (err) {
    // 集成失败不影响主对话流程
    logger.warn('F17.3', '随机事件生成失败', err);
  }
}
