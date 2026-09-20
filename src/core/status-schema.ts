/**
 * P1 角色状态栏 —— 类型与内置字段注册表
 *
 * 设计红线（详见 docs/design/character-status-hud-增量设计.md §4）：
 * 1. 本文件**不得出现任何中文字符**（i18n strict 门禁扫 src/ 源码）。
 *    展示名的中文只存在于 ① i18n locales ② 角色卡数据（用户数据）③ 模型输出（运行时数据）。
 * 2. 匹配只用**结构化 key**（英文标识符），绝不用自然语言词做匹配。
 * 3. core 层不依赖 components，图标名用字面量联合类型，由渲染层映射到 IconName。
 */

/** 状态字段值类型 */
export type StatusValueType = 'string' | 'number' | 'enum';

/**
 * 状态图标名（与 src/components/common/icons.ts 白名单一一对应）
 *
 * 不用 import IconName：core 依赖 components 会形成 core→components 的反向依赖。
 * 由 tests/core/status-schema.test.ts 断言每个名字在 PATHS 中存在（防改名漂移）。
 */
export type StatusIconName =
  | 'map-pin'
  | 'clock'
  | 'heart'
  | 'user'
  | 'users'
  | 'star'
  | 'chat-circle'
  | 'archive';

/** 图标白名单（运行时校验用；与 StatusIconName 保持同步） */
export const STATUS_ICON_NAMES: readonly StatusIconName[] = [
  'map-pin',
  'clock',
  'heart',
  'user',
  'users',
  'star',
  'chat-circle',
  'archive',
] as const;

/** 值类型白名单（运行时校验用） */
export const STATUS_VALUE_TYPES: readonly StatusValueType[] = ['string', 'number', 'enum'] as const;

/** 单条状态字段的 schema 定义（角色卡自带） */
export interface StatusFieldDef {
  /**
   * 结构化 key（英文标识符，小写 snake/camel 均可，匹配前会归一化）
   * 这是**匹配与持久化的唯一依据**，不是展示名。
   */
  key: string;
  /** 值类型，缺省 'string' */
  type?: StatusValueType;
  /**
   * 展示名（角色卡创作者填写，属**用户数据**，可含中文，不受 i18n 门禁管辖）
   * 优先级：labelI18nKey > label > 内置表 i18nKey > key 原样
   */
  label?: string;
  /** i18n key（内置字段预设用；命中时优先于 label） */
  labelI18nKey?: string;
  /** 图标（必须命中 icons.ts 白名单，否则降级为无图标） */
  icon?: StatusIconName;
  /** type='enum' 时的值域（仅作校验与 UI 下拉，**不在值域内也不丢弃**） */
  options?: string[];
  /** type='number' 时的取值范围（同样不强制） */
  min?: number;
  max?: number;
  /** 嗅探别名（归一化后参与匹配；可填任何语言，因为是用户数据） */
  aliases?: string[];
  /** 排序权重，升序；缺省 0，同权重按 schema 声明顺序 */
  order?: number;
  /** 是否在 HUD 显示（false = 只做类型声明不展示），缺省 true */
  show?: boolean;
  /**
   * 本轮未输出该 key 时，是否**结转**上一轮的值（缺省 true）
   * true  = 从后往前找最近一次出现过的非空值（好感度等累积语义）
   * false = 只认最后一条有状态的消息，没出现就是不显示
   */
  carryForward?: boolean;
}

/** 角色卡自带的状态 schema（核心差异化：竞品是全局硬编码关键词表） */
export interface StatusSchema {
  /** schema 版本（当前固定 1，为未来演进留位） */
  version: 1;
  /** 字段定义列表 */
  fields: StatusFieldDef[];
  /** 未匹配到任何 schema/内置字段的 key 如何处理，缺省 'show'（渐进增强） */
  unknownKeyPolicy?: 'show' | 'hide';
  /** 单次状态最多渲染多少字段（防模型刷屏），缺省 12 */
  maxFields?: number;
}

/** 解析出的单条状态（已面向渲染，值统一为 string） */
export interface StatusEntry {
  /** 归一化后的 key（持久化与去重用） */
  key: string;
  /** 已解析的展示名（i18n 或角色卡 label 或原始 key） */
  label: string;
  /** 展示值（**统一字符串**，渲染层只做文本插值） */
  value: string;
  /** type='number' 且解析成功时的数值（供未来图表/进度条用；本轮不渲染） */
  raw?: number;
  /** 图标名（未命中时为空 → 无图标） */
  icon?: StatusIconName;
}

/** 一条消息解析出的状态快照 */
export interface CharacterStatus {
  /** 产出该状态的消息 id（溯源/调试用） */
  messageId: string;
  /** 字段列表（已按 schema order 排序；无 schema 时按出现顺序） */
  entries: StatusEntry[];
  /** 解析方式：'json' = 状态块解析为 JSON；'lines' = 按行 key:value 降级 */
  parseMode: 'json' | 'lines';
  /** 未命中 schema/内置表、按 unknownKeyPolicy='show' 降级展示的字段数（诊断用） */
  unknownCount: number;
}

/** 内置规范字段预设（源码常量，纯 ASCII） */
export interface StatusFieldPreset {
  /** 规范 key */
  key: string;
  /** i18n key（zh/en 双语，形如 'status.field.location'） */
  i18nKey: string;
  /** 图标（icons.ts 白名单内） */
  icon: StatusIconName;
  /** 建议值类型 */
  type: StatusValueType;
}

/**
 * 内置规范字段注册表（8 项）
 *
 * 这是"不依赖中文关键词"的方案核心：源码里只有英文标识符，
 * 展示名全部走 i18n key。新增字段只需改这里 + zh.ts/en.ts 两处（见 §4.3 迁移路径）。
 */
export const STATUS_FIELD_REGISTRY: readonly StatusFieldPreset[] = [
  { key: 'location', i18nKey: 'status.field.location', icon: 'map-pin', type: 'string' },
  { key: 'time', i18nKey: 'status.field.time', icon: 'clock', type: 'string' },
  { key: 'affection', i18nKey: 'status.field.affection', icon: 'heart', type: 'number' },
  { key: 'identity', i18nKey: 'status.field.identity', icon: 'user', type: 'string' },
  { key: 'relationship', i18nKey: 'status.field.relationship', icon: 'users', type: 'string' },
  { key: 'mood', i18nKey: 'status.field.mood', icon: 'star', type: 'string' },
  { key: 'thought', i18nKey: 'status.field.thought', icon: 'chat-circle', type: 'string' },
  { key: 'inventory', i18nKey: 'status.field.inventory', icon: 'archive', type: 'string' },
] as const;

/** 全局状态栏偏好（落 AppSettings，与 P0 的 ThinkingConfig 同构） */
export interface StatusHudConfig {
  /** 是否向模型注入"输出状态块"的指令（默认 false = 不注入；解析与渲染不受此开关影响） */
  enabled: boolean;
  /** 是否在聊天区顶部显示 sticky "当前状态"条（默认 true） */
  showSticky: boolean;
  /**
   * 是否在每条 assistant 消息内显示该轮状态（默认 true）
   * 注：本轮仅实现会话级 sticky 渲染，本字段为后续消息级渲染预留的数据位，暂不接 UI。
   */
  showInline: boolean;
}

/** 默认值 */
export const DEFAULT_STATUS_HUD_CONFIG: StatusHudConfig = {
  enabled: false,
  showSticky: true,
  showInline: true,
};

/** 值最大长度（超出截断，防模型把整段正文塞进状态） */
export const STATUS_VALUE_MAX_LEN = 200;
/** 单次状态最多字段数缺省值 */
export const STATUS_MAX_FIELDS = 12;
/** 单条值超过此长度时渲染切竖排（抄竞品的响应式降级思路，阈值按 CJK 观感调） */
export const STATUS_STACK_THRESHOLD = 24;

/**
 * key 归一化：trim + 小写 + 去掉空白/下划线/连字符/冒号（含全角冒号）
 *
 * 硬约束（§4.6 ②）：不得加入任何语言特判。
 * 需要匹配非英文 key 时走角色卡 `aliases`（用户数据），永不在源码加中文词表。
 *
 * @param key 原始 key（可含空格/大小写/下划线/连字符）
 * @returns 归一化后的 key（纯小写字母数字）
 */
export function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_\-:：]+/g, '');
}

/** 判断任意值是否为合法的状态图标名 */
export function isStatusIconName(value: unknown): value is StatusIconName {
  return typeof value === 'string' && (STATUS_ICON_NAMES as readonly string[]).includes(value);
}

/** 判断任意值是否为合法的状态值类型 */
export function isStatusValueType(value: unknown): value is StatusValueType {
  return typeof value === 'string' && (STATUS_VALUE_TYPES as readonly string[]).includes(value);
}

/** 按规范 key 精确查内置预设（子串命中请用 status-parser 内部的匹配逻辑） */
export function findRegistryPreset(key: string): StatusFieldPreset | null {
  const nk = normalizeKey(key);
  return STATUS_FIELD_REGISTRY.find((p) => normalizeKey(p.key) === nk) ?? null;
}

/**
 * 归一化状态 schema（fail-open：脏数据绝不抛错）
 *
 * 逐字段校验：`key` 必须是非空字符串；`type` 必须在枚举内否则剔除；
 * `icon` 必须命中白名单否则剔除；`options`/`aliases` 只保留字符串项。
 * 全部非法时返回 undefined（调用方按"无 schema"处理 → 退化为纯嗅探模式）。
 *
 * @param raw 任意来源的 schema（角色卡 ext / 旧版顶层索引签名 / 用户输入）
 * @returns 合法 schema；无有效字段时 undefined
 */
export function normalizeStatusSchema(raw: unknown): StatusSchema | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.fields)) return undefined;

  const fields: StatusFieldDef[] = [];
  const seen = new Set<string>();
  for (const item of obj.fields) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === 'string' ? f.key.trim() : '';
    if (key === '') continue;
    const nk = normalizeKey(key);
    if (nk === '' || seen.has(nk)) continue;
    seen.add(nk);

    const def: StatusFieldDef = { key };
    if (isStatusValueType(f.type)) def.type = f.type;
    if (typeof f.label === 'string' && f.label !== '') def.label = f.label;
    if (typeof f.labelI18nKey === 'string' && f.labelI18nKey !== '') {
      def.labelI18nKey = f.labelI18nKey;
    }
    if (isStatusIconName(f.icon)) def.icon = f.icon;
    if (Array.isArray(f.options)) {
      const opts = f.options.filter((o): o is string => typeof o === 'string' && o !== '');
      if (opts.length > 0) def.options = opts;
    }
    if (typeof f.min === 'number' && Number.isFinite(f.min)) def.min = f.min;
    if (typeof f.max === 'number' && Number.isFinite(f.max)) def.max = f.max;
    if (Array.isArray(f.aliases)) {
      const aliases = f.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '');
      if (aliases.length > 0) def.aliases = aliases;
    }
    if (typeof f.order === 'number' && Number.isFinite(f.order)) def.order = f.order;
    if (typeof f.show === 'boolean') def.show = f.show;
    if (typeof f.carryForward === 'boolean') def.carryForward = f.carryForward;
    fields.push(def);
  }
  if (fields.length === 0) return undefined;

  const schema: StatusSchema = { version: 1, fields };
  if (obj.unknownKeyPolicy === 'show' || obj.unknownKeyPolicy === 'hide') {
    schema.unknownKeyPolicy = obj.unknownKeyPolicy;
  }
  if (typeof obj.maxFields === 'number' && Number.isFinite(obj.maxFields) && obj.maxFields > 0) {
    schema.maxFields = Math.floor(obj.maxFields);
  }
  return schema;
}

/**
 * 归一化全局状态栏偏好（逐字段校验，缺省走 DEFAULT_STATUS_HUD_CONFIG）
 */
export function normalizeStatusHudConfig(raw: unknown): StatusHudConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATUS_HUD_CONFIG };
  const obj = raw as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_STATUS_HUD_CONFIG.enabled,
    showSticky:
      typeof obj.showSticky === 'boolean' ? obj.showSticky : DEFAULT_STATUS_HUD_CONFIG.showSticky,
    showInline:
      typeof obj.showInline === 'boolean' ? obj.showInline : DEFAULT_STATUS_HUD_CONFIG.showInline,
  };
}
