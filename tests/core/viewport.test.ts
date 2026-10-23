/**
 * 视口状态层单元测试（MOBILE_PLAN 批次 2-5 / DEV_PLAN A16）
 *
 * 这一项要证明两件事：
 * 1. **单一运行时值**：`isMobile` / `isTablet` / `isCompact` / `isDesktop` 全部
 *    由 `viewportMode` 派生，任何时刻四者互斥且合起来恰好覆盖一种模式
 *    （批次 2-5 之前是四条独立 media query，jsdom 里会出现"三者皆假"）
 * 2. **force-desktop**：强制桌面后 `isMobile` 为 false ⇒ `App.vue` 的
 *    `showBottomNav` 不渲染底部导航
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

import {
  applyForceDesktopFromUrl,
  isCompact,
  isDesktop,
  isForceDesktop,
  isMobile,
  isTablet,
  setForceDesktop,
  setViewportMode,
  useViewport,
  viewportMode,
  viewportSubscriberCount,
} from '../../src/core/viewport';

function snapshot() {
  return {
    mode: viewportMode.value,
    mobile: isMobile.value,
    tablet: isTablet.value,
    compact: isCompact.value,
    desktop: isDesktop.value,
  };
}

afterEach(() => {
  setForceDesktop(false);
  setViewportMode('desktop');
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('viewport · 单一运行时值', () => {
  it('mobile：只有 isMobile 与 isCompact 为真', () => {
    setViewportMode('mobile');
    expect(snapshot()).toEqual({
      mode: 'mobile',
      mobile: true,
      tablet: false,
      compact: true,
      desktop: false,
    });
  });

  it('tablet：isTablet 与 isCompact 为真，isMobile 为假', () => {
    setViewportMode('tablet');
    expect(snapshot()).toEqual({
      mode: 'tablet',
      mobile: false,
      tablet: true,
      compact: true,
      desktop: false,
    });
  });

  it('desktop：只有 isDesktop 为真，isCompact 为假', () => {
    setViewportMode('desktop');
    expect(snapshot()).toEqual({
      mode: 'desktop',
      mobile: false,
      tablet: false,
      compact: false,
      desktop: true,
    });
  });

  it('三种模式里 isMobile / isTablet / isDesktop 恒互斥，且 isCompact = 非桌面', () => {
    for (const mode of ['mobile', 'tablet', 'desktop'] as const) {
      setViewportMode(mode);
      const s = snapshot();
      const exclusive = [s.mobile, s.tablet, s.desktop].filter(Boolean);
      expect(exclusive, `${mode} 下三个模式标志不是恰好一个为真`).toHaveLength(1);
      expect(s.compact, `${mode} 下 isCompact 与"非桌面"不一致`).toBe(mode !== 'desktop');
    }
  });
});

describe('viewport · force-desktop', () => {
  it('强制桌面后 isMobile / isTablet / isCompact 全为假（底部导航因此不渲染）', () => {
    setViewportMode('mobile');
    expect(isMobile.value).toBe(true);

    setForceDesktop(true);

    expect(viewportMode.value).toBe('desktop');
    expect(isMobile.value, 'isMobile 为真会让 App.vue 渲染底部导航').toBe(false);
    expect(isTablet.value).toBe(false);
    expect(isCompact.value).toBe(false);
    expect(isDesktop.value).toBe(true);
  });

  it('解除强制后回到真实模式', () => {
    setViewportMode('tablet');
    setForceDesktop(true);
    setForceDesktop(false);
    expect(viewportMode.value).toBe('tablet');
    expect(isTablet.value).toBe(true);
  });

  it('?forceDesktop=1 开启并持久化；?forceDesktop=0 解除', () => {
    setViewportMode('mobile');

    expect(applyForceDesktopFromUrl('?forceDesktop=1')).toBe(true);
    expect(isMobile.value).toBe(false);
    expect(localStorage.getItem('aijiu.forceDesktop')).toBe('1');

    expect(applyForceDesktopFromUrl('?forceDesktop=0')).toBe(false);
    expect(isMobile.value, '解除后应回到移动档').toBe(true);
    expect(localStorage.getItem('aijiu.forceDesktop')).toBeNull();
  });

  it('没有参数时沿用持久化状态（跨路由导航会丢 query，不能丢开关）', () => {
    localStorage.setItem('aijiu.forceDesktop', '1');
    expect(applyForceDesktopFromUrl('')).toBe(true);
    expect(isForceDesktop()).toBe(true);
  });
});

describe('viewport · 订阅引用计数', () => {
  let matches: Record<string, boolean>;

  beforeEach(() => {
    matches = {};
    // 可控的 matchMedia：让 resize 之后的 detectMode 能被测试推动
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: matches[query] ?? false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  function mountUser() {
    return mount(
      defineComponent({
        setup() {
          useViewport();
          return () => h('div');
        },
      })
    );
  }

  it('两个组件共用一份监听：先卸载的那个不会让另一个失去响应', async () => {
    const a = mountUser();
    const b = mountUser();
    await nextTick();
    expect(viewportSubscriberCount()).toBe(2);

    a.unmount();
    await nextTick();
    expect(viewportSubscriberCount()).toBe(1);

    // 剩下的订阅者仍然响应 resize：把 mobile query 打开再派发事件
    matches['(max-width: 640px)'] = true;
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(isMobile.value, '先卸载的那个把监听器摘掉了').toBe(true);

    b.unmount();
    await nextTick();
    expect(viewportSubscriberCount()).toBe(0);
  });
});
