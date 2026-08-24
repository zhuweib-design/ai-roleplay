/**
 * mobile-nav 单元测试
 *
 * 覆盖:
 * - 底部导航 5 个主 Tab(chat/角色/市场/世界书/设置)
 * - isMainTab 判定
 * - 二级详细页应在移动端隐藏底部导航(isDetailRoute)
 */
import { describe, it, expect } from 'vitest';
import { MAIN_TABS, isMainTab, isDetailRoute } from '@core/mobile-nav';

describe('MAIN_TABS 底部导航 5 个主入口', () => {
  it('包含 5 个主 Tab', () => {
    expect(MAIN_TABS).toHaveLength(5);
    expect(MAIN_TABS).toEqual(
      expect.arrayContaining(['chat', 'character-list', 'community-market', 'worldbook', 'settings'])
    );
  });
});

describe('isMainTab', () => {
  it('5 个主 Tab 返回 true', () => {
    expect(isMainTab('chat')).toBe(true);
    expect(isMainTab('character-list')).toBe(true);
    expect(isMainTab('community-market')).toBe(true);
    expect(isMainTab('worldbook')).toBe(true);
    expect(isMainTab('settings')).toBe(true);
  });

  it('非主 Tab 返回 false', () => {
    expect(isMainTab('character-edit')).toBe(false);
    expect(isMainTab('group')).toBe(false);
    expect(isMainTab('profile')).toBe(false);
  });

  it('空/未知名返回 false', () => {
    expect(isMainTab(undefined)).toBe(false);
    expect(isMainTab('nope')).toBe(false);
  });
});

describe('isDetailRoute 二级页移动端隐藏底部导航', () => {
  it('编辑器/详情类返回 true(应隐藏)', () => {
    expect(isDetailRoute('character-edit')).toBe(true);
    expect(isDetailRoute('character-new')).toBe(true);
    expect(isDetailRoute('group')).toBe(true);
  });

  it('主 Tab 返回 false(不隐藏)', () => {
    expect(isDetailRoute('chat')).toBe(false);
    expect(isDetailRoute('settings')).toBe(false);
  });
});