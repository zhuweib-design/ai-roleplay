/**
 * 滑块进度着色（M2-b9）
 *
 * 用户的反馈是"滑块交互中颜色没有明显的变化"。根因：`.tk-range` / `.form-range`
 * 都关掉了原生外观（`appearance: none`）并把整条轨道刷成单一底色，
 * 于是拖动时只有圆点在动，轨道颜色一点不变 —— 原生控件本会有的"已填充一段"没了。
 *
 * 修法是给元素写一个 `--range-pct`，轨道用按该百分比分段的渐变（见 base.css）。
 * 两条更新路径都要有：
 * - `input` 监听：拖动即时跟随，不依赖组件是否因为这次输入而重渲染；
 * - `updated` 钩子：`v-model`/"重置"按钮以属性方式改值时不产生 input 事件，
 *   只有重新渲染才会跑，否则填充色会停在旧位置。
 * 用指令而不是全局 document 监听：全局委托同样收不到属性式改值，且要自己管理生命周期。
 */
import type { Directive } from 'vue';

/** 计算滑块当前值在 [min,max] 上的百分比（越界与非法输入都收敛到 0–100） */
export function rangePercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function paint(el: HTMLInputElement): void {
  const pct = rangePercent(Number(el.value), Number(el.min || '0'), Number(el.max || '100'));
  el.style.setProperty('--range-pct', `${pct.toFixed(2)}%`);
}

/** `v-range`：挂在 `<input type="range">` 上，把当前值刷成 --range-pct */
export const vRange: Directive<HTMLInputElement> = {
  mounted: (el) => {
    paint(el);
    el.addEventListener('input', () => paint(el));
  },
  updated: (el) => paint(el),
};
