import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import 'fake-indexeddb/auto';

// Mock createApiClient：返回预设的 AI 响应
const mockChat = vi.fn();
vi.mock('@/api', () => ({
  createApiClient: vi.fn(() => ({
    provider: 'openai',
    chat: mockChat,
    chatStream: vi.fn(),
  })),
}));

// Mock useSettingsStore：返回有 API profile 的配置
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    apiProfiles: [
      {
        id: 'p1',
        name: '测试 API',
        provider: 'openai' as const,
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'gpt-4o',
      },
    ],
    activeApiProfileId: 'p1',
    activeProfile: {
      id: 'p1',
      name: '测试 API',
      provider: 'openai' as const,
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'gpt-4o',
    },
  }),
}));

import { useCharacterStore } from '@/stores/character';

// ── 测试夹具 ──

/** AI 返回的合法角色 JSON */
function makeValidResponse(): string {
  return JSON.stringify({
    name: '艾莉娅',
    description: '一位银发精灵法师，守护古老森林。',
    personality: '温柔但内心坚韧',
    scenario: '森林相遇',
    firstMessage: '*你醒了* "你终于醒了。"',
    tags: ['奇幻', '法师'],
    attributes: {
      profession: '法师',
      level: 5,
      experience: 1200,
      stats: [{ name: '智力', value: '18', type: 'number' }],
    },
  });
}

describe('角色随机生成 store action (F01.7)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockChat.mockReset();
  });

  it('成功生成角色并添加到列表', async () => {
    mockChat.mockResolvedValue(makeValidResponse());
    const store = useCharacterStore();

    const initialCount = store.characters.length;
    const id = await store.generateRandomCharacter('fantasy');

    expect(id).not.toBeNull();
    expect(store.characters.length).toBe(initialCount + 1);

    const generated = store.characters.find((c) => c.id === id);
    expect(generated).toBeDefined();
    expect(generated!.name).toBe('艾莉娅');
    expect(generated!.description).toContain('银发精灵');
    expect(generated!.tags).toEqual(['奇幻', '法师']);
  });

  it('生成角色包含属性字段 (F01.6 集成)', async () => {
    mockChat.mockResolvedValue(makeValidResponse());
    const store = useCharacterStore();

    const id = await store.generateRandomCharacter('fantasy');
    const generated = store.characters.find((c) => c.id === id);

    expect(generated!.attributes).toBeDefined();
    expect(generated!.attributes!.profession).toBe('法师');
    expect(generated!.attributes!.level).toBe(5);
    expect(generated!.attributes!.experience).toBe(1200);
    expect(generated!.attributes!.stats).toHaveLength(1);
  });

  it('生成角色包含首消息', async () => {
    mockChat.mockResolvedValue(makeValidResponse());
    const store = useCharacterStore();

    const id = await store.generateRandomCharacter('fantasy');
    const generated = store.characters.find((c) => c.id === id);

    expect(generated!.messages).toHaveLength(1);
    expect(generated!.messages[0]!.role).toBe('assistant');
    expect(generated!.messages[0]!.content).toContain('你醒了');
  });

  it('生成中 isGeneratingCharacter 为 true，完成后为 false', async () => {
    let resolveChat: (v: string) => void;
    mockChat.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveChat = resolve;
      })
    );
    const store = useCharacterStore();

    const promise = store.generateRandomCharacter('fantasy');
    expect(store.isGeneratingCharacter).toBe(true);

    resolveChat!(makeValidResponse());
    await promise;

    expect(store.isGeneratingCharacter).toBe(false);
  });

  it('API 调用使用正确的参数（温度 1.0、maxTokens 1500）', async () => {
    mockChat.mockResolvedValue(makeValidResponse());
    const store = useCharacterStore();

    await store.generateRandomCharacter('scifi');

    expect(mockChat).toHaveBeenCalledTimes(1);
    const request = mockChat.mock.calls[0]![0];
    expect(request.temperature).toBe(1.0);
    expect(request.maxTokens).toBe(1500);
    expect(request.model).toBe('gpt-4o');
    expect(request.messages).toHaveLength(2);
  });

  it('生成失败时返回 null 并设置 lastError', async () => {
    mockChat.mockRejectedValue(new Error('网络错误'));
    const store = useCharacterStore();

    const id = await store.generateRandomCharacter('fantasy');

    expect(id).toBeNull();
    expect(store.lastError).toContain('生成失败');
    expect(store.lastError).toContain('网络错误');
  });

  it('AI 返回无法解析的文本时返回 null', async () => {
    mockChat.mockResolvedValue('这不是 JSON');
    const store = useCharacterStore();

    const id = await store.generateRandomCharacter('fantasy');

    expect(id).toBeNull();
    expect(store.lastError).toContain('无法解析');
  });

  it('生成中再次调用返回 null（防重入）', async () => {
    let resolveChat: (v: string) => void;
    mockChat.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveChat = resolve;
      })
    );
    const store = useCharacterStore();

    const promise1 = store.generateRandomCharacter('fantasy');
    // 生成中再次调用
    const id2 = await store.generateRandomCharacter('fantasy');
    expect(id2).toBeNull();

    resolveChat!(makeValidResponse());
    await promise1;
  });

  /**
   * T-16：新建角色不得写死 maxTokens
   *
   * 角色级一旦携带显式值，就会无条件覆盖 Profile 级配置（历史死代码）。
   * `createCharacter` 与 `generateRandomCharacter` 是两条**独立**的新建路径，
   * 必须同时满足，缺一条就等于死代码在该路径上没修掉。
   */
  it('T-16：generateRandomCharacter 生成的角色 maxTokens 未设置（回落 Profile 级）', async () => {
    mockChat.mockResolvedValue(makeValidResponse());
    const store = useCharacterStore();

    const id = await store.generateRandomCharacter('fantasy');
    const generated = store.characters.find((c) => c.id === id);

    expect(generated).toBeDefined();
    expect(generated!.maxTokens).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(generated!, 'maxTokens')).toBe(false);
  });

  it('T-16：createCharacter 新建的角色 maxTokens 同样未设置（两条路径一致）', () => {
    const store = useCharacterStore();

    const id = store.createCharacter();
    const created = store.characters.find((c) => c.id === id);

    expect(created).toBeDefined();
    expect(created!.maxTokens).toBeUndefined();
  });

  it('T-16 防漂移：character store 内不再有任何角色级 maxTokens 硬编码', () => {
    const ROOT = resolve(__dirname, '../..');
    const src = readFileSync(resolve(ROOT, 'src/stores/character.ts'), 'utf8');

    // 历史魔法数字不得复活
    expect(src).not.toContain('maxTokens: 4096');
    // 全文件只剩 1 处 maxTokens —— 生成角色时的**API 调用参数**（1500），不是角色字段
    const hits = [...src.matchAll(/maxTokens:/g)];
    expect(hits.length).toBe(1);
    expect(src).toContain('maxTokens: 1500');
  });

  it('生成成功后设置 lastInfo', async () => {
    mockChat.mockResolvedValue(makeValidResponse());
    const store = useCharacterStore();

    await store.generateRandomCharacter('fantasy');

    expect(store.lastInfo).toContain('已生成新角色');
    expect(store.lastInfo).toContain('艾莉娅');
  });
});
