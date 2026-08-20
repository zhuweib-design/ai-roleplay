/**
 * events store 单元测试 (迭代29 · F17.1)
 *
 * 覆盖：
 * - setCurrentLorebook 切换 Lorebook
 * - createEvent 创建事件（含场景事件数上限）
 * - updateEvent 更新事件（含校验）
 * - deleteEvent / deleteEventsByScene 删除
 * - setEventState 状态机
 * - triggerEvent / completeEvent / failEvent / resetEvent 状态操作
 * - getEvent / getEventByName / getEventsByScene / getTriggerableEvents / getActiveEvents 查询
 * - checkDependencies 前置依赖校验
 * - currentEvents / eventsByScene 计算属性
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useEventsStore } from '../../src/stores/events';
import { MAX_EVENTS_PER_SCENE } from '@core/event-types';

// ── 测试夹具 ──

/**
 * 创建一个合法的事件并返回其 id
 * 用于避免每次测试都手动设置 name/description/trigger
 */
function createValidEvent(
  store: ReturnType<typeof useEventsStore>,
  lorebookId = 'lb-1',
  sceneEntryId: string | null = null,
  sceneName: string | null = null,
  name = '测试事件'
): string {
  const id = store.createEvent(lorebookId, sceneEntryId, sceneName);
  if (!id) throw new Error('createValidEvent: 创建事件失败');
  store.updateEvent(id, {
    name,
    description: '测试事件描述内容',
    trigger: {
      type: 'keyword',
      keywords: ['关键词'],
      useRegex: false,
      caseSensitive: false,
    },
  });
  return id;
}

describe('events store (F17.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ── 初始状态 ──

  describe('初始状态', () => {
    it('events 为空数组', () => {
      const store = useEventsStore();
      expect(store.events).toEqual([]);
    });

    it('currentLorebookId 初始为 null', () => {
      const store = useEventsStore();
      expect(store.currentLorebookId).toBeNull();
    });

    it('lastError / lastInfo 初始为 null', () => {
      const store = useEventsStore();
      expect(store.lastError).toBeNull();
      expect(store.lastInfo).toBeNull();
    });

    it('currentEvents 初始为空', () => {
      const store = useEventsStore();
      expect(store.currentEvents).toEqual([]);
    });

    it('eventsByScene 初始为空 Map', () => {
      const store = useEventsStore();
      expect(store.eventsByScene.size).toBe(0);
    });
  });

  // ── setCurrentLorebook ──

  describe('setCurrentLorebook', () => {
    it('切换 currentLorebookId', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      expect(store.currentLorebookId).toBe('lb-1');
    });

    it('切换为 null', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.setCurrentLorebook(null);
      expect(store.currentLorebookId).toBeNull();
    });
  });

  // ── createEvent ──

  describe('createEvent', () => {
    it('创建全局事件并返回 id', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      expect(id).not.toBeNull();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^evt-/);
    });

    it('创建的事件默认状态为 pending', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const evt = store.getEvent(id!);
      expect(evt?.state).toBe('pending');
    });

    it('创建场景事件', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1', 'scene-1', '王都');
      const evt = store.getEvent(id!);
      expect(evt?.sceneEntryId).toBe('scene-1');
      expect(evt?.sceneName).toBe('王都');
    });

    it('创建事件后 lastInfo 提示', () => {
      const store = useEventsStore();
      store.createEvent('lb-1');
      expect(store.lastInfo).toBe('已创建新事件');
    });

    it('单场景事件数达到上限时返回 null', () => {
      const store = useEventsStore();
      // 填满上限
      for (let i = 0; i < MAX_EVENTS_PER_SCENE; i++) {
        const id = store.createEvent('lb-1', 'scene-1', '王都');
        expect(id).not.toBeNull();
      }
      // 第 21 个应失败
      const overflow = store.createEvent('lb-1', 'scene-1', '王都');
      expect(overflow).toBeNull();
      expect(store.lastError).toContain('已达上限');
    });

    it('不同场景的事件不互相影响上限', () => {
      const store = useEventsStore();
      for (let i = 0; i < MAX_EVENTS_PER_SCENE; i++) {
        store.createEvent('lb-1', 'scene-1', '王都');
      }
      // 不同场景仍可创建
      const id = store.createEvent('lb-1', 'scene-2', '酒馆');
      expect(id).not.toBeNull();
    });

    it('不同 Lorebook 的同场景事件不互相影响上限', () => {
      const store = useEventsStore();
      for (let i = 0; i < MAX_EVENTS_PER_SCENE; i++) {
        store.createEvent('lb-1', 'scene-1', '王都');
      }
      const id = store.createEvent('lb-2', 'scene-1', '王都');
      expect(id).not.toBeNull();
    });

    it('全局事件不受上限限制', () => {
      const store = useEventsStore();
      // 创建大量全局事件
      for (let i = 0; i < MAX_EVENTS_PER_SCENE + 5; i++) {
        const id = store.createEvent('lb-1');
        expect(id).not.toBeNull();
      }
    });

    it('创建事件含 createdAt / updatedAt', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const evt = store.getEvent(id!);
      expect(evt?.createdAt).toBeTruthy();
      expect(evt?.updatedAt).toBeTruthy();
    });

    it('创建事件 id 唯一', () => {
      const store = useEventsStore();
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const id = store.createEvent('lb-1');
        ids.add(id!);
      }
      expect(ids.size).toBe(10);
    });
  });

  // ── updateEvent ──

  describe('updateEvent', () => {
    it('更新事件名称', () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      const ok = store.updateEvent(id, { name: '新名称' });
      expect(ok).toBe(true);
      expect(store.getEvent(id)?.name).toBe('新名称');
    });

    it('更新事件描述', () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      const ok = store.updateEvent(id, { description: '新描述' });
      expect(ok).toBe(true);
      expect(store.getEvent(id)?.description).toBe('新描述');
    });

    it('更新触发条件', () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      const ok = store.updateEvent(id, {
        trigger: { type: 'manual' },
      });
      expect(ok).toBe(true);
      expect(store.getEvent(id)?.trigger.type).toBe('manual');
    });

    it('更新概率', () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      const ok = store.updateEvent(id, { probability: 50 });
      expect(ok).toBe(true);
      expect(store.getEvent(id)?.probability).toBe(50);
    });

    it('更新可重复标志', () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      const ok = store.updateEvent(id, { repeatable: true });
      expect(ok).toBe(true);
      expect(store.getEvent(id)?.repeatable).toBe(true);
    });

    it('更新事件后 lastInfo 提示', () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      store.updateEvent(id, { name: '新名称' });
      expect(store.lastInfo).toContain('已更新');
    });

    it('更新后 updatedAt 变化', async () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      const original = store.getEvent(id)!.updatedAt;
      // 等待至少 1ms 确保 ISO 时间戳不同
      await new Promise((r) => setTimeout(r, 5));
      store.updateEvent(id, { name: '新名称' });
      const updated = store.getEvent(id)!.updatedAt;
      expect(updated).not.toBe(original);
    });

    it('事件不存在时返回 false', () => {
      const store = useEventsStore();
      const ok = store.updateEvent('nonexistent', { name: 'x' });
      expect(ok).toBe(false);
      expect(store.lastError).toBe('事件不存在');
    });

    it('校验失败时返回 false', () => {
      const store = useEventsStore();
      const id = createValidEvent(store, 'lb-1', null, null, '合法名称');
      // 尝试设为空名称
      const ok = store.updateEvent(id, { name: '' });
      expect(ok).toBe(false);
      expect(store.lastError).toContain('事件名称不能为空');
      // 原名称保持不变
      expect(store.getEvent(id)?.name).toBe('合法名称');
    });

    it('校验失败时事件不被修改', () => {
      const store = useEventsStore();
      const id = createValidEvent(store, 'lb-1', null, null, '原名称');
      const before = { ...store.getEvent(id)! };
      // 尝试设为无效概率
      store.updateEvent(id, { probability: 999 });
      const after = store.getEvent(id)!;
      expect(after.probability).toBe(before.probability);
      expect(after.name).toBe(before.name);
    });
  });

  // ── deleteEvent ──

  describe('deleteEvent', () => {
    it('删除存在的事件', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const ok = store.deleteEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)).toBeUndefined();
    });

    it('删除事件后 lastInfo 提示', () => {
      const store = useEventsStore();
      const id = createValidEvent(store, 'lb-1', null, null, '待删除事件');
      store.deleteEvent(id);
      expect(store.lastInfo).toContain('已删除');
    });

    it('删除不存在的事件返回 false', () => {
      const store = useEventsStore();
      const ok = store.deleteEvent('nonexistent');
      expect(ok).toBe(false);
    });
  });

  // ── deleteEventsByScene ──

  describe('deleteEventsByScene', () => {
    it('删除指定场景下的所有事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-1', 'scene-2', '酒馆');

      const removed = store.deleteEventsByScene('scene-1');
      expect(removed).toBe(2);
      expect(store.getEventsByScene('scene-1')).toHaveLength(0);
      expect(store.getEventsByScene('scene-2')).toHaveLength(1);
    });

    it('删除不存在的场景返回 0', () => {
      const store = useEventsStore();
      const removed = store.deleteEventsByScene('nonexistent');
      expect(removed).toBe(0);
    });

    it('删除后 lastInfo 提示（仅当有删除时）', () => {
      const store = useEventsStore();
      store.createEvent('lb-1', 'scene-1', '王都');
      store.deleteEventsByScene('scene-1');
      expect(store.lastInfo).toContain('已删除');
    });

    it('无删除时 lastInfo 不变', () => {
      const store = useEventsStore();
      store.deleteEventsByScene('nonexistent');
      expect(store.lastInfo).toBeNull();
    });

    it('不影响其他 Lorebook 的事件', () => {
      const store = useEventsStore();
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-2', 'scene-1', '王都');

      const removed = store.deleteEventsByScene('scene-1');
      expect(removed).toBe(2);
      // 两个 Lorebook 的同场景事件都被删除
      expect(store.events).toHaveLength(0);
    });
  });

  // ── 状态管理 ──

  describe('setEventState', () => {
    it('设置事件为 active', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const ok = store.setEventState(id!, 'active');
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('active');
    });

    it('设置为 active 时 triggerCount +1', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.setEventState(id!, 'active');
      expect(store.getEvent(id!)?.triggerCount).toBe(1);
      store.setEventState(id!, 'active');
      expect(store.getEvent(id!)?.triggerCount).toBe(2);
    });

    it('设置为 active 时 lastTriggeredAt 被更新', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      expect(store.getEvent(id!)?.lastTriggeredAt).toBeNull();
      store.setEventState(id!, 'active');
      expect(store.getEvent(id!)?.lastTriggeredAt).not.toBeNull();
    });

    it('设置事件为 completed', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.setEventState(id!, 'active');
      store.setEventState(id!, 'completed');
      expect(store.getEvent(id!)?.state).toBe('completed');
    });

    it('设置事件为 failed', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.setEventState(id!, 'failed');
      expect(store.getEvent(id!)?.state).toBe('failed');
    });

    it('事件不存在时返回 false', () => {
      const store = useEventsStore();
      const ok = store.setEventState('nonexistent', 'active');
      expect(ok).toBe(false);
      expect(store.lastError).toBe('事件不存在');
    });

    it('状态变更后 updatedAt 更新', async () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const before = store.getEvent(id!)!.updatedAt;
      await new Promise((r) => setTimeout(r, 5));
      store.setEventState(id!, 'active');
      const after = store.getEvent(id!)!.updatedAt;
      expect(after).not.toBe(before);
    });
  });

  describe('triggerEvent', () => {
    it('pending 状态可触发', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const ok = store.triggerEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('active');
    });

    it('active 状态不可重复触发', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.triggerEvent(id!);
      const ok = store.triggerEvent(id!);
      expect(ok).toBe(false);
      expect(store.lastError).toContain('不可触发');
    });

    it('completed 且不可重复时不可触发', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.triggerEvent(id!);
      store.completeEvent(id!);
      const ok = store.triggerEvent(id!);
      expect(ok).toBe(false);
    });

    it('completed 且可重复时可触发', () => {
      const store = useEventsStore();
      const id = createValidEvent(store);
      store.updateEvent(id, { repeatable: true });
      store.triggerEvent(id);
      store.completeEvent(id);
      const ok = store.triggerEvent(id);
      expect(ok).toBe(true);
      expect(store.getEvent(id)?.state).toBe('active');
    });

    it('failed 状态不可触发', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.failEvent(id!);
      const ok = store.triggerEvent(id!);
      expect(ok).toBe(false);
    });

    it('事件不存在时返回 false', () => {
      const store = useEventsStore();
      const ok = store.triggerEvent('nonexistent');
      expect(ok).toBe(false);
      expect(store.lastError).toBe('事件不存在');
    });
  });

  describe('completeEvent', () => {
    it('active 状态可完成', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.triggerEvent(id!);
      const ok = store.completeEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('completed');
    });

    it('pending 状态不可完成', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const ok = store.completeEvent(id!);
      expect(ok).toBe(false);
      expect(store.lastError).toContain('不在进行中');
    });

    it('completed 状态不可重复完成', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.triggerEvent(id!);
      store.completeEvent(id!);
      const ok = store.completeEvent(id!);
      expect(ok).toBe(false);
    });

    it('事件不存在时返回 false', () => {
      const store = useEventsStore();
      const ok = store.completeEvent('nonexistent');
      expect(ok).toBe(false);
    });
  });

  describe('failEvent', () => {
    it('任意状态可标记为失败', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const ok = store.failEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('failed');
    });

    it('active 状态可标记失败', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.triggerEvent(id!);
      const ok = store.failEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('failed');
    });
  });

  describe('resetEvent', () => {
    it('active 状态可重置为 pending', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.triggerEvent(id!);
      const ok = store.resetEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('pending');
    });

    it('completed 状态可重置', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.triggerEvent(id!);
      store.completeEvent(id!);
      const ok = store.resetEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('pending');
    });

    it('failed 状态可重置', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.failEvent(id!);
      const ok = store.resetEvent(id!);
      expect(ok).toBe(true);
      expect(store.getEvent(id!)?.state).toBe('pending');
    });

    it('pending 状态重置仍为 pending', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.resetEvent(id!);
      expect(store.getEvent(id!)?.state).toBe('pending');
    });
  });

  // ── 查询 ──

  describe('getEvent', () => {
    it('返回存在的事件', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      const evt = store.getEvent(id!);
      expect(evt).toBeDefined();
      expect(evt?.id).toBe(id);
    });

    it('不存在的事件返回 undefined', () => {
      const store = useEventsStore();
      expect(store.getEvent('nonexistent')).toBeUndefined();
    });
  });

  describe('getEventByName', () => {
    it('按名称返回事件', () => {
      const store = useEventsStore();
      const id = createValidEvent(store, 'lb-1', null, null, '寻宝任务');
      const evt = store.getEventByName('寻宝任务');
      expect(evt).toBeDefined();
      expect(evt?.id).toBe(id);
    });

    it('名称不匹配返回 undefined', () => {
      const store = useEventsStore();
      expect(store.getEventByName('不存在')).toBeUndefined();
    });

    it('指定 lorebookId 过滤', () => {
      const store = useEventsStore();
      const id1 = createValidEvent(store, 'lb-1', null, null, '同名任务');
      createValidEvent(store, 'lb-2', null, null, '同名任务');

      const evt = store.getEventByName('同名任务', 'lb-1');
      expect(evt).toBeDefined();
      expect(evt?.id).toBe(id1);
      expect(evt?.lorebookId).toBe('lb-1');
    });

    it('指定 lorebookId 不匹配返回 undefined', () => {
      const store = useEventsStore();
      createValidEvent(store, 'lb-1', null, null, '任务');
      expect(store.getEventByName('任务', 'lb-2')).toBeUndefined();
    });

    it('不指定 lorebookId 跨 Lorebook 查询', () => {
      const store = useEventsStore();
      createValidEvent(store, 'lb-2', null, null, '跨库任务');
      const evt = store.getEventByName('跨库任务');
      expect(evt).toBeDefined();
      expect(evt?.lorebookId).toBe('lb-2');
    });

    it('同名事件返回第一个', () => {
      const store = useEventsStore();
      const id1 = createValidEvent(store, 'lb-1', null, null, '同名');
      createValidEvent(store, 'lb-1', null, null, '同名');
      const evt = store.getEventByName('同名');
      expect(evt).toBeDefined();
      // 应返回先创建的事件
      expect(evt?.id).toBe(id1);
    });
  });

  describe('getEventsByScene', () => {
    it('返回指定场景的事件（仅当前 Lorebook）', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-1', 'scene-2', '酒馆');

      expect(store.getEventsByScene('scene-1')).toHaveLength(2);
      expect(store.getEventsByScene('scene-2')).toHaveLength(1);
    });

    it('全局事件通过 sceneEntryId=null 查询', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.createEvent('lb-1');
      store.createEvent('lb-1', 'scene-1', '王都');

      expect(store.getEventsByScene(null)).toHaveLength(1);
    });

    it('其他 Lorebook 的事件不返回', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-2', 'scene-1', '王都');

      expect(store.getEventsByScene('scene-1')).toHaveLength(1);
      expect(store.getEventsByScene('scene-1')[0]!.lorebookId).toBe('lb-1');
    });

    it('currentLorebookId 为 null 时返回空', () => {
      const store = useEventsStore();
      store.createEvent('lb-1', 'scene-1', '王都');
      expect(store.getEventsByScene('scene-1')).toHaveLength(0);
    });
  });

  describe('getTriggerableEvents', () => {
    it('返回所有 pending 事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      createValidEvent(store, 'lb-1', null, null, '事件1');
      createValidEvent(store, 'lb-1', null, null, '事件2');

      const triggerable = store.getTriggerableEvents();
      expect(triggerable).toHaveLength(2);
    });

    it('不返回 active 事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      const id = createValidEvent(store, 'lb-1', null, null, '事件');
      store.triggerEvent(id);

      expect(store.getTriggerableEvents()).toHaveLength(0);
    });

    it('completed 不可重复事件不返回', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      const id = createValidEvent(store, 'lb-1', null, null, '事件');
      store.updateEvent(id, { repeatable: false });
      store.triggerEvent(id);
      store.completeEvent(id);

      expect(store.getTriggerableEvents()).toHaveLength(0);
    });

    it('completed 可重复事件返回', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      const id = createValidEvent(store, 'lb-1', null, null, '事件');
      store.updateEvent(id, { repeatable: true });
      store.triggerEvent(id);
      store.completeEvent(id);

      expect(store.getTriggerableEvents()).toHaveLength(1);
    });

    it('failed 事件不返回', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      const id = createValidEvent(store, 'lb-1', null, null, '事件');
      store.failEvent(id);

      expect(store.getTriggerableEvents()).toHaveLength(0);
    });

    it('仅返回当前 Lorebook 的事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      createValidEvent(store, 'lb-1', null, null, '事件1');
      createValidEvent(store, 'lb-2', null, null, '事件2');

      expect(store.getTriggerableEvents()).toHaveLength(1);
    });
  });

  describe('getActiveEvents', () => {
    it('返回 active 状态事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      const id1 = createValidEvent(store, 'lb-1', null, null, '事件1');
      createValidEvent(store, 'lb-1', null, null, '事件2');
      store.triggerEvent(id1);

      const active = store.getActiveEvents();
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe(id1);
    });

    it('不返回 pending 事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      createValidEvent(store, 'lb-1', null, null, '事件');

      expect(store.getActiveEvents()).toHaveLength(0);
    });

    it('不返回 completed 事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      const id = createValidEvent(store, 'lb-1', null, null, '事件');
      store.triggerEvent(id);
      store.completeEvent(id);

      expect(store.getActiveEvents()).toHaveLength(0);
    });
  });

  // ── 计算属性 ──

  describe('currentEvents', () => {
    it('返回当前 Lorebook 的事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.createEvent('lb-1');
      store.createEvent('lb-1');
      store.createEvent('lb-2');

      expect(store.currentEvents).toHaveLength(2);
    });

    it('currentLorebookId 为 null 时返回空', () => {
      const store = useEventsStore();
      store.createEvent('lb-1');
      expect(store.currentEvents).toHaveLength(0);
    });

    it('切换 Lorebook 后更新', () => {
      const store = useEventsStore();
      store.createEvent('lb-1');
      store.createEvent('lb-2');

      store.setCurrentLorebook('lb-1');
      expect(store.currentEvents).toHaveLength(1);
      store.setCurrentLorebook('lb-2');
      expect(store.currentEvents).toHaveLength(1);
      store.setCurrentLorebook(null);
      expect(store.currentEvents).toHaveLength(0);
    });
  });

  describe('eventsByScene', () => {
    it('按场景分组', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.createEvent('lb-1'); // 全局
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-1', 'scene-2', '酒馆');

      const map = store.eventsByScene;
      expect(map.size).toBe(3); // null, scene-1, scene-2
      expect(map.get(null)).toHaveLength(1);
      expect(map.get('scene-1')).toHaveLength(2);
      expect(map.get('scene-2')).toHaveLength(1);
    });

    it('仅包含当前 Lorebook 的事件', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      store.createEvent('lb-1', 'scene-1', '王都');
      store.createEvent('lb-2', 'scene-1', '王都');

      const map = store.eventsByScene;
      expect(map.size).toBe(1);
      expect(map.get('scene-1')).toHaveLength(1);
    });

    it('无事件时返回空 Map', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');
      expect(store.eventsByScene.size).toBe(0);
    });
  });

  // ── checkDependencies ──

  describe('checkDependencies', () => {
    it('非依赖触发条件返回 true', () => {
      const store = useEventsStore();
      const id = createValidEvent(store, 'lb-1', null, null, '事件');
      const evt = store.getEvent(id)!;
      expect(store.checkDependencies(evt)).toBe(true);
    });

    it('前置事件全部完成返回 true', () => {
      const store = useEventsStore();
      const id1 = createValidEvent(store, 'lb-1', null, null, '前置事件');
      const id2 = store.createEvent('lb-1');
      store.updateEvent(id2!, {
        name: '后续事件',
        description: '描述',
        trigger: { type: 'dependency', requiredEvents: ['前置事件'] },
      });
      store.triggerEvent(id1);
      store.completeEvent(id1);

      const evt = store.getEvent(id2!)!;
      expect(store.checkDependencies(evt)).toBe(true);
    });

    it('前置事件未完成返回 false', () => {
      const store = useEventsStore();
      createValidEvent(store, 'lb-1', null, null, '前置事件');
      const id2 = store.createEvent('lb-1');
      store.updateEvent(id2!, {
        name: '后续事件',
        description: '描述',
        trigger: { type: 'dependency', requiredEvents: ['前置事件'] },
      });
      // 前置事件仍为 pending

      const evt = store.getEvent(id2!)!;
      expect(store.checkDependencies(evt)).toBe(false);
    });

    it('前置事件部分完成返回 false', () => {
      const store = useEventsStore();
      const id1 = createValidEvent(store, 'lb-1', null, null, '前置A');
      createValidEvent(store, 'lb-1', null, null, '前置B');
      const id3 = store.createEvent('lb-1');
      store.updateEvent(id3!, {
        name: '后续',
        description: '描述',
        trigger: { type: 'dependency', requiredEvents: ['前置A', '前置B'] },
      });
      store.triggerEvent(id1);
      store.completeEvent(id1);
      // 前置B 仍 pending

      const evt = store.getEvent(id3!)!;
      expect(store.checkDependencies(evt)).toBe(false);
    });

    it('前置事件不存在返回 false', () => {
      const store = useEventsStore();
      const id = store.createEvent('lb-1');
      store.updateEvent(id!, {
        name: '后续',
        description: '描述',
        trigger: { type: 'dependency', requiredEvents: ['不存在的事件'] },
      });

      const evt = store.getEvent(id!)!;
      expect(store.checkDependencies(evt)).toBe(false);
    });

    it('跨 Lorebook 的同名事件不视为前置依赖', () => {
      const store = useEventsStore();
      const id1 = createValidEvent(store, 'lb-1', null, null, '前置');
      const id2 = store.createEvent('lb-2');
      store.updateEvent(id2!, {
        name: '后续',
        description: '描述',
        trigger: { type: 'dependency', requiredEvents: ['前置'] },
      });
      store.triggerEvent(id1);
      store.completeEvent(id1);

      const evt = store.getEvent(id2!)!;
      expect(store.checkDependencies(evt)).toBe(false);
    });
  });

  // ── clearLastError ──

  describe('clearLastError', () => {
    it('清除 lastError 和 lastInfo', () => {
      const store = useEventsStore();
      store.createEvent('lb-1');
      store.updateEvent('nonexistent', { name: 'x' });
      expect(store.lastError).not.toBeNull();
      store.clearLastError();
      expect(store.lastError).toBeNull();
      expect(store.lastInfo).toBeNull();
    });
  });

  // ── 综合场景 ──

  describe('综合场景', () => {
    it('完整的事件生命周期', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');

      // 创建 → 编辑 → 触发 → 完成 → 重置 → 触发 → 失败
      const id = createValidEvent(store, 'lb-1', null, null, '寻宝任务');
      store.updateEvent(id, {
        description: '玩家找到宝藏',
        trigger: { type: 'keyword', keywords: ['宝藏'], useRegex: false, caseSensitive: false },
        probability: 80,
        repeatable: true,
      });

      const evt1 = store.getEvent(id)!;
      expect(evt1.state).toBe('pending');
      expect(evt1.probability).toBe(80);

      store.triggerEvent(id);
      expect(store.getEvent(id)?.state).toBe('active');
      expect(store.getEvent(id)?.triggerCount).toBe(1);

      store.completeEvent(id);
      expect(store.getEvent(id)?.state).toBe('completed');

      // 可重复 → 重置后再次触发
      store.resetEvent(id);
      expect(store.getEvent(id)?.state).toBe('pending');

      store.triggerEvent(id);
      expect(store.getEvent(id)?.triggerCount).toBe(2);

      store.failEvent(id);
      expect(store.getEvent(id)?.state).toBe('failed');
    });

    it('多场景多事件并行管理', () => {
      const store = useEventsStore();
      store.setCurrentLorebook('lb-1');

      // 场景1：3 个事件
      for (let i = 0; i < 3; i++) {
        createValidEvent(store, 'lb-1', 'scene-1', '王都', `王都事件${i + 1}`);
      }
      // 场景2：2 个事件
      for (let i = 0; i < 2; i++) {
        createValidEvent(store, 'lb-1', 'scene-2', '酒馆', `酒馆事件${i + 1}`);
      }
      // 全局：1 个事件
      createValidEvent(store, 'lb-1', null, null, '全局事件');

      expect(store.currentEvents).toHaveLength(6);
      expect(store.eventsByScene.size).toBe(3);

      // 触发部分事件
      const scene1Events = store.getEventsByScene('scene-1');
      store.triggerEvent(scene1Events[0]!.id);
      store.triggerEvent(scene1Events[1]!.id);

      expect(store.getActiveEvents()).toHaveLength(2);
      expect(store.getTriggerableEvents()).toHaveLength(4); // 剩余 4 个 pending

      // 删除场景1 的所有事件
      store.deleteEventsByScene('scene-1');
      expect(store.currentEvents).toHaveLength(3); // 2 酒馆 + 1 全局
    });
  });
});
