/**
 * random-event-generator 单元测试 (迭代29 · F17.3)
 *
 * 覆盖：
 * - DEFAULT_RANDOM_EVENT_PROBABILITY 默认值
 * - shouldTriggerRandomEvent 概率判定
 * - buildRandomEventMessages Prompt 构建
 * - parseGeneratedRandomEvent 容错解析
 * - generatedRandomEventToStoryEvent 转换
 */
import { describe, test, expect } from 'vitest';
import {
  DEFAULT_RANDOM_EVENT_PROBABILITY,
  shouldTriggerRandomEvent,
  buildRandomEventMessages,
  parseGeneratedRandomEvent,
  generatedRandomEventToStoryEvent,
  type RandomEventParams,
} from '@core/random-event-generator';

// ── 测试夹具 ──

function makeParams(overrides: Partial<RandomEventParams> = {}): RandomEventParams {
  return {
    sceneName: '神秘森林',
    sceneDescription: '一片幽深的森林',
    worldName: '艾瑟兰',
    worldType: 'fantasy',
    recentMessages: ['主角走进了森林'],
    activeEventNames: [],
    ...overrides,
  };
}

// ── 常量测试 ──

describe('DEFAULT_RANDOM_EVENT_PROBABILITY', () => {
  test('默认值为 10', () => {
    expect(DEFAULT_RANDOM_EVENT_PROBABILITY).toBe(10);
  });
});

// ── shouldTriggerRandomEvent 测试 ──

describe('shouldTriggerRandomEvent', () => {
  test('概率 0 必不触发', () => {
    for (let i = 0; i < 50; i++) {
      expect(shouldTriggerRandomEvent(0)).toBe(false);
    }
  });

  test('概率 100 必触发', () => {
    for (let i = 0; i < 50; i++) {
      expect(shouldTriggerRandomEvent(100)).toBe(true);
    }
  });

  test('负数概率视为不触发', () => {
    expect(shouldTriggerRandomEvent(-10)).toBe(false);
  });

  test('超过 100 视为必触发', () => {
    expect(shouldTriggerRandomEvent(150)).toBe(true);
  });

  test('默认参数使用 10% 概率', () => {
    // 统计学：50 次中应有约 5 次触发，但保证至少 1 次和至多 49 次（避免极端边界）
    let triggered = 0;
    for (let i = 0; i < 100; i++) {
      if (shouldTriggerRandomEvent()) triggered++;
    }
    expect(triggered).toBeGreaterThan(0);
    expect(triggered).toBeLessThan(100);
  });
});

// ── buildRandomEventMessages 测试 ──

describe('buildRandomEventMessages', () => {
  test('返回 system + user 两条消息', () => {
    const messages = buildRandomEventMessages(makeParams());
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
  });

  test('system 消息包含 RPG 事件生成器角色', () => {
    const messages = buildRandomEventMessages(makeParams());
    expect(messages[0]!.content).toContain('事件生成器');
  });

  test('user 消息包含场景名称', () => {
    const messages = buildRandomEventMessages(makeParams({ sceneName: '幽暗沼泽' }));
    expect(messages[1]!.content).toContain('幽暗沼泽');
  });

  test('user 消息包含世界名称', () => {
    const messages = buildRandomEventMessages(makeParams({ worldName: '泰拉瑞亚' }));
    expect(messages[1]!.content).toContain('泰拉瑞亚');
  });

  test('user 消息包含最近对话', () => {
    const messages = buildRandomEventMessages(
      makeParams({ recentMessages: ['主角说了什么'] })
    );
    expect(messages[1]!.content).toContain('主角说了什么');
  });

  test('user 消息包含已激活事件名（避免冲突）', () => {
    const messages = buildRandomEventMessages(
      makeParams({ activeEventNames: ['已激活事件 X'] })
    );
    expect(messages[1]!.content).toContain('已激活事件 X');
  });

  test('user 消息要求 JSON 格式返回', () => {
    const messages = buildRandomEventMessages(makeParams());
    expect(messages[1]!.content).toMatch(/JSON/i);
  });

  test('user 消息包含随机种子', () => {
    const messages = buildRandomEventMessages(
      makeParams({ seed: 'test-seed-12345' })
    );
    expect(messages[1]!.content).toContain('test-seed-12345');
  });

  test('无场景描述时不报错', () => {
    const messages = buildRandomEventMessages(
      makeParams({ sceneDescription: undefined })
    );
    expect(messages).toHaveLength(2);
  });

  test('无激活事件时不输出已激活事件块', () => {
    const messages = buildRandomEventMessages(
      makeParams({ activeEventNames: [] })
    );
    // 不应包含【已激活事件】块标记（避免重复提示）
    expect(messages[1]!.content).not.toContain('【已激活事件】');
  });
});

// ── parseGeneratedRandomEvent 测试 ──

describe('parseGeneratedRandomEvent', () => {
  test('解析标准 JSON', () => {
    const raw = JSON.stringify({
      name: '神秘访客',
      description: '一位披着斗篷的访客出现在酒馆门口',
    });
    const result = parseGeneratedRandomEvent(raw);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('神秘访客');
    expect(result?.description).toContain('披着斗篷');
    expect(result?.isOneShot).toBe(true);
  });

  test('解析带 markdown 代码块的 JSON', () => {
    const raw = '```json\n{"name":"事件","description":"描述"}\n```';
    const result = parseGeneratedRandomEvent(raw);
    expect(result?.name).toBe('事件');
    expect(result?.description).toBe('描述');
  });

  test('解析带前后缀文本的 JSON', () => {
    const raw = '好的，这是事件：\n{"name":"事件","description":"描述"}\n希望你喜欢。';
    const result = parseGeneratedRandomEvent(raw);
    expect(result?.name).toBe('事件');
  });

  test('name 为空返回 null', () => {
    const raw = JSON.stringify({ name: '', description: '描述' });
    expect(parseGeneratedRandomEvent(raw)).toBeNull();
  });

  test('description 为空返回 null', () => {
    const raw = JSON.stringify({ name: '事件', description: '' });
    expect(parseGeneratedRandomEvent(raw)).toBeNull();
  });

  test('name 超长返回 null', () => {
    const longName = 'a'.repeat(51);
    const raw = JSON.stringify({ name: longName, description: '描述' });
    expect(parseGeneratedRandomEvent(raw)).toBeNull();
  });

  test('description 超长返回 null', () => {
    const longDesc = 'a'.repeat(2001);
    const raw = JSON.stringify({ name: '事件', description: longDesc });
    expect(parseGeneratedRandomEvent(raw)).toBeNull();
  });

  test('无效 JSON 返回 null', () => {
    expect(parseGeneratedRandomEvent('不是 JSON')).toBeNull();
  });

  test('空字符串返回 null', () => {
    expect(parseGeneratedRandomEvent('')).toBeNull();
  });

  test('null 输入返回 null', () => {
    expect(parseGeneratedRandomEvent(null as unknown as string)).toBeNull();
  });

  test('缺少大括号返回 null', () => {
    expect(parseGeneratedRandomEvent('没有花括号的内容')).toBeNull();
  });

  test('JSON 但类型错误（数组）返回 null', () => {
    expect(parseGeneratedRandomEvent('[1,2,3]')).toBeNull();
  });

  test('trim 处理 name 和 description', () => {
    const raw = JSON.stringify({
      name: '  事件名  ',
      description: '  描述  ',
    });
    const result = parseGeneratedRandomEvent(raw);
    expect(result?.name).toBe('事件名');
    expect(result?.description).toBe('描述');
  });
});

// ── generatedRandomEventToStoryEvent 测试 ──

describe('generatedRandomEventToStoryEvent', () => {
  test('生成 StoryEvent 包含正确字段', () => {
    const generated = {
      name: '神秘访客',
      description: '访客描述',
      isOneShot: true as const,
    };
    const event = generatedRandomEventToStoryEvent(generated, 'lb-1');
    expect(event.id).toMatch(/^rand-evt-/);
    expect(event.name).toBe('神秘访客');
    expect(event.description).toBe('访客描述');
    expect(event.lorebookId).toBe('lb-1');
    expect(event.sceneEntryId).toBeNull();
    expect(event.sceneName).toBeNull();
    expect(event.state).toBe('active');
    expect(event.repeatable).toBe(false);
    expect(event.triggerCount).toBe(1);
    expect(event.createdAt).toBeTruthy();
    expect(event.updatedAt).toBeTruthy();
    expect(event.lastTriggeredAt).toBeTruthy();
  });

  test('trigger 类型为 manual（不通过自动触发）', () => {
    const event = generatedRandomEventToStoryEvent(
      { name: '事件', description: '描述', isOneShot: true },
      'lb-1'
    );
    expect(event.trigger.type).toBe('manual');
  });

  test('completion 为 manualOnly', () => {
    const event = generatedRandomEventToStoryEvent(
      { name: '事件', description: '描述', isOneShot: true },
      'lb-1'
    );
    expect(event.completion.manualOnly).toBe(true);
  });

  test('probability 为 100', () => {
    const event = generatedRandomEventToStoryEvent(
      { name: '事件', description: '描述', isOneShot: true },
      'lb-1'
    );
    expect(event.probability).toBe(100);
  });

  test('生成多个事件 ID 不重复', () => {
    const generated = { name: '事件', description: '描述', isOneShot: true as const };
    const e1 = generatedRandomEventToStoryEvent(generated, 'lb-1');
    const e2 = generatedRandomEventToStoryEvent(generated, 'lb-1');
    expect(e1.id).not.toBe(e2.id);
  });
});
