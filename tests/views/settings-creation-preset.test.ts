/**
 * SettingsModelPanel — MODEL-03 创作模式（Preset）UI 组件测试
 *
 * 覆盖（对应 creation-preset.ts 三条验收的 UI 侧）：
 * - 四个创作模式选项渲染（自由/均衡/严谨/自定义，i18n 文案）
 * - 默认选中 balanced，实际生效参数表展示 topP/上下文预算/状态块输出及来源标注
 * - 切换 strict：settings store 状态更新，参数表逐字段更新（0.8 / 0.3 / 85% / 要求输出）
 * - 切换 custom：参数表隐藏，展示"不套用建议值"提示
 * - 切换后弹出成功 Toast
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import SettingsModelPanel from '@/components/settings/SettingsModelPanel.vue';
import { useSettingsStore } from '@/stores/settings';
import { t } from '@/i18n';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/chat' },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/local-model', name: 'local-model', component: { template: '<div />' } },
    ],
  });
}

async function mountPanel() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createTestRouter();
  const wrapper = mount(SettingsModelPanel, {
    global: { plugins: [pinia, router] },
  });
  await flushPromises();
  return { wrapper, settings: useSettingsStore() };
}

function presetRadios(wrapper: Awaited<ReturnType<typeof mountPanel>>['wrapper']) {
  return wrapper.findAll('input[name="creation-preset"]');
}

describe('SettingsModelPanel 创作模式（Preset）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('渲染四个创作模式选项（i18n 文案）', async () => {
    const { wrapper } = await mountPanel();
    const radios = presetRadios(wrapper);
    expect(radios).toHaveLength(4);
    const labels = wrapper.findAll('.preset-option-label').map((n) => n.text());
    for (const id of ['free', 'balanced', 'strict', 'custom'] as const) {
      expect(labels).toContain(t(`preset.${id}.label`));
    }
  });

  it('默认 balanced：radio 选中，参数表展示 topP 0.9 / 预算 100% / 不要求状态块', async () => {
    const { wrapper, settings } = await mountPanel();
    expect(settings.creationPreset).toBe('balanced');
    const checked = presetRadios(wrapper).find((r) => (r.element as HTMLInputElement).checked);
    expect(checked?.attributes('value')).toBe('balanced');

    const rows = wrapper.findAll('.preset-param-row').map((n) => n.text());
    expect(wrapper.find('.preset-inspect-title').text()).toBe(t('preset.inspectTitle'));
    expect(rows.some((s) => s.includes(t('modelPanel.topPLabel')) && s.includes('0.9'))).toBe(true);
    expect(
      rows.some((s) => s.includes(t('preset.contextBudget')) && s.includes(t('preset.contextBudgetPercent', { percent: 100 })))
    ).toBe(true);
    expect(rows.some((s) => s.includes(t('preset.statusInstruction')) && s.includes(t('preset.statusOff')))).toBe(true);
    // balanced：topP / 预算 / 状态块由预设提供（3 个"来自预设"），两个 penalty 沿用用户设置
    expect(wrapper.findAll('.preset-param-source.is-preset').length).toBe(3);
    expect(wrapper.findAll('.preset-param-source').length).toBe(5);
  });

  it('切换 strict：store 更新，参数表逐字段更新为严谨档建议值', async () => {
    const { wrapper, settings } = await mountPanel();
    const strictRadio = presetRadios(wrapper).find((r) => r.attributes('value') === 'strict');
    expect(strictRadio).toBeDefined();
    await strictRadio!.setValue();
    await flushPromises();

    expect(settings.creationPreset).toBe('strict');
    const rows = wrapper.findAll('.preset-param-row').map((n) => n.text());
    expect(rows.some((s) => s.includes(t('modelPanel.topPLabel')) && s.includes('0.8'))).toBe(true);
    expect(rows.some((s) => s.includes(t('modelPanel.presencePenaltyLabel')) && s.includes('0.3'))).toBe(true);
    expect(rows.some((s) => s.includes(t('modelPanel.frequencyPenaltyLabel')) && s.includes('0.3'))).toBe(true);
    expect(
      rows.some((s) => s.includes(t('preset.contextBudgetPercent', { percent: 85 })))
    ).toBe(true);
    expect(rows.some((s) => s.includes(t('preset.statusOn')))).toBe(true);
    // 切换成功 Toast（Teleport 到 body，需查 document）
    await flushPromises();
    expect(document.body.textContent).toContain(t('preset.applied', { name: t('preset.strict.label') }));
  });

  it('切换 custom：参数表隐藏，展示自定义模式提示', async () => {
    const { wrapper, settings } = await mountPanel();
    const customRadio = presetRadios(wrapper).find((r) => r.attributes('value') === 'custom');
    await customRadio!.setValue();
    await flushPromises();

    expect(settings.creationPreset).toBe('custom');
    expect(wrapper.find('.preset-inspect').exists()).toBe(false);
    expect(wrapper.text()).toContain(t('preset.customHint'));
  });
});
