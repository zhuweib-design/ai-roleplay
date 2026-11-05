/**
 * 空库时的「可选下载包」入口（Q2）
 *
 * 产品口径：安装包与首启**不带任何角色**，内置角色包改为可选下载包 ——
 * 用户在空库时必须有可见的来路，否则第一屏只有一个空的角色管理页。
 *
 * 这条测试钉四件事：
 * - 库空 → 出现入口，文案指向社区市场；
 * - 点它 → 真的落到社区市场（远程市场面板在那里）；
 * - 搜索无结果 → **不出现**：这时候用户要找的是关键词，不是另一份内容；
 * - 库里有角色 → 不出现（空态本来就不渲染，但入口也不该在别处冒出）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CharactersView from '@/views/CharactersView.vue';
import { useCharacterStore } from '@/stores/character';
import { seedCharacter } from '../helpers/character-fixtures';
import { t } from '@/i18n';

const ENTRY = '[data-rel-jump="characters-market-pack"]';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/new', name: 'character-new', component: { template: '<div />' } },
      { path: '/character/:id/edit', name: 'character-edit', component: { template: '<div />' } },
      { path: '/community-market', name: 'community-market', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  });
}

async function mountView() {
  const router = makeRouter();
  await router.push('/character');
  await router.isReady();
  const wrapper = mount(CharactersView, {
    global: {
      plugins: [router],
      stubs: {
        Icon: { template: '<span class="icon-stub" />' },
        Avatar: { template: '<span class="avatar-stub" />' },
        Toast: true,
        Modal: true,
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useCharacterStore();
  store.characters.length = 0;
  store.setSearchQuery('');
});

describe('空库的可选下载包入口', () => {
  it('库为空时出现入口，文案是「从社区市场下载角色包」', async () => {
    const { wrapper } = await mountView();
    const entry = wrapper.find(ENTRY);
    expect(entry.exists()).toBe(true);
    expect(entry.text()).toBe(t('characters.browseMarketPack'));
  });

  it('点入口落到社区市场', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find(ENTRY).trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('community-market');
  });

  it('搜索无结果时不出现（此时用户要找的是关键词）', async () => {
    const store = useCharacterStore();
    store.setSearchQuery('不存在的角色名');
    const { wrapper } = await mountView();
    expect(wrapper.find(ENTRY).exists()).toBe(false);
    expect(wrapper.text()).toContain(t('characters.emptySearch'));
  });

  it('库里有角色时没有空态入口', async () => {
    const store = useCharacterStore();
    seedCharacter(store, { id: 'has-one' }, false);
    const { wrapper } = await mountView();
    expect(wrapper.find(ENTRY).exists()).toBe(false);
  });
});
