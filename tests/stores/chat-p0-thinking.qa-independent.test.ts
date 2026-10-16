/**
 * chat store — P0-1「重新生成 / 编辑时清空 thinking」QA 独立验证
 *
 * 工程师的 chat-llm-controls.test.ts 已覆盖流式写入与持久化；本文件只补**清理契约**：
 * - editMessage：正文改写后旧思考必须清空（防止"旧思考 + 新正文"错配）
 * - regenerateMessage：重生成开局即清空 thinking（在 chatManager 缺失的早退分支也成立）
 * - 未被编辑 / 未参与重生成的消息，thinking 不得被误清
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { initLocale } from '@/i18n';
import { useChatStore } from '@/stores/chat';
import type { UICharacter, UIMessage } from '@/types';

function makeCharacter(messages: UIMessage[]): UICharacter {
  return {
    id: 'qa-char',
    name: 'QAChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'Q',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: 'qa',
    model: 'gpt-4o',
    conversations: [],
    messages,
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    worldEntries: [],
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
  } as unknown as UICharacter;
}

function uiMsg(overrides: Partial<UIMessage> & { id: string }): UIMessage {
  return {
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...overrides,
  } as UIMessage;
}

describe('chat store — QA 独立验证：thinking 清空契约', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh'); // jsdom 默认 en-US，断言中文文案前必须初始化
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('editMessage：改写正文后 thinking 被清空', () => {
    const store = useChatStore();
    const msg = uiMsg({ id: 'm1', content: '旧正文', thinking: '旧思考' });
    store.editMessage(msg, '新正文');
    expect(msg.content).toBe('新正文');
    expect(msg.thinking).toBe('');
  });

  it('editMessage：原本无 thinking 时不得凭空写入字段', () => {
    const store = useChatStore();
    const msg = uiMsg({ id: 'm2', content: '旧正文' });
    store.editMessage(msg, '新正文');
    expect(msg.thinking).toBeUndefined();
  });

  it('editMessage：thinking 为空串时保持空串（不清空其它字段）', () => {
    const store = useChatStore();
    const msg = uiMsg({ id: 'm3', content: '旧正文', thinking: '' });
    store.editMessage(msg, '新正文');
    expect(msg.thinking).toBe('');
    expect(msg.content).toBe('新正文');
  });

  it('regenerateMessage：开局即清空目标消息的 thinking（早退分支同样成立）', async () => {
    const store = useChatStore();
    const target = uiMsg({ id: 'a1', role: 'assistant', content: '旧回复', thinking: '旧思考' });
    const char = makeCharacter([
      uiMsg({ id: 'u1', role: 'user', content: '问题' }),
      target,
    ]);

    // 未设置 API Profile → chatManager 为空，会走早退分支；
    // 但 thinking 清空发生在早退**之前**，因此该断言不依赖真实 LLM
    await store.regenerateMessage(char, 'a1');

    expect(target.thinking).toBe('');
    // 早退分支会把 content 置为"未配置 API Profile"提示，关键点是**旧正文已被清掉**
    expect(target.content).not.toBe('旧回复');
    expect(target.content).toContain('API');
  });

  it('regenerateMessage：不得误清其它消息的 thinking', async () => {
    const store = useChatStore();
    const earlier = uiMsg({ id: 'a0', role: 'assistant', content: '更早回复', thinking: '更早思考' });
    const target = uiMsg({ id: 'a1', role: 'assistant', content: '旧回复', thinking: '旧思考' });
    const char = makeCharacter([
      earlier,
      uiMsg({ id: 'u1', role: 'user', content: '问题' }),
      target,
    ]);

    await store.regenerateMessage(char, 'a1');

    expect(target.thinking).toBe('');
    expect(earlier.thinking).toBe('更早思考');
    expect(earlier.content).toBe('更早回复');
  });

  it('regenerateMessage：目标不是 assistant 时直接返回，不改动任何内容', async () => {
    const store = useChatStore();
    const userMsg = uiMsg({ id: 'u1', role: 'user', content: '问题', thinking: '不该清' });
    const char = makeCharacter([userMsg]);

    await store.regenerateMessage(char, 'u1');

    expect(userMsg.content).toBe('问题');
    expect(userMsg.thinking).toBe('不该清');
  });
});
