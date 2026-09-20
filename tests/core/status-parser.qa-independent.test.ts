/**
 * P1 状态块解析器 —— QA 独立验证（不复用工程师的 tests/core/status-parser.test.ts）
 *
 * 重点（主理人指定的验证清单）：
 * A 值内含分隔符（竞品 Tifa-Deepsex 的栽点）
 * B 三级降级（JSON → 按行 → 放弃）
 * C 流式撕裂与幂等不变量
 * D 与思维链共存（含 <status> 嵌在 <think> 内）
 * E unknownKeyPolicy / maxFields 截断
 * F 边界（空块/空白/重复 key/大小写/别名）
 * G 展示名优先级与英文 key 匹配红线
 * H 提示词注入英文 key 的往返一致性
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStatusSplitter,
  parseStatusBlock,
  parseStatusComplete,
  resolveLatestStatus,
} from '@core/status-parser';
import {
  STATUS_FIELD_REGISTRY,
  STATUS_ICON_NAMES,
  findRegistryPreset,
} from '@core/status-schema';
import { getIconPath } from '@/components/common/icons';
import { ThinkingSplitter } from '@core/thinking-parser';
import { buildStatusInstruction } from '@core/status-prompt';
import type { CharacterStatus, StatusSchema } from '@core/status-schema';
import { initLocale, setLocale } from '@/i18n';

/** 走一遍流式：feed 全部 chunk + flush */
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

/** 可复现伪随机 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 取 entries 里某个 key 的 value */
function valOf(st: CharacterStatus | null, key: string): string | undefined {
  return st?.entries.find((e) => e.key === key)?.value;
}

/** 构造 N 个未知字段的按行块（用于 maxFields 截断） */
function manyLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `k${i}: v${i}`).join('\n');
}

beforeEach(() => {
  initLocale('zh');
});

// ── A. 值内含分隔符 ──

describe('A. 值内含分隔符（竞品栽点）', () => {
  it('A-1 JSON 值含半角冒号：time=18:30', () => {
    const st = parseStatusBlock('{"time":"18:30"}');
    expect(valOf(st, 'time')).toBe('18:30');
  });

  it('A-2 按行 time: 18:30 → 值保留 18:30（不被截断成 18）', () => {
    const st = parseStatusBlock('time: 18:30');
    expect(st?.parseMode).toBe('lines');
    expect(valOf(st, 'time')).toBe('18:30');
  });

  it('A-3 按行 location: 咖啡厅: 二楼 → 值保留 咖啡厅: 二楼', () => {
    const st = parseStatusBlock('location: 咖啡厅: 二楼');
    expect(valOf(st, 'location')).toBe('咖啡厅: 二楼');
  });

  it('A-4 全角冒号分隔 + 半角值：time：18:30', () => {
    const st = parseStatusBlock('time：18:30');
    expect(valOf(st, 'time')).toBe('18:30');
  });

  it('A-5 全角冒号分隔 + 全角值：location：咖啡厅：二楼', () => {
    const st = parseStatusBlock('location：咖啡厅：二楼');
    expect(valOf(st, 'location')).toBe('咖啡厅：二楼');
  });

  it('A-6 半角分隔 + 全角值：location: 咖啡厅：二楼', () => {
    const st = parseStatusBlock('location: 咖啡厅：二楼');
    expect(valOf(st, 'location')).toBe('咖啡厅：二楼');
  });

  it('A-7 多个半角冒号：time: 18:30:45', () => {
    expect(valOf(parseStatusBlock('time: 18:30:45'), 'time')).toBe('18:30:45');
  });

  it('A-8 URL 形态值不被切断：location: https://a.example/x', () => {
    expect(valOf(parseStatusBlock('location: https://a.example/x'), 'location')).toBe(
      'https://a.example/x'
    );
  });

  it('A-9 先出现的分隔符优先：k：a:b → key=k / value=a:b', () => {
    const st = parseStatusBlock('k：a:b');
    expect(st?.entries[0]?.key).toBe('k');
    expect(st?.entries[0]?.value).toBe('a:b');
  });

  it('A-10 半角先于全角：k:a：b → key=k / value=a：b', () => {
    const st = parseStatusBlock('k:a：b');
    expect(st?.entries[0]?.key).toBe('k');
    expect(st?.entries[0]?.value).toBe('a：b');
  });

  it('A-11 分隔符在行首（无 key）→ 该行跳过，不产生空 key', () => {
    const st = parseStatusBlock(': 只有值没有键\nlocation: 酒馆');
    expect(st?.entries.length).toBe(1);
    expect(valOf(st, 'location')).toBe('酒馆');
  });
});

// ── B. 三级降级 ──

describe('B. 三级降级（JSON → 按行 → 放弃）', () => {
  it('B-1 合法 JSON → parseMode=json', () => {
    const st = parseStatusBlock('{"location":"酒馆","affection":75}');
    expect(st?.parseMode).toBe('json');
    expect(valOf(st, 'location')).toBe('酒馆');
    expect(st?.entries.find((e) => e.key === 'affection')?.raw).toBe(75);
  });

  it('B-2 JSON 外包裹 markdown 围栏 → 仍走 json 模式', () => {
    const st = parseStatusBlock('```json\n{"location":"酒馆"}\n```');
    expect(st?.parseMode).toBe('json');
    expect(valOf(st, 'location')).toBe('酒馆');
  });

  it('B-3 JSON 语法错误（key 未加引号）→ 降级按行，不抛错', () => {
    const st = parseStatusBlock('{location: 酒馆, time: 傍晚}');
    expect(st).not.toBeNull();
    expect(st?.parseMode).toBe('lines');
    // 已知取舍：单行多键值对 JSON-like 文本降级为一条（后续 key 粘进 value），
    // 硬约束是"绝不崩 / 绝不丢"，不是"必须拆对"。此处固化该行为。
    expect(st?.entries.length).toBe(1);
    expect(st?.entries[0]?.key).toBe('location');
    expect(st?.entries[0]?.value).toContain('酒馆');
  });

  it('B-3b 多行 JSON-like（每行一对）→ 按行降级可正确拆出多对', () => {
    const st = parseStatusBlock('location: 酒馆\ntime: 傍晚\nmood: 愉悦');
    expect(st?.entries.length).toBe(3);
    expect(valOf(st, 'location')).toBe('酒馆');
    expect(valOf(st, 'time')).toBe('傍晚');
    expect(valOf(st, 'mood')).toBe('愉悦');
  });

  it('B-4 JSON 截断（缺右花括号）→ 降级按行且不崩', () => {
    const st = parseStatusBlock('{"location": "酒馆"\n"time": "傍晚"');
    expect(st).not.toBeNull();
    expect(st?.entries.length).toBeGreaterThan(0);
  });

  it('B-5 完全无法解析（无任何分隔符）→ 放弃，返回 null', () => {
    expect(parseStatusBlock('这是一段没有任何键值结构的纯文本')).toBeNull();
  });

  it('B-6 放弃时正文不丢：剥离后的 content 原样保留', () => {
    const text = '正文。<status>这是一段没有任何键值结构的纯文本</status>';
    const r = parseStatusComplete(text);
    expect(r.hasStatus).toBe(true);
    // 解析放弃 ≠ 内容丢失：状态块原文由 parseStatusBlock 判定为 null，
    // 但本用例验证的是"剥离器绝不吞正文"
    expect(r.content).toBe('正文。');
    expect(parseStatusBlock(r.statusRaw)).toBeNull();
  });

  it('B-7 JSON 数组 → 非 plain object，降级按行', () => {
    const st = parseStatusBlock('["location","time"]');
    // 数组不是对象 → parseAiJson 返回 null → 按行切分（无分隔符 → 放弃）
    expect(st).toBeNull();
  });

  it('B-8 JSON 值为 null → 该字段跳过', () => {
    const st = parseStatusBlock('{"location":null,"time":"傍晚"}');
    expect(st?.entries.length).toBe(1);
    expect(valOf(st, 'time')).toBe('傍晚');
  });

  it('B-9 JSON 值为对象 → JSON.stringify 后作为字符串', () => {
    const st = parseStatusBlock('{"inventory":{"weapon":"匕首","potion":2}}');
    expect(valOf(st, 'inventory')).toBe('{"weapon":"匕首","potion":2}');
  });
});

// ── C. 流式撕裂与幂等 ──

describe('C. 流式撕裂与幂等', () => {
  it('C-1 开标签跨 chunk 撕裂：<sta | tus>…', () => {
    const r = streamParse(['正文<sta', 'tus>{"location":"酒馆"}', '</sta', 'tus>']);
    expect(r.content).toBe('正文');
    expect(r.statusRaw).toBe('{"location":"酒馆"}');
    expect(valOf(parseStatusBlock(r.statusRaw), 'location')).toBe('酒馆');
  });

  it('C-2 闭标签跨 chunk 撕裂', () => {
    const r = streamParse(['正文<status>location: 酒馆</stat', 'us>']);
    expect(r.content).toBe('正文');
    expect(valOf(parseStatusBlock(r.statusRaw), 'location')).toBe('酒馆');
  });

  it('C-3 逐字符到达 → 与一次性解析恒等', () => {
    const text = '你好呀<status>{"location":"酒馆","time":"18:30"}</status>尾巴';
    const r = streamParse(Array.from(text));
    const once = parseStatusComplete(text);
    expect(r.content).toBe(once.content);
    expect(r.statusRaw).toBe(once.statusRaw);
  });

  it('C-4 未闭合残留归正文（标签剥离但内容不丢）', () => {
    const r = streamParse(['开头<sta', 'tus>location: 酒馆']);
    // 未闭合 → 状态桶为空（归正文），残留**内容**一字不落留在正文里
    expect(r.statusRaw).toBe('');
    expect(r.content).toBe('开头location: 酒馆');
    expect(r.content).toContain('location: 酒馆');
    expect(r.content).not.toContain('<status>');
  });

  it('C-5 emoji 与 CJK 混合跨 chunk 不产生乱码', () => {
    const text = '🌙 夜<status>{"mood":"安心😌"}</status>';
    const r = streamParse([text.slice(0, 12), text.slice(12)]);
    const once = parseStatusComplete(text);
    expect(r.content).toBe(once.content);
    expect(r.statusRaw).toBe(once.statusRaw);
  });

  it('C-6 幂等不变量：60 组随机切分下流式累积恒等于一次性解析', () => {
    const samples = [
      '正文 A<status>{"location":"酒馆","time":"18:30"}</status>尾巴',
      'Ragged<status>location: 酒馆</status>mid<status>{"time":"19:00"}</status>',
      '未闭合<status>location: 酒馆',
      '无状态块的纯文本，含 emoji ✨ 与 CJK。',
      '<status>{"affection":80}</status>',
      'a<status></status>b',
    ];
    const rand = mulberry32(20260920);
    for (const text of samples) {
      const once = parseStatusComplete(text);
      for (let i = 0; i < 60; i++) {
        const cuts = new Set<number>();
        const n = 1 + Math.floor(rand() * 8);
        for (let k = 0; k < n; k++) cuts.add(1 + Math.floor(rand() * (text.length - 1)));
        const points = [0, ...Array.from(cuts).sort((a, b) => a - b), text.length];
        const chunks: string[] = [];
        for (let p = 0; p < points.length - 1; p++) {
          const seg = text.slice(points[p]!, points[p + 1]!);
          if (seg !== '') chunks.push(seg);
        }
        const r = streamParse(chunks);
        expect(r.content).toBe(once.content);
        expect(r.statusRaw).toBe(once.statusRaw);
      }
    }
  });

  it('C-7 多块分 chunk 到达 → 按编排层语义（逐块 pushStatus）后者覆盖前者', () => {
    const chunks = [
      '<status>{"location":"酒馆"}</status>',
      '<status>{"location":"城门口"}</status>',
    ];
    let latest: CharacterStatus | null = null;
    const sp = createStatusSplitter();
    for (const c of chunks) {
      const d = sp.feed(c);
      if (d.thinkingDelta) latest = parseStatusBlock(d.thinkingDelta);
    }
    const tail = sp.flush();
    if (tail.thinkingDelta) latest = parseStatusBlock(tail.thinkingDelta);
    expect(valOf(latest, 'location')).toBe('城门口');
  });

  it('C-8 两块在同一 chunk 内闭合（已知限制，见 QA 报告风险 R3）→ 硬约束仍成立：不抛错、正文不丢', () => {
    const text = '正文<status>{"location":"酒馆"}</status><status>{"location":"城门口"}</status>尾';
    const sp = createStatusSplitter();
    const d = sp.feed(text);
    const tail = sp.flush();
    expect(d.textDelta + tail.textDelta).toBe('正文尾');
    // 两块原文被直接拼接后只能降级为一条（展示串味）——不崩、不丢是硬约束
    expect(() => parseStatusBlock(d.thinkingDelta + tail.thinkingDelta)).not.toThrow();
    expect(parseStatusBlock(d.thinkingDelta + tail.thinkingDelta)).not.toBeNull();
  });
});

// ── D. 与思维链共存 ──

describe('D. 与思维链共存', () => {
  it('D-1 <status> 写在 <think> 内 → 不提取（决策 6）', () => {
    // 严格走编排层顺序：ThinkingSplitter 先剥 <think>，其 textDelta 再喂 StatusSplitter
    const text = '<think>让我看看<status>{"location":"酒馆"}</status>好了</think>正文';
    const thinkSp = new ThinkingSplitter();
    const td = thinkSp.feed(text);
    const thinkTail = thinkSp.flush();
    const afterThink = td.textDelta + thinkTail.textDelta;
    expect(afterThink).toBe('正文');
    const r = parseStatusComplete(afterThink);
    expect(r.hasStatus).toBe(false);
    expect(parseStatusBlock(r.statusRaw)).toBeNull();
  });

  it('D-2 <think> 与 <status> 并存（status 在 think 之后）→ 正确分流', () => {
    const text = '<think>思考</think>正文<status>{"location":"酒馆"}</status>';
    const thinkSp = new ThinkingSplitter();
    const td = thinkSp.feed(text);
    const thinkTail = thinkSp.flush();
    expect(td.thinkingDelta + thinkTail.thinkingDelta).toBe('思考');
    const r = parseStatusComplete(td.textDelta + thinkTail.textDelta);
    expect(r.content).toBe('正文');
    expect(valOf(parseStatusBlock(r.statusRaw), 'location')).toBe('酒馆');
  });

  it('D-3 只有 <think> 无 <status> → 状态为 null 且正文完整', () => {
    const text = '<think>思考</think>只有正文';
    const thinkSp = new ThinkingSplitter();
    const td = thinkSp.feed(text);
    const thinkTail = thinkSp.flush();
    const r = parseStatusComplete(td.textDelta + thinkTail.textDelta);
    expect(r.hasStatus).toBe(false);
    expect(r.content).toBe('只有正文');
    expect(parseStatusBlock(r.statusRaw)).toBeNull();
  });

  it('D-4 状态块内含 </think> 字面量不影响状态解析', () => {
    const st = parseStatusBlock('{"thought":"我在想 </think> 这件事"}');
    expect(valOf(st, 'thought')).toBe('我在想 </think> 这件事');
  });
});

// ── E. unknownKeyPolicy / maxFields ──

describe('E. unknownKeyPolicy 与 maxFields', () => {
  const SCHEMA_HIDE: StatusSchema = {
    version: 1,
    fields: [{ key: 'location' }],
    unknownKeyPolicy: 'hide',
  };
  const SCHEMA_SHOW: StatusSchema = {
    version: 1,
    fields: [{ key: 'location' }],
    unknownKeyPolicy: 'show',
  };

  it('E-1 show（缺省）→ 未知字段降级展示且计入 unknownCount', () => {
    const st = parseStatusBlock('location: 酒馆\n天气: 晴', SCHEMA_SHOW);
    expect(st?.entries.length).toBe(2);
    expect(st?.unknownCount).toBe(1);
  });

  it('E-2 hide → 未知字段被丢弃', () => {
    const st = parseStatusBlock('location: 酒馆\n天气: 晴', SCHEMA_HIDE);
    expect(st?.entries.length).toBe(1);
    expect(st?.unknownCount).toBe(0);
  });

  it('E-3 无 schema 时缺省 show（渐进增强）', () => {
    const st = parseStatusBlock('天气: 晴');
    expect(st?.entries.length).toBe(1);
    expect(st?.unknownCount).toBe(1);
  });

  it('E-4 未知字段的 label 用模型原始 key（不丢语义）', () => {
    const st = parseStatusBlock('天氣: 晴');
    expect(st?.entries[0]?.label).toBe('天氣');
    expect(st?.entries[0]?.icon).toBeUndefined();
  });

  it('E-5 缺省 maxFields=12：15 个字段被截断到 12', () => {
    const st = parseStatusBlock(manyLines(15));
    expect(st?.entries.length).toBe(12);
  });

  it('E-6 schema.maxFields=3 生效', () => {
    const st = parseStatusBlock(manyLines(10), { version: 1, fields: [], maxFields: 3 });
    expect(st?.entries.length).toBe(3);
  });

  it('E-7 maxFields 非法值（0 / 负数 / NaN）→ 回退到 12', () => {
    expect(parseStatusBlock(manyLines(15), { version: 1, fields: [], maxFields: 0 })?.entries.length).toBe(12);
    expect(parseStatusBlock(manyLines(15), { version: 1, fields: [], maxFields: -5 })?.entries.length).toBe(12);
    expect(parseStatusBlock(manyLines(15), { version: 1, fields: [], maxFields: Number.NaN })?.entries.length).toBe(12);
  });

  it('E-8 值超 200 字符 → 截断到 200', () => {
    const st = parseStatusBlock(`location: ${'x'.repeat(500)}`);
    expect(valOf(st, 'location')?.length).toBe(200);
  });
});

// ── F. 边界 ──

describe('F. 边界', () => {
  it('F-1 空块 → null', () => {
    expect(parseStatusBlock('')).toBeNull();
  });

  it('F-2 只含空白 → null', () => {
    expect(parseStatusBlock('   \n\t  \n ')).toBeNull();
  });

  it('F-3 非字符串输入 → null（不抛错）', () => {
    expect(parseStatusBlock(undefined as unknown as string)).toBeNull();
    expect(parseStatusBlock(123 as unknown as string)).toBeNull();
  });

  it('F-4 重复 key → 后者覆盖前者且 entries 内不重复', () => {
    const st = parseStatusBlock('location: 酒馆\nlocation: 城门口');
    expect(st?.entries.length).toBe(1);
    expect(valOf(st, 'location')).toBe('城门口');
  });

  it('F-5 key 大小写与空白归一化命中', () => {
    expect(valOf(parseStatusBlock('  Location : 酒馆'), 'location')).toBe('酒馆');
    expect(valOf(parseStatusBlock('LOCATION: 酒馆'), 'location')).toBe('酒馆');
    expect(valOf(parseStatusBlock('loca tion: 酒馆'), 'location')).toBe('酒馆');
  });

  it('F-6 下划线/连字符变体命中', () => {
    expect(valOf(parseStatusBlock('{"current_location":"酒馆"}'), 'location')).toBe('酒馆');
    expect(valOf(parseStatusBlock('{"current-location":"酒馆"}'), 'location')).toBe('酒馆');
  });

  it('F-7 schema aliases 命中（含中文别名 → 用户数据通道）', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [{ key: 'location', aliases: ['地点', '所在位置'] }],
    };
    expect(valOf(parseStatusBlock('地点: 酒馆', schema), 'location')).toBe('酒馆');
    expect(valOf(parseStatusBlock('所在位置: 城门口', schema), 'location')).toBe('城门口');
  });

  it('F-8 规范 key 与别名同时出现 → 归一化到同一条（去重）', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [{ key: 'location', aliases: ['place'] }],
    };
    const st = parseStatusBlock('{"location":"酒馆","place":"二楼"}', schema);
    const keys = st?.entries.map((e) => e.key) ?? [];
    expect(new Set(keys).size).toBe(keys.length); // 无重复 key
    expect(st?.entries.length).toBe(1);
  });

  it('F-9 markdown 前缀行命中', () => {
    expect(valOf(parseStatusBlock('- location: 酒馆'), 'location')).toBe('酒馆');
    expect(valOf(parseStatusBlock('> time: 18:30'), 'time')).toBe('18:30');
    expect(valOf(parseStatusBlock('## mood: 愉悦'), 'mood')).toBe('愉悦');
  });

  it('F-10 number 型值解析失败 → 仍展示字符串且不写 raw', () => {
    const st = parseStatusBlock('affection: 很高');
    const e = st?.entries.find((x) => x.key === 'affection');
    expect(e?.value).toBe('很高');
    expect(e?.raw).toBeUndefined();
  });

  it('F-11 show:false 字段不进 entries', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [
        { key: 'location', show: false },
        { key: 'time' },
      ],
    };
    const st = parseStatusBlock('location: 酒馆\ntime: 18:30', schema);
    expect(st?.entries.length).toBe(1);
    expect(valOf(st, 'time')).toBe('18:30');
  });
});

// ── G. 展示名优先级与英文 key 红线 ──

describe('G. 展示名优先级与英文 key 红线', () => {
  it('G-1 无 schema → 内置 i18n（zh=地点 / en=Location）', () => {
    const st = parseStatusBlock('location: 酒馆');
    expect(st?.entries[0]?.label).toBe('地点');
    setLocale('en');
    expect(parseStatusBlock('location: 酒馆')?.entries[0]?.label).toBe('Location');
    setLocale('zh');
  });

  it('G-2 labelI18nKey 优先于角色卡 label', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [{ key: 'location', label: '所在', labelI18nKey: 'status.field.time' }],
    };
    expect(parseStatusBlock('location: 酒馆', schema)?.entries[0]?.label).toBe('时间');
  });

  it('G-3 角色卡 label 优先于内置 i18n', () => {
    const schema: StatusSchema = { version: 1, fields: [{ key: 'location', label: '所在' }] };
    expect(parseStatusBlock('location: 酒馆', schema)?.entries[0]?.label).toBe('所在');
  });

  it('G-4 中文 key 不命中内置表（匹配层只认英文结构化 key）', () => {
    const st = parseStatusBlock('{"地点":"酒馆"}');
    expect(st?.unknownCount).toBe(1);
    expect(st?.entries[0]?.key).toBe('地点');
    expect(st?.entries[0]?.icon).toBeUndefined();
  });

  it('G-5 内置 8 字段的 key 全为 ASCII 小写英文标识符', () => {
    for (const p of STATUS_FIELD_REGISTRY) {
      expect(p.key).toMatch(/^[a-z]+$/);
    }
    expect(STATUS_FIELD_REGISTRY.map((p) => p.key)).toEqual([
      'location',
      'time',
      'affection',
      'identity',
      'relationship',
      'mood',
      'thought',
      'inventory',
    ]);
  });

  it('G-6 决策 11：mood 不配图标（icons.ts 无情绪类图标，不得硬凑 star/heart）', () => {
    expect(findRegistryPreset('mood')?.icon).toBeUndefined();
  });

  it('G-7 非 mood 的内置字段图标来自白名单且非空', () => {
    for (const p of STATUS_FIELD_REGISTRY.filter((x) => x.key !== 'mood')) {
      expect(p.icon, `${p.key} 应有白名单图标`).toBeTruthy();
    }
  });

  it('G-8 防漂移：白名单**全量**图标在 icons.ts 都有真实路径', () => {
    // 比"只校验 registry 用过的图标"更强：STATUS_ICON_NAMES 会喂给 ContextPanel 的
    // 图标下拉（用户可为角色卡字段选 star 等当前无内置字段使用的图标），
    // 因此白名单里每一个名字都必须能在 icons.ts 取到路径 —— 否则改名/删除会静默渲染空图标。
    for (const n of STATUS_ICON_NAMES) {
      expect(getIconPath(n), `白名单图标 ${n} 在 icons.ts 无路径`).not.toBe('');
    }
  });

  it('G-9 防漂移：白名单无重复、且 registry 用到的图标不越界', () => {
    expect(new Set(STATUS_ICON_NAMES).size).toBe(STATUS_ICON_NAMES.length);
    const used = STATUS_FIELD_REGISTRY.map((p) => p.icon).filter((i) => !!i);
    for (const icon of used) {
      expect(STATUS_ICON_NAMES).toContain(icon);
    }
    expect(new Set(used).size).toBe(used.length);
  });

  it('G-10 mood 命中内置表但 icon 为 undefined（宁缺勿滥）', () => {
    const st = parseStatusBlock('mood: 愉悦');
    expect(st?.entries[0]?.key).toBe('mood');
    expect(st?.entries[0]?.icon).toBeUndefined();
    expect(st?.unknownCount).toBe(0); // 仍算命中，不算未知字段
  });
});

// ── H. 提示词注入往返 ──

describe('H. 提示词注入（英文 key 往返一致性）', () => {
  it('H-1 enabled=false → 空串（请求体逐字节不变）', () => {
    expect(buildStatusInstruction(null, false)).toBe('');
    expect(buildStatusInstruction({ version: 1, fields: [{ key: 'location' }] }, false)).toBe('');
  });

  it('H-2 注入文本零 CJK（模型照抄中文 key 会让匹配全落空）', () => {
    const ins = buildStatusInstruction(null, true);
    expect(ins).not.toBe('');
    expect(/[一-鿿]/.test(ins)).toBe(false);
  });

  it('H-3 注入示例覆盖内置 8 字段的英文 key（一个不多一个不少）', () => {
    const ins = buildStatusInstruction(null, true);
    const m = ins.match(/<status>\s*(\{[\s\S]*?\})\s*<\/status>/);
    expect(m).not.toBeNull();
    const example = m![1]!;
    for (const p of STATUS_FIELD_REGISTRY) {
      expect(example, `示例应含 key ${p.key}`).toContain(`"${p.key}"`);
    }
    // 示例里除内置 8 个 key 外不得混入其它标识符
    const keysInExample = [...example.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)].map((x) => x[1]!);
    expect(keysInExample.sort()).toEqual(STATUS_FIELD_REGISTRY.map((p) => p.key).sort());
  });

  it('H-4 有 schema 时只注入 show!==false 的字段', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [
        { key: 'weather', type: 'string' },
        { key: 'hp', type: 'number', show: false },
      ],
    };
    const ins = buildStatusInstruction(schema, true);
    expect(ins).toContain('"weather"');
    expect(ins).not.toContain('"hp"');
  });

  it('H-5 模型照抄注入示例 → 全部命中并产生可用状态', () => {
    const ins = buildStatusInstruction(null, true);
    const example = ins.match(/<status>\s*(\{[\s\S]*?\})\s*<\/status>/)![1]!;
    const filled = example
      .replace(/"<string>"/g, '"酒馆"')
      .replace(/<number>/g, '80');
    const st = parseStatusBlock(filled);
    expect(st?.entries.length).toBe(STATUS_FIELD_REGISTRY.length);
    expect(valOf(st, 'affection')).toBe('80');
    expect(st?.entries.find((e) => e.key === 'affection')?.raw).toBe(80);
  });
});

// ── I. 会话级派生 ──

describe('I. resolveLatestStatus 会话级派生', () => {
  it('I-1 carryForward 默认 true → 跨消息回溯补齐 key', () => {
    const st = resolveLatestStatus([
      { id: 'm1', status: parseStatusBlock('{"location":"酒馆","affection":70}') },
      { id: 'm2', status: parseStatusBlock('{"affection":75}') },
    ]);
    expect(valOf(st, 'location')).toBe('酒馆');
    expect(valOf(st, 'affection')).toBe('75');
  });

  it('I-2 carryForward=false → 只认最后一条有状态的消息', () => {
    const schema: StatusSchema = {
      version: 1,
      fields: [
        { key: 'location', carryForward: false },
        { key: 'affection' },
      ],
    };
    const st = resolveLatestStatus(
      [
        { id: 'm1', status: parseStatusBlock('{"location":"酒馆","affection":70}') },
        { id: 'm2', status: parseStatusBlock('{"affection":75}') },
      ],
      schema
    );
    expect(valOf(st, 'location')).toBeUndefined();
    expect(valOf(st, 'affection')).toBe('75');
  });

  it('I-3 messageId 溯源到最后一条有状态消息（chat store 落库时回填 id）', () => {
    const st = resolveLatestStatus([
      { id: 'm1', status: parseStatusBlock('{"location":"酒馆"}', null, 'm1') },
      { id: 'm2', status: parseStatusBlock('{"location":"城门口"}', null, 'm2') },
    ]);
    expect(st?.messageId).toBe('m2');
  });

  it('I-4 空消息列表 / 全无 status → null', () => {
    expect(resolveLatestStatus([])).toBeNull();
    expect(resolveLatestStatus([{ id: 'm1' }, { id: 'm2', status: null }])).toBeNull();
  });

  it('I-5 entries 被 maxFields 截断', () => {
    const msgs = [{ id: 'm1', status: parseStatusBlock(manyLines(15)) }];
    expect(resolveLatestStatus(msgs)?.entries.length).toBe(12);
  });
});
