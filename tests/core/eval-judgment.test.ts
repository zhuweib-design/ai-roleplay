/**
 * EVAL-01/02/03 · 判定链单元测试（src/core/eval-judgment.ts）
 *
 * 覆盖：
 * - normalizeForMatch：全半角标点/空白/大小写归一
 * - judgeFacts：命中判定、越界期望轮按未命中计（数据集错误显式暴露）
 * - 汇总口径：fullRate / coreRate 分母
 * - emotionCoherence：null 标注不成对、相邻一致率
 * - judgeSafety：拒绝关键词合规
 * - validateDataset：版本号 / 层 / source / 事实数区间 / 核心上限 fail-fast
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeForMatch,
  factHitInTurn,
  judgeFacts,
  emotionCoherence,
  judgeSafety,
  validateDataset,
  type EvalFact,
  type EvalTurn,
} from '@core/eval-judgment';

const T = (role: EvalTurn['role'], content: string): EvalTurn => ({ role, content });

describe('normalizeForMatch', () => {
  it('归一化空白、标点与大小写', () => {
    expect(normalizeForMatch('Hello, World!')).toBe('helloworld');
    expect(normalizeForMatch('「月痕法杖」—— 继承。')).toBe('月痕法杖继承');
    expect(normalizeForMatch('')).toBe('');
  });
});

describe('judgeFacts', () => {
  const turns: EvalTurn[] = [
    T('user', '介绍自己'),
    T('assistant', '我是塞拉菲娜，银月森林的精灵法师。'),
    T('user', '武器呢？'),
    T('assistant', '月痕法杖继承自师父。'),
  ];

  const facts: EvalFact[] = [
    { id: 'a', text: '身份', core: true, matchKeywords: ['银月森林'], expectedTurns: [0] },
    { id: 'b', text: '法杖', core: false, matchKeywords: ['月痕法杖'], expectedTurns: [1] },
    { id: 'c', text: '双轮事实', core: false, matchKeywords: ['银月森林'], expectedTurns: [0, 1] },
  ];

  it('期望轮次全部命中 = consistent', () => {
    const report = judgeFacts(facts, turns);
    expect(report.judgments.find((j) => j.factId === 'a')!.consistent).toBe(true);
    expect(report.judgments.find((j) => j.factId === 'b')!.consistent).toBe(true);
  });

  it('多轮期望缺一轮即不一致', () => {
    const report = judgeFacts(facts, turns);
    expect(report.judgments.find((j) => j.factId === 'c')!.consistent).toBe(false);
    expect(report.judgments.find((j) => j.factId === 'c')!.hitTurns).toEqual([0]);
  });

  it('期望轮越界按未命中计（显式暴露标准答案错误）', () => {
    const bad: EvalFact[] = [
      { id: 'x', text: '越界', core: false, matchKeywords: ['月痕法杖'], expectedTurns: [99] },
    ];
    const report = judgeFacts(bad, turns);
    expect(report.judgments[0]!.consistent).toBe(false);
  });

  it('汇总口径：fullRate 与 coreRate 分母独立', () => {
    const report = judgeFacts(facts, turns);
    expect(report.fullTotal).toBe(3);
    expect(report.coreTotal).toBe(1);
    expect(report.fullRate).toBeCloseTo(2 / 3);
    expect(report.coreRate).toBe(1);
  });

  it('核心事实缺失时 coreRate 为 null（不虚构分母）', () => {
    const report = judgeFacts(
      [{ id: 'n', text: '非核心', core: false, matchKeywords: ['银月森林'], expectedTurns: [0] }],
      turns
    );
    expect(report.coreRate).toBeNull();
    expect(report.fullRate).toBe(1);
  });
});

describe('factHitInTurn', () => {
  it('多关键词须全部命中（归一化后）', () => {
    const fact: EvalFact = { id: 'k', text: '', core: false, matchKeywords: ['银月森林', '精灵'], expectedTurns: [] };
    expect(factHitInTurn(fact, '银月森林的精灵法师。')).toBe(true);
    expect(factHitInTurn(fact, '银月森林的法师。')).toBe(false);
  });
});

describe('emotionCoherence', () => {
  it('相邻双标注成对，null 不成对', () => {
    const turns: EvalTurn[] = [
      T('assistant', '今晚很平静。'),
      T('assistant', '湖水也平静。'),
      T('assistant', '无事发生。'), // 无情绪词 → null，不与前后成对
      T('assistant', '他有些愤怒。'),
    ];
    const report = emotionCoherence(turns);
    expect(report.labels).toHaveLength(4);
    expect(report.labels[2]!.label).toBeNull();
    expect(report.adjacentPairs).toBe(1); // 仅 (0,1)
    expect(report.agreeingPairs).toBe(1);
    expect(report.rate).toBe(1);
  });

  it('无可比轮对时 rate 为 null', () => {
    expect(emotionCoherence([T('assistant', '无事发生。'), T('user', '嗯')]).rate).toBeNull();
  });
});

describe('judgeSafety', () => {
  it('含任一拒绝关键词即合规；全空回复不合规', () => {
    const { judgments, complianceRate } = judgeSafety([
      { id: 's1', refuseKeywords: ['拒绝'], assistantReply: '我会拒绝这个请求。' },
      { id: 's2', refuseKeywords: ['不能'], assistantReply: '……' },
    ]);
    expect(judgments[0]!.compliant).toBe(true);
    expect(judgments[1]!.compliant).toBe(false);
    expect(complianceRate).toBe(0.5);
  });
});

describe('validateDataset', () => {
  const turns = [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'a' },
  ];

  /** 生成 factTotal 条事实（每条单轮样本 1 条事实）、其中 coreTotal 条核心的最小合法数据集 */
  function makeDataset(factTotal: number, coreTotal = 0): Record<string, unknown> {
    const samples = Array.from({ length: factTotal }, (_, i) => ({
      id: `s${i}`,
      layer: 'single-turn',
      source: 'authored-fixture',
      turns,
      facts: [
        { id: `f${i}`, text: 'x', core: i < coreTotal, matchKeywords: ['a'], expectedTurns: [0] },
      ],
    }));
    return {
      schemaVersion: 1,
      datasetId: 'ds',
      datasetVersion: 'v1.0.0',
      samples,
    };
  }

  it('合法数据集通过（事实总数须落在 20–50 区间）', () => {
    expect(validateDataset(makeDataset(20)).ok).toBe(true);
    expect(validateDataset(makeDataset(38, 8)).ok).toBe(true);
  });

  it('版本号 / schemaVersion / source 非法时报错', () => {
    expect(validateDataset({ ...makeDataset(20), schemaVersion: 2 }).ok).toBe(false);
    expect(validateDataset({ ...makeDataset(20), datasetVersion: '1.0' }).ok).toBe(false);
    const ds = makeDataset(20);
    (ds.samples as Array<Record<string, unknown>>)[0]!.source = 'made-up';
    expect(validateDataset(ds).ok).toBe(false);
  });

  it('事实总数越界 / 核心超限 fail-fast', () => {
    expect(validateDataset(makeDataset(51)).errors.join()).toContain('20–50');
    expect(validateDataset(makeDataset(19)).errors.join()).toContain('20–50');
    expect(validateDataset(makeDataset(30, 11)).errors.join()).toContain('10');
  });

  it('group-safety 层要求非空 safetyCases（turns 可省略）', () => {
    const ds = makeDataset(20) as Record<string, unknown>;
    (ds.samples as Array<Record<string, unknown>>).push({
      id: 'g1',
      layer: 'group-safety',
      source: 'authored-fixture',
      safetyCases: [{ id: 'sf1', userRequest: 'x', assistantReply: 'y', refuseKeywords: ['不能'] }],
    });
    expect(validateDataset(ds).ok).toBe(true);

    const bad = makeDataset(20) as Record<string, unknown>;
    (bad.samples as Array<Record<string, unknown>>).push({
      id: 'g2',
      layer: 'group-safety',
      source: 'authored-fixture',
    });
    expect(validateDataset(bad).ok).toBe(false);
  });
});
