/**
 * 键盘高度探测（写 `--keyboard-inset`）
 *
 * 为什么需要：软键盘收缩哪个视口，引擎之间不一致。
 * - Android（本仓 2026-10-16 真机实测）：manifest 的 `adjustResize` + viewport meta 的
 *   `interactive-widget=resizes-content` 让**布局视口**跟着缩，`innerHeight` 842→530，
 *   `visualViewport.height` 同步变小 ⇒ 差值为 0，本模块什么都不做。
 * - iOS Safari：只缩**视觉视口**，`innerHeight` 不变，固定在底部的输入条会留在键盘下面。
 *   这一档靠这里的差值把输入条抬上去。
 *
 * 取值口径：`innerHeight - (visualViewport.height + visualViewport.offsetTop)`，
 * 下限 0。用 `offsetTop` 是因为页面被键盘顶起滚动时，视觉视口的原点会离开文档顶部。
 *
 * 边界要说清：iOS 那条路径**没有 iOS 设备可验**（本机是 Windows，无 Xcode/模拟器），
 * 只有按真实数值形状写的单测；Android 侧是实测过"差值为 0、不重复抬升"的。
 */

const KEY = '--keyboard-inset';

/** 返回一个停止监听的函数（测试与热更新用） */
export function startKeyboardInset(): () => void {
  if (typeof window === 'undefined') return () => {};
  const vv = window.visualViewport;
  if (!vv) return () => {}; // 老引擎没有 visualViewport：不猜、不写

  const root = document.documentElement;

  const update = () => {
    // 视觉视口被缩放（用户双指放大）时 scale≠1，height 已是缩放后的 CSS 像素，
    // 这时再按差值抬升会抬过头，所以只在 1 倍时处理。
    const scale = Number.isFinite(vv.scale) && vv.scale > 0 ? vv.scale : 1;
    const visible = vv.height + vv.offsetTop;
    const inset = scale === 1 ? Math.max(0, Math.round(window.innerHeight - visible)) : 0;
    root.style.setProperty(KEY, `${inset}px`);
  };

  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
