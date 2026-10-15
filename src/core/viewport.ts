import { ref, onMounted, onUnmounted } from 'vue';

/**
 * L4 视口状态层（跨端评审 S-10 / G-4 / G-5）：
 * 全仓「唯一」允许调用 window.matchMedia 的位置。
 * 业务层 / 组件层一律通过 useViewport() 取响应式端状态，禁止自行 matchMedia。
 *
 * 端语义（与 tokens-responsive.css 的 --bp-* 对齐）：
 * - isMobile   ≤640   移动：单栏 + 底部 Tab + 抽屉
 * - isTablet  641–1024 平板：次要抽屉化
 * - isCompact ≤1024   非桌面总边界（抽屉形态生效区间）
 * - isDesktop ≥1025   桌面：三栏
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

const queries = {
  compact: '(max-width: 1024px)',
  mobile: '(max-width: 640px)',
  tablet: '(min-width: 641px) and (max-width: 1024px)',
  desktop: '(min-width: 1025px)',
  /** 指针形态（能力查询，非断点）：coarse = 手指。用于「软键盘没有 Shift 键」这类端差异 */
  coarse: '(pointer: coarse)',
} as const;

function mq(q: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(q).matches
  );
}

// 模块级单例：全仓共享同一份响应式端状态
export const isCompact = ref(mq(queries.compact));
export const isMobile = ref(mq(queries.mobile));
export const isTablet = ref(mq(queries.tablet));
export const isDesktop = ref(mq(queries.desktop));
export const isCoarsePointer = ref(mq(queries.coarse));

let bound = false;
function update() {
  isCompact.value = mq(queries.compact);
  isMobile.value = mq(queries.mobile);
  isTablet.value = mq(queries.tablet);
  isDesktop.value = mq(queries.desktop);
  isCoarsePointer.value = mq(queries.coarse);
}
function bind() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  window.addEventListener('resize', update);
}
function unbind() {
  if (!bound) return;
  bound = false;
  window.removeEventListener('resize', update);
}

export function useViewport() {
  onMounted(bind);
  onUnmounted(unbind);
  return { isCompact, isMobile, isTablet, isDesktop, isCoarsePointer, breakpoints };
}
