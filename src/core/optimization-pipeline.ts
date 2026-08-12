/**
 * 嵌入优化管线编排 (E-04)
 *
 * 依据《AI酒馆项目嵌入优化方案开发文档.md》灰度路径设计:
 * 基线(无优化) → L0 全量 → L2 5% → L1 1% 长会话 → 逐步放开。
 *
 * 本模块提供:
 * - OptimizationConfig:三层开关 + 灰度阶段(stage),默认全关(三级强控)
 * - PipelineStats:压缩次数/节省字符/失败回退数/暂停状态统计
 * - runL1Compress:豁免检查 → 提取式压缩 → 语义校验 → 通过/回退/连续失败暂停
 * - 不侵入 chat-manager 主链路(挂载点由调用方在灰度配置中启用)
 *
 * 设计:纯逻辑 + 内存统计;默认关闭,启用不改变行为外的任何输出。
 */

import {
  extractiveCompress,
  validateCompression,
  decideCompression,
  isExempt,
  type PipelineContext,
} from './compression';

/** 灰度阶段 */
export type OptimizationStage = 'off' | 'l0' | 'l0-l2' | 'all';

/** 管线配置(默认全关) */
export interface OptimizationConfig {
  /** 总开关(三级强控,默认 false) */
  enabled: boolean;
  /** L0 前缀组装(独立于压缩) */
  l0Enabled: boolean;
  /** L2 输出纪律 */
  l2Enabled: boolean;
  /** L1 压缩 */
  l1Enabled: boolean;
  /** 灰度阶段(用于日志/审计展示) */
  stage: OptimizationStage;
}

/** 默认配置:全关 */
export function createDefaultConfig(): OptimizationConfig {
  return { enabled: false, l0Enabled: false, l2Enabled: false, l1Enabled: false, stage: 'off' };
}

// ── 配置持久化(E-04 二期,独立于 AppSettings 持久化链) ──

const CONFIG_STORAGE_KEY = 'ai-roleplay:optimization-config';

/** 从 localStorage 读取配置(损坏/缺失回退默认全关) */
export function loadOptimizationConfig(): OptimizationConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return createDefaultConfig();
    const parsed = JSON.parse(raw) as Partial<OptimizationConfig>;
    const def = createDefaultConfig();
    return {
      enabled: parsed.enabled === true,
      l0Enabled: parsed.l0Enabled === true,
      l1Enabled: parsed.l1Enabled === true,
      l2Enabled: parsed.l2Enabled === true,
      stage: ['off', 'l0', 'l0-l2', 'all'].includes(parsed.stage as string)
        ? (parsed.stage as OptimizationStage)
        : def.stage,
    };
  } catch {
    return createDefaultConfig();
  }
}

/** 持久化配置 */
export function saveOptimizationConfig(config: OptimizationConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* 存储不可用时忽略 */
  }
}

/** 管线统计 */
export interface PipelineStats {
  /** L1 压缩成功次数 */
  compressCount: number;
  /** 因校验失败回退原文次数 */
  fallbackCount: number;
  /** 连续失败进入暂停状态次数 */
  pauseCount: number;
  /** 累计节省字符(原长 - 压缩后长) */
  savedChars: number;
  /** 是否处于暂停状态 */
  paused: boolean;
  /** 豁免跳过次数 */
  exemptCount: number;
}

/** L1 压缩输入 */
export interface L1Input {
  /** 待压缩历史文本 */
  text: string;
  /** 上下文(相关性打分) */
  context?: string;
  /** 设定实体(显著性 + 校验) */
  entities?: string[];
  /** 关键实体(必须全保留) */
  criticalEntities?: string[];
  /** 情绪词 */
  emotionWords?: string[];
  /** 豁免黑名单(standing 等) */
  exemptTexts?: string[];
  /** 目标压缩比 */
  targetRatio?: number;
}

/** L1 压缩结果 */
export interface L1Result {
  /** 最终文本(压缩或回退原文) */
  text: string;
  /** 是否实际压缩 */
  compressed: boolean;
  /** 校验结果(压缩时) */
  validation?: { entityRate: number; emotionRate: number; missingCritical: string[] };
  /** 失败原因(回退时) */
  fallbackReason?: 'validation' | 'exempt' | 'paused';
}

/**
 * 嵌入优化管线
 */
export class OptimizationPipeline {
  readonly stats: PipelineStats = {
    compressCount: 0,
    fallbackCount: 0,
    pauseCount: 0,
    savedChars: 0,
    paused: false,
    exemptCount: 0,
  };

  private consecutiveFailures = 0;

  constructor(private readonly config: OptimizationConfig) {}

  /** 是否启用 L1 压缩(总开关 × 阶段开关) */
  get l1Enabled(): boolean {
    return this.config.enabled && this.config.l1Enabled;
  }

  /**
   * 执行 L1 压缩(fail-open 三级回退):
   * 1. 豁免黑名单 → 跳过
   * 2. 暂停状态 → 跳过(连续失败 ≥3 触发)
   * 3. 提取式压缩 → 语义校验
   * 4. 校验通过 → 采用 + 统计;失败 → 回退原文,连续失败计数,≥3 暂停
   */
  runL1(input: L1Input): L1Result {
    if (!this.l1Enabled) {
      return { text: input.text, compressed: false };
    }

    // 1. 豁免
    if (input.exemptTexts && input.exemptTexts.length > 0 && isExempt(input.text, input.exemptTexts)) {
      this.stats.exemptCount++;
      return { text: input.text, compressed: false, fallbackReason: 'exempt' };
    }

    // 2. 暂停
    if (this.stats.paused) {
      return { text: input.text, compressed: false, fallbackReason: 'paused' };
    }

    // 3. 压缩 + 校验
    const result = extractiveCompress(input.text, {
      targetRatio: input.targetRatio ?? 0.6,
      entities: input.entities,
      criticalEntities: input.criticalEntities,
      context: input.context,
    });

    const validation = validateCompression({
      original: input.text,
      compressed: result.text,
      entities: input.entities,
      criticalEntities: input.criticalEntities,
      emotionWords: input.emotionWords,
    });

    // 4. 决策
    if (!validation.pass) {
      this.stats.fallbackCount++;
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        this.stats.paused = true;
        this.stats.pauseCount++;
      }
      return {
        text: input.text,
        compressed: false,
        fallbackReason: 'validation',
        validation: { entityRate: validation.entityRate, emotionRate: validation.emotionRate, missingCritical: validation.missingCritical },
      };
    }

    this.consecutiveFailures = 0;
    this.stats.compressCount++;
    this.stats.savedChars += Math.max(0, input.text.length - result.text.length);
    return {
      text: result.text,
      compressed: true,
      validation: { entityRate: validation.entityRate, emotionRate: validation.emotionRate, missingCritical: [] },
    };
  }

  /** 压缩触发决策(委托 decideCompression;pause 状态由管线维护) */
  decide(ctx: Omit<PipelineContext, 'consecutiveFailures'>): ReturnType<typeof decideCompression> {
    return decideCompression(
      { ...ctx, consecutiveFailures: this.stats.paused ? 3 : this.consecutiveFailures },
      this.l1Enabled
    );
  }

  /** 手动解除暂停(配置变更或人工干预) */
  resume(): void {
    this.stats.paused = false;
    this.consecutiveFailures = 0;
  }

  /** 重置统计 */
  resetStats(): void {
    this.stats.compressCount = 0;
    this.stats.fallbackCount = 0;
    this.stats.pauseCount = 0;
    this.stats.savedChars = 0;
    this.stats.paused = false;
    this.stats.exemptCount = 0;
    this.consecutiveFailures = 0;
  }
}

// ── 消息列表压缩挂载助手(E-04 二期) ──

/** 参与压缩的最小消息长度(字符) */
export const MIN_COMPRESS_LENGTH = 200;

/** 消息形状(与 ApiMessage/BuiltMessage 兼容的最小结构) */
export interface CompressibleMessage {
  role: string;
  content: string;
}

export interface MessageCompressOutcome {
  messages: CompressibleMessage[];
  /** 实际被压缩的消息数 */
  compressedCount: number;
}

/**
 * 对历史消息列表应用 L1 压缩(挂载点:buildPrompt 之后、发送之前):
 * - system 消息(角色设定)与当前轮 user 消息不压缩(豁免)
 * - 长度 < MIN_COMPRESS_LENGTH 的消息不压缩
 * - 压缩失败(fail-open)自动回退原文,不影响主链路
 */
export function compressMessages(
  messages: CompressibleMessage[],
  pipeline: OptimizationPipeline,
  options: { entities?: string[]; exemptTexts?: string[] } = {}
): MessageCompressOutcome {
  if (!pipeline.l1Enabled) {
    return { messages, compressedCount: 0 };
  }

  let compressedCount = 0;
  const out = messages.map((m, idx) => {
    // system 与最后一条(当前轮 user)豁免
    if (m.role === 'system' || idx === messages.length - 1) return m;
    if (m.content.length < MIN_COMPRESS_LENGTH) return m;

    const r = pipeline.runL1({
      text: m.content,
      entities: options.entities,
      exemptTexts: options.exemptTexts,
    });
    if (r.compressed) compressedCount++;
    return r.compressed ? { role: m.role, content: r.text } : m;
  });

  return { messages: out, compressedCount };
}
