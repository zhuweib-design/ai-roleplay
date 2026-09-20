import { describe, it, expect } from 'vitest';
import { buildStatusInstruction } from '@core/status-prompt';
import { STATUS_FIELD_REGISTRY, type StatusSchema } from '@core/status-schema';

/**
 * P1 状态提示词模板测试 (T02)
 *
 * 最脆弱处守护（设计文档 §4.6 硬约束 ①）：
 * 注入的示例 JSON **必须全是英文 key**，否则模型照抄中文 → 匹配层全部落空 → 静默失效。
 */

const SCHEMA: StatusSchema = {
  version: 1,
  fields: [
    { key: 'location', type: 'string' },
    { key: 'affection', type: 'number' },
    { key: 'mood', type: 'enum', options: ['happy', 'sad'] },
  ],
};

describe('buildStatusInstruction', () => {
  it('enabled=false → 返回空串（请求体与未开启时逐字节一致）', () => {
    expect(buildStatusInstruction(SCHEMA, false)).toBe('');
    expect(buildStatusInstruction(null, false)).toBe('');
  });

  it('有 schema → 示例 JSON 只含 schema 的 key，且类型占位正确', () => {
    const out = buildStatusInstruction(SCHEMA, true);
    expect(out).toContain('[Character Status]');
    expect(out).toContain('<status>');
    expect(out).toContain('</status>');
    expect(out).toContain('"location": "<string>"');
    expect(out).toContain('"affection": <number>');
    expect(out).toContain('"mood": "<happy|sad>"');
  });

  it('无 schema（纯嗅探）→ 列出内置 8 个 key 作为建议', () => {
    const out = buildStatusInstruction(null, true);
    for (const p of STATUS_FIELD_REGISTRY) {
      expect(out).toContain(`"${p.key}"`);
    }
    expect(out).toContain('These keys are suggestions');
  });

  it('明确要求状态块在 <think> 之外（缓解 §3.5 E-28 取舍）', () => {
    const out = buildStatusInstruction(SCHEMA, true);
    expect(out).toContain('outside any <think> block');
  });

  it('输出不含任何中文字符（硬约束 ①：提示词必须英文 key）', () => {
    expect(/[一-龥]/.test(buildStatusInstruction(SCHEMA, true))).toBe(false);
    expect(/[一-龥]/.test(buildStatusInstruction(null, true))).toBe(false);
    // 即便 schema 的 label 是中文（用户数据），也不得进入提示词
    const withChineseLabel: StatusSchema = {
      version: 1,
      fields: [{ key: 'location', label: '地点' }],
    };
    expect(/[一-龥]/.test(buildStatusInstruction(withChineseLabel, true))).toBe(false);
  });

  it('空 fields 的 schema → 回落到内置字段而非返回空串', () => {
    const empty: StatusSchema = { version: 1, fields: [] };
    expect(buildStatusInstruction(empty, true)).toContain('"location"');
  });

  it('show:false 的字段不写进示例 JSON', () => {
    const hidden: StatusSchema = {
      version: 1,
      fields: [
        { key: 'location' },
        { key: 'secret', show: false },
      ],
    };
    const out = buildStatusInstruction(hidden, true);
    expect(out).toContain('"location"');
    expect(out).not.toContain('"secret"');
  });
});
