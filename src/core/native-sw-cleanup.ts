/**
 * 一次性清理老 APK 留下的 Service Worker
 *
 * 成因（2026-10-15 真机实测）：以前的安卓包注册了 workbox 的 precache，
 * 覆盖安装新 APK 后，WebView 里的旧 SW 仍把 `index.html` 兜到旧缓存，
 * 用户看到的还是升级前的界面 —— 页面加载 `index-BqRCuyp6.js`，
 * 而新包里是 `index-OB1SZaI5.js`。
 *
 * 为什么不在运行时"发现旧 SW 就注销"然后长期保留这段逻辑：
 * `registerSW.js` 每次加载都会重新注册，那样会 unregister → 重载 → 再注册 → 死循环。
 * 根因是原生壳里根本不该有 SW，所以构建期已经关掉（见 vite.config.ts 的
 * `VitePWA({ disable: isNativeShellEnv })`）。新包不再注册 ⇒ 这里注销完不会长回来，
 * 本函数只负责把**已经装了旧版**的设备一次性救回来。
 *
 * @returns 是否触发了整页重载（true 时调用方不必继续，页面马上就走）
 */
export async function purgeStaleServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

  let registrations: readonly ServiceWorkerRegistration[] = [];
  try {
    registrations = await navigator.serviceWorker.getRegistrations();
  } catch {
    return false;
  }
  if (registrations.length === 0) return false;

  await Promise.all(
    registrations.map((r) => r.unregister().catch(() => false))
  );
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // 清不掉缓存也不阻塞：SW 已注销，下次加载就直接走本地资源
  }
  location.reload();
  return true;
}
