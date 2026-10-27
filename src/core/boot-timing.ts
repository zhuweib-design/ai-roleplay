/**
 * 启动耗时打点（首聊验收用）
 *
 * `App.vue` 的 onMounted 末尾已经把 `data-app-ready="1"` 写到 html 上供
 * e2e 与 `scripts/measure-startup.mjs` 用；这里只顺手留一个数字给设置页的
 * 验收表读，免得那条用例为了一个数去解析性能条目。
 *
 * 只在内存里：一次页面生命周期一个值，刷新即重置——它描述的就是"这一次启动"。
 */

let appReadyMs: number | null = null;

/** 应用可用时调用一次（重复调用只记第一次） */
export function markAppReady(): void {
  if (appReadyMs !== null) return;
  if (typeof performance === 'undefined') return;
  appReadyMs = Math.round(performance.now());
}

/** 启动到可用的毫秒数；还没打点时返回 null */
export function getAppReadyMs(): number | null {
  return appReadyMs;
}

/** 仅测试用：清掉打点 */
export function resetAppReadyForTesting(): void {
  appReadyMs = null;
}
