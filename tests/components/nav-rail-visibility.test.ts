/**
 * NavRail 与入口显隐偏好的联动（M2-b8）
 *
 * 要守住的三件事：
 * - 取消勾选后入口真的从侧栏消失（不是只变灰）；
 * - 整组被收起时**组标题一起消失**（留一个空标题比留一个空组更乱）；
 * - 「设置」「更多」永远在，用户不可能把自己锁在门外。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import NavRail from '@/components/layout/NavRail.vue';
import { showAllRailEntries, toggleRailEntry } from '@core/rail-prefs';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/chat', name: 'chat2', component: { template: '<div />' } },
      { path: '/story', name: 'story', component: { template: '<div />' } },
      { path: '/databank', name: 'databank', component: { template: '<div />' } },
      { path: '/random-events', name: 'random-events', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/community-market', name: 'community-market', component: { template: '<div />' } },
      { path: '/group', name: 'group', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/more', name: 'more', component: { template: '<div />' } },
      { path: '/guide', name: 'guide', component: { template: '<div />' } },
    ],
  });
}

async function mountRail(path = '/chat') {
  const router = makeRouter();
  await router.push(path);
  const wrapper = mount(NavRail, { global: { plugins: [router] } });
  return { wrapper, router };
}

describe('NavRail 入口显隐', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    showAllRailEntries();
  });

  it('默认 15 个入口、4 个组标题', async () => {
    const { wrapper } = await mountRail();
    expect(wrapper.findAll('.nav-item')).toHaveLength(15);
    expect(wrapper.findAll('.nav-group-label').map((n) => n.text())).toEqual(['会话', '创作', '能力', '历史']);
  });

  it('隐藏单个入口后它真的不在 DOM 里，组标题仍在（组里还有别的）', async () => {
    toggleRailEntry('story');
    const { wrapper } = await mountRail();
    expect(wrapper.find('[data-rel-jump="nav-story"]').exists()).toBe(false);
    expect(wrapper.findAll('.nav-item')).toHaveLength(14);
    expect(wrapper.text()).toContain('创作');
  });

  it('整组被收起时组标题一起消失', async () => {
    for (const id of ['character', 'worldbook', 'databank', 'story', 'random-events', 'market'] as const) {
      toggleRailEntry(id);
    }
    const { wrapper } = await mountRail();
    const captions = wrapper.findAll('.nav-group-label').map((n) => n.text());
    expect(captions).not.toContain('创作');
    expect(captions).toEqual(['会话', '能力', '历史']);
  });

  it('设置与更多藏不掉', async () => {
    toggleRailEntry('settings');
    toggleRailEntry('more');
    const { wrapper } = await mountRail();
    expect(wrapper.find('[data-rel-jump="nav-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-rel-jump="nav-more"]').exists()).toBe(true);
  });

  it('激活项带 .active（背景填充样式由 layout.css 负责，这里只断言状态类）', async () => {
    const { wrapper } = await mountRail('/story');
    const active = wrapper.find('.nav-item.active');
    expect(active.attributes('data-rel-jump')).toBe('nav-story');
    expect(active.attributes('aria-current')).toBe('page');
  });
});
