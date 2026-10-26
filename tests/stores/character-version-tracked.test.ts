/**
 * "哪些角色已被版本跟踪"可查询（E19）
 *
 * 仓库是选中角色时懒创建的，此前没有任何办法在界面上看出这件事——
 * 侧栏「版本管理」进去才知道。store 补 `hasRepository` / `trackedCharacterIds`
 * 之后，角色卡才能老实标出"已跟踪"。
 * 这里守的是：未跟踪的角色不能被误标（假标记比没有标记更糟）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useCharacterStore } from '@/stores/character';
import { seedCharacter } from '../helpers/character-fixtures';

describe('trackedCharacterIds / hasRepository', () => {
  let store: ReturnType<typeof useCharacterVersionStore>;
  let charStore: ReturnType<typeof useCharacterStore>;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    charStore = useCharacterStore();
    // 角色库从空开始：版本跟踪要按 id 找得到角色，先造一个 seraphina
    seedCharacter(charStore as never, { id: 'seraphina', name: 'Seraphina' });
    store = useCharacterVersionStore();
    store.setStorageAdapter(null);
    store._resetForTesting();
  });

  it('一开始没有任何角色被跟踪', () => {
    expect(store.trackedCharacterIds.size).toBe(0);
    expect(store.hasRepository('seraphina')).toBe(false);
  });

  it('选中角色后该角色进入跟踪集合，其他角色不受影响', () => {
    store.selectCharacter('seraphina');

    expect(store.hasRepository('seraphina')).toBe(true);
    expect([...store.trackedCharacterIds]).toContain('seraphina');
    expect(store.trackedCharacterIds.size).toBe(1);
  });

  it('不存在的角色 id 不会凭空建仓库（ensureRepositoryForCharacter 是内部懒建，只经 selectCharacter 走）', () => {
    store.selectCharacter('no-such-character');
    expect(store.hasRepository('no-such-character')).toBe(false);
    expect(store.trackedCharacterIds.size).toBe(0);
  });

  it('删除仓库后标记随之消失（标记读的是事实，不是历史痕迹）', () => {
    store.selectCharacter('seraphina');
    expect(store.hasRepository('seraphina')).toBe(true);

    store.deleteRepository('seraphina');

    expect(store.hasRepository('seraphina')).toBe(false);
    expect(store.trackedCharacterIds.has('seraphina')).toBe(false);
  });

  it('跟踪集合与 repositories 列表始终同源', () => {
    store.selectCharacter('seraphina');
    store.selectCharacter(charStore.characters[1]?.id ?? 'kael');

    expect([...store.trackedCharacterIds].sort()).toEqual(
      store.repositories.map((r) => r.characterId).sort()
    );
  });
});
