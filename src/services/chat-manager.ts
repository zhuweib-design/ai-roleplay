import type { ApiClient } from '@api/api-client';
import type { ApiMessage, ChatRequest, ToolCall, ToolDefinition, ChatUsage } from '@api/types';
import { ApiError } from '@api/types';
import { buildPrompt, type PromptContexts, type PromptSettings } from '@core/prompt-builder';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import { compressMessages, type OptimizationPipeline } from '@core/optimization-pipeline';

/**
 * ChatManager 配置
 *
 * 由调用方（chat store）根据当前角色与 API Profile 组装后注入。
 * 支持运行时通过 updateConfig() 切换 API Client / 模型 / 参数。
 */
export interface ChatManagerConfig {
  /** API 客户端实例（OpenAI / Anthropic / Custom） */
  apiClient: ApiClient;
  /** 模型名，如 'gpt-4o' / 'claude-3-5-sonnet-20241022' */
  model: string;
  /** 用户名（用于宏替换 {{user}}） */
  userName?: string;
  /** 系统提示词前缀（可空，角色定义会拼接到其后） */
  systemPrompt?: string;
  /** 上下文窗口 Token 上限，默认 8192 */
  maxContextTokens?: number;
  /** 为回复预留的 Token 数，默认 1024 */
  reservedTokens?: number;
  /** 默认采样温度 */
  temperature?: number;
  /** 默认单次回复最大 Tokens */
  maxTokens?: number;
  /** T-02：可用工具定义列表（模型可在回复中发起工具调用） */
  tools?: ToolDefinition[];
  /** T-02：工具执行器（执行模型发起的工具调用，返回结果文本） */
  executeTool?: (call: ToolCall) => Promise<string>;
  /** E-04 二期：嵌入优化管线（默认关闭；启用后对长历史消息做 L1 压缩，fail-open） */
  optimization?: OptimizationPipeline;
}

export interface SendMessageParams {
  /** 角色卡 */
  card: CharacterCard;
  /** 历史消息（核心类型 ChatMessage[]） */
  history: ChatMessage[];
  /** 用户输入文本 */
  userMessage: string;
  /** 覆盖默认配置（model/temperature/maxTokens/userName） */
  overrides?: Partial<Pick<ChatManagerConfig, 'model' | 'temperature' | 'maxTokens' | 'userName'>>;
  /** 迭代33：可选注入上下文（Lorebook / RAG / 事件 / 主角 / 故事时间），收拢为单一对象 */
  contexts?: PromptContexts;
}

/**
 * 流式回调集合
 * 任一回调可选；返回值被忽略
 */
export interface ChatManagerCallbacks {
  /** 每收到一个 delta token 触发，fullContent 为累计内容 */
  onDelta?: (delta: string, fullContent: string) => void;
  /** 生成完成 */
  onDone?: (fullContent: string, finishReason?: string) => void;
  /** 收到用量统计(含前缀缓存拆解时可用;每轮 done 触发) */
  onUsage?: (usage: ChatUsage) => void;
  /** 发生错误（含用户中止） */
  onError?: (error: Error) => void;
  /** prompt 构建完成后触发，可用于 UI 显示 Token 计数与裁剪状态 */
  onPromptBuilt?: (info: { tokenCount: number; trimmed: boolean; messageCount: number }) => void;
}

/**
 * ChatManager 对话生命周期管理 (F03 + F02 编排层)
 *
 * 职责：
 * 1. 调用 prompt-builder 构建 messages
 * 2. 调用 ApiClient 流式发送
 * 3. 通过回调通知 UI 增量、完成、错误
 * 4. 通过 AbortController 支持 stop() 中止
 * 5. 单实例串行：同一时刻只允许一个生成任务
 *
 * 不负责：
 * - UI 状态管理（由 store 处理）
 * - 持久化（由 store 调用 StorageAdapter）
 * - 类型适配（调用方需先将 UI 类型转为核心类型）
 */
export class ChatManager {
  private config: ChatManagerConfig;
  private abortController: AbortController | null = null;
  private _isGenerating = false;

  constructor(config: ChatManagerConfig) {
    this.config = config;
  }

  /** 当前是否在生成 */
  get isGenerating(): boolean {
    return this._isGenerating;
  }

  /** 当前配置（只读视图） */
  get currentConfig(): Readonly<ChatManagerConfig> {
    return this.config;
  }

  /**
   * 发送消息并流式接收回复
   * @returns 完整回复内容（出错时返回已收到的部分内容或空字符串）
   */
  async sendMessage(
    params: SendMessageParams,
    callbacks?: ChatManagerCallbacks
  ): Promise<string> {
    if (this._isGenerating) {
      throw new Error('已有生成任务进行中，请先调用 stop() 中止');
    }

    const merged = { ...this.config, ...params.overrides };
    const promptSettings: PromptSettings = {
      systemPrompt: merged.systemPrompt ?? '',
      maxContextTokens: merged.maxContextTokens ?? 8192,
      reservedTokens: merged.reservedTokens ?? 1024,
      userName: merged.userName ?? 'User',
    };

    // 1. 构建 prompt（含 token 裁剪，W6 集成 Lorebook 扫描与注入 F06.2-F06.3，F09.2 集成 RAG 注入，F17.2 集成激活事件注入，F16.3 主角身份注入，F16.4 故事时间注入）
    const built = buildPrompt(
      params.card,
      params.history,
      params.userMessage,
      promptSettings,
      params.contexts
    );

    callbacks?.onPromptBuilt?.({
      tokenCount: built.tokenCount,
      trimmed: built.trimmed,
      messageCount: built.messages.length,
    });

    // E-04 二期: 嵌入优化挂载 —— 对长历史消息做 L1 压缩(默认关闭;fail-open 不影响主链路)
    if (this.config.optimization?.l1Enabled) {
      const outcome = compressMessages(built.messages, this.config.optimization);
      if (outcome.compressedCount > 0) {
        // 压缩保持 role/content 结构,BuiltMessage 兼容
        built.messages = outcome.messages as typeof built.messages;
      }
    }

    // 2. 构造 API 请求
    const request: ChatRequest = {
      messages: built.messages,
      model: merged.model,
    };
    if (merged.temperature !== undefined) request.temperature = merged.temperature;
    if (merged.maxTokens !== undefined) request.maxTokens = merged.maxTokens;
    // T-02：装配工具定义
    if (merged.tools && merged.tools.length > 0) {
      request.tools = merged.tools;
    }

    // 3. 创建 AbortController（支持外部 stop）
    this.abortController = new AbortController();
    request.signal = this.abortController.signal;

    this._isGenerating = true;
    let fullContent = '';

    try {
      // T-02：工具调用循环 —— 模型发起 tool_calls 时执行工具并回填，
      // 最多 MAX_TOOL_ROUNDS 轮（防死循环），每轮结束后重发请求续答
      const MAX_TOOL_ROUNDS = 8;
      let toolRound = 0;
      // T-02：messages 在工具循环中追加 assistant(tool_calls)/tool 消息,
      // 类型放宽为 ApiMessage(初始值即 BuiltMessage,结构兼容)
      let messages: ApiMessage[] = [...built.messages];

      while (true) {
        request.messages = messages;
        const stream = this.config.apiClient.chatStream(request);
        let roundContent = '';
        let hasDone = false;
        let toolCalls: ToolCall[] | undefined;
        let finishReason: string | undefined;

        for await (const ev of stream) {
          if (ev.type === 'delta' && ev.delta) {
            roundContent += ev.delta;
            fullContent += ev.delta;
            callbacks?.onDelta?.(ev.delta, fullContent);
          } else if (ev.type === 'done') {
            hasDone = true;
            if (ev.fullContent) roundContent = ev.fullContent;
            finishReason = ev.finishReason;
            toolCalls = ev.toolCalls;

            // 工具轮：跳出流循环执行工具（stream 已 yield done，通常紧随 [DONE] 结束；
            // 若流未结束，break 关闭 generator 时其挂起在 yield 点，可安全回收）
            if (
              toolCalls &&
              toolCalls.length > 0 &&
              merged.executeTool &&
              toolRound < MAX_TOOL_ROUNDS
            ) {
              break;
            }

            // 最终回复：优先用 done 事件的完整内容
            if (ev.fullContent) fullContent = ev.fullContent;
            // 用量统计透传(缓存命中率统计用)
            if (ev.usage) callbacks?.onUsage?.(ev.usage);
            callbacks?.onDone?.(fullContent, ev.finishReason);
            return fullContent;
          } else if (ev.type === 'error') {
            const err = new Error(ev.error || '生成失败');
            callbacks?.onError?.(err);
            return fullContent; // 返回已收到的部分内容
          }
        }

        // 流自然结束未触发 done 事件
        if (!hasDone) {
          callbacks?.onDone?.(fullContent);
          return fullContent;
        }

        // 工具调用：执行并回填，续答
        if (
          toolCalls &&
          toolCalls.length > 0 &&
          merged.executeTool &&
          toolRound < MAX_TOOL_ROUNDS
        ) {
          const assistantMsg: ApiMessage = {
            role: 'assistant',
            content: roundContent,
            toolCalls,
          };
          const toolMsgs: ApiMessage[] = [];
          for (const tc of toolCalls) {
            let result: string;
            try {
              result = await merged.executeTool(tc);
            } catch (err) {
              result = `工具执行失败:${err instanceof Error ? err.message : String(err)}`;
            }
            toolMsgs.push({ role: 'tool', content: result, toolCallId: tc.id });
          }
          messages = [...messages, assistantMsg, ...toolMsgs];
          toolRound++;
          continue;
        }

        // 工具轮数超限：结束循环，返回最后内容
        callbacks?.onDone?.(fullContent, finishReason);
        return fullContent;
      }
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error(String(err));
      callbacks?.onError?.(error);
      return fullContent;
    } finally {
      this._isGenerating = false;
      this.abortController = null;
    }
  }

  /**
   * 中止当前生成
   * 已收到的部分内容会通过 onDone/onError 返回
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * 更新配置（运行时切换 API Client / Model / 参数）
   * 若有进行中的生成任务，需先 stop()
   */
  updateConfig(patch: Partial<ChatManagerConfig>): void {
    if (this._isGenerating) {
      throw new Error('生成进行中，无法更新配置；请先 stop()');
    }
    this.config = { ...this.config, ...patch };
  }
}

/**
 * 错误分类辅助
 * 区分用户中止 / API 错误 / 网络错误，便于 UI 展示不同提示
 *
 * 优先使用 ApiError.kind 字段（更精确），
 * 兜底使用消息匹配（兼容旧错误或第三方抛出的 Error）
 */
export function classifyChatError(err: Error): 'aborted' | 'api' | 'network' | 'unknown' {
  if (err.name === 'AbortError' || /已停止生成|aborted/i.test(err.message)) {
    return 'aborted';
  }
  if (err instanceof ApiError) {
    // 基于 kind 字段精确分类
    switch (err.kind) {
      case 'aborted':
        return 'aborted';
      case 'cors':
      case 'network':
      case 'invalid-url':
      case 'rate-limit':
        return 'network';
      case 'auth':
      case 'server':
        return 'api';
      case 'unknown':
      default:
        // 含 statusCode 视为 API 错误
        return err.statusCode ? 'api' : 'unknown';
    }
  }
  if (/network|fetch|网络/i.test(err.message)) return 'network';
  return 'unknown';
}
