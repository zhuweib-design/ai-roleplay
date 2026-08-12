/**
 * 角色属性系统 (F01.6, v1.1 新增)
 *
 * 规则约束：
 * - 属性字段为可选项，不影响 V2 格式导入导出兼容性
 * - V2 导出时存入 data.extensions.attributes
 * - 导入不含属性字段的 V2 角色卡时，属性面板为空，不影响正常使用
 */

/** 单个属性项（键值对，支持数值或文本类型） */
export interface CharacterAttribute {
  /** 属性名（如"力量"/"敏捷"/"智力"） */
  name: string;
  /** 属性值（数值类型也以字符串存储，便于编辑） */
  value: string;
  /** 值类型：number=数值（可参与检定），text=文本 */
  type: 'number' | 'text';
}

/** 角色属性集合 */
export interface CharacterAttributes {
  /** 职业（文本，如"战士/法师/盗贼"） */
  profession?: string;
  /** 等级（整数，默认 1） */
  level?: number;
  /** 经验值（整数，默认 0） */
  experience?: number;
  /** 属性组（键值对列表） */
  stats?: CharacterAttribute[];
}

export interface CharacterNote {
  text: string;
  depth: number;
  role: 'system' | 'user' | 'assistant';
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  swipes: string[];
  swipeIndex: number;
}

/**
 * UI 层扩展字段（非 SillyTavern V2 标准，迭代33 收拢）
 *
 * 此前这些字段散落在 CharacterCard 顶层索引签名，导致：
 * - 新增 UI 字段需同时改 UICharacter / CharacterCard 透传 / type-adapters 三处
 * - cardToUiChar 需要 as 断言才能读回（索引签名返回 unknown）
 *
 * 收进显式命名空间 ext: 后，adapter 只做整体打包/解包，字段归属清晰。
 * V2 导出时 ext 作为整体字段进入 data.ext，导入时原样保留。
 */
export interface CharacterExt {
  /** 默认模型 ID */
  model?: string;
  /** 采样温度 */
  temperature?: number;
  /** 最大生成 Token 数 */
  maxTokens?: number;
  /** 头像类型：图片或渐变 */
  avatarType?: 'image' | 'gradient';
  gradientFrom?: string;
  gradientTo?: string;
  /** 关联的故事 ID（null=未关联，不启用时间/主角系统） */
  storyId?: string | null;
  /** 绑定的世界书 ID 列表 */
  boundWorldBookIds?: string[];
}

export interface CharacterCard {
  id: string;
  name: string;
  avatar?: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  exampleMessages: string;
  characterNote: CharacterNote | null;
  talkativeness: number;
  tags: string[];
  favorite: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
  /** F01.6 角色属性（可选，v1.1 新增） */
  attributes?: CharacterAttributes;
  /** 迭代33：UI 层扩展字段命名空间 */
  ext?: CharacterExt;
  [key: string]: unknown;
}

export interface V2CardJson {
  spec: string;
  spec_version: string;
  data: Record<string, unknown>;
}

/**
 * 角色卡验证 (F01.1)
 * 返回错误消息数组，空数组表示验证通过。
 */
export function validateCharacterCard(card: Partial<CharacterCard>): string[] {
  const errors: string[] = [];

  if (!card.name || card.name.trim() === '') {
    errors.push('角色名不能为空');
  } else if (card.name.length > 50) {
    errors.push('角色名不能超过50个字符');
  }

  if (card.talkativeness !== undefined && (card.talkativeness < 0 || card.talkativeness > 100)) {
    errors.push('健谈度必须在0-100之间');
  }

  // F01.6 角色属性校验
  if (card.attributes) {
    const attrs = card.attributes;
    if (attrs.profession !== undefined && attrs.profession !== '' && attrs.profession.length > 30) {
      errors.push('职业不能超过30个字符');
    }
    if (attrs.level !== undefined) {
      if (!Number.isInteger(attrs.level) || attrs.level < 0) {
        errors.push('等级必须是非负整数');
      }
    }
    if (attrs.experience !== undefined) {
      if (!Number.isInteger(attrs.experience) || attrs.experience < 0) {
        errors.push('经验值必须是非负整数');
      }
    }
    if (Array.isArray(attrs.stats)) {
      const statNames = new Set<string>();
      for (const stat of attrs.stats) {
        if (!stat.name || stat.name.trim() === '') {
          errors.push('属性名不能为空');
          break;
        }
        if (stat.type !== 'number' && stat.type !== 'text') {
          errors.push(`属性"${stat.name}"的类型必须为 number 或 text`);
          break;
        }
        const key = stat.name.trim();
        if (statNames.has(key)) {
          errors.push(`属性名"${key}"重复`);
          break;
        }
        statNames.add(key);
      }
    }
  }

  return errors;
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 验证并安全提取字符串值
 */
function asString(value: unknown, defaultValue = ''): string {
  return typeof value === 'string' ? value : defaultValue;
}

/**
 * 验证并安全提取字符串数组
 */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * 安全解析角色属性 (F01.6)
 * 从 V2 卡的 data.extensions.attributes 提取属性，校验合法性。
 * 非法字段会被忽略（保持默认 undefined），避免数据不一致。
 */
function parseAttributes(raw: unknown): CharacterAttributes | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const attrs: CharacterAttributes = {};

  if (typeof obj.profession === 'string' && obj.profession !== '') {
    attrs.profession = obj.profession;
  }

  if (typeof obj.level === 'number' && Number.isInteger(obj.level) && obj.level >= 0) {
    attrs.level = obj.level;
  }

  if (typeof obj.experience === 'number' && Number.isInteger(obj.experience) && obj.experience >= 0) {
    attrs.experience = obj.experience;
  }

  if (Array.isArray(obj.stats)) {
    const stats: CharacterAttribute[] = [];
    const seenNames = new Set<string>();
    for (const item of obj.stats) {
      if (!item || typeof item !== 'object') continue;
      const s = item as Record<string, unknown>;
      const name = typeof s.name === 'string' ? s.name.trim() : '';
      if (name === '' || seenNames.has(name)) continue;
      seenNames.add(name);
      const type = s.type === 'number' || s.type === 'text' ? s.type : 'text';
      const value = typeof s.value === 'string' ? s.value : String(s.value ?? '');
      stats.push({ name, value, type });
    }
    if (stats.length > 0) {
      attrs.stats = stats;
    }
  }

  // 仅当至少有一个有效字段时才返回
  if (
    attrs.profession ||
    attrs.level !== undefined ||
    attrs.experience !== undefined ||
    (attrs.stats && attrs.stats.length > 0)
  ) {
    return attrs;
  }
  return undefined;
}

/**
 * 验证并安全提取 V2CardJson 结构
 * 如果结构不合法，抛出明确错误。
 */
function parseV2CardJson(json: unknown): V2CardJson {
  if (json === null || typeof json !== 'object') {
    throw new Error('无法识别的角色卡格式：输入不是有效对象');
  }

  const obj = json as Record<string, unknown>;

  if (obj.spec !== 'chara_card_v2') {
    throw new Error('无法识别的角色卡格式');
  }

  if (obj.data === null || typeof obj.data !== 'object') {
    throw new Error('角色卡 data 字段无效：必须是对象');
  }

  return obj as unknown as V2CardJson;
}

/**
 * 角色卡 V2 导入 (F01.2)
 * 从 SillyTavern V2 JSON 格式导入角色卡。
 */
export function importV2Card(json: unknown): CharacterCard {
  const v2 = parseV2CardJson(json);

  const data = v2.data as Record<string, unknown>;
  const now = new Date().toISOString();

  const card: CharacterCard = {
    id: generateId(),
    name: asString(data.name),
    description: asString(data.description),
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    firstMessage: asString(data.first_mes),
    alternateGreetings: asStringArray(data.alternate_greetings),
    exampleMessages: asString(data.mes_example),
    characterNote: null,
    talkativeness: 50,
    tags: asStringArray(data.tags),
    favorite: false,
    version: '1.0',
    createdAt: now,
    updatedAt: now,
  };

  // 保留未知字段（跳过原型污染危险键：__proto__/constructor/prototype）
  for (const key of Object.keys(data)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    if (!(key in card)) {
      card[key] = data[key];
    }
  }

  // F01.6 从 data.extensions.attributes 解析角色属性
  if (data.extensions && typeof data.extensions === 'object') {
    const extObj = data.extensions as Record<string, unknown>;
    const attributes = parseAttributes(extObj.attributes);
    if (attributes) {
      card.attributes = attributes;
    }
  }

  return card;
}

/**
 * 角色卡 V2 导出 (F01.3)
 * 导出为 SillyTavern V2 JSON 格式。
 */
export function exportV2Card(card: CharacterCard): V2CardJson {
  const knownKeys = new Set([
    'id', 'name', 'avatar', 'description', 'personality', 'scenario',
    'firstMessage', 'alternateGreetings', 'exampleMessages', 'characterNote',
    'talkativeness', 'tags', 'favorite', 'version', 'createdAt', 'updatedAt',
    'attributes', // F01.6 显式处理，不进入 extraFields
  ]);

  const extraFields: Record<string, unknown> = {};
  for (const key of Object.keys(card)) {
    if (!knownKeys.has(key)) {
      extraFields[key] = card[key];
    }
  }

  const data: Record<string, unknown> = {
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_mes: card.firstMessage,
    alternate_greetings: card.alternateGreetings,
    mes_example: card.exampleMessages,
    tags: card.tags,
    ...extraFields,
  };

  // F01.6 将 attributes 存入 data.extensions.attributes
  // 若 extensions 已存在（从导入保留），合并 attributes 到其中
  if (card.attributes) {
    const existingExt =
      data.extensions && typeof data.extensions === 'object'
        ? { ...(data.extensions as Record<string, unknown>) }
        : {};
    existingExt.attributes = card.attributes;
    data.extensions = existingExt;
  }

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data,
  };
}
