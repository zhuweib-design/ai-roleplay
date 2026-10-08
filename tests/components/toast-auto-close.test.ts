/**
 * Toast 自动关闭与倒计时（M2-b9）
 *
 * 组件层要守的是四件事，缺一条就会回到用户抱怨的"看着像不会自己关"：
 * - 不传 duration 时按类型取时长（信息/成功 3s 出头，错误 5s）；
 * - duration=0 才是常驻（保留原来的"钉住"用法）；
 * - 有倒计时条，且随剩余时间收窄——它是"我会自己关"的唯一可见承诺；
 * - 悬停/键盘聚焦暂停，移开后继续剩余时间（WCAG 2.2.1）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Toast from '@/components/common/Toast.vue';

function query() {
  return {
    toast: document.querySelector('.toast'),
    bar: document.querySelector('[data-toast-countdown]') as HTMLElement | null,
  };
}
function barScale(): string | null {
  return query().bar?.style.transform ?? null;
}
function scaleOf(transform: string | null): number {
  const m = /scaleX\(([\d.]+)\)/.exec(transform || '');
  return m ? Number(m[1]) : Number.NaN;
}

function open(props: Record<string, unknown>) {
  return mount(Toast, {
    props: { modelValue: true, ...props },
    attachTo: document.body,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('按类型自动关闭', () => {
  it('info 约 3s 后发出关闭事件，之前一直在', async () => {
    const wrapper = open({ type: 'info', message: '已同步' });
    expect(query().toast).toBeTruthy();
    vi.advanceTimersByTime(2000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    vi.advanceTimersByTime(1200);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });

  it('error 要 5s 才关，不被缩短', async () => {
    const wrapper = open({ type: 'error', message: '保存失败' });
    vi.advanceTimersByTime(3400);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    vi.advanceTimersByTime(1800);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });

  it('显式 duration=0 表示常驻，不自动关', async () => {
    const wrapper = open({ type: 'success', message: '导入完成', duration: 0 });
    vi.advanceTimersByTime(30000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(query().toast).toBeTruthy();
  });

  it('手动点关闭按钮立即发出关闭事件', async () => {
    const wrapper = open({ type: 'info', message: '可手动关' });
    query().toast!.querySelector('.toast-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });
});

describe('倒计时条', () => {
  it('随剩余时间收窄：2s 时约剩三分之一', async () => {
    const wrapper = open({ type: 'info', message: '看得到还剩多久' });
    expect(scaleOf(barScale())).toBeCloseTo(1, 1);
    vi.advanceTimersByTime(2000);
    // ratio 是响应式绑定，要等一次渲染才落到 style 上
    await wrapper.vm.$nextTick();
    expect(scaleOf(barScale())).toBeCloseTo(1 / 3, 1);
  });

  it('常驻（duration=0）时不显示倒计时条，避免"有条但永远不动"的错觉', () => {
    open({ type: 'info', message: '常驻', duration: 0 });
    expect(query().bar).toBeNull();
  });

  it('倒计时条不进读屏序列（aria-hidden）', () => {
    open({ type: 'success', message: '装饰而已' });
    expect(query().bar?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('悬停与聚焦暂停计时', () => {
  it('鼠标停在上面时不关闭，移开后按剩余时间关闭', async () => {
    const wrapper = open({ type: 'info', message: '正在读' });
    const toast = query().toast!;
    // 先让它走 1s，拿到一个"已经消耗掉三分之一"的刻度作为基准
    vi.advanceTimersByTime(1000);
    await wrapper.vm.$nextTick();
    const atHover = scaleOf(barScale());
    expect(atHover).toBeLessThan(1);

    toast.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    vi.advanceTimersByTime(10000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(scaleOf(barScale())).toBeCloseTo(atHover, 3);

    // 剩余约 2s：移开后不该立刻关，也不该等到 3s 之后
    toast.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    vi.advanceTimersByTime(1500);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    vi.advanceTimersByTime(900);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });

  it('键盘焦点落在关闭按钮上时不关闭', async () => {
    const wrapper = open({ type: 'error', message: '要读完' });
    const toast = query().toast!;
    toast.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(9000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    toast.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    vi.advanceTimersByTime(5100);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });

  it('悬停与页面隐藏同时成立时，两条都解除才继续计时', async () => {
    const wrapper = open({ type: 'info', message: '两个暂停理由' });
    const toast = query().toast!;
    toast.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(8000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(8000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    toast.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    vi.advanceTimersByTime(3100);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });
});
