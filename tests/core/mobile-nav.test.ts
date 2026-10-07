/**
 * mobile-nav 单元测试
 *
 * 底部 Tab 的清单/顺序已移交 nav-model（tests/core/nav-model.test.ts 覆盖），
 * 本文件只覆盖"二级沉浸页"判定——它是 App.vue 决定底栏显隐的真实门禁。
 */
import { describe, it, expect } from 'vitest';
import { isDetailRoute } from '@core/mobile-nav';

describe('isDetailRoute 二级页移动端隐藏底部导航', () => {
  it('编辑器类返回 true(应隐藏)', () => {
    expect(isDetailRoute('character-edit')).toBe(true);
    expect(isDetailRoute('character-new')).toBe(true);
    expect(isDetailRoute('local-model')).toBe(true);
    expect(isDetailRoute('profile')).toBe(true);
  });

  it('group 不再是沉浸页：吞掉底栏会让 /group 成为单向门（N 层 §3.2.4）', () => {
    expect(isDetailRoute('group')).toBe(false);
  });

  it('主入口与聚合页返回 false(不隐藏)', () => {
    expect(isDetailRoute('chat')).toBe(false);
    expect(isDetailRoute('settings')).toBe(false);
    expect(isDetailRoute('more')).toBe(false);
    expect(isDetailRoute('character-list')).toBe(false);
    expect(isDetailRoute('community-market')).toBe(false);
    expect(isDetailRoute('worldbook')).toBe(false);
  });

  it('空/未知名返回 false', () => {
    expect(isDetailRoute(undefined)).toBe(false);
    expect(isDetailRoute('nope')).toBe(false);
  });
});
