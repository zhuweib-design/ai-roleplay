/**
 * lorebook store · AI 生成世界观这条链路
 *
 * 起点是 2026-10-14 的报障：手机上生成世界观，提示"生成失败：无法解析 AI 返回的世界数据"。
 * 那句话背后至少有五种成因（空返回 / 不是 JSON / 被输出上限截断 / 顶层字段不对 / 大区缺 title），
 * 处理方式各不相同，所以这组测试盯两件事：
 *   1. 请求里的输出预算由"模型最大上下文"推导（= 上下文 − 输入 − 预留），不再写死一个比
 *      提示词要求还小的数（旧值 2000 比中位需求 3895 还小 ⇒ 必被截断）；
 *   2. 失败时界面拿到的是"带证据的分类"，而不是那句笼统的"无法解析"。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';

// Mock createApiClient：AI 返回什么由用例决定
const mockChat = vi.fn();
vi.mock('@/api', () => ({
  createApiClient: vi.fn(() => ({
    provider: 'openai',
    chat: mockChat,
    chatStream: vi.fn(),
  })),
}));

// Mock useSettingsStore：给一个有激活 API profile 的配置 + 全局上下文/预留
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    activeProfile: {
      id: 'p1',
      name: '测试 API',
      provider: 'openai' as const,
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'gpt-4o',
    },
    maxContextTokens: 8192,
    reservedTokens: 1024,
  }),
}));

import { useLorebookStore } from '@/stores/lorebook';
import { useCharacterStore } from '@/stores/character';
import { collectLorebooksForCharacter } from '@/stores/chat-context';
import { measureInputTokens } from '@core/token-budget';
import type { ChatMessage } from '@core/token-counter';
import { t } from '@/i18n';

/** 一份合法的最小世界观 JSON */
function validWorldJson(): string {
  return JSON.stringify({
    world: { name: '雾脊商路', type: 'fantasy', keys: ['雾脊'], content: '总览描述' },
    regions: [
      {
        title: '大区甲',
        keys: ['甲'],
        content: '大区描述',
        subAreas: [{ title: '子区', keys: ['子'], content: '子区描述' }],
      },
    ],
  });
}

describe('lorebook · AI 生成世界观', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockChat.mockReset();
  });

  it('合法返回 ⇒ 生成成功，不报错', async () => {
    mockChat.mockResolvedValue(validWorldJson());
    const store = useLorebookStore();
    const id = await store.generateRandomWorldbook('fantasy');
    expect(id).not.toBeNull();
    expect(store.lastError).toBeNull();
  });

  it('输出预算 = 上下文 − 输入 − 预留（不再写死；旧值 2000 比中位需求 3895 还小）', async () => {
    mockChat.mockResolvedValue(validWorldJson());
    const store = useLorebookStore();
    await store.generateRandomWorldbook('fantasy');
    const sent = mockChat.mock.calls[0]![0] as { messages: ChatMessage[]; maxTokens: number };
    const input = await measureInputTokens(sent.messages);
    expect(sent.maxTokens).toBe(8192 - 1024 - input);
    // 提示词按中位字数写要 3895：预算必须装得下，否则又会被掐断成"无法解析"
    expect(sent.maxTokens).toBeGreaterThanOrEqual(3895);
  });

  it('返回被截断 ⇒ 不再说"无法解析"，而是说清"不完整/被截断"并带上收到的字数', async () => {
    const full = validWorldJson();
    const cut = full.slice(0, Math.floor(full.length * 0.6));
    mockChat.mockResolvedValue(cut);
    const store = useLorebookStore();
    const id = await store.generateRandomWorldbook('fantasy');
    expect(id).toBeNull();
    expect(store.lastError).toContain('截断');
    expect(store.lastError).toContain(String(cut.length)); // 证据：字数
    expect(store.lastError).not.toBe(t('lb.genParseFailed'));
  });

  it('大区用了 name 而不是 title ⇒ 点名"没有 title"并报出个数', async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({
        world: { name: '世界', type: 'fantasy', keys: [], content: '' },
        regions: [
          { name: '大区甲', keys: [], content: '' },
          { name: '大区乙', keys: [], content: '' },
        ],
      })
    );
    const store = useLorebookStore();
    expect(await store.generateRandomWorldbook('fantasy')).toBeNull();
    expect(store.lastError).toContain('title');
    expect(store.lastError).toContain('2');
  });

  it('空返回（思考型模型只回思考过程）⇒ 说"空内容"，不说"无法解析"', async () => {
    mockChat.mockResolvedValue('');
    const store = useLorebookStore();
    expect(await store.generateRandomWorldbook('fantasy')).toBeNull();
    expect(store.lastError).toContain('空内容');
    expect(store.lastError).not.toBe(t('lb.genParseFailed'));
  });

  it('返回纯文字、不是 JSON ⇒ 把开头片段带出来', async () => {
    mockChat.mockResolvedValue('很抱歉，我无法完成这个请求，因为……');
    const store = useLorebookStore();
    expect(await store.generateRandomWorldbook('fantasy')).toBeNull();
    expect(store.lastError).toContain('不是 JSON');
    expect(store.lastError).toContain('很抱歉');
  });
});

/**
 * 生成即归属（OPT_PLAN 专项 B 第一条）
 *
 * 旧实现里 `scope === 'character'` 时把 `characterId` 强行写成 undefined，而
 * `updateLorebook` 又不接受 characterId —— 注释说"调用方之后再调整绑定"，
 * 但那条路根本不存在。后果：在某个角色的语境里生成的世界，最后落成了全局书。
 */
describe('lorebook · 生成结果的归属角色', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockChat.mockReset();
    mockChat.mockResolvedValue(validWorldJson());
  });

  it('传了 characterId ⇒ 新书就带着它，不被抹成 undefined', async () => {
    const store = useLorebookStore();
    const id = await store.generateRandomWorldbook('fantasy', 'character', undefined, 'char-9');
    expect(id).not.toBeNull();
    const lb = store.lorebooks.find((l) => l.id === id);
    expect(lb?.scope).toBe('character');
    expect(lb?.characterId).toBe('char-9');
  });

  it('负向对照：不传归属时仍是全局书（默认行为没被改坏）', async () => {
    const store = useLorebookStore();
    const id = await store.generateRandomWorldbook('fantasy');
    const lb = store.lorebooks.find((l) => l.id === id);
    expect(lb?.scope).toBe('global');
    expect(lb?.characterId).toBeUndefined();
  });

  it('updateLorebook 现在改得动 characterId（以前函数签名里就没这个字段）', async () => {
    const store = useLorebookStore();
    const id = await store.generateRandomWorldbook('fantasy');
    expect(store.updateLorebook(id!, { scope: 'character', characterId: 'char-3' })).toBe(true);
    expect(store.lorebooks.find((l) => l.id === id)?.characterId).toBe('char-3');
  });

  /**
   * OPT_PLAN §7.4 第一条，**负向是关键**：证明它"不是又一本全局书"。
   *
   * 这条断言走的是界面真实路径（WorldBookView.confirmGenerate 的两步）：
   *   1. generateRandomWorldbook(..., 'character', undefined, ownerId)
   *   2. characterStore.bindWorldBook(ownerId, lbId)
   * 少第二步的话，书上有 characterId 但角色侧 boundWorldBookIds 里没有——
   * 生效判定 `collectLorebooksForCharacter` 仍然吃 `lb.characterId === id`
   * 这条兼容分支，所以只看正向会"碰巧通过"，必须靠负向对照才验得出。
   */
  it('在某角色语境里生成 ⇒ 对该角色生效、对另一角色不生效（负向对照）', async () => {
    const lorebook = useLorebookStore();
    const character = useCharacterStore();
    const ownerId = character.createCharacter();
    const otherId = character.createCharacter();
    expect(ownerId).not.toBe(otherId);

    const lbId = await lorebook.generateRandomWorldbook('fantasy', 'character', undefined, ownerId);
    expect(lbId).not.toBeNull();
    character.bindWorldBook(ownerId, lbId!);

    const forOwner = collectLorebooksForCharacter(ownerId).map((l) => l.id);
    const forOther = collectLorebooksForCharacter(otherId).map((l) => l.id);
    expect(forOwner, '生成的书必须对该角色生效').toContain(lbId);
    expect(forOther, '生成的书不许对另一个角色生效（否则它就是一本全局书）').not.toContain(lbId);
  });
});
