/**
 * 随机 NPC 生成 (F10.3, v1.1 新增)
 *
 * 业务逻辑：
 * - 在群聊中触发"生成随机 NPC"功能
 * - AI 根据当前世界上下文、场景设定和主角状态，生成临时角色卡
 * - 生成的 NPC 自动加入当前群聊
 * - NPC 角色卡标记为"临时"类型，与常规角色卡区分
 *
 * 规则约束：
 * - 依赖 F01.7 角色随机生成能力（复用模板与解析逻辑）
 * - 依赖 F06.6 世界层级结构（场景上下文）
 * - 群聊人数上限 8 人（含 NPC），超过上限时提示"群聊已满"
 * - 单次生成消耗约 500-1000 Token
 * - 边界处理：API 未连接时禁用；生成失败提示错误并允许重试
 */

import {
  type CharacterTemplateId,
  type GeneratedCharacter,
  parseGeneratedCharacter,
  generateSeed,
  getTemplateMeta,
} from './character-generator';

// ── NPC 上下文类型 ──

/**
 * NPC 生成时的场景上下文（来自 F06.6 层级结构）
 */
export interface NpcSceneContext {
  /** 世界名称（来自 Lorebook 顶层世界描述） */
  worldName?: string;
  /** 世界类型（fantasy/scifi/modern/postapoc/historical/other） */
  worldType?: string;
  /** 场景名称（Region 名称） */
  regionName?: string;
  /** 子区域名称（Sub-area 名称） */
  subAreaName?: string;
  /** 场景描述（Region/Sub-area 的 content） */
  sceneDescription?: string;
}

/**
 * NPC 生成时的群聊上下文
 */
export interface NpcGroupContext {
  /** 群聊名称 */
  groupName: string;
  /** 现有成员名称列表（避免生成同名 NPC） */
  existingMemberNames: string[];
  /** 当前成员数 */
  memberCount: number;
  /** 群聊人数上限（默认 8） */
  maxMembers: number;
}

/**
 * NPC 生成参数
 */
export interface NpcGenerationParams {
  /** 模板 ID（决定生成风格） */
  templateId: CharacterTemplateId;
  /** 场景上下文 */
  sceneContext: NpcSceneContext;
  /** 群聊上下文 */
  groupContext: NpcGroupContext;
  /** 随机种子（可选，不传自动生成） */
  seed?: string;
}

/**
 * 生成的 NPC 结构（在 GeneratedCharacter 基础上附加临时标记）
 */
export interface GeneratedNpc extends GeneratedCharacter {
  /** 标记为临时 NPC */
  isTemporary: true;
  /** 来源场景（用于追溯） */
  sourceScene?: string;
}

// ── 校验 ──

/**
 * 校验 NPC 生成参数
 * @returns 错误消息数组，空数组表示通过
 */
export function validateNpcParams(params: NpcGenerationParams): string[] {
  const errors: string[] = [];

  if (!params.templateId) {
    errors.push('模板 ID 不能为空');
  } else if (!getTemplateMeta(params.templateId)) {
    errors.push(`未知的模板 ID：${params.templateId}`);
  }

  if (!params.groupContext || typeof params.groupContext.groupName !== 'string') {
    errors.push('群聊上下文无效');
  } else if (params.groupContext.memberCount >= params.groupContext.maxMembers) {
    errors.push(
      `群聊已满（${params.groupContext.memberCount}/${params.groupContext.maxMembers}）`
    );
  }

  return errors;
}

// ── Prompt 构建 ──

/**
 * 构建 NPC 生成 Prompt (F10.3)
 *
 * 与 F01.7 角色生成差异：
 * - 注入场景上下文（世界/场景/子区域）
 * - 注入现有成员名（避免重名）
 * - 强调 NPC 为临时角色，需适合群聊互动
 *
 * @param params 生成参数
 * @returns 发送给 LLM 的消息列表
 */
export function buildNpcGenerationMessages(
  params: NpcGenerationParams
): Array<{ role: 'system' | 'user'; content: string }> {
  const meta = getTemplateMeta(params.templateId);
  const templateLabel = meta?.label ?? '通用';
  const templateDesc = meta?.description ?? '';
  const sampleStats = meta?.sampleStats ?? [];

  const seed = params.seed ?? generateSeed();

  // 构建场景上下文描述
  const sceneParts: string[] = [];
  if (params.sceneContext.worldName) {
    sceneParts.push(`【世界】${params.sceneContext.worldName}`);
  }
  if (params.sceneContext.worldType) {
    sceneParts.push(`【世界类型】${params.sceneContext.worldType}`);
  }
  if (params.sceneContext.regionName) {
    sceneParts.push(`【场景】${params.sceneContext.regionName}`);
  }
  if (params.sceneContext.subAreaName) {
    sceneParts.push(`【子区域】${params.sceneContext.subAreaName}`);
  }
  if (params.sceneContext.sceneDescription) {
    sceneParts.push(`【场景描述】${params.sceneContext.sceneDescription}`);
  }
  const sceneBlock = sceneParts.length > 0 ? sceneParts.join('\n') : '（无场景上下文，按模板风格生成）';

  // 现有成员名（避免重名）
  const existingNames = params.groupContext.existingMemberNames;
  const namesBlock =
    existingNames.length > 0
      ? `【现有成员】${existingNames.join('、')}\n（请避免与上述成员重名）`
      : '（暂无成员）';

  const statsExample = sampleStats
    .map((s) => `{"name": "${s.name}", "value": "10", "type": "${s.type}"}`)
    .join(', ');

  const systemContent = `你是一个专业的角色创作助手，擅长为角色扮演游戏创作生动的临时 NPC（非玩家角色）。NPC 将加入现有群聊与主角互动。请严格按照用户的要求生成，并以 JSON 格式返回，不要输出任何其他文字。`;

  const userContent = `请根据以下要求生成一个临时 NPC 角色，用于加入群聊。

【模板风格】${templateLabel}：${templateDesc}
【随机种子】${seed}（基于此种子确保角色独特性）

${sceneBlock}

${namesBlock}

请生成符合该场景和风格的临时 NPC，返回纯 JSON（不要 markdown 代码块包裹），结构如下：
{
  "name": "NPC 名（2-10字，独特且符合场景风格）",
  "description": "NPC 外貌与背景描述（80-200字，简洁但生动）",
  "personality": "性格特征描述（30-100字，含明显特征便于互动）",
  "scenario": "NPC 出场场景描述（30-80字，说明为何出现在此）",
  "firstMessage": "NPC 的开场白（30-150字，含动作描写和对话，用 *包裹动作*）",
  "tags": ["标签1", "标签2", "标签3"],
  "attributes": {
    "profession": "符合场景的职业",
    "level": 1,
    "experience": 0,
    "stats": [${statsExample}]
  }
}

要求：
1. NPC 名独特，避免与现有成员重名，不使用俗套名称
2. 描述简洁有吸引力，让主角有互动欲望
3. 适合群聊场景，性格鲜明
4. 属性值合理，与 NPC 设定匹配
5. 标签 2-4 个，反映 NPC 核心特征
6. 只返回 JSON，不要任何解释或 markdown 包裹`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ── 解析 ──

/**
 * 解析 AI 返回的文本为 GeneratedNpc (F10.3)
 *
 * 在 GeneratedCharacter 解析基础上：
 * - 附加 isTemporary: true 标记
 * - 附加 sourceScene 来源场景
 *
 * @param raw AI 返回的原始文本
 * @param sceneContext 场景上下文（用于追溯来源）
 * @returns 解析成功返回 GeneratedNpc，失败返回 null
 */
export function parseGeneratedNpc(
  raw: string,
  sceneContext?: NpcSceneContext
): GeneratedNpc | null {
  const character = parseGeneratedCharacter(raw);
  if (!character) return null;

  // 构建 sourceScene 字符串（region/subArea 组合）
  let sourceScene: string | undefined;
  if (sceneContext) {
    const parts: string[] = [];
    if (sceneContext.regionName) parts.push(sceneContext.regionName);
    if (sceneContext.subAreaName) parts.push(sceneContext.subAreaName);
    if (parts.length > 0) sourceScene = parts.join(' / ');
  }

  return {
    ...character,
    isTemporary: true,
    sourceScene,
  };
}

// ── 转换为角色卡 ──

/**
 * 将 GeneratedNpc 转换为 CharacterCard 创建参数（不含 id/createdAt/updatedAt，由 store 填充）
 *
 * 关键差异：
 * - tags 中追加 '__temporary_npc' 标记，便于筛选与清理
 * - favorite 强制为 false
 * - talkativeness 默认 50（适合群聊参与）
 *
 * @param npc 生成的 NPC
 * @returns CharacterCard 创建参数（Partial，缺 id/createdAt/updatedAt）
 */
export function generatedNpcToCard(
  npc: GeneratedNpc
): Omit<import('./character-card').CharacterCard, 'id' | 'createdAt' | 'updatedAt'> {
  const tags = [...new Set([...(npc.tags ?? []), '__temporary_npc'])];

  // CharacterCard 含 [key: string]: unknown 索引签名，
  // isTemporary / sourceScene 作为扩展字段直接附加
  return {
    name: npc.name,
    description: npc.description,
    personality: npc.personality,
    scenario: npc.scenario,
    firstMessage: npc.firstMessage,
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags,
    favorite: false,
    version: '1.0',
    attributes: npc.attributes,
    isTemporary: true,
    sourceScene: npc.sourceScene,
  };
}

// ── 常量 ──

/** 临时 NPC 标记 tag（用于筛选与清理） */
export const TEMPORARY_NPC_TAG = '__temporary_npc';

/**
 * 判断角色卡是否为临时 NPC
 */
export function isTemporaryNpc(card: {
  tags?: string[];
  isTemporary?: unknown;
}): boolean {
  if (card.isTemporary === true) return true;
  return Array.isArray(card.tags) && card.tags.includes(TEMPORARY_NPC_TAG);
}
