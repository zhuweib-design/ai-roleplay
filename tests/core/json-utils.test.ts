/**
 * json-utils 单元测试 (候选4)
 *
 * 覆盖 parseAiJson / parseAiJsonArray 统一解析入口：
 * - 直接解析
 * - markdown fence 剥离
 * - {…}/{…}/[ … ] 前后缀截取
 * - 尾逗号修复
 * - 数组非数组返回 null
 * - 无效输入返回 null
 */
import { describe, test, expect } from 'vitest';
import {
  parseAiJson,
  parseAiJsonArray,
  safeJsonParse,
  extractJsonString,
  extractJsonArrayString,
} from '@core/json-utils';

describe('parseAiJson（统一对象解析入口）', () => {
  test('直接解析合法 JSON 对象', () => {
    expect(parseAiJson('{"name":"A","age":3}')).toEqual({ name: 'A', age: 3 });
  });

  test('剥离 markdown fence（含 json 标记）', () => {
    const raw = '```json\n{"name":"A"}\n```';
    expect(parseAiJson(raw)).toEqual({ name: 'A' });
  });

  test('剥离无标记 fence', () => {
    const raw = '```\n{"name":"A"}\n```';
    expect(parseAiJson(raw)).toEqual({ name: 'A' });
  });

  test('带前后缀文本时截取 {…}', () => {
    const raw = '好的，这是结果：{"name":"A"} 完毕';
    expect(parseAiJson(raw)).toEqual({ name: 'A' });
  });

  test('尾逗号容错', () => {
    expect(parseAiJson('{"name":"A",}')).toEqual({ name: 'A' });
  });

  test('空/非字符串返回 null', () => {
    expect(parseAiJson('')).toBeNull();
    expect(parseAiJson(null as unknown as string)).toBeNull();
    expect(parseAiJson('not json')).toBeNull();
  });

  test('对象缺失返回 null', () => {
    expect(parseAiJson('[1,2,3]')).toBeNull();
  });
});

describe('parseAiJsonArray（统一数组解析入口）', () => {
  test('直接解析合法 JSON 数组', () => {
    expect(parseAiJsonArray('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  test('剥离 fence + 截取 [ … ]', () => {
    const raw = '```json\n[{"a":1}]\n```';
    expect(parseAiJsonArray(raw)).toEqual([{ a: 1 }]);
  });

  test('带前缀文本时截取 [ … ]', () => {
    expect(parseAiJsonArray('结果如下：[1,2,3] 完')).toEqual([1, 2, 3]);
  });

  test('尾逗号容错', () => {
    expect(parseAiJsonArray('[1,2,3,]')).toEqual([1, 2, 3]);
  });

  test('非数组返回 null', () => {
    expect(parseAiJsonArray('{"a":1}')).toBeNull();
  });

  test('无效输入返回 null', () => {
    expect(parseAiJsonArray('not array')).toBeNull();
    expect(parseAiJsonArray('')).toBeNull();
  });
});

describe('兼容性：旧导出仍可用且行为一致', () => {
  test('safeJsonParse 仍可解析对象', () => {
    expect(safeJsonParse('{"name":"A"}')).toEqual({ name: 'A' });
  });

  test('extractJsonString 仍提取 {…}', () => {
    expect(extractJsonString('前缀{"a":1}后缀')).toBe('{"a":1}');
  });

  test('extractJsonArrayString 仍提取 [ … ]', () => {
    expect(extractJsonArrayString('前缀[1,2]后缀')).toBe('[1,2]');
  });
});
