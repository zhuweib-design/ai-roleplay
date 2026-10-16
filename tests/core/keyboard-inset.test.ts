/**
 * 键盘兜底探测的单测（--keyboard-inset）
 *
 * 这台机器没有 iOS 设备可跑真机，所以这里按**两种引擎的真实数值形状**造 visualViewport：
 * - Android（本仓 2026-10-16 真机实测）：innerHeight 与 visualViewport.height 一起缩 ⇒ 差值必须为 0，
 *   否则输入条会被抬两次。
 * - iOS Safari：只有 visualViewport.height 缩 ⇒ 差值就是键盘高度。
 * 两个方向都要钉：只测 iOS 形状会得到"永远抬升"的实现，只测 Android 形状会漏掉兜底。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { startKeyboardInset } from '@/core/keyboard-inset';

const KEY = '--keyboard-inset';

interface FakeVV {
  height: number;
  offsetTop: number;
  scale: number;
  addEventListener: (t: string, cb: () => void) => void;
  removeEventListener: (t: string, cb: () => void) => void;
  fire: (t: string) => void;
  listeners: Map<string, Array<() => void>>;
}

function stubViewport(opts: { innerHeight: number; vvHeight: number; offsetTop?: number; scale?: number; noVV?: boolean }): FakeVV | null {
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: opts.innerHeight });
  if (opts.noVV) {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    return null;
  }
  const listeners = new Map<string, Array<() => void>>();
  const vv: FakeVV = {
    height: opts.vvHeight,
    offsetTop: opts.offsetTop ?? 0,
    scale: opts.scale ?? 1,
    listeners,
    addEventListener: (t, cb) => {
      listeners.set(t, [...(listeners.get(t) ?? []), cb]);
    },
    removeEventListener: (t, cb) => {
      listeners.set(t, (listeners.get(t) ?? []).filter((f) => f !== cb));
    },
    fire: (t) => {
      for (const cb of listeners.get(t) ?? []) cb();
    },
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  return vv;
}

function inset(): string {
  return document.documentElement.style.getPropertyValue(KEY);
}

describe('startKeyboardInset', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(KEY);
    vi.restoreAllMocks();
  });

  it('只缩视觉视口（iOS 形状）⇒ 写入键盘高度', () => {
    stubViewport({ innerHeight: 842, vvHeight: 530 });
    startKeyboardInset();
    expect(inset()).toBe('312px');
  });

  it('负向对照：布局视口已随键盘收缩（Android 实测形状）⇒ 写 0，不重复抬升', () => {
    stubViewport({ innerHeight: 530, vvHeight: 530 });
    startKeyboardInset();
    expect(inset()).toBe('0px');
  });

  it('页面被键盘顶起滚动时 offsetTop 参与计算', () => {
    stubViewport({ innerHeight: 842, vvHeight: 530, offsetTop: 100 });
    startKeyboardInset();
    expect(inset()).toBe('212px');
  });

  it('负向对照：双指缩放（scale≠1）时不抬升', () => {
    stubViewport({ innerHeight: 842, vvHeight: 421, scale: 2 });
    startKeyboardInset();
    expect(inset()).toBe('0px');
  });

  it('键盘收起后 resize 事件把值归零', () => {
    const vv = stubViewport({ innerHeight: 842, vvHeight: 530 })!;
    startKeyboardInset();
    expect(inset()).toBe('312px');
    vv.height = 842;
    vv.fire('resize');
    expect(inset()).toBe('0px');
  });

  it('stop 之后不再响应 resize（不留在页面里）', () => {
    const vv = stubViewport({ innerHeight: 842, vvHeight: 530 })!;
    const stop = startKeyboardInset();
    stop();
    document.documentElement.style.removeProperty(KEY);
    vv.height = 300;
    vv.fire('resize');
    expect(inset()).toBe('');
  });

  it('没有 visualViewport 的老引擎：不抛错、也不写值', () => {
    stubViewport({ innerHeight: 842, vvHeight: 0, noVV: true });
    expect(() => startKeyboardInset()).not.toThrow();
    expect(inset()).toBe('');
  });

  it('负向对照：不启动就不该有值（证明上面几条不是环境自带）', () => {
    stubViewport({ innerHeight: 842, vvHeight: 530 });
    expect(inset()).toBe('');
  });
});
