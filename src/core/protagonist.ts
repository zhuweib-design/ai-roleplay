/**
 * F16.3 用户主角身份配置 - 核心逻辑
 *
 * 职责：
 * 1. 从已分析的人物中创建主角配置（source='existing'）
 * 2. 创建自定义新主角（source='custom'）
 * 3. 校验主角配置合法性（名称非空、起始场景存在等）
 * 4. 构建主角信息提示词片段（注入 prompt-builder）
 * 5. 起始场景校验：必须在 story.scenes 内
 *
 * 不负责：
 * - Persona 创建（由 persona store.createStoryProtagonistPersona 处理）
 * - 持久化（由 story store + storage adapter 处理）
 */

import { t } from '@/i18n';


import type {
  ProtagonistConfig,
  ProtagonistRelation,
  StoryAnalysisResult,
  StoryCharacter,
} from './story-types';

// ── 常量约束 ──

/** 主角名称最大长度 */
export const MAX_PROTAGONIST_NAME_LENGTH = 30;

/** 主角描述建议最大长度（软限制） */
export const MAX_PROTAGONIST_DESCRIPTION_LENGTH = 500;

/** 关系描述最大长度 */
export const MAX_RELATION_DESC_LENGTH = 50;

/** 单个主角关系条目数上限 */
export const MAX_RELATIONS_COUNT = 20;

// ── 工厂函数 ──

/**
 * 从故事分析结果中的已有人物创建主角配置
 *
 * @param character 故事人物
 * @param role 主角身份（默认 'protagonist'）
 * @param startingScene 起始场景名（可选）
 * @returns ProtagonistConfig（尚未持久化、未关联 personaId）
 */
export function createProtagonistFromCharacter(
  character: StoryCharacter,
  role: ProtagonistConfig['role'] = 'protagonist',
  startingScene?: string
): ProtagonistConfig {
  const now = Date.now();
  return {
    role,
    source: 'existing',
    name: character.name,
    description: character.description ?? '',
    startingScene,
    // 复用原人物的 relationships 转换为主角关系
    relations: (character.relationships ?? []).map((r) => ({
      target: r.target,
      relation: r.relation,
    })),
    personaId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建自定义新主角
 *
 * @param input 用户输入（name 必填，description/role/startingScene 可选）
 * @returns ProtagonistConfig
 */
export function createNewProtagonist(input: {
  name: string;
  description?: string;
  role?: ProtagonistConfig['role'];
  startingScene?: string;
  relations?: ProtagonistRelation[];
}): ProtagonistConfig {
  const now = Date.now();
  return {
    role: input.role ?? 'protagonist',
    source: 'custom',
    name: input.name,
    description: input.description ?? '',
    startingScene: input.startingScene,
    relations: input.relations ?? [],
    personaId: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── 校验 ──

/**
 * 校验主角配置合法性
 * @returns 错误消息数组（空表示通过）
 */
export function validateProtagonist(
  config: Partial<ProtagonistConfig>,
  story?: Pick<StoryAnalysisResult, 'scenes' | 'characters'>
): string[] {
  const errors: string[] = [];

  // 名称校验
  if (!config.name || config.name.trim() === '') {
    errors.push(t('proto.nameRequired'));
  } else if (config.name.length > MAX_PROTAGONIST_NAME_LENGTH) {
    errors.push(t('proto.nameTooLong', { max: MAX_PROTAGONIST_NAME_LENGTH }));
  }

  // 描述长度软限制（允许超过但提示）
  if (
    config.description &&
    config.description.length > MAX_PROTAGONIST_DESCRIPTION_LENGTH * 2
  ) {
    errors.push(
      t('proto.descTooLong', { max: MAX_PROTAGONIST_DESCRIPTION_LENGTH })
    );
  }

  // source='existing' 时校验名称在 story.characters 内
  if (config.source === 'existing' && story) {
    const exists = story.characters.some((c) => c.name === config.name);
    if (!exists) {
      errors.push(
        t('proto.nameNotInStory', { name: config.name ?? '' })
      );
    }
  }

  // 起始场景校验：若提供则必须在 story.scenes 内
  if (config.startingScene && story) {
    const sceneExists = story.scenes.some((s) => s.name === config.startingScene);
    if (!sceneExists) {
      errors.push(
        t('proto.sceneNotInStory', { scene: config.startingScene })
      );
    }
  }

  // 关系列表校验
  if (config.relations) {
    if (config.relations.length > MAX_RELATIONS_COUNT) {
      errors.push(t('proto.relationsLimit', { max: MAX_RELATIONS_COUNT }));
    }
    for (let i = 0; i < config.relations.length; i++) {
      const rel = config.relations[i];
      if (!rel.target || rel.target.trim() === '') {
        errors.push(t('proto.relationTargetRequired', { index: i + 1 }));
      }
      if (!rel.relation || rel.relation.trim() === '') {
        errors.push(t('proto.relationDescRequired', { index: i + 1 }));
      } else if (rel.relation.length > MAX_RELATION_DESC_LENGTH) {
        errors.push(
          t('proto.relationDescTooLong', { index: i + 1, max: MAX_RELATION_DESC_LENGTH })
        );
      }
    }
  }

  return errors;
}

// ── 提示词构建 ──

/**
 * 构建主角信息提示词片段（注入 system prompt）
 *
 * 输出格式示例：
 * ```
 * [Story Protagonist]
 * 身份：主角（参与剧情推进）
 * 名字：李雷
 * 描述：年轻的剑士，性格坚毅...
 * 起始场景：王都市场
 *
 * [主角与原有人物的关系]
 * - 韩梅梅：青梅竹马
 * - 王老板：雇佣关系
 * ```
 *
 * @param config 主角配置
 * @returns 提示词文本（config 为空或未设置时返回空字符串）
 */
// i18n-ignore-start -- LLM 提示词注入（非 UI 文案）
export function buildProtagonistPrompt(config: ProtagonistConfig | null | undefined): string {
  if (!config) return '';

  const lines: string[] = [];
  lines.push('[Story Protagonist]');

  const roleLabel =
    config.role === 'protagonist' ? '主角（参与剧情推进）' : '旁观者（以第三人称视角观察）';
  lines.push(`身份：${roleLabel}`);
  lines.push(`名字：${config.name}`);

  if (config.description) {
    lines.push(`描述：${config.description}`);
  }

  if (config.startingScene) {
    lines.push(`起始场景：${config.startingScene}`);
  }

  if (config.relations && config.relations.length > 0) {
    lines.push('');
    lines.push('[主角与原有人物的关系]');
    for (const rel of config.relations) {
      lines.push(`- ${rel.target}：${rel.relation}`);
    }
  }

  return lines.join('\n');
}
// i18n-ignore-end


// ── 关系操作辅助 ──

/**
 * 添加一条关系（去重：相同 target 替换原 relation）
 * @returns 新关系数组（不可变更新）
 */
export function addRelation(
  relations: ProtagonistRelation[],
  target: string,
  relation: string
): ProtagonistRelation[] {
  const filtered = relations.filter((r) => r.target !== target);
  return [...filtered, { target, relation }];
}

/**
 * 移除指定 target 的关系
 */
export function removeRelation(
  relations: ProtagonistRelation[],
  target: string
): ProtagonistRelation[] {
  return relations.filter((r) => r.target !== target);
}

/**
 * 更新主角配置（patch 部分字段，自动更新 updatedAt）
 */
export function patchProtagonist(
  config: ProtagonistConfig,
  patch: Partial<Omit<ProtagonistConfig, 'createdAt' | 'updatedAt'>>
): ProtagonistConfig {
  return {
    ...config,
    ...patch,
    updatedAt: Date.now(),
  };
}
