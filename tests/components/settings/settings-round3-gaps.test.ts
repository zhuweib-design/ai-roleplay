/**
 * 第三轮优化项 8 收尾测试 — 此前未直测的改动面：
 * 1. toast-service：FIFO 队列 / dismissToast / useActiveToast
 * 2. master-password-modal-state：跨组件共享 ref 语义
 * 3. 5 个设置分区子组件挂载冒烟（拆分后各自可独立渲染）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { showToast, useActiveToast, dismissToast } from '@/utils/toast-service';
import { mpModalOpen, mpModalMode } from '@/utils/master-password-modal-state';
import SettingsAppearancePanel from '@/components/settings/SettingsAppearancePanel.vue';
import SettingsExtensionPanel from '@/components/settings/SettingsExtensionPanel.vue';
import SettingsSecurityPanel from '@/components/settings/SettingsSecurityPanel.vue';
import SettingsDataPanel from '@/components/settings/SettingsDataPanel.vue';
import SettingsAboutPanel from '@/components/settings/SettingsAboutPanel.vue';

describe('toast-service', () => {
  beforeEach(() => {
    // 清空模块级队列
    while (useActiveToast().value) dismissToast();
  });

  it('FIFO：先入先出，dismiss 后显示下一条', () => {
    showToast('info', '第一条');
    showToast('success', '第二条');
    showToast('error', '第三条');
    expect(useActiveToast().value?.message).toBe('第一条');
    dismissToast();
    expect(useActiveToast().value?.message).toBe('第二条');
    dismissToast();
    expect(useActiveToast().value?.message).toBe('第三条');
    dismissToast();
    expect(useActiveToast().value).toBeNull();
  });

  it('空消息不入队（防御）', () => {
    showToast('info', '');
    expect(useActiveToast().value).toBeNull();
  });
});

describe('master-password-modal-state', () => {
  it('共享 ref 可读写，语义为跨组件一致状态', () => {
    expect(mpModalOpen.value).toBe(false);
    expect(mpModalMode.value).toBe('setup');
    mpModalOpen.value = true;
    mpModalMode.value = 'change';
    expect(mpModalOpen.value).toBe(true);
    expect(mpModalMode.value).toBe('change');
    mpModalOpen.value = false;
    mpModalMode.value = 'setup';
  });
});

describe('设置分区子组件挂载冒烟', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  async function mountPanel(comp: Parameters<typeof mount>[0]) {
    const wrapper = mount(comp, { global: { plugins: [createPinia()] } });
    await flushPromises();
    return wrapper;
  }

  it('AppearancePanel：渲染主题 / 字号 / 语言分区', async () => {
    const w = await mountPanel(SettingsAppearancePanel);
    expect(w.text()).toContain('主题');
    expect(w.text()).toContain('字号');
    expect(w.text()).toContain('语言');
  });

  it('ExtensionPanel：渲染扩展/优化配置分区', async () => {
    const w = await mountPanel(SettingsExtensionPanel);
    expect(w.html()).toContain('settings-section');
  });

  it('SecurityPanel：渲染主密码区块与设置按钮', async () => {
    const w = await mountPanel(SettingsSecurityPanel);
    expect(w.text()).toContain('主密码');
  });

  it('DataPanel：渲染备份 / 导入 / 持久化区块', async () => {
    const w = await mountPanel(SettingsDataPanel);
    expect(w.text()).toContain('备份');
  });

  it('AboutPanel：渲染品牌名（i18n key）与版本信息', async () => {
    const w = await mountPanel(SettingsAboutPanel);
    expect(w.text()).toContain('AI 酒馆');
  });
});
