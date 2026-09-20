/**
 * 思维链解析器 (P0-1)
 *
 * 职责：把模型输出中的 `<think>…</think>` 标签型思维链从正文里剥离出来，
 * 供 UI 折叠渲染，并保证**回传给模型的正文不含思考**（省 token）。
 *
 * 设计要点：
 * 1. **增量状态机**：流式场景下标签会被网络 chunk 撕裂（`'<thi'` + `'nk>…'`），
 *    因此不能对单个 chunk 做正则替换，必须跨 chunk 保留缓冲。
 * 2. **缓冲区恒 ≤ 一个 chunk + 标签长度**：找不到完整标签时只输出"安全前缀"，
 *    尾部疑似标签前缀留在缓冲里等下一个 chunk —— 因此整体 O(N)，无全量重扫。
 * 3. **纯函数、零依赖**：不 import 任何模块（含 i18n），便于单测与复用。
 * 4. **不嵌套**：思考块内的 `<think>` 按普通文本处理（与主流实现一致）。
 * 5. **默认只认小写** `<think>` / `</think>`（大小写变体按普通文本处理）。
 *
 * 幂等不变量：`parseThinkingComplete(s)` === `feed(s)` + `flush()` 的累积结果，
 * 与 s 被切成多少个 chunk 无关（见 tests/core/thinking-parser.test.ts）。
 */

/** 一次性解析的结果 */
export interface ThinkingParseResult {
  /** 正文（已剥离思考标签） */
  content: string;
  /** 思考内容（已剥离外层标签） */
  thinking: string;
  /** 是否检测到思考块（注意：标签存在但内容为空串时仍为 true） */
  hasThinking: boolean;
}

/** 解析器可选项 */
export interface ThinkingSplitterOptions {
  /** 开标签，默认 '<think>' */
  openTag?: string;
  /** 闭标签，默认 '</think>' */
  closeTag?: string;
  /**
   * 流结束时仍处于思考态（未闭合）的残留归属，默认 'thinking'
   * - 'thinking'：残留归思考（默认；模型确实在思考，只是被截断）
   * - 'text'：残留归正文（畸形输出的逃生策略：只开了头没闭合时至少让内容可见）
   *
   * 注意：'text' 策略下思考内容会**延迟到闭标签出现**才输出，
   * 因此流式过程中 thinkingDelta 恒为空 —— 这是该策略的既定代价。
   */
  unclosedPolicy?: 'thinking' | 'text';
  /** 多组思考块之间的拼接符，默认 ''（直接拼接，忠实原文） */
  joinThinkingWith?: string;
}

/** feed / flush 返回的增量 */
export interface ThinkingDelta {
  textDelta: string;
  thinkingDelta: string;
}

const DEFAULT_OPEN_TAG = '<think>';
const DEFAULT_CLOSE_TAG = '</think>';

/**
 * 求 buf 的最长后缀长度 k，使得该后缀是 tag 的**真前缀**（k < tag.length）
 *
 * 用于在未找到完整标签时，保留尾部"疑似标签的一半"，避免跨 chunk 撕裂误判。
 */
function longestSuffixPrefixLen(buf: string, tag: string): number {
  const max = Math.min(buf.length, tag.length - 1);
  for (let k = max; k > 0; k--) {
    // buf 末尾 k 个字符 == tag 开头 k 个字符 → 可能是标签被截断了一半
    if (buf.endsWith(tag.slice(0, k))) return k;
  }
  return 0;
}

/**
 * 思维链切分器（增量状态机）
 *
 * 用法：
 * ```ts
 * const sp = new ThinkingSplitter();
 * for await (const chunk of chunks) {
 *   const d = sp.feed(chunk);
 *   if (d.thinkingDelta) ui.appendThinking(d.thinkingDelta);
 *   if (d.textDelta) ui.appendContent(d.textDelta);
 * }
 * const tail = sp.flush(); // 流结束/中止：冲刷残留
 * ```
 */
export class ThinkingSplitter {
  private readonly openTag: string;
  private readonly closeTag: string;
  private readonly unclosedPolicy: 'thinking' | 'text';
  private readonly joinThinkingWith: string;

  /** 跨 chunk 缓冲（恒 ≤ 一个 chunk + 标签长度） */
  private buf = '';
  /** 当前是否处于思考态 */
  private thinking_ = false;
  /** 是否已检测到过思考块 */
  private hasThinking_ = false;
  /** 累积正文 */
  private text = '';
  /** 累积思考 */
  private thinking = '';
  /** 'text' 策略下的待决缓冲（闭标签出现 → 归思考；flush 未闭合 → 归正文） */
  private pending = '';
  /** 已 flush 标记（保证 flush 幂等） */
  private flushed = false;

  constructor(options: ThinkingSplitterOptions = {}) {
    this.openTag = options.openTag ?? DEFAULT_OPEN_TAG;
    this.closeTag = options.closeTag ?? DEFAULT_CLOSE_TAG;
    this.unclosedPolicy = options.unclosedPolicy ?? 'thinking';
    this.joinThinkingWith = options.joinThinkingWith ?? '';
  }

  /** 当前是否处于思考态（供 UI 显示"思考中…"指示器） */
  get inThinking(): boolean {
    return this.thinking_;
  }

  /** 是否已检测到过思考块 */
  get hasThinking(): boolean {
    return this.hasThinking_;
  }

  /** 累计结果快照（非破坏性） */
  get result(): Readonly<ThinkingParseResult> {
    return {
      content: this.text,
      thinking: this.thinking,
      hasThinking: this.hasThinking_,
    };
  }

  /**
   * 喂入一个流式 chunk，返回本次可安全输出的增量
   *
   * @param chunk 本次收到的文本增量（可为空串）
   */
  feed(chunk: string): ThinkingDelta {
    const out: ThinkingDelta = { textDelta: '', thinkingDelta: '' };
    if (!chunk) return out;

    this.buf += chunk;

    // 一个 chunk 内可能含多组标签，循环直到缓冲里不再有完整标签
    for (;;) {
      const tag = this.thinking_ ? this.closeTag : this.openTag;
      const idx = this.buf.indexOf(tag);

      if (idx < 0) {
        // 无完整标签：只输出"安全前缀"，尾部疑似标签前缀留在缓冲里等下一个 chunk
        const keep = longestSuffixPrefixLen(this.buf, tag);
        const safe = this.buf.length - keep;
        if (safe > 0) {
          const seg = this.buf.slice(0, safe);
          this.buf = this.buf.slice(safe);
          this.emitSegment(seg, out);
        }
        return out;
      }

      const seg = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + tag.length);
      this.emitSegment(seg, out);

      if (this.thinking_) {
        // 命中闭标签：'text' 策略下把待决缓冲确认为思考
        this.thinking_ = false;
        this.commitPending(out);
      } else {
        // 命中开标签
        this.thinking_ = true;
        this.hasThinking_ = true;
      }
    }
  }

  /**
   * 流结束 / 中止时冲刷内部缓冲，返回残留增量
   * 幂等：重复调用后续返回空增量
   */
  flush(): ThinkingDelta {
    const out: ThinkingDelta = { textDelta: '', thinkingDelta: '' };
    if (this.flushed) return out;
    this.flushed = true;

    if (this.thinking_) {
      if (this.unclosedPolicy === 'text') {
        // 未闭合 → 待决缓冲 + 残留一并归正文（逃生策略，至少让内容可见）
        const seg = this.pending + this.buf;
        this.pending = '';
        this.buf = '';
        this.appendText(seg, out);
      } else {
        this.appendThinking(this.pending + this.buf, out);
        this.pending = '';
        this.buf = '';
      }
    } else {
      const seg = this.buf;
      this.buf = '';
      this.appendText(seg, out);
    }

    // 冲刷后回到正文态，避免残留状态影响后续（理论上流已结束）
    this.thinking_ = false;
    return out;
  }

  /** 按当前状态把一段文本输出到对应桶 */
  private emitSegment(seg: string, out: ThinkingDelta): void {
    if (seg === '') return;
    if (this.thinking_) {
      if (this.unclosedPolicy === 'text') {
        // 延迟归属：先攒着，等闭标签出现（commitPending）或 flush 时归正文
        this.pending += seg;
      } else {
        this.appendThinking(seg, out);
      }
    } else {
      this.appendText(seg, out);
    }
  }

  /** 'text' 策略下闭标签命中：把待决缓冲确认为思考并输出 */
  private commitPending(out: ThinkingDelta): void {
    if (this.pending === '') return;
    const seg = this.pending;
    this.pending = '';
    this.appendThinking(seg, out);
  }

  private appendText(seg: string, out: ThinkingDelta): void {
    if (seg === '') return;
    this.text += seg;
    out.textDelta += seg;
  }

  private appendThinking(seg: string, out: ThinkingDelta): void {
    if (seg === '') return;
    let s = seg;
    // 多组思考块之间按 joinThinkingWith 拼接（默认 '' = 直接拼接，忠实原文）
    if (this.thinking !== '' && this.joinThinkingWith !== '') {
      s = this.joinThinkingWith + s;
    }
    this.thinking += s;
    out.thinkingDelta += s;
  }
}

/**
 * 一次性解析（非流式场景：apiClient.chat() 返回值、历史消息再解析）
 *
 * 等价于 `new ThinkingSplitter(options).feed(text)` + `flush()`，
 * 因此与流式累积结果**幂等**（任意切分下结果一致）。
 */
export function parseThinkingComplete(
  text: string,
  options?: ThinkingSplitterOptions
): ThinkingParseResult {
  const splitter = new ThinkingSplitter(options);
  splitter.feed(text);
  splitter.flush();
  return { ...splitter.result };
}
