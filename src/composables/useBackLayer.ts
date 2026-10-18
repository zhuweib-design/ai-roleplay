import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { isMobile } from '@/core/viewport';
import {
  currentNavGeneration,
  ensureNavGenerationHook,
  newLayerToken,
  offLayerPop,
  onLayerPop,
  popLayer,
  pushLayer,
  stripLayerMark,
  topLayerToken,
} from '@/core/history-layer';

/**
 * useBackLayer — 让一个"覆盖层"吃掉一次系统返回（MOBILE_PLAN 批次 2-3）
 *
 * 用法（组件侧）：
 *   useBackLayer({ isOpen: () => props.open, onBack: () => emit('close') });
 *
 * 行为：
 * - 打开时压一层历史（带本实例的唯一 token）
 * - 用户按返回：栈顶不是我了 ⇒ 关掉自己；栈顶还是我 ⇒ 说明弹掉的是我上面那层，不动
 * - 自己关掉时（Esc / 点遮罩 / 关闭按钮）顺手把这一层历史退掉，否则用户要多按一次返回
 *
 * 为什么组件不需要知道"我在第几层"：层与层之间靠 token 判序，压的先后就是层序。
 * 于是「抽屉盖在二级页上」这种组合天然正确：返回先关抽屉，再按一次才回列表。
 */
export interface UseBackLayerOptions {
  /** 这一层当前是否打开（传取值函数而不是值，组件不用自己 watch） */
  isOpen: () => boolean;
  /** 系统返回时要做什么——通常是 emit('close') */
  onBack: () => void;
  /**
   * 这一层是否允许被返回键关闭。默认允许。
   *
   * 不可关闭的模态（`<Modal :dismissible="false">`、强制阅读的提示）传 false：
   * 它们不压历史，返回键按默认语义处理（离开页面）。**刻意不做"吞掉返回键"**——
   * 那等于把用户锁在弹窗里，比直接离开更糟。
   */
  canDismiss?: () => boolean;
  /** 是否参与历史分层。默认只在手机档（桌面后退是导航语义，不该被抽屉吃掉） */
  enabled?: () => boolean;
}

export interface UseBackLayer {
  /**
   * 本层最近一次是"被系统返回关掉的"。
   * 少数场景要区分"用户点了关闭"和"用户按了返回"（比如返回时不该再弹确认框）。
   */
  closedByBack: Ref<boolean>;
}

export function useBackLayer(options: UseBackLayerOptions): UseBackLayer {
  const closedByBack = ref(false);

  // 注册导航代数钩子（幂等）。没有它，closeLayer 无法区分"用户关掉"和"被导航带走"
  ensureNavGenerationHook();

  const token = newLayerToken('layer');
  const canDismiss = options.canDismiss ?? (() => true);
  const enabled = options.enabled ?? (() => isMobile.value);

  /** 本层是否在历史栈里压过一条 */
  let pushed = false;
  /**
   * 上一次 back() 还没落地。与 useDrilldown 同一个坑：back 是异步的、状态是同步的，
   * 用户在极短时间内"关掉又打开"时，迟到的 popstate 会把**刚打开的那层**当成
   * "系统返回到我"再关一次（症状：点开又自己关）。宁可这一次不压栈。
   */
  let backPending = false;
  /** 延后的"退掉这一层历史"定时器（见 closeLayer 注释） */
  let disposeTimer: number | null = null;

  function openLayer(): void {
    if (pushed) return;
    if (!enabled() || !canDismiss()) return;
    if (backPending) return;
    if (pushLayer(token)) pushed = true;
  }

  function closeLayer(): void {
    if (!pushed) return;
    pushed = false;
    // 顺序要紧：先改 pushed、再退历史。popstate 要等一帧才到，那时 pushed 已是
    // false，本实例会忽略它，不会二次归位。
    //
    // **退历史要延后一拍，并且要先确认这次关闭不是被导航带走的**。
    //
    // 最常见的组合是"关抽屉 + 跳路由"（点抽屉里的「开始对话」/「编辑」就是）：
    // 立刻 back() 会与 router.push 抢，把刚发起的导航退掉（症状是"点了没反应"）。
    //
    // 判断依据是**导航代数**而不是 URL：路由组件是懒加载 chunk，`router.push`
    // 要等 chunk 落地才改 URL，那一拍可能比任何 setTimeout 都晚，按 URL 判断
    // 会把刚发起的导航误判成"没导航"再 back 掉（A14 实测撞到，character-drawer
    // 的「开始对话」就是这条）。导航代数由全局 beforeEach 递增，早于宏任务。
    if (disposeTimer !== null) window.clearTimeout(disposeTimer);
    const genAtClose = currentNavGeneration();
    const urlAtClose = typeof window === 'undefined' ? '' : window.location.href;
    disposeTimer = window.setTimeout(() => {
      disposeTimer = null;
      if (typeof window === 'undefined') return;
      if (currentNavGeneration() !== genAtClose) return; // 有导航发起：这层随导航消失
      if (window.location.href !== urlAtClose) return; // 双保险：URL 已变
      if (popLayer(token)) backPending = true;
    }, 0);
  }

  function handlePop(): void {
    backPending = false;
    if (!pushed) return;
    // 栈顶还是我 ⇒ 被弹掉的是我上面那层（另一个抽屉/模态），我不该跟着关
    if (topLayerToken() === token) return;
    pushed = false;
    closedByBack.value = true;
    options.onBack();
  }

  onLayerPop(handlePop);

  watch(
    () => options.isOpen(),
    (isOpen) => {
      if (isOpen) {
        closedByBack.value = false;
        openLayer();
      } else {
        closeLayer();
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    offLayerPop(handlePop);
    if (disposeTimer !== null) {
      window.clearTimeout(disposeTimer);
      disposeTimer = null;
    }
    if (!pushed) return;
    pushed = false;
    // 卸载时不能 back：卸载多半是路由切换引起的，back 会把用户退回上一个页面
    stripLayerMark(token);
  });

  return { closedByBack };
}
