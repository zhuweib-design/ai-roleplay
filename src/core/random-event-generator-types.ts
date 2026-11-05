/**
 * 随机事件生成 —— 共享类型与常量层 (F17.3 扩展)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。本层只有类型声明与默认值常量，**零函数**。
 *
 * 为什么单独成层：factories 层（模板/场景/配置工厂）与 runtime 层（概率计算/选择/决策）
 * 都需要 `RandomEventTemplate` / `SEVERITY_RANK` / `DEFAULT_*_WEIGHT` 这一批符号，
 * 若把类型塞进任一侧，两条依赖边就会对向生长成环。抽成中立层后依赖图是
 * `types ← factories`、`types ← runtime`，两侧互不引用。
 *
 * i18n：本层无任何用户可见文案，不需要 i18n-ignore 标记。
 */


// ====================================================================
// F17.3 扩展：事件模板管理 / 多维度参数 / 场景级配置 / 反馈机制
// ====================================================================

// ── 多维度参数：事件类别与严重度 ──

/**
 * 随机事件类别
 * - encounter：偶遇 NPC
 * - discovery：发现物品/地点
 * - combat：战斗冲突
 * - social：社交互动
 * - environment：环境变化
 * - mystery：神秘事件
 * - custom：自定义
 */
export type RandomEventCategory =
  | 'encounter'
  | 'discovery'
  | 'combat'
  | 'social'
  | 'environment'
  | 'mystery'
  | 'custom';

/**
 * 事件严重度（从轻到重）
 */
export type RandomEventSeverity = 'trivial' | 'minor' | 'moderate' | 'major' | 'critical';

/**
 * 严重度等级映射（数值越大影响越大，用于 maxSeverity 限制比较）
 */
export const SEVERITY_RANK: Record<RandomEventSeverity, number> = {
  trivial: 1,
  minor: 2,
  moderate: 3,
  major: 4,
  critical: 5,
};

// ── 事件模板 ──

/**
 * 随机事件模板 (F17.3)
 *
 * 模板用于预定义可重复使用的随机事件类型，
 * 支持多维度参数（概率/权重/类别/严重度/冷却/场景适配）。
 */
export interface RandomEventTemplate {
  /** 模板唯一 ID */
  id: string;
  /** 模板名称（显示用） */
  name: string;
  /** 模板描述（生成时的提示上下文） */
  description: string;
  /** 类别 */
  category: RandomEventCategory;
  /** 严重度 */
  severity: RandomEventSeverity;
  /** 触发概率（0-100，覆盖默认） */
  probability: number;
  /** 权重（同时多个候选时按权重选择，默认 1） */
  weight: number;
  /** 冷却时间（毫秒，0=无冷却） */
  cooldownMs: number;
  /** 适用场景名列表（空=所有场景适用） */
  applicableScenes: string[];
  /** 排除场景名列表（优先于 applicableScenes） */
  excludedScenes: string[];
  /** 触发关键词（任一匹配才允许触发，空=无关键词约束） */
  triggerKeywords: string[];
  /** 是否启用 */
  enabled: boolean;
  /** 最大触发次数（0=无限） */
  maxTriggers: number;
  /** 已触发次数 */
  triggerCount: number;
  /** 最后触发时间 ISO（null=从未触发） */
  lastTriggeredAt: string | null;
  /** 创建时间 ISO */
  createdAt: string;
  /** 更新时间 ISO */
  updatedAt: string;
}

// ── 场景级配置 ──

/**
 * 场景级随机事件配置 (F17.3)
 *
 * 每个场景可独立配置随机事件开关与参数覆盖。
 */
export interface RandomEventSceneConfig {
  /** 场景名（唯一键） */
  sceneName: string;
  /** 是否启用随机事件 */
  enabled: boolean;
  /** 该场景的覆盖概率（null=使用全局默认） */
  probabilityOverride: number | null;
  /** 允许的类别（空=全部允许） */
  allowedCategories: RandomEventCategory[];
  /** 排除的类别（优先于 allowedCategories） */
  excludedCategories: RandomEventCategory[];
  /** 该场景最大严重度（超过此严重度的模板不触发） */
  maxSeverity: RandomEventSeverity;
}

// ── 反馈机制 ──

/**
 * 事件反馈类型
 * - positive：用户喜欢此事件
 * - neutral：中立
 * - negative：用户不喜欢
 */
export type RandomEventFeedback = 'positive' | 'neutral' | 'negative';

/**
 * 事件生成结果记录 (F17.3)
 *
 * 每次生成后记录结果与反馈，用于统计与参数自适应。
 */
export interface RandomEventResult {
  /** 结果 ID */
  id: string;
  /** 关联的模板 ID（null=AI 即时生成，无模板） */
  templateId: string | null;
  /** 模板名（用于显示） */
  templateName: string;
  /** 场景名 */
  sceneName: string;
  /** 生成的事件名 */
  eventName: string;
  /** 生成的事件描述 */
  eventDescription: string;
  /** 类别 */
  category: RandomEventCategory;
  /** 严重度 */
  severity: RandomEventSeverity;
  /** 实际使用的概率（0-100） */
  effectiveProbability: number;
  /** 生成时间 ISO */
  generatedAt: string;
  /** 用户反馈（默认 neutral） */
  feedback: RandomEventFeedback;
  /** 备注（可选） */
  note?: string;
}

// ── 生成器全局配置 ──

/**
 * 随机事件生成器全局配置 (F17.3)
 */
export interface RandomEventGeneratorConfig {
  /** 全局默认概率（0-100） */
  defaultProbability: number;
  /** 每轮最大生成数（避免一次生成太多事件） */
  maxPerTurn: number;
  /** 全局冷却时间（毫秒，两次生成之间的最小间隔） */
  globalCooldownMs: number;
  /** 上次生成时间 ISO（null=从未生成） */
  lastGeneratedAt: string | null;
  /** 是否启用全局随机事件 */
  enabled: boolean;
  /** 反馈对概率的调整幅度（百分比，默认 5） */
  feedbackAdjustStep: number;
  /**
   * 需求8：关联的世界书 ID（null 表示未关联）
   * 关联后，随机事件生成将基于该世界书的内容（场景、世界观、条目）
   * 进行逻辑联动，生成与世界观一致的事件。
   */
  boundWorldBookId?: string | null;
}

// ── 统计 ──

/**
 * 随机事件统计 (F17.3)
 */
export interface RandomEventStats {
  /** 总生成次数 */
  totalGenerated: number;
  /** 按类别统计 */
  byCategory: Record<RandomEventCategory, number>;
  /** 按严重度统计 */
  bySeverity: Record<RandomEventSeverity, number>;
  /** 按反馈统计 */
  byFeedback: Record<RandomEventFeedback, number>;
  /** 平均有效概率 */
  averageProbability: number;
}

// ── 常量 ──

/** 默认权重 */
export const DEFAULT_TEMPLATE_WEIGHT = 1;

/** 默认冷却时间（10 分钟） */
export const DEFAULT_TEMPLATE_COOLDOWN_MS = 10 * 60 * 1000;

/** 默认反馈调整幅度（5%） */
export const DEFAULT_FEEDBACK_ADJUST_STEP = 5;

/** 反馈调整上下限 */
export const FEEDBACK_ADJUST_MIN = 1;
export const FEEDBACK_ADJUST_MAX = 100;