/**
 * useDrilldown 单元测试（MOBILE_PLAN 批次 1-1）
 *
 * 这个 composable 是"两级互换"的状态机，M3 的三项（世界书 / 设置 / 角色卡）都要挂在它上面，
 * 所以每个边界都钉成断言：历史栈压几层、什么条件下不压、系统返回怎么归位、
 * 卸载时为什么**不能** back。
 *
 * history 全部 mock 掉而不是让 jsdom 真跑：jsdom 的 back() 派发 popstate 的时序
 * 不受控（要等事件循环），而这里要断言"back 有没有被调用、state 被改成什么"。
 * mock 之后 state 变化是同步的，断言才稳。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useDrilldown, type UseDrilldown, type UseDrilldownOptions } from '../../src/composables/useDrilldown';
import { isMobile } from '@/core/viewport';
import { LAYER_MARK } from '@/core/history-layer';

/**
 * 批次 2-3 起标记值从 `true` 变成**每实例唯一 token**：布尔量分不清
 * "我压的那层被弹了"和"我上面那层被弹了"，抽屉/模态也压层之后就会一次退两级。
 */
const MARK = LAYER_MARK;

let fakeState: Record<string, unknown> | null = null;
let pushCount = 0;
let backCount = 0;
let replaceCount = 0;
let wrapper: VueWrapper | null = null;

function mountSwap(options: UseDrilldownOptions = {}): UseDrilldown {
  let api!: UseDrilldown;
  wrapper = mount(
    defineComponent({
      setup() {
        api = useDrilldown(options);
        return () => h('div');
      },
    })
  );
  return api;
}

/** 模拟用户按系统返回 / 浏览器后退：事件到达时栈顶已经回到上一条记录 */
function firePopState(): void {
  fakeState = { position: 0, current: '/chat' };
  window.dispatchEvent(new PopStateEvent('popstate', { state: fakeState }));
}

beforeEach(() => {
  fakeState = { position: 0, current: '/chat' };
  pushCount = 0;
  backCount = 0;
  replaceCount = 0;

  Object.defineProperty(window.history, 'state', {
    configurable: true,
    get: () => fakeState,
  });
  vi.spyOn(window.history, 'pushState').mockImplementation((state) => {
    fakeState = state as Record<string, unknown>;
    pushCount += 1;
  });
  vi.spyOn(window.history, 'replaceState').mockImplementation((state) => {
    fakeState = state as Record<string, unknown>;
    replaceCount += 1;
  });
  vi.spyOn(window.history, 'back').mockImplementation(() => {
    backCount += 1;
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
  // 撤掉对 history.state 的实例级遮蔽，让 jsdom 原型的 getter 重新生效
  delete (window.history as unknown as Record<string, unknown>).state;
});

describe('useDrilldown · 基本两态', () => {
  it('初始停在一级，activeKey 为 null', () => {
    const swap = mountSwap();
    expect(swap.level.value).toBe(1);
    expect(swap.isDetail.value).toBe(false);
    expect(swap.activeKey.value).toBeNull();
  });

  it('open 进二级并记住 key；rootProps 跟着 level 走', () => {
    const swap = mountSwap({ trackHistory: () => false });
    swap.open('group-42');
    expect(swap.level.value).toBe(2);
    expect(swap.isDetail.value).toBe(true);
    expect(swap.activeKey.value).toBe('group-42');
    expect(swap.rootProps.value).toEqual({ class: 'm-swap', 'data-level': '2' });
  });

  it('已在二级时再 open 只换 key，不把历史栈压成阶梯', () => {
    const swap = mountSwap({ trackHistory: () => true });
    swap.open('a');
    swap.open('b');
    expect(pushCount).toBe(1);
    expect(swap.activeKey.value).toBe('b');
  });

  it('不带 key 的 open 不会把已有 key 抹成 undefined 字符串', () => {
    const swap = mountSwap({ trackHistory: () => false });
    swap.open('a');
    swap.open();
    expect(swap.activeKey.value).toBe('a');
  });
});

describe('useDrilldown · 历史记录', () => {
  it('手机档默认要压一层，且带标记', () => {
    const prev = isMobile.value;
    isMobile.value = true;
    try {
      const swap = mountSwap();
      swap.open('x');
      expect(pushCount).toBe(1);
      expect(typeof fakeState?.[MARK]).toBe('string');
    } finally {
      isMobile.value = prev;
    }
  });

  it('压栈时保留 vue-router 写进去的 state（position 等）', () => {
    fakeState = { position: 3, current: '/chat', back: '/character' };
    const swap = mountSwap({ trackHistory: () => true });
    swap.open('x');
    expect(fakeState).toMatchObject({
      position: 3,
      current: '/chat',
      back: '/character',
    });
    // token 是动态的，只断言"带了我们这一层的标记且是字符串"
    expect(typeof fakeState?.[MARK]).toBe('string');
  });

  it('trackHistory 为 false 时不压历史（桌面并置两栏的默认语义）', () => {
    const swap = mountSwap({ trackHistory: () => false });
    swap.open('x');
    expect(pushCount).toBe(0);
    expect(swap.level.value).toBe(2);
  });
});

describe('useDrilldown · 系统返回', () => {
  it('压过历史的实例收到 popstate 后回到一级并清 key', () => {
    const onLeaveDetail = vi.fn();
    const swap = mountSwap({ trackHistory: () => true, onLeaveDetail });
    swap.open('x');
    firePopState();
    expect(swap.level.value).toBe(1);
    expect(swap.activeKey.value).toBeNull();
    expect(onLeaveDetail).toHaveBeenCalledTimes(1);
  });

  it('没压过历史的实例不响应 popstate（跨路由后退不能误判成本页后退）', () => {
    const swap = mountSwap({ trackHistory: () => false });
    swap.open('x');
    firePopState();
    // 仍在二级：这条 popstate 属于别的历史记录，与本页无关
    expect(swap.level.value).toBe(2);
  });

  it('同一条 popstate 只消费一次（连续两次不会把状态打乱）', () => {
    const onLeaveDetail = vi.fn();
    const swap = mountSwap({ trackHistory: () => true, onLeaveDetail });
    swap.open('x');
    firePopState();
    firePopState();
    expect(swap.level.value).toBe(1);
    expect(onLeaveDetail).toHaveBeenCalledTimes(1);
  });
});

describe('useDrilldown · 页内返回（goBack / close）', () => {
  it('goBack 在二级返回 true 并回一级，同时把历史退掉一层', () => {
    const swap = mountSwap({ trackHistory: () => true });
    swap.open('x');
    pushCount = 0;
    expect(swap.goBack()).toBe(true);
    expect(swap.level.value).toBe(1);
    expect(backCount).toBe(1);
  });

  it('goBack 在一级返回 false（把这一层还给默认行为，供安卓返回键用）', () => {
    const swap = mountSwap({ trackHistory: () => true });
    expect(swap.goBack()).toBe(false);
    expect(backCount).toBe(0);
  });

  it('自己退历史后到达的 popstate 不会二次归位', () => {
    const onLeaveDetail = vi.fn();
    const swap = mountSwap({ trackHistory: () => true, onLeaveDetail });
    swap.open('x');
    swap.close();
    firePopState();
    expect(swap.level.value).toBe(1);
    expect(onLeaveDetail).toHaveBeenCalledTimes(1); // close 那次，不是 popstate 那次
  });

  it('栈顶没有我们的标记时不盲退（防止把用户的导航历史退掉）', () => {
    const swap = mountSwap({ trackHistory: () => true });
    swap.open('x');
    fakeState = { position: 9, current: '/settings' }; // 栈已被别人改动
    swap.close();
    expect(backCount).toBe(0);
    expect(swap.level.value).toBe(1);
  });

  it('在一级重复 close 是幂等的，不触发回调', () => {
    const onLeaveDetail = vi.fn();
    const swap = mountSwap({ trackHistory: () => true, onLeaveDetail });
    swap.close();
    swap.close();
    expect(onLeaveDetail).not.toHaveBeenCalled();
    expect(backCount).toBe(0);
  });

  it('返回后立刻再进二级：这一层不压历史，且不会被迟到的 popstate 关掉', () => {
    const swap = mountSwap({ trackHistory: () => true });
    swap.open('a');
    swap.close(); // back 已发出，但还没落地
    expect(backCount).toBe(1);

    pushCount = 0;
    swap.open('b');
    expect(pushCount).toBe(0); // 借用即将退掉的那层，不再压

    firePopState(); // 迟到的 popstate 到达
    expect(swap.level.value).toBe(2); // 刚打开的二级必须还在
    expect(swap.activeKey.value).toBe('b');
  });
});

describe('useDrilldown · 卸载', () => {
  it('卸载时抹掉标记而不是 back（卸载多半是路由切换，back 会把用户退回上一页）', () => {
    const swap = mountSwap({ trackHistory: () => true });
    swap.open('x');
    expect(typeof fakeState?.[MARK]).toBe('string');

    wrapper?.unmount();
    wrapper = null;

    expect(replaceCount).toBe(1);
    expect(backCount).toBe(0);
    expect(fakeState?.[MARK]).toBeUndefined();
    // 其余 state 必须原样保留，否则路由自己的 position 会丢
    expect(fakeState?.position).toBe(0);
    expect(fakeState?.current).toBe('/chat');
  });

  it('没进过二级就卸载，不动历史', () => {
    mountSwap({ trackHistory: () => true });
    wrapper?.unmount();
    wrapper = null;
    expect(replaceCount).toBe(0);
    expect(backCount).toBe(0);
  });

  it('卸载后 popstate 不再影响它（监听已解绑）', () => {
    const onLeaveDetail = vi.fn();
    const swap = mountSwap({ trackHistory: () => true, onLeaveDetail });
    swap.open('x');
    wrapper?.unmount();
    wrapper = null;

    expect(() => firePopState()).not.toThrow();
    expect(onLeaveDetail).not.toHaveBeenCalled();
  });
});

describe('useDrilldown · 多实例', () => {
  it('两个实例共用一个 window 监听器，只有压过历史的那个归位', () => {
    let first!: UseDrilldown;
    let second!: UseDrilldown;
    wrapper = mount(
      defineComponent({
        setup() {
          first = useDrilldown({ trackHistory: () => true });
          second = useDrilldown({ trackHistory: () => false });
          return () => h('div');
        },
      })
    );
    first.open('a');
    second.open('b');

    firePopState();

    expect(first.level.value).toBe(1);
    expect(second.level.value).toBe(2);
  });
});
