import type { ApiClient } from '@api/api-client';
import type {
  ApiMessage,
  ChatRequest,
  ToolCall,
  ToolDefinition,
  ChatUsage,
  ReasoningEffort,
} from '@api/types';
import { ApiError } from '@api/types';
import { buildPrompt, type PromptContexts, type PromptSettings } from '@core/prompt-builder';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import { ThinkingSplitter, parseThinkingComplete } from '@core/thinking-parser';
import {
  createStatusSplitter,
  parseStatusComplete,
  extractStatusFence,
  stripStatusFence,
  parseStatusBlock,
} from '@core/status-parser';
import { buildStatusInstruction } from '@core/status-prompt';
import type { CharacterStatus } from '@core/status-schema';
import { compressMessages, type OptimizationPipeline } from '@core/optimization-pipeline';
import {
  shouldSummarize,
  injectSummary,
  DefaultSummarizationService,
  type SummarizationConfig,
  type ConversationSummary,
} from '@core/summarizer';
import {
  applyL0Context,
  applyOutputDiscipline,
  updateEmotionState,
  type L0L2Deps,
} from '@core/l0-l2-runtime';
import { t } from '@/i18n';

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
  /** P0-3：核采样阈值 0-1；undefined = 不传（供应商默认） */
  topP?: number;
  /** P0-3：存在惩罚 -2~2；undefined = 不传 */
  presencePenalty?: number;
  /** P0-3：频率惩罚 -2~2；undefined = 不传 */
  frequencyPenalty?: number;
  /** P0-2：思考强度（运行时由 capability 决定是否真正下发） */
  reasoningEffort?: ReasoningEffort;
  /**
   * P0-1：历史 assistant 消息中的思考是否随请求回传
   * 默认 false = 剥离（省 token）；true 时以 `<think>…</think>` 前缀回包进 content。
   * **只在内存组装时生效，不修改任何持久化数据。**
   */
  includeThinkingInHistory?: boolean;
  /** T-02：可用工具定义列表（模型可在回复中发起工具调用） */
  tools?: ToolDefinition[];
  /** T-02：工具执行器（执行模型发起的工具调用，返回结果文本） */
  executeTool?: (call: ToolCall) => Promise<string>;
  /** E-04 二期：嵌入优化管线（默认关闭；启用后对长历史消息做 L1 压缩，fail-open） */
  optimization?: OptimizationPipeline;
  /** E-01/E-02：L0/L2 运行时依赖（MemoryStore/CharacterRegistry/EmotionTracker） */
  l0l2?: L0L2Deps;
  /** E-01：会话 ID（情绪状态键；缺省用前缀哈希兜底） */
  sessionId?: string;
  /**
   * P1：是否向模型注入"要求输出状态块"的提示词指令。
   *
   * 只影响**注入**（改变模型行为）；解析与渲染**永远开启**（模型自己输出了就白捡）。
   * 由 chat store 的 applyRuntimeLlmControls() 从 settings.statusHudConfig.enabled 同步，
   * 角色级 `ext.statusInstruction === 'on' | 'off'` 在此之上覆盖（见 sendMessage 内解析）。
   */
  statusInstructionEnabled?: boolean;
  // ── 摘要接线（2026-09-21）──
  /**
   * 会话摘要配置。**不传 = 完全不触发摘要**（行为与接线前一致）。
   *
   * 传入后：流式结束时会**异步**（fire-and-forget）判断是否需要生成摘要，
   * 失败静默 —— 不阻塞、不影响主链路（天然 fail-open）。
   */
  summarizationConfig?: SummarizationConfig;
  /** 现有摘要（增量更新用；由 chat store 从当前会话读取后传入） */
  existingSummary?: ConversationSummary | null;
  /** 摘要生成完成回调（chat store 负责写回会话并持久化） */
  onSummaryGenerated?: (summary: ConversationSummary) => void;
}

export interface SendMessageParams {
  /** 角色卡 */
  card: CharacterCard;
  /** 历史消息（核心类型 ChatMessage[]） */
  history: ChatMessage[];
  /** 用户输入文本 */
  userMessage: string;
  /**
   * 覆盖默认配置（model / userName / 全部采样参数 / 思考强度）
   *
   * 注意：只传**已设置**的键 —— 未设置的键不应出现在本对象里，
   * 否则 `{...config, ...overrides}` 会用 undefined 覆盖掉 Profile 级默认值。
   */
  overrides?: Partial<
    Pick<
      ChatManagerConfig,
      | 'model'
      | 'userName'
      | 'temperature'
      | 'maxTokens'
      | 'topP'
      | 'presencePenalty'
      | 'frequencyPenalty'
      | 'reasoningEffort'
    >
  >;
  /** 迭代33：可选注入上下文（Lorebook / RAG / 事件 / 主角 / 故事时间），收拢为单一对象 */
  contexts?: PromptContexts;
}

/**
 * 流式回调集合
 * 任一回调可选；返回值被忽略
 */
export interface ChatManagerCallbacks {
  /** 每收到一个 delta token 触发，fullContent 为累计正文（已剥离思考） */
  onDelta?: (delta: string, fullContent: string) => void;
  /**
   * P0-1：每收到一段思考增量触发，fullThinking 为累计思考
   *
   * 两种来源都收敛到本回调：
   * - 字段型（`reasoning_content` / `thinking_delta`）→ 由 client 直接产出
   * - 标签型（`<think>…</think>`）→ 由编排层 ThinkingSplitter 切分后产出
   *
   * 收敛阶段（done）若最终思考与累计值不一致，会以 delta='' 再回调一次，
   * 调用方只需用 fullThinking 覆盖即可。
   */
  onThinking?: (delta: string, fullThinking: string) => void;
  /** 生成完成 */
  onDone?: (fullContent: string, finishReason?: string) => void;
  /** 收到用量统计(含前缀缓存拆解时可用;每轮 done 触发) */
  onUsage?: (usage: ChatUsage) => void;
  /** 发生错误（含用户中止） */
  onError?: (error: Error) => void;
  /** prompt 构建完成后触发，可用于 UI 显示 Token 计数与裁剪状态 */
  onPromptBuilt?: (info: { tokenCount: number; trimmed: boolean; messageCount: number }) => void;
  /** E-01：本轮生成完成后情绪状态更新回调（成功时触发，供 UI 展示） */
  onEmotionUpdated?: (label: string, sessionId: string) => void;
  /**
   * P1：本轮解析出的角色状态快照（状态块闭合后一次性回调；无状态时不回调）
   *
   * 与 onThinking 同构：调用方只需用返回值覆盖 UI 消息的 `status` 字段。
   * 未解析出任何可用字段时为 null（渲染层据此不渲染，不渲染空壳）。
   */
  onStatus?: (status: CharacterStatus | null) => void;
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
      throw new Error(t('api.chatRunning'));
    }

    const merged = { ...this.config, ...params.overrides };
    const promptSettings: PromptSettings = {
      systemPrompt: merged.systemPrompt ?? '',
      maxContextTokens: merged.maxContextTokens ?? 8192,
      reservedTokens: merged.reservedTokens ?? 1024,
      userName: merged.userName ?? 'User',
      // P0-1：默认剥离历史思考（省 token）；显式开启时才回包
      includeThinkingInHistory: merged.includeThinkingInHistory === true,
    };

    // P1：状态块指令注入（解析/渲染永远开启，只有"要求模型产出"需要授权 —— §1.4）
    // 优先级：card.ext.statusInstruction('on'|'off') > config.statusInstructionEnabled（全局）
    const statusInstruction = params.card.ext?.statusInstruction;
    const statusEnabled =
      statusInstruction === 'on'
        ? true
        : statusInstruction === 'off'
          ? false
          : merged.statusInstructionEnabled === true;
    // 提示词**必须是英文 key**（§4.6 硬约束 ①）：模型照抄中文 key 会导致匹配层全部落空
    const statusContext = buildStatusInstruction(params.card.ext?.statusSchema, statusEnabled);

    // 1. 构建 prompt（含 token 裁剪，W6 集成 Lorebook 扫描与注入 F06.2-F06.3，F09.2 集成 RAG 注入，F17.2 集成激活事件注入，F16.3 主角身份注入，F16.4 故事时间注入）
    const built = await buildPrompt(
      params.card,
      params.history,
      params.userMessage,
      promptSettings,
      // 未注入时保持与改动前完全一致的空上下文（请求体逐字节不变）
      statusContext ? { ...params.contexts, statusContext } : params.contexts
    );

    callbacks?.onPromptBuilt?.({
      tokenCount: built.tokenCount,
      trimmed: built.trimmed,
      messageCount: built.messages.length,
    });

    // E-01/E-02 二期: L0 上下文结构 + L2 输出纪律挂载(默认关闭;fail-open 不影响主链路)
    if (this.config.l0l2 && this.config.optimization) {
      const pipeline = this.config.optimization;
      // L0: 前缀稳定 + 情绪状态 + Auto-Clarity 组装进 system
      if (pipeline.l0Enabled || pipeline.l2Enabled) {
        const systemMsg = built.messages.find((m) => m.role === 'system');
        if (systemMsg) {
          const l0 = await applyL0Context(
            this.config.l0l2,
            systemMsg.content,
            pipeline,
            this.config.sessionId
          );
          systemMsg.content = l0.systemContent;
        }
      }
      // L2: 状态性旁白精简(对历史 assistant 消息)
      if (pipeline.l2Enabled) {
        const l2 = applyOutputDiscipline(
          built.messages as { role: string; content: string }[],
          pipeline
        );
        if (l2.compressedCount > 0) {
          built.messages = l2.messages as typeof built.messages;
        }
      }
    }

    // 摘要接线（2026-09-21）：把已有摘要注入上下文头部
    //
    // 位置在 L1 压缩之前 —— 摘要是 system 消息，而 compressMessages 天然跳过
    // system 与当前轮 user，故两者职责不重叠：
    //   摘要管「被裁掉的最早历史」，L1 管「仍在窗口内的历史」。
    if (this.config.existingSummary?.content) {
      built.messages = injectSummary(
        built.messages,
        this.config.existingSummary
      ) as typeof built.messages;
    }

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
    // P0-3：采样参数（undefined 不写 → client 不传 → 供应商默认）
    if (merged.topP !== undefined) request.topP = merged.topP;
    if (merged.presencePenalty !== undefined) request.presencePenalty = merged.presencePenalty;
    if (merged.frequencyPenalty !== undefined) request.frequencyPenalty = merged.frequencyPenalty;
    // P0-2：思考强度（client 侧按 capability 决定是否真正下发）
    if (merged.reasoningEffort) request.reasoningEffort = merged.reasoningEffort;
    // T-02：装配工具定义
    if (merged.tools && merged.tools.length > 0) {
      request.tools = merged.tools;
    }

    // 3. 创建 AbortController（支持外部 stop）
    this.abortController = new AbortController();
    request.signal = this.abortController.signal;

    this._isGenerating = true;
    let fullContent = '';
    /** P0-1：本轮累计思考（供 onThinking 的 fullThinking 参数与收敛判定使用） */
    let thinkingBuf = '';
    /** P1：本轮最新状态快照（多块时后者覆盖前者；未解析出字段时为 null） */
    let statusOut: CharacterStatus | null = null;
    /** P1：角色自带状态 schema；null = 纯嗅探模式（内置 8 字段 + 降级展示） */
    const statusSchema = params.card.ext?.statusSchema ?? null;

    /** P1：解析一段状态块原文并覆盖 statusOut（解析不出字段时保留原值） */
    const pushStatus = (raw: string): void => {
      const parsed = parseStatusBlock(raw, statusSchema, '');
      if (parsed) statusOut = parsed;
    };

    /**
     * P1 done 收敛：对最终正文做一次**幂等**的状态剥离
     * 标签优先，未命中时补一次 ```status 围栏兜底（围栏只在收尾跑，不参与流式）
     */
    const convergeStatus = (text: string): string => {
      const sp = parseStatusComplete(text);
      if (sp.hasStatus) {
        const parsed = parseStatusBlock(sp.statusRaw, statusSchema, '');
        if (parsed) statusOut = parsed;
        return sp.content;
      }
      const fenced = extractStatusFence(text);
      if (fenced) {
        const parsed = parseStatusBlock(fenced, statusSchema, '');
        if (parsed) {
          statusOut = parsed;
          return stripStatusFence(text);
        }
      }
      return text;
    };

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
        // P0-1：标签型思维链解析（跨 chunk 撕裂安全）；每轮独立，避免工具轮状态串味
        const splitter = new ThinkingSplitter();
        // P1：状态块解析器**串联**在思维链之后（复用同一状态机，只换标签与策略；§1.3）
        const statusSplitter = createStatusSplitter();
        /** 本轮是否收到过**字段型**思考（与标签型互斥判定用） */
        let fieldThinking = '';

        /**
         * 冲刷两级解析器残留，返回可输出到正文的增量
         *
         * 顺序固定：先冲思维链 → 其正文残留喂给状态解析器 → 再冲状态解析器。
         * 未闭合的状态块残留归正文（unclosedPolicy='text'），内容不丢。
         */
        const flushSplitters = (): string => {
          let textDelta = '';
          const tail = splitter.flush();
          if (tail.thinkingDelta) pushThinking(tail.thinkingDelta);
          if (tail.textDelta) {
            const sd = statusSplitter.feed(tail.textDelta);
            if (sd.thinkingDelta) pushStatus(sd.thinkingDelta);
            textDelta += sd.textDelta;
          }
          const statusTail = statusSplitter.flush();
          if (statusTail.thinkingDelta) pushStatus(statusTail.thinkingDelta);
          textDelta += statusTail.textDelta;
          return textDelta;
        };

        /**
         * 把一段思考增量累加并回调
         * @returns 累加后的累计思考
         */
        const pushThinking = (delta: string): string => {
          thinkingBuf += delta;
          callbacks?.onThinking?.(delta, thinkingBuf);
          return thinkingBuf;
        };

        for await (const ev of stream) {
          if (ev.type === 'delta') {
            // ① 字段型思考（reasoning_content / thinking_delta）—— client 已识别
            if (ev.thinkingDelta) {
              fieldThinking += ev.thinkingDelta;
              pushThinking(ev.thinkingDelta);
            }
            // ② 标签型思考（<think>…</think>）—— 编排层统一切分，4 个 client 全受益
            if (ev.delta) {
              const d = splitter.feed(ev.delta);
              if (d.thinkingDelta) pushThinking(d.thinkingDelta);
              if (d.textDelta) {
                // P1：状态块二次剥离 —— 只认 <status>，未闭合残留归正文（绝不丢内容）
                const sd = statusSplitter.feed(d.textDelta);
                if (sd.thinkingDelta) pushStatus(sd.thinkingDelta);
                if (sd.textDelta) {
                  roundContent += sd.textDelta;
                  fullContent += sd.textDelta;
                  callbacks?.onDelta?.(sd.textDelta, fullContent);
                }
              }
            }
          } else if (ev.type === 'done') {
            hasDone = true;
            finishReason = ev.finishReason;
            toolCalls = ev.toolCalls;

            // 冲刷两级解析器的残留（未闭合思考 / 未闭合状态块 / 尾部疑似标签前缀）
            const flushed = flushSplitters();
            if (flushed) {
              roundContent += flushed;
              fullContent += flushed;
              callbacks?.onDelta?.(flushed, fullContent);
            }

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

            // ── P0-1 done 收敛（§1.1.3 互斥原则，防 fullContent 回冲带标签）──
            // 字段型：fullContent 本身不含思考 → 直接用，不做二次解析
            // 标签型：对 fullContent 跑一次完整解析（幂等，与流式累积一致）
            if (fieldThinking !== '') {
              fullContent = ev.fullContent ?? roundContent;
            } else if (splitter.hasThinking) {
              const parsed = parseThinkingComplete(ev.fullContent ?? roundContent);
              fullContent = parsed.content || roundContent;
              if (parsed.thinking && parsed.thinking !== thinkingBuf) {
                thinkingBuf = parsed.thinking;
                // 累计值被修正：以 delta='' 回调，调用方只需用 fullThinking 覆盖
                callbacks?.onThinking?.('', thinkingBuf);
              }
            } else {
              fullContent = ev.fullContent ?? roundContent;
            }

            // ── P1 done 收敛：状态块幂等剥离（无条件；与思考分支无关）──
            fullContent = convergeStatus(fullContent);
            callbacks?.onStatus?.(statusOut);

            // 用量统计透传(缓存命中率统计用)
            if (ev.usage) callbacks?.onUsage?.(ev.usage);
            // E-01: 情绪状态更新(规则标注;fail-open;仅在 L0 启用且有 deps 时)
            void this.updateEmotion(fullContent, callbacks);
            callbacks?.onDone?.(fullContent, ev.finishReason);
            return fullContent;
          } else if (ev.type === 'error') {
            // 中止/出错：冲刷残留，让已收到的思考不至于丢失
            const flushed = flushSplitters();
            if (flushed) {
              roundContent += flushed;
              fullContent += flushed;
              callbacks?.onDelta?.(flushed, fullContent);
            }
            fullContent = convergeStatus(fullContent);
            callbacks?.onStatus?.(statusOut);
            const err = new Error(ev.error || t('api.genFailed'));
            callbacks?.onError?.(err);
            return fullContent; // 返回已收到的部分内容
          }
        }

        // 流自然结束未触发 done 事件
        if (!hasDone) {
          // 与 done 分支一致：先冲刷解析器残留，再收敛
          const flushed = flushSplitters();
          if (flushed) {
            roundContent += flushed;
            fullContent += flushed;
            callbacks?.onDelta?.(flushed, fullContent);
          }
          if (fieldThinking === '' && splitter.hasThinking) {
            const parsed = parseThinkingComplete(roundContent);
            fullContent = parsed.content || roundContent;
          }
          // P1：与 done 分支同款的状态收敛
          fullContent = convergeStatus(fullContent);
          callbacks?.onStatus?.(statusOut);
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
              result = t('api.toolFailed', { msg: err instanceof Error ? err.message : String(err) });
            }
            toolMsgs.push({ role: 'tool', content: result, toolCallId: tc.id });
          }
          messages = [...messages, assistantMsg, ...toolMsgs];
          toolRound++;
          continue;
        }

        // 工具轮数超限：结束循环，返回最后内容
        // P1：同样走一次状态收敛，保证任何退出路径都不会把 <status> 标签泄进正文
        fullContent = convergeStatus(fullContent);
        callbacks?.onStatus?.(statusOut);
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
      throw new Error(t('api.cannotUpdateWhileRunning'));
    }
    this.config = { ...this.config, ...patch };
  }

  /**
   * E-01: 情绪状态更新(每轮回复完成后调用)
   * 仅当 L0 启用且有 deps 时生效;规则标注命中情绪词才写入;fail-open 不影响主链路
   */
  /**
   * 摘要接线（2026-09-21）：按需生成/更新会话摘要。
   *
   * **异步、fire-and-forget、fail-open** —— 由调用方（chat store）在流式回复
   * 结束后触发；失败静默返回 null，**不阻塞、不影响主链路**。
   *
   * 与 L1 压缩的分工：**摘要管「被裁掉的最早历史」，L1 管「仍在窗口内的历史」**。
   *
   * @param messages 完整消息列表（含历史与最新回复）
   * @param config 摘要配置（来自 `settings.summarizationConfig`）
   * @param existingSummary 现有摘要（增量更新用）
   * @returns 新摘要；未启用 / 未达阈值 / 失败时返回 null
   */
  async summarizeIfNeeded(
    messages: ChatMessage[],
    config: SummarizationConfig,
    existingSummary: ConversationSummary | null
  ): Promise<ConversationSummary | null> {
    try {
      if (!(await shouldSummarize(messages, config, existingSummary))) return null;
      const service = new DefaultSummarizationService(
        this.config.apiClient,
        this.config.model
      );
      return await service.summarize(messages, config, existingSummary);
    } catch {
      return null; // fail-open：摘要失败绝不影响主链路
    }
  }

  private async updateEmotion(
    reply: string,
    callbacks?: ChatManagerCallbacks
  ): Promise<void> {
    if (!this.config.l0l2 || !this.config.optimization?.l0Enabled) return;
    try {
      const ok = await updateEmotionState(
        this.config.l0l2,
        this.config.sessionId ?? 'default-session',
        reply
      );
      if (ok && callbacks?.onEmotionUpdated) {
        // 读取更新后的状态标签用于回调
        const state = await this.config.l0l2.tracker.current(
          this.config.sessionId ?? 'default-session'
        );
        if (state) callbacks.onEmotionUpdated(state.label, this.config.sessionId ?? 'default-session');
      }
    } catch {
      /* fail-open:情绪更新失败静默 */
    }
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
  // 优先结构化字段（ApiError.kind 精确分类；AbortError 原生中止）
  if (err.name === 'AbortError' || err.name === 'ApiError' || (err as { kind?: string }).kind) {
    const kind = (err as { kind?: string }).kind;
    if (err.name === 'AbortError' || kind === 'aborted') return 'aborted';
    if (err instanceof ApiError) {
      switch (kind) {
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
          return err.statusCode ? 'api' : 'unknown';
      }
    }
    return 'unknown';
  }
  // 兜底文本匹配（兼容旧错误/第三方 Error；结构化字段优先）
  if (/已停止生成|aborted|generation (stopped|cancelled)/i.test(err.message)) {
    return 'aborted';
  }
  if (/network|fetch|网络|unreachable/i.test(err.message)) return 'network';
  return 'unknown';
}
