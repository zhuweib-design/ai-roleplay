/**
 * 设置 → 外观 里的"界面开合状态"出口（M8-b）
 *
 * 这条入口存在的理由：一次误点会让某段永远停在随手留下的状态，连"还没填就自动展开"
 * 这类规则都被顶掉，而用户没有任何地方可以退回。所以它必须
 * ① 说清现在记了几条（不是盲操作）、② 空的时候不可点、③ 点完真的清空并回到默认。
 *
 * 不用先展开"界面自定义"：`Collapse` 用 `v-show`，内容一直在 DOM 里
 * （这也是草稿不丢的前提）。反而**不能**去点它——点一下就新记一条，
 * 测的就不是"一条都没记"那个状态了。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SettingsAppearancePanel from '@/components/settings/SettingsAppearancePanel.vue';
import { useSettingsStore } from '@/stores/settings';
import { useSectionMemory } from '@/composables/useSectionMemory';
import { t } from '@/i18n';

function mountPanel() {
  return mount(SettingsAppearancePanel, { attachTo: document.body });
}

function resetButton(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAll('button').find((b) => b.text() === t('settingsView.sectionMemoryReset'));
}

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

describe('界面开合状态出口', () => {
  it('一条都没记时说明现状，按钮不可点', () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain(t('settingsView.sectionMemoryEmpty'));
    const btn = resetButton(wrapper);
    expect(btn).toBeDefined();
    expect(btn!.attributes('disabled')).toBeDefined();
  });

  it('记了状态后给出准确条数，点一下清空', async () => {
    const settings = useSettingsStore();
    useSectionMemory('probe.x', () => false).value = true;
    useSectionMemory('probe.y', () => false).value = false;
    useSectionMemory('probe.z', () => false).value = true;

    const wrapper = mountPanel();
    // 文案里带真实条数，不是"若干条"这种含糊话
    expect(wrapper.text()).toContain(t('settingsView.sectionMemoryHint', { count: 3 }));
    const btn = resetButton(wrapper)!;
    expect(btn.attributes('disabled')).toBeUndefined();

    await btn.trigger('click');
    expect(settings.uiSectionOpen).toEqual({});
  });
});
