import { describe, it, expect } from 'vitest';
import {
  ThinkingSplitter,
  parseThinkingComplete,
  type ThinkingParseResult,
} from '../../src/core/thinking-parser';

/**
 * 用给定的 chunk 序列跑一遍流式解析，返回最终累积结果
 */
function runStream(
  chunks: string[],
  options?: ConstructorParameters<typeof ThinkingSplitter>[0]
): ThinkingParseResult & { textDeltas: string[]; thinkingDeltas: string[] } {
  const sp = new ThinkingSplitter(options);
  const textDeltas: string[] = [];
  const thinkingDeltas: string[] = [];
  for (const c of chunks) {
    const d = sp.feed(c);
    if (d.textDelta) textDeltas.push(d.textDelta);
    if (d.thinkingDelta) thinkingDeltas.push(d.thinkingDelta);
  }
  const tail = sp.flush();
  if (tail.textDelta) textDeltas.push(tail.textDelta);
  if (tail.thinkingDelta) thinkingDeltas.push(tail.thinkingDelta);
  const r = sp.result;
  return {
    content: r.content,
    thinking: r.thinking,
    hasThinking: r.hasThinking,
    textDeltas,
    thinkingDeltas,
  };
}

describe('thinking-parser — §3.3 流式边界用例', () => {
  it('用例1：标签跨 chunk 撕裂', () => {
    const r = runStream(['<thi', 'nk>我在思考', '</thi', 'nk>答案']);
    expect(r.content).toBe('答案');
    expect(r.thinking).toBe('我在思考');
    expect(r.hasThinking).toBe(true);
  });

  it('用例2：一 chunk 多组标签（拼接符默认 ""）', () => {
    const r = runStream(['<think>A</think>1<thin', 'k>B</think>2']);
    expect(r.content).toBe('12');
    expect(r.thinking).toBe('AB');
    expect(r.hasThinking).toBe(true);
  });

  it('用例3：未闭合（流结束/中止）残留归 thinking', () => {
    const r = runStream(['<think>想了一半']);
    expect(r.content).toBe('');
    expect(r.thinking).toBe('想了一半');
    expect(r.hasThinking).toBe(true);
  });

  it('用例4：未闭合 + unclosedPolicy=text 残留归正文', () => {
    const r = runStream(['<think>想了一半'], { unclosedPolicy: 'text' });
    expect(r.content).toBe('想了一半');
    expect(r.thinking).toBe('');
    // 开标签已被消费丢弃，不回吐到正文
    expect(r.content.startsWith('<think>')).toBe(false);
    expect(r.hasThinking).toBe(true);
  });

  it('用例5：空思考（标签存在但内容为空）', () => {
    const r = runStream(['<think></think>正文']);
    expect(r.content).toBe('正文');
    expect(r.thinking).toBe('');
    expect(r.hasThinking).toBe(true);
  });

  it('用例6：思考内含代码块与尖括号', () => {
    const code = '```js\nif (a<b) {}\n```';
    const r = runStream([`<think>${code}</think>OK`]);
    expect(r.content).toBe('OK');
    expect(r.thinking).toBe(code);
    expect(r.hasThinking).toBe(true);
  });

  it('用例7：首 chunk 即开标签', () => {
    const r = runStream(['<think>x', 'y', '</think>z']);
    expect(r.content).toBe('z');
    expect(r.thinking).toBe('xy');
    expect(r.hasThinking).toBe(true);
  });

  it('用例8：无思考（纯正文）', () => {
    const r = runStream(['你好', '世界']);
    expect(r.content).toBe('你好世界');
    expect(r.thinking).toBe('');
    expect(r.hasThinking).toBe(false);
  });

  it('用例9：正文含字面 <think 但非标签', () => {
    const r = runStream(['a <thinker b']);
    expect(r.content).toBe('a <thinker b');
    expect(r.thinking).toBe('');
    expect(r.hasThinking).toBe(false);
  });

  it('用例10：空 chunk / 空串', () => {
    const r = runStream(['', 'a', '']);
    expect(r.content).toBe('a');
    expect(r.thinking).toBe('');
    expect(r.hasThinking).toBe(false);
  });

  it('用例11：UTF-8 多字节跨 chunk', () => {
    const r = runStream(['<think>中', '文</think>尾']);
    expect(r.content).toBe('尾');
    expect(r.thinking).toBe('中文');
    expect(r.hasThinking).toBe(true);
  });

  it('用例12：中止（abort）时思考内容不丢失', () => {
    const sp = new ThinkingSplitter();
    // 流式过程中思考增量已实时产出，abort 时不再 feed，直接 flush 收尾
    const d = sp.feed('<think>未完');
    expect(d.thinkingDelta).toBe('未完');
    sp.flush();
    expect(sp.result.thinking).toBe('未完');
    expect(sp.result.content).toBe('');
    expect(sp.result.hasThinking).toBe(true);
  });

  it('用例13：嵌套 <think> 不嵌套处理（内层按文本）', () => {
    const r = runStream(['<think>a<thin', 'k>b</think>c']);
    expect(r.content).toBe('c');
    expect(r.thinking).toBe('a<think>b');
    expect(r.hasThinking).toBe(true);
  });

  it('用例14：大小写变体 <THINK> 默认不识别', () => {
    const r = runStream(['<THINK>x</THINK>y']);
    expect(r.content).toBe('<THINK>x</THINK>y');
    expect(r.thinking).toBe('');
    expect(r.hasThinking).toBe(false);
  });
});

describe('thinking-parser — 增量与状态', () => {
  it('feed 的增量拼接后应等于最终结果', () => {
    const r = runStream(['<thi', 'nk>A</thi', 'nk>B', '正文']);
    expect(r.textDeltas.join('')).toBe(r.content);
    expect(r.thinkingDeltas.join('')).toBe(r.thinking);
    expect(r.thinkingDeltas.join('')).toBe('A');
    expect(r.textDeltas.join('')).toBe('B正文');
  });

  it('inThinking 在思考态为 true，闭合后为 false', () => {
    const sp = new ThinkingSplitter();
    expect(sp.inThinking).toBe(false);
    sp.feed('<think>');
    expect(sp.inThinking).toBe(true);
    sp.feed('</think>');
    expect(sp.inThinking).toBe(false);
  });

  it('flush 幂等：重复调用不再产出增量', () => {
    const sp = new ThinkingSplitter();
    // 只喂半个开标签：内容全部留在缓冲里，由 flush 冲刷
    sp.feed('<thi');
    const first = sp.flush();
    const second = sp.flush();
    expect(first.textDelta).toBe('<thi');
    expect(sp.result.content).toBe('<thi');
    expect(second).toEqual({ textDelta: '', thinkingDelta: '' });
  });

  it('joinThinkingWith 可配置多组思考块拼接符', () => {
    const r = runStream(['<think>A</think>1<think>B</think>2'], { joinThinkingWith: '\n\n' });
    expect(r.thinking).toBe('A\n\nB');
    expect(r.content).toBe('12');
  });

  it('自定义标签可配置（如 <reasoning>）', () => {
    const r = runStream(['<reasoning>想</reasoning>答'], {
      openTag: '<reasoning>',
      closeTag: '</reasoning>',
    });
    expect(r.thinking).toBe('想');
    expect(r.content).toBe('答');
  });

  it('result 快照为非破坏性读取（不消费缓冲）', () => {
    const sp = new ThinkingSplitter();
    sp.feed('<think>x');
    const a = sp.result;
    sp.feed('y');
    expect(a.thinking).toBe('x'); // 快照不受后续影响
    expect(sp.result.thinking).toBe('xy');
  });
});

describe('thinking-parser — §3.4 一次性解析与流式解析的幂等不变量', () => {
  /** 确定性的伪随机切分（避免单测抖动） */
  function splitRandomly(s: string, seed: number): string[] {
    const chunks: string[] = [];
    let state = seed;
    const next = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    let i = 0;
    while (i < s.length) {
      const take = 1 + Math.floor(next() * 5);
      chunks.push(s.slice(i, i + take));
      i += take;
    }
    return chunks;
  }

  const samples: string[] = [
    '<think>A</think>正文',
    '<think>我在思考</think>你好世界',
    '前置<think>x</think>中置<think>y</think>后置',
    '<think></think>只有正文',
    '完全没有思考的普通文本',
    'a <thinker b 假标签',
    '<think>未闭合的残留内容',
    '<think>中文思考内容</think>中文正文',
    '<think>```js\nif (a<b) {}\n```</think>OK',
    '<think>a<thin</think>b',
  ];

  it('≥20 组随机切分下，流式累积结果与一次性解析一致', () => {
    const variants: Array<{ s: string; chunks: string[] }> = [];
    for (let seed = 1; seed <= 21; seed++) {
      const s = samples[seed % samples.length]!;
      variants.push({ s, chunks: splitRandomly(s, seed) });
    }
    expect(variants.length).toBeGreaterThanOrEqual(20);

    for (const { s, chunks } of variants) {
      const oneShot = parseThinkingComplete(s);
      const streamed = runStream(chunks);
      expect(streamed.content).toBe(oneShot.content);
      expect(streamed.thinking).toBe(oneShot.thinking);
      expect(streamed.hasThinking).toBe(oneShot.hasThinking);
    }
  });

  it('逐字符切分（最坏撕裂）下结果仍与一次性解析一致', () => {
    for (const s of samples) {
      const oneShot = parseThinkingComplete(s);
      const streamed = runStream([...s]);
      expect(streamed.content).toBe(oneShot.content);
      expect(streamed.thinking).toBe(oneShot.thinking);
    }
  });

  it('unclosedPolicy=text 下同样满足幂等不变量', () => {
    for (const s of samples) {
      const oneShot = parseThinkingComplete(s, { unclosedPolicy: 'text' });
      const streamed = runStream([...s], { unclosedPolicy: 'text' });
      expect(streamed.content).toBe(oneShot.content);
      expect(streamed.thinking).toBe(oneShot.thinking);
    }
  });
});

describe('thinking-parser — 性能（防 O(N²) 全量重扫）', () => {
  it('10 万字符输入单次解析 < 100ms', () => {
    const unit = '<think>这是一段思考内容，用于压测解析器的吞吐。</think>这是正文内容。';
    const text = unit.repeat(Math.ceil(100_000 / unit.length)).slice(0, 100_000);

    const started = Date.now();
    const r = parseThinkingComplete(text);
    const elapsed = Date.now() - started;

    expect(r.hasThinking).toBe(true);
    expect(r.content.length + r.thinking.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });

  it('10 万字符按 512 字节分块流式解析 < 100ms', () => {
    const unit = '<think>思考压测内容。</think>正文压测内容。';
    const text = unit.repeat(Math.ceil(100_000 / unit.length)).slice(0, 100_000);
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 512) chunks.push(text.slice(i, i + 512));

    const started = Date.now();
    const r = runStream(chunks);
    const elapsed = Date.now() - started;

    expect(r.hasThinking).toBe(true);
    expect(r.content.length + r.thinking.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});
