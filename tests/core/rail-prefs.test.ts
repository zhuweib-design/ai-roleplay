/**
 * 侧栏入口显隐偏好单元测试（M2-b8）
 *
 * 三条必须成立的性质：
 * 1. 默认全部显示；勾选状态能存下来也能读回来；
 * 2. 「更多」与「设置」**在任何情况下都不可隐藏**（含脏数据、含直接调 toggle）——
 *    编辑器住在「更多」页里，能藏掉它就是把自己锁在门外；
 * 3. 脏数据不能让导航坏掉：未知 id、非数组、JSON 解析失败一律退回"全部显示"。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PINNED_ENTRY_IDS,
  editableRailEntries,
  hiddenRailCount,
  isEntryVisible,
  loadRailVisibility,
  showAllRailEntries,
  toggleRailEntry,
  visibleSystemEntries,
} from '@core/rail-prefs';

const STATE_KEY = 'ai-roleplay:rail-visibility.v1';

describe('rail-prefs', () => {
  beforeEach(() => {
    localStorage.clear();
    showAllRailEntries();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('默认全部显示，计数为 0', () => {
    expect(hiddenRailCount()).toBe(0);
    expect(isEntryVisible('story')).toBe(true);
    expect(isEntryVisible('guide')).toBe(true);
  });

  it('隐藏 → 显示状态翻转，且写进 localStorage', () => {
    toggleRailEntry('story');
    expect(isEntryVisible('story')).toBe(false);
    expect(hiddenRailCount()).toBe(1);
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as { hidden?: string[] };
    expect(raw.hidden).toEqual(['story']);

    toggleRailEntry('story');
    expect(isEntryVisible('story')).toBe(true);
    expect(hiddenRailCount()).toBe(0);
  });

  it('可编辑清单不含钉底项，但含内容项与引导', () => {
    const ids = editableRailEntries().map((e) => e.id);
    for (const pinned of PINNED_ENTRY_IDS) expect(ids).not.toContain(pinned);
    expect(ids).toContain('story');
    expect(ids).toContain('guide');
    expect(ids).toContain('chat');
  });

  it('钉底项藏不掉：直接 toggle 无效，脏数据里带它也会被剔掉', () => {
    toggleRailEntry('settings');
    toggleRailEntry('more');
    expect(isEntryVisible('settings')).toBe(true);
    expect(isEntryVisible('more')).toBe(true);
    expect(hiddenRailCount()).toBe(0);

    localStorage.setItem(STATE_KEY, JSON.stringify({ hidden: ['settings', 'more', 'story'] }));
    expect(loadRailVisibility().hidden).toEqual(['story']);
  });

  it('脏数据一律退回"全部显示"而不是抛错', () => {
    localStorage.setItem(STATE_KEY, 'not json');
    expect(loadRailVisibility().hidden).toEqual([]);

    localStorage.setItem(STATE_KEY, JSON.stringify({ hidden: 'story' }));
    expect(loadRailVisibility().hidden).toEqual([]);

    localStorage.setItem(STATE_KEY, JSON.stringify({ hidden: ['no-such-entry', 42] }));
    expect(loadRailVisibility().hidden).toEqual([]);
  });

  it('恢复显示全部入口一次清空', () => {
    toggleRailEntry('story');
    toggleRailEntry('databank');
    expect(hiddenRailCount()).toBe(2);
    showAllRailEntries();
    expect(hiddenRailCount()).toBe(0);
    expect(isEntryVisible('story')).toBe(true);
  });

  it('系统项渲染顺序保持（引导 → 更多 → 设置），且引导可隐藏后两项仍在', () => {
    expect(visibleSystemEntries().map((e) => e.id)).toEqual(['guide', 'more', 'settings']);
    toggleRailEntry('guide');
    expect(visibleSystemEntries().map((e) => e.id)).toEqual(['more', 'settings']);
  });
});
