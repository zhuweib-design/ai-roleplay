/**
 * Prompt Builder Lorebook 集成测试 (W7 · W6)
 *
 * 验证 F06.2-F06.3：Lorebook 条目在 prompt 中的正确注入位置
 * - beforeCharDefs: 角色定义前
 * - afterCharDefs: 角色定义后
 * - atDepth: 指定深度 @D
 * - 向后兼容：无 lorebooks 参数时行为不变
 * - activatedEntries 返回用于调试
 */
import { describe, it, expect } from 'vitest';
import { buildPrompt, type PromptSettings } from '@core/prompt-builder';
import type { CharacterCard, ChatMessage } from '@core/character-card';
import type { Lorebook } from '@core/lorebook';

// ── 辅助构造 ──

function makeCard(patch: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'char-1',
    name: 'Alice',
    avatar: '',
    description: '描述',
    personality: '性格',
    scenario: '场景',
    firstMessage: '你好',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...patch,
  };
}

function makeMsg(role: 'user' | 'assistant', content: string, id?: string): ChatMessage {
  return {
    id: id ?? `msg-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    timestamp: '2025-01-01T00:00:00.000Z',
    swipes: [],
    swipeIndex: 0,
  };
}

const settings: PromptSettings = {
  systemPrompt: '系统提示',
  maxContextTokens: 8192,
  reservedTokens: 1024,
  userName: 'User',
};

function makeLorebook(entries: Lorebook['entries']): Lorebook {
  return {
    id: 'lb-1',
    name: '测试世界书',
    description: '',
    entries,
    scope: 'global',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('prompt-builder · Lorebook 集成', () => {
  it('无 lorebooks 参数时向后兼容（不报错，不注入）', () => {
    const card = makeCard();
    const built = buildPrompt(card, [], '你好', settings);
    expect(built.activatedEntries).toBeUndefined();
    // 第一条应是 system
    expect(built.messages[0].role).toBe('system');
  });

  it('空 lorebooks 数组不注入条目', () => {
    const card = makeCard();
    const built = buildPrompt(card, [], '你好', settings, { lorebooks: [] });
    expect(built.activatedEntries).toBeUndefined();
  });

  it('constant 条目始终激活', () => {
    const lb = makeLorebook([
      {
        id: 'e1',
        title: '常量',
        keys: [],
        content: '常量条目内容',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);
    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    expect(built.activatedEntries).toHaveLength(1);
    expect(built.activatedEntries![0].entry.id).toBe('e1');
  });

  it('beforeCharDefs 条目拼接到系统提示词前（角色定义前）', () => {
    const lb = makeLorebook([
      {
        id: 'b1',
        title: '前置',
        keys: [],
        content: 'BEFORE_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'beforeCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);
    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;
    // BEFORE_CONTENT 应在 "Name: Alice" 之前
    const beforeIdx = systemContent.indexOf('BEFORE_CONTENT');
    const nameIdx = systemContent.indexOf('Name: Alice');
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeGreaterThan(beforeIdx);
  });

  it('afterCharDefs 条目拼接到系统提示词后（角色定义后）', () => {
    const lb = makeLorebook([
      {
        id: 'a1',
        title: '后置',
        keys: [],
        content: 'AFTER_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);
    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;
    const afterIdx = systemContent.indexOf('AFTER_CONTENT');
    const nameIdx = systemContent.indexOf('Name: Alice');
    expect(afterIdx).toBeGreaterThan(nameIdx);
  });

  it('atDepth 条目按深度插入到消息列表', () => {
    // 构造 4 条历史消息
    const history = [
      makeMsg('user', 'u1'),
      makeMsg('assistant', 'a1'),
      makeMsg('user', 'u2'),
      makeMsg('assistant', 'a2'),
    ];

    const lb = makeLorebook([
      {
        id: 'd1',
        title: '深度条目',
        keys: [],
        content: 'DEPTH_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'atDepth',
        depth: 1, // 从末尾往前第 1 条之后
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);

    const built = buildPrompt(makeCard(), history, '你好', settings, { lorebooks: [lb] });

    // 应有一条独立的 system 消息包含 DEPTH_CONTENT
    const depthMsg = built.messages.find((m) => m.content === 'DEPTH_CONTENT');
    expect(depthMsg).toBeDefined();
    expect(depthMsg!.role).toBe('system');
  });

  it('关键词触发：仅命中关键词的条目才激活', () => {
    const lb = makeLorebook([
      {
        id: 'k1',
        title: '魔法',
        keys: ['魔法'],
        content: '魔法条目',
        strategy: 'keyword',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
      {
        id: 'k2',
        title: '剑',
        keys: ['剑'],
        content: '剑条目',
        strategy: 'keyword',
        probability: 100,
        insertionOrder: 2,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);

    // 历史中包含 "魔法"
    const history = [makeMsg('user', '使用魔法')];
    const built = buildPrompt(makeCard(), history, '继续', settings, { lorebooks: [lb] });

    expect(built.activatedEntries).toHaveLength(1);
    expect(built.activatedEntries![0].entry.id).toBe('k1');
    // 系统消息中应包含 "魔法条目" 但不包含 "剑条目"
    const systemContent = built.messages[0].content;
    expect(systemContent).toContain('魔法条目');
    expect(systemContent).not.toContain('剑条目');
  });

  it('禁用条目不激活', () => {
    const lb = makeLorebook([
      {
        id: 'dis1',
        title: '禁用',
        keys: [],
        content: '禁用内容',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: false, // 禁用
        logic: 'AND_ANY',
      },
    ]);
    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    expect(built.activatedEntries).toBeUndefined();
  });

  it('包含组：同组仅激活一条', () => {
    const lb = makeLorebook([
      {
        id: 'g1',
        title: 'A',
        keys: [],
        content: 'G1_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: 'groupA',
        enabled: true,
        logic: 'AND_ANY',
      },
      {
        id: 'g2',
        title: 'B',
        keys: [],
        content: 'G2_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 2,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: 'groupA',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);
    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    expect(built.activatedEntries).toHaveLength(1);
    // 只有一个条目内容出现在 system 中
    const systemContent = built.messages[0].content;
    const hasG1 = systemContent.includes('G1_CONTENT');
    const hasG2 = systemContent.includes('G2_CONTENT');
    expect(hasG1 || hasG2).toBe(true);
    expect(hasG1 && hasG2).toBe(false);
  });

  it('多个 Lorebook 的激活结果合并', () => {
    const lb1 = makeLorebook([
      {
        id: 'lb1-e1',
        title: 'LB1',
        keys: [],
        content: 'LB1_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);
    const lb2 = makeLorebook([
      {
        id: 'lb2-e1',
        title: 'LB2',
        keys: [],
        content: 'LB2_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 2,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb1, lb2] });
    expect(built.activatedEntries).toHaveLength(2);
    const systemContent = built.messages[0].content;
    expect(systemContent).toContain('LB1_CONTENT');
    expect(systemContent).toContain('LB2_CONTENT');
  });
});

// ── F06.7 整体世界描述 ──

describe('prompt-builder · F06.7 整体世界描述', () => {
  it('worldDescription 作为常量注入系统提示词', () => {
    const lb = makeLorebook([]);
    lb.worldDescription = {
      name: '艾尔德林',
      type: 'fantasy',
      keys: ['魔法', '王国'],
      content: '这是一个充满魔法与古老王国的世界。',
    };

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    // 应包含世界描述内容
    expect(systemContent).toContain('这是一个充满魔法与古老王国的世界。');
    // 应包含 header
    expect(systemContent).toContain('[World: 艾尔德林 (fantasy)]');
  });

  it('无 name 时使用 type 作为 header', () => {
    const lb = makeLorebook([]);
    lb.worldDescription = {
      name: '',
      type: 'scifi',
      keys: [],
      content: '未来世界描述。',
    };

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    expect(systemContent).toContain('[World Type: scifi]');
    expect(systemContent).toContain('未来世界描述。');
  });

  it('worldDescription 注入位置在 beforeCharDefs 之前（系统提示词后）', () => {
    const lb = makeLorebook([
      {
        id: 'b1',
        title: '前置条目',
        keys: [],
        content: 'BEFORE_ENTRY',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'beforeCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);
    lb.worldDescription = {
      name: '世界',
      type: 'modern',
      keys: [],
      content: 'WORLD_DESC_CONTENT',
    };

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    // 世界描述应在 BEFORE_ENTRY 之前
    const worldIdx = systemContent.indexOf('WORLD_DESC_CONTENT');
    const beforeIdx = systemContent.indexOf('BEFORE_ENTRY');
    expect(worldIdx).toBeGreaterThanOrEqual(0);
    expect(beforeIdx).toBeGreaterThan(worldIdx);
  });

  it('worldDescription 注入位置在角色定义（Name: Alice）之前', () => {
    const lb = makeLorebook([]);
    lb.worldDescription = {
      name: '世界',
      type: 'historical',
      keys: [],
      content: 'HISTORICAL_WORLD',
    };

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    const worldIdx = systemContent.indexOf('HISTORICAL_WORLD');
    const nameIdx = systemContent.indexOf('Name: Alice');
    expect(worldIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeGreaterThan(worldIdx);
  });

  it('多个 Lorebook 的 worldDescription 顺序拼接', () => {
    const lb1 = makeLorebook([]);
    lb1.worldDescription = {
      name: '世界一',
      type: 'fantasy',
      keys: [],
      content: 'WORLD_ONE_CONTENT',
    };
    const lb2 = makeLorebook([]);
    lb2.id = 'lb-2';
    lb2.worldDescription = {
      name: '世界二',
      type: 'scifi',
      keys: [],
      content: 'WORLD_TWO_CONTENT',
    };

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb1, lb2] });
    const systemContent = built.messages[0].content;

    expect(systemContent).toContain('WORLD_ONE_CONTENT');
    expect(systemContent).toContain('WORLD_TWO_CONTENT');
    // 顺序：世界一在世界二之前
    expect(systemContent.indexOf('WORLD_ONE_CONTENT')).toBeLessThan(
      systemContent.indexOf('WORLD_TWO_CONTENT')
    );
  });

  it('worldDescription.content 为空字符串时不注入', () => {
    const lb = makeLorebook([]);
    lb.worldDescription = {
      name: '空世界',
      type: 'other',
      keys: [],
      content: '',
    };

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    // 不应包含 header
    expect(systemContent).not.toContain('[World: 空世界');
  });

  it('worldDescription 为 null 时不注入（向后兼容）', () => {
    const lb = makeLorebook([]);
    lb.worldDescription = null;

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    expect(systemContent).not.toContain('[World:');
    expect(systemContent).not.toContain('[World Type:');
  });

  it('worldDescription 未定义时行为同 null（向后兼容）', () => {
    const lb = makeLorebook([]); // worldDescription 未设置

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    expect(systemContent).not.toContain('[World:');
  });

  it('worldDescription 与条目共存时均注入', () => {
    const lb = makeLorebook([
      {
        id: 'e1',
        title: '常量条目',
        keys: [],
        content: 'ENTRY_CONTENT',
        strategy: 'constant',
        probability: 100,
        insertionOrder: 1,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
      },
    ]);
    lb.worldDescription = {
      name: '共存世界',
      type: 'fantasy',
      keys: [],
      content: 'WORLD_CONTENT',
    };

    const built = buildPrompt(makeCard(), [], '你好', settings, { lorebooks: [lb] });
    const systemContent = built.messages[0].content;

    expect(systemContent).toContain('WORLD_CONTENT');
    expect(systemContent).toContain('ENTRY_CONTENT');
    // 世界描述应在条目之前
    expect(systemContent.indexOf('WORLD_CONTENT')).toBeLessThan(
      systemContent.indexOf('ENTRY_CONTENT')
    );
  });
});
