/**
 * v-tip 指令（§七 #14）
 *
 * 它替代的是原生 `title=`，所以守的是"原生 title 做不到的那几件事"：
 * 键盘聚焦能看到、读屏能拿到（aria-describedby 指向常驻节点）、
 * 值随绑定更新、组件卸载后不留一堆挂在 body 上的孤儿节点。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, ref, withDirectives } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { vTip } from '@core/tip';

function host(value = '一段只有悬停能看到的说明') {
  const text = ref(value);
  const Comp = defineComponent({
    setup: () => () =>
      withDirectives(h('button', { class: 'probe', title: value }, '按钮'), [[vTip, text.value]]),
  });
  return { text, wrapper: mount(Comp), Comp };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

function bubbles() {
  return Array.from(document.querySelectorAll('.tk-tip'));
}

describe('挂载', () => {
  it('生成一个挂在 body 上的 tooltip 节点，并把宿主接成 aria-describedby', () => {
    const { wrapper } = host('提示内容');
    const probe = wrapper.find('.probe').element;
    const list = bubbles();

    expect(list).toHaveLength(1);
    expect(list[0]!.getAttribute('role')).toBe('tooltip');
    expect(list[0]!.textContent).toBe('提示内容');
    expect(probe.getAttribute('aria-describedby')).toBe(list[0]!.id);
  });

  it('原生 title 被摘掉（否则同一提示会出现两套）', () => {
    const { wrapper } = host();
    expect(wrapper.find('.probe').attributes('title')).toBeUndefined();
  });

  it('空值不生成气泡，也不接管 aria-describedby', () => {
    const { wrapper } = host('');
    wrapper.find('.probe').element.setAttribute('title', '');
    const empty = mount(
      defineComponent({
        setup: () => () => withDirectives(h('span', { class: 'probe2' }, 'x'), [[vTip, '']]),
      })
    );
    expect(bubbles()).toHaveLength(0);
    expect(empty.find('.probe2').attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.exists()).toBe(true);
  });

  it('多个宿主各自拿到唯一 id（v-for 场景不能全部指到第一个）', () => {
    const multi = mount(
      defineComponent({
        setup: () => () =>
          h(
            'div',
            {},
            ['a', 'b', 'c'].map((k) =>
              withDirectives(h('button', { class: `m-${k}` }, k), [[vTip, `说明 ${k}`]])
            )
          ),
      })
    );
    const ids = ['a', 'b', 'c'].map((k) => multi.find(`.m-${k}`).attributes('aria-describedby'));
    expect(new Set(ids).size).toBe(3);
    expect(bubbles()).toHaveLength(3);
  });
});

describe('可见性', () => {
  it('键盘聚焦显示、失焦收起', async () => {
    const { wrapper } = host();
    const probe = wrapper.find('.probe').element;
    probe.dispatchEvent(new FocusEvent('focus'));
    await flushPromises();
    expect(bubbles()[0]!.classList.contains('is-visible')).toBe(true);

    probe.dispatchEvent(new FocusEvent('blur'));
    await flushPromises();
    expect(bubbles()[0]!.classList.contains('is-visible')).toBe(false);
  });

  it('Esc 立即收起（键盘用户要能关掉）', async () => {
    const { wrapper } = host();
    const probe = wrapper.find('.probe').element;
    probe.dispatchEvent(new FocusEvent('focus'));
    expect(bubbles()[0]!.classList.contains('is-visible')).toBe(true);

    probe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(bubbles()[0]!.classList.contains('is-visible')).toBe(false);
  });
});

describe('更新与卸载', () => {
  it('绑定值变化时气泡文案跟随', async () => {
    const text = ref('第一版');
    const wrapper = mount(
      defineComponent({
        setup: () => () => withDirectives(h('button', { class: 'probe' }, 'x'), [[vTip, text.value]]),
      })
    );
    expect(bubbles()[0]!.textContent).toBe('第一版');
    text.value = '第二版';
    await flushPromises();
    expect(bubbles()[0]!.textContent).toBe('第二版');
    expect(wrapper.find('.probe').attributes('title')).toBeUndefined();
  });

  it('宿主卸载后气泡节点被移除（不泄漏 body 子节点）', async () => {
    const show = ref(true);
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          show.value
            ? withDirectives(h('button', { class: 'probe' }, 'x'), [[vTip, '会消失的提示']])
            : h('div'),
      })
    );
    expect(bubbles()).toHaveLength(1);
    show.value = false;
    await flushPromises();
    expect(bubbles()).toHaveLength(0);
    expect(wrapper.exists()).toBe(true);
  });
});
