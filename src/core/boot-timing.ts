/**
 * 启动耗时打点（首聊验收用）
 *
 * `App.vue` 的 onMounted 末尾已经把 `data-app-ready="1"` 写到 html 上供
 * e2e 与 `scripts/measure-startup.mjs` 用；这里顺手留一个数字给设置页的
 * 验收表读，免得那条用例为了一个数去解析性能条目。
 *
 * 为什么存 window 而不是模块变量（2026-10-28 实测改的）：写入方在入口 chunk
 * （App.vue），读取方在懒加载的设置页 chunk，`boot-timing` 被打进两份时两边各有
 * 一份 `let`，读到的永远是 null——设置页实测显示"本次启动 未取到"。window 上的
 * 一个键只有一份，chunk 归属怎么变都读得到。
 *
 * 只在本次页面生命周期里有效，刷新即重置——它描述的就是"这一次启动"。
 */

const KEY = '__arcAppReadyMs';
/** 打点完成的一次性事件；读取方用它把"渲染太早"抓回来的那一次补上 */
export const APP_READY_EVENT = 'arc-app-ready';

function holder(): Record<string, unknown> | null {
  return typeof window === 'undefined' ? null : (window as unknown as Record<string, unknown>);
}

/** 应用可用时调用一次（重复调用只记第一次） */
export function markAppReady(): void {
  const h = holder();
  if (!h) return;
  if (typeof performance === 'undefined') return;
  if (typeof h[KEY] === 'number') return;
  h[KEY] = Math.round(performance.now());
  // 事件必须派在写入之后：监听方一进来就能读到真数字
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(APP_READY_EVENT));
}

/** 启动到可用的毫秒数；还没打点时返回 null */
export function getAppReadyMs(): number | null {
  const h = holder();
  if (!h) return null;
  const value = h[KEY];
  return typeof value === 'number' ? value : null;
}
