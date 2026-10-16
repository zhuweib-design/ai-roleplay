/**
 * L 层 · 世界书注入痕迹（E02）的 store 级契约
 *
 * 为什么单独立一个文件：M2-b3 的浏览器级 E2E 抓到过一次静默失效——
 * `card.promptTrace = …` 写的是 CharacterCard（带 `[key: string]: unknown`），
 * typecheck 通过、界面无痕迹、落盘无痕迹。这里直接断言**响应式消息对象**上的字段，
 * 让同类错配在单测阶段就红。
 *
 * 覆盖：
 * - 常驻条目 + 命中的关键词条目 → 回复消息带 promptTrace（含 keys，**不含正文**）
 * - 负向对照：无世界书时不写该字段
 * - persistChat 落盘可回读
 * - 重新生成清空旧痕迹
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatStore } from '../../src/stores/chat';
import { useLorebookStore } from '../../src/stores/lorebook';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { UICharacter, ApiProfile } from '@/types';

function makeCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'trace-char',
    name: 'TraceChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'T',
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
    worldEntries: [],
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  };
}

function makeApiProfile(): ApiProfile {
  return {
    id: 'trace-profile',
    name: 'Trace Profile',
    provider: 'openai',
    baseUrl: 'https://example.test',
    apiKey: 'sk-test',
    model: 'gpt-4o',
  };
}

function makeSSEResponse(content: string): Response {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`),
    encoder.encode('data: [DONE]\n\n'),
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as Response;
}

/** 一本全局世界书：一条常驻 + 一条关键词（消息里含"酒馆"，必然命中） */
function seedLorebook(): void {
  const lb = useLorebookStore();
  const lbId = lb.createLorebook({ name: '痕迹测试世界' });
  lb.addEntry(lbId, { title: '永恒酒馆', keys: [], content: '酒馆永远亮着灯。', strategy: 'constant', enabled: true });
  lb.addEntry(lbId, { title: '麦芽酒', keys: ['酒馆'], content: '麦芽酒今日半价。', strategy: 'keyword', enabled: true });
}

async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('注入痕迹（E02）store 契约', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('注入发生时痕迹挂在 assistant 消息上，且只带标题不带正文', async () => {
    seedLorebook();
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('今夜开门。'));

    const char = makeCharacter({ id: 'trace-on' });
    await chatStore.sendMessage(char, '今晚酒馆开门吗');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.content).toBe('今夜开门。');
    const trace = ai.promptTrace;
    expect(trace).toBeDefined();
    expect(trace).toHaveLength(2);
    expect(trace!.map((item) => item.title).sort()).toEqual(['永恒酒馆', '麦芽酒']);
    for (const item of trace!) {
      expect(item.bookName).toBe('痕迹测试世界');
      expect(item).not.toHaveProperty('content');
    }
    const hit = trace!.find((item) => item.title === '麦芽酒')!;
    expect(hit.keys).toEqual(['酒馆']);
  });

  it('负向对照：没有世界书时不写 promptTrace 字段', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('无设定注入。'));

    const char = makeCharacter({ id: 'trace-none' });
    await chatStore.sendMessage(char, '你好');

    const ai = char.messages[char.messages.length - 1]!;
    // 回复确实生成了，只是本轮没有任何注入
    expect(ai.content).toBe('无设定注入。');
    expect(ai.promptTrace).toBeUndefined();
  });

  it('persistChat 后痕迹落盘并可回读', async () => {
    await resetDatabase('test-chat-trace-persist');
    const adapter = new IndexedDBAdapter('test-chat-trace-persist');
    await adapter.init();

    seedLorebook();
    const chatStore = useChatStore();
    chatStore.setStorageAdapter(adapter);
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('落盘回复。'));

    const char = makeCharacter({ id: 'trace-persist' });
    await chatStore.sendMessage(char, '今晚酒馆开门吗');

    const loaded = await adapter.loadChat('chat-trace-persist');
    expect(loaded).not.toBeNull();
    const ai = loaded!.messages.find((m) => m.role === 'assistant');
    expect(ai?.promptTrace).toBeDefined();
    expect(ai?.promptTrace).toHaveLength(2);

    await adapter.close();
  });

  it('重新生成会清空上一轮的痕迹', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('新回复'));

    const char = makeCharacter({
      id: 'trace-regen',
      messages: [
        { id: 'u1', role: 'user', content: '问', timestamp: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content: '旧回复',
          timestamp: 2,
          promptTrace: [{ entryId: 'x', bookId: 'b', bookName: '旧书', title: '旧条目', keys: [] }],
        },
      ],
    });
    await chatStore.regenerateMessage(char, 'a1');

    const target = char.messages.find((m) => m.id === 'a1')!;
    expect(target.content).toBe('新回复');
    expect(target.promptTrace).toBeUndefined();
  });
});
