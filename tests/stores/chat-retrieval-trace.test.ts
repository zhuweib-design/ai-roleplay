/**
 * C-03 · 检索命中痕迹的 store 级契约
 *
 * 为什么要在 store 层测：`promptTrace` 那边踩过一次——写在 CharacterCard 上
 * （带 `[key: string]: unknown`，typecheck 过得去）既不渲染也不落盘。
 * 这里直接断言响应式消息对象上的字段，并且把"label 从哪来"走通：
 * 命中的 id 是 `memory:<事实 id>`，正文裁剪取自组装当轮真实拿到的来源表，
 * 不是测试自己塞进去的一份标签。
 *
 * 覆盖：
 * - 有命中 → assistant 消息带 retrievalTrace（id / label / 分数三位 / 通道）
 * - 负向对照：检索没命中时不写该字段
 * - 重新生成清空上一轮痕迹
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatStore } from '../../src/stores/chat';
import { useChatMemoryStore } from '../../src/stores/chat-memory';
import type { UICharacter, ApiProfile } from '@/types';

const ragMock = vi.hoisted(() => ({
  current: { text: '', hits: [] as Array<{ id: string; score: number; channel: 'dynamic' | 'static' }>, ran: false },
}));

vi.mock('@/core/dual-channel-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/dual-channel-runtime')>();
  return {
    ...actual,
    buildVectorRagInjection: async () => ragMock.current,
  };
});

function makeCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'rag-char',
    name: 'RagChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'R',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '检索痕迹测试角色',
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
    id: 'rag-profile',
    name: 'Rag Profile',
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

/** 写一条真实的会话记忆事实，返回它在检索来源表里的 id（`memory:<factId>`） */
async function seedMemoryFact(char: UICharacter, marker: string): Promise<string> {
  const mem = useChatMemoryStore();
  await mem.recordLocalConversationMemory(char, `关于${marker}的提问`, `${marker}是一条只有这条事实里才有的内容`, 'turn-1');
  const facts = await mem.listScopedFacts();
  const fact = facts.find((f) => f.body.includes(marker));
  expect(fact, '夹具没能落进记忆事实表，后面的断言都无意义').toBeDefined();
  return `memory:${fact!.id}`;
}

describe('检索命中痕迹（C-03）store 契约', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
    ragMock.current = { text: '', hits: [], ran: false };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('有命中时痕迹挂在 assistant 消息上，label 是当轮来源表里那段文本的开头', async () => {
    const char = makeCharacter({ id: 'rag-on' });
    const hitId = await seedMemoryFact(char, '雨天读书');

    ragMock.current = {
      text: '[记忆]注入的正文',
      hits: [{ id: hitId, score: 0.9123, channel: 'dynamic' }],
      ran: true,
    };

    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('今夜开门。'));
    await chatStore.sendMessage(char, '今晚酒馆开门吗');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.content).toBe('今夜开门。');
    expect(ai.retrievalTrace).toEqual([
      { id: hitId, label: expect.stringContaining('雨天读书'), score: 0.912, channel: 'dynamic' },
    ]);
    // 只给开头一段，不把整条事实正文搬进会话记录
    expect([...(ai.retrievalTrace![0]!.label)].length).toBeLessThanOrEqual(41);
  });

  it('负向对照：检索跑了但没命中时不写该字段', async () => {
    const char = makeCharacter({ id: 'rag-none' });
    ragMock.current = { text: '', hits: [], ran: true };

    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('无检索注入。'));
    await chatStore.sendMessage(char, '你好');

    const ai = char.messages[char.messages.length - 1]!;
    expect(ai.content).toBe('无检索注入。');
    expect(ai.retrievalTrace).toBeUndefined();
  });

  it('重新生成会清空上一轮的检索痕迹', async () => {
    ragMock.current = { text: '', hits: [], ran: false };
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('新回复'));

    const char = makeCharacter({
      id: 'rag-regen',
      messages: [
        { id: 'u1', role: 'user', content: '问', timestamp: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content: '旧回复',
          timestamp: 2,
          retrievalTrace: [{ id: 'memory:old', label: '上一轮命中的那条', score: 0.5, channel: 'dynamic' }],
        },
      ],
    });
    await chatStore.regenerateMessage(char, 'a1');

    const target = char.messages.find((m) => m.id === 'a1')!;
    expect(target.content).toBe('新回复');
    expect(target.retrievalTrace).toBeUndefined();
  });

  /**
   * 上一条其实测不到"清空"那一行：新轮回填时本来也会覆盖。
   * 这里走一条根本到不了 onPromptBuilt 的路（没配 API Profile 就早退），
   * 才逼出真正的差别——旧痕迹必须在新一轮开始的那一刻就没了。
   */
  it('新一轮根本没跑到组装回调时，旧痕迹也必须已被清掉', async () => {
    const char = makeCharacter({
      id: 'rag-early-exit',
      messages: [
        { id: 'u1', role: 'user', content: '问', timestamp: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content: '旧回复',
          timestamp: 2,
          retrievalTrace: [{ id: 'memory:old', label: '上一轮命中的那条', score: 0.5, channel: 'dynamic' }],
        },
      ],
    });
    const chatStore = useChatStore();
    // 故意不设 API Profile：regenerate 会在清空痕迹之后早退
    await chatStore.regenerateMessage(char, 'a1');

    const target = char.messages.find((m) => m.id === 'a1')!;
    expect(target.retrievalTrace, '早退路径留下了上一轮的检索痕迹：空气泡却写着"本轮检索命中 1 条"').toBeUndefined();
  });
});
