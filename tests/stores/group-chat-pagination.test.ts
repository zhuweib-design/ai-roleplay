/**
 * group-chat store — UX-03 游标分页（尾部窗口）单元测试
 *
 * 覆盖：
 * - 默认只渲染最近 TURN_PAGE_SIZE（60）条，且为尾部切片
 * - hasOlderTurns / hiddenOlderCount 正确
 * - loadOlderTurns 按页扩窗，扩到全量后返回 false
 * - 消息总量不足页大小时全量渲染
 * - 切换 / 创建 / 删除群组时游标重置
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGroupChatStore } from '@/stores/group-chat';
import type { CharacterCard } from '@/core/character-card';

function makeCard(patch: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: patch.id ?? `char-${Math.random().toString(36).slice(2, 9)}`,
    name: patch.name ?? '测试角色',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '你好',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...patch,
  };
}

/** 向群组直接灌入 n 条可区分的消息（msg-0001…） */
function seedMessages(groupId: string, n: number): void {
  const store = useGroupChatStore();
  const g = store.groups.find((x) => x.id === groupId)!;
  for (let i = 0; i < n; i++) {
    g.messages.push({
      id: `msg-${String(i + 1).padStart(4, '0')}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i + 1}`,
      timestamp: '2025-01-01T00:00:00.000Z',
      swipes: [],
      swipeIndex: 0,
    });
  }
}

function createTwoMemberGroup(store: ReturnType<typeof useGroupChatStore>): string {
  const id = store.createGroup(
    { name: '分页群聊', memberIds: ['c1', 'c2'] },
    [makeCard({ id: 'c1', name: 'A' }), makeCard({ id: 'c2', name: 'B' })]
  );
  expect(id).not.toBeNull();
  return id!;
}

/** 灌消息到精确总数 n（createGroup 自带首消息，先扣除） */
function seedToTotal(groupId: string, n: number): void {
  const store = useGroupChatStore();
  const g = store.groups.find((x) => x.id === groupId)!;
  seedMessages(groupId, Math.max(0, n - g.messages.length));
}

describe('group-chat store — UX-03 游标分页', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('默认尾部窗口：200 条只渲染最近 60 条', () => {
    const store = useGroupChatStore();
    const id = createTwoMemberGroup(store);
    seedToTotal(id, 200);

    expect(store.currentMessages).toHaveLength(200); // 完整历史不受影响
    expect(store.visibleMessages).toHaveLength(60);
    // 首条为 createGroup 自带消息（非种子 id），种子共 199 条 → 尾部 60 条为 msg-0140…msg-0199
    expect(store.visibleMessages[0]!.id).toBe('msg-0140');
    expect(store.visibleMessages.at(-1)!.id).toBe('msg-0199');
    expect(store.hasOlderTurns).toBe(true);
    expect(store.hiddenOlderCount).toBe(140);
  });

  it('loadOlderTurns 按页扩窗，扩到全量后返回 false', () => {
    const store = useGroupChatStore();
    const id = createTwoMemberGroup(store);
    seedToTotal(id, 200);

    expect(store.loadOlderTurns()).toBe(true); // 60 → 120
    expect(store.visibleMessages).toHaveLength(120);
    expect(store.visibleMessages[0]!.id).toBe('msg-0080');
    expect(store.hiddenOlderCount).toBe(80);

    expect(store.loadOlderTurns()).toBe(true); // 120 → 180
    expect(store.loadOlderTurns()).toBe(false); // 180 → 200（封顶）
    expect(store.visibleMessages).toHaveLength(200);
    expect(store.hasOlderTurns).toBe(false);
    // 再扩不再变化
    expect(store.loadOlderTurns()).toBe(false);
    expect(store.visibleMessages).toHaveLength(200);
  });

  it('消息总量不足页大小时全量渲染，无更早消息', () => {
    const store = useGroupChatStore();
    const id = createTwoMemberGroup(store);
    seedToTotal(id, 30);

    expect(store.visibleMessages).toHaveLength(30);
    expect(store.hasOlderTurns).toBe(false);
    expect(store.hiddenOlderCount).toBe(0);
    expect(store.loadOlderTurns()).toBe(false);
  });

  it('切换群组时游标重置回默认窗口', () => {
    const store = useGroupChatStore();
    const id1 = createTwoMemberGroup(store);
    seedToTotal(id1, 200);
    store.loadOlderTurns();
    store.loadOlderTurns();
    expect(store.visibleMessages).toHaveLength(180);

    const id2 = createTwoMemberGroup(store); // createGroup 内部重置游标
    seedToTotal(id2, 150);
    expect(store.visibleMessages).toHaveLength(60);

    store.loadOlderTurns();
    store.selectGroup(id1); // selectGroup 重置游标
    expect(store.visibleMessages).toHaveLength(60);
  });

  it('删除当前群组回退到其他群组时游标重置', () => {
    const store = useGroupChatStore();
    const id1 = createTwoMemberGroup(store);
    const id2 = createTwoMemberGroup(store);
    seedToTotal(id1, 200);
    seedToTotal(id2, 100);

    store.selectGroup(id1);
    store.loadOlderTurns();
    store.loadOlderTurns();
    expect(store.visibleMessages).toHaveLength(180);

    store.deleteGroup(id1);
    expect(store.currentMessages).toHaveLength(100);
    expect(store.visibleMessages).toHaveLength(60); // 已重置
  });
});
