/**
 * 心理活动的渲染（OPT_PLAN_2026-10-15 专项 C）
 *
 * 断言的是"心理段在气泡外面"这件事的可测形式：
 * `.msg-psy` 存在，且**不是** `.msg-bubble` 的后代。
 * 外加模型不守规矩时必须退回成单气泡、以及流式逐字符喂入的最终形状稳定。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

import MessageBubble from '@/components/chat/MessageBubble.vue';
import { NARRATION_OPEN, NARRATION_CLOSE } from '@/core/narration';
import type { UIMessage } from '@/types';

const SRC = path.resolve(__dirname, '../../src');

function msg(over: Partial<UIMessage> = {}): UIMessage {
  return { id: 'm1', role: 'assistant', content: '', timestamp: 1, ...over };
}

function mountBubble(m: UIMessage) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  return mount(MessageBubble, { props: { msg: m }, global: { plugins: [router] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('气泡外的心理段', () => {
  it('对白—心理—对白 渲染成 气泡 / 旁白 / 气泡，且旁白不在任何气泡里面', () => {
    const wrapper = mountBubble(
      msg({
        content: `你先坐一下。\n${NARRATION_OPEN}沈知微有点紧张的看着我，指尖在杯沿上轻轻敲了两下。${NARRATION_CLOSE}\n水刚烧上，你先坐一会儿。`,
      })
    );
    const bubbles = wrapper.findAll('.msg-bubble');
    const psy = wrapper.findAll('.msg-psy');
    expect(bubbles).toHaveLength(2);
    expect(psy).toHaveLength(1);
    expect(psy[0]!.text()).toContain('有点紧张的看着我');
    // 核心断言：心理段不是气泡的后代
    expect(psy[0]!.find('.msg-bubble').exists()).toBe(false);
    expect(wrapper.html().indexOf('msg-psy')).toBeGreaterThan(
      wrapper.html().indexOf('你先坐一下')
    );
  });

  it('负向对照：模型没写标记时只有一个气泡、没有旁白行（改造前形状）', () => {
    const wrapper = mountBubble(msg({ content: '一整段没有任何标记的回复' }));
    expect(wrapper.findAll('.msg-bubble')).toHaveLength(1);
    expect(wrapper.findAll('.msg-psy')).toHaveLength(0);
    expect(wrapper.text()).toContain('一整段没有任何标记的回复');
  });

  it('负向对照：裸标记不会漏进界面（用户看到的永远是排版后的结果）', () => {
    const wrapper = mountBubble(
      msg({ content: `甲${NARRATION_OPEN}乙${NARRATION_CLOSE}丙` })
    );
    expect(wrapper.text()).not.toContain(NARRATION_OPEN);
    expect(wrapper.text()).not.toContain(NARRATION_CLOSE);
  });

  it('只开不闭时尾巴按心理渲染，文字不丢', () => {
    const wrapper = mountBubble(msg({ content: `说了这句${NARRATION_OPEN}心理被截断了` }));
    expect(wrapper.findAll('.msg-psy')).toHaveLength(1);
    expect(wrapper.text()).toContain('心理被截断了');
  });

  it('流式的每个中间态都不漏裸标记，且分段数不炸（最多 2 气泡 + 1 旁白）', () => {
    const full = `你先坐。\n${NARRATION_OPEN}她有点紧张的看着我。${NARRATION_CLOSE}\n水刚烧上。`;
    for (let n = 1; n <= full.length; n++) {
      const wrapper = mountBubble(msg({ content: full.slice(0, n) }));
      const text = wrapper.text();
      expect(text).not.toContain(NARRATION_OPEN);
      expect(text).not.toContain(NARRATION_CLOSE);
      expect(wrapper.findAll('.msg-bubble').length).toBeLessThanOrEqual(2);
      expect(wrapper.findAll('.msg-psy').length).toBeLessThanOrEqual(1);
      wrapper.unmount();
    }
  });

  it('旧旁白字段（mock 数据）改用同一种样式，不再出现气泡内的斜体插叙', () => {
    const wrapper = mountBubble(msg({ content: '正片', narration: '从前有段旁白' }));
    const psy = wrapper.findAll('.msg-psy');
    expect(psy).toHaveLength(1);
    expect(psy[0]!.classes()).not.toContain('msg-narration');
    expect(psy[0]!.text()).toBe('从前有段旁白');
  });
});

describe('群聊走同一套分段（漂移守卫）', () => {
  const src = fs.readFileSync(
    path.join(SRC, 'views/GroupChatView.vue'),
    'utf8'
  );

  it('群聊 import 了同一个解析器，且不再把整条 content 直接塞进气泡', () => {
    expect(src).toContain("import { parseNarrationSegments } from '@/core/narration'");
    // 反向钉住旧写法：气泡里直接插值整条消息 = 标记会裸出来
    expect(src).not.toMatch(/<div class="msg-content">\{\{\s*msg\.content\s*\}\}/);
    expect(src).toContain('segmentsOf(msg.content)');
  });

  it('群聊恢复了人称注入（曾经因为没接分段而故意关掉）', () => {
    expect(src).toContain('narrationPerspective: settingsStore.narrationPerspective');
  });
});
