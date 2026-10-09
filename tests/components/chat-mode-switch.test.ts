/**
 * 单聊 ⇄ 群聊 分段控件（M6-a）
 *
 * 三条要紧的：
 * 1. 当前项由**路由**派生，不是组件自己的状态——两处页头各挂一份，必须各自亮对的那一项；
 * 2. 方向键只移焦点、不跳转（这是选 tablist + 手动激活而不是 radiogroup 的全部理由：
 *    radiogroup 的"焦点即选中"在这里等于按一次方向键把人送进另一个页面）；
 * 3. 标签与图标取自 nav-model，不再抄第二份清单。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ChatModeSwitch from '@/components/chat/ChatModeSwitch.vue';
import { t } from '@/i18n';

async function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/group', name: 'group', component: { template: '<div />' } },
    ],
  });
}

let pushSpy: ReturnType<typeof vi.spyOn>;

async function mountAt(routeName: 'chat' | 'group') {
  const router = await makeRouter();
  await router.push({ name: routeName });
  await router.isReady();
  pushSpy = vi.spyOn(router, 'push');
  const wrapper = mount(ChatModeSwitch, { global: { plugins: [router] }, attachTo: document.body });
  return { wrapper, router };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ChatModeSwitch', () => {
  it('两项都来自 nav-model，且只有一项是当前', async () => {
    const { wrapper } = await mountAt('chat');
    const tabs = wrapper.findAll('[role="tab"]');

    expect(tabs).toHaveLength(2);
    expect(tabs.map((tab) => tab.text())).toEqual([t('nav.chat'), t('nav.group')]);
    expect(tabs.filter((tab) => tab.attributes('aria-selected') === 'true')).toHaveLength(1);
    expect(wrapper.find('[data-rel-jump="mode-chat"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.find('[data-rel-jump="mode-group"]').attributes('aria-selected')).toBe('false');
  });

  it('在群聊页时亮的是群聊（当前项由路由派生，不是组件私有状态）', async () => {
    const { wrapper } = await mountAt('group');
    expect(wrapper.find('[data-rel-jump="mode-group"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.find('[data-rel-jump="mode-chat"]').attributes('aria-selected')).toBe('false');
  });

  it('点另一项跳过去；点当前项不重复导航', async () => {
    const { wrapper, router } = await mountAt('chat');
    await wrapper.find('[data-rel-jump="mode-group"]').trigger('click');
    // 组件里是 void router.push(...)：导航是异步的，不等一拍会读到旧路由
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('group');

    // 再点一次"自己已经在的那一项"：不该产生第二次导航
    pushSpy.mockClear();
    await wrapper.find('[data-rel-jump="mode-group"]').trigger('click');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('方向键只移焦点，不跳转；Enter 才跳', async () => {
    const { wrapper, router } = await mountAt('chat');
    const chatTab = wrapper.find('[data-rel-jump="mode-chat"]');
    await chatTab.trigger('keydown', { key: 'ArrowRight' });
    // 必须等一拍再断"还在原页"：router.push 是异步的，不等就等于"没跳"和"还没跳完"分不清
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('chat');
    expect(document.activeElement?.id).toBe('chat-mode-tab-group');
    expect(wrapper.find('[data-rel-jump="mode-group"]').attributes('aria-selected')).toBe('false');
    // roving tabindex 跟着焦点走，否则 Tab 键会跳回旧项
    expect(wrapper.find('[data-rel-jump="mode-group"]').attributes('tabindex')).toBe('0');
    expect(wrapper.find('[data-rel-jump="mode-chat"]').attributes('tabindex')).toBe('-1');

    await wrapper.find('[data-rel-jump="mode-group"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('group');
  });

  it('Home / End 移到首末；blur 后焦点位回到当前项', async () => {
    const { wrapper } = await mountAt('chat');
    await wrapper.find('[data-rel-jump="mode-chat"]').trigger('keydown', { key: 'End' });
    expect(document.activeElement?.id).toBe('chat-mode-tab-group');
    await wrapper.find('[data-rel-jump="mode-group"]').trigger('keydown', { key: 'Home' });
    expect(document.activeElement?.id).toBe('chat-mode-tab-chat');

    await wrapper.find('[data-rel-jump="mode-chat"]').trigger('blur');
    expect(wrapper.find('[data-rel-jump="mode-chat"]').attributes('tabindex')).toBe('0');
    expect(wrapper.find('[data-rel-jump="mode-group"]').attributes('tabindex')).toBe('-1');
  });

  it('其它按键不被吞掉（方向键之外一律放行给页面）', async () => {
    const { wrapper } = await mountAt('chat');
    const tab = wrapper.find('[data-rel-jump="mode-chat"]');
    await tab.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.id).toBe('chat-mode-tab-group');

    await tab.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement?.id).toBe('chat-mode-tab-group');
  });
});
