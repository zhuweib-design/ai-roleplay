/**
 * Collapse 原语（M4-b2）
 *
 * 最要紧的一条：折叠必须是 v-show。设置面板里全是"输入到一半"的草稿
 * （自定义 CSS、选了一半的采样参数），用 v-if 收起就等于把用户写的东西扔掉；
 * 而 `tests/setup.ts` 里那句"各分区 v-show 保留草稿状态"是设置页一直在守的既有契约。
 * 其余都是 aria 接线：aria-expanded / aria-controls / aria-labelledby 必须互相对得上，
 * 且标题层级不能因为折叠而变（页面的 heading 顺序是 axe 的 heading-order 规则在看的）。
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Collapse from '@/components/common/Collapse.vue';
import { t } from '@/i18n';

function mountCollapse(props: Record<string, unknown> = {}) {
  return mount(Collapse, {
    props: { titleKey: 'settingsView.uiCustomSection', ...props },
    slots: { default: '<input id="probe-input" value="写到一半的草稿" />' },
  });
}

/**
 * 用面板的行内 display 判断收起与否，不用 wrapper.isVisible()。
 * v-show 的实现就是往节点上写 style.display='none'（收起）/ 还原原值（展开），
 * 读它就是读契约本身。isVisible() 走 jsdom 的 getComputedStyle，实测会返回上一次
 * 缓存的值：点开展开后仍报 false，红得毫无道理。
 */
function collapsed(wrapper: ReturnType<typeof mountCollapse>) {
  const panel = wrapper.find('.collapse-panel').element as HTMLElement;
  return panel.style.display === 'none';
}

describe('展开与收起', () => {
  it('默认展开：aria-expanded=true，面板可见', () => {
    const wrapper = mountCollapse();
    const toggle = wrapper.find('button.collapse-toggle');

    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(collapsed(wrapper)).toBe(false);
  });

  it('defaultOpen=false：面板隐藏但仍在 DOM 里（v-show，不是 v-if）', () => {
    const wrapper = mountCollapse({ defaultOpen: false });
    const toggle = wrapper.find('button.collapse-toggle');

    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(collapsed(wrapper)).toBe(true);
    // 这一条是 v-show 的实质证据：节点存在，草稿值也还在
    expect(wrapper.find('#probe-input').exists()).toBe(true);
    expect(wrapper.find('#probe-input').attributes('value')).toBe('写到一半的草稿');
  });

  it('点一下切换开合，aria-expanded 与面板同步', async () => {
    const wrapper = mountCollapse();
    const toggle = wrapper.find('button.collapse-toggle');

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(collapsed(wrapper)).toBe(true);

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(collapsed(wrapper)).toBe(false);
  });

  it('收起再展开不换节点：输入框还是同一个 DOM 元素，草稿和焦点不丢', async () => {
    const wrapper = mountCollapse();
    const before = wrapper.find('#probe-input').element;

    await wrapper.find('button.collapse-toggle').trigger('click');
    await wrapper.find('button.collapse-toggle').trigger('click');

    expect(wrapper.find('#probe-input').element).toBe(before);
  });
});

describe('aria 接线', () => {
  it('aria-controls 指向的面板 id 真实存在，section 的 aria-labelledby 指向标题', () => {
    const wrapper = mountCollapse();
    const toggle = wrapper.find('button.collapse-toggle');
    const panelId = toggle.attributes('aria-controls');
    const headingId = wrapper.find('.collapse-section').attributes('aria-labelledby');

    expect(panelId).toBeTruthy();
    expect(wrapper.find(`#${panelId}`).exists()).toBe(true);
    expect(wrapper.find(`#${headingId}`).exists()).toBe(true);
    expect(wrapper.find(`#${headingId}`).element.tagName).toBe('H2');
  });

  it('level=3 时标题渲染成 h3（块内小段用），不改变可折叠行为', () => {
    const wrapper = mountCollapse({ level: 3, defaultOpen: false });
    expect(wrapper.find('.collapse-heading').element.tagName).toBe('H3');
    expect(wrapper.find('button.collapse-toggle').attributes('aria-expanded')).toBe('false');
  });

  it('advanced 才显示"高级"标，并解释这一段为什么默认收起', () => {
    expect(mountCollapse().find('.collapse-advanced-tag').exists()).toBe(false);
    expect(mountCollapse({ advanced: true }).find('.collapse-advanced-tag').text()).toBe(t('common.advanced'));
  });

  it('hintKey 传了才渲染说明', () => {
    expect(mountCollapse().find('.collapse-hint').exists()).toBe(false);
    expect(mountCollapse({ hintKey: 'settingsView.uiCustomHint' }).find('.collapse-hint').exists()).toBe(true);
  });

  it('说明在面板外面：收起时也要看得见，否则折叠就成了藏东西', () => {
    const wrapper = mountCollapse({ hintKey: 'settingsView.uiCustomHint', defaultOpen: false });
    const hint = wrapper.find('.collapse-hint').element as HTMLElement;
    const panel = wrapper.find('.collapse-panel').element as HTMLElement;

    expect(collapsed(wrapper)).toBe(true);
    expect(panel.contains(hint)).toBe(false);
  });

  it('plain 用于弹窗/表单内部：不再套一层卡片外观', () => {
    expect(mountCollapse().find('.collapse-section').classes()).not.toContain('is-plain');
    expect(mountCollapse({ plain: true }).find('.collapse-section').classes()).toContain('is-plain');
  });
});
