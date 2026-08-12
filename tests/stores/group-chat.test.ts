/**
 * 群聊 Store 单元测试 (W7 · F10.1-F10.2)
 *
 * 覆盖：
 * - 群聊创建（含验证、首消息生成）
 * - 成员管理（添加/移除，含系统消息事件）
 * - 发言顺序：自然轮换（健谈度加权 + 避免连续发言）
 * - 指定发言（@角色）
 * - 消息动作（用户/AI/流式更新）
 * - 模式切换
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGroupChatStore } from '@/stores/group-chat';
import type { CharacterCard } from '@/core/character-card';

// ── 辅助构造 ──

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

describe('group-chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 默认 random=0.5，避免概率测试抖动
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  // ── 创建 ──

  describe('createGroup', () => {
    it('创建群聊需要至少 2 个成员', () => {
      const store = useGroupChatStore();
      const id = store.createGroup(
        { name: '单人群聊', memberIds: ['c1'] },
        [makeCard({ id: 'c1' })]
      );
      expect(id).toBeNull();
      expect(store.lastError).toContain('2-8');
      expect(store.groups).toHaveLength(0);
    });

    it('创建群聊最多 8 个成员', () => {
      const store = useGroupChatStore();
      const ids = Array.from({ length: 9 }, (_, i) => `c${i + 1}`);
      const cards = ids.map((id) => makeCard({ id }));
      const id = store.createGroup(
        { name: '9人群聊', memberIds: ids },
        cards
      );
      expect(id).toBeNull();
      expect(store.lastError).toContain('2-8');
    });

    it('创建群聊需要唯一名称', () => {
      const store = useGroupChatStore();
      const id = store.createGroup(
        { name: '   ', memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })]
      );
      expect(id).toBeNull();
      expect(store.lastError).toContain('名称');
    });

    it('成员重复时验证失败', () => {
      const store = useGroupChatStore();
      const id = store.createGroup(
        { name: '重复群聊', memberIds: ['c1', 'c1'] },
        [makeCard({ id: 'c1' })]
      );
      expect(id).toBeNull();
      expect(store.lastError).toContain('重复');
    });

    it('成功创建群聊并构造成员列表', () => {
      const store = useGroupChatStore();
      const id = store.createGroup(
        {
          name: '测试群聊',
          description: '描述',
          memberIds: ['c1', 'c2'],
          mode: 'natural',
        },
        [
          makeCard({ id: 'c1', name: 'Alice' }),
          makeCard({ id: 'c2', name: 'Bob' }),
        ]
      );
      expect(id).toBeTruthy();
      expect(store.groups).toHaveLength(1);
      const g = store.groups[0];
      expect(g.name).toBe('测试群聊');
      expect(g.members).toHaveLength(2);
      expect(g.members.map((m) => m.name).sort()).toEqual(['Alice', 'Bob']);
      expect(g.mode).toBe('natural');
      expect(g.lastSpeakerId).toBeNull();
      expect(store.currentGroupId).toBe(id);
      expect(store.lastInfo).toContain('已创建');
    });

    it('从成员的 alternateGreetings 随机选取首消息', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '问候群聊', memberIds: ['c1', 'c2'] },
        [
          makeCard({
            id: 'c1',
            name: 'Alice',
            alternateGreetings: ['Hello!', 'Hi!'],
          }),
          makeCard({ id: 'c2', name: 'Bob' }),
        ]
      );
      const g = store.groups[0];
      // Math.random=0.5，2 个候选选 index=1 → 'Hi!'
      expect(g.firstMessage).toBe('Hi!');
      expect(g.messages).toHaveLength(1);
      expect(g.messages[0].role).toBe('assistant');
      expect(g.messages[0].content).toBe('Hi!');
      expect(g.messages[0].characterId).toBe('c1'); // 第一个成员
    });

    it('无 alternateGreetings 时使用第一个成员的 firstMessage 兜底', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '兜底群聊', memberIds: ['c1', 'c2'] },
        [
          makeCard({ id: 'c1', name: 'Alice', firstMessage: '默认问候' }),
          makeCard({ id: 'c2', name: 'Bob' }),
        ]
      );
      expect(store.groups[0].firstMessage).toBe('默认问候');
    });

    it('显式传入 firstMessage 优先级最高', () => {
      const store = useGroupChatStore();
      store.createGroup(
        {
          name: '自定义群聊',
          memberIds: ['c1', 'c2'],
          firstMessage: '自定义首消息',
        },
        [
          makeCard({ id: 'c1', firstMessage: '默认', alternateGreetings: ['问候'] }),
          makeCard({ id: 'c2' }),
        ]
      );
      expect(store.groups[0].firstMessage).toBe('自定义首消息');
    });
  });

  // ── 成员管理 ──

  describe('成员管理', () => {
    function setupGroup() {
      const store = useGroupChatStore();
      const id = store.createGroup(
        { name: '群', memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1', name: 'Alice' }), makeCard({ id: 'c2', name: 'Bob' })]
      );
      return { store, id };
    }

    it('addMember 添加成员并生成 join 系统消息', () => {
      const { store, id } = setupGroup();
      const ok = store.addMember(id!, makeCard({ id: 'c3', name: 'Charlie' }));
      expect(ok).toBe(true);
      const g = store.groups[0];
      expect(g.members).toHaveLength(3);
      expect(g.members.find((m) => m.characterId === 'c3')?.name).toBe('Charlie');
      // 应有 join 事件系统消息
      const joinMsg = g.messages.find((m) => m.eventType === 'join');
      expect(joinMsg).toBeDefined();
      expect(joinMsg!.content).toContain('Charlie');
      expect(joinMsg!.content).toContain('加入');
    });

    it('addMember 拒绝已存在成员', () => {
      const { store, id } = setupGroup();
      const ok = store.addMember(id!, makeCard({ id: 'c1', name: 'Alice' }));
      expect(ok).toBe(false);
      expect(store.lastError).toContain('已在群聊中');
    });

    it('addMember 拒绝超过 8 人上限', () => {
      const { store, id } = setupGroup();
      // 添加 6 个达到 8 上限
      for (let i = 3; i <= 8; i++) {
        store.addMember(id!, makeCard({ id: `c${i}`, name: `Char${i}` }));
      }
      expect(store.groups[0].members).toHaveLength(8);
      // 第 9 个应失败
      const ok = store.addMember(id!, makeCard({ id: 'c9', name: 'Nine' }));
      expect(ok).toBe(false);
      expect(store.lastError).toContain('上限');
    });

    it('removeMember 移除成员并生成 leave 系统消息', () => {
      const { store, id } = setupGroup();
      const ok = store.removeMember(id!, 'c2');
      expect(ok).toBe(true);
      const g = store.groups[0];
      expect(g.members).toHaveLength(1);
      expect(g.members.find((m) => m.characterId === 'c2')).toBeUndefined();
      const leaveMsg = g.messages.find((m) => m.eventType === 'leave');
      expect(leaveMsg).toBeDefined();
      expect(leaveMsg!.content).toContain('Bob');
      expect(leaveMsg!.content).toContain('离开');
    });
  });

  // ── 发言顺序 ──

  describe('pickNextSpeaker 自然轮换', () => {
    function setupGroup(talkativeness: number[] = [50, 50]) {
      const store = useGroupChatStore();
      const cards = talkativeness.map((t, i) =>
        makeCard({ id: `c${i + 1}`, name: `Char${i + 1}`, talkativeness: t })
      );
      const id = store.createGroup(
        { name: '群', memberIds: cards.map((c) => c.id) },
        cards
      );
      return { store, id };
    }

    it('排除 lastSpeakerId', () => {
      const { store, id } = setupGroup([50, 50]);
      store.groups[0].lastSpeakerId = 'c1';
      const speaker = store.pickNextSpeaker(id!);
      expect(speaker).not.toBeNull();
      expect(speaker!.characterId).toBe('c2'); // 唯一非 c1 候选
    });

    it('所有成员都被排除时返回 null', () => {
      const { store, id } = setupGroup([50, 50]);
      // 设置 allowAutoSelect=false 给所有人
      store.groups[0].members.forEach((m) => (m.allowAutoSelect = false));
      const speaker = store.pickNextSpeaker(id!);
      expect(speaker).toBeNull();
    });

    it('按健谈度加权随机选择（高 talkativeness 更易被选中）', () => {
      // Math.random 固定为 0.5
      const { store, id } = setupGroup([10, 90]); // 总权重 100
      // random=0.5 * 100 = 50，遍历 candidates[0]=c1(权重10): 50-10=40>0
      // candidates[1]=c2(权重90): 40-90=-50<=0 → 选中 c2
      const speaker = store.pickNextSpeaker(id!);
      expect(speaker).not.toBeNull();
      expect(speaker!.characterId).toBe('c2');
    });

    it('不存在 lastSpeakerId 时从所有成员中选取', () => {
      const { store, id } = setupGroup([50, 50]);
      const speaker = store.pickNextSpeaker(id!);
      expect(speaker).not.toBeNull();
      // Math.random=0.5，2 个候选权重 50/50，总权重 100
      // 0.5*100=50，candidates[0]: 50-50=0<=0 → 选中 c1
      expect(speaker!.characterId).toBe('c1');
    });

    it('群聊不存在时返回 null', () => {
      const store = useGroupChatStore();
      expect(store.pickNextSpeaker('nonexistent')).toBeNull();
    });
  });

  describe('designateSpeaker 指定发言', () => {
    it('返回指定 characterId 的成员', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '群', memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1', name: 'Alice' }), makeCard({ id: 'c2', name: 'Bob' })]
      );
      const speaker = store.designateSpeaker(store.groups[0].id, 'c2');
      expect(speaker).not.toBeNull();
      expect(speaker!.name).toBe('Bob');
    });

    it('指定不存在的 characterId 返回 null', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '群', memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })]
      );
      const speaker = store.designateSpeaker(store.groups[0].id, 'nonexistent');
      expect(speaker).toBeNull();
    });

    it('allowAutoSelect=false 的成员不能被指定', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '群', memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })]
      );
      store.groups[0].members[1].allowAutoSelect = false;
      const speaker = store.designateSpeaker(store.groups[0].id, 'c2');
      expect(speaker).toBeNull();
    });
  });

  // ── 消息动作 ──

  describe('消息动作', () => {
    function setupEmptyGroup() {
      const store = useGroupChatStore();
      // firstMessage 为空避免初始消息
      const id = store.createGroup(
        { name: '群', memberIds: ['c1', 'c2'], firstMessage: '' },
        [makeCard({ id: 'c1', name: 'Alice' }), makeCard({ id: 'c2', name: 'Bob' })]
      );
      // createGroup 会用第一个成员的 firstMessage 兜底，这里清空确保从空消息状态开始测试
      store.groups[0].messages.splice(0);
      return { store, id };
    }

    it('addUserMessage 添加用户消息', () => {
      const { store, id } = setupEmptyGroup();
      store.addUserMessage(id!, '你好');
      const g = store.groups[0];
      expect(g.messages).toHaveLength(1);
      expect(g.messages[0].role).toBe('user');
      expect(g.messages[0].content).toBe('你好');
      expect(g.messages[0].eventType).toBe('none');
    });

    it('addAssistantMessage 添加 AI 消息并更新 lastSpeakerId', () => {
      const { store, id } = setupEmptyGroup();
      store.addAssistantMessage(id!, 'c1', 'Alice', '回复内容');
      const g = store.groups[0];
      expect(g.messages).toHaveLength(1);
      expect(g.messages[0].role).toBe('assistant');
      expect(g.messages[0].content).toBe('回复内容');
      expect(g.messages[0].characterId).toBe('c1');
      expect(g.messages[0].characterName).toBe('Alice');
      expect(g.lastSpeakerId).toBe('c1');
    });

    it('updateLastAssistantMessage 更新最近的 AI 消息内容', () => {
      const { store, id } = setupEmptyGroup();
      store.addUserMessage(id!, '你好');
      store.addAssistantMessage(id!, 'c1', 'Alice', '初始');
      store.updateLastAssistantMessage(id!, '更新后的内容');
      const g = store.groups[0];
      const aiMsg = g.messages.find((m) => m.role === 'assistant');
      expect(aiMsg!.content).toBe('更新后的内容');
    });

    it('updateLastAssistantMessage 跳过无 characterId 的消息', () => {
      const { store, id } = setupEmptyGroup();
      // 添加一个无 characterId 的 system 消息
      store.groups[0].messages.push({
        id: 'sys-1',
        role: 'system',
        content: '系统消息',
        timestamp: new Date().toISOString(),
        swipes: [],
        swipeIndex: 0,
        eventType: 'none',
      });
      store.addAssistantMessage(id!, 'c1', 'Alice', 'AI 回复');
      store.updateLastAssistantMessage(id!, '更新内容');
      const aiMsg = store.groups[0].messages.find((m) => m.role === 'assistant');
      expect(aiMsg!.content).toBe('更新内容');
    });
  });

  // ── 模式切换 ──

  describe('setMode 模式切换', () => {
    it('切换发言模式', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '群', memberIds: ['c1', 'c2'], mode: 'natural' },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })]
      );
      const id = store.groups[0].id;
      store.setMode(id, 'designated');
      expect(store.groups[0].mode).toBe('designated');
    });
  });

  // ── 删除/选中 ──

  describe('删除与选中', () => {
    it('selectGroup 设置当前群聊', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '群1', memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })]
      );
      store.createGroup(
        { name: '群2', memberIds: ['c1', 'c3'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c3' })]
      );
      // createGroup 用 unshift 插入，groups[0] 是最后创建的"群2"，groups[1] 是"群1"
      const firstId = store.groups[0].id;
      store.selectGroup(firstId);
      expect(store.currentGroupId).toBe(firstId);
      expect(store.currentGroup?.name).toBe('群2');
    });

    it('deleteGroup 删除群聊并切换 currentGroupId', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '群1', memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })]
      );
      store.createGroup(
        { name: '群2', memberIds: ['c1', 'c3'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c3' })]
      );
      // 防止 Date.now() 在同一毫秒内生成相同 id
      store.groups[0].id = 'group-test-1';
      store.groups[1].id = 'group-test-2';
      const firstId = store.groups[0].id;
      store.selectGroup(firstId);
      store.deleteGroup(firstId);
      expect(store.groups).toHaveLength(1);
      expect(store.groups.find((g) => g.id === firstId)).toBeUndefined();
      // currentGroupId 应切换到剩下的群聊
      expect(store.currentGroupId).toBe(store.groups[0].id);
    });
  });

  // ── F10.4 归档生命周期（需求6 验收补充）──

  describe('归档生命周期', () => {
    function makeGroup(store: ReturnType<typeof useGroupChatStore>, name = '群1') {
      store.createGroup(
        { name, memberIds: ['c1', 'c2'] },
        [makeCard({ id: 'c1' }), makeCard({ id: 'c2' })]
      );
      return store.groups[0].id;
    }

    it('手动归档后进入只读状态并追加归档消息', () => {
      const store = useGroupChatStore();
      const gid = makeGroup(store);
      expect(store.archiveGroup(gid)).toBe(true);
      const g = store.groups.find((x) => x.id === gid)!;
      expect(g.lifecycleStatus).toBe('archived');
      expect(g.archivedAt).toBeTruthy();
      expect(g.messages.at(-1)?.content).toContain('归档');
    });

    it('重复归档返回 false 并记录错误', () => {
      const store = useGroupChatStore();
      const gid = makeGroup(store);
      store.archiveGroup(gid);
      expect(store.archiveGroup(gid)).toBe(false);
      expect(store.lastError).toContain('归档');
    });

    it('已归档群聊不允许移除成员', () => {
      const store = useGroupChatStore();
      const gid = makeGroup(store);
      store.archiveGroup(gid);
      expect(store.removeMember(gid, 'c2')).toBe(false);
      expect(store.lastError).toContain('归档');
    });

    it('临时 NPC 全部离开后自动归档', () => {
      const store = useGroupChatStore();
      store.createGroup(
        { name: '临时群聊', memberIds: ['c1', 'c2'] },
        [
          makeCard({ id: 'c1' }),
          makeCard({ id: 'c2', tags: ['__temporary_npc'] }),
        ]
      );
      const gid = store.groups[0].id;
      expect(store.removeMember(gid, 'c2')).toBe(true);
      const g = store.groups.find((x) => x.id === gid)!;
      expect(g.lifecycleStatus).toBe('archived');
      expect(store.lastInfo).toContain('自动归档');
    });

    it('恢复归档群聊：成员角色卡缺失时拒绝', () => {
      const store = useGroupChatStore();
      const gid = makeGroup(store);
      store.archiveGroup(gid);
      const ok = store.restoreGroup(gid, (id) => id !== 'c2');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('丢失');
    });

    it('恢复归档群聊：角色卡齐全时成功并回到活跃态', () => {
      const store = useGroupChatStore();
      const gid = makeGroup(store);
      store.archiveGroup(gid);
      const ok = store.restoreGroup(gid, () => true);
      expect(ok).toBe(true);
      const g = store.groups.find((x) => x.id === gid)!;
      expect(g.lifecycleStatus).toBe('active');
      expect(g.archivedAt).toBeNull();
      expect(g.messages.at(-1)?.content).toContain('恢复活跃');
    });

    it('未归档群聊调用 restoreGroup 返回 false', () => {
      const store = useGroupChatStore();
      const gid = makeGroup(store);
      expect(store.restoreGroup(gid, () => true)).toBe(false);
      expect(store.lastError).toContain('未归档');
    });
  });
});
