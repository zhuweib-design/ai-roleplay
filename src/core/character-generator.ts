/**
 * 角色随机生成 (F01.7, v1.1 新增)
 *
 * 业务逻辑：
 * - 用户选择生成模板（奇幻/科幻/现代/末日），AI 根据模板生成完整角色卡
 * - 生成 Prompt 包含模板约束和随机种子（避免重复生成相同角色）
 * - 生成结果自动填充属性字段（F01.6）
 * - 单次生成消耗约 500-1000 Token
 *
 * 规则约束：
 * - 生成使用当前激活的 API 连接（依赖 F02）
 * - 边界处理：API 未连接时禁用；生成失败提示错误并允许重试
 */

import type { CharacterAttributes, CharacterAttribute } from './character-card';
import { parseAiJson } from './json-utils';

// ── 模板定义 ──

export type CharacterTemplateId = 'fantasy' | 'scifi' | 'modern' | 'postapoc';

export interface CharacterTemplateMeta {
  id: CharacterTemplateId;
  label: string;
  description: string;
  /** 推荐属性示例（供 AI 参考） */
  sampleStats: Array<{ name: string; type: 'number' | 'text' }>;
}

/**
 * 预设生成模板（奇幻/科幻/现代/末日）
 */
export const CHARACTER_TEMPLATES: readonly CharacterTemplateMeta[] = [
  {
    id: 'fantasy',
    label: '奇幻',
    description: '剑与魔法的中世纪奇幻世界，包含骑士、法师、精灵、龙等元素',
    sampleStats: [
      { name: '力量', type: 'number' },
      { name: '敏捷', type: 'number' },
      { name: '智力', type: 'number' },
      { name: '魅力', type: 'number' },
    ],
  },
  {
    id: 'scifi',
    label: '科幻',
    description: '未来太空殖民与高科技文明，包含星际旅行、赛博朋克、人工智能等元素',
    sampleStats: [
      { name: '体能', type: 'number' },
      { name: '智力', type: 'number' },
      { name: '技术', type: 'number' },
      { name: '骇客', type: 'number' },
    ],
  },
  {
    id: 'modern',
    label: '现代',
    description: '当代都市日常生活，包含学生、职场、恋爱、社交等元素',
    sampleStats: [
      { name: '魅力', type: 'number' },
      { name: '智慧', type: 'number' },
      { name: '体力', type: 'number' },
      { name: '社交', type: 'number' },
    ],
  },
  {
    id: 'postapoc',
    label: '末日',
    description: '末日废土生存冒险，包含物资匮乏、变异生物、幸存者群落等元素',
    sampleStats: [
      { name: '生存', type: 'number' },
      { name: '战斗', type: 'number' },
      { name: '耐力', type: 'number' },
      { name: '幸运', type: 'number' },
    ],
  },
];

/**
 * 根据 id 获取模板元数据
 */
export function getTemplateMeta(
  id: CharacterTemplateId
): CharacterTemplateMeta | undefined {
  return CHARACTER_TEMPLATES.find((t) => t.id === id);
}

// ── 随机种子 ──

/**
 * 生成随机种子（用于避免重复生成相同角色）
 * 8 位 base36 字符串，组合时间戳与随机数
 */
export function generateSeed(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${time}${rand}`.slice(-8);
}

// ── 生成结果类型 ──

/**
 * AI 生成的角色卡结构（解析后）
 */
export interface GeneratedCharacter {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  tags: string[];
  attributes?: CharacterAttributes;
}

// ── Prompt 构建 ──

/**
 * 构建角色生成 Prompt (F01.7)
 *
 * @param templateId 模板 id
 * @param seed 随机种子（避免重复）
 * @returns 发送给 LLM 的消息列表
 */
export function buildGenerationMessages(
  templateId: CharacterTemplateId,
  seed: string,
  sourceContext?: string
): Array<{ role: 'system' | 'user'; content: string }> {
  const meta = getTemplateMeta(templateId);
  const templateLabel = meta?.label ?? '通用';
  const templateDesc = meta?.description ?? '';
  const sampleStats = meta?.sampleStats ?? [];

  const statsExample = sampleStats
    .map((s) => `{"name": "${s.name}", "value": "10", "type": "${s.type}"}`)
    .join(', ');

  const systemContent = `你是一个专业的角色创作助手，擅长为角色扮演游戏创作生动、独特、有吸引力的角色。请严格按照用户的要求生成角色，并以 JSON 格式返回，不要输出任何其他文字。`;

  const userContent = `请根据以下要求生成一个完整的角色卡。

【模板风格】${templateLabel}：${templateDesc}
【随机种子】${seed}（基于此种子确保角色独特性，避免与常见模板雷同）
${
  sourceContext
    ? `【源素材参考】（来自用户小说的设定，生成角色时请与其中的人物/背景保持一致，不要丢弃明确设定）\n${sourceContext}\n`
    : ''
}

请生成符合该模板风格的角色，返回纯 JSON（不要 markdown 代码块包裹），结构如下：
{
  "name": "角色名（2-12字，独特且符合风格）",
  "description": "角色外貌与背景描述（100-300字，生动具体）",
  "personality": "性格特征描述（50-150字，含优缺点）",
  "scenario": "{{user}} 与该角色相遇的场景描述（50-150字）",
  "firstMessage": "角色的开场白，含动作描写和对话（50-200字，用 *包裹动作*）",
  "tags": ["标签1", "标签2", "标签3"],
  "attributes": {
    "profession": "符合风格的职业",
    "level": 1,
    "experience": 0,
    "stats": [${statsExample}]
  }
}

要求：
1. 角色名独特，不使用常见俗套名称
2. 描述详细有吸引力，能让用户产生对话兴趣
3. 属性值合理，与角色设定匹配
4. 标签 2-5 个，反映角色核心特征
5. 只返回 JSON，不要任何解释或 markdown 包裹`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ── 解析 ──

/**
 * 安全解析属性数组
 */
function parseStats(raw: unknown): CharacterAttribute[] {
  if (!Array.isArray(raw)) return [];
  const stats: CharacterAttribute[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    const type: 'number' | 'text' =
      s.type === 'number' || s.type === 'text' ? s.type : 'text';
    const value =
      typeof s.value === 'string'
        ? s.value
        : typeof s.value === 'number'
          ? String(s.value)
          : '';
    stats.push({ name, value, type });
  }
  return stats;
}

/**
 * 安全解析 CharacterAttributes
 */
function parseAttributes(raw: unknown): CharacterAttributes | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  // 空对象返回 undefined（区分"无属性"与"有键但字段非法"）
  if (Object.keys(obj).length === 0) return undefined;

  const attrs: CharacterAttributes = {};

  if (typeof obj.profession === 'string' && obj.profession.trim() !== '') {
    attrs.profession = obj.profession.trim();
  }

  if (typeof obj.level === 'number' && Number.isInteger(obj.level) && obj.level >= 0) {
    attrs.level = obj.level;
  } else if (typeof obj.level === 'string' && /^\d+$/.test(obj.level)) {
    const n = parseInt(obj.level, 10);
    if (Number.isInteger(n) && n >= 0) attrs.level = n;
  }

  if (typeof obj.experience === 'number' && Number.isInteger(obj.experience) && obj.experience >= 0) {
    attrs.experience = obj.experience;
  } else if (typeof obj.experience === 'string' && /^\d+$/.test(obj.experience)) {
    const n = parseInt(obj.experience, 10);
    if (Number.isInteger(n) && n >= 0) attrs.experience = n;
  }

  const stats = parseStats(obj.stats);
  if (stats.length > 0) {
    attrs.stats = stats;
  }

  // 只要原始对象有键，就返回 attributes 对象（即使字段都被过滤为非法）
  return attrs;
}

/**
 * 解析 AI 返回的文本为 GeneratedCharacter (F01.7)
 *
 * @param raw AI 返回的原始文本
 * @returns 解析成功返回 GeneratedCharacter，失败返回 null
 */
export function parseGeneratedCharacter(raw: string): GeneratedCharacter | null {
  if (!raw || typeof raw !== 'string') return null;

  const obj = parseAiJson<Record<string, unknown>>(raw);
  if (!obj || typeof obj !== 'object') return null;

  // name 为必填字段
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (name === '') return null;

  return {
    name,
    description: typeof obj.description === 'string' ? obj.description : '',
    personality: typeof obj.personality === 'string' ? obj.personality : '',
    scenario: typeof obj.scenario === 'string' ? obj.scenario : '',
    firstMessage:
      typeof obj.firstMessage === 'string'
        ? obj.firstMessage
        : typeof obj.first_mes === 'string'
          ? obj.first_mes
          : '',
    tags: Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === 'string')
      : [],
    attributes: parseAttributes(obj.attributes),
  };
}
