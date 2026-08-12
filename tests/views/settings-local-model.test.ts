/**
 * SettingsView — 设置分类侧边栏 + 本地模型统一管理（第9条）组件测试
 *
 * 覆盖：
 * - 浮动侧边栏：分类渲染、默认选中「外观」、点击切换
 * - 云端/本地模型 tab 切换
 * - 本地模型列表渲染（注册表 5 个模型 + local 徽章 + 规模徽章）
 * - 引擎不可用时加载按钮禁用
 * - 添加到配置 → 生成 provider='local' 的 ApiProfile（去重）
 * - 检测引擎 → 无 WebGPU 环境给出能力结果与错误提示
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import SettingsView from '@/views/SettingsView.vue';
import { useSettingsStore } from '@/stores/settings';
import { useLocalModelStore } from '@/stores/local-model';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/chat' },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  });
}

/** 挂载设置页，返回 wrapper 与共享 pinia store */
async function mountSettings() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createTestRouter();
  const wrapper = mount(SettingsView, {
    global: { plugins: [pinia, router] },
  });
  await wrapper.vm.$nextTick();
  await flushPromises();
  return {
    wrapper,
    settings: useSettingsStore(),
    localModelStore: useLocalModelStore(),
  };
}

type SettingsFixture = Awaited<ReturnType<typeof mountSettings>>;

/** 点击浮动侧边栏中的分类 */
async function clickCategory(wrapper: SettingsFixture['wrapper'], label: string) {
  const btn = wrapper
    .findAll('.settings-nav-item')
    .find((b) => b.text().includes(label));
  expect(btn, `侧边栏分类「${label}」应存在`).toBeTruthy();
  await btn!.trigger('click');
  await wrapper.vm.$nextTick();
}

/** 点击模型管理区内的 tab（云端/本地） */
async function clickMgmtTab(wrapper: SettingsFixture['wrapper'], name: string) {
  const tabs = wrapper.find('.model-mgmt-tabs');
  const btn = tabs
    .findAll('button')
    .find((b) => b.text().includes(name));
  expect(btn, `模型管理 tab「${name}」应存在`).toBeTruthy();
  await btn!.trigger('click');
  await wrapper.vm.$nextTick();
}

describe('SettingsView 设置分类侧边栏 + 本地模型统一管理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('侧边栏渲染全部分类，默认选中「外观」并展示主题内容', async () => {
    const { wrapper } = await mountSettings();

    const items = wrapper.findAll('.settings-nav-item');
    expect(items.length).toBe(6);
    const labels = items.map((b) => b.text());
    for (const label of ['外观', '模型', '扩展', '个人', '数据', '安全']) {
      expect(labels.some((t) => t.includes(label))).toBe(true);
    }

    // 默认外观分类：主题卡片可见
    const active = wrapper.find('.settings-nav-item.active');
    expect(active.text()).toContain('外观');
    expect(wrapper.findAll('.theme-card').length).toBeGreaterThan(0);
  });

  it('点击「模型」分类后展示云端/本地模型管理，本地 tab 渲染全部注册模型', async () => {
    const { wrapper, localModelStore } = await mountSettings();
    await clickCategory(wrapper, '模型');

    // 云端 tab 默认激活，本地模型不可见
    expect(wrapper.find('.model-mgmt-tabs').text()).toContain('云端模型');
    expect(wrapper.find('.model-mgmt-tabs').text()).toContain('本地模型');

    await clickMgmtTab(wrapper, '本地模型');
    const rows = wrapper.findAll('.model-mgmt-list .profile-item');
    expect(rows.length).toBe(localModelStore.models.length);
    expect(rows.length).toBe(5);
    expect(wrapper.text()).toContain('Qwen2.5 0.5B');
    expect(wrapper.text()).toContain('local');
    expect(wrapper.text()).toContain('下载 540MB');
  });

  it('引擎不可用（jsdom 无 WebGPU）时加载按钮禁用', async () => {
    const { wrapper, localModelStore } = await mountSettings();
    expect(localModelStore.isAvailable).toBe(false);
    await clickCategory(wrapper, '模型');
    await clickMgmtTab(wrapper, '本地模型');

    const loadBtn = wrapper.find('[aria-label="加载本地模型 Qwen2.5 0.5B"]');
    expect(loadBtn.exists()).toBe(true);
    expect(loadBtn.attributes('disabled')).toBeDefined();
  });

  it('添加到配置 → 生成 provider=local 的 ApiProfile（重复添加去重）', async () => {
    const { wrapper, settings } = await mountSettings();
    await clickCategory(wrapper, '模型');
    await clickMgmtTab(wrapper, '本地模型');

    await wrapper
      .find('[aria-label="将本地模型 Qwen2.5 0.5B 添加到模型配置"]')
      .trigger('click');
    await flushPromises();

    expect(settings.apiProfiles).toHaveLength(1);
    expect(settings.apiProfiles[0].provider).toBe('local');
    expect(settings.apiProfiles[0].model).toBe('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    expect(settings.apiProfiles[0].name).toContain('本地·Qwen2.5 0.5B');

    // 重复添加不产生新配置
    await wrapper
      .find('[aria-label="将本地模型 Qwen2.5 0.5B 添加到模型配置"]')
      .trigger('click');
    await flushPromises();
    expect(settings.apiProfiles).toHaveLength(1);
  });

  it('检测引擎 → 无 WebGPU 环境下记录能力结果并提示', async () => {
    const { wrapper, localModelStore } = await mountSettings();
    await clickCategory(wrapper, '模型');
    await clickMgmtTab(wrapper, '本地模型');

    const detectBtn = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === '检测引擎');
    expect(detectBtn).toBeTruthy();
    await detectBtn!.trigger('click');
    await flushPromises();

    expect(localModelStore.capability).not.toBeNull();
    expect(localModelStore.isAvailable).toBe(false);
    expect(localModelStore.lastError).toContain('WebGPU');
    expect(wrapper.find('.field-error').exists()).toBe(true);
    expect(wrapper.find('.local-engine-status').text()).toContain('引擎不可用');
  });
});
