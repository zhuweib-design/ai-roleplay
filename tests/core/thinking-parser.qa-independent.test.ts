/**
 * ThinkingSplitter — QA 独立验证（不复用工程师用例）
 *
 * 与 tests/core/thinking-parser.test.ts 的区别：本文件从**撕裂语义与不变量**出发，
 * 由 QA 侧重新设计输入与断言，重点覆盖：
 * - 开/闭标签被切成任意碎片（含逐码元级最坏撕裂）
 * - 未闭合策略（thinking / text）的归属
 * - UTF-8 多字节（emoji 代理对 / CJK）被劈开在 chunk 边界
 * - 多组思考块拼接（joinThinkingWith）
 * - 思考内含代码块 / 尖括号 / 类标签文本 / HTML 片段
 * - 大小写与空格变体
 * - **幂等不变量**：≥60 组随机切分 + 全位置穷举切分，流式累积 === 一次性解析
 * - 性能：10 万字符单次解析 < 100ms
 */
import { describe, it, expect } from 'vitest';
import { ThinkingSplitter, parseThinkingComplete } from '@core/thinking-parser';

/** 把一段文本按流式喂入，返回累积结果 */
function streamParse(
  chunks: string[],
  options?: ConstructorParameters<typeof ThinkingSplitter>[0]
): { content: string; thinking: string; hasThinking: boolean } {
  const sp = new ThinkingSplitter(options);
  let content = '';
  let thinking = '';
  for (const c of chunks) {
    const d = sp.feed(c);
    content += d.textDelta;
    thinking += d.thinkingDelta;
  }
  const tail = sp.flush();
  content += tail.textDelta;
  thinking += tail.thinkingDelta;
  return { content, thinking, hasThinking: sp.hasThinking };
}

/** 确定性伪随机（LCG），保证用例可复现 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 把 s 随机切成 nShards 段（切点由种子决定） */
function randomSplit(s: string, nShards: number, seed: number): string[] {
  const rng = makeRng(seed);
  const len = s.length;
  if (len === 0) return [''];
  const cuts = new Set<number>();
  const want = Math.min(nShards - 1, len - 1);
  while (cuts.size < want) {
    cuts.add(1 + Math.floor(rng() * (len - 1)));
  }
  const points = [0, ...[...cuts].sort((a, b) => a - b), len];
  const out: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(s.slice(points[i]!, points[i + 1]!));
  }
  return out;
}

describe('QA 独立验证 — 标签跨 chunk 撕裂', () => {
  it('开标签与闭标签同时被撕裂：`<thi`+`nk>A</thi`+`nk>B`', () => {
    const r = streamParse(['<thi', 'nk>A</thi', 'nk>B']);
    expect(r.thinking).toBe('A');
    expect(r.content).toBe('B');
    expect(r.hasThinking).toBe(true);
  });

  it('开标签逐步到达：`<th` → `ink>`（未拼齐前绝不能把疑似前缀当正文吐出）', () => {
    const sp = new ThinkingSplitter();
    // 未拼齐前，疑似前缀必须留在缓冲里
    expect(sp.feed('<th')).toEqual({ textDelta: '', thinkingDelta: '' });
    expect(sp.inThinking).toBe(false);
    expect(sp.feed('i')).toEqual({ textDelta: '', thinkingDelta: '' });
    expect(sp.inThinking).toBe(false);
    expect(sp.feed('n')).toEqual({ textDelta: '', thinkingDelta: '' });
    expect(sp.inThinking).toBe(false);
    // 补齐最后两个字符 'k>' 才进入思考态
    expect(sp.feed('k>')).toEqual({ textDelta: '', thinkingDelta: '' });
    expect(sp.inThinking).toBe(true);
    expect(sp.feed('内容')).toEqual({ textDelta: '', thinkingDelta: '内容' });
    const tail = sp.flush();
    // 未闭合 → 残留已在 feed 阶段吐出，flush 无新增
    expect(tail).toEqual({ textDelta: '', thinkingDelta: '' });
    expect(sp.result).toEqual({ content: '', thinking: '内容', hasThinking: true });
  });

  it('`<th` 之后再来一个**新的** `<think`（即 `<th<think>`）：首个 `<th` 是正文', () => {
    // 拼起来是 '<th<think'，第一个完整开标签在下标 3，故 '<th' 归正文 —— 与一次性解析一致
    const sp = new ThinkingSplitter();
    expect(sp.feed('<th')).toEqual({ textDelta: '', thinkingDelta: '' });
    const d = sp.feed('<think>内容');
    expect(d.textDelta).toBe('<th');
    expect(d.thinkingDelta).toBe('内容');
    expect(sp.inThinking).toBe(true);
    expect(sp.result.thinking).toBe('内容');
    expect(sp.result.content).toBe('<th');
  });

  it('闭标签被切成 7 段逐字符到达，思考/正文归属仍正确', () => {
    const chunks = ['<think>思考X', ...'</think>'.split(''), '正文Y'];
    const r = streamParse(chunks);
    expect(r.thinking).toBe('思考X');
    expect(r.content).toBe('正文Y');
    // 与一次性解析一致
    expect(r).toEqual(parseThinkingComplete('<think>思考X</think>正文Y'));
  });

  it('正文尾部的孤立 `<` 不得吞掉后续文本（`<` 是 `<think>` 的真前缀）', () => {
    const r = streamParse(['abc<', 'b']);
    expect(r.content).toBe('abc<b');
    expect(r.thinking).toBe('');
  });

  it('孤立闭标签（无开标签）按普通文本处理', () => {
    expect(parseThinkingComplete('a</think>b')).toEqual({
      content: 'a</think>b',
      thinking: '',
      hasThinking: false,
    });
  });

  it('流结束停在开标签上（`<think>` 后无任何内容）', () => {
    const r = parseThinkingComplete('abc<think>');
    expect(r.content).toBe('abc');
    expect(r.thinking).toBe('');
    expect(r.hasThinking).toBe(true);
  });
});

describe('QA 独立验证 — 未闭合策略 unclosedPolicy', () => {
  it("默认 'thinking'：残留归思考，正文丢空", () => {
    const r = parseThinkingComplete('前<think>残留在思考里没闭合');
    expect(r.content).toBe('前');
    expect(r.thinking).toBe('残留在思考里没闭合');
    expect(r.hasThinking).toBe(true);
  });

  it("'text'：残留归正文（畸形输出的逃生策略）", () => {
    const r = parseThinkingComplete('前<think>看起来像标签其实没闭合', {
      unclosedPolicy: 'text',
    });
    expect(r.content).toBe('前看起来像标签其实没闭合');
    expect(r.thinking).toBe('');
  });

  it("'text' 策略：闭合块的思考仍能正确落到 thinking", () => {
    const r = parseThinkingComplete('<think>A</think>B', { unclosedPolicy: 'text' });
    expect(r.thinking).toBe('A');
    expect(r.content).toBe('B');
  });

  it("'text' 策略：思考内容延迟到闭标签才输出（流式过程中 thinkingDelta 恒空）", () => {
    const sp = new ThinkingSplitter({ unclosedPolicy: 'text' });
    const d1 = sp.feed('<think>秘');
    expect(d1.thinkingDelta).toBe('');
    const d2 = sp.feed('密</think>');
    expect(d2.thinkingDelta).toBe('秘密');
    expect(d2.textDelta).toBe('');
  });

  it('两种策略下都满足「流式 === 一次性」不变量', () => {
    const inputs = [
      '<think>a</think>b',
      '<think>a',
      'x<think>a</think><think>b',
      'x<think>a</thi',
      '<think></think><think>b</think>c',
    ];
    for (const policy of ['thinking', 'text'] as const) {
      for (const s of inputs) {
        for (let seed = 1; seed <= 12; seed++) {
          const chunks = randomSplit(s, 6, seed * 7919);
          const streamed = streamParse(chunks, { unclosedPolicy: policy });
          const once = parseThinkingComplete(s, { unclosedPolicy: policy });
          expect(streamed).toEqual(once);
        }
      }
    }
  });
});

describe('QA 独立验证 — UTF-8 多字节跨 chunk', () => {
  it('中文被劈在 chunk 边界（按码元切分）', () => {
    const s = '<think>我在思</think>考完成✅';
    // 逐码元切分是最坏撕裂
    const r = streamParse([...s]);
    expect(r).toEqual(parseThinkingComplete(s));
    expect(r.thinking).toBe('我在思');
    expect(r.content).toBe('考完成✅');
  });

  it('emoji 代理对被劈成两个孤立代理项，重建后仍完整', () => {
    const emoji = '😀'; // 2 个 UTF-16 码元
    expect(emoji.length).toBe(2);
    const s = `<think>${emoji}想</think>${emoji}答`;
    const hi = emoji[0]!;
    const lo = emoji[1]!;
    // 把代理对从中间劈开
    const chunks = ['<think>', hi, lo + '想</think>' + hi, lo + '答'];
    const r = streamParse(chunks);
    expect(r.thinking).toBe(`${emoji}想`);
    expect(r.content).toBe(`${emoji}答`);
    expect(r).toEqual(parseThinkingComplete(s));
  });

  it('多字节字符紧邻标签边界：中文 + 半个 `<think>`', () => {
    const r = streamParse(['中文', '<thi', 'nk>思考中', '文', '</thi', 'nk>结果']);
    expect(r.content).toBe('中文结果');
    expect(r.thinking).toBe('思考中文');
  });

  it('CJK + emoji 混合大段文本，逐码元撕裂后与一次性解析完全一致', () => {
    const s =
      '前段中文🎉<think>思考：混合 🎊 与汉字，还有 `code` </think>后段中文🚀结束';
    expect(streamParse([...s])).toEqual(parseThinkingComplete(s));
  });
});

describe('QA 独立验证 — 多组思考块与 joinThinkingWith', () => {
  it('默认拼接符为空串：多块直接相连（忠实原文）', () => {
    const r = parseThinkingComplete('<think>A</think>m1<think>B</think>m2');
    expect(r.thinking).toBe('AB');
    expect(r.content).toBe('m1m2');
  });

  it('自定义拼接符按块间插入（不是每块都加前缀）', () => {
    const r = parseThinkingComplete('<think>A</think>m1<think>B</think>m2<think>C</think>', {
      joinThinkingWith: '\n\n---\n\n',
    });
    expect(r.thinking).toBe('A\n\n---\n\nB\n\n---\n\nC');
  });

  it('拼接符在流式切分下同样只出现在块间', () => {
    const s = '<think>A</think>m<think>B</think>';
    const chunks = ['<thi', 'nk>A', '</thi', 'nk>m<thi', 'nk>B', '</think>'];
    const r = streamParse(chunks, { joinThinkingWith: '|' });
    expect(r.thinking).toBe('A|B');
    expect(r).toEqual(parseThinkingComplete(s, { joinThinkingWith: '|' }));
  });

  it('三块以上 + 空块混合', () => {
    const r = parseThinkingComplete('<think></think>a<think>B</think>b<think></think>c');
    expect(r.thinking).toBe('B');
    expect(r.content).toBe('abc');
    expect(r.hasThinking).toBe(true);
  });
});

describe('QA 独立验证 — 思考内含代码块 / 尖括号 / 类标签文本', () => {
  it('思考内的 ``` 代码块中包含字面的 <think>（不嵌套）', () => {
    const s = '<think>```html\n<think>假标签</think>\n```\n</think>答案';
    const r = parseThinkingComplete(s);
    expect(r.thinking).toBe('```html\n<think>假标签');
    expect(r.content).toBe('\n```\n</think>答案');
    // 与逐码元撕裂的流式结果保持一致
    expect(streamParse([...s])).toEqual(r);
  });

  it('思考内含 HTML 片段与尖括号', () => {
    const s = '<think><div class="x">a<b && c</div></think><p>正文</p>';
    const r = parseThinkingComplete(s);
    expect(r.thinking).toBe('<div class="x">a<b && c</div>');
    expect(r.content).toBe('<p>正文</p>');
  });

  it('正文含 HTML 片段且无思考标签 → 原样保留', () => {
    const s = '<div>a<b</div><span>x</span>';
    expect(parseThinkingComplete(s).content).toBe(s);
  });

  it('思考内出现 `</thin` 这类近似闭标签文本（未闭合）', () => {
    const s = '<think>a</thin';
    const r = parseThinkingComplete(s);
    // 未闭合 → 残留归思考，`</thin` 作为思考内容的一部分
    expect(r.thinking).toBe('a</thin');
    expect(r.content).toBe('');
  });

  it('正文里出现字面 `<think ` （带空格，非标签）→ 不进入思考态', () => {
    const s = 'a<think 不是标签>b';
    const r = parseThinkingComplete(s);
    expect(r.content).toBe(s);
    expect(r.hasThinking).toBe(false);
  });
});

describe('QA 独立验证 — 大小写与空格变体', () => {
  it('默认只认小写：<THINK>…</THINK> 按普通文本', () => {
    const s = '<THINK>大写思考</THINK>正文';
    const r = parseThinkingComplete(s);
    expect(r.content).toBe(s);
    expect(r.thinking).toBe('');
    expect(r.hasThinking).toBe(false);
  });

  it('默认不认带空格变体：< think > … < /think >', () => {
    const s = '< think >思考< /think >正文';
    expect(parseThinkingComplete(s).content).toBe(s);
  });

  it('混用大小写（开标签大写、闭标签小写）→ 闭标签孤立，残留归思考', () => {
    const s = '<THINK>思考</think>正文';
    const r = parseThinkingComplete(s);
    // 开标签未识别 → 全为正文；闭标签孤立也不识别
    expect(r.content).toBe(s);
  });

  it('自定义标签可显式支持大写变体', () => {
    const opts = { openTag: '<THINK>', closeTag: '</THINK>' };
    const r = parseThinkingComplete('<THINK>思考</THINK>正文', opts);
    expect(r.thinking).toBe('思考');
    expect(r.content).toBe('正文');
  });

  it('自定义标签 <reasoning> 全链路（含流式撕裂）', () => {
    const opts = { openTag: '<reasoning>', closeTag: '</reasoning>' };
    const s = '<reasoning>推理</reasoning>结论';
    expect(streamParse(['<reas', 'oning>推理</reaso', 'ning>结论'], opts)).toEqual(
      parseThinkingComplete(s, opts)
    );
  });
});

describe('QA 独立验证 — 幂等不变量（流式 === 一次性）', () => {
  const CORPUS: string[] = [
    'no tags at all 纯正文',
    '<think>only</think>',
    '<think></think>',
    '<think>',
    '</think>',
    '<think>a<think>b</think>c',
    '<think>1</think>m<think>2</think>n<think>3</think>',
    'pre<think>中文🎉思考</think>post',
    '<think>```\n<think>x\n```\n</think>ans',
    '<think>a</thi',
    'abc<th',
    'a<b',
    '<think>A</think><think>B',
    'x<think>A</think>y<think>B</thi',
    '中文前<think>😀😀</think>中文后😀',
    '<think>line1\nline2\n</think>\n正文\n正文',
  ];

  it('60+ 组随机切分：每种输入 × 多种切分数 × 多种种子，结果恒等于一次性解析', () => {
    let combos = 0;
    for (const s of CORPUS) {
      const once = parseThinkingComplete(s);
      for (let shards = 2; shards <= 8; shards++) {
        for (let seed = 1; seed <= 5; seed++) {
          const chunks = randomSplit(s, shards, seed * 104729 + shards);
          expect(streamParse(chunks)).toEqual(once);
          combos++;
        }
      }
    }
    // 16 输入 × 7 切分数 × 5 种子 = 560 组，远超要求的 50 组
    expect(combos).toBeGreaterThanOrEqual(50);
  });

  it('全位置穷举单点切分：对每个输入的所有切点做两段切分，结果恒等', () => {
    for (const s of CORPUS) {
      const once = parseThinkingComplete(s);
      for (let i = 0; i <= s.length; i++) {
        expect(streamParse([s.slice(0, i), s.slice(i)])).toEqual(once);
      }
    }
  });

  it('逐码元切分（最坏撕裂）对所有语料成立', () => {
    for (const s of CORPUS) {
      expect(streamParse([...s])).toEqual(parseThinkingComplete(s));
    }
  });

  it('空 chunk 与空串不得改变状态', () => {
    const sp = new ThinkingSplitter();
    expect(sp.feed('')).toEqual({ textDelta: '', thinkingDelta: '' });
    sp.feed('<think>');
    sp.feed('');
    expect(sp.inThinking).toBe(true);
    expect(sp.feed('A')).toEqual({ textDelta: '', thinkingDelta: 'A' });
  });

  it('flush 幂等：第二次 flush 不再产出任何增量且结果不变', () => {
    const sp = new ThinkingSplitter();
    // 未闭合场景：思考内容在 feed 阶段已增量吐出，flush 只负责冲刷残留缓冲
    const feedOut = sp.feed('<think>残留');
    expect(feedOut.thinkingDelta).toBe('残留');
    const t1 = sp.flush();
    const snapshot = { ...sp.result };
    const t2 = sp.flush();
    expect(t1).toEqual({ textDelta: '', thinkingDelta: '' });
    expect(t2).toEqual({ textDelta: '', thinkingDelta: '' });
    expect({ ...sp.result }).toEqual(snapshot);
    expect(snapshot).toEqual({ content: '', thinking: '残留', hasThinking: true });
  });

  it('缓冲里仍有疑似标签残留时，flush 负责把它吐出且只吐一次', () => {
    const sp = new ThinkingSplitter();
    sp.feed('<think>A</th'); // '</th' 是闭标签真前缀，留在缓冲
    expect(sp.result.thinking).toBe('A');
    const t1 = sp.flush();
    expect(t1.thinkingDelta).toBe('</th');
    expect(sp.flush()).toEqual({ textDelta: '', thinkingDelta: '' });
  });

  it('result 快照为只读视图语义：读取不消费缓冲', () => {
    const sp = new ThinkingSplitter();
    sp.feed('a<th');
    const before = { ...sp.result };
    const mid = { ...sp.result };
    expect(mid).toEqual(before);
    expect(sp.feed('ink>')).toEqual({ textDelta: '', thinkingDelta: '' });
    expect(sp.inThinking).toBe(true);
  });
});

describe('QA 独立验证 — 性能', () => {
  it('10 万字符单次解析 < 100ms', () => {
    const unit = '<think>' + '思'.repeat(45) + '</think>' + '正'.repeat(45);
    const s = unit.repeat(Math.ceil(100_000 / unit.length));
    expect(s.length).toBeGreaterThanOrEqual(100_000);

    const t0 = performance.now();
    const r = parseThinkingComplete(s);
    const ms = performance.now() - t0;

    expect(r.hasThinking).toBe(true);
    expect(r.thinking).not.toContain('<think>');
    expect(r.content).not.toContain('思');
    expect(ms).toBeLessThan(100);
  });

  it('10 万字符按 1KB 分块流式解析 < 200ms 且与一次性解析一致', () => {
    const unit = '<think>' + 'x'.repeat(30) + '</think>' + 'y'.repeat(30);
    const s = unit.repeat(Math.ceil(100_000 / unit.length));
    const chunks: string[] = [];
    for (let i = 0; i < s.length; i += 1024) chunks.push(s.slice(i, i + 1024));

    const t0 = performance.now();
    const streamed = streamParse(chunks);
    const ms = performance.now() - t0;

    expect(ms).toBeLessThan(200);
    expect(streamed).toEqual(parseThinkingComplete(s));
  });
});
