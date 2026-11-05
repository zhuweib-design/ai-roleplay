/**
 * 生成中切换/新建/删除会话的守卫（2B-P1-02）
 *
 * 现场事实：流式回调写的是 sendMessage 捕获的 liveMsg，而会话切换会整体替换
 * 或清空 character.messages；没有守卫时新建会话会让整段回复静默丢失，
 * 切到别的会话会把回复丢在旧对象里。这里钉住 store 层的闸门。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useChatStore } from '../../src/stores/chat';
import { useChatSessionStore } from '../../src/stores/chat-session';
import type { UICharacter, ApiProfile } from '@/types';

function makeCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'guard-char',
    name: 'GuardChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'G',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '守卫测试角色',
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
    id: 'guard-profile',
    name: 'Guard Profile',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o',
  };
}

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 10));

describe('生成中的会话操作守卫', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('newSession 在生成中不得清空消息或改走会话 id', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());

    let resolveFetch!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => { resolveFetch = resolve; })
    );

    const char = makeCharacter();
    const send = chatStore.sendMessage(char, '第一条');
    await tick();
    expect(chatStore.isGenerating).toBe(true);

    const activeBefore = chatStore.activeChatId;
    const messageCountBefore = char.messages.length;

    chatStore.newSession(char);

    expect(chatStore.activeChatId).toBe(activeBefore);
    expect(char.messages).toHaveLength(messageCountBefore);

    resolveFetch({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            id: 'c1', object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { content: '回复' }, finish_reason: 'stop' }],
          })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    } as Response);
    await send;
    expect(chatStore.isGenerating).toBe(false);
  });

  it('deleteSession 删除当前会话时在生成中必须早退', async () => {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile());

    let resolveFetch!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => { resolveFetch = resolve; })
    );

    const char = makeCharacter();
    chatStore.newSession(char);
    const activeId = chatStore.activeChatId;
    expect(activeId).toBeTruthy();

    const send = chatStore.sendMessage(char, '第一条');
    await tick();
    expect(chatStore.isGenerating).toBe(true);

    await chatStore.deleteSession(char, activeId!);
    expect(chatStore.activeChatId).toBe(activeId);
    expect(char.messages.length).toBeGreaterThan(0);

    resolveFetch(new Response(null, { status: 200 }) as Response);
    await send.catch(() => undefined);
  });

  it('空闲时三个操作照常放行（闸门不误伤）', async () => {
    const chatStore = useChatStore();
    const sessionStore = useChatSessionStore();
    chatStore.setApiProfile(makeApiProfile());
    expect(chatStore.isGenerating).toBe(false);

    const calls: string[] = [];
    vi.spyOn(sessionStore, 'openSession').mockImplementation(async (_c, id) => {
      calls.push(`open:${id}`);
    });
    vi.spyOn(sessionStore, 'newSession').mockImplementation((c) => {
      calls.push(`new:${c.id}`);
    });
    vi.spyOn(sessionStore, 'deleteSession').mockImplementation(async (_c, id) => {
      calls.push(`del:${id}`);
    });

    const char = makeCharacter();
    await chatStore.openSession(char, 'chat-idle-1');
    chatStore.newSession(char);
    await chatStore.deleteSession(char, 'chat-idle-1');

    expect(calls).toEqual(['open:chat-idle-1', `new:${char.id}`, 'del:chat-idle-1']);
  });

  it('生成中时三个委托一个都不会被调到', async () => {
    const chatStore = useChatStore();
    const sessionStore = useChatSessionStore();
    chatStore.setApiProfile(makeApiProfile());

    const open = vi.spyOn(sessionStore, 'openSession').mockResolvedValue(undefined);
    const fresh = vi.spyOn(sessionStore, 'newSession').mockImplementation(() => undefined);
    const del = vi.spyOn(sessionStore, 'deleteSession').mockResolvedValue(undefined);

    let resolveFetch!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => { resolveFetch = resolve; })
    );

    const char = makeCharacter();
    const send = chatStore.sendMessage(char, '第一条');
    await tick();
    expect(chatStore.isGenerating).toBe(true);

    await chatStore.openSession(char, 'chat-other');
    chatStore.newSession(char);
    await chatStore.deleteSession(char, chatStore.activeChatId!);
    expect(open).not.toHaveBeenCalled();
    expect(fresh).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();

    resolveFetch(new Response(null, { status: 200 }) as Response);
    await send.catch(() => undefined);
  });
});
