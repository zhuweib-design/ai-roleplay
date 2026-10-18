import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useSettingsStore } from '../../src/stores/settings';
import { useChatStore } from '../../src/stores/chat';
import { initLocale } from '@/i18n';
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_RESERVED_TOKENS,
} from '@/types';
import type { AppSettings, ApiProfile, UICharacter, UIMessage } from '@/types';

/**
 * 上下文长度可配置化 —— settings store + chat 接线
 *
 * 覆盖：
 * - 默认值（8192 / 1024，保持既有行为）
 * - 持久化往返（改值 → 存 → 读回一致）
 * - 旧数据兼容（字段缺失 → 回落默认）
 * - 校验（max ≤ reserved 时拒绝且不落盘）
 * - 接线（chat-manager 实际收到 settings 里的值，而非硬编码 8192）
 * - 优先级（显式 options > 全局 settings）
 */

// ── 夹具 ──

/** Mock 存储适配器，精确控制 loadSettings/saveSettings 行为 */
class MockStorageAdapter {
  public saved: AppSettings | null = null;
  public loadData: Partial<AppSettings> | null = null;
  public saveCallCount = 0;

  async loadSettings(): Promise<Partial<AppSettings>> {
    return this.loadData ?? {};
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.saveCallCount++;
    this.saved = { ...settings };
  }
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
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  };
}

function makeMessage(overrides: Partial<UIMessage> & { id: string }): UIMessage {
  return {
    role: 'assistant',
    content: '',
    timestamp: 1,
    ...overrides,
  };
}

/** 构造 N 条历史消息（每条约 20 token，合计足以触发裁剪） */
function makeLongHistory(n: number): UIMessage[] {
  return Array.from({ length: n }, (_, i) =>
    makeMessage({
      id: `h${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'history-message '.repeat(20),
      timestamp: i + 1,
    })
  );
}

/** 构造最小 OpenAI 兼容 SSE 流（单 chunk 正文） */
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

// ── 1. settings store：默认值 / 校验 / 预算 ──

describe('上下文长度 —— settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
  });

  it('默认值：maxContextTokens=8192、reservedTokens=1024、预算=7168（保持既有行为）', () => {
    const store = useSettingsStore();
    expect(store.maxContextTokens).toBe(DEFAULT_MAX_CONTEXT_TOKENS);
    expect(store.maxContextTokens).toBe(8192);
    expect(store.reservedTokens).toBe(DEFAULT_RESERVED_TOKENS);
    expect(store.reservedTokens).toBe(1024);
    expect(store.availableContextTokens).toBe(7168);
  });

  it('setMaxContextTokens 合法值应更新并返回 true', () => {
    const store = useSettingsStore();
    expect(store.setMaxContextTokens(32768)).toBe(true);
    expect(store.maxContextTokens).toBe(32768);
    expect(store.availableContextTokens).toBe(32768 - 1024);
  });

  it('setReservedTokens 合法值应更新并返回 true', () => {
    const store = useSettingsStore();
    expect(store.setReservedTokens(2048)).toBe(true);
    expect(store.reservedTokens).toBe(2048);
    expect(store.availableContextTokens).toBe(8192 - 2048);
  });

  it('校验：max ≤ reserved 时 setMaxContextTokens 拒绝（返回 false 且不修改）', () => {
    const store = useSettingsStore();
    store.setReservedTokens(4096); // reserved=4096, max 仍 8192
    expect(store.setMaxContextTokens(4096)).toBe(false); // 相等 → 拒绝
    expect(store.setMaxContextTokens(2048)).toBe(false); // 更小 → 拒绝
    expect(store.maxContextTokens).toBe(8192); // 未被修改
    expect(store.reservedTokens).toBe(4096);
  });

  it('校验：reserved ≥ max 时 setReservedTokens 拒绝（返回 false 且不修改）', () => {
    const store = useSettingsStore();
    expect(store.setReservedTokens(8192)).toBe(false); // 相等 → 拒绝
    expect(store.setReservedTokens(99999)).toBe(false); // 更大 → 拒绝
    expect(store.setReservedTokens(-1)).toBe(false); // 负数 → 拒绝
    expect(store.reservedTokens).toBe(1024); // 未被修改
  });

  it('校验：非有限数（NaN / Infinity）一律拒绝', () => {
    const store = useSettingsStore();
    expect(store.setMaxContextTokens(Number.NaN)).toBe(false);
    expect(store.setMaxContextTokens(Number.POSITIVE_INFINITY)).toBe(false);
    expect(store.setReservedTokens(Number.NaN)).toBe(false);
    expect(store.maxContextTokens).toBe(8192);
    expect(store.reservedTokens).toBe(1024);
  });

  it('校验失败时不落盘（不触发 saveSettings）', async () => {
    const mock = new MockStorageAdapter();
    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    const before = mock.saveCallCount;
    expect(store.setMaxContextTokens(100)).toBe(false); // 100 < 1024 → 拒绝
    await new Promise((r) => setTimeout(r, 10));
    expect(mock.saveCallCount).toBe(before);
  });

  it('合法修改会落盘并携带新值', async () => {
    const mock = new MockStorageAdapter();
    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    store.setMaxContextTokens(65536);
    store.setReservedTokens(4096);
    await new Promise((r) => setTimeout(r, 20));
    expect(mock.saved?.maxContextTokens).toBe(65536);
    expect(mock.saved?.reservedTokens).toBe(4096);
  });
});

// ── 2. settings store：持久化往返 + 旧数据兼容 ──

describe('上下文长度 —— 持久化与兼容', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
  });

  it('持久化往返：改值 → 存 → 新 store 读回一致', async () => {
    const mock = new MockStorageAdapter();
    mock.loadData = { theme: 'dark' }; // 让 hasSavedData 为真，进入加载分支

    const store1 = useSettingsStore();
    store1.setStorageAdapter(mock);
    store1.setMaxContextTokens(131072);
    store1.setReservedTokens(8192);
    await new Promise((r) => setTimeout(r, 20));

    // 让适配器"读回"刚保存的数据（模拟真实持久化）
    mock.loadData = mock.saved;

    // 新 store 模拟重启后读回
    setActivePinia(createPinia());
    const store2 = useSettingsStore();
    store2.setStorageAdapter(mock);
    await store2.loadFromStorage();

    expect(store2.maxContextTokens).toBe(131072);
    expect(store2.reservedTokens).toBe(8192);
  });

  it('旧数据兼容：字段缺失时回落默认 8192 / 1024（不破坏既有用户）', async () => {
    const mock = new MockStorageAdapter();
    mock.loadData = { theme: 'dark', fontSize: 14 }; // 无上下文长度字段

    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    await store.loadFromStorage();

    expect(store.maxContextTokens).toBe(8192);
    expect(store.reservedTokens).toBe(1024);
  });

  it('旧数据兼容：已存字段时按存值加载', async () => {
    const mock = new MockStorageAdapter();
    mock.loadData = { theme: 'dark', maxContextTokens: 262144, reservedTokens: 16384 };

    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    await store.loadFromStorage();

    expect(store.maxContextTokens).toBe(262144);
    expect(store.reservedTokens).toBe(16384);
  });

  it('脏数据防御：max ≤ reserved 时整组回落默认（避免预算为 0）', async () => {
    const mock = new MockStorageAdapter();
    mock.loadData = { theme: 'dark', maxContextTokens: 500, reservedTokens: 1000 };

    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    await store.loadFromStorage();

    expect(store.maxContextTokens).toBe(8192);
    expect(store.reservedTokens).toBe(1024);
  });
});

// ── 3. chat 接线：settings → chat-manager（prompt-builder 预算） ──

describe('上下文长度 —— chat 接线（端到端）', () => {
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

  /** 发送一条消息并抓取请求体 */
  async function sendAndCapture(
    char: UICharacter,
    options?: { maxContextTokens?: number; reservedTokens?: number }
  ): Promise<Record<string, unknown>> {
    const chatStore = useChatStore();
    chatStore.setApiProfile(makeApiProfile(), options);
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeSSEResponse());
    await chatStore.sendMessage(char, 'hi');
    const body = (spy.mock.calls[0]![1] as RequestInit).body as string;
    return JSON.parse(body) as Record<string, unknown>;
  }

  it('默认预算下长历史不被裁剪（1 system + 30 历史 + 1 user = 32 条）', async () => {
    const body = await sendAndCapture(makeCharacter({ id: 'wire-default', messages: makeLongHistory(30) }));
    expect((body.messages as unknown[]).length).toBe(32);
  });

  it('接线生效：调小 maxContextTokens 后同一段历史被裁剪（不再硬编码 8192）', async () => {
    const settings = useSettingsStore();
    // 先抬高 max 使 max > reserved 合法，再抬高 reserved 收窄预算至 25 → 必然裁到仅剩 system + user
    expect(settings.setMaxContextTokens(1100)).toBe(true);
    expect(settings.setReservedTokens(1075)).toBe(true);
    expect(settings.availableContextTokens).toBe(25);

    const body = await sendAndCapture(makeCharacter({ id: 'wire-small', messages: makeLongHistory(30) }));
    // 预算极小时裁剪至仅剩 system + user（对比默认预算的 32 条）
    expect((body.messages as unknown[]).length).toBe(2);
  });

  it('接线生效：调大 maxContextTokens 后超长历史仍可全部保留（默认预算会被裁剪）', async () => {
    const settings = useSettingsStore();
    expect(settings.setMaxContextTokens(262144)).toBe(true);

    // 400 条历史（约 9600 token）超过默认 8192 预算，但远小于 262144 预算 → 全部保留
    const body = await sendAndCapture(makeCharacter({ id: 'wire-large', messages: makeLongHistory(400) }));
    expect((body.messages as unknown[]).length).toBe(402);
  });

  it('优先级：显式 options 覆盖全局 settings（options > settings）', async () => {
    const settings = useSettingsStore();
    // 全局设置预算极小（若生效必裁剪）
    expect(settings.setMaxContextTokens(1100)).toBe(true);
    expect(settings.availableContextTokens).toBe(76);

    // 显式 options 传入大预算 → 应覆盖全局设置，历史不被裁剪
    const body = await sendAndCapture(
      makeCharacter({ id: 'wire-options', messages: makeLongHistory(30) }),
      { maxContextTokens: 8192, reservedTokens: 1024 }
    );
    expect((body.messages as unknown[]).length).toBe(32);
  });
});

// ── 4. 回归守卫：ContextPanel 用量条不得再硬编码 8192 ──

describe('上下文长度 —— ContextPanel 用量条回归守卫', () => {
  it('TOTAL_BUDGET 响应式跟随 settings.maxContextTokens（不得硬编码 8192）', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const code = readFileSync(
      resolve(process.cwd(), 'src/components/layout/ContextPanel.vue'),
      'utf8'
    );
    // 哨兵 1：不得再出现 `const TOTAL_BUDGET = 8192` 这类硬编码
    expect(code, 'ContextPanel 仍硬编码 TOTAL_BUDGET=8192').not.toMatch(
      /const\s+TOTAL_BUDGET\s*=\s*8192/
    );
    // 哨兵 2：必须读全局设置的 maxContextTokens
    expect(code).toMatch(/settingsStore\.maxContextTokens/);
    // 哨兵 3：必须是 computed（响应式），否则配置改动不会即时反映
    expect(code).toMatch(/const\s+TOTAL_BUDGET\s*=\s*computed/);
  });
});
