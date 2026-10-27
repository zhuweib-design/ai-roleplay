/**
 * 带返回路径的深链跳转（L 层，§3.6.3）
 *
 * 站点内此前没有任何跨页返回契约：设置页不读 query，进来后默认落"外观"，
 * 从任何提示点"去设置"都要用户自己找回来的地方。
 * 规则：
 * - 前进用 router.push（保证浏览器返回键可用）
 * - 落地页用 from 渲染"返回来源"按钮，点击用 router.replace（避免历史堆叠）
 * - from 必须是站内路径白名单，防止把开放重定向引进来
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const INTERNAL_PREFIXES = [
  '/chat',
  '/group',
  '/character',
  '/worldbook',
  '/databank',
  '/story',
  '/random-events',
  '/local-model',
  '/image-gen',
  '/character-version',
  '/community-market',
  '/archives',
  '/settings',
  '/more',
  '/guide',
  '/profile',
];

function isInternal(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  return INTERNAL_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

export function useReadinessJump() {
  const router = useRouter();
  const route = useRoute();

  /** 仅当 ?from 是站内路径时才承认它 */
  const fromPath = computed<string | null>(() => {
    const raw = route.query.from;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && isInternal(value) ? value : null;
  });

  function pushWithReturn(target: { name: string; query?: Record<string, string>; params?: Record<string, string> }): void {
    const navigate = () =>
      router
        .push({
          name: target.name,
          params: target.params,
          query: { ...(target.query ?? {}), from: route.fullPath },
        })
        .catch(() => {
          /* 重复导航（已在目标页）产生的 rejection 忽略，与 NavRail 同口径 */
        });
    // 首帧里 route 还是 vue-router 的 START_LOCATION（matched 为空、fullPath 是 '/'）：
    // 这时拼出来的 from 会把"返回来源"写成首页，落地页的返回按钮就丢了真实来路。
    // 实测（把聊天页分包拦 1.5s）：首启欢迎窗恰好在这一帧可点，100% 命中。
    // 只在这一种情况下等首次导航解析完再拼；已就绪时仍走同步推送，不改变既有调用时序。
    // （不改成"应用挂载前 await router.isReady"：那会让路由守卫早于 App.onMounted 的
    //   存储注入执行，深链类用例成片变红——2026-10-27 实测 6 条。）
    if (router.currentRoute.value.matched.length === 0) {
      void router.isReady().then(navigate);
    } else {
      void navigate();
    }
  }

  function backFromQuery(): void {
    if (fromPath.value) void router.replace(fromPath.value);
    else if (window.history.state?.back) void router.back();
    else void router.push({ name: 'chat' });
  }

  return { fromPath, pushWithReturn, backFromQuery };
}
