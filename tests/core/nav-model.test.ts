/**
 * nav-model 单元测试（N 层单一事实源）
 *
 * 覆盖设计文档 §4 的可执行断言：
 * - 12 个内容项 + 3 个系统项（引导 / 更多 / 设置），内容分 4 组
 * - 三个渲染面（rail / 底栏 / 聚合页）同源
 * - 高亮按路由 name 派生，且不吃 path 前缀（/character vs /character-version）
 * - 侧栏二次排版（M2-b7）：设置属系统项且排在系统段最后（rail 钉底 = 最下方）
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
  it('内容项 12 个 + 系统项 3 个，id 唯一', () => {
    expect(CONTENT_ENTRY_COUNT).toBe(12);
    expect(NAV_ENTRIES).toHaveLength(15);
    expect(new Set(NAV_ENTRIES.map((e) => e.id)).size).toBe(15);
    expect(systemEntries().map((e) => e.id)).toEqual(['guide', 'more', 'settings']);
  });

  it('分组归属：设置移出「能力」，社区市场归入「创作」，「历史」只放记录与版本', () => {
    expect(entriesOfGroup('conversation').map((e) => e.id)).toEqual(['chat', 'group']);
    expect(entriesOfGroup('creation').map((e) => e.id)).toEqual([
      'character',
      'worldbook',
      'databank',
      'story',
      'random-events',
      'market',
    ]);
    expect(entriesOfGroup('capability').map((e) => e.id)).toEqual(['local-model', 'image-gen']);
    expect(entriesOfGroup('archive').map((e) => e.id)).toEqual(['archives', 'version']);
    expect(NAV_ENTRIES.find((e) => e.id === 'settings')?.group).toBeNull();
  });

  it('四个分组各非空，且组内项之和等于内容项总数', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['conversation', 'creation', 'capability', 'archive']);
    const summed = NAV_GROUPS.reduce((acc, g) => acc + entriesOfGroup(g.id).length, 0);
    expect(summed).toBe(CONTENT_ENTRY_COUNT);
    for (const g of NAV_GROUPS) expect(entriesOfGroup(g.id).length).toBeGreaterThan(0);
  });

  it('每个内容项都能在聚合页或底部 Tab 之一露出，或个人入口已彻底移出导航', () => {
    expect(NAV_ENTRIES.some((e) => e.routeName === 'profile')).toBe(false);
    // A12（2-1）：worldbook / market 退出底部 Tab 后进"更多"；guide 从孤儿状态一并收进来
    expect(moreEntries().map((e) => e.id)).toEqual([
      'group',
      'worldbook',
      'databank',
      'story',
      'random-events',
      'local-model',
      'image-gen',
      'archives',
      'version',
      'market',
    ]);
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
  it('A12 后的 5 Tab 顺序：会话 / 角色 / 群聊 / 更多 / 设置', () => {
    expect(mobileTabEntries().map((e) => e.routeName)).toEqual([
      'chat',
      'character-list',
      'group',
      'more',
      'settings',
    ]);
  });

  it('没有"既不在 Tab、又不在更多"的孤儿入口（A12 判据）', () => {
    // 这条是 2-1 的核心：worldbook/market 退出 Tab 后必须进"更多"，
    // 否则用户手机上没有任何路径到达它们。
    // guide 是唯一白名单：它在「更多」页顶部有专门的进度卡（.more-guide），
    // 不走 inMore 列表——判据的意图是"有路"，它已经有了一条更好的路。
    const orphans = NAV_ENTRIES.filter((e) => !e.mobileTab && !e.inMore && e.id !== 'guide').map(
      (e) => e.id
    );
    expect(orphans, `这些入口在手机上无路可走：${orphans.join(', ')}`).toEqual([]);
  });

  it('每个 Tab 都有 mobile 短称谓回退', () => {
    for (const e of mobileTabEntries()) expect(e.mobileLabelKey).toBeTruthy();
  });
});
