import { describe, it, expect, beforeEach } from 'vitest';
import { parseThinkingComplete } from '@core/thinking-parser';
import {
  createStatusSplitter,
  extractStatusFence,
  parseStatusBlock,
  parseStatusComplete,
  resolveLatestStatus,
  stripStatusFence,
  STATUS_OPEN_TAG,
} from '@core/status-parser';
import type { CharacterStatus, StatusSchema } from '@core/status-schema';
import { initLocale } from '@/i18n';

/**
 * P1 状态解析器测试 (T02)
 *
 * 逐条覆盖设计文档 §3.5 的边界用例清单：
 * A 容器识别 / B 块内容解析 / C 匹配与 i18n / D 流式与幂等 / E 与思维链共存 / F 性能与安全
 */

/** 把文本切成 n 段（用于流式模拟） */
function chunkify(text: string, n: number): string[] {
  const out: string[] = [];
  const step = Math.max(1, Math.ceil(text.length / n));
  for (let i = 0; i < text.length; i += step) out.push(text.slice(i, i + step));
  return out;
}

/** 走一遍流式：feed 全部 chunk + flush，返回累积结果 */
function streamParse(chunks: string[]): { content: string; statusRaw: string } {
  const sp = createStatusSplitter();
  let content = '';
  let statusRaw = '';
  for (const c of chunks) {
    const d = sp.feed(c);
    statusRaw += d.thinkingDelta;
    content += d.textDelta;
  }
  const tail = sp.flush();
  statusRaw += tail.thinkingDelta;
  content += tail.textDelta;
  return { content, statusRaw };
}

/** 简易可复现伪随机（避免不同环境序列不一致） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 随机切分（按比例切出 count 段） */
function randomChunks(text: string, count: number, rand: () => number): string[] {
  const cuts = new Set<number>();
  for (let i = 0; i < count - 1; i++) {
    cuts.add(1 + Math.floor(rand() * (text.length - 1)));
  }
  const points = [0, ...Array.from(cuts).sort((a, b) => a - b), text.length];
  const out: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(text.slice(points[i]!, points[i + 1]!));
  }
  return out.filter((c) => c !== '');
}

const SCHEMA_SIMPLE: StatusSchema = {
  version: 1,
  fields: [
    { key: 'location', type: 'string' },
    { key: 'affection', type: 'number' },
  ],
};

beforeEach(() => {
  initLocale('zh');
});

// ── A. 容器识别 ──

describe('A. 容器识别', () => {
  it('A-01 无状态块 → content 原样、statusRaw 空、hasStatus=false', () => {
    const r = parseStatusComplete('今天天气不错，我们去酒馆吧。');
    expect(r.content).toBe('今天天气不错，我们去酒馆吧。');
    expect(r.statusRaw).toBe('');
    expect(r.hasStatus).toBe(false);
  });

  it('A-02 完整块 → 剥离后 content 不含任何状态原文', () => {
    const r = parseStatusComplete('正文内容<status>{"location":"tavern"}</status>');
    expect(r.content).toBe('正文内容');
    expect(r.statusRaw).toBe('{"location":"tavern"}');
    expect(r.hasStatus).toBe(true);
  });

  it('A-03 状态块在正文中部（非末尾）→ 仍提取', () => {
    const r = parseStatusComplete('前<status>location: tavern</status>后');
    expect(r.statusRaw).toBe('location: tavern');
    expect(r.content).toBe('前后');
  });

  it('A-04 状态块在正文开头 → 仍提取', () => {
    const r = parseStatusComplete('<status>location: tavern</status>正文');
    expect(r.statusRaw).toBe('location: tavern');
    expect(r.content).toBe('正文');
  });

  it('A-05 未闭合 → 内容归正文（绝不丢），status 为 null', () => {
    const r = parseStatusComplete('正文<status>\nlocation: tavern');
    expect(r.hasStatus).toBe(true);
    expect(r.content).not.toContain(STATUS_OPEN_TAG);
    expect(r.content).toContain('location: tavern');
    expect(r.content).toContain('正文');
    expect(parseStatusBlock(r.statusRaw)).toBeNull();
  });

  it('A-06 空块 → hasStatus=true 但 parseStatusBlock 返回 null（不渲染空壳）', () => {
    const r = parseStatusComplete('正文<status></status>');
    expect(r.hasStatus).toBe(true);
    expect(r.statusRaw).toBe('');
    expect(parseStatusBlock(r.statusRaw, SCHEMA_SIMPLE, 'm1')).toBeNull();
  });

  it('A-07 ```status 围栏 → 收尾兜底识别成功', () => {
    const text = '正文\n\n```status\n{"location": "tavern"}\n```';
    expect(extractStatusFence(text)).toBe('{"location": "tavern"}\n');
    const s = parseStatusBlock(extractStatusFence(text), SCHEMA_SIMPLE, 'm1');
    expect(s?.entries[0]?.value).toBe('tavern');
    expect(stripStatusFence(text)).toBe('正文');
  });

  it('A-08 普通 ``` 代码块（info string 为空）→ 不识别（防竞品式误判）', () => {
    const text = '正文\n\n```\nconst a = 1;\n```';
    expect(extractStatusFence(text)).toBe('');
    expect(stripStatusFence(text)).toBe(text);
  });

  it('A-09 正文含字面量 <status> 文本 → 按开标签处理（已知取舍，固化行为）', () => {
    const r = parseStatusComplete('他说了 <status> 这个词');
    expect(r.hasStatus).toBe(true);
    // 未闭合 → 残留归正文，内容不丢
    expect(r.content).toContain('这个词');
  });

  it('A-10 状态块内含字面量 </status> → 提前闭合（已知取舍，固化行为）', () => {
    const r = parseStatusComplete('正文<status>location: a</status>尾巴</status>');
    expect(r.statusRaw).toBe('location: a');
    expect(r.content).toContain('尾巴');
  });
});

// ── B. 块内容解析 ──

describe('B. 块内容解析', () => {
  it('B-01 JSON 对象', () => {
    const s = parseStatusBlock('{"location":"tavern","affection":7}', SCHEMA_SIMPLE, 'm1');
    expect(s?.parseMode).toBe('json');
    expect(s?.entries.map((e) => [e.key, e.value])).toEqual([
      ['location', 'tavern'],
      ['affection', '7'],
    ]);
    expect(s?.entries[1]?.raw).toBe(7);
  });

  it('B-02 JSON 带尾逗号 / 单引号兜底成功', () => {
    const withTrailing = parseStatusBlock('{"location":"tavern",}', SCHEMA_SIMPLE, 'm1');
    expect(withTrailing?.entries[0]?.value).toBe('tavern');
    const fenced = parseStatusBlock('```json\n{"location":"tavern"}\n```', SCHEMA_SIMPLE, 'm1');
    expect(fenced?.entries[0]?.value).toBe('tavern');
  });

  it('B-03 按行 location: tavern', () => {
    const s = parseStatusBlock('location: tavern', SCHEMA_SIMPLE, 'm1');
    expect(s?.parseMode).toBe('lines');
    expect(s?.entries[0]).toMatchObject({ key: 'location', value: 'tavern' });
  });

  it('B-04 全角冒号 location：tavern', () => {
    const s = parseStatusBlock('location：tavern', SCHEMA_SIMPLE, 'm1');
    expect(s?.entries[0]).toMatchObject({ key: 'location', value: 'tavern' });
  });

  it('B-05 值含冒号 time: 18:30 → 值保留 18:30', () => {
    const s = parseStatusBlock('time: 18:30');
    expect(s?.entries[0]?.value).toBe('18:30');
  });

  it('B-06 无分隔符行 → 跳过', () => {
    expect(parseStatusBlock('just a sentence')).toBeNull();
  });

  it('B-07 key 为空 → 跳过', () => {
    expect(parseStatusBlock(': tavern')).toBeNull();
    expect(parseStatusBlock('：tavern')).toBeNull();
  });

  it('B-08 value 为空 → 跳过', () => {
    expect(parseStatusBlock('location:')).toBeNull();
    expect(parseStatusBlock('location：')).toBeNull();
  });

  it('B-09 重复 key → 后者覆盖前者，entries 内不重复', () => {
    const s = parseStatusBlock('location: a\nLOCATION: b', SCHEMA_SIMPLE, 'm1');
    expect(s?.entries).toHaveLength(1);
    expect(s?.entries[0]?.value).toBe('b');
  });

  it('B-10 markdown 前缀剥离后命中', () => {
    expect(parseStatusBlock('- location: tavern', SCHEMA_SIMPLE)?.entries[0]?.value).toBe('tavern');
    expect(parseStatusBlock('* location: tavern', SCHEMA_SIMPLE)?.entries[0]?.value).toBe('tavern');
    expect(parseStatusBlock('> location: tavern', SCHEMA_SIMPLE)?.entries[0]?.value).toBe('tavern');
    expect(parseStatusBlock('# location: tavern', SCHEMA_SIMPLE)?.entries[0]?.value).toBe('tavern');
  });

  it('B-11 值超 200 字符 → 截断', () => {
    const long = 'x'.repeat(250);
    const s = parseStatusBlock(`location: ${long}`, SCHEMA_SIMPLE, 'm1');
    expect(s?.entries[0]?.value).toHaveLength(200);
  });

  it('B-12 字段数超过 maxFields → 截断到上限', () => {
    const schema: StatusSchema = { version: 1, fields: [], maxFields: 2 };
    const s = parseStatusBlock('location: a\ntime: b\nmood: c', schema, 'm1');
    expect(s?.entries).toHaveLength(2);
  });

  it('B-13 多行值 → 取第一行；后续含分隔符的行被当新 key（已知取舍）', () => {
    const s = parseStatusBlock('location: tavern\nmood: happy');
    expect(s?.entries.map((e) => e.key)).toEqual(['location', 'mood']);
  });
});

// ── C. 匹配与 i18n ──

describe('C. 匹配与 i18n', () => {
  it('C-01 大小写与空白归一化命中 location', () => {
    for (const k of ['Location', 'LOCATION', ' location ']) {
      const s = parseStatusBlock(`${k}: tavern`, SCHEMA_SIMPLE, 'm1');
      expect(s?.entries[0]?.key).toBe('location');
    }
  });

  it('C-02 下划线/连字符/空格变体 → 子串命中 location', () => {
    for (const k of ['current_location', 'current-location', 'Current Location']) {
      const s = parseStatusBlock(`${k}: tavern`, SCHEMA_SIMPLE, 'm1');
      expect(s?.entries[0]?.key).toBe('location');
    }
  });

  it('C-03 schema aliases 命中', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [{ key: 'location', aliases: ['place'] }],
    };
    const s = parseStatusBlock('place: tavern', schema, 'm1');
    expect(s?.entries[0]?.key).toBe('location');
  });

  it('C-04 未知 key + show → 降级展示，unknownCount=1', () => {
    const s = parseStatusBlock('foobar: 1', SCHEMA_SIMPLE, 'm1');
    expect(s?.entries).toHaveLength(1);
    expect(s?.entries[0]?.label).toBe('foobar');
    expect(s?.unknownCount).toBe(1);
  });

  it('C-05 未知 key + hide → 丢弃', () => {
    const schema: StatusSchema = { ...SCHEMA_SIMPLE, unknownKeyPolicy: 'hide' };
    expect(parseStatusBlock('foobar: 1', schema, 'm1')).toBeNull();
  });

  it('C-06 中文 key 不命中内置表，但按 show 原样透传展示名（不丢失）', () => {
    const s = parseStatusBlock('地点: 酒馆', SCHEMA_SIMPLE, 'm1');
    expect(s?.entries[0]?.key).toBe('地点');
    expect(s?.entries[0]?.label).toBe('地点');
    expect(s?.entries[0]?.value).toBe('酒馆');
    expect(s?.entries[0]?.icon).toBeUndefined();
    expect(s?.unknownCount).toBe(1);
  });

  it('C-07 schema 精确优先于内置表（同名 key 用 schema 的 label/icon）', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [{ key: 'location', label: '所在位置', icon: 'star' }],
    };
    const s = parseStatusBlock('location: tavern', schema, 'm1');
    expect(s?.entries[0]?.label).toBe('所在位置');
    expect(s?.entries[0]?.icon).toBe('star');
  });

  it('C-08 show:false 字段不进 entries', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [{ key: 'location', show: false }, { key: 'mood' }],
    };
    const s = parseStatusBlock('location: tavern\nmood: happy', schema, 'm1');
    expect(s?.entries.map((e) => e.key)).toEqual(['mood']);
  });

  it('C-09 order 排序生效', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [
        { key: 'mood', order: 2 },
        { key: 'location', order: 1 },
        { key: 'time', order: 3 },
      ],
    };
    const s = parseStatusBlock('mood: happy\nlocation: tavern\ntime: night', schema, 'm1');
    expect(s?.entries.map((e) => e.key)).toEqual(['location', 'mood', 'time']);
  });

  it('内置字段展示名走 i18n（zh=地点 / en=Location）', () => {
    expect(parseStatusBlock('location: tavern')?.entries[0]?.label).toBe('地点');
    initLocale('en');
    expect(parseStatusBlock('location: tavern')?.entries[0]?.label).toBe('Location');
    initLocale('zh');
  });

  it('number 型给了非数字 → 降级 string 且不写 raw', () => {
    const s = parseStatusBlock('affection: 很高', SCHEMA_SIMPLE, 'm1');
    expect(s?.entries[0]?.value).toBe('很高');
    expect(s?.entries[0]?.raw).toBeUndefined();
  });

  it('enum 值不在 options 里 → 仍显示（不静默丢弃）', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [{ key: 'mood', type: 'enum', options: ['happy', 'sad'] }],
    };
    const s = parseStatusBlock('mood: angry', schema, 'm1');
    expect(s?.entries[0]?.value).toBe('angry');
  });
});

// ── D. 流式与幂等 ──

describe('D. 流式与幂等', () => {
  it('D-01 标签跨 chunk 撕裂（逐字符切分）', () => {
    const text = '正文<status>location: tavern</status>尾巴';
    const expected = parseStatusComplete(text);
    for (let n = 1; n <= text.length; n++) {
      const got = streamParse(chunkify(text, n));
      expect(got.content, `n=${n}`).toBe(expected.content);
      expect(got.statusRaw, `n=${n}`).toBe(expected.statusRaw);
    }
  });

  it('D-02 UTF-8 / emoji 代理对跨 chunk 截断重建', () => {
    const text = '正文 😀🎉 <status>location: 酒馆🍺</status>尾巴';
    const expected = parseStatusComplete(text);
    for (let n = 1; n <= text.length; n++) {
      const got = streamParse(chunkify(text, n));
      expect(got.content, `n=${n}`).toBe(expected.content);
      expect(got.statusRaw, `n=${n}`).toBe(expected.statusRaw);
    }
    expect(parseStatusBlock(expected.statusRaw, SCHEMA_SIMPLE, 'm1')?.entries[0]?.value).toBe(
      '酒馆🍺'
    );
  });

  it('D-03 幂等不变量：随机切分下流式累积恒等于一次性解析', () => {
    const corpora = [
      '正文<status>{"location":"tavern","affection":7}</status>',
      '<status>location: tavern</status>正文',
      '前<status>location: a</status>中<status>location: b</status>后',
      '无状态块的普通回复 😀',
      '正文<status>未闭合的状态块',
      '😀<status>mood: 开心</status>🎉',
    ];
    for (const text of corpora) {
      const expected = parseStatusComplete(text);
      for (let seed = 1; seed <= 20; seed++) {
        const rand = mulberry32(seed);
        const chunks = randomChunks(text, 1 + Math.floor(rand() * 12), rand);
        const got = streamParse(chunks.length > 0 ? chunks : [text]);
        expect(got.content, `corpus=${text} seed=${seed}`).toBe(expected.content);
        expect(got.statusRaw, `corpus=${text} seed=${seed}`).toBe(expected.statusRaw);
      }
    }
  });

  it('D-04 flush() 重复调用幂等（未闭合残留只在首次 flush 归正文）', () => {
    const sp = createStatusSplitter();
    sp.feed('正文<status>location: tavern');
    const first = sp.flush();
    const second = sp.flush();
    expect(first.textDelta).toBe('location: tavern');
    expect(first.thinkingDelta).toBe('');
    expect(second.textDelta).toBe('');
    expect(second.thinkingDelta).toBe('');
  });

  it('D-05 多组状态块 → 后者覆盖前者', () => {
    let status: CharacterStatus | null = null;
    const sp = createStatusSplitter();
    const chunks = chunkify('a<status>location: x</status>b<status>location: y</status>', 3);
    for (const c of chunks) {
      const d = sp.feed(c);
      if (d.thinkingDelta) status = parseStatusBlock(d.thinkingDelta, SCHEMA_SIMPLE, 'm1');
    }
    const tail = sp.flush();
    if (tail.thinkingDelta) status = parseStatusBlock(tail.thinkingDelta, SCHEMA_SIMPLE, 'm1');
    expect(status?.entries[0]?.value).toBe('y');
  });

  it('未闭合时流式结束残留归正文（content 完整可见）', () => {
    const text = '正文<status>location: tavern';
    const got = streamParse(chunkify(text, 4));
    expect(got.statusRaw).toBe('');
    expect(got.content).toContain('location: tavern');
  });
});

// ── E. 与思维链共存 ──

describe('E. 与思维链共存', () => {
  it('E-28 状态块写在 <think> 内 → 不提取（已知取舍）', () => {
    // 第一级 ThinkingSplitter 已把整段 <think> 剥走，第二级看不到 <status>
    const inner = '<think>想一下<status>location: x</status></think>正文';
    const t1 = parseThinkingComplete(inner);
    expect(t1.thinking).toContain('<status>');
    const t2 = parseStatusComplete(t1.content);
    expect(t2.hasStatus).toBe(false);
    expect(parseStatusBlock(t2.statusRaw, SCHEMA_SIMPLE, 'm1')).toBeNull();
  });

  it('E-29 <think>…</think>正文<status>…</status> → 三者正确分离', () => {
    const raw = '<think>我在想</think>正文<status>location: tavern</status>';
    const t1 = parseThinkingComplete(raw);
    expect(t1.thinking).toBe('我在想');
    const t2 = parseStatusComplete(t1.content);
    expect(t2.content).toBe('正文');
    expect(parseStatusBlock(t2.statusRaw, SCHEMA_SIMPLE, 'm1')?.entries[0]?.value).toBe('tavern');
  });

  it('E-30 只有状态无思考 → 正常', () => {
    const text = '正文<status>location: tavern</status>';
    const r = parseStatusComplete(text);
    expect(r.content).toBe('正文');
    expect(parseStatusBlock(r.statusRaw, SCHEMA_SIMPLE, 'm1')?.entries).toHaveLength(1);
  });

  it('E-31 只有思考无状态 → status 为 null', () => {
    const t1 = parseThinkingComplete('<think>只想不写状态</think>正文');
    const t2 = parseStatusComplete(t1.content);
    expect(t2.hasStatus).toBe(false);
    expect(parseStatusBlock(t2.statusRaw, SCHEMA_SIMPLE, 'm1')).toBeNull();
  });
});

// ── F. 性能与安全 ──

describe('F. 性能与安全', () => {
  it('F-01 1 万字符状态块解析 < 50ms', () => {
    const big = `location: ${'x'.repeat(10000)}`;
    const started = Date.now();
    parseStatusBlock(big, SCHEMA_SIMPLE, 'm1');
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('F-02 XSS 值原样作为字符串存储（渲染层另测 DOM）', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const s = parseStatusBlock(`location: ${evil}`, SCHEMA_SIMPLE, 'm1');
    expect(s?.entries[0]?.value).toBe(evil);
    expect(typeof s?.entries[0]?.value).toBe('string');
  });

  it('F-03 resolveLatestStatus([]) → null', () => {
    expect(resolveLatestStatus([])).toBeNull();
  });

  it('F-04 carryForward=true 跨消息回溯；=false 只认最后一条', () => {
    const mk = (id: string, status: CharacterStatus | null) => ({ id, status });
    const s1: CharacterStatus = {
      messageId: 'm1',
      parseMode: 'json',
      unknownCount: 0,
      entries: [
        { key: 'affection', label: '好感', value: '7' },
        { key: 'location', label: '地点', value: 'tavern' },
      ],
    };
    const s2: CharacterStatus = {
      messageId: 'm2',
      parseMode: 'json',
      unknownCount: 0,
      entries: [{ key: 'location', label: '地点', value: 'street' }],
    };
    const schema: StatusSchema = {
      version: 1,
      fields: [
        { key: 'affection', carryForward: true },
        { key: 'location', carryForward: true },
      ],
    };
    const carried = resolveLatestStatus([mk('m1', s1), mk('m2', s2)], schema);
    expect(carried?.entries.find((e) => e.key === 'affection')?.value).toBe('7');
    expect(carried?.entries.find((e) => e.key === 'location')?.value).toBe('street');

    const noCarry: StatusSchema = {
      version: 1,
      fields: [{ key: 'affection', carryForward: false }, { key: 'location' }],
    };
    const latestOnly = resolveLatestStatus([mk('m1', s1), mk('m2', s2)], noCarry);
    expect(latestOnly?.entries.find((e) => e.key === 'affection')).toBeUndefined();
    expect(latestOnly?.entries.find((e) => e.key === 'location')?.value).toBe('street');
  });

  it('F-05 群聊按 characterId 过滤后调用 → 各成员独立快照', () => {
    const all = [
      {
        id: 'g1',
        characterId: 'a',
        status: {
          messageId: 'g1',
          parseMode: 'json' as const,
          unknownCount: 0,
          entries: [{ key: 'mood', label: '心情', value: 'happy' }],
        },
      },
      {
        id: 'g2',
        characterId: 'b',
        status: {
          messageId: 'g2',
          parseMode: 'json' as const,
          unknownCount: 0,
          entries: [{ key: 'mood', label: '心情', value: 'angry' }],
        },
      },
    ];
    expect(resolveLatestStatus(all.filter((m) => m.characterId === 'a'))?.entries[0]?.value).toBe(
      'happy'
    );
    expect(resolveLatestStatus(all.filter((m) => m.characterId === 'b'))?.entries[0]?.value).toBe(
      'angry'
    );
  });

  it('resolveLatestStatus 无非空 status 的消息 → null', () => {
    expect(resolveLatestStatus([{ id: 'm1' }, { id: 'm2', status: null }])).toBeNull();
  });
});
