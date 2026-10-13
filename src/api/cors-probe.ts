/**
 * 分不清的那一类 fetch 失败：断网 vs 被跨域拦
 *
 * 浏览器故意不让页面知道 `TypeError: Failed to fetch` 的真正原因（否则任意站点都能拿来探测
 * 内网端口）。但两者对用户的意义完全不同：一个是"你的网络/地址不对"，一个是
 * "地址是对的，只是这家不接受浏览器直连"。所以这里补一次**只测连通性**的探测请求把它分开：
 * `mode:'no-cors'` 不受 `Access-Control-Allow-Origin` 约束，能连上就说明服务器可达，
 * 那么原请求失败只可能是跨域。
 *
 * 两个刻意的约束：
 * 1. 探测打的是 origin 根路径，不是 chat 端点 —— 把同一份对话体重发一次会被服务商计第二次费。
 *    根路径哪怕返回 404 也算"连通"，因为我们判的是连接层能不能到。
 * 2. 探测自带 3 秒上界：黑洞型网络（包被静默丢弃）不会让 `fetch` 永远挂着，
 *    否则错误提示反而被探测拖住。
 */

/** 探测请求的时间上界（毫秒） */
const PROBE_TIMEOUT_MS = 3000;

/** origin 根路径；baseUrl 本身不成形时返回 null（那类错误由 invalid-url 分支处理，不该发探测） */
export function probeUrlFor(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

/**
 * 服务器是否可达（与跨域无关的连通性）。
 * `no-cors` 请求拿到 opaque response 就算可达；抛错或被超时中止都算不可达。
 */
export async function isHostReachable(baseUrl: string): Promise<boolean> {
  const probeUrl = probeUrlFor(baseUrl);
  if (!probeUrl) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(probeUrl, { mode: 'no-cors', method: 'GET', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
