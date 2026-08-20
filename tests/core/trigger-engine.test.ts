/**
 * trigger-engine 单元测试 (迭代29 · F17.2)
 *
 * 覆盖：
 * - matchKeywords：关键词匹配（普通/正则/大小写）
 * - scanTriggers：触发扫描全流程
 *   - active 事件完成条件检查
 *   - 候选事件筛选（按场景/状态）
 *   - 关键词触发
 *   - 前置依赖触发
 *   - manual / time 触发跳过
 *   - 概率判定（100% 必触发，0% 必不触发）
 *   - 每轮最多触发 1 个
 * - buildActiveEventsInjection：激活事件描述注入
 */
import { describe, test, expect } from 'vitest';
import {
  scanTriggers,
  buildActiveEventsInjection,
  matchKeywords,
  type TriggerContext,
} from '@core/trigger-engine';
import type { StoryEvent } from '@core/event-types';

// ── 测试夹具 ──

function makeEvent(overrides: Partial<StoryEvent> = {}): StoryEvent {
  const now = new Date().toISOString();
  return {
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    name: '测试事件',
    description: '测试事件描述',
    lorebookId: 'lb-1',
    sceneEntryId: null,
    sceneName: null,
    trigger: {
      type: 'keyword',
      keywords: ['测试'],
      useRegex: false,
      caseSensitive: false,
    },
    completion: { manualOnly: true },
    probability: 100,
    state: 'pending',
    repeatable: false,
    triggerCount: 0,
    createdAt: now,
    updatedAt: now,
    lastTriggeredAt: null,
    ...overrides,
  };
}

function makeContext(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    recentMessages: ['这是一条测试消息'],
    currentSceneId: null,
    getEventByName: () => undefined,
    ...overrides,
  };
}

// ── matchKeywords 测试 ──

describe('matchKeywords', () => {
  test('普通匹配命中返回 true', () => {
    expect(matchKeywords(['旅人'], ['一位旅人走了进来'], false, false)).toBe(true);
  });

  test('未命中返回 false', () => {
    expect(matchKeywords(['旅人'], ['一位骑士走了进来'], false, false)).toBe(false);
  });

  test('多关键词任一命中', () => {
    expect(matchKeywords(['旅人', '骑士'], ['一位骑士走了进来'], false, false)).toBe(true);
  });

  test('空关键词列表返回 false', () => {
    expect(matchKeywords([], ['消息'], false, false)).toBe(false);
  });

  test('空消息列表返回 false', () => {
    expect(matchKeywords(['关键词'], [], false, false)).toBe(false);
  });

  test('默认大小写不敏感', () => {
    expect(matchKeywords(['hello'], ['Hello World'], false, false)).toBe(true);
  });

  test('大小写敏感时不匹配大小写差异', () => {
    expect(matchKeywords(['hello'], ['Hello World'], false, true)).toBe(false);
  });

  test('正则匹配', () => {
    expect(matchKeywords(['\\d+'], ['消息 123 包含数字'], true, false)).toBe(true);
  });

  test('正则不匹配', () => {
    expect(matchKeywords(['^\\d+$'], ['消息 abc'], true, false)).toBe(false);
  });

  test('无效正则忽略不抛错', () => {
    expect(() => matchKeywords(['[invalid'], ['消息'], true, false)).not.toThrow();
    expect(matchKeywords(['[invalid'], ['消息'], true, false)).toBe(false);
  });

  test('跨多条消息匹配', () => {
    expect(matchKeywords(['旅人'], ['第一句', '旅人到了'], false, false)).toBe(true);
  });
});

// ── scanTriggers 测试 ──

describe('scanTriggers', () => {
  test('无事件返回空结果', () => {
    const result = scanTriggers([], makeContext());
    expect(result.triggered).toBeNull();
    expect(result.completed).toHaveLength(0);
  });

  test('关键词匹配触发', () => {
    const evt = makeEvent({
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
      probability: 100,
    });
    const ctx = makeContext({ recentMessages: ['一位旅人走了进来'] });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered?.id).toBe(evt.id);
  });

  test('关键词未匹配不触发', () => {
    const evt = makeEvent({
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
    });
    const ctx = makeContext({ recentMessages: ['一位骑士走了进来'] });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered).toBeNull();
  });

  test('已 active 事件不重复触发', () => {
    const evt = makeEvent({ state: 'active' });
    const result = scanTriggers([evt], makeContext());
    expect(result.triggered).toBeNull();
  });

  test('已 completed 事件默认不触发', () => {
    const evt = makeEvent({ state: 'completed' });
    const result = scanTriggers([evt], makeContext());
    expect(result.triggered).toBeNull();
  });

  test('已 completed 但 repeatable 的事件可重新触发', () => {
    const evt = makeEvent({
      state: 'completed',
      repeatable: true,
      probability: 100,
    });
    const result = scanTriggers([evt], makeContext());
    expect(result.triggered?.id).toBe(evt.id);
  });

  test('已 failed 事件不触发', () => {
    const evt = makeEvent({ state: 'failed' });
    const result = scanTriggers([evt], makeContext());
    expect(result.triggered).toBeNull();
  });

  test('manual 触发类型不自动触发', () => {
    const evt = makeEvent({
      trigger: { type: 'manual' },
      probability: 100,
    });
    const result = scanTriggers([evt], makeContext());
    expect(result.triggered).toBeNull();
  });

  test('time 触发类型在无 currentStoryTime 时不触发', () => {
    const evt = makeEvent({
      trigger: { type: 'time', storyTime: '第 3 天' },
      probability: 100,
    });
    const result = scanTriggers([evt], makeContext());
    expect(result.triggered).toBeNull();
    // 应当出现在 skipped 中，原因为无时间上下文
    const skip = result.skipped.find((s) => s.eventName === evt.name);
    expect(skip).toBeDefined();
    expect(skip?.reason).toContain('时间');
  });

  test('time 触发：currentStoryTime 匹配则触发', () => {
    const evt = makeEvent({
      trigger: { type: 'time', storyTime: '第 3 天' },
      probability: 100,
    });
    const ctx = makeContext({ currentStoryTime: '第 3 天' });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered?.id).toBe(evt.id);
  });

  test('time 触发：currentStoryTime 不匹配则不触发', () => {
    const evt = makeEvent({
      trigger: { type: 'time', storyTime: '第 3 天' },
      probability: 100,
    });
    const ctx = makeContext({ currentStoryTime: '第 5 天' });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered).toBeNull();
    const skip = result.skipped.find((s) => s.eventName === evt.name);
    expect(skip).toBeDefined();
    expect(skip?.reason).toContain('不匹配');
  });

  test('time 触发：currentStoryTime 为空字符串视为无上下文', () => {
    const evt = makeEvent({
      trigger: { type: 'time', storyTime: '第 3 天' },
      probability: 100,
    });
    const ctx = makeContext({ currentStoryTime: '' });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered).toBeNull();
  });

  test('time 触发与 keyword 触发共存时，按优先级择一触发', () => {
    const timeEvt = makeEvent({
      id: 'evt-time',
      name: '时间事件',
      trigger: { type: 'time', storyTime: '第 3 天' },
      probability: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const kwEvt = makeEvent({
      id: 'evt-kw',
      name: '关键词事件',
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
      probability: 100,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const ctx = makeContext({
      recentMessages: ['旅人来了'],
      currentStoryTime: '第 3 天',
    });
    const result = scanTriggers([timeEvt, kwEvt], ctx);
    // 两者概率都 100，应触发其中一个
    expect(result.triggered).not.toBeNull();
    expect(['evt-time', 'evt-kw']).toContain(result.triggered?.id);
  });

  test('dependency 触发：所有前置完成才触发', () => {
    const dep1 = makeEvent({ name: '前置事件 1', state: 'completed' });
    const dep2 = makeEvent({ name: '前置事件 2', state: 'completed' });
    const evt = makeEvent({
      trigger: {
        type: 'dependency',
        requiredEvents: ['前置事件 1', '前置事件 2'],
      },
      probability: 100,
    });
    const ctx = makeContext({
      getEventByName: (name) => [dep1, dep2].find((e) => e.name === name),
    });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered?.id).toBe(evt.id);
  });

  test('dependency 触发：前置未全部完成不触发', () => {
    const dep1 = makeEvent({ name: '前置事件 1', state: 'completed' });
    const dep2 = makeEvent({ name: '前置事件 2', state: 'pending' });
    const evt = makeEvent({
      trigger: {
        type: 'dependency',
        requiredEvents: ['前置事件 1', '前置事件 2'],
      },
      probability: 100,
    });
    const ctx = makeContext({
      getEventByName: (name) => [dep1, dep2].find((e) => e.name === name),
    });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered).toBeNull();
  });

  test('dependency 触发：缺少 getEventByName 不触发', () => {
    const evt = makeEvent({
      trigger: {
        type: 'dependency',
        requiredEvents: ['前置事件'],
      },
      probability: 100,
    });
    const ctx = makeContext({ getEventByName: undefined });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered).toBeNull();
  });

  test('场景过滤：全局事件始终匹配', () => {
    const evt = makeEvent({
      sceneEntryId: null,
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
      probability: 100,
    });
    const ctx = makeContext({
      recentMessages: ['旅人'],
      currentSceneId: 'scene-A',
    });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered?.id).toBe(evt.id);
  });

  test('场景过滤：非全局事件需匹配当前场景', () => {
    const evt = makeEvent({
      sceneEntryId: 'scene-A',
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
      probability: 100,
    });
    const ctxMatch = makeContext({
      recentMessages: ['旅人'],
      currentSceneId: 'scene-A',
    });
    expect(scanTriggers([evt], ctxMatch).triggered?.id).toBe(evt.id);

    const ctxNoMatch = makeContext({
      recentMessages: ['旅人'],
      currentSceneId: 'scene-B',
    });
    expect(scanTriggers([evt], ctxNoMatch).triggered).toBeNull();
  });

  test('概率 0% 必不触发', () => {
    const evt = makeEvent({
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
      probability: 0,
    });
    const ctx = makeContext({ recentMessages: ['旅人'] });
    const result = scanTriggers([evt], ctx);
    expect(result.triggered).toBeNull();
  });

  test('每轮最多触发 1 个事件', () => {
    const evt1 = makeEvent({
      id: 'evt-1',
      name: '事件 1',
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
      probability: 100,
    });
    const evt2 = makeEvent({
      id: 'evt-2',
      name: '事件 2',
      trigger: {
        type: 'keyword',
        keywords: ['旅人'],
        useRegex: false,
        caseSensitive: false,
      },
      probability: 100,
    });
    const ctx = makeContext({ recentMessages: ['旅人'] });
    const result = scanTriggers([evt1, evt2], ctx);
    expect(result.triggered).not.toBeNull();
    // 只触发一个
    expect(result.triggered?.id === 'evt-1' || result.triggered?.id === 'evt-2').toBe(true);
  });

  test('优先级：probability 高的优先触发', () => {
    const evt1 = makeEvent({
      id: 'evt-low',
      name: '低概率',
      probability: 50,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const evt2 = makeEvent({
      id: 'evt-high',
      name: '高概率',
      probability: 100,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const ctx = makeContext({ recentMessages: ['测试'] });
    const result = scanTriggers([evt1, evt2], ctx);
    // 高概率应优先（但仍有 50% 概率失败时才轮到低的）
    // 这里 evt2 概率 100 必触发
    expect(result.triggered?.id).toBe('evt-high');
  });

  test('完成条件检查：active 事件匹配完成关键词应进入 completed', () => {
    const evt = makeEvent({
      state: 'active',
      completion: {
        manualOnly: false,
        keywords: ['结束'],
        useRegex: false,
      },
    });
    const ctx = makeContext({ recentMessages: ['故事结束了'] });
    const result = scanTriggers([evt], ctx);
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0]!.id).toBe(evt.id);
  });

  test('完成条件 manualOnly 跳过自动完成', () => {
    const evt = makeEvent({
      state: 'active',
      completion: { manualOnly: true },
    });
    const ctx = makeContext({ recentMessages: ['结束'] });
    const result = scanTriggers([evt], ctx);
    expect(result.completed).toHaveLength(0);
  });

  test('skipped 包含跳过原因', () => {
    const evt = makeEvent({
      trigger: { type: 'manual' },
      probability: 100,
    });
    const result = scanTriggers([evt], makeContext());
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.skipped[0]!.eventName).toBe(evt.name);
    expect(result.skipped[0]!.reason).toContain('手动');
  });
});

// ── buildActiveEventsInjection 测试 ──

describe('buildActiveEventsInjection', () => {
  test('无激活事件返回空字符串', () => {
    const evt = makeEvent({ state: 'pending' });
    expect(buildActiveEventsInjection([evt])).toBe('');
  });

  test('空事件列表返回空字符串', () => {
    expect(buildActiveEventsInjection([])).toBe('');
  });

  test('包含激活事件描述', () => {
    const evt = makeEvent({
      state: 'active',
      name: '神秘旅人来访',
      description: '黄昏时分，旅人叩门',
    });
    const text = buildActiveEventsInjection([evt]);
    expect(text).toContain('神秘旅人来访');
    expect(text).toContain('黄昏时分，旅人叩门');
    expect(text).toContain('当前进行中的事件');
  });

  test('包含场景名标签', () => {
    const evt = makeEvent({
      state: 'active',
      name: '事件',
      description: '描述',
      sceneName: '酒馆',
    });
    const text = buildActiveEventsInjection([evt]);
    expect(text).toContain('[酒馆]');
  });

  test('多个激活事件全部注入', () => {
    const evt1 = makeEvent({
      id: 'e1',
      state: 'active',
      name: '事件一',
      description: '描述一',
    });
    const evt2 = makeEvent({
      id: 'e2',
      state: 'active',
      name: '事件二',
      description: '描述二',
    });
    const text = buildActiveEventsInjection([evt1, evt2]);
    expect(text).toContain('事件一');
    expect(text).toContain('事件二');
  });
});
