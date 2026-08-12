/**
 * compression — L1 内容压缩层 (E-03) 测试
 *
 * 覆盖：
 * - splitSentences 中英文句切分
 * - extractiveCompress:按目标比保留、重复句去重、实体显著性、原序重组
 * - validateCompression:保留率计算、关键实体强制、fail-open 判定
 * - CcrStore:暂存/取回/滑动 TTL/过期清理
 * - decideCompression:阈值/冷却/暂停/禁用
 * - isExempt 豁免
 */
import { describe, it, expect } from 'vitest';
import {
  splitSentences,
  extractiveCompress,
  validateCompression,
  CcrStore,
  decideCompression,
  isExempt,
  SOFT_THRESHOLD,
  HARD_THRESHOLD,
} from '@core/compression';

describe('splitSentences (E-03)', () => {
  it('按中英文标点与换行切分', () => {
    expect(splitSentences('第一句。第二句！第三句?')).toEqual(['第一句。', '第二句！', '第三句?']);
    expect(splitSentences('甲\n乙。')).toEqual(['甲', '乙。']);
    expect(splitSentences('')).toEqual([]);
  });
});

describe('extractiveCompress (E-03)', () => {
  it('按目标比保留并保持原序', () => {
    const text = '第一句。第二句。第三句。第四句。';
    const r = extractiveCompress(text, { targetRatio: 0.5 });
    expect(r.keptCount).toBe(2);
    expect(r.totalCount).toBe(4);
    // 原序重组:kept 句子在原文本中顺序一致
    const idx = r.text.split('。').filter(Boolean);
    expect(idx).toEqual(idx.slice().sort((a, b) => text.indexOf(a) - text.indexOf(b)));
  });

  it('重复句被去重(新颖度惩罚)', () => {
    const text = '重要信息:主角是剑士。重要信息:主角是剑士。重要信息:主角是剑士。结尾句。';
    const r = extractiveCompress(text, { targetRatio: 0.75 });
    // 重复句只保留一份(三句重复 + 结尾句 → 最多保留 2 句)
    expect(r.keptCount).toBeLessThanOrEqual(2);
    const keptText = r.text;
    expect(keptText.split('主角是剑士').length - 1).toBeLessThanOrEqual(1);
  });

  it('命中设定实体的句子被优先保留(显著性)', () => {
    const text = '无关的天气描述。星陨之剑的封印被解开。又是无关的环境描写。';
    const r = extractiveCompress(text, { targetRatio: 0.4, entities: ['星陨之剑'] });
    expect(r.text).toContain('星陨之剑');
  });

  it('单句文本原样返回', () => {
    const r = extractiveCompress('只有一句。', { targetRatio: 0.5 });
    expect(r.text).toBe('只有一句。');
    expect(r.keptCount).toBe(1);
  });
});

describe('validateCompression (E-03)', () => {
  it('实体与情绪词保留率达标', () => {
    const v = validateCompression({
      original: 'A 愤怒 B 平静。',
      compressed: 'A 愤怒。',
      entities: ['A', 'B'],
      emotionWords: ['愤怒', '平静'],
    });
    // 实体:A ✓ B ✗ → 0.5;情绪:愤怒 ✓ 平静 ✗ → 0.5;min=0.5 <0.9
    expect(v.pass).toBe(false);
    expect(v.entityRate).toBe(0.5);
    expect(v.emotionRate).toBe(0.5);
  });

  it('关键实体缺失即失败', () => {
    const v = validateCompression({
      original: 'x',
      compressed: 'y',
      criticalEntities: ['星陨之剑'],
    });
    expect(v.pass).toBe(false);
    expect(v.missingCritical).toEqual(['星陨之剑']);
  });

  it('全部保留时通过且保留率 1', () => {
    const v = validateCompression({
      original: 'A B。',
      compressed: 'A B。',
      entities: ['A', 'B'],
      emotionWords: [],
    });
    expect(v.pass).toBe(true);
    expect(v.entityRate).toBe(1);
    expect(v.emotionRate).toBe(1);
  });
});

describe('CcrStore (E-03)', () => {
  it('put/get 往返与滑动刷新', async () => {
    const store = new CcrStore(60_000);
    store.put('hash-1', '原文内容');
    expect(store.get('hash-1')).toBe('原文内容');
    expect(store.get('hash-1')).toBe('原文内容'); // 命中刷新 TTL
    expect(store.get('nope')).toBeNull();
    expect(store.size()).toBe(1);
  });

  it('过期条目 get 返回 null 且 purgeExpired 清理', async () => {
    const store = new CcrStore(10); // 10ms TTL
    store.put('h', 'payload');
    await new Promise((r) => setTimeout(r, 30));
    expect(store.get('h')).toBeNull();
    store.put('h2', 'p2');
    expect(store.purgeExpired()).toBe(0); // h2 未过期
    expect(store.size()).toBe(1);
    store.clear();
    expect(store.size()).toBe(0);
  });
});

describe('decideCompression (E-03)', () => {
  const base = {
    contextUsed: 0,
    contextLimit: 100,
    roundsSinceLastCompress: 5,
    consecutiveFailures: 0,
  };

  it('soft 阈值触发', () => {
    const d = decideCompression({ ...base, contextUsed: 70 });
    expect(d.shouldCompress).toBe(true);
    expect(d.reason).toBe('soft-threshold');
    expect(SOFT_THRESHOLD).toBe(0.7);
    expect(HARD_THRESHOLD).toBe(0.8);
  });

  it('hard 阈值触发', () => {
    const d = decideCompression({ ...base, contextUsed: 85 });
    expect(d.shouldCompress).toBe(true);
    expect(d.reason).toBe('hard-threshold');
  });

  it('冷却期不压缩', () => {
    const d = decideCompression({ ...base, contextUsed: 90, roundsSinceLastCompress: 1 });
    expect(d.shouldCompress).toBe(false);
    expect(d.reason).toBe('cooldown');
  });

  it('连续失败暂停(二级回退)', () => {
    const d = decideCompression({ ...base, contextUsed: 90, consecutiveFailures: 3 });
    expect(d.shouldCompress).toBe(false);
    expect(d.reason).toBe('paused');
  });

  it('禁用时全关(三级强控)', () => {
    const d = decideCompression({ ...base, contextUsed: 90 }, false);
    expect(d.shouldCompress).toBe(false);
    expect(d.reason).toBe('disabled');
  });

  it('低于阈值不压缩', () => {
    const d = decideCompression({ ...base, contextUsed: 50 });
    expect(d.shouldCompress).toBe(false);
  });
});

describe('isExempt (E-03)', () => {
  it('豁免黑名单命中', () => {
    expect(isExempt('主角设定:永不言败', ['主角设定:永不言败'])).toBe(true);
    expect(isExempt('无关内容', ['主角设定'])).toBe(false);
  });
});