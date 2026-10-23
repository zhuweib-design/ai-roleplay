/**
 * 底部导航高亮归属（A13 / 批次 2-2）
 *
 * 底栏此前只在主 Tab 页出现，高亮写成 `route.name === tab.name` 精确匹配就够用。
 * A13 之后底栏在二级页也在场，精确匹配会让「/character/new」「/databank」这类页面
 * 上一个 Tab 都不亮——用户看不出自己在哪一段。
 *
 * 现在的高亮口径（与 NavRail 共用 `activeEntryForRoute`）：
 * 1. 当前路由归属的入口就是某个 Tab ⇒ 亮那个 Tab（/character/new → 角色）
 * 2. 归属入口本身不在 Tab 上（数据银行/故事引擎/生图等都在「更多」里）⇒ 亮「更多」
 * 3. 精确命中当前路由标 aria-current="page"，只是所属段标 "location"
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

import BottomNav from '@/components/mobile/BottomNav.vue';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/new', name: 'character-new', component: { template: '<div />' } },
      { path: '/group', name: 'group', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/databank', name: 'databank', component: { template: '<div />' } },
      { path: '/more', name: 'more', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/', component: { template: '<div />' } },
    ],
  });
}

async function mountAt(path: string) {
  setActivePinia(createPinia());
  const router = makeRouter();
  await router.push(path);
  await router.isReady();
  return mount(BottomNav, { global: { plugins: [router, createPinia()] } });
}

function activeLabels(wrapper: Awaited<ReturnType<typeof mountAt>>): string[] {
  return wrapper.findAll('.bottom-nav-item.active').map((n) => n.text());
}

describe('底部导航高亮归属', () => {
  it('主 Tab 页：亮自己，且 aria-current=page', async () => {
    const wrapper = await mountAt('/chat');
    expect(activeLabels(wrapper)).toHaveLength(1);
    expect(activeLabels(wrapper)[0]).toContain('会话');
    expect(wrapper.find('.bottom-nav-item.active').attributes('aria-current')).toBe('page');
  });

  it('二级页归属某个 Tab 时亮父 Tab：/character/new → 角色', async () => {
    const wrapper = await mountAt('/character/new');
    expect(activeLabels(wrapper)).toHaveLength(1);
    expect(activeLabels(wrapper)[0]).toContain('角色');
    // 不是精确命中，标 location 而不是 page
    expect(wrapper.find('.bottom-nav-item.active').attributes('aria-current')).toBe('location');
  });

  it('二级页归属的入口不在 Tab 上时亮「更多」：/databank → 更多', async () => {
    const wrapper = await mountAt('/databank');
    expect(activeLabels(wrapper)).toHaveLength(1);
    expect(activeLabels(wrapper)[0]).toContain('更多');
  });

  it('世界书退出 Tab 后（A12），进入它亮「更多」而不是一个不存在的 Tab', async () => {
    const wrapper = await mountAt('/worldbook');
    expect(activeLabels(wrapper)).toHaveLength(1);
    expect(activeLabels(wrapper)[0]).toContain('更多');
  });

  it('高亮永远只有一项（多亮等于没有高亮）', async () => {
    for (const path of ['/chat', '/character', '/character/new', '/group', '/databank', '/more', '/settings']) {
      const wrapper = await mountAt(path);
      expect(activeLabels(wrapper), `${path} 的高亮项数不对`).toHaveLength(1);
    }
  });
});
