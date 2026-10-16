/**
 * E11 的裁剪视图（core/event-trace.ts）
 *
 * 这个函数存在的意义就是"少给"：事件正文（模型生成的整段文本）不进会话、
 * 不进持久化。所以这里最要紧的断言是**不含 description**，
 * 以及"没注入就是空数组"（调用方据此不写字段，旧数据零迁移）。
 */
import { describe, it, expect } from 'vitest';
import { toEventTraceItems } from '@core/event-trace';
import type { StoryEvent } from '@core/event-types';

function evt(overrides: Partial<StoryEvent> = {}): StoryEvent {
  return {
    id: 'rand-evt-1',
    name: '集市上的骚动',
    description: '有人在集市打翻了香料摊，人群围了上去。这段正文绝不该出现在痕迹里。',
    lorebookId: 'lb-1',
    sceneEntryId: null,
    sceneName: null,
    state: 'active',
    ...overrides,
  } as StoryEvent;
}

describe('toEventTraceItems', () => {
  it('只收激活事件', () => {
    const items = toEventTraceItems([
      evt({ id: 'a', state: 'active' }),
      evt({ id: 'b', state: 'completed' }),
      evt({ id: 'c', state: 'pending' }),
    ]);
    expect(items.map((i) => i.eventId)).toEqual(['a']);
  });

  it('不带正文，只带标识', () => {
    const item = toEventTraceItems([evt()])[0]!;
    expect(item).toEqual({ eventId: 'rand-evt-1', name: '集市上的骚动' });
    expect(JSON.stringify(item)).not.toContain('香料摊');
  });

  it('随机事件的 sceneName 固定为 null → 字段整个不写（而不是留一个空串）', () => {
    const item = toEventTraceItems([evt({ sceneName: null })])[0]!;
    expect(item).not.toHaveProperty('sceneName');
  });

  it('有场景标签时保留（世界书事件带得来）', () => {
    const item = toEventTraceItems([evt({ sceneName: '黄昏集市' })])[0]!;
    expect(item.sceneName).toBe('黄昏集市');
  });

  it('空 / undefined → 空数组（调用方据此不写字段）', () => {
    expect(toEventTraceItems([])).toEqual([]);
    expect(toEventTraceItems(undefined)).toEqual([]);
  });

  it('数量兜底：极端手工数据下最多 8 条', () => {
    const many = Array.from({ length: 12 }, (_, i) => evt({ id: `e${i}` }));
    expect(toEventTraceItems(many)).toHaveLength(8);
  });
});
