// F11.2 变量系统持久化单元测试
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  GLOBAL_VARS_STORAGE_KEY,
  loadGlobalVariables,
  saveGlobalVariables,
  setGlobalVariable,
  deleteGlobalVariable,
  clearGlobalVariables,
  mergeVariables,
  createSlashCommandContext,
} from '@core/variable-store';

beforeEach(() => {
  localStorage.clear();
});

// ─────────────────────────────────────────────────────────────
// GLOBAL_VARS_STORAGE_KEY 常量
// ─────────────────────────────────────────────────────────────

describe('GLOBAL_VARS_STORAGE_KEY', () => {
  test('存储键为预期值', () => {
    expect(GLOBAL_VARS_STORAGE_KEY).toBe('ai-roleplay:global-variables');
  });
});

// ─────────────────────────────────────────────────────────────
// loadGlobalVariables
// ─────────────────────────────────────────────────────────────

describe('loadGlobalVariables', () => {
  test('localStorage 为空时返回空对象', () => {
    expect(loadGlobalVariables()).toEqual({});
  });

  test('读取已保存的变量', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, JSON.stringify({ gold: '100', name: '勇者' }));
    expect(loadGlobalVariables()).toEqual({ gold: '100', name: '勇者' });
  });

  test('损坏的 JSON 返回空对象', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, '{invalid json');
    expect(loadGlobalVariables()).toEqual({});
  });

  test('非对象 JSON（数组）返回空对象', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, JSON.stringify(['a', 'b']));
    expect(loadGlobalVariables()).toEqual({});
  });

  test('非对象 JSON（字符串）返回空对象', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, JSON.stringify('hello'));
    expect(loadGlobalVariables()).toEqual({});
  });

  test('非对象 JSON（null）返回空对象', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, 'null');
    expect(loadGlobalVariables()).toEqual({});
  });

  test('非对象 JSON（数字）返回空对象', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, '42');
    expect(loadGlobalVariables()).toEqual({});
  });

  test('非字符串值被转换为字符串', () => {
    localStorage.setItem(
      GLOBAL_VARS_STORAGE_KEY,
      JSON.stringify({ count: 5, active: true, score: 3.14 })
    );
    const result = loadGlobalVariables();
    expect(result.count).toBe('5');
    expect(result.active).toBe('true');
    expect(result.score).toBe('3.14');
  });

  test('null 值被转换为空字符串', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, JSON.stringify({ name: null }));
    const result = loadGlobalVariables();
    expect(result.name).toBe('');
  });

  test('空字符串值保留', () => {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, JSON.stringify({ empty: '' }));
    const result = loadGlobalVariables();
    expect(result.empty).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────
// saveGlobalVariables
// ─────────────────────────────────────────────────────────────

describe('saveGlobalVariables', () => {
  test('保存变量到 localStorage', () => {
    saveGlobalVariables({ gold: '100', silver: '50' });
    const raw = localStorage.getItem(GLOBAL_VARS_STORAGE_KEY);
    expect(raw).toBe(JSON.stringify({ gold: '100', silver: '50' }));
  });

  test('保存空对象', () => {
    saveGlobalVariables({});
    const raw = localStorage.getItem(GLOBAL_VARS_STORAGE_KEY);
    expect(raw).toBe('{}');
  });

  test('覆盖已有变量', () => {
    saveGlobalVariables({ a: '1' });
    saveGlobalVariables({ b: '2' });
    const result = loadGlobalVariables();
    expect(result).toEqual({ b: '2' });
  });

  test('save 后 load 一致', () => {
    const vars = { name: '勇者', hp: '100', mood: 'happy' };
    saveGlobalVariables(vars);
    expect(loadGlobalVariables()).toEqual(vars);
  });
});

// ─────────────────────────────────────────────────────────────
// setGlobalVariable
// ─────────────────────────────────────────────────────────────

describe('setGlobalVariable', () => {
  test('设置单个变量并返回更新后的完整 Map', () => {
    saveGlobalVariables({ gold: '100' });
    const result = setGlobalVariable('silver', '50');
    expect(result).toEqual({ gold: '100', silver: '50' });
  });

  test('设置变量后持久化到 localStorage', () => {
    setGlobalVariable('name', '勇者');
    expect(loadGlobalVariables().name).toBe('勇者');
  });

  test('覆盖已存在的变量', () => {
    setGlobalVariable('gold', '100');
    const result = setGlobalVariable('gold', '200');
    expect(result.gold).toBe('200');
  });

  test('从空状态设置变量', () => {
    const result = setGlobalVariable('first', '1');
    expect(result).toEqual({ first: '1' });
  });

  test('设置空字符串值', () => {
    const result = setGlobalVariable('empty', '');
    expect(result.empty).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────
// deleteGlobalVariable
// ─────────────────────────────────────────────────────────────

describe('deleteGlobalVariable', () => {
  test('删除存在的变量', () => {
    saveGlobalVariables({ gold: '100', silver: '50' });
    const result = deleteGlobalVariable('gold');
    expect(result).toEqual({ silver: '50' });
  });

  test('删除不存在的变量不报错', () => {
    saveGlobalVariables({ gold: '100' });
    const result = deleteGlobalVariable('nonexistent');
    expect(result).toEqual({ gold: '100' });
  });

  test('删除后 localStorage 同步更新', () => {
    saveGlobalVariables({ a: '1', b: '2' });
    deleteGlobalVariable('a');
    expect(loadGlobalVariables()).toEqual({ b: '2' });
  });

  test('删除最后一个变量后 localStorage 为空对象', () => {
    saveGlobalVariables({ only: '1' });
    deleteGlobalVariable('only');
    expect(loadGlobalVariables()).toEqual({});
  });

  test('从空状态删除不报错', () => {
    const result = deleteGlobalVariable('nothing');
    expect(result).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────
// clearGlobalVariables
// ─────────────────────────────────────────────────────────────

describe('clearGlobalVariables', () => {
  test('清空所有变量', () => {
    saveGlobalVariables({ a: '1', b: '2', c: '3' });
    clearGlobalVariables();
    expect(loadGlobalVariables()).toEqual({});
  });

  test('清空后 localStorage 键被移除', () => {
    saveGlobalVariables({ a: '1' });
    clearGlobalVariables();
    expect(localStorage.getItem(GLOBAL_VARS_STORAGE_KEY)).toBeNull();
  });

  test('从空状态清空不报错', () => {
    clearGlobalVariables();
    expect(loadGlobalVariables()).toEqual({});
  });

  test('清空后可重新设置变量', () => {
    saveGlobalVariables({ a: '1' });
    clearGlobalVariables();
    setGlobalVariable('b', '2');
    expect(loadGlobalVariables()).toEqual({ b: '2' });
  });
});

// ─────────────────────────────────────────────────────────────
// mergeVariables
// ─────────────────────────────────────────────────────────────

describe('mergeVariables', () => {
  test('合并局部和全局变量', () => {
    const result = mergeVariables({ local: '1' }, { global: '2' });
    expect(result).toEqual({ local: '1', global: '2' });
  });

  test('局部变量优先于全局变量', () => {
    const result = mergeVariables({ name: 'local' }, { name: 'global' });
    expect(result.name).toBe('local');
  });

  test('局部为空时返回全局', () => {
    const result = mergeVariables({}, { a: '1', b: '2' });
    expect(result).toEqual({ a: '1', b: '2' });
  });

  test('全局为空时返回局部', () => {
    const result = mergeVariables({ x: '1' }, {});
    expect(result).toEqual({ x: '1' });
  });

  test('两者都为空返回空对象', () => {
    expect(mergeVariables({}, {})).toEqual({});
  });

  test('不修改原始对象', () => {
    const local = { a: '1' };
    const global = { b: '2' };
    const result = mergeVariables(local, global);
    expect(local).toEqual({ a: '1' });
    expect(global).toEqual({ b: '2' });
    expect(result).toEqual({ a: '1', b: '2' });
  });
});

// ─────────────────────────────────────────────────────────────
// createSlashCommandContext
// ─────────────────────────────────────────────────────────────

describe('createSlashCommandContext', () => {
  test('构造包含局部和全局变量的上下文', () => {
    saveGlobalVariables({ theme: 'dark' });
    const ctx = createSlashCommandContext({ local: '1' }, 'Seraphina', '勇者');
    expect(ctx.localVariables).toEqual({ local: '1' });
    expect(ctx.globalVariables).toEqual({ theme: 'dark' });
    expect(ctx.charName).toBe('Seraphina');
    expect(ctx.userName).toBe('勇者');
  });

  test('无全局变量时 globalVariables 为空对象', () => {
    const ctx = createSlashCommandContext({}, '角色', '用户');
    expect(ctx.globalVariables).toEqual({});
  });

  test('传入 onAbort 回调', () => {
    const onAbort = vi.fn();
    const ctx = createSlashCommandContext({}, '角色', '用户', { onAbort });
    expect(ctx.onAbort).toBe(onAbort);
  });

  test('不传 options 时 onAbort 为 undefined', () => {
    const ctx = createSlashCommandContext({}, '角色', '用户');
    expect(ctx.onAbort).toBeUndefined();
  });

  test('localVariables 引用与传入参数一致', () => {
    const local = { a: '1' };
    const ctx = createSlashCommandContext(local, '角色', '用户');
    expect(ctx.localVariables).toBe(local);
  });

  test('全局变量在创建上下文时快照（后续修改不影响已创建的 ctx）', () => {
    saveGlobalVariables({ a: '1' });
    const ctx = createSlashCommandContext({}, '角色', '用户');
    setGlobalVariable('a', 'changed');
    // ctx.globalVariables 是创建时的快照
    expect(ctx.globalVariables.a).toBe('1');
  });
});

// ─────────────────────────────────────────────────────────────
// 端到端：变量持久化全流程
// ─────────────────────────────────────────────────────────────

describe('变量持久化全流程', () => {
  test('set → load → delete → load 流程', () => {
    setGlobalVariable('gold', '100');
    setGlobalVariable('hp', '50');
    expect(loadGlobalVariables()).toEqual({ gold: '100', hp: '50' });

    deleteGlobalVariable('gold');
    expect(loadGlobalVariables()).toEqual({ hp: '50' });

    clearGlobalVariables();
    expect(loadGlobalVariables()).toEqual({});
  });

  test('与 createSlashCommandContext 集成', () => {
    setGlobalVariable('globalVar', 'global-value');
    const localVars = { localVar: 'local-value' };
    const ctx = createSlashCommandContext(localVars, 'Seraphina', '勇者');

    // 局部和全局变量都可用
    expect(ctx.localVariables.localVar).toBe('local-value');
    expect(ctx.globalVariables.globalVar).toBe('global-value');
  });
});
