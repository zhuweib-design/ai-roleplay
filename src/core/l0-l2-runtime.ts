/**
 * L0/L2 运行时接线 (E-01 + E-02 集成)
 *
 * 依据《AI酒馆项目嵌入优化方案开发文档.md》:
 * - L0 上下文结构层:字节稳定前缀(standing 常驻段)→ 前缀缓存命中;
 *   会话级情绪状态机(独立于角色卡,规则标注, fail-open)
 * - L2 输出纪律层:状态性旁白精简(protect → compressMetaNarration → restore),
 *   Auto-Clarity 软回退声明追加到系统提示词
 *
 * 设计:
 * - 纯逻辑 + 显式依赖注入(store/registry/tracker 由调用方创建,便于单测与持久化接线)
 * - 全部 fail-open:任何异常不影响主回复链路(压缩/标注失败自动回退)
 * - 与 OptimizationConfig 开关联动(l0Enabled / l2Enabled,总开关 enabled)
 */

import {
  classifyScope,
  protect,
  restore,
  compressMetaNarration,
  buildAutoClarityPrompt,
  detectEmotion,
  type NarrationScope,
} from './output-discipline';
import type { MemoryStore, EmotionTracker, CharacterRegistry } from './memory-store';
import type { OptimizationPipeline } from './optimization-pipeline';
// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

// ── 类型 ──

/** 消息形状(与 BuiltMessage/ApiMessage 兼容) */
export interface OptMessage {
  role: string;
  content: string;
}

/** L2 输出纪律应用结果 */
export interface L2Outcome {
  messages: OptMessage[];
  /** 被精简的状态性旁白消息数 */
  compressedCount: number;
  /** 受保护片段总数(对白/情绪词/实体),>0 表示哨兵生效 */
  protectedCount: number;
}

/** L0 上下文组装结果 */
export interface L0Outcome {
  /** 组装后的系统提示词(前缀 + 原有 system 内容 + 情绪状态 + Auto-Clarity) */
  systemContent: string;
  /** 前缀 SHA-256(每请求对比,E-01 验收指标) */
  prefixHash: string;
  /** 是否注入情绪状态 */
  emotionInjected: boolean;
}

/** L0/L2 运行时依赖(由调用方创建并注入) */
export interface L0L2Deps {
  store: MemoryStore;
  registry: CharacterRegistry;
  tracker: EmotionTracker;
}

// ── 常量 ──

/** 情绪状态注入的固定标签(避免用户文本干扰前缀稳定) */
const EMOTION_STATE_HEADER = '[当前情绪状态]';

/** 注入到 system 的情绪状态段最大长度(防御异常大文本) */
const MAX_EMOTION_REASON_LEN = 200;

// ── L2:输出纪律 ──

/**
 * 对历史消息应用 L2 输出纪律:
 * - system 消息与当前轮 user 消息不精简(豁免)
 * - 仅 assistant 消息中的状态性旁白(meta_narration)被精简
 * - protect → compressMetaNarration → restore 保证对白/情绪/实体零损失
 * - 任何异常 fail-open 回退原文
 */
export function applyOutputDiscipline(
  messages: OptMessage[],
  pipeline: Pick<OptimizationPipeline, 'enabled' | 'l2Enabled'>
): L2Outcome {
  const outcome: L2Outcome = { messages, compressedCount: 0, protectedCount: 0 };
  if (!pipeline.enabled || !pipeline.l2Enabled) return outcome;

  try {
    const out = messages.map((m, idx) => {
      // system 与当前轮 user(最后一条)豁免
      if (m.role === 'system' || idx === messages.length - 1) return m;
      if (m.role !== 'assistant') return m;
      if (m.content.length < 4) return m;

      const scope: NarrationScope = classifyScope(m.content);
      // 仅状态性旁白可精简;对白/情绪旁白/其他硬豁免
      if (scope !== 'meta_narration') return m;

      const protectedText = protect(m.content);
      const compressed = compressMetaNarration(protectedText.text);
      // 压缩后无实质变化则放弃(避免无谓的哨兵还原)
      if (compressed === protectedText.text) return m;
      const restored = restore(compressed, protectedText.segments);

      outcome.compressedCount++;
      outcome.protectedCount += protectedText.segments.length;
      return { role: m.role, content: restored };
    });

    outcome.messages = out;
  } catch {
    /* fail-open:任何异常回退原文 */
    outcome.messages = messages;
  }
  return outcome;
}

// ── L0:上下文结构 ──

/**
 * 组装 L0 上下文:
 * 1. 前缀:registry.assemblePrefix(base) —— standing 常驻段字节稳定
 * 2. 情绪状态:tracker.current(sessionId) 注入到 system(动态段,不进前缀)
 * 3. Auto-Clarity:l2Enabled 时追加 L2 声明到 system
 *
 * @param systemContent 原有 system 内容(prompt-builder 组装结果)
 * @param sessionId 会话 ID(情绪状态键;缺省用 base 前缀哈希兜底)
 * @param base 前缀基础段(固定系统提示词头部,字节稳定)
 */
export async function applyL0Context(
  deps: L0L2Deps,
  systemContent: string,
  pipeline: Pick<OptimizationPipeline, 'enabled' | 'l0Enabled' | 'l2Enabled'>,
  sessionId?: string
): Promise<L0Outcome> {
  const outcome: L0Outcome = {
    systemContent,
    prefixHash: '',
    emotionInjected: false,
  };
  if (!pipeline.enabled) return outcome;

  try {
    // 1. 前缀组装(仅 l0Enabled 时注入 standing 段;否则前缀仅 base 稳定)
    // sessionId 用于按会话隔离 standing 事实(多角色共享 store 时避免跨角色泄漏)
    const prefix = await deps.registry.assemblePrefix(systemContent, sessionId);
    outcome.prefixHash = prefix.hash;
    let nextSystem = prefix.text;

    // 2. 情绪状态注入(独立于 L0 开关? 否 —— 与 L0 一起启用,属 L0 情绪状态机)
    if (pipeline.l0Enabled) {
      const key = sessionId || prefix.hash;
      const state = await deps.tracker.current(key);
      if (state) {
        const reason = state.reason.slice(0, MAX_EMOTION_REASON_LEN);
        nextSystem += `\n\n${EMOTION_STATE_HEADER}\n${state.label}${reason ? `（${reason}）` : ''}`;
        outcome.emotionInjected = true;
      }
    }

    // 3. Auto-Clarity(L2 软回退声明)
    if (pipeline.l2Enabled) {
      nextSystem += `\n\n${buildAutoClarityPrompt()}`;
    }

    outcome.systemContent = nextSystem;
  } catch {
    /* fail-open:前缀/情绪组装失败回退原 system */
    outcome.systemContent = systemContent;
  }
  return outcome;
}

/**
 * 更新会话情绪状态(规则标注 + fail-open)
 * 在每轮 AI 回复完成后调用:detectEmotion 扫描回复文本,
 * 命中则写入 tracker;失败静默(不影响主链路)。
 *
 * @returns 是否成功更新
 */
export async function updateEmotionState(
  deps: L0L2Deps,
  sessionId: string,
  assistantReply: string,
  fallbackKey?: string
): Promise<boolean> {
  try {
    const label = detectEmotion(assistantReply);
    if (!label) return false;
    const key = sessionId || fallbackKey || 'default-session';
    return await deps.tracker.update(key, label, assistantReply.slice(0, MAX_EMOTION_REASON_LEN));
  } catch {
    return false;
  }
}
// i18n-ignore-end
