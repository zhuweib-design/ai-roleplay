/**
 * Events Store (F17.1, v1.1 新增)
 *
 * 职责：
 * 1. 事件 CRUD（内存维护，生命周期跟随会话）
 * 2. 按场景分组查询
 * 3. 事件状态管理（触发/完成/失败）
 * 4. 校验单个场景事件数上限
 *
 * 持久化策略：当前为简化实现，事件仅在内存中维护。
 * 后续可扩展为序列化到 Lorebook 的扩展字段进行持久化。
 */
import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  type StoryEvent,
  type StoryEventPatch,
  type EventState,
  validateEventValues,
  validateEventCompleteness,
  createDefaultEvent,
  MAX_EVENTS_PER_SCENE,
  isTriggerable,
} from '@core/event-types';

export const useEventsStore = defineStore('events', () => {
  // ── 状态 ──
  const events = ref<StoryEvent[]>([]);
  const currentLorebookId = ref<string | null>(null);

  // 错误/提示
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // ── 计算属性 ──

  /** 当前 Lorebook 的事件 */
  const currentEvents = computed(() =>
    events.value.filter((e) => e.lorebookId === currentLorebookId.value)
  );

  /** 按场景分组的事件 */
  const eventsByScene = computed(() => {
    const map = new Map<string | null, StoryEvent[]>();
    for (const e of currentEvents.value) {
      const key = e.sceneEntryId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  });

  // ── 依赖注入 ──

  function setCurrentLorebook(lorebookId: string | null): void {
    currentLorebookId.value = lorebookId;
  }

  // ── CRUD ──

  /**
   * 创建事件
   * @param lorebookId 所属 Lorebook
   * @param sceneEntryId 绑定场景条目 ID（null=全局）
   * @param sceneName 场景名称（冗余存储）
   * @returns 新事件 id（失败返回 null）
   */
  function createEvent(
    lorebookId: string,
    sceneEntryId: string | null = null,
    sceneName: string | null = null
  ): string | null {
    // 校验场景事件数上限
    if (sceneEntryId !== null) {
      const count = events.value.filter(
        (e) => e.sceneEntryId === sceneEntryId && e.lorebookId === lorebookId
      ).length;
      if (count >= MAX_EVENTS_PER_SCENE) {
        lastError.value = t('ev.eventLimit2', { max: MAX_EVENTS_PER_SCENE });
        return null;
      }
    }

    const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const base = createDefaultEvent(lorebookId, sceneEntryId, sceneName);
    const newEvent: StoryEvent = {
      ...base,
      id,
      createdAt: now,
      updatedAt: now,
    };

    events.value.push(newEvent);
    lastInfo.value = t('ev.created2');
    return id;
  }

  /**
   * 更新事件
   *
   * 只拦**取值错误**（超长、概率越界、正则非法）；"还没填够"不是写入失败的理由，
   * 那是 `triggerEvent` 的事。原因见 `validateEventCompleteness` 的注释：
   * 拿合并后的整条事件跑完整性校验，等于让新建事件一个字段都存不进去。
   *
   * @param options.silent 逐字段输入用：不写 `lastInfo`。面板监听 `lastInfo` 弹提示，
   *   不静默的话敲一个字弹一条"已更新"。
   */
  function updateEvent(
    id: string,
    patch: StoryEventPatch,
    options?: { silent?: boolean }
  ): boolean {
    const idx = events.value.findIndex((e) => e.id === id);
    if (idx < 0) {
      lastError.value = t('ev.notFound');
      return false;
    }

    const merged = { ...events.value[idx]!, ...patch };
    const errors = validateEventValues(merged);
    if (errors.length > 0) {
      lastError.value = errors.join('；');
      return false;
    }

    merged.updatedAt = new Date().toISOString();
    events.value[idx] = merged;
    if (!options?.silent) lastInfo.value = t('ev.updated2', { name: merged.name });
    return true;
  }

  /**
   * 删除事件
   */
  function deleteEvent(id: string): boolean {
    const idx = events.value.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    const removed = events.value.splice(idx, 1)[0]!;
    lastInfo.value = t('ev.deleted2', { name: removed.name });
    return true;
  }

  /**
   * 删除指定场景下的所有事件（场景被删除时调用）
   */
  function deleteEventsByScene(sceneEntryId: string): number {
    const before = events.value.length;
    events.value = events.value.filter((e) => e.sceneEntryId !== sceneEntryId);
    const removed = before - events.value.length;
    if (removed > 0) {
      lastInfo.value = t('ev.boundDeleted', { count: removed });
    }
    return removed;
  }

  // ── 状态管理 ──

  /**
   * 设置事件状态
   */
  function setEventState(id: string, state: EventState): boolean {
    const evt = events.value.find((e) => e.id === id);
    if (!evt) {
      lastError.value = t('ev.notFound');
      return false;
    }

    evt.state = state;
    evt.updatedAt = new Date().toISOString();

    if (state === 'active') {
      evt.triggerCount += 1;
      evt.lastTriggeredAt = new Date().toISOString();
      // 触发后若不可重复，状态保持为 active（等待完成）
      // 若可重复，下次扫描时回到 pending
    } else if (state === 'pending' && evt.repeatable) {
      // 可重复事件重置
    }

    lastInfo.value = t('ev.statusChanged', { name: evt.name, state });
    return true;
  }

  /**
   * 手动触发事件（/event trigger 命令）
   *
   * 完整性在这里拦，不在 `updateEvent` 拦：字段编辑要能一路存进去，
   * 而"要拿去用了"才需要一条不缺字段的事件。自动触发路径（`chat-context` 的
   * `scanAndApplyTriggers`）走的也是这个函数，所以配不全的事件既不会激活、
   * 也不会被注入提示词。
   */
  function triggerEvent(id: string): boolean {
    const evt = events.value.find((e) => e.id === id);
    if (!evt) {
      lastError.value = t('ev.notFound');
      return false;
    }
    if (!isTriggerable(evt)) {
      lastError.value = t('ev.cannotTrigger', { name: evt.name, state: evt.state });
      return false;
    }
    const missing = validateEventCompleteness(evt);
    if (missing.length > 0) {
      lastError.value = missing.join('；');
      return false;
    }
    return setEventState(id, 'active');
  }

  /**
   * 手动完成事件（/event complete 命令）
   */
  function completeEvent(id: string): boolean {
    const evt = events.value.find((e) => e.id === id);
    if (!evt) {
      lastError.value = t('ev.notFound');
      return false;
    }
    if (evt.state !== 'active') {
      lastError.value = t('ev.notActive', { name: evt.name });
      return false;
    }
    return setEventState(id, 'completed');
  }

  /**
   * 标记事件为失败
   */
  function failEvent(id: string): boolean {
    return setEventState(id, 'failed');
  }

  /**
   * 重置事件到待触发状态
   */
  function resetEvent(id: string): boolean {
    return setEventState(id, 'pending');
  }

  // ── 查询 ──

  /**
   * 按 ID 获取事件
   */
  function getEvent(id: string): StoryEvent | undefined {
    return events.value.find((e) => e.id === id);
  }

  /**
   * 按名称获取事件（用于前置依赖引用）
   */
  function getEventByName(name: string, lorebookId?: string): StoryEvent | undefined {
    return events.value.find(
      (e) => e.name === name && (lorebookId === undefined || e.lorebookId === lorebookId)
    );
  }

  /**
   * 获取指定场景下的事件
   */
  function getEventsByScene(sceneEntryId: string | null): StoryEvent[] {
    return events.value.filter(
      (e) => e.sceneEntryId === sceneEntryId && e.lorebookId === currentLorebookId.value
    );
  }

  /**
   * 获取当前 Lorebook 中所有可触发的事件
   */
  function getTriggerableEvents(): StoryEvent[] {
    return currentEvents.value.filter(isTriggerable);
  }

  /**
   * 获取当前 Lorebook 中所有进行中的事件
   */
  function getActiveEvents(): StoryEvent[] {
    return currentEvents.value.filter((e) => e.state === 'active');
  }

  /**
   * 校验前置依赖是否满足
   * @param event 当前事件
   * @returns true 表示所有前置事件已完成
   */
  function checkDependencies(event: StoryEvent): boolean {
    if (event.trigger.type !== 'dependency') return true;
    const required = event.trigger.requiredEvents;
    return required.every((name) => {
      const dep = getEventByName(name, event.lorebookId);
      return dep?.state === 'completed';
    });
  }

  function clearLastError(): void {
    lastError.value = null;
    lastInfo.value = null;
  }

  return {
    // 状态
    events,
    currentLorebookId,
    lastError,
    lastInfo,
    // 计算属性
    currentEvents,
    eventsByScene,
    // 依赖注入
    setCurrentLorebook,
    // CRUD
    createEvent,
    updateEvent,
    deleteEvent,
    deleteEventsByScene,
    // 状态管理
    setEventState,
    triggerEvent,
    completeEvent,
    failEvent,
    resetEvent,
    // 查询
    getEvent,
    getEventByName,
    getEventsByScene,
    getTriggerableEvents,
    getActiveEvents,
    checkDependencies,
    clearLastError,
  };
});
