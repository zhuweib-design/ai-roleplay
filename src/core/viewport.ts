import { computed, onMounted, onUnmounted, ref, type ComputedRef } from 'vue';

/**
 * L4 视口状态层（跨端评审 S-10 / G-4 / G-5；批次 2-5 收敛为单一运行时值）
 *
 * 全仓「唯一」允许调用 window.matchMedia 的位置。业务层 / 组件层一律通过
 * `useViewport()` 取响应式端状态，禁止自行 matchMedia。
 *
 * ## 单一运行时值
 *
 * 端状态只有**一个**真值：`viewportMode`（mobile / tablet / desktop）。
 * `isMobile` / `isTablet` / `isCompact` / `isDesktop` 四个布尔量全部由它派生，
 * 由 `syncFlags()` 一处赋值——**不再各查一条 media query**。
 *
 * 批次 2-5 之前是四条独立 query：一旦某条 query 与环境不一致（jsdom 里
 * matchMedia 全返回 false），就会出现"既不是移动也不是平板也不是桌面"的状态，
 * 而 `isCompact` 的消费者（ChatView 的抽屉焦点、character store 的 togglePanel）
 * 会各自看到不同的世界。
 *
 * 端语义（与 tokens-responsive.css 的 --bp-* 对齐）：
 * - mobile   ≤640    单栏 + 底部 Tab + 抽屉
 * - tablet   641–1024 平板：次要抽屉化
 * - desktop  ≥1025   桌面：三栏
 * - `isCompact` = 非桌面（mobile + tablet），抽屉形态生效区间
 *
 * ## force-desktop
 *
 * QA 需要在手机上验桌面布局（反之亦然），但改窗口宽度验不了"桌面三栏"。
 * `?forceDesktop=1` 或 `setForceDesktop(true)` 把 mode 钉成 desktop：
 * 于是 `isMobile` 为 false ⇒ App.vue 的 `showBottomNav` 不渲染底部导航，
 * NavRail 接管。`?forceDesktop=0` 解除。选择会写进 localStorage，
 * 跨路由导航不会丢（query 会被路由丢掉，localStorage 不会）。
 */
export const breakpoints = {
  mobileMax: 640,
  tabletMin: 641,
  tabletMax: 1024,
  desktopMin: 1025,
  narrowMax: 380,
  landscapeH: 480,
  landscapeW: 900,
} as const;

export type ViewportMode = 'mobile' | 'tablet' | 'desktop';

/** 模式判定用的 query（按顺序取第一个命中的）。只有这里允许出现断点字面量 */
const MODE_QUERIES: ReadonlyArray<readonly [ViewportMode, string]> = [
  ['mobile', '(max-width: 640px)'],
  ['tablet', '(min-width: 641px) and (max-width: 1024px)'],
];

/** 指针形态（能力查询，非断点）：coarse = 手指。用于「软键盘没有 Shift 键」这类端差异 */
const COARSE_QUERY = '(pointer: coarse)';

const FORCE_DESKTOP_KEY = 'aijiu.forceDesktop';

function mq(q: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(q).matches
  );
}

/**
 * 当前模式。
 *
 * 没有命中任何一条 query 时返回 `desktop`——这是"默认桌面"的显式表达，
 * 而不是"三者皆假"的第三态。jsdom（matchMedia 恒 false）也走这条，
 * 于是单测环境的行为与真实桌面一致。
 */
function detectMode(): ViewportMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  for (const [mode, query] of MODE_QUERIES) {
    if (window.matchMedia(query).matches) return mode;
  }
  return 'desktop';
}

// ── 唯一真值 ──
const rawMode = ref<ViewportMode>(detectMode());
const forcedDesktop = ref(false);

/** 实际生效的模式（force-desktop 优先） */
export const viewportMode: ComputedRef<ViewportMode> = computed(() =>
  forcedDesktop.value ? 'desktop' : rawMode.value
);

// ── 派生量（全部由 syncFlags 一处赋值） ──
export const isMobile = ref(false);
export const isTablet = ref(false);
export const isCompact = ref(false);
export const isDesktop = ref(false);
export const isCoarsePointer = ref(mq(COARSE_QUERY));

function syncFlags(): void {
  const mode = viewportMode.value;
  isMobile.value = mode === 'mobile';
  isTablet.value = mode === 'tablet';
  isCompact.value = mode !== 'desktop';
  isDesktop.value = mode === 'desktop';
  isCoarsePointer.value = mq(COARSE_QUERY);
}

// 模块加载时先对齐一次，别让四个派生量停在初始 false 上
syncFlags();

/** 切换模式（resize 与测试都走这里，保证四个派生量同步） */
export function setViewportMode(mode: ViewportMode): void {
  rawMode.value = mode;
  syncFlags();
}

/** 强制桌面档。开启后 isMobile / isTablet / isCompact 全为 false */
export function setForceDesktop(on: boolean): void {
  forcedDesktop.value = on;
  syncFlags();
}

export function isForceDesktop(): boolean {
  return forcedDesktop.value;
}

function readStoredForce(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FORCE_DESKTOP_KEY) === '1';
  } catch {
    return false; // 隐私模式 / 禁用 storage：当作未强制
  }
}

function storeForce(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(FORCE_DESKTOP_KEY, '1');
    else localStorage.removeItem(FORCE_DESKTOP_KEY);
  } catch {
    /* storage 不可写时忽略：force-desktop 只是调试开关，不该因此报错 */
  }
}

/**
 * 从 URL 读 `?forceDesktop=1|0`，读到了就落地并持久化；没读到则沿用上次的持久化值。
 * 返回最终是否处于强制桌面。
 */
export function applyForceDesktopFromUrl(search?: string): boolean {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(query);
  const raw = params.get('forceDesktop');
  if (raw === '1' || raw === 'true') {
    setForceDesktop(true);
    storeForce(true);
  } else if (raw === '0' || raw === 'false') {
    setForceDesktop(false);
    storeForce(false);
  } else {
    // 没有显式参数：恢复持久化状态（跨路由导航会丢 query，不能丢开关）
    setForceDesktop(readStoredForce());
  }
  return forcedDesktop.value;
}

// 模块加载即生效：`?forceDesktop=1` 打开页面时第一帧就是桌面布局，
// 不会先渲染一帧底部导航再切走。
applyForceDesktopFromUrl();

// ── 订阅与 resize ──
// 引用计数：多个组件同时用 useViewport 时，先卸载的那个不能把监听器摘掉
// （批次 2-5 之前是布尔量 bound，任何一个组件卸载都会让其余组件失去响应）。
let subscribers = 0;

function handleResize(): void {
  setViewportMode(detectMode());
}

function bind(): void {
  subscribers += 1;
  if (subscribers > 1 || typeof window === 'undefined') return;
  window.addEventListener('resize', handleResize);
}

function unbind(): void {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers > 0 || typeof window === 'undefined') return;
  window.removeEventListener('resize', handleResize);
}

/** 当前订阅者数量（只给测试与调试用，业务代码不要依赖） */
export function viewportSubscriberCount(): number {
  return subscribers;
}

export function useViewport() {
  onMounted(bind);
  onUnmounted(unbind);
  return {
    isCompact,
    isMobile,
    isTablet,
    isDesktop,
    isCoarsePointer,
    viewportMode,
    breakpoints,
  };
}
