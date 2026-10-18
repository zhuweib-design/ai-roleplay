/**
 * useBackLayer 单元测试（MOBILE_PLAN 批次 2-3）
 *
 * 这个 composable 让"盖在内容上的一层"（抽屉 / 动作条 / 模态）吃掉一次系统返回。
 * 它真正要证明的不是"能关掉自己"，而是**层序正确**：
 * 抽屉盖在二级页上时，按一次返回只关抽屉，二级页必须还在。
 * 那是 A7 登记的边界（"抽屉打开时系统返回会一次退两级"），A14 在这里根治。
 *
 * history 用一套"真栈"mock（数组 + index + 同步派发 popstate），而不是布尔假状态：
 * 分层正确性只有真栈才测得出来。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useBackLayer } from '../../src/composables/useBackLayer';
import { useDrilldown, type UseDrilldown } from '../../src/composables/useDrilldown';
import { LAYER_MARK } from '../../src/core/history-layer';
import { isMobile } from '@/core/viewport';

let stack: Record<string, unknown>[] = [];
let index = 0;
let pushCount = 0;
let backCount = 0;
let replaceCount = 0;
let wrapper: VueWrapper | null = null;

function resetStack(): void {
  stack = [{ position: 0, current: '/group' }];
  index = 0;
}

/**
 * closeLayer 把"退历史"延后了一拍（避免与同一 tick 的路由跳转抢），
 * 断言 back 是否发生要等一个宏任务。
 */
function flushTimer(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 模拟用户按系统返回 / 浏览器后退：先出栈，再派发 popstate */
function userPressBack(): void {
  if (index > 0) index -= 1;
  window.dispatchEvent(new PopStateEvent('popstate', { state: stack[index] }));
}

beforeEach(() => {
  resetStack();
  pushCount = 0;
  backCount = 0;
  replaceCount = 0;
  isMobile.value = true;

  Object.defineProperty(window.history, 'state', {
    configurable: true,
    get: () => stack[index],
  });
  vi.spyOn(window.history, 'pushState').mockImplementation((state) => {
    stack = stack.slice(0, index + 1);
    stack.push(state as Record<string, unknown>);
    index = stack.length - 1;
    pushCount += 1;
  });
  vi.spyOn(window.history, 'replaceState').mockImplementation((state) => {
    stack[index] = state as Record<string, unknown>;
    replaceCount += 1;
  });
  vi.spyOn(window.history, 'back').mockImplementation(() => {
    backCount += 1;
    userPressBack();
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  isMobile.value = false;
  vi.restoreAllMocks();
  delete (window.history as unknown as Record<string, unknown>).state;
});

describe('useBackLayer · 单层', () => {
  it('打开时压一层，带本实例 token', async () => {
    const open = ref(false);
    wrapper = mount(
      defineComponent({
        setup() {
          useBackLayer({ isOpen: () => open.value, onBack: () => {} });
          return () => h('div');
        },
      })
    );
    open.value = true;
    await nextTick();
    expect(pushCount).toBe(1);
    expect(typeof stack[index]?.[LAYER_MARK]).toBe('string');
  });

  it('系统返回关掉自己，并标记 closedByBack', async () => {
    const open = ref(false);
    const onBack = vi.fn(() => {
      open.value = false;
    });
    let api!: ReturnType<typeof useBackLayer>;
    wrapper = mount(
      defineComponent({
        setup() {
          api = useBackLayer({ isOpen: () => open.value, onBack });
          return () => h('div');
        },
      })
    );
    open.value = true;
    await nextTick();
    userPressBack();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(api.closedByBack.value).toBe(true);
  });

  it('自己关掉时顺手退历史，用户不用多按一次返回', async () => {
    const open = ref(false);
    const onBack = vi.fn();
    wrapper = mount(
      defineComponent({
        setup() {
          useBackLayer({ isOpen: () => open.value, onBack });
          return () => h('div');
        },
      })
    );
    open.value = true;
    await nextTick();
    open.value = false; // Esc / 点遮罩 / 关闭按钮
    await nextTick();
    await flushTimer();

    expect(backCount).toBe(1);
    expect(onBack).not.toHaveBeenCalled(); // 不是"被返回关掉"
  });

  it('桌面档不压历史（后退是导航语义，不该被抽屉吃掉）', async () => {
    isMobile.value = false;
    const open = ref(false);
    wrapper = mount(
      defineComponent({
        setup() {
          useBackLayer({ isOpen: () => open.value, onBack: () => {} });
          return () => h('div');
        },
      })
    );
    open.value = true;
    await nextTick();
    expect(pushCount).toBe(0);
  });

  it('不可关闭的模态不压历史（刻意不吞返回键，锁住用户比离开更糟）', async () => {
    const open = ref(false);
    wrapper = mount(
      defineComponent({
        setup() {
          useBackLayer({ isOpen: () => open.value, canDismiss: () => false, onBack: () => {} });
          return () => h('div');
        },
      })
    );
    open.value = true;
    await nextTick();
    expect(pushCount).toBe(0);
  });

  it('卸载时抹标记而不是 back（卸载多半是路由切换）', async () => {
    const open = ref(false);
    wrapper = mount(
      defineComponent({
        setup() {
          useBackLayer({ isOpen: () => open.value, onBack: () => {} });
          return () => h('div');
        },
      })
    );
    open.value = true;
    await nextTick();
    expect(typeof stack[index]?.[LAYER_MARK]).toBe('string');

    wrapper.unmount();
    wrapper = null;

    expect(backCount).toBe(0);
    expect(replaceCount).toBe(1);
    expect(stack[index]?.[LAYER_MARK]).toBeUndefined();
    expect(stack[index]?.current).toBe('/group'); // 其余 state 原样保留
  });
});

describe('useBackLayer · 分层（A7 边界的根治）', () => {
  /**
   * 组合场景：两级互换进二级 → 打开抽屉 → 按返回。
   * 期望：只关抽屉，二级页还在；再按一次才回列表。
   * 修复前：一次退两级（抽屉还盖在列表上）。
   */
  function mountCombo() {
    const drawerOpen = ref(false);
    let drill!: UseDrilldown;
    let layerApi!: ReturnType<typeof useBackLayer>;

    wrapper = mount(
      defineComponent({
        setup() {
          drill = useDrilldown({ trackHistory: () => true });
          layerApi = useBackLayer({
            isOpen: () => drawerOpen.value,
            onBack: () => {
              drawerOpen.value = false;
            },
          });
          return () => h('div');
        },
      })
    );
    return { drill, layerApi, drawerOpen };
  }

  it('抽屉盖在二级页上：第一次返回只关抽屉，二级页不动', async () => {
    const { drill, drawerOpen } = mountCombo();
    drill.open('group-1');
    expect(drill.level.value).toBe(2);

    drawerOpen.value = true;
    await nextTick();
    expect(pushCount).toBe(2); // 二级一层 + 抽屉一层

    userPressBack(); // 用户按返回
    expect(drawerOpen.value).toBe(false);
    expect(drill.level.value, '二级页被返回键连坐退掉了（A7 那条边界）').toBe(2);

    userPressBack(); // 再按一次
    expect(drill.level.value).toBe(1);
  });

  it('抽屉自己关掉后，二级页的历史层仍然在（下一次返回才回列表）', async () => {
    const { drill, drawerOpen } = mountCombo();
    drill.open('group-1');
    drawerOpen.value = true;
    await nextTick();

    drawerOpen.value = false; // 点 Esc 关抽屉
    await nextTick();
    await flushTimer();
    expect(backCount).toBe(1); // 抽屉那层被退掉
    expect(drill.level.value).toBe(2);

    userPressBack();
    expect(drill.level.value).toBe(1);
  });

  it('两个层都关掉后，历史栈回到进入前的位置（没有残留记录）', async () => {
    const { drill, drawerOpen } = mountCombo();
    drill.open('group-1');
    drawerOpen.value = true;
    await nextTick();

    userPressBack(); // 关抽屉
    userPressBack(); // 回一级

    // 真实浏览器后退不会删除前面的记录（只是 index 回退），所以这里断言"指针回到
    // 进入前的位置"，而不是栈长度——栈里留着的那两条是前向记录，正常。
    expect(index).toBe(0);
    expect(stack[index]?.[LAYER_MARK]).toBeUndefined();
  });
});
