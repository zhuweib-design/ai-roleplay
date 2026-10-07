/**
 * nav-model 单元测试（N 层单一事实源）
 *
 * 覆盖设计文档 §4 的可执行断言：
 * - 13 个内容项 + 1 个系统项（"更多"），分 4 组
 * - 三个渲染面（rail / 底栏 / 聚合页）同源
 * - 高亮按路由 name 派生，且不吃 path 前缀（/character vs /character-version）
 */
import { describe, it, expect } from 'vitest';
import {
  NAV_ENTRIES,
  NAV_GROUPS,
  CONTENT_ENTRY_COUNT,
  activeEntryForRoute,
  entriesOfGroup,
  mobileTabEntries,
  moreEntries,
  systemEntries,
} from '@core/nav-model';

describe('NAV_ENTRIES 结构', () => {
  it('内容项 13 个 + 系统项 2 个，id 唯一', () => {
    expect(CONTENT_ENTRY_COUNT).toBe(13);
    expect(NAV_ENTRIES).toHaveLength(15);
    expect(new Set(NAV_ENTRIES.map((e) => e.id)).size).toBe(15);
    expect(systemEntries().map((e) => e.id)).toEqual(['more', 'guide']);
  });

  it('四个分组各非空，且组内项之和等于内容项总数', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['conversation', 'creation', 'capability', 'archive']);
    const summed = NAV_GROUPS.reduce((acc, g) => acc + entriesOfGroup(g.id).length, 0);
    expect(summed).toBe(CONTENT_ENTRY_COUNT);
    for (const g of NAV_GROUPS) expect(entriesOfGroup(g.id).length).toBeGreaterThan(0);
  });

  it('每个内容项都能在聚合页或底部 Tab 之一露出，或个人入口已彻底移出导航', () => {
    expect(NAV_ENTRIES.some((e) => e.routeName === 'profile')).toBe(false);
    expect(moreEntries().map((e) => e.id)).toEqual(
      expect.arrayContaining(['group', 'databank', 'story', 'random-events', 'local-model', 'image-gen', 'archives', 'version'])
    );
    expect(moreEntries()).toHaveLength(8);
  });

  it('路由 name 与 path 不一一对应，匹配只能用 name（/character → character-list）', () => {
    const character = NAV_ENTRIES.find((e) => e.id === 'character');
    expect(character?.routeName).toBe('character-list');
    const version = NAV_ENTRIES.find((e) => e.id === 'version');
    expect(version?.routeName).toBe('character-version');
  });
});

describe('activeEntryForRoute 高亮派生', () => {
  it('二级页归属父入口，修复"点击才更新"的失准', () => {
    expect(activeEntryForRoute('character-new')?.id).toBe('character');
    expect(activeEntryForRoute('character-edit')?.id).toBe('character');
    expect(activeEntryForRoute('character-list')?.id).toBe('character');
  });

  it('不被 path 前缀陷阱误判：character-version 不点亮 character', () => {
    expect(activeEntryForRoute('character-version')?.id).toBe('version');
  });

  it('聚合页高亮自身系统项而非任何内容组', () => {
    expect(activeEntryForRoute('more')?.id).toBe('more');
  });

  it('未知/空路由不高亮', () => {
    expect(activeEntryForRoute('nope')).toBeUndefined();
    expect(activeEntryForRoute(undefined)).toBeUndefined();
  });

  it('activeWhen 覆盖全部路由 name，一个 name 只归属一个入口', () => {
    const owned = NAV_ENTRIES.flatMap((e) => [...e.activeWhen]);
    expect(new Set(owned).size).toBe(owned.length);
    for (const e of NAV_ENTRIES) expect(e.activeWhen).toContain(e.routeName);
  });
});

describe('mobileTabEntries 顺序', () => {
  it('保持既有 6 Tab 顺序，避免移动端布局回归', () => {
    expect(mobileTabEntries().map((e) => e.routeName)).toEqual([
      'chat',
      'character-list',
      'community-market',
      'worldbook',
      'more',
      'settings',
    ]);
  });

  it('每个 Tab 都有 mobile 短称谓回退', () => {
    for (const e of mobileTabEntries()) expect(e.mobileLabelKey).toBeTruthy();
  });
});
