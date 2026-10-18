/**
 * history-layer — 手机端「返回键分层」的共享机制（MOBILE_PLAN 批次 2-3）
 *
 * 要解决的事：安卓返回键与浏览器后退是同一条路径（都是 popstate）。页面里凡是
 * "盖在内容上的一层"（两级互换的二级、底部抽屉、模态框），用户按返回时都应该
 * 只关掉**最上面那一层**，而不是一次退掉两层、更不是直接离开页面。
 *
 * 做法：每打开一层就往历史栈压一条带**唯一 token** 的记录。返回时比 token——
 * 只有"栈顶那条不是我了"才说明被弹掉的是我，才归位。为什么必须是 token 而不是
 * 布尔量：布尔量分不清"我压的那层被弹了"和"我上面那层被弹了"，于是抽屉开着
 * 按返回会连二级页一起退掉（A7 登记的边界，A14 在这里根治）。
 *
 * 层与层之间不互相认识：本模块只提供"压/退/认栈顶"三件事，谁先压谁在下。
 */

/** 压进 state 的标记键。带项目前缀，避免与 vue-router 写的 state 撞名 */
export const LAYER_MARK = '__aijiuLayer';

let seq = 0;

/** 生成本层的唯一 token。前缀只用于调试可读性，不参与判定 */
export function newLayerToken(kind: string): string {
  seq += 1;
  return `${kind}#${seq}`;
}

/** 当前历史记录上的 token；没有（或不是我们写的）返回 null */
export function topLayerToken(): string | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state as Record<string, unknown> | null;
  const value = state?.[LAYER_MARK];
  return typeof value === 'string' ? value : null;
}

/**
 * 压一层，返回是否真的压成功（无 window 环境下压不成功，调用方别把"已压"置真）。
 *
 * 合并而不是覆盖：vue-router 的 state 里带着 position / back / current / forward，
 * 覆盖掉会让路由自己在后退时算错位置，症状是"后退了但视图不换"。
 */
export function pushLayer(token: string): boolean {
  if (typeof window === 'undefined') return false;
  const base = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.pushState({ ...base, [LAYER_MARK]: token }, '', window.location.href);
  return true;
}

/** 栈顶是不是这一层；是才退，避免把用户的导航历史退掉 */
export function popLayer(token: string): boolean {
  if (typeof window === 'undefined') return false;
  if (topLayerToken() !== token) return false;
  window.history.back();
  return true;
}

/**
 * 只把当前记录上的标记抹掉（不 back）。
 *
 * 卸载时用：卸载多半是路由切换引起的，back 会把用户退回上一页。代价是用户多点
 * 一次返回才离开本页——这是登记过的已知边界。
 */
export function stripLayerMark(token: string): void {
  if (typeof window === 'undefined') return;
  if (topLayerToken() !== token) return;
  const state = { ...((window.history.state ?? {}) as Record<string, unknown>) };
  delete state[LAYER_MARK];
  window.history.replaceState(state, '', window.location.href);
}

// ── popstate 分发 ──
// 多个层实例共享同一个 window 监听器：popstate 是全局事件，每实例各挂一个会在
// 后退时被调用 N 次，且互相不知道彼此压了几层。用一个分发集合代替。
const listeners = new Set<() => void>();
let bound = false;

function dispatchPop(): void {
  // 复制一份再遍历：回调里可能触发卸载（从而修改集合），直接遍历 Set 会漏项
  for (const fn of Array.from(listeners)) fn();
}

export function onLayerPop(fn: () => void): void {
  listeners.add(fn);
  if (bound || typeof window === 'undefined') return;
  window.addEventListener('popstate', dispatchPop);
  bound = true;
}

export function offLayerPop(fn: () => void): void {
  listeners.delete(fn);
  if (listeners.size > 0 || !bound || typeof window === 'undefined') return;
  window.removeEventListener('popstate', dispatchPop);
  bound = false;
}

// ── 导航代数 ──
// "层自己关掉"时要不要顺手退历史，取决于这次关闭是不是**被导航带走的**
// （点抽屉里的「开始对话」= 关抽屉 + 跳路由）。不能用 URL 变没变来判断：
// 路由组件是懒加载 chunk，`router.push` 要等 chunk 落地才改 URL，那一拍
// 可能比任何 setTimeout 都晚——按 URL 判断会把刚发起的导航 back 掉
// （症状：点了「开始对话」没反应，A14 实测撞到）。
//
// 全局 `beforeEach` 在导航发起时立刻（微任务内）触发，早于任何宏任务，用它
// 记一个单调递增的"代数"就能准确回答"这次关闭之后有没有新的导航发起"。
let navGeneration = 0;
let navHookBound = false;

export function ensureNavGenerationHook(): void {
  if (navHookBound) return;
  navHookBound = true;
  // 动态 import 避免 core ←→ router 的静态环（router 静态引用了所有视图）
  void import('@/router').then(({ default: router }) => {
    router.beforeEach(() => {
      navGeneration += 1;
      return true;
    });
  });
}

/** 当前导航代数。层关闭前记一份，延后一拍再比，变了说明这层是被导航带走的 */
export function currentNavGeneration(): number {
  return navGeneration;
}
