import { describe, it, expect } from 'vitest';
import {
  uiCharToCard,
  cardToUiChar,
  uiMsgToChatMsg,
  chatMsgToUiMsg,
  uiMsgsToChatMsgs,
  chatMsgsToUiMsgs,
  worldEntriesToStorage,
} from '../../src/services/type-adapters';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import type { UICharacter, UIMessage, WorldEntry } from '@/types';

// ── 测试夹具 ──

function makeUIChar(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'ui-char-1',
    name: 'Seraphina',
    avatar: 'https://example.com/a.png',
    avatarType: 'image',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'S',
    lastActive: '刚刚',
    favorite: true,
    tags: ['奇幻', '温柔'],
    description: '精灵法师，来自银月森林',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '保持温柔语调',
    authorDepth: 4,
    temperature: 0.8,
    maxTokens: 2048,
    worldEntries: [],
    tokenBudget: { character: 100, worldInfo: 50, chatHistory: 200, remaining: 7842 },
    ...overrides,
  };
}

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'card-1',
    name: 'Lyra',
    avatar: 'https://example.com/lyra.png',
    description: '矮人战士',
    personality: '勇猛直率',
    scenario: '酒馆遭遇',
    firstMessage: '*砸杯* 又来一个！',
    alternateGreetings: ['*抬头* 嗯？'],
    exampleMessages: '示例对话内容',
    characterNote: { text: '保持矮人粗犷口吻', depth: 4, role: 'system' },
    talkativeness: 60,
    tags: ['奇幻', '战士'],
    favorite: false,
    version: '1.0',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

function makeUIMsg(overrides: Partial<UIMessage> = {}): UIMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: '你好',
    timestamp: 1721300000000,
    ...overrides,
  };
}

function makeChatMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'cmsg-1',
    role: 'assistant',
    content: '你好呀！',
    timestamp: '2026-07-10T00:00:00Z',
    swipes: [],
    swipeIndex: 0,
    ...overrides,
  };
}

// ── 测试用例 ──

describe('type-adapters — uiCharToCard', () => {
  it('应正确映射基础字段（id/name/avatar/description/tags/favorite）', () => {
    const ui = makeUIChar();
    const card = uiCharToCard(ui);

    expect(card.id).toBe('ui-char-1');
    expect(card.name).toBe('Seraphina');
    expect(card.avatar).toBe('https://example.com/a.png');
    expect(card.description).toBe('精灵法师，来自银月森林');
    expect(card.tags).toEqual(['奇幻', '温柔']);
    expect(card.favorite).toBe(true);
  });

  it('应将 authorNote + authorDepth 映射为 characterNote（role=system）', () => {
    const ui = makeUIChar({ authorNote: '保持冷静', authorDepth: 7 });
    const card = uiCharToCard(ui);

    expect(card.characterNote).toEqual({
      text: '保持冷静',
      depth: 7,
      role: 'system',
    });
  });

  it('应在 authorNote 为空时将 characterNote 设为 null', () => {
    const ui = makeUIChar({ authorNote: '' });
    const card = uiCharToCard(ui);

    expect(card.characterNote).toBeNull();
  });

  it('应将 personality/scenario/firstMessage 设为空（UI 层未区分）', () => {
    const card = uiCharToCard(makeUIChar());

    expect(card.personality).toBe('');
    expect(card.scenario).toBe('');
    expect(card.firstMessage).toBe('');
    expect(card.alternateGreetings).toEqual([]);
    expect(card.exampleMessages).toBe('');
  });

  it('应将 talkativeness 设为默认值 50', () => {
    const card = uiCharToCard(makeUIChar());

    expect(card.talkativeness).toBe(50);
  });

  it('应填充 ISO 字符串的 createdAt / updatedAt', () => {
    const before = Date.now();
    const card = uiCharToCard(makeUIChar());
    const after = Date.now();

    expect(new Date(card.createdAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(card.updatedAt).getTime()).toBeLessThanOrEqual(after);
  });

  it('应对 tags 做拷贝（不共享引用）', () => {
    const ui = makeUIChar();
    const card = uiCharToCard(ui);

    expect(card.tags).not.toBe(ui.tags);
    expect(card.tags).toEqual(ui.tags);

    card.tags.push('新标签');
    expect(ui.tags).not.toContain('新标签');
  });
});

describe('type-adapters — cardToUiChar', () => {
  it('应正确映射基础字段', () => {
    const card = makeCard();
    const ui = cardToUiChar(card);

    expect(ui.id).toBe('card-1');
    expect(ui.name).toBe('Lyra');
    expect(ui.avatar).toBe('https://example.com/lyra.png');
    expect(ui.favorite).toBe(false);
    expect(ui.tags).toEqual(['奇幻', '战士']);
  });

  it('应将 description + personality + scenario 合并为 UI description', () => {
    const card = makeCard({
      description: '矮人战士',
      personality: '勇猛直率',
      scenario: '酒馆遭遇',
    });
    const ui = cardToUiChar(card);

    expect(ui.description).toBe('矮人战士\n\n勇猛直率\n\n酒馆遭遇');
  });

  it('应过滤空字段只合并非空项', () => {
    const card = makeCard({
      description: '描述',
      personality: '',
      scenario: '场景',
    });
    const ui = cardToUiChar(card);

    expect(ui.description).toBe('描述\n\n场景');
  });

  it('应在所有字段为空时 description 也为空字符串', () => {
    const card = makeCard({
      description: '',
      personality: '',
      scenario: '',
    });
    const ui = cardToUiChar(card);

    expect(ui.description).toBe('');
  });

  it('应从 characterNote 映射回 authorNote/authorDepth', () => {
    const ui = cardToUiChar(
      makeCard({
        characterNote: { text: '保持冷静', depth: 5, role: 'system' },
      })
    );

    expect(ui.authorNote).toBe('保持冷静');
    expect(ui.authorDepth).toBe(5);
  });

  it('应在 characterNote 为 null 时使用默认值（authorNote="", authorDepth=4）', () => {
    const ui = cardToUiChar(makeCard({ characterNote: null }));

    expect(ui.authorNote).toBe('');
    expect(ui.authorDepth).toBe(4);
  });

  it('应根据 avatar 推断 avatarType（有 avatar=image, 无=gradient）', () => {
    expect(cardToUiChar(makeCard({ avatar: 'x.png' })).avatarType).toBe('image');
    expect(cardToUiChar(makeCard({ avatar: undefined })).avatarType).toBe('gradient');
  });

  it('应取 name 首字符作为 initial', () => {
    expect(cardToUiChar(makeCard({ name: 'Lyra' })).initial).toBe('L');
    expect(cardToUiChar(makeCard({ name: '' })).initial).toBe('?');
  });

  it('应使用 overrides 中的 model/temperature/maxTokens/worldEntries/tokenBudget/conversations/messages', () => {
    const card = makeCard();
    const overrides: Partial<UICharacter> = {
      model: 'claude-3-5-sonnet',
      temperature: 1.2,
      maxTokens: 8192,
      conversations: [{ id: 'c1', title: '对话1', updatedAt: '2026-07-10T00:00:00Z' }],
      messages: [makeUIMsg()],
      worldEntries: [{ id: 'w1', name: '世界1', enabled: true }],
      tokenBudget: { character: 10, worldInfo: 5, chatHistory: 0, remaining: 100 },
    };

    const ui = cardToUiChar(card, overrides);

    expect(ui.model).toBe('claude-3-5-sonnet');
    expect(ui.temperature).toBe(1.2);
    expect(ui.maxTokens).toBe(8192);
    expect(ui.conversations).toHaveLength(1);
    expect(ui.messages).toHaveLength(1);
    expect(ui.worldEntries).toHaveLength(1);
    expect(ui.tokenBudget.remaining).toBe(100);
  });

  it('应在无 overrides 时使用默认值', () => {
    const ui = cardToUiChar(makeCard());

    expect(ui.model).toBe('gpt-4o');
    expect(ui.temperature).toBe(1.0);
    expect(ui.maxTokens).toBe(4096);
    expect(ui.conversations).toEqual([]);
    expect(ui.messages).toEqual([]);
    expect(ui.worldEntries).toEqual([]);
    expect(ui.tokenBudget).toEqual({
      character: 0,
      worldInfo: 0,
      chatHistory: 0,
      remaining: 8192,
    });
  });

  it('应对 tags 做拷贝', () => {
    const card = makeCard();
    const ui = cardToUiChar(card);

    expect(ui.tags).not.toBe(card.tags);
    expect(ui.tags).toEqual(card.tags);
  });
});

describe('type-adapters — 角色卡 round-trip', () => {
  it('uiCharToCard → cardToUiChar 应保留核心字段与透传的 UI 独有字段（候选3）', () => {
    const original = makeUIChar({
      authorNote: '保持冷静',
      authorDepth: 5,
      storyId: 'story-9',
      boundWorldBookIds: ['wb-1', 'wb-2'],
    });

    const card = uiCharToCard(original);
    const roundTrip = cardToUiChar(card);

    expect(roundTrip.id).toBe(original.id);
    expect(roundTrip.name).toBe(original.name);
    expect(roundTrip.avatar).toBe(original.avatar);
    expect(roundTrip.description).toBe(original.description);
    expect(roundTrip.tags).toEqual(original.tags);
    expect(roundTrip.favorite).toBe(original.favorite);
    expect(roundTrip.authorNote).toBe('保持冷静');
    expect(roundTrip.authorDepth).toBe(5);
    // 候选3：此前丢失的生成/外观/关联字段现在无损
    expect(roundTrip.model).toBe(original.model);
    expect(roundTrip.temperature).toBe(original.temperature);
    expect(roundTrip.maxTokens).toBe(original.maxTokens);
    expect(roundTrip.avatarType).toBe(original.avatarType);
    expect(roundTrip.storyId).toBe('story-9');
    expect(roundTrip.boundWorldBookIds).toEqual(['wb-1', 'wb-2']);
  });

  it('渐变角色外观 round-trip 无损', () => {
    const original = makeUIChar({
      avatar: undefined,
      avatarType: 'gradient',
      gradientFrom: 'var(--tk-rose-400)',
      gradientTo: 'var(--tk-rose-900)',
    });

    const roundTrip = cardToUiChar(uiCharToCard(original));

    expect(roundTrip.avatarType).toBe('gradient');
    expect(roundTrip.gradientFrom).toBe('var(--tk-rose-400)');
    expect(roundTrip.gradientTo).toBe('var(--tk-rose-900)');
  });

  it('cardToUiChar → uiCharToCard 应保留核心字段与 personality/scenario（候选3）', () => {
    const original = makeCard({
      characterNote: { text: '保持矮人口吻', depth: 4, role: 'system' },
      personality: '勇猛直率',
      scenario: '酒馆遭遇',
    });

    const ui = cardToUiChar(original);
    const roundTrip = uiCharToCard(ui);

    expect(roundTrip.id).toBe(original.id);
    expect(roundTrip.name).toBe(original.name);
    expect(roundTrip.avatar).toBe(original.avatar);
    expect(roundTrip.tags).toEqual(original.tags);
    expect(roundTrip.favorite).toBe(original.favorite);
    expect(roundTrip.characterNote).toEqual({
      text: '保持矮人口吻',
      depth: 4,
      role: 'system',
    });
    // 候选3：personality/scenario 不再因合并进 description 而在保存时丢失
    expect(roundTrip.personality).toBe('勇猛直率');
    expect(roundTrip.scenario).toBe('酒馆遭遇');
  });

  it('无 storyId / boundWorldBookIds 时 round-trip 保持未设置语义', () => {
    const ui = makeUIChar();
    expect(ui.storyId).toBeUndefined();

    const roundTrip = cardToUiChar(uiCharToCard(ui));

    expect(roundTrip.storyId).toBeUndefined();
    expect(roundTrip.boundWorldBookIds).toBeUndefined();
  });

  it('有损边界：对话/会话/世界条目/Token 预算不经过角色卡持久化（各自 store 负责）', () => {
    const original = makeUIChar({
      conversations: [{ id: 'c1', title: '对话', updatedAt: '2026-07-10T00:00:00Z' }],
      messages: [makeUIMsg()],
      worldEntries: [{ id: 'w1', name: '世界', enabled: true }],
      tokenBudget: { character: 10, worldInfo: 5, chatHistory: 0, remaining: 100 },
    });

    const roundTrip = cardToUiChar(uiCharToCard(original));

    // 这些字段不写入 CharacterCard，round-trip 后回到空默认（有意设计）
    expect(roundTrip.conversations).toEqual([]);
    expect(roundTrip.messages).toEqual([]);
    expect(roundTrip.worldEntries).toEqual([]);
    expect(roundTrip.tokenBudget).toEqual({
      character: 0,
      worldInfo: 0,
      chatHistory: 0,
      remaining: 8192,
    });
  });

  it('迭代33：UI 扩展字段存入 ext 命名空间并 round-trip 保留', () => {
    const original = makeUIChar({
      model: 'deepseek-v3',
      temperature: 1.4,
      maxTokens: 6144,
      avatarType: 'gradient',
      gradientFrom: '#111111',
      gradientTo: '#222222',
      storyId: 'story-9',
      boundWorldBookIds: ['lb-1', 'lb-2'],
    });

    const card = uiCharToCard(original);

    // 收进 ext，不散落顶层索引签名
    expect(card.ext).toEqual({
      model: 'deepseek-v3',
      temperature: 1.4,
      maxTokens: 6144,
      avatarType: 'gradient',
      gradientFrom: '#111111',
      gradientTo: '#222222',
      storyId: 'story-9',
      boundWorldBookIds: ['lb-1', 'lb-2'],
    });
    expect((card as Record<string, unknown>).model).toBeUndefined();

    // round-trip 无损
    const roundTrip = cardToUiChar(card);
    expect(roundTrip.model).toBe('deepseek-v3');
    expect(roundTrip.temperature).toBe(1.4);
    expect(roundTrip.maxTokens).toBe(6144);
    expect(roundTrip.avatarType).toBe('gradient');
    expect(roundTrip.gradientFrom).toBe('#111111');
    expect(roundTrip.gradientTo).toBe('#222222');
    expect(roundTrip.storyId).toBe('story-9');
    expect(roundTrip.boundWorldBookIds).toEqual(['lb-1', 'lb-2']);
  });

  it('迭代33：兼容旧格式（顶层索引签名字段回退读取）', () => {
    // 旧持久化数据：字段直接存顶层，无 ext
    const legacyCard = makeCard({
      avatar: '',
      model: 'legacy-model',
      temperature: 0.3,
      maxTokens: 1024,
      avatarType: 'gradient',
      gradientFrom: '#333333',
      storyId: 'story-old',
      boundWorldBookIds: ['lb-old'],
    }) as CharacterCard;

    const ui = cardToUiChar(legacyCard);

    expect(ui.model).toBe('legacy-model');
    expect(ui.temperature).toBe(0.3);
    expect(ui.maxTokens).toBe(1024);
    expect(ui.avatarType).toBe('gradient');
    expect(ui.gradientFrom).toBe('#333333');
    expect(ui.storyId).toBe('story-old');
    expect(ui.boundWorldBookIds).toEqual(['lb-old']);

    // ext 优先于旧格式（新数据覆盖旧字段）
    const mixed = makeCard({
      model: 'top-level-model',
      ext: { model: 'ext-model' },
    }) as CharacterCard;
    expect(cardToUiChar(mixed).model).toBe('ext-model');
  });
});

describe('type-adapters — uiMsgToChatMsg', () => {
  it('应将数字时间戳转为 ISO 字符串', () => {
    const ts = 1721300000000;
    const msg = uiMsgToChatMsg(makeUIMsg({ timestamp: ts }));

    expect(msg.timestamp).toBe(new Date(ts).toISOString());
  });

  it('应保留字符串时间戳（已是 ISO 格式）', () => {
    // 类型上 UIMessage.timestamp 是 number，但运行时可能传入字符串
    const msg = uiMsgToChatMsg({
      id: 'm1',
      role: 'user',
      content: 'hi',
      timestamp: '2026-07-10T00:00:00Z' as unknown as number,
    });

    expect(msg.timestamp).toBe('2026-07-10T00:00:00Z');
  });

  it('应正确映射 id/role/content', () => {
    const msg = uiMsgToChatMsg(makeUIMsg({ role: 'assistant', content: '回复' }));

    expect(msg.id).toBe('msg-1');
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('回复');
  });

  it('应初始化空 swipes 数组与 swipeIndex=0', () => {
    const msg = uiMsgToChatMsg(makeUIMsg());

    expect(msg.swipes).toEqual([]);
    expect(msg.swipeIndex).toBe(0);
  });
});

describe('type-adapters — chatMsgToUiMsg', () => {
  it('应将 ISO 字符串时间戳转为数字', () => {
    const iso = '2026-07-10T00:00:00Z';
    const ui = chatMsgToUiMsg(makeChatMsg({ timestamp: iso }));

    expect(ui).not.toBeNull();
    expect(ui!.timestamp).toBe(new Date(iso).getTime());
  });

  it('应保留数字时间戳', () => {
    const ui = chatMsgToUiMsg({
      id: 'm1',
      role: 'user',
      content: 'hi',
      timestamp: 1234567890 as unknown as string,
      swipes: [],
      swipeIndex: 0,
    });

    expect(ui).not.toBeNull();
    expect(ui!.timestamp).toBe(1234567890);
  });

  it('应过滤 system 角色消息（返回 null）', () => {
    const ui = chatMsgToUiMsg(makeChatMsg({ role: 'system' }));

    expect(ui).toBeNull();
  });

  it('应保留 user / assistant 消息', () => {
    expect(chatMsgToUiMsg(makeChatMsg({ role: 'user' }))?.role).toBe('user');
    expect(chatMsgToUiMsg(makeChatMsg({ role: 'assistant' }))?.role).toBe('assistant');
  });

  it('应正确映射 id/content（swipes/swipeIndex 在 UI 层不展示，转换时丢弃）', () => {
    const msg = makeChatMsg({
      id: 'm9',
      content: '内容',
      swipes: ['内容', '另一版本'],
      swipeIndex: 1,
    });
    const ui = chatMsgToUiMsg(msg);

    expect(ui).not.toBeNull();
    expect(ui!.id).toBe('m9');
    expect(ui!.content).toBe('内容');
    // UI 层 UIMessage 类型无 swipes/swipeIndex 字段（核心层 ChatMessage 的版本管理
    // 不进入 UI 层展示，由 MessageBubble 内部状态处理）
    expect((ui as unknown as Record<string, unknown>).swipes).toBeUndefined();
    expect((ui as unknown as Record<string, unknown>).swipeIndex).toBeUndefined();
  });
});

describe('type-adapters — 批量转换', () => {
  it('uiMsgsToChatMsgs 应批量转换', () => {
    const msgs = [
      makeUIMsg({ id: 'm1', timestamp: 1000 }),
      makeUIMsg({ id: 'm2', role: 'assistant', timestamp: 2000 }),
    ];

    const result = uiMsgsToChatMsgs(msgs);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('m1');
    expect(result[1]!.id).toBe('m2');
    expect(result[0]!.timestamp).toBe(new Date(1000).toISOString());
    expect(result[1]!.timestamp).toBe(new Date(2000).toISOString());
  });

  it('uiMsgsToChatMsgs 空数组应返回空数组', () => {
    expect(uiMsgsToChatMsgs([])).toEqual([]);
  });

  it('chatMsgsToUiMsgs 应批量转换并过滤 system 消息', () => {
    const msgs = [
      makeChatMsg({ id: 'm1', role: 'system' }),
      makeChatMsg({ id: 'm2', role: 'user' }),
      makeChatMsg({ id: 'm3', role: 'assistant' }),
      makeChatMsg({ id: 'm4', role: 'system' }),
    ];

    const result = chatMsgsToUiMsgs(msgs);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('chatMsgsToUiMsgs 空数组应返回空数组', () => {
    expect(chatMsgsToUiMsgs([])).toEqual([]);
  });

  it('chatMsgsToUiMsgs 全部 system 消息应返回空数组', () => {
    const msgs = [
      makeChatMsg({ role: 'system' }),
      makeChatMsg({ role: 'system' }),
    ];

    expect(chatMsgsToUiMsgs(msgs)).toEqual([]);
  });
});

describe('type-adapters — worldEntriesToStorage', () => {
  it('应原样复制所有条目', () => {
    const entries: WorldEntry[] = [
      { id: 'w1', name: '世界1', enabled: true },
      { id: 'w2', name: '世界2', enabled: false },
    ];

    const result = worldEntriesToStorage(entries);

    expect(result).toEqual(entries);
  });

  it('应对每个条目做浅拷贝（不共享引用）', () => {
    const entries: WorldEntry[] = [
      { id: 'w1', name: '世界1', enabled: true },
    ];

    const result = worldEntriesToStorage(entries);

    expect(result).not.toBe(entries);
    expect(result[0]).not.toBe(entries[0]);
    expect(result[0]).toEqual(entries[0]);
  });

  it('空数组应返回空数组', () => {
    expect(worldEntriesToStorage([])).toEqual([]);
  });

  it('修改返回值不影响原数组', () => {
    const entries: WorldEntry[] = [
      { id: 'w1', name: '世界1', enabled: true },
    ];

    const result = worldEntriesToStorage(entries);
    result[0]!.name = '修改后';

    expect(entries[0]!.name).toBe('世界1');
  });
});
