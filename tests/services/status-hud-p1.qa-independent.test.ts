/**
 * P1 角色状态栏 —— 编排层 / 渲染层 / 红线 QA 独立验证
 *
 * 与工程师的 tests/core/status-parser.test.ts、stores 用例不重叠，本文件覆盖：
 * 1. 未注入时请求体逐字节不变（决策：不能因新功能改变既有请求）
 * 2. StatusSplitter 正确串联在 ThinkingSplitter 之后
 * 3. done / error / 流自然结束 / 工具轮超限 四条退出路径都收敛
 * 4. <status> 写在 <think> 内 → 不提取（决策 6）
 * 5. StatusHud.vue 纯文本插值、零 v-html（XSS 红线）
 * 6. 静态红线：icons.ts 零新增、src 零 innerHTML、只挂会话级 sticky
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ChatManager } from '../../src/services/chat-manager';
import StatusHud from '@/components/chat/StatusHud.vue';
import { STATUS_ICON_NAMES } from '@core/status-schema';
import { parseStatusBlock } from '@core/status-parser';
import { getIconPath } from '@/components/common/icons';
import type { ApiClient } from '../../src/api/api-client';
import type { ChatRequest, ChatStream, ChatStreamEvent, ApiMessage, ToolCall } from '../../src/api/types';
import type { CharacterCard } from '@core/character-card';
import type { CharacterStatus } from '@core/status-schema';
import { initLocale } from '@/i18n';

const ROOT = resolve(__dirname, '../..');

/** 记录最后一次请求的 fake ApiClient（按轮次提供事件） */
function makeRecordingClient(
  roundEvents: (round: number) => ChatStreamEvent[]
): { client: ApiClient; requests: () => ChatRequest[] } {
  const requests: ChatRequest[] = [];
  let round = 0;
  const client: ApiClient = {
    provider: 'qa-fake',
    async chat(): Promise<string> {
      return '';
    },
    async *chatStream(req: ChatRequest): ChatStream {
      requests.push(req);
      const events = roundEvents(round);
      round++;
      for (const ev of events) yield ev;
    },
  };
  return { client, requests: () => requests };
}

function makeCard(ext?: Record<string, unknown>): CharacterCard {
  return {
    id: 'card-qa',
    name: 'Seraphina',
    description: '森林精灵法师',
    personality: '温柔治愈',
    scenario: '翡翠森林',
    firstMessage: '你好',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(ext ? { ext: ext as CharacterCard['ext'] } : {}),
  } as CharacterCard;
}

const STATUS_SCHEMA = {
  version: 1 as const,
  fields: [{ key: 'location', type: 'string' as const }],
};

/** 去掉 signal 后序列化，便于逐字节比较 */
function serialize(req: ChatRequest): string {
  const { signal: _signal, ...rest } = req;
  return JSON.stringify(rest);
}

/**
 * 剥掉注释后的源码（用于静态红线扫描）
 *
 * 说明：项目源码里有"禁止 v-html / innerHTML"的说明性注释，
 * 不剥注释会把守规则的说明文字误判成违规使用。
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
    .join('\n');
}

beforeEach(() => {
  initLocale('zh');
});

// ── 1. 请求体不变性 ──

describe('1. 未注入时请求体逐字节不变', () => {
  it('1-1 全局关闭 + 角色卡带 schema → 请求体与"无 P1 配置"完全一致', async () => {
    const evs: ChatStreamEvent[] = [{ type: 'done', fullContent: 'ok' }];

    const a = makeRecordingClient(() => evs);
    await new ChatManager({ apiClient: a.client, model: 'gpt-4o' }).sendMessage({
      card: makeCard(),
      history: [],
      userMessage: '你好',
    });

    const b = makeRecordingClient(() => evs);
    await new ChatManager({
      apiClient: b.client,
      model: 'gpt-4o',
      statusInstructionEnabled: false,
    }).sendMessage({
      card: makeCard({ statusSchema: STATUS_SCHEMA }),
      history: [],
      userMessage: '你好',
    });

    expect(a.requests().length).toBe(1);
    expect(b.requests().length).toBe(1);
    expect(serialize(b.requests()[0]!)).toBe(serialize(a.requests()[0]!));
  });

  it('1-2 角色级 statusInstruction="off" → 即使全局开启也不注入', async () => {
    const evs: ChatStreamEvent[] = [{ type: 'done', fullContent: 'ok' }];
    const off = makeRecordingClient(() => evs);
    await new ChatManager({
      apiClient: off.client,
      model: 'gpt-4o',
      statusInstructionEnabled: true,
    }).sendMessage({
      card: makeCard({ statusSchema: STATUS_SCHEMA, statusInstruction: 'off' }),
      history: [],
      userMessage: '你好',
    });
    const sys = off.requests()[0]!.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(sys).not.toContain('[Character Status]');
  });

  it('1-3 角色级 statusInstruction="on"（全局关闭）→ 注入且为纯英文 key', async () => {
    const evs: ChatStreamEvent[] = [{ type: 'done', fullContent: 'ok' }];
    const on = makeRecordingClient(() => evs);
    await new ChatManager({ apiClient: on.client, model: 'gpt-4o' }).sendMessage({
      card: makeCard({ statusSchema: STATUS_SCHEMA, statusInstruction: 'on' }),
      history: [],
      userMessage: '你好',
    });
    const sys = on.requests()[0]!.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(sys).toContain('[Character Status]');
    expect(sys).toContain('"location"');
    // 注入文本里不得出现中文 key（模型照抄中文会 silence-fail）
    expect(/[一-鿿]/.test(sys.slice(sys.indexOf('[Character Status]')))).toBe(false);
  });

  it('1-4 缺省（无 ext / 无全局开关）→ 不注入（决策 1：enabled 默认 false）', async () => {
    const evs: ChatStreamEvent[] = [{ type: 'done', fullContent: 'ok' }];
    const d = makeRecordingClient(() => evs);
    await new ChatManager({ apiClient: d.client, model: 'gpt-4o' }).sendMessage({
      card: makeCard({ statusSchema: STATUS_SCHEMA }),
      history: [],
      userMessage: '你好',
    });
    const sys = d.requests()[0]!.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(sys).not.toContain('[Character Status]');
  });
});

// ── 2. 四条退出路径 ──

const REPLY_DELTAS: ChatStreamEvent[] = [
  { type: 'delta', delta: '她笑了笑。' },
  { type: 'delta', delta: '<status>{"loc' },
  { type: 'delta', delta: 'ation":"酒馆","time":"18:30"}</st' },
  { type: 'delta', delta: 'atus>' },
];

describe('2. 编排层四条退出路径都做状态收敛', () => {
  it('2-1 done 路径：正文剥离状态块 + onStatus 收到结构化状态', async () => {
    const { client } = makeRecordingClient(() => [
      ...REPLY_DELTAS,
      { type: 'done', fullContent: '她笑了笑。', finishReason: 'stop' },
    ]);
    const statuses: (CharacterStatus | null)[] = [];
    const deltas: string[] = [];
    const out = await new ChatManager({ apiClient: client, model: 'gpt-4o' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      {
        onStatus: (s) => statuses.push(s),
        onDelta: (d) => deltas.push(d),
      }
    );
    expect(out).toBe('她笑了笑。');
    expect(out).not.toContain('<status>');
    expect(deltas.join('')).not.toContain('<status');
    const last = statuses[statuses.length - 1];
    expect(last?.entries.find((e) => e.key === 'location')?.value).toBe('酒馆');
    expect(last?.entries.find((e) => e.key === 'time')?.value).toBe('18:30');
  });

  it('2-2 error 路径：仍收敛且不丢已收正文', async () => {
    const { client } = makeRecordingClient(() => [
      ...REPLY_DELTAS,
      { type: 'error', error: 'boom' },
    ]);
    const statuses: (CharacterStatus | null)[] = [];
    const out = await new ChatManager({ apiClient: client, model: 'gpt-4o' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onStatus: (s) => statuses.push(s) }
    );
    expect(out).toBe('她笑了笑。');
    expect(out).not.toContain('<status');
    expect(statuses[statuses.length - 1]?.entries.length).toBe(2);
  });

  it('2-3 流自然结束（无 done 事件）路径', async () => {
    const { client } = makeRecordingClient(() => REPLY_DELTAS);
    const statuses: (CharacterStatus | null)[] = [];
    const out = await new ChatManager({ apiClient: client, model: 'gpt-4o' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onStatus: (s) => statuses.push(s) }
    );
    expect(out).toBe('她笑了笑。');
    expect(statuses[statuses.length - 1]?.entries.find((e) => e.key === 'location')?.value).toBe('酒馆');
  });

  it('2-4 工具轮超限路径（>8 轮）也做状态收敛', async () => {
    const toolCall: ToolCall = {
      id: 'tc-1',
      type: 'function',
      function: { name: 'noop', arguments: '{}' },
    };
    const { client, requests } = makeRecordingClient(() => [
      ...REPLY_DELTAS,
      { type: 'done', fullContent: '她笑了笑。', toolCalls: [toolCall] },
    ]);
    const statuses: (CharacterStatus | null)[] = [];
    const out = await new ChatManager({
      apiClient: client,
      model: 'gpt-4o',
      executeTool: vi.fn(async () => 'tool result'),
    }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onStatus: (s) => statuses.push(s) }
    );
    expect(requests().length).toBe(9); // 8 轮工具 + 第 9 轮超限退出
    expect(out).not.toContain('<status');
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[statuses.length - 1]?.entries.length).toBe(2);
  });

  it('2-5 未闭合残留归正文：正文不丢且不产生状态', async () => {
    const { client } = makeRecordingClient(() => [
      { type: 'delta', delta: '她说：<status>location: 酒馆' },
      { type: 'done', fullContent: '她说：<status>location: 酒馆' },
    ]);
    const statuses: (CharacterStatus | null)[] = [];
    const out = await new ChatManager({ apiClient: client, model: 'gpt-4o' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onStatus: (s) => statuses.push(s) }
    );
    // 残留内容可见（标签已剥离），状态为 null
    expect(out).toContain('location: 酒馆');
    expect(out).not.toContain('<status>');
    expect(statuses[statuses.length - 1]).toBeNull();
  });
});

// ── 3. 与思维链串联 ──

describe('3. StatusSplitter 串联在 ThinkingSplitter 之后', () => {
  it('3-1 <status> 写在 <think> 内 → 不提取（决策 6）', async () => {
    const { client } = makeRecordingClient(() => [
      {
        type: 'delta',
        delta: '<think>让我想想<status>{"location":"酒馆"}</status>好</think>她笑了笑。',
      },
      { type: 'done', fullContent: '<think>让我想想<status>{"location":"酒馆"}</status>好</think>她笑了笑。' },
    ]);
    const statuses: (CharacterStatus | null)[] = [];
    const thinkings: string[] = [];
    const out = await new ChatManager({ apiClient: client, model: 'gpt-4o' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onStatus: (s) => statuses.push(s), onThinking: (d) => thinkings.push(d) }
    );
    expect(out).toBe('她笑了笑。');
    expect(thinkings.join('')).toContain('<status>'); // 状态块被思维链整块带走
    expect(statuses[statuses.length - 1]).toBeNull();
  });

  it('3-2 <think> 与 <status> 并存 → 思考与状态各归其位', async () => {
    const { client } = makeRecordingClient(() => [
      { type: 'delta', delta: '<think>思考</think>正文<status>location: 酒馆</status>' },
      { type: 'done', fullContent: '<think>思考</think>正文<status>location: 酒馆</status>' },
    ]);
    const statuses: (CharacterStatus | null)[] = [];
    const thinkings: string[] = [];
    const out = await new ChatManager({ apiClient: client, model: 'gpt-4o' }).sendMessage(
      { card: makeCard(), history: [], userMessage: 'hi' },
      { onStatus: (s) => statuses.push(s), onThinking: (d) => thinkings.push(d) }
    );
    expect(out).toBe('正文');
    expect(thinkings.join('')).toContain('思考');
    expect(statuses[statuses.length - 1]?.entries[0]?.value).toBe('酒馆');
  });
});

// ── 4. StatusHud 渲染红线 ──

describe('4. StatusHud.vue 渲染红线', () => {
  const status: CharacterStatus = {
    messageId: 'm1',
    parseMode: 'json',
    unknownCount: 0,
    entries: [
      { key: 'location', label: '地点', value: '酒馆', icon: 'map-pin' },
      { key: 'time', label: '时间', value: '18:30', icon: 'clock' },
    ],
  };

  it('4-1 有字段时渲染标签与值', () => {
    const w = mount(StatusHud, { props: { status, variant: 'sticky' } });
    expect(w.text()).toContain('地点');
    expect(w.text()).toContain('酒馆');
    expect(w.text()).toContain('18:30');
  });

  it('4-2 空状态 / 无 entries → 完全不渲染（无空壳）', () => {
    const empty = mount(StatusHud, { props: { status: null } });
    expect(empty.find('section').exists()).toBe(false);
    expect(empty.find('.status-hud').exists()).toBe(false);
    const noEntries = mount(StatusHud, { props: { status: { ...status, entries: [] } } });
    expect(noEntries.find('section').exists()).toBe(false);
  });

  it('4-3 XSS：恶意值只做文本插值，不产生真实 DOM 节点', () => {
    const evil: CharacterStatus = {
      messageId: 'm1',
      parseMode: 'lines',
      unknownCount: 0,
      entries: [
        { key: 'thought', label: '<img src=x>', value: '<img src=x onerror="alert(1)">' },
      ],
    };
    const w = mount(StatusHud, { props: { status: evil, variant: 'sticky' } });
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toContain('<img src=x onerror="alert(1)">');
  });

  it('4-4 未命中图标的字段不渲染图标节点（不是渲染空白）', () => {
    const noIcon: CharacterStatus = {
      messageId: 'm1',
      parseMode: 'lines',
      unknownCount: 1,
      entries: [{ key: 'mood', label: '心情', value: '愉悦' }],
    };
    const w = mount(StatusHud, { props: { status: noIcon } });
    expect(w.text()).toContain('愉悦');
    expect(w.find('svg').exists()).toBe(false);
  });

  it('4-4b mood 命中内置表时 HUD 不渲染任何图标节点（不是空 svg / 占位）', () => {
    // 走真实解析链路：模型输出 mood → 内置命中 → icon 应为 undefined
    const parsed = parseStatusBlock('mood: 愉悦');
    expect(parsed?.entries[0]?.key).toBe('mood');
    expect(parsed?.entries[0]?.icon).toBeUndefined();

    const w = mount(StatusHud, { props: { status: parsed, variant: 'sticky' } });
    expect(w.findAll('svg').length).toBe(0);
    expect(w.findAll('.status-entry').length).toBe(1);
    expect(w.text()).toContain('愉悦');
    // 不能出现空壳图标元素
    expect(w.html()).not.toContain('<svg');
  });

  it('4-4c 有图标字段仍正常渲染 svg（证明 v-if 双向生效）', () => {
    const parsed = parseStatusBlock('location: 酒馆\nmood: 愉悦');
    const w = mount(StatusHud, { props: { status: parsed, variant: 'sticky' } });
    expect(w.findAll('.status-entry').length).toBe(2);
    expect(w.findAll('svg').length).toBe(1); // 只有 location 有图标
  });

  it('4-5 模板零 v-html / innerHTML（剥注释后扫描）', () => {
    const code = stripComments(
      readFileSync(resolve(ROOT, 'src/components/chat/StatusHud.vue'), 'utf8')
    );
    expect(code).not.toContain('v-html');
    expect(code).not.toContain('innerHTML');
    // 值一律文本插值
    expect(code).toContain('{{ entry.value }}');
  });
});

// ── 5. 静态红线 ──

describe('5. 静态红线', () => {
  it('5-1 icons.ts 图标数量保持 63（本轮零新增）', () => {
    const src = readFileSync(resolve(ROOT, 'src/components/common/icons.ts'), 'utf8');
    const union = src.match(/export type IconName =([\s\S]*?);\n/)?.[1] ?? '';
    const names = [...union.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
    expect(names.length).toBe(63);
    expect(names).not.toContain('smile');
    expect(names).not.toContain('emotion');
  });

  it('5-2 状态图标白名单全部能在 icons.ts 取到真实路径', () => {
    for (const n of STATUS_ICON_NAMES) {
      expect(getIconPath(n), `图标 ${n} 缺路径`).not.toBe('');
    }
  });

  it('5-3 src/ 除白名单外零 innerHTML / v-html 实际使用', () => {
    const targets = [
      'src/components/chat/StatusHud.vue',
      'src/components/chat/ChatMain.vue',
      // R1-5：ChatMain 拆出的三个子组件同样要在"零 v-html"白名单里
      'src/components/chat/ChatHeader.vue',
      'src/components/chat/ChatMessageArea.vue',
      'src/components/chat/ChatComposer.vue',
      'src/core/status-parser.ts',
      'src/core/status-schema.ts',
      'src/core/status-prompt.ts',
      'src/services/chat-manager.ts',
      'src/services/type-adapters.ts',
      'src/views/GroupChatView.vue',
      'src/components/layout/ContextPanel.vue',
      // R2-3：ContextPanel 拆出的八个 section 组件同样要在"零 v-html"白名单里
      'src/components/layout/context/ContextCharacterCard.vue',
      'src/components/layout/context/ContextTokenBudget.vue',
      'src/components/layout/context/ContextWorldBooks.vue',
      'src/components/layout/context/ContextAuthorNote.vue',
      'src/components/layout/context/ContextRuntimeSection.vue',
      'src/components/layout/context/ContextGenParams.vue',
      'src/components/layout/context/ContextSamplingSection.vue',
      'src/components/layout/context/ContextStatusSection.vue',
      'src/stores/chat.ts',
      'src/stores/settings.ts',
    ];
    for (const rel of targets) {
      const code = stripComments(readFileSync(resolve(ROOT, rel), 'utf8'));
      expect(code, `${rel} 出现 v-html`).not.toContain('v-html');
      expect(code, `${rel} 出现 innerHTML`).not.toContain('innerHTML');
    }
  });

  it('5-4 会话级 sticky + 消息级 inline 双挂载（决策 2 已放宽：消息级补渲染）', () => {
    // R1-5：消息区（含 StatusHud 的 sticky 挂载点）搬进 ChatMessageArea，判据跟着走。
    const main = readFileSync(resolve(ROOT, 'src/components/chat/ChatMessageArea.vue'), 'utf8');
    expect(main).toContain('variant="sticky"');
    // ChatMessageArea 只挂会话级一条（sticky 仍是"截至当前"的唯一顶部条）
    expect(main).not.toContain('variant="inline"');
    expect([...main.matchAll(/<StatusHud\b/g)].length).toBe(1);
    // 消息级渲染：MessageBubble 挂 **inline** variant（且只在 msg.status 存在时渲染）
    const bubble = readFileSync(resolve(ROOT, 'src/components/chat/MessageBubble.vue'), 'utf8');
    const bubbleMounts = [...bubble.matchAll(/<StatusHud\b[^>]*>/g)].map((m) => m[0]);
    expect(bubbleMounts.length).toBe(1);
    expect(bubbleMounts[0]).toContain('variant="inline"');
    expect(bubbleMounts[0]).toContain('msg.status');
    expect(bubble).toContain('showInline'); // 受 settings.statusHudConfig.showInline 控制
    // QA 补强（防止断言被弱化为"只看 props 存在"）：
    // ① 必须挂在 v-if 之后（否则 showInline=false 也拦不住）
    expect(bubbleMounts[0], '消息级 StatusHud 必须由 v-if 守卫').toContain('v-if');
    // ② showInline 必须真的来自 settings 的 statusHudConfig（而不是一个永远为真的常量）
    expect(bubble).toMatch(/statusHudConfig[\s\S]{0,80}showInline/);
    // ③ 小屏折叠必须显式开启（默认 false，不能影响群聊成员条等一次性展示处）
    expect(bubbleMounts[0]).toContain('collapsible-on-mobile');
    // 注：以上为静态守卫；运行期行为（有无 status / showInline=false 时是否真的不渲染）
    // 由 tests/views/thinking-tokens-inline-status.qa-independent.test.ts 的 DOM 级用例覆盖
    // 上下文面板（角色级配置）不挂状态条
    // R2-3：面板拆成宿主 + 八个 section 组件，判据扩到整目录（逐个列文件容易漏新组件）
    const ctxDir = resolve(ROOT, 'src/components/layout/context');
    const ctxFiles = [
      resolve(ROOT, 'src/components/layout/ContextPanel.vue'),
      ...readdirSync(ctxDir)
        .filter((f) => f.endsWith('.vue'))
        .map((f) => resolve(ctxDir, f)),
    ];
    expect(ctxFiles.length, '上下文面板拆分后应至少 8 个文件').toBeGreaterThanOrEqual(8);
    for (const file of ctxFiles) {
      const ctx = readFileSync(file, 'utf8');
      expect([...ctx.matchAll(/<StatusHud\b/g)].length, `${file} 不应挂载 StatusHud`).toBe(0);
    }
    // 群聊的成员状态条同样是"会话级派生"（绑定 resolveLatestStatus 的 memberStatuses），
    // 不是消息级渲染 —— 允许挂载，但必须绑会话派生数据。
    // 2026-10-18（批次 1-2）：这一块随群头一起搬进 GroupInfoPanel（桌面内联与手机抽屉
    // 共用同一份模板），所以**挂载点**的断言跟着搬到新文件；"派生数据来自 GroupChatView
    // 的 memberStatuses"这条仍守在原处，且反过来钉住旧位置不许再自己挂一份。
    const groupPanel = readFileSync(resolve(ROOT, 'src/components/group/GroupInfoPanel.vue'), 'utf8');
    const groupMounts = [...groupPanel.matchAll(/<StatusHud\b[^>]*>/g)].map((m) => m[0]);
    expect(groupMounts.length, 'GroupInfoPanel 应恰好挂一处成员状态条').toBe(1);
    expect(groupMounts[0]).toContain('ms.status'); // 绑的是会话派生结果，不是 msg.status
    expect(groupMounts[0]).not.toContain('msg.status');
    expect(groupPanel).toContain('v-for="ms in statuses"');
    const group = readFileSync(resolve(ROOT, 'src/views/GroupChatView.vue'), 'utf8');
    expect(group, '群聊视图自己不应再挂 StatusHud（已移入 GroupInfoPanel）').not.toContain('<StatusHud');
    expect(group).toContain('resolveLatestStatus');
    expect(group).toContain('memberStatuses');
  });

  it('5-5 群聊不塞假 <status> 样例，真实流式状态进入成员快照', () => {
    // R1-1（2026-10-19）：流式回调随发送链路搬进 useGroupComposer.ts，
    // 视图只剩渲染与接线。断言内容不变，两处一起守——视图不许自己再造一份
    // 假样例，composer 必须把真实 status 落到消息上。
    const view = stripComments(readFileSync(resolve(ROOT, 'src/views/GroupChatView.vue'), 'utf8'));
    const code = stripComments(readFileSync(resolve(ROOT, 'src/composables/useGroupComposer.ts'), 'utf8'));
    expect(view).not.toContain('<status>');
    expect(code).not.toContain('<status>');
    expect(code).toContain('onStatus: (status) =>');
    expect(code).toContain('groupStore.updateAssistantMessage(groupId, messageId, { status })');
  });

  it('5-6 ApiMessage 结构未被 P1 污染（四个 client 零改动的证据之一）', () => {
    const src = readFileSync(resolve(ROOT, 'src/api/types.ts'), 'utf8');
    expect(src).not.toContain('CharacterStatus');
    const msg: ApiMessage = { role: 'assistant', content: 'x' };
    expect(msg.content).toBe('x');
  });
});
