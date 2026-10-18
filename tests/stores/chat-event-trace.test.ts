/**
 * 随机事件注入回显（E11）的 store 级契约
 *
 * 为什么要在 store 层测：世界书那边（E02）曾在浏览器里抓到一次静默失效——
 * 痕迹写到了 CharacterCard 上（带 `[key: string]: unknown`，typecheck 过得去），
 * 结果既不渲染也不落盘。这里直接断言**响应式消息对象**上的 `eventTrace`。
 *
 * 三条：
 * 1. 有激活事件 → 回复消息带 eventTrace，且**只带名字不带正文**；
 * 2. 负向对照：没有激活事件时不写该字段（回复照常生成）；
 *    已完成（completed）的事件不算注入——两个注入构建器都只收 state==='active'；
 * 3. 重新生成必须清掉上一轮的痕迹（本轮带了哪条事件属于本轮）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/stores/chat';
import { useLorebookStore } from '@/stores/lorebook';
import { useEventsStore } from '@/stores/events';
import type { StoryEvent } from '@core/event-types';
import type { UICharacter, ApiProfile } from '@/types';

function makeCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'evt-char',
    name: 'EventChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'E',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '测试角色',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  };
}

function makeApiProfile(): ApiProfile {
  return {
    id: 'evt-profile',
    name: 'Event Profile',
    provider: 'openai',
    baseUrl: 'https://example.test',
    apiKey: 'sk-test',
    model: 'gpt-4o',
  };
}

function makeSSEResponse(content: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`)
      );
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as Response;
}

function makeEvent(overrides: Partial<StoryEvent>): StoryEvent {
  const now = Date.now();
  return {
    id: `rand-evt-${now}`,
    name: '集市上的骚动',
    description: '有人在集市打翻了香料摊，人群围了上去。',
    lorebookId: 'lb-evt',
    sceneEntryId: null,
    sceneName: null,
    trigger: { type: 'manual' },
    completion: { type: 'manual' },
    probability: 100,
    state: 'active',
    repeatable: false,
    triggerCount: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as StoryEvent;
}

/** 一本全局世界书（事件挂在 lorebookId 上，靠它进入本轮范围） */
function seedLorebook(): string {
  const lb = useLorebookStore();
  return lb.createLorebook({ name: '事件测试世界' });
}

describe('随机事件注入痕迹（E11）store 契约', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('本轮有激活事件时，痕迹挂在 assistant 消息上且只带名字不带正文', async () => {
    const lbId = seedLorebook();
    const events = useEventsStore();
    events.events.push(makeEvent({ lorebookId: lbId, name: '集市上的骚动' }));
    events.events.push(makeEvent({ lorebookId: lbId, name: '城门盘查', id: 'rand-evt-2' }));

    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('集市那边乱起来了。'));

    const char = makeCharacter({ id: 'evt-on' });
    await chatStore.sendMessage(char, '今天有什么事');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.content).toBe('集市那边乱起来了。');
    expect(ai.eventTrace).toBeDefined();
    expect(ai.eventTrace!.map((item) => item.name).sort()).toEqual(['城门盘查', '集市上的骚动']);
    for (const item of ai.eventTrace!) {
      // 裁剪视图：只给标识，事件正文不进会话（也省持久化体积）
      expect(item).not.toHaveProperty('description');
      expect(item).toHaveProperty('eventId');
    }
  });

  it('负向对照：没有激活事件时不写 eventTrace，回复照常生成', async () => {
    const lbId = seedLorebook();
    const events = useEventsStore();
    // 已完成的事件不算注入（两个注入构建器都只收 state === 'active'）
    events.events.push(makeEvent({ lorebookId: lbId, state: 'completed' }));

    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('一切如常。'));

    const char = makeCharacter({ id: 'evt-none' });
    await chatStore.sendMessage(char, '今天有什么事');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.content).toBe('一切如常。');
    expect(ai.eventTrace).toBeUndefined();
  });

  it('事件属于别的书时不注入（范围判据与注入文本一致）', async () => {
    seedLorebook();
    const events = useEventsStore();
    events.events.push(makeEvent({ lorebookId: 'some-other-book' }));

    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('没有相关事件。'));

    const char = makeCharacter({ id: 'evt-other' });
    await chatStore.sendMessage(char, '今天有什么事');

    expect(char.messages[char.messages.length - 1]!.eventTrace).toBeUndefined();
  });

  it('重新生成清空上一轮的事件痕迹', async () => {
    const lbId = seedLorebook();
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());

    const char = makeCharacter({ id: 'evt-regen' });
    char.messages.push({
      id: 'u1',
      role: 'user',
      content: '今天有什么事',
      timestamp: Date.now(),
    });
    char.messages.push({
      id: 'a1',
      role: 'assistant',
      content: '上一轮的回复',
      timestamp: Date.now(),
      // 上一轮留下的痕迹：本轮没有事件时必须消失
      eventTrace: [{ eventId: 'rand-evt-old', name: '上一轮的事件' }],
      promptTrace: [{ entryId: 'e1', bookId: 'b1', bookName: '旧书', title: '旧条目', keys: [] }],
    });

    // 本轮不放任何激活事件
    void lbId;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('新一轮的回复'));
    await chatStore.regenerateMessage(char, 'a1');

    const target = char.messages.find((m) => m.id === 'a1')!;
    expect(target.content).toBe('新一轮的回复');
    expect(target.eventTrace).toBeUndefined();
    expect(target.promptTrace).toBeUndefined();
  });
});
