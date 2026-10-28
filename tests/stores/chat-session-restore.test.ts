/**
 * D-Q（UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.7.2）：刷新后自动接回最近一段对话
 *
 * 会话历史只存在 chats store，而装回缓冲的唯一入口原本是"点击会话行 → openSession"，
 * 于是 F5 之后聊天区是空的。`restoreLatestSession` 补上这一步，
 * 但必须只在"用户还没选定会话、且缓冲为空"时生效——否则会盖掉 newSession 的草稿
 * 或用户正在输入的内容。这里把生效条件与四条负向对照都写成断言。
 *
 * 后半段是 D-R：接回让 `activeChatId` 更常为非空，顺势暴露出"会话归属"没有校验，
 * 见 `会话归属纠偏（D-R）` 一节的实测数据丢失。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatStore } from '../../src/stores/chat';
import { useChatSessionStore } from '../../src/stores/chat-session';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { UICharacter, ApiProfile } from '@/types';
import type { Chat } from '../../src/storage/types';

function makeCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'c1',
    name: 'RestoreChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'R',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '会话接回测试角色',
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

function makeChat(id: string, characterId: string, updatedAt: string, opts: Partial<Chat> = {}): Chat {
  return {
    id,
    characterId,
    title: `会话 ${id}`,
    messages: [
      {
        id: `${id}-m1`,
        role: 'user',
        content: `来自 ${id} 的消息`,
        timestamp: updatedAt,
        swipes: [],
        swipeIndex: 0,
      },
    ],
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt,
    ...opts,
  };
}

function makeApiProfile(): ApiProfile {
  return {
    id: 'restore-profile',
    name: 'Restore Profile',
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

async function freshStores(dbName: string) {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  const adapter = new IndexedDBAdapter(dbName);
  await adapter.init();
  const chatStore = useChatStore();
  chatStore.setStorageAdapter(adapter);
  return { adapter, chatStore, sessionStore: useChatSessionStore() };
}

describe('会话接回（D-Q）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('接回该角色 updatedAt 最新的一条，并同步 activeChatId', async () => {
    const { adapter, chatStore } = await freshStores('test-restore-latest');
    await adapter.saveChat(makeChat('chat-old', 'c1', '2026-10-01T00:00:00.000Z'));
    await adapter.saveChat(makeChat('chat-new', 'c1', '2026-10-05T00:00:00.000Z'));

    const char = makeCharacter();
    await chatStore.loadAllSessions(['c1']);
    expect(await chatStore.restoreLatestSession(char)).toBe(true);

    expect(chatStore.activeChatId).toBe('chat-new');
    expect(char.messages.map((m) => m.content)).toEqual(['来自 chat-new 的消息']);
    // 会话行高亮跟着走：activeChatId 必须能在 sessions 里找到
    expect(chatStore.sessions.some((s) => s.id === chatStore.activeChatId)).toBe(true);

    await adapter.close();
  });

  it('负向对照：全部归档时不接回（归档会话不在主列表，接回会让人找不到来源）', async () => {
    const { adapter, chatStore } = await freshStores('test-restore-archived');
    await adapter.saveChat(makeChat('chat-a', 'c1', '2026-10-05T00:00:00.000Z', { archived: true }));

    const char = makeCharacter();
    await chatStore.loadAllSessions(['c1']);
    expect(await chatStore.restoreLatestSession(char)).toBe(false);
    expect(chatStore.activeChatId).toBeNull();
    expect(char.messages).toHaveLength(0);

    await adapter.close();
  });

  it('负向对照：只接回当前角色自己的会话', async () => {
    const { adapter, chatStore } = await freshStores('test-restore-other-char');
    await adapter.saveChat(makeChat('chat-b2', 'other', '2026-10-09T00:00:00.000Z'));

    const char = makeCharacter({ id: 'c1' });
    await chatStore.loadAllSessions(['c1', 'other']);
    expect(await chatStore.restoreLatestSession(char)).toBe(false);
    expect(chatStore.activeChatId).toBeNull();

    await adapter.close();
  });

  it('负向对照：已选定会话（含 newSession 草稿）时绝不覆盖', async () => {
    const { adapter, chatStore } = await freshStores('test-restore-active');
    await adapter.saveChat(makeChat('chat-latest', 'c1', '2026-10-05T00:00:00.000Z'));

    const char = makeCharacter();
    await chatStore.loadAllSessions(['c1']);
    chatStore.newSession(char);
    const draftId = chatStore.activeChatId;
    expect(draftId).toMatch(/^chat-/);

    expect(await chatStore.restoreLatestSession(char)).toBe(false);
    expect(chatStore.activeChatId).toBe(draftId);

    await adapter.close();
  });

  it('负向对照：缓冲里已有消息时不覆盖（避免吞掉未落盘的当前对话）', async () => {
    const { adapter, chatStore } = await freshStores('test-restore-buffer');
    await adapter.saveChat(makeChat('chat-latest', 'c1', '2026-10-05T00:00:00.000Z'));

    const char = makeCharacter({
      messages: [{ id: 'draft-1', role: 'user', content: '正在写的消息', timestamp: 1 }],
    });
    await chatStore.loadAllSessions(['c1']);
    expect(await chatStore.restoreLatestSession(char)).toBe(false);
    expect(char.messages.map((m) => m.content)).toEqual(['正在写的消息']);

    await adapter.close();
  });

  it('负向对照：无角色 / 无适配器时静默返回 false', async () => {
    const { sessionStore } = await freshStores('test-restore-null');
    expect(await sessionStore.restoreLatestSession(null)).toBe(false);
  });
});

/**
 * D-R：`activeChatId` 是**全局单值**，而 `selectCharacter()` 不重置它，
 * `persistChat()` 又用 `activeChatId ?? chat-<id>` 决定写入哪条会话
 * （`stores/chat-generation.ts` 的 `persistChat`）。于是"打开 A 的会话 → 切到 B → 说一句"
 * 会把 B 的整段缓冲**覆盖**到 A 的会话记录上——不是串位，是数据丢失。
 * 这里走真实的 `sendMessage`（含流式与落盘），不用内部函数。
 */
describe('会话归属纠偏（D-R）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('当前角色与激活会话不匹配时，落盘写回本角色自己的会话', async () => {
    const { adapter, chatStore } = await freshStores('test-attribute-cross-char');
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('乙的回复'));
    await adapter.saveChat(makeChat('chat-A-1', 'charA', '2026-10-05T00:00:00.000Z'));

    const charA = makeCharacter({ id: 'charA', name: '甲' });
    const charB = makeCharacter({ id: 'charB', name: '乙' });
    await chatStore.loadAllSessions(['charA', 'charB']);
    await chatStore.openSession(charA, 'chat-A-1');
    expect(chatStore.activeChatId).toBe('chat-A-1');

    // 用户切到乙并说了一句（没有经过会话列表，activeChatId 仍指着甲的会话）
    await chatStore.sendMessage(charB, '乙的新消息');

    const aRecord = await adapter.loadChat('chat-A-1');
    expect(aRecord?.messages.map((m) => m.content)).toEqual(['来自 chat-A-1 的消息']);
    const bRecord = await adapter.loadChat('chat-charB');
    expect(bRecord?.messages.map((m) => m.content)).toEqual(['乙的新消息', '乙的回复']);
    expect(chatStore.activeChatId).toBe('chat-charB');

    await adapter.close();
  });

  it('newSession 的草稿会话（尚未进索引）必须原样保留', async () => {
    const { adapter, chatStore } = await freshStores('test-attribute-draft');
    chatStore.setApiProfile(makeApiProfile());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse('草稿回复'));

    const char = makeCharacter({ id: 'charC' });
    chatStore.newSession(char);
    const draftId = chatStore.activeChatId;
    expect(draftId).toMatch(/^chat-/);

    await chatStore.sendMessage(char, '草稿里的话');

    expect(chatStore.activeChatId).toBe(draftId);
    const saved = await adapter.loadChat(draftId!);
    expect(saved?.messages.map((m) => m.content)).toEqual(['草稿里的话', '草稿回复']);

    await adapter.close();
  });
});
