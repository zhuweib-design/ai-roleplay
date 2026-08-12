/**
 * 世界观 AI 生成 (F06.8, v1.1 新增)
 *
 * 业务逻辑：
 * - 用户选择世界类型（奇幻/科幻/现代/末日/历史），AI 生成整体世界描述 + 3-5 个大区，
 *   每个大区下 2-3 个子区域
 * - AI 扩展模式：基于已有 Lorebook 条目智能生成相关新条目（如同一大区下的补充地点）
 * - 生成结果为草稿状态，用户编辑后才写入 Lorebook
 *
 * 规则约束：
 * - 生成使用当前激活的 API 连接（依赖 F02）
 * - 生成 Prompt 包含世界类型约束和已有条目上下文（扩展模式）
 * - 单次生成消耗约 1000-2000 Token
 * - 边界处理：API 未连接时禁用；生成失败提示错误并允许重试
 */

import type {
  WorldType,
  WorldDescription,
  LorebookEntry,
} from './lorebook';
import { parseAiJson, parseAiJsonArray } from './json-utils';

// ── 模板定义 ──

/** 世界生成模板 id（与 WorldType 对齐，多一个 'postapoc' 末日类型） */
export type WorldTemplateId = WorldType | 'postapoc';

export interface WorldTemplateMeta {
  id: WorldTemplateId;
  label: string;
  description: string;
  /** 推荐生成的大区数量范围 */
  regionCount: { min: number; max: number };
  /** 每个大区下子区域数量范围 */
  subAreaCount: { min: number; max: number };
  /** 示例大区主题（供 AI 参考） */
  sampleRegions: string[];
}

/**
 * 预设生成模板（奇幻/科幻/现代/末日/历史）
 * 标签与 WorldType 对齐：fantasy/scifi/modern/historical/other → 增加 postapoc
 */
export const WORLD_TEMPLATES: readonly WorldTemplateMeta[] = [
  {
    id: 'fantasy',
    label: '奇幻',
    description: '剑与魔法的中世纪奇幻世界，包含王国、精灵森林、矮人山脉、龙巢等元素',
    regionCount: { min: 3, max: 5 },
    subAreaCount: { min: 2, max: 3 },
    sampleRegions: ['王都', '精灵森林', '矮人山脉', '魔法学院', '龙巢险地'],
  },
  {
    id: 'scifi',
    label: '科幻',
    description: '未来太空殖民与高科技文明，包含星际城市、殖民星球、赛博空间等元素',
    regionCount: { min: 3, max: 5 },
    subAreaCount: { min: 2, max: 3 },
    sampleRegions: ['星际联邦首都', '火星殖民地', '赛博都市', '小行星带矿区', '深空研究站'],
  },
  {
    id: 'modern',
    label: '现代',
    description: '当代都市日常生活场景，包含城市、校园、商业区、住宅区等元素',
    regionCount: { min: 3, max: 5 },
    subAreaCount: { min: 2, max: 3 },
    sampleRegions: ['市中心商业区', '大学校园', '住宅小区', '购物广场', '车站周边'],
  },
  {
    id: 'postapoc',
    label: '末日',
    description: '末日废土生存世界，包含废墟城市、避难所、辐射区、幸存者营地等元素',
    regionCount: { min: 3, max: 5 },
    subAreaCount: { min: 2, max: 3 },
    sampleRegions: ['废墟都市', '地下避难所', '辐射隔离区', '幸存者营地', '物资中转站'],
  },
  {
    id: 'historical',
    label: '历史',
    description: '历史题材世界，包含古代王朝、边疆要塞、商贸城市等元素',
    regionCount: { min: 3, max: 5 },
    subAreaCount: { min: 2, max: 3 },
    sampleRegions: ['京畿皇城', '边疆要塞', '商贸港口', '江南水乡', '塞外草原'],
  },
  {
    id: 'other',
    label: '通用',
    description: '不限定风格的通用世界观，由 AI 自由发挥',
    regionCount: { min: 3, max: 5 },
    subAreaCount: { min: 2, max: 3 },
    sampleRegions: ['核心区域', '边缘地带', '神秘地域'],
  },
];

/**
 * 根据 id 获取模板元数据
 */
export function getWorldTemplateMeta(
  id: WorldTemplateId
): WorldTemplateMeta | undefined {
  return WORLD_TEMPLATES.find((t) => t.id === id);
}

/**
 * 将 WorldTemplateId 转换为 WorldType
 * 'postapoc' 归为 'other'，其他直接透传
 */
export function templateIdToWorldType(id: WorldTemplateId): WorldType {
  return id === 'postapoc' ? 'other' : id;
}

// ── 随机种子 ──

/**
 * 生成随机种子（避免重复生成相同世界）
 */
export function generateWorldSeed(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${time}${rand}`.slice(-8);
}

// ── 生成结果类型 ──

/** AI 生成的子区域 */
export interface GeneratedSubArea {
  title: string;
  keys: string[];
  content: string;
}

/** AI 生成的大区 */
export interface GeneratedRegion {
  title: string;
  keys: string[];
  content: string;
  subAreas: GeneratedSubArea[];
}

/** AI 生成的完整世界结构（创建模式） */
export interface GeneratedWorld {
  /** 整体世界描述（对应 Lorebook.worldDescription） */
  world: {
    name: string;
    type: WorldType;
    keys: string[];
    content: string;
  };
  /** 大区列表（每个含子区域） */
  regions: GeneratedRegion[];
}

// ── Prompt 构建 ──

/**
 * 构建世界生成 Prompt (F06.8 创建模式)
 *
 * @param templateId 模板 id
 * @param seed 随机种子
 * @returns 发送给 LLM 的消息列表
 */
export function buildWorldGenerationMessages(
  templateId: WorldTemplateId,
  seed: string,
  sourceContext?: string
): Array<{ role: 'system' | 'user'; content: string }> {
  const meta = getWorldTemplateMeta(templateId);
  const label = meta?.label ?? '通用';
  const desc = meta?.description ?? '';
  const regionCount = meta?.regionCount ?? { min: 3, max: 5 };
  const subAreaCount = meta?.subAreaCount ?? { min: 2, max: 3 };
  const sampleRegions = meta?.sampleRegions ?? [];

  const worldType = templateIdToWorldType(templateId);

  const systemContent = `你是一个专业的世界观创作助手，擅长为角色扮演游戏构建层次丰富、设定自洽的世界观。请严格按照用户要求生成内容，并以 JSON 格式返回，不要输出任何其他文字。`;

  const userContent = `请根据以下要求生成一个完整的世界观设定。

【世界类型】${label}：${desc}
【随机种子】${seed}（基于此种子确保世界独特性，避免与常见模板雷同）
${
  sourceContext
    ? `【源素材参考】（来自用户小说的设定，生成时请融合采纳，不要丢弃其中明确的世界观要素）\n${sourceContext}\n`
    : ''
}

请生成：
1. 整体世界描述（world）：世界名称、世界类型（"${worldType}"）、3-5 个核心关键字、200-500 字的世界总览
2. ${regionCount.min}-${regionCount.max} 个大区（regions），每个大区包含：
   - title：大区名称（2-8字，独特且符合风格）
   - keys：3-5 个触发关键字
   - content：100-300 字大区描述（地理/人文/特色）
   - subAreas：${subAreaCount.min}-${subAreaCount.max} 个子区域，每个含 title/keys/content（50-150字）

参考大区主题（不要完全照搬）：${sampleRegions.join('、')}

返回纯 JSON（不要 markdown 代码块包裹），结构如下：
{
  "world": {
    "name": "世界名称",
    "type": "${worldType}",
    "keys": ["关键字1", "关键字2"],
    "content": "世界总览描述..."
  },
  "regions": [
    {
      "title": "大区名",
      "keys": ["大区关键字"],
      "content": "大区描述...",
      "subAreas": [
        {
          "title": "子区域名",
          "keys": ["子区域关键字"],
          "content": "子区域描述..."
        }
      ]
    }
  ]
}

要求：
1. 名称独特，避免使用常见俗套名称
2. 描述详细有吸引力，能为后续角色对话提供丰富背景
3. 关键字精炼，便于条目激活
4. 层级结构合理：世界总览 → 大区 → 子区域
5. 只返回 JSON，不要任何解释或 markdown 包裹`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

/**
 * 构建扩展生成 Prompt (F06.8 扩展模式)
 *
 * 基于现有 Lorebook 的条目，生成相关的新大区/子区域补充。
 *
 * @param existingEntries 现有条目（含层级信息）
 * @param worldDesc 当前世界描述（可选）
 * @param seed 随机种子
 * @returns 发送给 LLM 的消息列表
 */
export function buildWorldExtendMessages(
  existingEntries: LorebookEntry[],
  worldDesc: WorldDescription | null,
  seed: string
): Array<{ role: 'system' | 'user'; content: string }> {
  // 将现有条目扁平化为简短描述供 AI 上下文
  const entriesSummary = existingEntries
    .map((e) => {
      const level = e.hierarchyLevel ?? 0;
      const levelLabel = level === 0 ? '世界' : level === 1 ? '大区' : '子区域';
      const keys = e.keys.length > 0 ? e.keys.join('/') : '（无关键字）';
      const contentPreview =
        e.content.length > 80 ? e.content.slice(0, 80) + '...' : e.content;
      return `- [${levelLabel}] ${e.title}（关键字：${keys}）：${contentPreview}`;
    })
    .join('\n');

  const worldDescText = worldDesc
    ? `当前世界：${worldDesc.name}（类型：${worldDesc.type}，关键字：${worldDesc.keys.join('/')}）\n${worldDesc.content}`
    : '（未设置整体世界描述）';

  const systemContent = `你是一个专业的世界观扩展助手。请基于现有世界观条目，智能生成与之相关的新大区或子区域补充，保持风格一致并避免与已有内容重复。返回纯 JSON 数组，不要输出任何其他文字。`;

  const userContent = `请基于以下已有世界观条目，生成 2-3 个相关的新大区或子区域补充。

【现有世界设定】
${worldDescText}

【已有条目（共 ${existingEntries.length} 条）】
${entriesSummary || '（暂无条目）'}

【随机种子】${seed}（确保生成内容独特）

请生成 2-3 个新大区或子区域补充，返回纯 JSON 数组（不要 markdown 代码块包裹）：
[
  {
    "title": "新区域名",
    "keys": ["关键字1", "关键字2"],
    "content": "区域描述（100-300字）...",
    "subAreas": [
      {
        "title": "子区域名",
        "keys": ["子区域关键字"],
        "content": "子区域描述（50-150字）..."
      }
    ]
  }
]

要求：
1. 新内容与已有条目风格一致，但避免重复主题
2. 可以是大区（含子区域）或仅子区域（subAreas 留空数组）
3. 关键字精炼，与已有条目关键字有适当区分
4. 只返回 JSON 数组，不要任何解释或 markdown 包裹`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ── 解析 ──

/**
 * 安全解析字符串数组
 */
function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 安全解析子区域
 */
function parseSubArea(raw: unknown): GeneratedSubArea | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (title === '') return null;
  return {
    title,
    keys: parseStringArray(obj.keys),
    content: typeof obj.content === 'string' ? obj.content : '',
  };
}

/**
 * 安全解析大区
 */
function parseRegion(raw: unknown): GeneratedRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (title === '') return null;
  const subAreasRaw = Array.isArray(obj.subAreas) ? obj.subAreas : [];
  const subAreas = subAreasRaw
    .map(parseSubArea)
    .filter((s): s is GeneratedSubArea => s !== null);
  return {
    title,
    keys: parseStringArray(obj.keys),
    content: typeof obj.content === 'string' ? obj.content : '',
    subAreas,
  };
}

/**
 * 解析 AI 返回的文本为 GeneratedWorld (F06.8 创建模式)
 *
 * @param raw AI 返回的原始文本
 * @returns 解析成功返回 GeneratedWorld，失败返回 null
 */
export function parseGeneratedWorld(raw: string): GeneratedWorld | null {
  if (!raw || typeof raw !== 'string') return null;

  const obj = parseAiJson<Record<string, unknown>>(raw);
  if (!obj || typeof obj !== 'object') return null;

  // world 字段必填
  const worldRaw = obj.world;
  if (!worldRaw || typeof worldRaw !== 'object') return null;
  const worldObj = worldRaw as Record<string, unknown>;
  const worldName = typeof worldObj.name === 'string' ? worldObj.name.trim() : '';
  if (worldName === '') return null;

  const worldTypeRaw = worldObj.type;
  const worldType: WorldType =
    worldTypeRaw === 'fantasy' ||
    worldTypeRaw === 'scifi' ||
    worldTypeRaw === 'modern' ||
    worldTypeRaw === 'historical' ||
    worldTypeRaw === 'other'
      ? worldTypeRaw
      : 'other';

  // regions 必须是非空数组
  const regionsRaw = Array.isArray(obj.regions) ? obj.regions : [];
  const regions = regionsRaw
    .map(parseRegion)
    .filter((r): r is GeneratedRegion => r !== null);
  if (regions.length === 0) return null;

  return {
    world: {
      name: worldName,
      type: worldType,
      keys: parseStringArray(worldObj.keys),
      content: typeof worldObj.content === 'string' ? worldObj.content : '',
    },
    regions,
  };
}

/**
 * 解析 AI 返回的文本为 GeneratedRegion[] (F06.8 扩展模式)
 *
 * @param raw AI 返回的原始文本
 * @returns 解析成功返回 GeneratedRegion[]，失败返回空数组
 */
export function parseExtendedRegions(raw: string): GeneratedRegion[] {
  if (!raw || typeof raw !== 'string') return [];

  const arr = parseAiJsonArray<unknown>(raw);
  if (!arr) return [];

  return arr
    .map(parseRegion)
    .filter((r): r is GeneratedRegion => r !== null);
}
