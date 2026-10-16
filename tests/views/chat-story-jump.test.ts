/**
 * E15：聊天页的故事时间 → 故事本体
 *
 * 这条边此前是"只显示、跳不过去"：顶栏写着当前故事时间，但用户从这里回不到
 * 那个故事。契约两条——① 这块必须是真的可点（button，不是 div 挂 click），
 * ② 点下去要带上"是哪一条故事"（?story=），否则落地页仍停在用户上次看的那条。
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ChatMain from '@/components/chat/ChatMain.vue';
import { useCharacterStore } from '@/stores/character';
import type { UICharacter } from '@/types';

vi.mock('@/stores/story', () => ({
  useStoryStore: () => ({
    // 只替 ChatMain 真正读到的那一个方法；其余走真实 store 的测试另有文件
    getFormattedStoryTime: (id: string) => (id === 's1' ? '星历第 3 日' : ''),
  }),
}));

function makeCharacter(storyId?: string): UICharacter {
  return {
    id: 'c1',
    name: '测试角色',
    messages: [],
    tags: [],
    favorite: false,
    ...(storyId ? { storyId } : {}),
  } as unknown as UICharacter;
}

async function mountWithCharacter(storyId?: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const chars = useCharacterStore();
  chars.characters = [makeCharacter(storyId)];
  chars.currentCharacterId = 'c1';

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/story', name: 'story', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
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
  return { wrapper, router };
}

describe('聊天页故事时间（E15）', () => {
  it('角色关联故事时，这块渲染成可点的 button 而不是只读文本', async () => {
    const { wrapper } = await mountWithCharacter('s1');
    const chip = wrapper.find('.chat-story-time');

    expect(chip.exists()).toBe(true);
    expect(chip.element.tagName).toBe('BUTTON');
    expect(chip.text()).toContain('星历第 3 日');
  });

  it('点一下带 ?story= 跳到故事引擎，并留下返回来路', async () => {
    const { wrapper, router } = await mountWithCharacter('s1');
    await wrapper.find('.chat-story-time').trigger('click');
    // router.push 是异步的（导航守卫），不等一拍会读到旧路由
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('story');
    expect(router.currentRoute.value.query.story).toBe('s1');
    expect(router.currentRoute.value.query.from).toBeTruthy();
  });

  it('角色没关联故事时整块不渲染（也不留一个点了没反应的按钮）', async () => {
    const { wrapper } = await mountWithCharacter(undefined);
    expect(wrapper.find('.chat-story-time').exists()).toBe(false);
  });

  it('故事 id 指向已被删除的故事时不渲染（getFormattedStoryTime 返回空串）', async () => {
    const { wrapper } = await mountWithCharacter('gone');
    expect(wrapper.find('.chat-story-time').exists()).toBe(false);
  });
});
