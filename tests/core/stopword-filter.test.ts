/**
 * stopword-filter 单元测试
 *
 * 覆盖设计 §4 全部规则:
 * - 中英文停用词剔除
 * - 否定词保留(防语义反转)
 * - 数字串保护
 * - 专名保护
 * - 开关控制
 * - 边界(空串/纯标点)
 *
 * 输出契约:中文单字空格分隔、英文按词空格分隔、专名/数字整体保留。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  filterStopwords,
  isStopwordFilterEnabled,
  setStopwordFilterEnabled,
} from '../../src/core/stopword-filter';

describe('filterStopwords — 开关', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('aijiuguan.stopwordFilterEnabled');
    } catch {
      /* 环境无 localStorage */
    }
  });

  it('默认开启', () => {
    expect(isStopwordFilterEnabled()).toBe(true);
  });

  it('setStopwordFilterEnabled 控制开关', () => {
    setStopwordFilterEnabled(false);
    expect(isStopwordFilterEnabled()).toBe(false);
    setStopwordFilterEnabled(true);
    expect(isStopwordFilterEnabled()).toBe(true);
  });

  it('opts.enabled=false 时原样返回', () => {
    const input = 'the king lives in the castle';
    expect(filterStopwords(input, { enabled: false })).toBe(input);
  });

  it('关闭时原样返回', () => {
    setStopwordFilterEnabled(false);
    const input = '国王住在城堡';
    expect(filterStopwords(input)).toBe(input);
  });

  it('空串返回空串', () => {
    expect(filterStopwords('')).toBe('');
  });
});

describe('filterStopwords — 英文', () => {
  it('剔除英文纯虚词并归一大小写', () => {
    expect(filterStopwords('The King lives in the Castle')).toBe('king lives castle');
  });

  it('保留英文否定词', () => {
    expect(filterStopwords('she does not know the map')).toBe('not know map');
  });

  it('保留英文实义短词(不误删)', () => {
    expect(filterStopwords('fire magic')).toBe('fire magic');
  });
});

describe('filterStopwords — 中文', () => {
  it('剔除中文虚词"是"', () => {
    expect(filterStopwords('国王是好人')).toBe('国 王 好 人');
  });

  it('剔除中文虚词"在"', () => {
    expect(filterStopwords('国王住在城堡')).toBe('国 王 住 城 堡');
  });

  it('剔除中文虚词"和"', () => {
    expect(filterStopwords('火和光')).toBe('火 光');
  });

  it('保留中文否定词', () => {
    expect(filterStopwords('不认可这条规则')).toContain('不');
    expect(filterStopwords('太危险')).toBe('太 危 险');
  });
});

describe('filterStopwords — 数字与专名保护', () => {
  it('保护数字+单位整体', () => {
    expect(filterStopwords('发生在2024年的事件')).toContain('2024年');
    expect(filterStopwords('王后资助1000金币')).toContain('1000金币');
  });

  it('保护专名白名单整体', () => {
    expect(filterStopwords('禁书阁封存灰烬之典')).toContain('禁书阁');
    expect(filterStopwords('禁书阁封存灰烬之典')).toContain('灰烬之典');
  });

  it('额外专名白名单生效', () => {
    expect(filterStopwords('闯入幽暗森林', { extraProperNouns: ['幽暗森林'] })).toContain('幽暗森林');
  });

  it('额外的词被合并进停用词表', () => {
    expect(filterStopwords('我只是来看看', { extra: ['只'] })).not.toContain('只');
  });
});

describe('filterStopwords — 边界', () => {
  it('纯标点输入不崩', () => {
    expect(typeof filterStopwords('。，！')).toBe('string');
  });

  it('剥离开头结尾标点', () => {
    expect(filterStopwords('，国王住在城堡！')).toBe('国 王 住 城 堡');
  });

  it('keepNegations=false 时可剔否定词', () => {
    expect(filterStopwords('不是国王', { keepNegations: false })).toBe('国 王');
  });
});