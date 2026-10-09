/**
 * 角色编辑器的字段外壳接线（M6-b2）
 *
 * 这批把 8 个"标签+控件+说明"块接进 FormField，收益全部是**看不见的**
 * （aria-describedby、role=group、必填的读屏文本）——axe 也不查"说明有没有和控件
 * 关联"。所以这里直接钉结构：说明段必须被某个控件的 aria-describedby 指到，
 * 标签必须关联得到控件，必填必须有无障碍文本。
 * 没有这份断言，下一次有人手写回 `<label>` + `<p class="field-hint">` 是无声无息的。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CharacterEditorView from '@/views/CharacterEditorView.vue';
import { t } from '@/i18n';

async function mountEditor() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/:id/edit', name: 'character-edit', component: { template: '<div />' } },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
    ],
  });
  await router.push('/character/seraphina/edit');
  await router.isReady();
  return mount(CharacterEditorView, {
    props: { id: 'seraphina' },
    global: { plugins: [router], stubs: { Modal: true, Toast: true } },
    attachTo: document.body,
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

describe('角色编辑器字段接线', () => {
  it('每条字段说明都被某个控件的 aria-describedby 指到', async () => {
    const wrapper = await mountEditor();
    const hints = wrapper.findAll('.form-field-hint');

    // 默认编辑态下这批块里的说明条数（温度/最大令牌等的说明在别的分支里）
    expect(hints.length).toBeGreaterThanOrEqual(5);
    const described = new Set(
      wrapper
        .findAll('[aria-describedby]')
        .flatMap((el) => String(el.attributes('aria-describedby')).split(/\s+/))
    );
    const orphans = hints.filter((hint) => !described.has(hint.attributes('id') ?? ''));
    expect(orphans.map((h) => h.text())).toEqual([]);
  });

  it('没有悬空 label：每个 label 要么 for 到控件，要么把控件包在自己里面', async () => {
    const wrapper = await mountEditor();
    const dangling = wrapper.findAll('label').filter((label) => {
      if (label.attributes('for')) return false;
      return !label.find('input, select, textarea').exists();
    });
    expect(dangling).toHaveLength(0);
  });

  it('必填：星号对读屏隐藏，另给一句"必填"文本', async () => {
    const wrapper = await mountEditor();
    const label = wrapper.find('label[for="f-name"]');

    expect(label.exists()).toBe(true);
    expect(label.find('.form-field-required').attributes('aria-hidden')).toBe('true');
    expect(label.find('.sr-only').text()).toBe(t('common.required'));
    // DOM 原生 required 也要在（浏览器自带的必填提示与保存判据都依赖它）
    expect(wrapper.find('#f-name').attributes('required')).toBeDefined();
  });

  it('属性组标题改成了分组标签，并被 aria-labelledby 引用', async () => {
    const wrapper = await mountEditor();
    // 属性段默认未启用（整段是 v-if），要先打开开关才谈得上它的分组标签
    await wrapper.find('.attr-switch input').setValue(true);
    const stats = wrapper.find('#f-stats-label');

    expect(stats.exists()).toBe(true);
    expect(wrapper.find('[aria-labelledby="f-stats-label"]').exists()).toBe(true);
    // 它不再是 label：关联不到控件的 label 是无效语义
    expect(stats.element.tagName).toBe('P');
  });

  it('渐变预设标题同样是分组标签，且切到渐变头像后仍在', async () => {
    const wrapper = await mountEditor();
    // seraphina 的头像类型是 image，这一段本身是 v-if——先按真实交互切过去
    const presets = wrapper.find('#f-gradient-presets-label');
    expect(presets.exists()).toBe(false);

    await wrapper.find('.avatar-type-switch .type-btn').trigger('click');
    expect(wrapper.find('#f-gradient-presets-label').exists()).toBe(true);
    expect(wrapper.find('[aria-labelledby="f-gradient-presets-label"]').exists()).toBe(true);
  });
});
