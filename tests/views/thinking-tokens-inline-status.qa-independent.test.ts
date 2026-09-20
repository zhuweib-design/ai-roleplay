import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import ThinkingBlock from '../../src/components/chat/ThinkingBlock.vue';
import StatusHud from '../../src/components/chat/StatusHud.vue';
import MessageBubble from '../../src/components/chat/MessageBubble.vue';
import { useSettingsStore } from '../../src/stores/settings';
import { parseStatusBlock } from '@core/status-parser';
import { isMobile } from '@core/viewport';
import type { CharacterStatus, StatusSchema } from '@core/status-schema';
import { uiMsgToChatMsg, chatMsgToUiMsg } from '../../src/services/type-adapters';
import type { UIMessage } from '@/types';
import { initLocale } from '@/i18n';

/**
 * QA 独立验证 —— 任务 2 的展示侧 + 任务 3 消息级状态渲染
 *
 * 断言一律打在 **DOM** 上（而非数据或源码字符串），这是与工程师用例的主要差异：
 * - 思考 token：undefined / 0 / NaN / 生成中 → DOM 中不存在该节点（显示 0 等同编造）
 * - inline 与 sticky 必须视觉可区分（类名互斥 + CSS 规则层面确实不同）
 * - collapsibleOnMobile 默认 false 时行为不变；开启后折叠成一行且可点击展开
 * - 渲染全程文本插值，零 v-html
 */

const SCHEMA: StatusSchema = {
  version: 1,
  fields: [
    { key: 'location', type: 'string' },
    { key: 'affection', type: 'number' },
  ],
};

function statusFrom(raw: string): CharacterStatus {
  return parseStatusBlock(raw, SCHEMA, 'm1') as CharacterStatus;
}

function makeMsg(overrides: Partial<UIMessage> = {}): UIMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '正文',
    timestamp: 1,
    ...overrides,
  };
}

// ── 1. 思考 token 展示（DOM 级） ──

describe('ThinkingBlock —— 思考 token 展示（QA 独立）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
  });

  it('供应商上报了正数时展示', () => {
    const w = mount(ThinkingBlock, {
      props: { thinking: '想了想', messageId: 'm1', reasoningTokens: 320 },
    });
    const el = w.find('.thinking-tokens');
    expect(el.exists()).toBe(true);
    expect(el.text()).toContain('320');
    expect(el.text()).toContain('思考');
  });

  it.each([
    ['undefined', undefined],
    ['0', 0],
    ['NaN', Number.NaN],
    ['负数', -5],
  ])('未上报 / 非法值（%s）一律不渲染（绝不显示 0）', (_label, v) => {
    const w = mount(ThinkingBlock, {
      props: { thinking: '想了想', messageId: 'm1', reasoningTokens: v },
    });
    expect(w.find('.thinking-tokens').exists()).toBe(false);
  });

  it('生成中不展示（避免中途闪一个不完整的数字）', () => {
    const w = mount(ThinkingBlock, {
      props: { thinking: '想', messageId: 'm1', generating: true, reasoningTokens: 320 },
    });
    expect(w.find('.thinking-tokens').exists()).toBe(false);
  });

  it('生成结束后同一条消息才展示', async () => {
    const w = mount(ThinkingBlock, {
      props: { thinking: '想', messageId: 'm1', generating: true, reasoningTokens: 320 },
    });
    expect(w.find('.thinking-tokens').exists()).toBe(false);
    await w.setProps({ generating: false });
    expect(w.find('.thinking-tokens').exists()).toBe(true);
  });

  it('渲染走文本插值，无 v-html', () => {
    const w = mount(ThinkingBlock, {
      props: { thinking: '<img src=x onerror=alert(1)>', messageId: 'm1', reasoningTokens: 320 },
    });
    expect(w.html()).not.toContain('v-html');
    expect(w.find('img').exists()).toBe(false);
  });
});

// ── 1b. 持久化：未上报不落盘，回读绝不变成 0 ──

describe('reasoningTokens 持久化（QA 独立）', () => {
  beforeEach(() => {
    initLocale('zh');
  });

  it('已上报的正数随消息落盘并可回读', () => {
    const card = uiMsgToChatMsg(makeMsg({ thinking: '想', reasoningTokens: 320 }));
    expect(card.reasoningTokens).toBe(320);
    expect(chatMsgToUiMsg(card)!.reasoningTokens).toBe(320);
  });

  it.each([
    ['undefined', undefined],
    ['0', 0],
    ['负数', -1],
  ])('未上报 / 非法值（%s）不落盘（回读仍是 undefined，不是 0）', (_label, v) => {
    const card = uiMsgToChatMsg(makeMsg({ thinking: '想', reasoningTokens: v }));
    expect(Object.prototype.hasOwnProperty.call(card, 'reasoningTokens')).toBe(false);
    expect(chatMsgToUiMsg(card)!.reasoningTokens).toBeUndefined();
  });
});

// ── 2. inline 与 sticky 视觉可区分 ──

describe('StatusHud —— inline 与 sticky 视觉区分（QA 独立）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
    isMobile.value = false;
  });

  afterEach(() => {
    isMobile.value = false;
  });

  it('两个 variant 的类名互斥', () => {
    const st = statusFrom('location: 酒馆');
    const sticky = mount(StatusHud, { props: { status: st, variant: 'sticky' } });
    const inline = mount(StatusHud, { props: { status: st, variant: 'inline' } });
    expect(sticky.find('.status-hud').classes()).toContain('status-hud-sticky');
    expect(sticky.find('.status-hud').classes()).not.toContain('status-hud-inline');
    expect(inline.find('.status-hud').classes()).toContain('status-hud-inline');
    expect(inline.find('.status-hud').classes()).not.toContain('status-hud-sticky');
  });

  it('CSS 层面确实是两套外观（sticky 仅下边框通栏 / inline 四边圆角小卡）', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/chat/StatusHud.vue'), 'utf8');
    const style = src.slice(src.indexOf('<style'));
    const ruleOf = (sel: string): string => {
      const m = new RegExp(`(^|\\n)\\s*\\${sel.startsWith('.') ? sel : sel}\\s*\\{`).exec(style);
      expect(m, `缺少选择器 ${sel}`).not.toBeNull();
      const start = style.indexOf(m![0]) + m![0].length;
      return style.slice(start, style.indexOf('}', start));
    };
    // sticky variant 没有专属规则，外观就是基类 .status-hud（贴边通栏 + 仅下边框）
    const sticky = ruleOf('.status-hud');
    const inline = ruleOf('.status-hud-inline');
    // sticky：贴边通栏 —— 只有下边框、无圆角
    expect(sticky).toMatch(/border-bottom/);
    expect(sticky).not.toMatch(/border-radius/);
    // inline：气泡内小卡 —— 四边有框 + 圆角 + 更小字号
    expect(inline).toMatch(/border:/);
    expect(inline).toMatch(/border-radius/);
    expect(inline).toMatch(/font-size:\s*11px/);
    // 两者底色必须不同（否则"两条一样的条"）
    expect(inline).not.toBe(sticky);
  });

  it('inline 内容渲染仍走文本插值（零 v-html）', () => {
    const st = parseStatusBlock('location: <img src=x onerror=alert(1)>', SCHEMA, 'm1');
    const w = mount(StatusHud, { props: { status: st, variant: 'inline' } });
    expect(w.html()).not.toContain('v-html');
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('.status-value').text()).toContain('<img');
  });
});

// ── 3. 小屏折叠：collapsibleOnMobile 显式开关 ──

describe('StatusHud —— collapsibleOnMobile（QA 独立）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
    isMobile.value = true;
  });

  afterEach(() => {
    isMobile.value = false;
  });

  it('默认 false：小屏也不折叠（行为不变）', () => {
    const w = mount(StatusHud, { props: { status: statusFrom('location: 酒馆'), variant: 'inline' } });
    expect(w.find('.status-hud-toggle').exists()).toBe(false);
    expect(w.find('.status-hud-list').exists()).toBe(true);
    expect(w.find('.status-value').text()).toBe('酒馆');
  });

  it('开启后：折叠成一行（标题 + 字段数），列表不渲染', () => {
    const w = mount(StatusHud, {
      props: {
        status: statusFrom('location: 酒馆\n affection: 80'),
        variant: 'inline',
        collapsibleOnMobile: true,
      },
    });
    const toggle = w.find('.status-hud-toggle');
    expect(toggle.exists()).toBe(true);
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(w.find('.status-hud-list').exists()).toBe(false);
    expect(w.find('.status-hud-count').text()).toBe('2');
    expect(w.find('.status-hud-count').attributes('aria-label')).toContain('2');
  });

  it('点击可展开，aria-expanded 同步翻转', async () => {
    const w = mount(StatusHud, {
      props: { status: statusFrom('location: 酒馆'), variant: 'inline', collapsibleOnMobile: true },
    });
    await w.find('.status-hud-toggle').trigger('click');
    expect(w.find('.status-hud-toggle').attributes('aria-expanded')).toBe('true');
    expect(w.find('.status-hud-list').exists()).toBe(true);
    expect(w.find('.status-value').text()).toBe('酒馆');
    // 再点回去可收起
    await w.find('.status-hud-toggle').trigger('click');
    expect(w.find('.status-hud-list').exists()).toBe(false);
  });

  it('collapsibleOnMobile 开启但非小屏 → 不出现交互（桌面不出现无意义的折叠）', () => {
    isMobile.value = false;
    const w = mount(StatusHud, {
      props: { status: statusFrom('location: 酒馆'), variant: 'inline', collapsibleOnMobile: true },
    });
    expect(w.find('.status-hud-toggle').exists()).toBe(false);
    expect(w.find('.status-hud-list').exists()).toBe(true);
  });
});

// ── 4. MessageBubble 挂载行为 ──

describe('MessageBubble —— 消息级状态（QA 独立）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
    isMobile.value = true; // 消息列表走小屏折叠分支
  });

  afterEach(() => {
    isMobile.value = false;
  });

  it('msg.status 存在时渲染 inline 小卡，且开启小屏折叠', () => {
    const w = mount(MessageBubble, { props: { msg: makeMsg({ status: statusFrom('location: 酒馆') }) } });
    const hud = w.find('.status-hud');
    expect(hud.exists()).toBe(true);
    expect(hud.classes()).toContain('status-hud-inline');
    expect(hud.classes()).not.toContain('status-hud-sticky');
    // 消息列表里应启用折叠（默认折叠为一行）
    expect(w.find('.status-hud-toggle').exists()).toBe(true);
  });

  it('msg.status 缺失时完全不渲染（不出现空壳）', () => {
    const w = mount(MessageBubble, { props: { msg: makeMsg() } });
    expect(w.find('.status-hud').exists()).toBe(false);
  });

  it('statusHudConfig.showInline=false 时关闭（默认开）', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const settings = useSettingsStore();
    // 默认：未显式关闭即为开
    expect(settings.statusHudConfig.showInline).not.toBe(false);
    settings.setStatusHudConfig({ showInline: false });
    const w = mount(MessageBubble, {
      props: { msg: makeMsg({ status: statusFrom('location: 酒馆') }) },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(w.find('.status-hud').exists()).toBe(false);
  });

  it('消息气泡整体零 v-html', () => {
    const w = mount(MessageBubble, {
      props: {
        msg: makeMsg({
          status: statusFrom('location: <b>酒馆</b>'),
          content: '<b>正文</b>',
          thinking: '<b>思考</b>',
        }),
      },
    });
    expect(w.find('b').exists()).toBe(false);
    expect(w.html()).not.toContain('v-html');
  });
});
