/**
 * HelpTip / FormField 原语（M3-b1）
 *
 * 这两个原语存在的理由就是修两类老毛病，所以断言全押在关联上：
 * - HelpTip：`title=` 的说明键盘与读屏拿不到 ⇒ 触发器必须是真按钮 + aria-describedby 指得准。
 * - FormField：标签、说明、报错各写各的 ⇒ label 的 for、控件的 aria-describedby、
 *   报错的 role=alert 三者必须能对上号。
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HelpTip from '@/components/common/HelpTip.vue';
import FormField from '@/components/common/FormField.vue';
import { t } from '@/i18n';

describe('HelpTip', () => {
  function mountTip() {
    return mount(HelpTip, { props: { textKey: 'ctx.authorTitle', fallback: '作者笔记' } });
  }

  it('触发器是可聚焦的按钮，且 aria-describedby 指向气泡本体', () => {
    const wrapper = mountTip();
    const trigger = wrapper.find('button.help-tip-trigger');
    const bubble = wrapper.find('[role="tooltip"]');

    expect(trigger.exists()).toBe(true);
    expect(trigger.text()).toContain('作者笔记');
    expect(bubble.text()).toBe(t('ctx.authorTitle'));
    expect(trigger.attributes('aria-describedby')).toBe(bubble.attributes('id'));
  });

  it('键盘聚焦即显示，失焦收起（不依赖悬停）', async () => {
    const wrapper = mountTip();
    expect(wrapper.find('.help-tip').classes()).not.toContain('open');

    await wrapper.find('button').trigger('focus');
    expect(wrapper.find('.help-tip').classes()).toContain('open');

    await wrapper.find('button').trigger('blur');
    expect(wrapper.find('.help-tip').classes()).not.toContain('open');
  });

  it('气泡不用 display:none 藏（那样 aria-describedby 读不到内容）', () => {
    const style = mountTip().find('[role="tooltip"]').attributes('class') ?? '';
    expect(style).toContain('help-tip-bubble');
    // 结构始终存在，靠 visibility 控制可见性
    expect(mountTip().find('[role="tooltip"]').exists()).toBe(true);
  });

  it('触屏无悬停：点击也能开合', async () => {
    const wrapper = mountTip();
    await wrapper.find('button').trigger('click');
    expect(wrapper.find('.help-tip').classes()).toContain('open');
    await wrapper.find('button').trigger('click');
    expect(wrapper.find('.help-tip').classes()).not.toContain('open');
  });
});

describe('FormField', () => {
  function mountField(props: Record<string, unknown> = {}) {
    return mount(FormField, {
      props: { labelKey: 'charEdit.nameLabel', ...props },
      slots: {
        default: `<input :id="id" :aria-describedby="describedBy" :aria-invalid="String(invalid)" />`,
      },
    });
  }

  it('label 的 for 与插槽给出的控件 id 一致', () => {
    const wrapper = mountField();
    const control = wrapper.find('input');
    expect(wrapper.find('label').attributes('for')).toBe(control.attributes('id'));
    expect(control.attributes('id')).toBeTruthy();
  });

  it('hintText 让"说明随选项而变"的字段也能接进 aria-describedby', () => {
    // 世界书事件面板的触发方式就是这种：每种方式各有一句解释，写不成固定 i18n 键。
    // 没有这个入口时它只能是个裸 <span>，读屏念标签带不到说明。
    const wrapper = mountField({ hintText: '关键词命中即注入' });
    const hint = wrapper.find('.form-field-hint');
    const control = wrapper.find('input');
    expect(hint.text()).toBe('关键词命中即注入');
    expect(
      (control.attributes('aria-describedby') ?? '').split(/\s+/)
    ).toContain(hint.attributes('id'));

    // 反证：不传 hintText 时不该凭空造一个空说明节点，也不该留悬空引用
    const bare = mountField();
    expect(bare.find('.form-field-hint').exists()).toBe(false);
    expect(bare.find('input').attributes('aria-describedby') ?? '').toBe('');
  });

  it('polite 把报错从打断式 alert 改成礼貌播报', () => {
    const loud = mountField({ errorText: '说明文字' });
    expect(loud.find('.form-field-error').attributes('role')).toBe('alert');

    const quiet = mountField({ errorText: '说明文字', polite: true });
    expect(quiet.find('.form-field-error').attributes('role')).toBe('status');
    // 播报方式换了，关联不能丢：控件仍要指得到这句报错
    expect(
      (quiet.find('input').attributes('aria-describedby') ?? '').split(/\s+/)
    ).toContain(quiet.find('.form-field-error').attributes('id'));
  });

  it('说明与报错都挂进 aria-describedby，报错带 role=alert', () => {
    const wrapper = mountField({ hintKey: 'ctx.tokenHint', errorText: '名称不能为空' });
    const described = (wrapper.find('input').attributes('aria-describedby') ?? '').split(' ');
    const hintId = wrapper.find('.form-field-hint').attributes('id');
    const errorId = wrapper.find('.form-field-error').attributes('id');

    expect(described).toContain(hintId);
    expect(described).toContain(errorId);
    expect(wrapper.find('.form-field-error').attributes('role')).toBe('alert');
    expect(wrapper.find('.form-field').classes()).toContain('has-error');
  });

  it('没有说明也没有报错时，不留下空的 aria-describedby', () => {
    const wrapper = mountField();
    expect(wrapper.find('input').attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.find('.form-field-hint').exists()).toBe(false);
    expect(wrapper.find('.form-field-error').exists()).toBe(false);
  });

  it('必填项：星号对读屏隐藏，另给可读的"必填"', () => {
    const wrapper = mountField({ required: true });
    expect(wrapper.find('.form-field-required').attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('.sr-only').text()).toBe(t('common.required'));
  });

  it('非必填且提供 optional 插槽时，显示"（可选）"', () => {
    const wrapper = mount(FormField, {
      props: { labelKey: 'charEdit.nameLabel' },
      slots: { default: '<input :id="id" />', optional: '<span />' },
    });
    expect(wrapper.find('.form-field-optional').text()).toBe(t('common.optional'));
  });

  it('label-extra 插槽渲染在 label 内部（"温度 [1.00]"这类带实时值的标签）', () => {
    const wrapper = mount(FormField, {
      props: { labelKey: 'charEdit.temperatureLabel', required: true },
      slots: {
        default: '<input :id="id" />',
        'label-extra': '<span class="value-badge">1.00</span>',
      },
    });
    const badge = wrapper.find('.value-badge');
    const label = wrapper.find('label');

    expect(badge.exists()).toBe(true);
    // 在 label 里面，读屏念标签时会连着当前值一起念；放外面就只剩"温度"
    expect(label.element.contains(badge.element)).toBe(true);
    // 值在星号之前：星号是标签的结尾，读起来才是"温度 1.00 必填"
    const html = label.element.innerHTML;
    expect(html.indexOf('value-badge')).toBeLessThan(html.indexOf('form-field-required'));
  });
});
