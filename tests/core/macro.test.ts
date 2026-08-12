import { describe, test, expect } from 'vitest';
import { replaceMacros } from '@core/macro';
import type { VariableMap } from '@core/macro';

describe('宏替换系统 (F01.5)', () => {
  test('{{user}} 替换为当前 Persona 名称', () => {
    const result = replaceMacros('你好，{{user}}！', { user: '勇者', char: 'Seraphina' });
    expect(result).toBe('你好，勇者！');
  });

  test('{{char}} 替换为角色名称', () => {
    const result = replaceMacros('{{char}}微微一笑', { user: '勇者', char: 'Seraphina' });
    expect(result).toBe('Seraphina微微一笑');
  });

  test('同时替换多个宏', () => {
    const template = '{{char}}对{{user}}说："欢迎来到翡翠森林。"';
    const result = replaceMacros(template, { user: '勇者', char: 'Seraphina' });
    expect(result).toBe('Seraphina对勇者说："欢迎来到翡翠森林。"');
  });

  test('{{getvar::name}} 替换为变量值', () => {
    const result = replaceMacros(
      '当前金币：{{getvar::gold}}',
      { user: '勇者', char: 'Seraphina' },
      { gold: '150' }
    );
    expect(result).toBe('当前金币：150');
  });

  test('未定义变量替换为空字符串', () => {
    const result = replaceMacros(
      '未定义：{{getvar::nonexistent}}',
      { user: '勇者', char: 'Seraphina' }
    );
    expect(result).toBe('未定义：');
  });

  test('不递归替换（避免无限循环）', () => {
    const result = replaceMacros(
      '{{user}}',
      { user: '{{char}}', char: 'Seraphina' }
    );
    expect(result).toBe('{{char}}');
  });

  test('无宏的文本原样返回', () => {
    const result = replaceMacros('这是一段普通文本', { user: '勇者', char: 'Seraphina' });
    expect(result).toBe('这是一段普通文本');
  });

  test('同一宏多次出现全部替换', () => {
    const template = '{{char}}说："{{user}}，{{char}}一直在等你。"';
    const result = replaceMacros(template, { user: '勇者', char: 'Seraphina' });
    expect(result).toBe('Seraphina说："勇者，Seraphina一直在等你。"');
  });
});

describe('{{setvar}} 宏支持 (F11.2)', () => {
  test('{{setvar::name::value}} 设置变量并替换为空字符串', () => {
    const variables: VariableMap = {};
    const result = replaceMacros(
      '{{setvar::gold::100}}',
      { user: '勇者', char: 'Seraphina' },
      variables
    );
    expect(result).toBe('');
    expect(variables.gold).toBe('100');
  });

  test('{{setvar}} 后紧跟 {{getvar}} 可读取设置的值', () => {
    const variables: VariableMap = {};
    const result = replaceMacros(
      '{{setvar::gold::100}}当前金币：{{getvar::gold}}',
      { user: '勇者', char: 'Seraphina' },
      variables
    );
    expect(result).toBe('当前金币：100');
    expect(variables.gold).toBe('100');
  });

  test('{{setvar}} 覆盖已存在的变量值', () => {
    const variables: VariableMap = { gold: '50' };
    const result = replaceMacros(
      '{{setvar::gold::200}}',
      { user: '勇者', char: 'Seraphina' },
      variables
    );
    expect(result).toBe('');
    expect(variables.gold).toBe('200');
  });

  test('{{setvar}} 值中包含冒号时正确解析', () => {
    const variables: VariableMap = {};
    const result = replaceMacros(
      '{{setvar::msg::hello::world}}',
      { user: '勇者', char: 'Seraphina' },
      variables
    );
    expect(result).toBe('');
    expect(variables.msg).toBe('hello::world');
  });

  test('{{setvar}} 与 {{user}} {{char}} 混合使用', () => {
    const variables: VariableMap = {};
    const result = replaceMacros(
      '{{setvar::name::勇者}}{{char}}认识了{{getvar::name}}',
      { user: '勇者', char: 'Seraphina' },
      variables
    );
    expect(result).toBe('Seraphina认识了勇者');
  });
});
