/**
 * ChatMain — IME 组词守卫回归（跨端评审 I-6）
 *
 * 背景：中文拼音 / 日文假名 / 韩文输入法在**组词过程中**按回车不应发送消息，
 * 组词完成后再按回车才发送。守卫位于 `ChatMain.handleKeydown`：
 *
 *   if (e.key === 'Enter' && !e.shiftKey) {
 *     if (e.isComposing || e.keyCode === 229) return;   // ← I-6 守卫
 *     e.preventDefault();
 *     handleSend();
 *   }
 *
 * 为何单独建文件：I-6 此前**没有任何自动化覆盖**（`tests/` 与 `e2e/` 均零命中
 * `isComposing` / `keyCode`），属 Web SOP 评审第四批识别出的缺口。
 *
 * 注意：jsdom 的 `KeyboardEvent` 不支持在构造器里设置 `isComposing` / `keyCode`，
 * 需用 `Object.defineProperty` 覆盖实例属性（`keyCode` 是原型上的 getter）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ChatMain from '@/components/chat/ChatMain.vue';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import type { UICharacter } from '@/types';

function makeCharacter(id: string): UICharacter {
  return {
    id,
    name: 'IME 测试角色',
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
    messages: [],
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

/** 在输入框里填好文本后派发一次回车（可带 IME / Shift 标记） */
async function pressEnter(
  wrapper: Awaited<ReturnType<typeof mountChatMain>>,
  flags: { isComposing?: boolean; keyCode?: number; shiftKey?: boolean } = {},
): Promise<void> {
  const textarea = wrapper.find<HTMLTextAreaElement>('#chat-input');
  textarea.element.value = '你好世界';
  textarea.element.dispatchEvent(new Event('input', { bubbles: true }));

  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    shiftKey: flags.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  if (flags.isComposing !== undefined) {
    Object.defineProperty(event, 'isComposing', { value: flags.isComposing, configurable: true });
  }
  if (flags.keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { value: flags.keyCode, configurable: true });
  }
  textarea.element.dispatchEvent(event);
  await wrapper.vm.$nextTick();
  await flushPromises();
}

/** 创建 sendMessage 间谍：类型由返回值推断，避免 `ReturnType<typeof vi.spyOn>` 泛型擦除导致的类型不兼容 */
function spyOnSend() {
  return vi.spyOn(useChatStore(), 'sendMessage').mockResolvedValue(undefined);
}

describe('ChatMain IME 组词守卫（I-6）', () => {
  let pinia: Pinia;
  let sendSpy: ReturnType<typeof spyOnSend>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const charStore = useCharacterStore();
    charStore.characters.push(makeCharacter('c-ime'));
    charStore.selectCharacter('c-ime');
    // 只关心「是否被调用」，不让真实发送流程跑起来
    sendSpy = spyOnSend();
  });

  it('中文/日文/韩文组词中（isComposing=true）按回车不发送', async () => {
    const wrapper = await mountChatMain(pinia);
    await pressEnter(wrapper, { isComposing: true });

    expect(sendSpy).not.toHaveBeenCalled();
    // 输入框内容应保留，用户还在组词
    expect(wrapper.find<HTMLTextAreaElement>('#chat-input').element.value).toBe('你好世界');
  });

  it('组词中（keyCode=229，Safari / 旧版 Chrome 的组词标记）按回车不发送', async () => {
    const wrapper = await mountChatMain(pinia);
    await pressEnter(wrapper, { keyCode: 229 });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('组词完成后按回车正常发送，并清空输入框', async () => {
    const wrapper = await mountChatMain(pinia);
    await pressEnter(wrapper); // 无任何 IME 标记 = 组词已结束

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0]![1]).toBe('你好世界');
    expect(wrapper.find<HTMLTextAreaElement>('#chat-input').element.value).toBe('');
  });

  it('Shift+Enter 换行不发送', async () => {
    const wrapper = await mountChatMain(pinia);
    await pressEnter(wrapper, { shiftKey: true });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('非 Enter 键不发送', async () => {
    const wrapper = await mountChatMain(pinia);
    const textarea = wrapper.find<HTMLTextAreaElement>('#chat-input');
    textarea.element.value = '你好世界';
    textarea.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
