/**
 * 故事引擎类型定义 (F16.1, v1.1 新增)
 *
 * 定义小说结构化分析的输入、输出与持久化类型。
 * 分析结果按类别组织：世界、场景、人物、事件、脚本。
 *
 * 规则约束：
 * - 分析结果以 JSON 存储到本地 stories/ 目录
 * - 三种分析深度：快速（人物+世界）/标准（+场景+事件）/深度（+脚本）
 * - 文本分块后逐块分析，最终合并为统一结果
 */

// ── 分析配置 ──

/** 分析深度 */
export type AnalysisDepth = 'quick' | 'standard' | 'deep';

/** 分析状态 */
export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

/** 文本分块策略 */
export type ChunkStrategy = 'chapter' | 'paragraph' | 'fixed';

/** 分析深度元数据 */
export interface AnalysisDepthMeta {
  id: AnalysisDepth;
  label: string;
  description: string;
  /** 预估 Token 消耗范围 */
  tokenEstimate: { min: number; max: number };
  /** 是否提取场景 */
  extractScenes: boolean;
  /** 是否提取事件 */
  extractEvents: boolean;
  /** 是否生成故事脚本 */
  extractScript: boolean;
}

/**
 * 三种分析深度配置
 */
export const ANALYSIS_DEPTHS: readonly AnalysisDepthMeta[] = [
  {
    id: 'quick',
    label: '快速',
    description: '仅提取人物和世界设定，适合快速了解故事概况',
    tokenEstimate: { min: 2000, max: 5000 },
    extractScenes: false,
    extractEvents: false,
    extractScript: false,
  },
  {
    id: 'standard',
    label: '标准',
    description: '提取人物、世界、场景和事件，适合导入角色扮演',
    tokenEstimate: { min: 5000, max: 12000 },
    extractScenes: true,
    extractEvents: true,
    extractScript: false,
  },
  {
    id: 'deep',
    label: '深度',
    description: '全部提取并生成故事脚本，适合完整故事引擎体验',
    tokenEstimate: { min: 10000, max: 20000 },
    extractScenes: true,
    extractEvents: true,
    extractScript: true,
  },
];

/** 获取分析深度元数据 */
export function getDepthMeta(id: AnalysisDepth): AnalysisDepthMeta | undefined {
  return ANALYSIS_DEPTHS.find((d) => d.id === id);
}

// ── 分析结果类型 ──

/** 从小说中提取的人物 */
export interface StoryCharacter {
  /** 人物名 */
  name: string;
  /** 别名/曾用名 */
  aliases?: string[];
  /** 角色描述（外貌、性格、背景） */
  description: string;
  /** 人物关系（name → 关系描述） */
  relationships?: Array<{ target: string; relation: string }>;
  /** 出场章节/段落索引 */
  appearances?: number[];
  /** 角色属性（如小说中有属性描述） */
  attributes?: Record<string, string>;
}

/** 从小说中提取的场景/地点 */
export interface StoryScene {
  /** 场景名 */
  name: string;
  /** 场景类型（城市/野外/室内/地下等） */
  type: string;
  /** 场景描述 */
  description: string;
  /** 父场景名（用于层级结构，如"王都"→"王都市场"） */
  parent?: string;
  /** 出场章节/段落索引 */
  appearances?: number[];
}

/** 从小说中提取的事件 */
export interface StoryEvent {
  /** 事件名 */
  name: string;
  /** 事件描述 */
  description: string;
  /** 参与人物 */
  characters: string[];
  /** 发生场景 */
  scene?: string;
  /** 事件顺序索引（按故事时间线） */
  order: number;
  /** 事件类型（战斗/对话/探索/转折等） */
  type: string;
}

/** 故事脚本（深度模式生成） */
export interface StoryScript {
  /** 脚本名 */
  name: string;
  /** 脚本内容（可执行的故事大纲） */
  content: string;
  /** 脚本类型（主线/支线/背景） */
  type: 'main' | 'side' | 'background';
  /** 涉及人物 */
  characters: string[];
  /** 涉及场景 */
  scenes: string[];
}

/** 世界信息提取 */
export interface StoryWorldInfo {
  /** 世界名称 */
  name: string;
  /** 世界类型（奇幻/科幻/现代/末日/历史/其他） */
  type: string;
  /** 世界描述 */
  description: string;
  /** 核心设定/规则 */
  coreSettings?: string[];
  /** 主要势力/组织 */
  factions?: string[];
}

// ── 分析结果（完整） ──

/** 单次分块分析结果 */
export interface ChunkAnalysisResult {
  /** 分块索引 */
  chunkIndex: number;
  /** 该分块提取的人物 */
  characters: StoryCharacter[];
  /** 该分块提取的场景 */
  scenes: StoryScene[];
  /** 该分块提取的事件 */
  events: StoryEvent[];
  /** 该分块提取的世界信息 */
  worldInfo?: StoryWorldInfo;
}

/** 完整分析结果（合并后） */
export interface StoryAnalysisResult {
  /** 唯一 ID */
  id: string;
  /** 源文件名 */
  sourceFileName: string;
  /** 分析深度 */
  depth: AnalysisDepth;
  /** 分析状态 */
  status: AnalysisStatus;
  /** 创建时间戳 */
  createdAt: number;
  /** 完成时间戳 */
  completedAt?: number;
  /** 原始文本字符数 */
  textLength: number;
  /** 分块数量 */
  chunkCount: number;
  /** 提取的世界信息 */
  worldInfo?: StoryWorldInfo;
  /** 提取的人物列表 */
  characters: StoryCharacter[];
  /** 提取的场景列表 */
  scenes: StoryScene[];
  /** 提取的事件列表 */
  events: StoryEvent[];
  /** 生成的故事脚本（仅深度模式） */
  scripts: StoryScript[];
  /** 分析过程中的错误信息 */
  errors?: string[];
  /** F16.3 主角配置（用户配置后填充，null/未设置表示未配置） */
  protagonist?: ProtagonistConfig | null;
  /** F16.4 故事时间配置（默认未启用） */
  timeConfig?: import('./story-time').StoryTimeConfig | null;
  /** F16.4 故事时间运行时状态 */
  timeState?: import('./story-time').StoryTimeState | null;
  /**
   * 需求8：关联的世界书 ID（null 表示未关联）
   * - 关联后，故事引擎和随机事件可基于该世界书内容进行逻辑联动
   * - 故事分析提取的 worldInfo 与关联世界书互补：
   *   worldInfo 来自小说文本，关联世界书来自用户手动选择
   */
  boundWorldBookId?: string | null;
}

// ── 分析进度 ──

/** 分析进度信息 */
export interface AnalysisProgress {
  /** 当前已完成分块数 */
  completed: number;
  /** 总分块数 */
  total: number;
  /** 当前阶段描述 */
  stage: string;
  /** 是否正在分析 */
  isAnalyzing: boolean;
  /** 错误信息 */
  error?: string;
}

/** 初始进度 */
export const INITIAL_PROGRESS: AnalysisProgress = {
  completed: 0,
  total: 0,
  stage: '等待开始',
  isAnalyzing: false,
};

// ── 导入冲突处理策略 ──

/** 导入冲突处理策略（F16.2 使用） */
export type ImportConflictStrategy = 'add' | 'overwrite' | 'merge';

/** 导入结果 */
export interface ImportResult {
  /** 导入类型 */
  type: 'character' | 'lorebook' | 'event' | 'scene';
  /** 导入名称 */
  name: string;
  /** 导入策略 */
  strategy: ImportConflictStrategy;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

// ── 工厂函数 ──

/** 生成故事分析结果 ID */
export function generateStoryId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `story_${time}${rand}`;
}

// ── F16.3 主角身份配置 ──

/**
 * 主角身份类型
 * - 'protagonist'：用户作为故事主角（参与剧情推进）
 * - 'observer'：用户作为旁观者（以第三人称视角观察）
 */
export type ProtagonistRole = 'protagonist' | 'observer';

/**
 * 主角与原有人物的关系条目
 *
 * 规则约束：
 * - target 必须为 stories.characters 中已存在的人物名，或自定义外部角色名
 * - relation 为关系描述（如"挚友"、"宿敌"、"师徒"）
 */
export interface ProtagonistRelation {
  /** 关系目标人物名 */
  target: string;
  /** 关系描述 */
  relation: string;
}

/**
 * 主角配置（F16.3）
 *
 * 规则约束：
 * - 主角身份绑定到当前故事，不影响其他对话
 * - 主角信息通过 F07 Persona 系统管理（自动创建"故事主角"Persona）
 * - 主角信息注入对话系统提示词，AI 以主角视角互动
 * - 起始场景需从故事分析结果 scenes 中选择，或留空表示不限定
 */
export interface ProtagonistConfig {
  /** 主角身份类型 */
  role: ProtagonistRole;
  /** 主角来源：'existing' 复用故事中已有的人物 / 'custom' 用户自定义新角色 */
  source: 'existing' | 'custom';
  /**
   * 主角名
   * - source='existing'：来自 story.characters[].name
   * - source='custom'：用户自定义
   */
  name: string;
  /** 主角描述（外貌/性格/背景，自由文本） */
  description: string;
  /** 起始场景名（须为 story.scenes[].name，留空表示不限定） */
  startingScene?: string;
  /** 主角与原有人物的关系列表 */
  relations: ProtagonistRelation[];
  /** 关联 Persona ID（创建 Persona 后填充，便于跨系统引用） */
  personaId?: string | null;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 创建空分析结果（用于初始化） */
export function createEmptyResult(
  sourceFileName: string,
  depth: AnalysisDepth,
  textLength: number,
  chunkCount: number
): StoryAnalysisResult {
  return {
    id: generateStoryId(),
    sourceFileName,
    depth,
    status: 'pending',
    createdAt: Date.now(),
    textLength,
    chunkCount,
    characters: [],
    scenes: [],
    events: [],
    scripts: [],
  };
}
