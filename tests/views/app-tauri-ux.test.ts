/**
 * App.vue — 断网提示与拖拽导入 (T-15) 组件测试
 *
 * 覆盖：
 * - offline 事件触发断网提示条,online 恢复后消失
 * - 拖拽覆盖层:Files 拖入显示,dragleave 归零后隐藏
 * - 拖拽 JSON 导入:先试角色卡再试世界书,提示导入结果
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const mocks = vi.hoisted(() => ({
  importV2File: vi.fn(),
  importLorebookFile: vi.fn(),
  persistCharacter: vi.fn(),
  importCharacterPng: vi.fn(),
}));

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({}) }));
vi.mock('@/stores/chat', () => ({ useChatStore: () => ({}) }));
vi.mock('@/stores/character', () => ({
  useCharacterStore: () => ({
    characters: [],
    importV2File: mocks.importV2File,
    persistCharacter: mocks.persistCharacter,
  }),
}));
vi.mock('@/stores/lorebook', () => ({
  useLorebookStore: () => ({ importLorebookFile: mocks.importLorebookFile }),
}));
vi.mock('@/stores/group-chat', () => ({ useGroupChatStore: () => ({}) }));
vi.mock('@/stores/persona', () => ({ usePersonaStore: () => ({}) }));
vi.mock('@/stores/data-bank', () => ({ useDataBankStore: () => ({}) }));
vi.mock('@/stores/story', () => ({ useStoryStore: () => ({}) }));
vi.mock('@/stores/community-market', () => ({ useCommunityMarketStore: () => ({}) }));
vi.mock('@/stores/character-version', () => ({ useCharacterVersionStore: () => ({}) }));
vi.mock('@/services/backup-service', () => ({
  importCharacterPng: mocks.importCharacterPng,
}));
vi.mock('@/services/type-adapters', () => ({
  cardToUiChar: (card: unknown) => card,
}));
vi.mock('@storage/storage-factory', () => ({
  getStorageAdapter: () => null,
  getStorageEnv: () => 'web',
}));
vi.mock('@storage/tauri-fs-adapter', () => ({ TauriFSAdapter: class {} }));

import App from '@/App.vue';

async function mountApp(pinia: Pinia) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  const wrapper = mount(App, {
    global: {
      plugins: [pinia, router],
      stubs: { NavRail: true, MasterPasswordModal: true, Icon: true, RouterView: true },
    },
    attachTo: document.body,
  });
  await wrapper.vm.$nextTick();
  await flushPromises();
  return wrapper;
}

describe('App.vue 断网与拖拽 (T-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('offline/online 事件切换断网提示条', async () => {
    const wrapper = await mountApp(createPinia());
    expect(wrapper.find('.offline-notice').exists()).toBe(false);

    window.dispatchEvent(new Event('offline'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.offline-notice').exists()).toBe(true);

    window.dispatchEvent(new Event('online'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.offline-notice').exists()).toBe(false);
    wrapper.unmount();
  });

  it('拖入文件显示覆盖层,全部离开后隐藏', async () => {
    const wrapper = await mountApp(createPinia());
    expect(wrapper.find('.drag-overlay').exists()).toBe(false);

    const enterEv = new Event('dragenter');
    Object.assign(enterEv, { dataTransfer: { types: ['Files'] } });
    window.dispatchEvent(enterEv);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.drag-overlay').exists()).toBe(true);

    window.dispatchEvent(new Event('dragleave'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.drag-overlay').exists()).toBe(false);
    wrapper.unmount();
  });

  it('拖拽 JSON:先试角色卡,失败回退世界书', async () => {
    mocks.importV2File.mockResolvedValue(null); // 非角色卡
    mocks.importLorebookFile.mockResolvedValue('lb-1');
    const wrapper = await mountApp(createPinia());

    const file = new File(['{}'], 'world.json', { type: 'application/json' });
    const dropEv = new Event('drop');
    Object.assign(dropEv, { dataTransfer: { files: [file] } });
    window.dispatchEvent(dropEv);
    await flushPromises();

    expect(mocks.importV2File).toHaveBeenCalledWith(file);
    expect(mocks.importLorebookFile).toHaveBeenCalledWith(file);
    // 成功提示
    expect(wrapper.find('.platform-notice').text()).toContain('已通过拖拽导入 1 个文件');
    wrapper.unmount();
  });
});