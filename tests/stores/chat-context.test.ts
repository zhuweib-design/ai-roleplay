/**
 * chat-context 深模块测试（候选1+2）
 *
 * 覆盖：
 * - regenerate 语义（allowEventTrigger=false）：注入全部上下文（此前遗漏 RAG/主角/故事时间）
 * - send 语义（allowEventTrigger=true）：RAG 检索调用、事件注入
 * - 无 storyId 时主角/故事时间上下文为空
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const { retrieveAndBuildContext } = vi.hoisted(() => ({
  retrieveAndBuildContext: vi.fn(),
}));

vi.mock('@/stores/lorebook', () => ({
  useLorebookStore: () => ({
    lorebooks: [
      { id: 'lb1', name: '全球世界书', scope: 'global' },
      { id: 'lb2', name: '角色世界书', scope: 'character', characterId: 'char-1' },
    ],
  }),
}));

vi.mock('@/stores/persona', () => ({
  usePersonaStore: () => ({
    activeUserName: '玩家甲',
    activePersona: { id: 'per-1' },
  }),
}));

vi.mock('@/stores/data-bank', () => ({
  useDataBankStore: () => ({
    retrieveAndBuildContext,
  }),
}));

vi.mock('@/stores/story', () => ({
  useStoryStore: () => ({
    stories: [{ id: 's1', protagonist: { name: '主角', role: 'protagonist' } }],
    getStoryTimePrompt: () => '当前时间：第三天',
    getFormattedStoryTime: () => '第三天',
  }),
}));

vi.mock('@/stores/events', () => ({
  useEventsStore: () => ({
    events: [
      {
        id: 'ev1',
        name: '王城陷落',
        description: '魔王军攻入王城',
        state: 'active',
        lorebookId: 'lb1',
        completion: { manualOnly: true, keywords: [] },
      },
    ],
    getEventByName: vi.fn(),
    completeEvent: vi.fn(),
    triggerEvent: vi.fn(),
  }),
}));

import { buildChatSessionContext } from '@/stores/chat-context';

const character = { id: 'char-1', storyId: 's1' };

describe('buildChatSessionContext 对话上下文深模块', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    retrieveAndBuildContext.mockReset();
    retrieveAndBuildContext.mockReturnValue('检索到的文档上下文');
  });

  it('regenerate 语义：注入全部上下文（修复漏注入 bug）', () => {
    const ctx = buildChatSessionContext(character, {
      ragMessages: ['你好'],
      allowEventTrigger: false,
    });

    expect(ctx.lorebooks).toHaveLength(2);
    expect(ctx.userName).toBe('玩家甲');
    expect(ctx.ragContext).toBe('检索到的文档上下文');
    expect(ctx.protagonistContext).toContain('主角');
    expect(ctx.storyTimeContext).toContain('第三天');
    // 激活事件仍注入（仅注入，不改变事件状态）
    expect(ctx.eventsContext).toContain('王城陷落');
  });

  it('send 语义：RAG 检索使用 ragMessages，事件注入同样生效', () => {
    const ctx = buildChatSessionContext(character, {
      ragMessages: ['最近消息1', '当前输入'],
      allowEventTrigger: true,
    });

    expect(retrieveAndBuildContext).toHaveBeenCalledWith(
      ['最近消息1', '当前输入'],
      'character',
      'char-1'
    );
    expect(ctx.eventsContext).toContain('王城陷落');
    expect(ctx.ragContext).toBe('检索到的文档上下文');
  });

  it('无 storyId 时主角与故事时间上下文为空', () => {
    const ctx = buildChatSessionContext(
      { id: 'char-2', storyId: null },
      { ragMessages: ['x'], allowEventTrigger: false }
    );

    expect(ctx.protagonistContext).toBeUndefined();
    expect(ctx.storyTimeContext).toBeUndefined();
    // 无 storyId 不阻断事件注入：global 世界书对任何角色生效
    expect(ctx.eventsContext).toContain('王城陷落');
  });

  it('RAG 返回空串时 ragContext 归一化为 undefined', () => {
    retrieveAndBuildContext.mockReturnValue('');
    const ctx = buildChatSessionContext(character, {
      ragMessages: ['x'],
      allowEventTrigger: false,
    });

    expect(ctx.ragContext).toBeUndefined();
  });
});
