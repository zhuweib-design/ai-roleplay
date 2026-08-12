/**
 * ChatMain — 消息窗口化渲染与滚动自动加载（P1-9 / T-03）组件测试
 *
 * 覆盖：
 * - 10k 消息时只渲染最近 RENDER_WINDOW(100) 条（DOM 不线性膨胀）
 * - 滚动到顶部触发自动加载，窗口扩大
 * - 加载期间防重入（连续滚动只加载一次）
 */
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ChatMain from '@/components/chat/ChatMain.vue';
import { useCharacterStore } from '@/stores/character';
import type { UICharacter, UIMessage } from '@/types';

function makeMessages(count: number): UIMessage[] {
  const msgs: UIMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({
      id: `m-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息内容 ${i}`,
      timestamp: Date.now() + i,
    });
  }
  return msgs;
}

/** 构造最小可用角色（UI 类型，窗口化只依赖 id/name/messages） */
function makeCharacter(id: string, messages: UIMessage[]): UICharacter {
  return {
    id,
    name: '测试角色',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages,
    model: 'gpt-4o',
    temperature: 1.0,
    maxTokens: 1024,
  } as unknown as UICharacter;
}

async function mountChatMain(pinia: Pinia) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  const wrapper = mount(ChatMain, {
    global: {
      plugins: [pinia, router],
      stubs: {
        MessageBubble: { template: '<div class="msg-stub" />' },
        Icon: true,
        Avatar: true,
        Toast: true,
        ApiErrorModal: true,
      },
    },
  });
  await wrapper.vm.$nextTick();
  await flushPromises();
  return wrapper;
}

describe('ChatMain 消息窗口化渲染 (T-03)', () => {
  it('10k 消息时仅渲染最近 100 条', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const charStore = useCharacterStore();
    charStore.characters.push(makeCharacter('c-10k', makeMessages(10000)));
    charStore.selectCharacter('c-10k');

    const wrapper = await mountChatMain(pinia);
    await wrapper.vm.$nextTick();

    const bubbles = wrapper.findAll('.msg-stub');
    expect(bubbles.length).toBe(100); // RENDER_WINDOW
  });

  it('滚动到顶部触发自动加载，窗口扩大 100 条', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const charStore = useCharacterStore();
    charStore.characters.push(makeCharacter('c-500', makeMessages(500)));
    charStore.selectCharacter('c-500');

    const wrapper = await mountChatMain(pinia);
    expect(wrapper.findAll('.msg-stub').length).toBe(100);

    const msgArea = wrapper.find('.chat-messages');
    // jsdom 下 scrollTop 恒为 0（满足 <300 阈值）
    await msgArea.trigger('scroll');
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.findAll('.msg-stub').length).toBe(200);
  });

  it('加载期间防重入：连续滚动只加载一次', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const charStore = useCharacterStore();
    charStore.characters.push(makeCharacter('c-1000', makeMessages(1000)));
    charStore.selectCharacter('c-1000');

    const wrapper = await mountChatMain(pinia);
    expect(wrapper.findAll('.msg-stub').length).toBe(100);

    const msgArea = wrapper.find('.chat-messages');
    // 并发触发模拟高频滚动（真实场景滚动事件同步连发）
    await Promise.all([msgArea.trigger('scroll'), msgArea.trigger('scroll')]);
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.findAll('.msg-stub').length).toBe(200); // 仅 +100，非 +200
  });

  it('窗口未超限时滚动不触发加载', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const charStore = useCharacterStore();
    charStore.characters.push(makeCharacter('c-50', makeMessages(50)));
    charStore.selectCharacter('c-50');

    const wrapper = await mountChatMain(pinia);
    expect(wrapper.findAll('.msg-stub').length).toBe(50);

    const msgArea = wrapper.find('.chat-messages');
    await msgArea.trigger('scroll');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.msg-stub').length).toBe(50); // 无变化
  });
});
