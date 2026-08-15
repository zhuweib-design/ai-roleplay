/**
 * 自动摘要 (F12.4, v1.1 新增)
 *
 * 业务逻辑：
 * - 当对话历史超过指定长度时，自动调用 LLM 生成前文摘要
 * - 摘要注入提示词替代早期对话历史，释放 Token 空间
 * - 摘要触发阈值可配置（默认 4000 Token）
 * - 摘要使用当前 API 连接发送请求
 * - 摘要生成失败时回退到正常对话
 *
 * 规则约束：
 * - 仅对 assistant/user 消息生成摘要（忽略 system）
 * - 摘要保留最近 N 条消息（keepRecent），早期消息压缩为摘要
 * - 摘要存储到 chat 元数据，避免重复生成
 */

import type { ChatMessage } from './token-counter';
import { countTokens } from './token-counter';
import { t } from '@/i18n';

// ── 摘要配置 ──

/** 自动摘要配置 */
export interface SummarizationConfig {
  /** 是否启用自动摘要 */
  enabled: boolean;
  /** 触发阈值（Token 数），默认 4000 */
  threshold: number;
  /** 保留最近消息数（不参与摘要），默认 10 */
  keepRecent: number;
  /** 摘要最大 Token 数，默认 500 */
  maxSummaryTokens: number;
  /** 摘要生成温度，默认 0.3（更稳定） */
  temperature: number;
}

export const DEFAULT_SUMMARIZATION_CONFIG: SummarizationConfig = {
  enabled: true,
  threshold: 4000,
  keepRecent: 10,
  maxSummaryTokens: 500,
  temperature: 0.3,
};

// ── 摘要结果 ──

/** 对话摘要（存储到 chat 元数据） */
export interface ConversationSummary {
  /** 摘要内容 */
  content: string;
  /** 摘要覆盖到的最后一条消息 id（或时间戳/索引） */
  lastCoveredMessageIndex: number;
  /** 摘要覆盖的消息数 */
  coveredMessageCount: number;
  /** 摘要生成时间戳 */
  createdAt: number;
  /** 摘要消耗的 Token 数（估算） */
  tokenCount: number;
}

// ── 摘要错误 ──

export class SummarizationError extends Error {
  constructor(
    message: string,
    public code:
      | 'NOT_ENABLED'
      | 'BELOW_THRESHOLD'
      | 'API_ERROR'
      | 'PARSE_ERROR'
      | 'INSUFFICIENT_MESSAGES'
  ) {
    super(message);
    this.name = 'SummarizationError';
  }
}

// ── Token 估算 ──

/**
 * 估算消息列表的 Token 数
 *
 * @param messages 消息列表
 * @returns Token 数估算值
 */
export async function estimateMessagesTokens(messages: ChatMessage[]): Promise<number> {
  let total = 0;
  for (const msg of messages) {
    total += await countTokens(msg.content);
    // role 标记开销（约 1 Token）
    total += 1;
  }
  // 对话整体开销
  total += 3;
  return total;
}

// ── 摘要触发判断 ──

/**
 * 判断是否需要触发摘要
 *
 * @param messages 当前消息列表
 * @param config 摘要配置
 * @param existingSummary 现有摘要（若有）
 * @returns 是否应触发摘要
 */
export async function shouldSummarize(
  messages: ChatMessage[],
  config: SummarizationConfig,
  existingSummary: ConversationSummary | null
): Promise<boolean> {
  if (!config.enabled) return false;

  // 仅计算 user/assistant 消息
  const dialogMessages = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );
  if (dialogMessages.length < config.keepRecent * 2) return false;

  // 计算未被摘要覆盖的消息 Token
  const startIndex = existingSummary
    ? existingSummary.lastCoveredMessageIndex + 1
    : 0;
  const uncoveredMessages = dialogMessages.slice(startIndex);
  const tokens = await estimateMessagesTokens(uncoveredMessages);

  return tokens >= config.threshold;
}

// ── Prompt 构建 ──

/**
 * 构建摘要生成 Prompt
 *
 * @param messages 待摘要的消息列表
 * @param existingSummary 现有摘要（增量更新时传入）
 * @param config 摘要配置
 * @returns 发送给 LLM 的消息列表
 */
export function buildSummarizationMessages(
  messages: ChatMessage[],
  existingSummary: ConversationSummary | null,
  config: SummarizationConfig
): Array<{ role: 'system' | 'user'; content: string }> {
  // i18n-ignore-start
  // 构建对话文本
  const dialogText = messages
    .map((m) => {
      const role = m.role === 'user' ? '用户' : 'AI';
      return `${role}：${m.content}`;
    })
    .join('\n\n');

  const systemContent =
    '你是一个对话摘要助手。请将对话历史压缩为简洁的摘要，保留关键事件、人物关系、重要决策和未解决的悬念。摘要应保持客观中立，便于后续对话引用。';
  // i18n-ignore-end

  let userContent: string;
  if (existingSummary) {
    // i18n-ignore-start
    userContent = `已有摘要：
${existingSummary.content}

请基于已有摘要和新对话内容，生成更新后的摘要。摘要应控制在 ${config.maxSummaryTokens} Token 以内。

新对话内容：
${dialogText}

请直接输出更新后的摘要内容，不要添加任何前缀或解释。`;
  } else {
    userContent = `请将以下对话压缩为摘要，保留关键事件、人物关系、重要决策和未解决的悬念。摘要应控制在 ${config.maxSummaryTokens} Token 以内。

对话内容：
${dialogText}

请直接输出摘要内容，不要添加任何前缀或解释。`;
    // i18n-ignore-end
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ── 摘要服务 ──

/**
 * 摘要服务接口
 */
export interface SummarizationService {
  /**
   * 生成或更新摘要
   *
   * @param messages 完整消息列表
   * @param config 摘要配置
   * @param existingSummary 现有摘要（增量更新时传入）
   * @returns 新摘要
   */
  summarize(
    messages: ChatMessage[],
    config: SummarizationConfig,
    existingSummary: ConversationSummary | null
  ): Promise<ConversationSummary>;
}

// ── 默认实现（使用 ApiClient） ──

import type { ApiClient } from '../api/api-client';
import type { ChatRequest } from '../api/types';

/**
 * 基于 ApiClient 的摘要服务实现
 */
export class DefaultSummarizationService implements SummarizationService {
  constructor(
    private apiClient: ApiClient,
    private model: string
  ) {}

  async summarize(
    messages: ChatMessage[],
    config: SummarizationConfig,
    existingSummary: ConversationSummary | null
  ): Promise<ConversationSummary> {
    if (!config.enabled) {
      throw new SummarizationError(t('sum.notEnabled'), 'NOT_ENABLED');
    }

    // 仅摘要 user/assistant 消息
    const dialogMessages = messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );

    // 计算待摘要的消息范围
    const startIndex = existingSummary
      ? existingSummary.lastCoveredMessageIndex + 1
      : 0;
    const keepFromIndex = Math.max(
      startIndex,
      dialogMessages.length - config.keepRecent
    );
    const messagesToSummarize = dialogMessages.slice(startIndex, keepFromIndex);

    if (messagesToSummarize.length === 0) {
      throw new SummarizationError(t('sum.noNewMessages'), 'INSUFFICIENT_MESSAGES');
    }

    // 构建 Prompt
    const promptMessages = buildSummarizationMessages(
      messagesToSummarize,
      existingSummary,
      config
    );

    // 调用 API（非流式）
    const request: ChatRequest = {
      messages: promptMessages,
      model: this.model,
      temperature: config.temperature,
      maxTokens: config.maxSummaryTokens,
    };

    let rawContent: string;
    try {
      rawContent = await this.apiClient.chat(request);
    } catch (err) {
      throw new SummarizationError(
        `摘要 API 调用失败：${err instanceof Error ? err.message : String(err)}`,
        'API_ERROR'
      );
    }

    if (!rawContent || rawContent.trim() === '') {
      throw new SummarizationError(t('sum.emptyContent'), 'PARSE_ERROR');
    }

    // 计算摘要覆盖范围（基于对话消息索引）
    // dialogMessages 中被摘要的最后一条消息索引 = keepFromIndex - 1
    const lastCoveredIndex = keepFromIndex - 1;
    const coveredCount = messagesToSummarize.length;

    return {
      content: rawContent.trim(),
      lastCoveredMessageIndex: lastCoveredIndex,
      coveredMessageCount:
        (existingSummary?.coveredMessageCount ?? 0) + coveredCount,
      createdAt: Date.now(),
      tokenCount: await countTokens(rawContent),
    };
  }
}

// ── 摘要注入到 Prompt ──

/**
 * 将摘要注入消息列表
 *
 * 策略：在对话历史前插入一条 system 消息作为"前文摘要"，
 * 帮助模型理解早期对话背景。
 *
 * @param messages 原始消息列表
 * @param summary 摘要
 * @returns 注入摘要后的消息列表
 */
export function injectSummary(
  messages: ChatMessage[],
  summary: ConversationSummary
): ChatMessage[] {
  const summaryMessage: ChatMessage = {
    role: 'system',
    // i18n-ignore-start
    content: `【前文摘要】
${summary.content}

（以上为早期对话的摘要，用于补充上下文）`,
    // i18n-ignore-end
  };

  // 找到第一条非 system 消息的位置，将摘要插入其前
  const firstNonSystemIndex = messages.findIndex(
    (m) => m.role !== 'system'
  );

  if (firstNonSystemIndex === -1) {
    // 全是 system 或空列表，追加到末尾
    return [...messages, summaryMessage];
  }

  if (firstNonSystemIndex === 0) {
    // 第一条就是非 system（无 system 前缀），插入到开头
    return [summaryMessage, ...messages];
  }

  // 在第一条非 system 消息前插入摘要
  return [
    ...messages.slice(0, firstNonSystemIndex),
    summaryMessage,
    ...messages.slice(firstNonSystemIndex),
  ];
}

// ── 工厂方法 ──

/**
 * 创建摘要服务实例
 *
 * @param apiClient API 客户端
 * @param model 模型名
 * @returns 摘要服务实例
 */
export function createSummarizationService(
  apiClient: ApiClient,
  model: string
): SummarizationService {
  return new DefaultSummarizationService(apiClient, model);
}
