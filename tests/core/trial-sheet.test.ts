/**
 * 首聊验收记录（core/trial-sheet.ts）——纯数据层的单测
 *
 * 这些函数撑的是"五个人的试用数据能原样导出、坏行不会让整张表打不开"。
 * 导出格式里的表头由调用方传（走 i18n），所以这里只验结构、转义与容错。
 */
import { describe, it, expect } from 'vitest';
import {
  TRIAL_MAX_RECORDS,
  appendTrialRecord,
  makeTrialRecord,
  parseTrialRecords,
  toTrialCsv,
  toTrialJson,
  type TrialRecord,
} from '@core/trial-sheet';

function rec(overrides: Partial<TrialRecord> = {}): TrialRecord {
  return {
    id: 'r1',
    recordedAt: '2026-10-27T10:00:00.000Z',
    participant: 'P1',
    verdict: 'ok',
    blockedStep: '',
    notes: '',
    appReadyMs: 393,
    ttftLastMs: 900,
    ttftAvgMs: 950,
    ttftCount: 2,
    model: 'gpt-4o-mini',
    provider: 'openai',
    platform: 'Win32',
    viewport: '1280×800',
    ...overrides,
  };
}

describe('parseTrialRecords 容错', () => {
  it('空值与坏 JSON 都返回空数组，不抛', () => {
    expect(parseTrialRecords(null)).toEqual([]);
    expect(parseTrialRecords('')).toEqual([]);
    expect(parseTrialRecords('{not json')).toEqual([]);
    expect(parseTrialRecords('{"a":1}')).toEqual([]);
  });

  it('坏行丢掉、好行留下（缺 id / 缺时间 / 结论不认识）', () => {
    const raw = JSON.stringify([
      rec(),
      { ...rec(), id: '' },
      { ...rec(), recordedAt: '' },
      { ...rec(), verdict: 'weird' },
      { ...rec(), id: 'r2', participant: 'P2', verdict: 'blocked', blockedStep: 'send' },
    ]);
    const out = parseTrialRecords(raw);
    expect(out.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(out[1]!.blockedStep).toBe('send');
  });

  it('数字字段坏值归一成 null / 0，文本字段坏值归一成空串', () => {
    const raw = JSON.stringify([
      { ...rec(), appReadyMs: 'fast', ttftLastMs: Number.NaN, ttftAvgMs: null, ttftCount: 'x', model: 42 },
    ]);
    const [r] = parseTrialRecords(raw);
    expect(r).toMatchObject({ appReadyMs: null, ttftLastMs: null, ttftAvgMs: null, ttftCount: 0, model: '' });
  });
});

describe('appendTrialRecord 有上限', () => {
  it('超出上限时丢最早的，保留最新的一段', () => {
    let list: TrialRecord[] = [];
    for (let i = 0; i < TRIAL_MAX_RECORDS + 3; i++) {
      list = appendTrialRecord(list, rec({ id: `r${i}` }));
    }
    expect(list).toHaveLength(TRIAL_MAX_RECORDS);
    expect(list[0]!.id).toBe('r3');
    expect(list[list.length - 1]!.id).toBe(`r${TRIAL_MAX_RECORDS + 2}`);
  });

  it('可传入更小的上限（便于测试与将来按型号调）', () => {
    let list: TrialRecord[] = [];
    for (let i = 0; i < 4; i++) list = appendTrialRecord(list, rec({ id: `r${i}` }), 2);
    expect(list.map((r) => r.id)).toEqual(['r2', 'r3']);
  });
});

describe('makeTrialRecord', () => {
  it('结论为 ok 时清空卡住步骤，文本字段两端去空白', () => {
    const r = makeTrialRecord(
      { participant: '  P3 ', verdict: 'ok', blockedStep: 'send', notes: '  一切正常  ' },
      { id: 'fixed', now: new Date('2026-10-27T10:00:00.000Z') },
    );
    expect(r).toMatchObject({
      id: 'fixed',
      recordedAt: '2026-10-27T10:00:00.000Z',
      participant: 'P3',
      blockedStep: '',
      notes: '一切正常',
    });
  });

  it('非 ok 结论保留卡住步骤', () => {
    const r = makeTrialRecord({ participant: 'P4', verdict: 'blocked', blockedStep: 'firstToken' }, { id: 'x' });
    expect(r.blockedStep).toBe('firstToken');
  });

  it('缺省的计量字段落成 null / 0，而不是 undefined', () => {
    const r = makeTrialRecord({ participant: 'P5', verdict: 'gaveUp' }, { id: 'y' });
    expect(r.appReadyMs).toBeNull();
    expect(r.ttftLastMs).toBeNull();
    expect(r.ttftAvgMs).toBeNull();
    expect(r.ttftCount).toBe(0);
  });

  it('NaN 的耗时会被拦下（避免把 NaN 写进导出文件）', () => {
    expect(() => makeTrialRecord({ participant: 'P6', verdict: 'ok', appReadyMs: Number.NaN }, { id: 'z' })).toThrow();
  });
});

describe('导出格式', () => {
  const header = { time: '时间', participant: '参与者', verdict: '结论', step: '步骤', ttft: '平均首字', notes: '备注' };

  it('CSV 带 BOM、CRLF 行尾，并按参数写表头', () => {
    const csv = toTrialCsv([rec()], header);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('时间,参与者,结论,步骤,平均首字,备注');
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('CSV 转义逗号、引号与换行；空测速留空单元格', () => {
    const csv = toTrialCsv(
      [rec({ notes: '卡住，因为"提示"不见了\n重启也没用', ttftAvgMs: null })],
      header,
    );
    const line = csv.split('\r\n')[1]!;
    expect(line).toContain('"卡住，因为""提示""不见了\n重启也没用"');
    // 结论 ok ⇒ 步骤列为空；ttftAvgMs 为 null ⇒ 测速列也空 ⇒ 中间连着三个逗号
    expect(line).toContain('.000Z,P1,ok,,,');
  });

  it('JSON 带导出时间与条数，记录原样在内', () => {
    const json = JSON.parse(toTrialJson([rec(), rec({ id: 'r2' })])) as {
      exportedAt: string;
      count: number;
      records: TrialRecord[];
    };
    expect(json.count).toBe(2);
    expect(json.records.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(Number.isNaN(Date.parse(json.exportedAt))).toBe(false);
  });
});
