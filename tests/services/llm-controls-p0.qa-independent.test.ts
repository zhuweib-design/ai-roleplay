/**
 * P0-1 编排层 / 回传剥离 / UI 红线 —— QA 独立验证
 *
 * 维度：
 * 1. prompt-builder：默认剥离（逐字节相等）、显式回包（<think> 前缀）、**无副作用**
 * 2. chat-manager：Splitter 挂载（跨 chunk 撕裂）、onThinking、done 收敛、
 *    字段型/标签型互斥、中止时思考不丢失
 * 3. UI 红线：模型输出渲染路径无 v-html / innerHTML；v-memo 依赖含 thinking
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildPrompt } from '@core/prompt-builder';
import { ChatManager } from '@services/chat-manager';
import type { ApiClient } from '@api/api-client';
import type { ChatRequest, ChatStream, ChatStreamEvent } from '@api/types';
import type { CharacterCard, ChatMessage } from '@core/character-card';

// ── 夹具 ──

function makeCard(): CharacterCard {
  return {
    id: 'qa-card',
    name: 'QA',
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
  };
}

function msg(role: 'user' | 'assistant' | 'system', content: string, thinking?: string): ChatMessage {
  return {
    id: `qa-${role}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    ...(thinking === undefined ? {} : { thinking }),
    timestamp: '2026-01-01T00:00:00.000Z',
    swipes: [],
    swipeIndex: 0,
  } as unknown as ChatMessage;
}

const SETTINGS = {
  systemPrompt: 'sys',
  maxContextTokens: 8192,
  reservedTokens: 1024,
  userName: 'Tester',
};

describe('prompt-builder — QA 独立验证：回传剥离与无副作用', () => {
  it('默认（不传 includeThinkingInHistory）：assistant content 与 msg.content 逐字节相等', async () => {
    const history = [
      msg('user', '问题一'),
      msg('assistant', '回答一', '思考一'),
      msg('user', '问题二'),
      msg('assistant', '回答二', ''),
    ];
    const built = await buildPrompt(makeCard(), history, '问题三', { ...SETTINGS });
    const assistantMsgs = built.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(2);
    expect(assistantMsgs[0]!.content).toBe('回答一');
    expect(assistantMsgs[0]!.content).toBe(history[1]!.content);
    expect(assistantMsgs[1]!.content).toBe('回答二');
    expect(built.messages.some((m) => m.content.includes('<think>'))).toBe(false);
  });

  it('显式 false 与不传等价（不回包思考）', async () => {
    const history = [msg('assistant', '正文', '思考')];
    const built = await buildPrompt(makeCard(), history, 'u', {
      ...SETTINGS,
      includeThinkingInHistory: false,
    });
    expect(built.messages.find((m) => m.role === 'assistant')!.content).toBe('正文');
  });

  it('= true：以 <think> 开头，且严格是 `<think>思考</think>正文`', async () => {
    const history = [msg('assistant', '正文', '思考内容')];
    const built = await buildPrompt(makeCard(), history, 'u', {
      ...SETTINGS,
      includeThinkingInHistory: true,
    });
    const content = built.messages.find((m) => m.role === 'assistant')!.content;
    expect(content.startsWith('<think>')).toBe(true);
    expect(content).toBe('<think>思考内容</think>正文');
  });

  it('= true 但 thinking 为空串 / undefined / null → 不加空标签', async () => {
    for (const thinking of ['', undefined, null] as unknown as string[]) {
      const history = [msg('assistant', '正文', thinking)];
      const built = await buildPrompt(makeCard(), history, 'u', {
        ...SETTINGS,
        includeThinkingInHistory: true,
      });
      expect(built.messages.find((m) => m.role === 'assistant')!.content).toBe('正文');
    }
  });

  it('= true 时 assistant 被回包、user 消息**不带** thinking 时原样透传', async () => {
    const history = [msg('user', '用户说的话'), msg('assistant', '助手说的', '助手思考')];
    const built = await buildPrompt(makeCard(), history, 'u', {
      ...SETTINGS,
      includeThinkingInHistory: true,
    });
    expect(built.messages.find((m) => m.role === 'user' && m.content === '用户说的话')).toBeDefined();
    expect(built.messages.find((m) => m.role === 'assistant')!.content).toBe(
      '<think>助手思考</think>助手说的'
    );
  });

  // QA 发现 #1（低危 / 非阻塞）→ 已修复并翻转断言。
  // `PromptSettings.includeThinkingInHistory` 的 JSDoc 契约是「历史 **assistant** 消息的思维链
  // 是否随请求回传」。原实现（src/core/prompt-builder.ts 历史组装循环）没有判 role，
  // 会把任意 role（user / system）消息上非空 thinking 也回包成 `<think>` 前缀。
  // 现已在回包条件里补 `msg.role === 'assistant'`，与 JSDoc 契约一致。
  it('【已修复 #1】= true 时区分 role：带 thinking 的 user 消息**不**回包', async () => {
    const history = [msg('user', '用户说的话', '不该出现的思考')];
    const built = await buildPrompt(makeCard(), history, 'u', {
      ...SETTINGS,
      includeThinkingInHistory: true,
    });
    const userMsg = built.messages.find((m) => m.role === 'user' && m.content.includes('用户说的话'));
    expect(userMsg!.content).toBe('用户说的话');
    // 全量断言：任何消息都不应出现 <think>
    expect(built.messages.some((m) => m.content.includes('<think>'))).toBe(false);
  });

  it('【已修复 #1】同一历史里 assistant 仍正常回包、user 不受影响', async () => {
    const history = [msg('user', '用户说的话', '不该出现的思考'), msg('assistant', '助手说的', '助手思考')];
    const built = await buildPrompt(makeCard(), history, 'u', {
      ...SETTINGS,
      includeThinkingInHistory: true,
    });
    expect(built.messages.find((m) => m.role === 'user')!.content).toBe('用户说的话');
    expect(built.messages.find((m) => m.role === 'assistant')!.content).toBe(
      '<think>助手思考</think>助手说的'
    );
  });

  it('**无副作用**：调用后传入的 history 对象逐字段不变（含 thinking 仍在）', async () => {
    const history = [msg('user', 'q'), msg('assistant', 'a', '思考X')];
    const before = JSON.parse(JSON.stringify(history)) as ChatMessage[];
    Object.freeze(history);
    Object.freeze(history[1]);

    await buildPrompt(makeCard(), history, 'u', { ...SETTINGS, includeThinkingInHistory: true });
    await buildPrompt(makeCard(), history, 'u', { ...SETTINGS });

    expect(history).toEqual(before);
    expect(history[1]!.thinking).toBe('思考X');
    expect(history[1]!.content).toBe('a');
  });

  it('system 与 user 消息照常存在，顺序不被历史思考处理打乱', async () => {
    const history = [msg('assistant', 'a1', 't1'), msg('assistant', 'a2', 't2')];
    const built = await buildPrompt(makeCard(), history, '最后一条', { ...SETTINGS });
    expect(built.messages[0]!.role).toBe('system');
    expect(built.messages[built.messages.length - 1]!).toEqual({
      role: 'user',
      content: '最后一条',
    });
  });
});

// ── chat-manager 夹具 ──

function spyClient(events: ChatStreamEvent[]): { client: ApiClient; requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    requests,
    client: {
      provider: 'spy',
      async chat(): Promise<string> {
        return '';
      },
      async *chatStream(req: ChatRequest): ChatStream {
        requests.push(JSON.parse(JSON.stringify(req)) as ChatRequest);
        for (const ev of events) yield ev;
      },
    },
  };
}

function manager(client: ApiClient) {
  return new ChatManager({
    apiClient: client,
    model: 'qa-model',
    systemPrompt: 'sys',
    maxContextTokens: 8192,
    reservedTokens: 1024,
    userName: 'Tester',
  });
}

describe('chat-manager — QA 独立验证：Splitter 挂载与思考收敛', () => {
  it('标签型思维链跨 chunk 撕裂：onThinking 增量正确，最终正文不含标签', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '<thi' },
      { type: 'delta', delta: 'nk>我在' },
      { type: 'delta', delta: '思考</thi' },
      { type: 'delta', delta: 'nk>这是答案' },
      { type: 'done', fullContent: '<think>我在思考</think>这是答案', finishReason: 'stop' },
    ]);

    const thinkingDeltas: string[] = [];
    let finalThinking = '';
    let finalContent = '';
    const text = await manager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: '问' },
      {
        onThinking: (delta, full) => {
          thinkingDeltas.push(delta);
          finalThinking = full;
        },
        onDone: (content) => {
          finalContent = content;
        },
      }
    );

    expect(thinkingDeltas.join('')).toBe('我在思考');
    expect(finalThinking).toBe('我在思考');
    expect(finalContent).toBe('这是答案');
    expect(text).toBe('这是答案');
    expect(finalContent).not.toContain('<think>');
  });

  it('标签型：正文增量同样跨 chunk 正确拼接（不含思考片段）', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '<think>思' },
      { type: 'delta', delta: '考</think>正文A' },
      { type: 'delta', delta: '正文B' },
      { type: 'done', fullContent: '<think>思考</think>正文A正文B' },
    ]);
    let acc = '';
    const text = await manager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: '问' },
      { onDelta: (d) => (acc += d) }
    );
    expect(acc).toBe('正文A正文B');
    expect(text).toBe('正文A正文B');
  });

  it('字段型思考（thinkingDelta）：正文原样透传，不做二次解析', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '正文', thinkingDelta: '字段思考' },
      { type: 'done', fullContent: '正文', fullThinking: '字段思考' },
    ]);
    let finalThinking = '';
    const text = await manager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: '问' },
      { onThinking: (_d, full) => (finalThinking = full) }
    );
    expect(finalThinking).toBe('字段思考');
    expect(text).toBe('正文');
  });

  it('字段型与标签型互斥：有字段型思考时，正文里的字面 <think> 不被剥掉', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '字面<think>x', thinkingDelta: '字段思考' },
      { type: 'done', fullContent: '字面<think>x', fullThinking: '字段思考' },
    ]);
    const text = await manager(client).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: '问',
    });
    // 互斥原则：字段型存在 → 直接用 fullContent，不再跑标签解析
    expect(text).toBe('字面<think>x');
  });

  it('流结束时思考未闭合：残留思考不得丢失', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '<think>未闭合的思考' },
      { type: 'done', fullContent: '<think>未闭合的思考' },
    ]);
    let finalThinking = '';
    const text = await manager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: '问' },
      { onThinking: (_d, full) => (finalThinking = full) }
    );
    expect(finalThinking).toBe('未闭合的思考');
    expect(text).toBe('');
  });

  it('error（用户中止）时已收到的思考仍会被冲刷出来（不丢失）', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '<think>中止前' },
      { type: 'error', error: '已停止' },
    ]);
    let finalThinking = '';
    await manager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: '问' },
      { onThinking: (_d, full) => (finalThinking = full) }
    );
    expect(finalThinking).toBe('中止前');
  });

  it('无思考时 onThinking 完全不触发（避免空串污染 UI）', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '普通回答' },
      { type: 'done', fullContent: '普通回答' },
    ]);
    let calls = 0;
    const text = await manager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: '问' },
      { onThinking: () => calls++ }
    );
    expect(calls).toBe(0);
    expect(text).toBe('普通回答');
  });

  it('多组思考块：思考拼接、正文正确剥离', async () => {
    const { client } = spyClient([
      { type: 'delta', delta: '<think>A</think>m1<think>B</think>m2' },
      { type: 'done', fullContent: '<think>A</think>m1<think>B</think>m2' },
    ]);
    let finalThinking = '';
    const text = await manager(client).sendMessage(
      { card: makeCard(), history: [], userMessage: '问' },
      { onThinking: (_d, full) => (finalThinking = full) }
    );
    expect(finalThinking).toBe('AB');
    expect(text).toBe('m1m2');
  });
});

// ── UI 红线（静态守卫）──

const SRC_ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(vue|ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** 已审计白名单：仅静态图标注册表，不含任何模型输出 */
const V_HTML_WHITELIST = [/components[\\/]common[\\/]Icon\.vue$/, /components[\\/]common[\\/]icons\.ts$/];

/** 去掉注释行后再做静态匹配（设计说明里提到 v-html 字样不算违规） */
function stripComments(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l))
    .join('\n');
}

function readComponent(relPath: string): string {
  return stripComments(readFileSync(join(SRC_ROOT, relPath), 'utf-8'));
}

describe('UI 红线 — QA 独立验证：模型输出渲染路径不得有 v-html / innerHTML', () => {
  it('src/ 下除白名单外无任何 v-html / innerHTML', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (V_HTML_WHITELIST.some((re) => re.test(file))) continue;
      const code = stripComments(readFileSync(file, 'utf-8'));
      if (/\bv-html\b/.test(code) || /\binnerHTML\b/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('ThinkingBlock.vue：折叠态用 v-if 懒渲染思考正文', () => {
    const src = readComponent('components/chat/ThinkingBlock.vue');
    expect(src).toMatch(/v-if="hasThinking"/);
    // 思考正文节点挂在 expanded 条件下（折叠态不进 DOM）
    expect(src).toMatch(/v-if="expanded"/);
    expect(src).not.toMatch(/\bv-html\b/);
    expect(src).not.toMatch(/\binnerHTML\b/);
  });

  it('ThinkingBlock.vue：默认折叠，且带 aria-expanded / aria-controls', () => {
    const src = readComponent('components/chat/ThinkingBlock.vue');
    expect(src).toMatch(/:aria-expanded="expanded"/);
    expect(src).toMatch(/:aria-controls=/);
    // 默认折叠：props 默认值 defaultCollapsed = true
    expect(src).toMatch(/defaultCollapsed: true/);
    // expanded 初值由 initialExpanded() 决定，默认分支取反 defaultCollapsed
    expect(src).toMatch(/const expanded = ref<boolean>\(initialExpanded\(\)\)/);
    expect(src).toMatch(/return !props\.defaultCollapsed;/);
  });

  it('ChatMain.vue：v-memo 依赖项包含 msg.thinking（历史消息不参与 patch）', () => {
    const src = readComponent('components/chat/ChatMain.vue');
    const memo = src.match(/v-memo="(\[[^\]]*\])"/);
    expect(memo).not.toBeNull();
    const deps = memo![1]!;
    expect(deps).toContain('msg.thinking');
    expect(deps).toContain('msg.content');
  });
});
