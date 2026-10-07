/**
 * E20 的界面半段：安装完成后必须出现可点的结果条
 *
 * store 侧的契约（返回新角色 id）由 `tests/stores/community-market-install.test.ts` 覆盖；
 * 这里覆盖"用户看得见、点得动"：banner 文案带角色名、两个按钮分别落到
 * 角色编辑（带 `?from=`）与角色列表。远程清单需要真实市场 URL，e2e 里拿不到，
 * 因此在视图层用桩替换 `installRemoteItem`，其余渲染与跳转逻辑都走真实实现。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CommunityMarketView from '@/views/CommunityMarketView.vue';
import { useCommunityMarketStore } from '@/stores/community-market';
import { useCharacterStore } from '@/stores/character';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/community-market', name: 'community-market', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/:id/edit', name: 'character-edit', component: { template: '<div />' } },
    ],
  });
}

async function mountMarketWithStubInstall(installedId: string | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCommunityMarketStore();
  // 真实安装要下载远程清单（build-time URL），这里只桩这一个动作，其余保持真实
  store.installRemoteItem = async () => {
    if (installedId) {
      useCharacterStore().characters.push({ id: installedId, name: '远道而来的角色' } as never);
    }
    return installedId;
  };
  store.remoteItems.push({
    id: 'i1',
    name: '远道而来的角色',
    type: 'character',
    version: '1.0.0',
    author: 'someone',
    size: 128,
    sha256: 'x',
    url: 'https://example.test/i1.json',
    description: '',
  } as never);

  const router = makeRouter();
  await router.push('/community-market');
  const wrapper = mount(CommunityMarketView, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('市场安装结果可见可跳（E20 · 界面）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('安装成功后出现带角色名的结果条，并可点进该角色的编辑页（带来源）', async () => {
    const { wrapper, router } = await mountMarketWithStubInstall('remote-42');

    await wrapper.find('.remote-install').trigger('click');
    await flushPromises();

    const banner = wrapper.find('.installed-result');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('远道而来的角色');

    await banner.find('[data-rel-jump="rel-market-edit"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('character-edit');
    expect(router.currentRoute.value.params.id).toBe('remote-42');
    expect(router.currentRoute.value.query.from).toBe('/community-market');
  });

  it('第二个按钮去角色列表；安装失败时不显示结果条', async () => {
    const { wrapper, router } = await mountMarketWithStubInstall('remote-42');
    await wrapper.find('.remote-install').trigger('click');
    await flushPromises();
    await wrapper.find('[data-rel-jump="rel-market-chars"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('character-list');

    const failed = await mountMarketWithStubInstall(null);
    await failed.wrapper.find('.remote-install').trigger('click');
    await flushPromises();
    expect(failed.wrapper.find('.installed-result').exists()).toBe(false);
  });
});
