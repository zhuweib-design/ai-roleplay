import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { ChatManager } from '../../src/services/chat-manager';
import type { ApiClient } from '../../src/api/api-client';
import type { ChatRequest, ChatStream, ChatStreamEvent } from '../../src/api/types';
import type { CharacterCard } from '@core/character-card';
import { uiCharToCard, cardToUiChar } from '../../src/services/type-adapters';
import { useChatStore } from '../../src/stores/chat';
import { useCharacterStore } from '../../src/stores/character';
import { useSettingsStore } from '../../src/stores/settings';
import type { UICharacter, ApiProfile } from '@/types';
import { initLocale } from '@/i18n';

/**
 * QA 独立验证 —— 任务 1：`profile.maxTokens` 死代码修复
 *
 * 与工程师用例的差异（不复用其断言）：
 * - 直接在 **ChatManager 合并层**断言请求对象，用 `'maxTokens' in request` 证明
 *   「键完全不存在」而不是「值为 undefined」（后者在 JSON 里同样消失，无法区分）
 * - 持久化侧断言 **键不存在**（hasOwnProperty），而非读回来是 undefined
 * - 覆盖工程师未覆盖的「AI 生成角色」路径（character store）
 *
 * 三档优先级契约：角色级 > Profile 级 > 不传（供应商默认）
 * 未设置 = undefined/null/0/负数/NaN，绝不用魔法数字表示未设置。
 */

// ── 夹具 ──

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'card-1',
    name: 'Seraphina',
    description: 'd',
    personality: 'p',
    scenario: 's',
    firstMessage: 'hi',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** 记录最后一次请求对象的 fake client */
function makeSpyClient(): { client: ApiClient; req: () => ChatRequest } {
  let captured: ChatRequest | null = null;
  const client: ApiClient = {
    provider: 'fake',
    async chat(req: ChatRequest): Promise<string> {
      captured = req;
      return 'ok';
    },
    async *chatStream(req: ChatRequest): ChatStream {
      captured = req;
      yield { type: 'done', fullContent: 'ok', finishReason: 'stop' } as ChatStreamEvent;
    },
  };
  return { client, req: () => captured as unknown as ChatRequest };
}

function makeCharacter(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'test-char',
    name: 'TestChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'T',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '测试角色',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    worldEntries: [],
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  };
}

function makeApiProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'test-profile',
    name: 'Test Profile',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    ...overrides,
  };
}

function makeSSEResponse(content = 'ok'): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          'data: ' +
            JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] }) +
            '\n\n'
        )
      );
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as Response;
}

// ── 1. 合并层：三档优先级（角色级 > Profile 级 > 不传） ──

describe('T-16 maxTokens 三档优先级 —— 合并层（QA 独立）', () => {
  beforeEach(() => {
    initLocale('zh');
  });

  it('角色级已设置时覆盖 Profile 级', async () => {
    const { client, req } = makeSpyClient();
    const manager = new ChatManager({ apiClient: client, model: 'gpt-4o', maxTokens: 1024 });
    await manager.sendMessage({
      card: makeCard(),
      history: [],
      userMessage: 'hi',
      overrides: { temperature: 0.7, maxTokens: 2048 },
    });
    expect(req().maxTokens).toBe(2048);
  });

  it('角色级未设置（不写该键）时 Profile 级生效 —— 死代码修复的核心', async () => {
    const { client, req } = makeSpyClient();
    const manager = new ChatManager({ apiClient: client, model: 'gpt-4o', maxTokens: 1024 });
    // 关键：overrides 里**完全没有** maxTokens 键（旧实现会写死 4096）
    const overrides: Record<string, unknown> = { temperature: 0.7 };
    expect('maxTokens' in overrides).toBe(false);
    await manager.sendMessage({
      card: makeCard(),
      history: [],
      userMessage: 'hi',
      overrides: overrides as never,
    });
    expect(req().maxTokens).toBe(1024);
  });

  it('两档都未设置时请求对象上**不存在** maxTokens 键（不是 0、不是 4096）', async () => {
    const { client, req } = makeSpyClient();
    const manager = new ChatManager({ apiClient: client, model: 'gpt-4o' });
    await manager.sendMessage({
      card: makeCard(),
      history: [],
      userMessage: 'hi',
      overrides: { temperature: 0.7 },
    });
    expect('maxTokens' in req()).toBe(false);
    expect(req().maxTokens).toBeUndefined();
  });

  it('回归防线：overrides 里写 undefined 仍会盖掉 Profile 级（修复必须靠"不写键"）', async () => {
    const { client, req } = makeSpyClient();
    const manager = new ChatManager({ apiClient: client, model: 'gpt-4o', maxTokens: 1024 });
    await manager.sendMessage({
      card: makeCard(),
      history: [],
      userMessage: 'hi',
      overrides: { temperature: 0.7, maxTokens: undefined },
    });
    // `{...config, ...overrides}` 会把 undefined 覆盖上去 —— 固化这个语义：
    // 只要有人把 maxTokens 键无条件写回 overrides（哪怕值是 undefined），
    // Profile 级就会再次失效，死代码复活。此断言是该回归的唯一哨兵。
    expect(req().maxTokens).toBeUndefined();
    expect('maxTokens' in req()).toBe(false);
  });
});

// ── 2. 端到端：chat store 实际下发的请求体 ──

describe('T-16 maxTokens —— store 端到端下发（QA 独立）', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function sendAndCaptureBody(
    profilePatch: Partial<ApiProfile>,
    charPatch: Partial<UICharacter>
  ): Promise<Record<string, unknown>> {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile(profilePatch));
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse());
    const char = makeCharacter({ id: 'e2e-char', ...charPatch });
    await chatStore.sendMessage(char, 'hi');
    const body = (spy.mock.calls[0]![1] as RequestInit).body as string;
    return JSON.parse(body) as Record<string, unknown>;
  }

  it('角色未设置 + Profile 已设置 → 下发 Profile 值', async () => {
    const body = await sendAndCaptureBody({ maxTokens: 1024 }, { maxTokens: undefined });
    expect(body.max_tokens).toBe(1024);
    expect('max_tokens' in body).toBe(true);
  });

  it('角色已设置 → 下发角色值（角色级优先）', async () => {
    const body = await sendAndCaptureBody({ maxTokens: 1024 }, { maxTokens: 2048 });
    expect(body.max_tokens).toBe(2048);
  });

  it('两者都未设置 → 请求体里没有 max_tokens 键', async () => {
    const body = await sendAndCaptureBody({}, { maxTokens: undefined });
    expect('max_tokens' in body).toBe(false);
  });

  it.each([
    ['0', 0],
    ['负数', -1],
    ['NaN', Number.NaN],
  ])('角色级 %s 按未设置处理 → 回落 Profile 级', async (_label, bad) => {
    const body = await sendAndCaptureBody({ maxTokens: 1024 }, { maxTokens: bad });
    expect(body.max_tokens).toBe(1024);
  });

  it.each([
    ['0', 0],
    ['负数', -8],
    ['NaN', Number.NaN],
  ])('角色级 %s + Profile 也未设置 → 不传（不出现 0/负数）', async (_label, bad) => {
    const body = await sendAndCaptureBody({}, { maxTokens: bad });
    expect('max_tokens' in body).toBe(false);
  });
});

// ── 3. 持久化：未设置不落盘，回读不为 4096 ──

describe('T-16 maxTokens —— 持久化（QA 独立）', () => {
  beforeEach(() => {
    initLocale('zh');
  });

  it('未设置时 ext 上不存在 maxTokens 键（持久化不写回 4096）', () => {
    const card = uiCharToCard(makeCharacter({ maxTokens: undefined }));
    expect(Object.prototype.hasOwnProperty.call(card.ext ?? {}, 'maxTokens')).toBe(false);
    expect(card.ext?.maxTokens).toBeUndefined();
  });

  it.each([
    ['0', 0],
    ['负数', -1],
    ['NaN', Number.NaN],
  ])('非法值 %s 不落盘', (_label, bad) => {
    const card = uiCharToCard(makeCharacter({ maxTokens: bad }));
    expect(Object.prototype.hasOwnProperty.call(card.ext ?? {}, 'maxTokens')).toBe(false);
  });

  it('已设置时落盘，且往返不失真', () => {
    const card = uiCharToCard(makeCharacter({ maxTokens: 2048 }));
    expect(card.ext?.maxTokens).toBe(2048);
    expect(cardToUiChar(card).maxTokens).toBe(2048);
  });

  it('旧数据（ext.maxTokens 缺失）回读为 undefined，不再兜底 4096', () => {
    expect(cardToUiChar(makeCard()).maxTokens).toBeUndefined();
  });

  it.each([
    ['0', 0],
    ['负数', -3],
    ['NaN', Number.NaN],
  ])('回读时非法值 %s 归一为 undefined（不泄漏到 UI）', (_label, bad) => {
    expect(cardToUiChar(makeCard({ ext: { maxTokens: bad } })).maxTokens).toBeUndefined();
  });

  it('用户显式设置的 4096 仍是用户数据，必须原样保留（不误删）', () => {
    const ui = cardToUiChar(makeCard({ ext: { maxTokens: 4096 } }));
    expect(ui.maxTokens).toBe(4096);
  });

  it('legacy 顶层 maxTokens（无 ext）仍可读回', () => {
    const card = makeCard() as CharacterCard & { maxTokens?: number };
    card.maxTokens = 1536;
    expect(cardToUiChar(card).maxTokens).toBe(1536);
  });
});

// ── 4. 新建 / 生成角色不再硬编码 4096 ──

describe('T-16 maxTokens —— 角色创建路径（QA 独立）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
  });

  it('新建角色不携带显式 maxTokens', () => {
    const store = useCharacterStore();
    const id = store.createCharacter();
    const created = store.characters.find((c) => c.id === id)!;
    expect(created.maxTokens).toBeUndefined();
  });

  it('AI 生成角色同样不硬编码 4096（否则生成出来的角色依旧会盖掉 Profile 级）', async () => {
    const settings = useSettingsStore();
    settings.addApiProfile(makeApiProfile({ id: 'gen-profile' }));
    expect(settings.activeProfile, '需要有一个激活的 API profile').not.toBeNull();
    const store = useCharacterStore();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            index: 0,
            message: {
              content: JSON.stringify({
                name: '艾拉',
                description: '一名吟游诗人',
                personality: '开朗',
                scenario: '酒馆',
                firstMessage: '你好呀',
                tags: ['奇幻'],
              }),
            },
          },
        ],
      }),
    }) as unknown as typeof globalThis.fetch;

    try {
      const id = await store.generateRandomCharacter('fantasy');
      expect(id).not.toBeNull();
      const generated = store.characters.find((c) => c.id === id)!;
      expect(generated.maxTokens).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── 5. 回归扫描：所有直接读取点不得把 undefined/NaN 泄漏成 0 或魔法数字 ──

describe('T-16 maxTokens —— 回归扫描（QA 独立）', () => {
  it('src 内不再有角色创建处硬编码 maxTokens（mock-data 的演示数据除外）', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const root = resolve(process.cwd(), 'src');
    for (const rel of [
      'src/stores/character.ts',
      'src/stores/chat.ts',
      'src/services/type-adapters.ts',
      'src/views/CharacterEditorView.vue',
      'src/components/layout/ContextPanel.vue',
    ]) {
      const code = readFileSync(resolve(root, '..', rel), 'utf8');
      // 角色级字段的硬编码赋值形态（API 调用参数里的 1500 等不是角色字段，不算）
      expect(code, `${rel} 仍有角色级 maxTokens 硬编码`).not.toMatch(
        /maxTokens:\s*(4096|8192)\s*,/
      );
    }
  });
});
