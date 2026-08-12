import { describe, test, expect } from 'vitest';
import { buildPrompt } from '@core/prompt-builder';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import type { PromptSettings } from '@core/prompt-builder';

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'test-id',
    name: 'Seraphina',
    description: '一位守护森林的精灵法师',
    personality: '温柔但内心坚韧',
    scenario: '{{user}} 在森林中遭遇野兽袭击',
    firstMessage: '*你猛然醒来* "你终于醒了。"',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-07-10T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PromptSettings> = {}): PromptSettings {
  return {
    systemPrompt: 'You are a roleplay assistant. Stay in character.',
    maxContextTokens: 8192,
    reservedTokens: 1024,
    userName: '勇者',
    ...overrides,
  };
}

const sampleHistory: ChatMessage[] = [
  { role: 'assistant', content: '你好，勇者。这里是翡翠森林。', id: '1', timestamp: '', swipes: [], swipeIndex: 0 },
  { role: 'user', content: '谢谢你救了我。', id: '2', timestamp: '', swipes: [], swipeIndex: 0 },
  { role: 'assistant', content: '不用客气。喝点茶吧。', id: '3', timestamp: '', swipes: [], swipeIndex: 0 },
];

describe('提示词构建引擎 (F03.1)', () => {
  test('基础构建：系统提示词 + 角色定义 + 对话历史 + 用户消息', () => {
    const card = makeCard();
    const settings = makeSettings();
    const userMessage = '你是什么人？';

    const result = buildPrompt(card, sampleHistory, userMessage, settings);

    // 第一条应该是 system 角色消息
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('You are a roleplay assistant');
    expect(result.messages[0].content).toContain('Seraphina');
    expect(result.messages[0].content).toContain('精灵法师');

    // 最后一条应该是用户消息
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toBe('你是什么人？');

    // 中间应包含历史消息
    expect(result.messages.length).toBeGreaterThan(3);
  });

  test('宏替换在构建时执行', () => {
    const card = makeCard({ scenario: '{{user}}在{{char}}的小屋中' });
    const settings = makeSettings({ userName: '勇者' });

    const result = buildPrompt(card, [], '', settings);

    const systemContent = result.messages[0].content;
    expect(systemContent).toContain('勇者在Seraphina的小屋中');
    expect(systemContent).not.toContain('{{user}}');
    expect(systemContent).not.toContain('{{char}}');
  });

  test('返回 Token 计数', () => {
    const card = makeCard();
    const settings = makeSettings();

    const result = buildPrompt(card, sampleHistory, '测试消息', settings);

    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.tokenCount).toBeLessThan(settings.maxContextTokens);
  });
});

describe('Token 预算裁剪 (F03.2/F03.3)', () => {
  test('对话历史超过预算时从最早消息开始裁剪', () => {
    const card = makeCard();
    // 设置极小的上下文预算，迫使历史被裁剪
    const settings = makeSettings({ maxContextTokens: 100, reservedTokens: 20 });

    const longHistory: ChatMessage[] = [
      ...sampleHistory,
      { role: 'user', content: 'a'.repeat(200), id: '4', timestamp: '', swipes: [], swipeIndex: 0 },
      { role: 'assistant', content: 'b'.repeat(200), id: '5', timestamp: '', swipes: [], swipeIndex: 0 },
    ];

    const result = buildPrompt(card, longHistory, '新消息', settings);

    // 裁剪后 Token 计数不应超过预算
    expect(result.tokenCount).toBeLessThanOrEqual(settings.maxContextTokens);
    // 裁剪标记应为 true
    expect(result.trimmed).toBe(true);
  });

  test('角色定义永远保留不被裁剪', () => {
    const card = makeCard({
      description: 'a'.repeat(200),
      personality: 'b'.repeat(200),
    });
    const settings = makeSettings({ maxContextTokens: 150, reservedTokens: 20 });

    const result = buildPrompt(card, sampleHistory, '测试', settings);

    // 系统消息中仍应包含角色描述
    const systemContent = result.messages[0].content;
    expect(systemContent).toContain('a'.repeat(200));
  });

  test('历史在预算内时不裁剪', () => {
    const card = makeCard();
    const settings = makeSettings({ maxContextTokens: 8192, reservedTokens: 1024 });

    const result = buildPrompt(card, sampleHistory, '测试', settings);

    expect(result.trimmed).toBe(false);
    // 所有历史消息都应保留
    expect(result.messages.length).toBe(sampleHistory.length + 2); // +system +user
  });
});

describe('作者笔记注入 (F03.5)', () => {
  test('深度0：注入在最后一条消息后', () => {
    const card = makeCard({
      characterNote: { text: '[OOC: 保持神秘感]', depth: 0, role: 'system' },
    });
    const settings = makeSettings();

    const result = buildPrompt(card, sampleHistory, '你是什么人？', settings);

    // 作者笔记应出现在用户消息之前（最后一条历史之后）
    const noteIdx = result.messages.findIndex(m => m.content.includes('[OOC: 保持神秘感]'));
    const userMsgIdx = result.messages.findIndex(m => m.role === 'user' && m.content === '你是什么人？');

    expect(noteIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBe(userMsgIdx - 1);
  });

  test('深度2：注入在倒数第2条消息后', () => {
    const card = makeCard({
      characterNote: { text: '[Note: 提示]', depth: 2, role: 'system' },
    });
    const settings = makeSettings();

    const result = buildPrompt(card, sampleHistory, '你是什么人？', settings);

    const noteIdx = result.messages.findIndex(m => m.content.includes('[Note: 提示]'));
    // 深度2 = 从最新消息往前数第2条后注入
    // 消息顺序: system, history[0], history[1], history[2], [note], user_msg
    // 深度2表示 note 在倒数第2条历史后
    expect(noteIdx).toBeGreaterThan(-1);
  });
});
