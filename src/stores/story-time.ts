/**
 * 故事 store · 故事时间推进（F16.4，R4-5 自 stores/story.ts 切出）
 *
 * 时间算法全在 core/story-time，这里只做「找故事 + 落状态 + 持久化 + 提示词片段」。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { StoryAnalysisResult } from '@core/story-types';
import {
  createDefaultTimeConfig,
  createDefaultTimeState,
  advanceTime as advanceTimeCore,
  recordTurnEnd,
  setStoryTimeValue as setStoryTimeValueCore,
  resetStoryTime as resetStoryTimeCore,
  validateTimeConfig,
  formatStoryTime,
  buildStoryTimePrompt,
  type StoryTimeConfig,
} from '@core/story-time';

export interface StoryTimeDeps {
  stories: Ref<StoryAnalysisResult[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistStory: (id: string) => Promise<void>;
}

export function createStoryTimeOps(deps: StoryTimeDeps) {
  const { stories, lastError, lastInfo, persistStory } = deps;

  // ── F16.4 故事时间推进 ──

  /**
   * 需求8：设置故事关联的世界书
   * @param storyId 故事 ID
   * @param worldBookId 世界书 ID（传 null 或空字符串解除关联）
   * @returns 是否成功
   */
  function setStoryWorldBookBinding(
    storyId: string,
    worldBookId: string | null
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    story.boundWorldBookId = worldBookId || null;
    void persistStory(storyId);
    lastInfo.value = worldBookId
      ? t('story.worldLinked')
      : t('story.worldUnlinked');
    return true;
  }

  /**
   * 设置故事时间配置
   * @param storyId 故事 ID
   * @param patch 部分配置字段
   * @returns 是否成功
   */
  function setStoryTimeConfig(
    storyId: string,
    patch: Partial<StoryTimeConfig>
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }

    const current = story.timeConfig ?? createDefaultTimeConfig();
    const merged: StoryTimeConfig = { ...current, ...patch };
    const errors = validateTimeConfig(merged);
    if (errors.length > 0) {
      lastError.value = t('story.timeInvalid', { errors: errors.join('；') });
      return false;
    }

    story.timeConfig = merged;
    // 若 timeState 不存在或 startValue 变更后需要重置
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(merged);
    }
    void persistStory(storyId);
    lastInfo.value = t('story.timeUpdated', { state: merged.enabled ? t('story.enabled') : t('story.disabled') });
    return true;
  }

  /**
   * 启用/禁用时间系统
   */
  function toggleStoryTime(storyId: string, enabled: boolean): boolean {
    return setStoryTimeConfig(storyId, { enabled });
  }

  /**
   * 手动推进一个时间单位（/time advance 命令调用）
   * @returns 推进后的格式化时间字符串（失败返回空字符串）
   */
  function advanceStoryTime(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return '';
    }
    if (!story.timeConfig?.enabled) {
      lastError.value = t('story.timeDisabled');
      return '';
    }
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(story.timeConfig);
    }

    story.timeState = advanceTimeCore(story.timeConfig, story.timeState);
    void persistStory(storyId);
    const formatted = formatStoryTime(story.timeConfig, story.timeState);
    lastInfo.value = t('story.timeAdvanced2', { time: formatted });
    return formatted;
  }

  /**
   * 记录一轮对话结束（由 chat store 在 AI 回复完成后调用）
   * 自动按策略判断是否推进时间
   * @returns 推进后的格式化时间字符串（未推进时返回空字符串）
   */
  function recordTurnEndForStory(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) return '';
    if (!story.timeConfig?.enabled) return '';
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(story.timeConfig);
    }

    const before = story.timeState;
    story.timeState = recordTurnEnd(story.timeConfig, story.timeState);
    void persistStory(storyId);

    // 仅当时间推进时返回格式化字符串
    if (story.timeState.currentValue !== before.currentValue) {
      return formatStoryTime(story.timeConfig, story.timeState);
    }
    return '';
  }

  /**
   * 直接设置时间值（/time set 命令调用）
   */
  function setStoryTime(storyId: string, value: number): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.timeConfig?.enabled) {
      lastError.value = t('story.timeDisabled');
      return false;
    }
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(story.timeConfig);
    }

    story.timeState = setStoryTimeValueCore(story.timeState, value);
    void persistStory(storyId);
    lastInfo.value = t('story.timeSet2', { time: formatStoryTime(story.timeConfig, story.timeState) });
    return true;
  }

  /**
   * 重置时间状态到初始值
   */
  function resetStoryTime(storyId: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.timeConfig) {
      lastError.value = t('story.noTimeConfig');
      return false;
    }

    story.timeState = resetStoryTimeCore(story.timeConfig);
    void persistStory(storyId);
    lastInfo.value = t('story.timeReset2', { time: formatStoryTime(story.timeConfig, story.timeState) });
    return true;
  }

  /**
   * 获取格式化的故事时间（用于 UI 显示）
   */
  function getFormattedStoryTime(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) return '';
    return formatStoryTime(story.timeConfig ?? null, story.timeState ?? null);
  }

  /**
   * 获取故事时间提示词片段（用于注入 prompt）
   */
  function getStoryTimePrompt(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) return '';
    return buildStoryTimePrompt(story.timeConfig ?? null, story.timeState ?? null);
  }

  return {
    setStoryWorldBookBinding,
    setStoryTimeConfig,
    toggleStoryTime,
    advanceStoryTime,
    recordTurnEndForStory,
    setStoryTime,
    resetStoryTime,
    getFormattedStoryTime,
    getStoryTimePrompt,
  };
}
