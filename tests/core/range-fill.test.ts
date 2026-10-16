/**
 * 滑块进度着色（M2-b9）
 *
 * 用户反馈"滑块交互中颜色没有明显的变化"。着色只依赖元素上的 `--range-pct`，
 * 所以这里守的是：这个变量在三种改值路径下都必须跟上——
 * 初始渲染、用户拖动（input 事件）、程序化改值（v-model / 重置按钮，不产生 input 事件）。
 * 少任何一条，轨道就会出现"拇指动了、颜色没动"或"颜色停在旧位置"的假象。
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';
import { mount } from '@vue/test-utils';
import { rangePercent, vRange } from '@core/range-fill';

describe('rangePercent', () => {
  it('按区间线性换算', () => {
    expect(rangePercent(5, 0, 10)).toBe(50);
    expect(rangePercent(1, 0, 2)).toBe(50);
    expect(rangePercent(0.5, 0.5, 2)).toBe(0);
  });

  it('越界值收敛到 0–100', () => {
    expect(rangePercent(-3, 0, 10)).toBe(0);
    expect(rangePercent(999, 0, 10)).toBe(100);
  });

  it('非法输入与零区间都退回 0，不产生 NaN 污染样式', () => {
    expect(rangePercent(Number.NaN, 0, 10)).toBe(0);
    expect(rangePercent(5, 0, Number.POSITIVE_INFINITY)).toBe(0);
    expect(rangePercent(5, 3, 3)).toBe(0);
  });

  it('负区间（如 temperature 的 -2..2）也算对', () => {
    expect(rangePercent(0, -2, 2)).toBe(50);
    expect(rangePercent(-2, -2, 2)).toBe(0);
  });
});

const Host = defineComponent({
  props: { value: { type: Number, required: true } },
  emits: ['update:value'],
  setup(props, { emit }) {
    return () =>
      withDirectives(
        h('input', {
          type: 'range',
          class: 'tk-range',
          min: '0',
          max: '2',
          step: '0.05',
          value: String(props.value),
          onInput: (e: Event) => emit('update:value', Number((e.target as HTMLInputElement).value)),
        }),
        [[vRange]]
      );
  },
});

function pctOf(el: Element): string {
  return (el as HTMLElement).style.getPropertyValue('--range-pct');
}

describe('v-range 指令', () => {
  it('挂载时就写好 --range-pct（首屏不会先空轨再跳色）', () => {
    const wrapper = mount(Host, { props: { value: 1 } });
    const el = wrapper.find('input').element;
    expect(pctOf(el)).toBe('50.00%');
  });

  it('用户拖动（input 事件）立即跟随，不依赖组件是否重渲染', async () => {
    const wrapper = mount(Host, { props: { value: 0 } });
    const el = wrapper.find('input').element as HTMLInputElement;
    el.value = '1.6';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    // 这里父组件没有回写 props（value 仍是 0），只有 input 监听能让着色跟上
    expect(pctOf(el)).toBe('80.00%');
  });

  it('程序化改值（v-model / 重置）走 updated 钩子，不留过期填充', async () => {
    const value = ref(0);
    const wrapper = mount(Host, { props: { value: value.value } });
    const el = wrapper.find('input').element;
    expect(pctOf(el)).toBe('0.00%');
    await wrapper.setProps({ value: 2 });
    expect(pctOf(el)).toBe('100.00%');
    await wrapper.setProps({ value: 0.5 });
    expect(pctOf(el)).toBe('25.00%');
  });

  it('min/max 缺省时按 0..100 解释（直接调钩子，避免再起一个测试组件）', () => {
    const el = document.createElement('input');
    el.type = 'range';
    el.value = '25';
    const { mounted } = vRange as unknown as { mounted: (node: HTMLInputElement) => void };
    mounted(el);
    expect(el.style.getPropertyValue('--range-pct')).toBe('25.00%');
  });
});
