/**
 * 故事 store · 主角身份配置（F16.3，R4-5 自 stores/story.ts 切出）
 *
 * 校验与打补丁逻辑全在 core/protagonist，这里只做「找故事 + 落状态 + 持久化」。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type {
  StoryAnalysisResult,
  ProtagonistConfig,
  ProtagonistRelation,
  ProtagonistRole,
} from '@core/story-types';
import {
  createProtagonistFromCharacter,
  createNewProtagonist,
  validateProtagonist,
  patchProtagonist,
  addRelation as addRelationCore,
  removeRelation as removeRelationCore,
} from '@core/protagonist';

export interface StoryProtagonistDeps {
  stories: Ref<StoryAnalysisResult[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistStory: (id: string) => Promise<void>;
}

export function createStoryProtagonistOps(deps: StoryProtagonistDeps) {
  const { stories, lastError, lastInfo, persistStory } = deps;

  // ── F16.3 主角身份配置 ──

  /**
   * 从故事中的已有人物创建主角配置
   *
   * @param storyId 故事 ID
   * @param characterName 故事人物名（必须在 story.characters 内）
   * @param role 主角身份（默认 'protagonist'）
   * @param startingScene 起始场景名（可选）
   * @returns 是否成功（失败时设置 lastError）
   */
  function setProtagonistFromCharacter(
    storyId: string,
    characterName: string,
    role: ProtagonistRole = 'protagonist',
    startingScene?: string
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    const character = story.characters.find((c) => c.name === characterName);
    if (!character) {
      lastError.value = t('story.charNotInList', { name: characterName });
      return false;
    }

    const config = createProtagonistFromCharacter(character, role, startingScene);
    const errors = validateProtagonist(config, story);
    if (errors.length > 0) {
      lastError.value = t('story.protagonistInvalid', { errors: errors.join('；') });
      return false;
    }

    story.protagonist = config;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistSetExisting', { name: config.name });
    return true;
  }

  /**
   * 创建自定义新主角并设置到故事
   *
   * @param storyId 故事 ID
   * @param input 新主角输入
   * @returns 是否成功
   */
  function setProtagonistAsCustom(
    storyId: string,
    input: {
      name: string;
      description?: string;
      role?: ProtagonistRole;
      startingScene?: string;
      relations?: ProtagonistRelation[];
    }
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }

    const config = createNewProtagonist(input);
    const errors = validateProtagonist(config, story);
    if (errors.length > 0) {
      lastError.value = t('story.protagonistInvalid', { errors: errors.join('；') });
      return false;
    }

    story.protagonist = config;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistSetCustom', { name: config.name });
    return true;
  }

  /**
   * 更新主角配置（patch 部分字段，自动更新 updatedAt）
   */
  function updateProtagonist(
    storyId: string,
    patch: Partial<Omit<ProtagonistConfig, 'createdAt' | 'updatedAt'>>
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const updated = patchProtagonist(story.protagonist, patch);
    const errors = validateProtagonist(updated, story);
    if (errors.length > 0) {
      lastError.value = t('story.protagonistInvalid', { errors: errors.join('；') });
      return false;
    }

    story.protagonist = updated;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistUpdated', { name: updated.name });
    return true;
  }

  /**
   * 清除主角配置
   */
  function clearProtagonist(storyId: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastInfo.value = t('story.noProtagonistClear');
      return true;
    }
    const name = story.protagonist.name;
    story.protagonist = null;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistCleared', { name });
    return true;
  }

  /**
   * 添加/更新主角与原有人物的关系
   * 相同 target 会替换原 relation
   */
  function addProtagonistRelation(
    storyId: string,
    target: string,
    relation: string
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const newRelations = addRelationCore(story.protagonist.relations, target, relation);
    return updateProtagonist(storyId, { relations: newRelations });
  }

  /**
   * 移除主角与指定人物的关系
   */
  function removeProtagonistRelation(storyId: string, target: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const newRelations = removeRelationCore(story.protagonist.relations, target);
    return updateProtagonist(storyId, { relations: newRelations });
  }

  /**
   * 设置起始场景
   * @param storyId 故事 ID
   * @param sceneName 场景名（必须在 story.scenes 内），传空字符串清除
   */
  function setStartingScene(storyId: string, sceneName: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const target = sceneName.trim() === '' ? undefined : sceneName;
    return updateProtagonist(storyId, { startingScene: target });
  }

  /**
   * 旧版关联 Persona ID。0.9.0 仅用于清理旧故事数据，不创建新的用户身份。
   */
  function setProtagonistPersonaId(storyId: string, personaId: string | null): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }
    return updateProtagonist(storyId, { personaId });
  }

  return {
    setProtagonistFromCharacter,
    setProtagonistAsCustom,
    updateProtagonist,
    clearProtagonist,
    addProtagonistRelation,
    removeProtagonistRelation,
    setStartingScene,
    setProtagonistPersonaId,
  };
}
