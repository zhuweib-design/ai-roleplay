/**
 * 聊天页触屏交互与输入条（OPT_PLAN_2026-10-15 专项 D / E）
 *
 * D：触屏没有 hover，消息操作从"常显一排小按钮"改成"长按唤起底部动作条"。
 *    这里钉住三件事：长按判定窗口（够久才弹）、滚动即取消（不误弹）、清单与桌面同源。
 * E：输入条高度上下限改由 CSS 单源控制；Enter 按指针形态分流。
 *    jsdom 没有排版引擎，量不到真实高度 —— 高度类断言在 e2e/mobile 里做，
 *    这里只做"源码不再有两套数"的漂移守卫 + Enter 行为断言。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import fs from 'node:fs';
import path from 'node:path';

import MessageBubble from '@/components/chat/MessageBubble.vue';
import MessageActionSheet from '@/components/chat/MessageActionSheet.vue';
import { assistantMsgActions } from '@/components/chat/message-actions';
import ChatMain from '@/components/chat/ChatMain.vue';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { isCoarsePointer } from '@/core/viewport';
import { t } from '@/i18n';
import type { UICharacter, UIMessage } from '@/types';

const SRC = path.resolve(__dirname, '../../src');

function msg(over: Partial<UIMessage> = {}): UIMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '夜风有点凉。',
    timestamp: 1,
    ...over,
  };
}

/** 造一次手指按压（组件只读 pointerType / clientX / clientY） */
function pressAt(wrapper: VueWrapper, x = 20, y = 20) {
  return wrapper
    .get('.msg-wrap')
    .trigger('pointerdown', { pointerType: 'touch', clientX: x, clientY: y });
}

function moveTo(wrapper: VueWrapper, x: number, y: number) {
  return wrapper
    .get('.msg-wrap')
    .trigger('pointermove', { pointerType: 'touch', clientX: x, clientY: y });
}

/** MessageBubble 里的注入痕迹摘要组件要用 router，给一个内存路由免得 stderr 全是警告 */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

function mountBubble(msgValue: UIMessage) {
  return mount(MessageBubble, {
    props: { msg: msgValue },
    global: { plugins: [makeRouter()] },
  });
}

describe('D：长按唤起动作条', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('按住超过 500ms 派发 longpress，带上这条消息的 id', async () => {
    const wrapper = mountBubble(msg());
    await pressAt(wrapper);
    vi.advanceTimersByTime(520);

    expect(wrapper.emitted('longpress')?.[0]).toEqual(['m-1']);
    wrapper.unmount();
  });

  it('鼠标按住再久也不弹：桌面走 hover 工具条，不抢这套手势', async () => {
    const wrapper = mountBubble(msg());
    await wrapper
      .get('.msg-wrap')
      .trigger('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 20 });
    vi.advanceTimersByTime(900);

    expect(wrapper.emitted('longpress')).toBeUndefined();
    wrapper.unmount();
  });

  it('负向对照：按住期间移动 12px（判为滚动）后不弹', async () => {
    const wrapper = mountBubble(msg());
    await pressAt(wrapper, 20, 20);
    await moveTo(wrapper, 20, 32);
    vi.advanceTimersByTime(900);

    expect(wrapper.emitted('longpress')).toBeUndefined();
    wrapper.unmount();
  });

  it('负向对照：浏览器判成滚动而发 pointercancel 时不弹', async () => {
    const wrapper = mountBubble(msg());
    await pressAt(wrapper);
    await wrapper.get('.msg-wrap').trigger('pointercancel', { pointerType: 'touch' });
    vi.advanceTimersByTime(900);

    expect(wrapper.emitted('longpress')).toBeUndefined();
    wrapper.unmount();
  });

  it('负向对照：300ms 就抬手（判为轻点）不弹', async () => {
    const wrapper = mountBubble(msg());
    await pressAt(wrapper);
    vi.advanceTimersByTime(300);
    await wrapper.get('.msg-wrap').trigger('pointerup', { pointerType: 'touch' });
    vi.advanceTimersByTime(900);

    expect(wrapper.emitted('longpress')).toBeUndefined();
    wrapper.unmount();
  });

  it('用户消息没有操作入口（现状未变），长按不弹', async () => {
    const wrapper = mountBubble(msg({ role: 'user' }));
    await pressAt(wrapper);
    vi.advanceTimersByTime(900);

    expect(wrapper.emitted('longpress')).toBeUndefined();
    wrapper.unmount();
  });

  it('卸载后计时器已清：不会在组件销毁后才补发一次 longpress', async () => {
    const wrapper = mountBubble(msg());
    await pressAt(wrapper);
    wrapper.unmount();
    vi.advanceTimersByTime(900);

    expect(wrapper.emitted('longpress')).toBeUndefined();
  });
});

describe('D：动作条本身', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const actions = assistantMsgActions();

  it('未打开时不往 body 里留任何 DOM', () => {
    const wrapper = mount(MessageActionSheet, {
      props: { open: false, actions },
      attachTo: document.body,
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
  });

  it('打开后列出与桌面工具条同一份清单，末尾多一项取消', () => {
    const wrapper = mount(MessageActionSheet, {
      props: { open: true, actions },
      attachTo: document.body,
    });
    const items = document.querySelectorAll('.sheet-item');
    expect(items).toHaveLength(actions.length + 1);
    // 清单同源：动作条里的 label 与 assistantMsgActions() 逐条一致
    expect([...items].slice(0, actions.length).map((el) => el.textContent?.trim())).toEqual(
      actions.map((a) => a.label)
    );
    wrapper.unmount();
  });

  it('点某一项只回传它的 key，由父级决定怎么做', async () => {
    const wrapper = mount(MessageActionSheet, {
      props: { open: true, actions },
      attachTo: document.body,
    });
    const copyBtn = [...document.querySelectorAll<HTMLButtonElement>('.sheet-item')].find((b) =>
      b.textContent?.includes(t('bubble.copy'))
    );
    copyBtn!.click();
    await flushPromises();

    expect(wrapper.emitted('action')?.[0]).toEqual(['copy']);
    wrapper.unmount();
  });

  it('Esc 关闭（焦点在动作条内部时也能退出）', async () => {
    const wrapper = mount(MessageActionSheet, {
      props: { open: true, actions },
      attachTo: document.body,
    });
    await flushPromises();
    document.querySelector('.sheet-item')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );

    expect(wrapper.emitted('close')).toBeTruthy();
    wrapper.unmount();
  });

  it('负向对照：抬手时的幽灵点击不会把刚弹出的动作条关掉', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const wrapper = mount(MessageActionSheet, {
      props: { open: false, actions },
      attachTo: document.body,
    });
    await wrapper.setProps({ open: true });
    await flushPromises();

    // 开屏后 100ms 内落在遮罩上的点击 = 同一次长按抬手补发的 click ⇒ 必须忽略
    document.querySelector('.sheet-mask')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushPromises();
    expect(wrapper.emitted('close')).toBeUndefined();

    // 过了这段窗口，同一处点击就是用户真的要关
    vi.advanceTimersByTime(500);
    document.querySelector('.sheet-mask')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await flushPromises();
    expect(wrapper.emitted('close')).toBeTruthy();

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('打开后焦点落到第一项（键盘/读屏用户不用摸黑 Tab）', async () => {
    const wrapper = mount(MessageActionSheet, {
      props: { open: false, actions },
      attachTo: document.body,
    });
    await wrapper.setProps({ open: true });
    await flushPromises();

    expect(document.activeElement?.classList.contains('sheet-item')).toBe(true);
    wrapper.unmount();
  });
});

describe('D/E：源码漂移守卫（改回旧写法就红）', () => {
  const bubbleSrc = fs.readFileSync(
    path.join(SRC, 'components/chat/MessageBubble.vue'),
    'utf8'
  );
  const chatMainSrc = fs.readFileSync(path.join(SRC, 'components/chat/ChatMain.vue'), 'utf8');
  // R1-5：输入区（含高度自适应）搬进 ChatComposer，判据跟着走——留在 ChatMain 上会
  // 变成"文件里没有 Math.ceil 就绿"的空转断言。
  const composerSrc = fs.readFileSync(path.join(SRC, 'components/chat/ChatComposer.vue'), 'utf8');

  it('触屏"操作栏常显"那条规则已经删掉', () => {
    expect(bubbleSrc).not.toMatch(/@media \(hover: none\)\s*\{[\s\S]{0,80}?\.msg-toolbar\s*\{[\s\S]{0,40}?opacity:\s*1/);
  });

  it('隐藏态的工具条不再能吃掉点击（opacity:0 必须配 pointer-events:none）', () => {
    expect(bubbleSrc).toMatch(/\.msg-toolbar\s*\{[\s\S]*?pointer-events:\s*none;/);
  });

  it('输入框高度上下限只剩 CSS 一个来源（JS 里不再写死 56/200）', () => {
    expect(chatMainSrc).not.toMatch(/const\s+minH\s*=/);
    expect(chatMainSrc).not.toMatch(/const\s+maxH\s*=/);
    expect(composerSrc).not.toMatch(/const\s+minH\s*=/);
    expect(composerSrc).not.toMatch(/const\s+maxH\s*=/);
    expect(composerSrc).toContain('Math.ceil(el.scrollHeight)');
  });
});

describe('E：Enter 按指针形态分流', () => {
  let pinia: Pinia;
  let sendSpy: ReturnType<typeof vi.spyOn>;

  function makeCharacter(id: string): UICharacter {
    return {
      id,
      name: '触屏回车测试角色',
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
      temperature: 1,
    } as unknown as UICharacter;
  }

  async function mountChatMain() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    const wrapper = mount(ChatMain, {
      global: {
        plugins: [pinia, router],
        stubs: {
          MessageBubble: { template: '<div class="msg-stub" />' },
          MessageActionSheet: true,
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

  async function pressEnter(wrapper: Awaited<ReturnType<typeof mountChatMain>>) {
    const textarea = wrapper.find<HTMLTextAreaElement>('#chat-input');
    textarea.element.value = '今晚月色很好';
    textarea.element.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await wrapper.vm.$nextTick();
    await flushPromises();
  }

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const charStore = useCharacterStore();
    charStore.characters.push(makeCharacter('c-touch'));
    charStore.selectCharacter('c-touch');
    vi.spyOn(useChatStore(), 'checkSendBlock').mockReturnValue(null);
    sendSpy = vi.spyOn(useChatStore(), 'sendMessage').mockResolvedValue(true);
  });

  afterEach(() => {
    isCoarsePointer.value = false;
    vi.restoreAllMocks();
  });

  it('手指端：Enter 不发送（软键盘没有 Shift，回车留给换行），提示文案随之换一套', async () => {
    isCoarsePointer.value = true;
    const wrapper = await mountChatMain();

    await pressEnter(wrapper);

    expect(sendSpy).not.toHaveBeenCalled();
    expect(wrapper.find<HTMLTextAreaElement>('#chat-input').element.value).toBe('今晚月色很好');
    expect(wrapper.find('#chat-input').attributes('placeholder')).toBe(t('chat.inputPlaceholderTouch'));
  });

  it('鼠标端：Enter 仍然直接发送并清空输入框（既有约定不动）', async () => {
    isCoarsePointer.value = false;
    const wrapper = await mountChatMain();

    await pressEnter(wrapper);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0]![1]).toBe('今晚月色很好');
    expect(wrapper.find<HTMLTextAreaElement>('#chat-input').element.value).toBe('');
    expect(wrapper.find('#chat-input').attributes('placeholder')).toBe(t('chat.inputPlaceholder'));
  });
});

/**
 * 消息编辑弹窗的分段预览（专项 C 的最后一处）
 *
 * 存储格式是 `content` 里原样留着 ⟦ ⟧，渲染层才拆分。编辑框如果直接绑原文，用户就会
 * 看到两个来源不明的符号（这是第 15 节列的已知遗留）。这里钉四件事：
 * 预览确实按同一套分段拆、无标记时不虚构分段、预览里不出现标记本身、保存写回的仍是原文。
 */
describe('编辑弹窗：分段预览不露原始标记', () => {
  let pinia: Pinia;

  function makeCharacter(id: string): UICharacter {
    return {
      id,
      name: '编辑预览测试角色',
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
      temperature: 1,
    } as unknown as UICharacter;
  }

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const charStore = useCharacterStore();
    charStore.characters.push(makeCharacter('c-edit'));
    charStore.selectCharacter('c-edit');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function openEditor(draft: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    const wrapper = mount(ChatMain, {
      global: {
        plugins: [pinia, router],
        stubs: {
          // Modal 的内容在 <Teleport to="body"> 里，不摊平就查不到（VTU 的 teleport 桩把内容就地渲染）
          teleport: true,
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
    const vm = wrapper.vm as unknown as { editModalOpen: boolean; editDraft: string; editTarget: UIMessage | null };
    vm.editTarget = msg({ id: 'm-edit', content: '旧的、还没改过的原文' });
    vm.editDraft = draft;
    vm.editModalOpen = true;
    await wrapper.vm.$nextTick();
    await flushPromises();
    return wrapper;
  }

  it('带标记的草稿：预览拆成"气泡外一句 + 正文一句"', async () => {
    const wrapper = await openEditor('⟦她指尖一凉，面上不能露⟧夜风有点凉，进来坐。');

    expect(wrapper.findAll('.edit-preview-psy').map((n) => n.text())).toEqual(['她指尖一凉，面上不能露']);
    expect(wrapper.findAll('.edit-preview-say').map((n) => n.text())).toEqual(['夜风有点凉，进来坐。']);
  });

  // 单独成条：合在上一条里会被前面的断言短路，"标记漏进预览"这种缺陷就没人红
  it('负向对照：预览里不出现 ⟦ ⟧ 这两个标记字符', async () => {
    const wrapper = await openEditor('⟦她指尖一凉⟧夜风有点凉。');
    const previewText = wrapper.find('.edit-message-preview').text();
    expect(previewText).not.toContain('⟦');
    expect(previewText).not.toContain('⟧');
  });

  it('负向对照：没有标记的草稿只出一段正文，不会凭空多一句心理活动', async () => {
    const wrapper = await openEditor('今天下雪了。');
    expect(wrapper.findAll('.edit-preview-psy')).toHaveLength(0);
    expect(wrapper.findAll('.edit-preview-say').map((n) => n.text())).toEqual(['今天下雪了。']);
  });

  it('文本框里仍是原文（标记可编辑），并有一句说明它是什么', async () => {
    const draft = '⟦先忍住⟧别出声。';
    const wrapper = await openEditor(draft);
    expect(wrapper.find<HTMLTextAreaElement>('.edit-message-input').element.value).toBe(draft);
    expect(wrapper.find('.edit-message-hint').text()).toContain(t('chat.editNarrationHint'));
  });

  it('保存写回的是带标记的原文，预览不参与存储（否则心理活动会丢）', async () => {
    const draft = '⟦先忍住⟧别出声。';
    const wrapper = await openEditor(draft);
    const editSpy = vi.spyOn(useChatStore(), 'editMessage').mockImplementation(() => undefined);
    const persistSpy = vi.spyOn(useChatStore(), 'persistAfterEdit').mockResolvedValue(undefined);

    const vm = wrapper.vm as unknown as { confirmEditMessage: () => void };
    vm.confirmEditMessage();
    await flushPromises();

    expect(editSpy).toHaveBeenCalledTimes(1);
    expect(editSpy.mock.calls[0]![1]).toBe(draft);
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });
});
