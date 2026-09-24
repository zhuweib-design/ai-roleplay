/**
 * output-discipline — L2 输出纪律层 (E-02) 测试
 *
 * 覆盖：
 * - classifyScope:对白(引号占比)/情绪旁白/状态旁白/other 分类
 * - protect/restore 往返:对白、情绪词、设定实体硬豁免
 * - compressMetaNarration:删填充词/重复,保留句法与内容
 * - protect → compress → restore 全链路:受保护内容零损失
 * - buildAutoClarityPrompt 内容
 */
import { describe, it, expect } from 'vitest';
import {
  classifyScope,
  protect,
  restore,
  compressMetaNarration,
  buildAutoClarityPrompt,
  detectEmotion,
  EMOTION_WORDS,
} from '@core/output-discipline';

describe('classifyScope (E-02)', () => {
  it('对白:引号内容占比过半归为 dialogue', () => {
    expect(classifyScope('"你到底想怎样?"她问道')).toBe('dialogue');
    expect(classifyScope('「我不同意。」他坚定地说')).toBe('dialogue');
    expect(classifyScope('“快走！”')).toBe('dialogue');
  });

  it('情绪/氛围旁白:命中情绪词归为 emotion_narration', () => {
    expect(classifyScope('她感到一阵愤怒涌上心头')).toBe('emotion_narration');
    expect(classifyScope('房间里弥漫着温暖的气息')).toBe('emotion_narration');
  });

  it('状态性旁白:命中状态动词归为 meta_narration', () => {
    expect(classifyScope('他转身走向门口')).toBe('meta_narration');
    expect(classifyScope('她拿起桌上的杯子')).toBe('meta_narration');
  });

  it('无特征文本归为 other', () => {
    expect(classifyScope('这是一个普通的段落,没有任何特征。')).toBe('other');
    expect(classifyScope('')).toBe('other');
  });
});

describe('protect/restore (E-02)', () => {
  it('对白、情绪词、设定实体全部保护并还原', () => {
    const text = '"我不会原谅你。"她愤怒地说,握紧了星陨之剑。';
    const { text: protectedText, segments } = protect(text, ['星陨之剑']);
    // 受保护内容不在哨兵化文本中
    expect(protectedText).not.toContain('不会原谅你');
    expect(protectedText).not.toContain('愤怒');
    expect(protectedText).not.toContain('星陨之剑');
    // 还原无损
    expect(restore(protectedText, segments)).toBe(text);
  });

  it('重复保护不破坏顺序(多段对白)', () => {
    const text = '"第一段。"他顿了顿,"第二段。"';
    const { text: protectedText, segments } = protect(text);
    expect(restore(protectedText, segments)).toBe(text);
  });

  it('无保护内容时原样返回', () => {
    const { text, segments } = protect('普通文本 123');
    expect(segments).toEqual([]);
    expect(text).toBe('普通文本 123');
  });
});

describe('compressMetaNarration (E-02)', () => {
  it('删除填充词但保留句法与内容', () => {
    const input = '他似乎真的有点犹豫,然后轻轻地点了点头。';
    const out = compressMetaNarration(input);
    expect(out).not.toContain('似乎');
    expect(out).not.toContain('然后');
    expect(out).toContain('犹豫');
    expect(out).toContain('点了点头');
  });

  it('折叠重复字', () => {
    expect(compressMetaNarration('她轻轻轻轻地说')).toBe('她轻轻地说');
  });

  it('清理粘连标点', () => {
    const out = compressMetaNarration('他停下,,,然后转身');
    expect(out).not.toContain('，，');
  });
});

describe('全链路:protect → compress → restore (E-02)', () => {
  it('受保护内容(对白/情绪/实体)零损失,状态旁白被精简', () => {
    const text = '"我绝不放弃。"她愤怒地握紧了剑,似乎有点犹豫,然后缓缓地向前迈了一步。';
    const { text: protectedText, segments } = protect(text, ['剑']);
    const compressed = compressMetaNarration(protectedText);
    const restored = restore(compressed, segments);

    // 对白/情绪/实体完整保留
    expect(restored).toContain('我绝不放弃');
    expect(restored).toContain('愤怒');
    expect(restored).toContain('剑');
    // 状态旁白填充词被删(且哨兵不泄漏)
    expect(restored).not.toContain('似乎');
    expect(restored).not.toContain('PROTECT');
  });
});

describe('buildAutoClarityPrompt (E-02)', () => {
  it('包含安全/澄清/重复提问与保护标记规则', () => {
    const p = buildAutoClarityPrompt();
    expect(p).toContain('安全');
    expect(p).toContain('重复提问');
    expect(p).toContain('保护标记');
  });
});

// ── detectEmotion：规则情绪标注（2026-09-22 扩词表 + 修正首命中）──

describe('detectEmotion — 规则情绪标注', () => {
  it('返回文本中最后出现的情绪词（"当前状态"语义）', () => {
    // 旧实现按词表顺序取首个命中，"愤怒"排在"平静"前面 → 会误判为愤怒
    expect(detectEmotion('他先是愤怒，然后逐渐平静下来。')).toBe('平静');
  });

  it('不再受词表顺序影响', () => {
    // "愤怒"在词表中更靠前，但"喜悦"出现在文本更靠后 → 应取喜悦
    expect(detectEmotion('她愤怒过，但此刻满是喜悦。')).toBe('喜悦');
  });

  it('常用口语情绪词可命中（原词表遗漏的那批）', () => {
    expect(detectEmotion('我今天真的很开心')).toBe('开心');
    expect(detectEmotion('他看起来有点难过')).toBe('难过');
    expect(detectEmotion('她害怕极了')).toBe('害怕');
    expect(detectEmotion('他生气了')).toBe('生气');
    expect(detectEmotion('大家都感到惊讶')).toBe('惊讶');
  });

  it('无命中返回 null（调用方据此不更新状态）', () => {
    expect(detectEmotion('今天天气不错，我们去散步。')).toBeNull();
  });

  it('空文本返回 null', () => {
    expect(detectEmotion('')).toBeNull();
  });

  it('词表只含双字及以上词（避免 includes 子串误命中）', () => {
    for (const w of EMOTION_WORDS) {
      expect(w.length).toBeGreaterThanOrEqual(2);
    }
  });
});