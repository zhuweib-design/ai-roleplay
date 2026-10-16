/**
 * v-tip —把 `title=` 换成键盘与触屏也拿得到的提示（§七 #14）
 *
 * 为什么不直接把 33 处 `title=` 迁到 HelpTip 组件（实测后才定的方案）：
 * - HelpTip 自己渲染一个 `<button>`，而 33 处里有 21 处的宿主本身就是按钮/链接
 *   ——按钮里再放按钮是非法 HTML；
 * - 多数站点在 `v-for` 里（侧栏 15 个、世界书树可达数百行），
 *   HelpTip 的 id 由文案键派生，同一份文案在每行都会生成同一个 id，
 *   `aria-describedby` 会全部指到第一行；
 * - 一半以上的站点是**插值后的字符串或数据字段**（`{level} 层级`、`preset.description`），
 *   HelpTip 只接受 `MessageKey`。
 *
 * 指令形态解决这三点：宿主元素不变，气泡节点由指令生成并挂在 body 上，
 * id 用自增计数器保证唯一，值可以是任意字符串且随绑定更新。
 *
 * 无障碍契约：
 * - 气泡节点常驻 DOM（`opacity: 0`，不是 `display:none`/`visibility:hidden`，
 *   否则 accname 计算会跳过它，读屏就拿不到描述了），宿主上永久挂 `aria-describedby`；
 * - 可见性只由 hover / 聚焦 / 点击 三种输入决定，Esc 与滚动收起；
 * - 原生 `title` 由指令移除，避免同一个提示出现两套（浏览器原生气泡 + 我们的气泡）。
 */

const CLASS = 'tk-tip';
let seq = 0;
const state = new WeakMap<HTMLElement, TipState>();

interface TipState {
  bubble: HTMLElement;
  show: () => void;
  hide: () => void;
}

function ensureBubble(el: HTMLElement): TipState {
  const existing = state.get(el);
  if (existing) return existing;

  const bubble = document.createElement('span');
  bubble.className = CLASS;
  bubble.id = `tk-tip-${++seq}`;
  bubble.setAttribute('role', 'tooltip');
  // 常驻但不可见：accname 会读它，视觉上等到触发才定位显示
  document.body.appendChild(bubble);
  el.setAttribute('aria-describedby', bubble.id);

  const show = () => {
    const rect = el.getBoundingClientRect();
    bubble.classList.add('is-visible');
    // 先量尺寸再定位，避免从 0,0 飞出造成抖动
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = rect.top - bh - 8;
    if (top < 8) top = rect.bottom + 8; // 上方放不下就翻到下方
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  };
  const hide = () => bubble.classList.remove('is-visible');

  const tipState: TipState = { bubble, show, hide };
  state.set(el, tipState);
  return tipState;
}

function onEnter(this: HTMLElement) {
  state.get(this)?.show();
}
function onLeave(this: HTMLElement) {
  state.get(this)?.hide();
}
function onKeydown(this: HTMLElement, event: KeyboardEvent) {
  if (event.key === 'Escape') state.get(this)?.hide();
}
function onScroll() {
  // 气泡是 fixed 定位，滚动后位置就错了，直接收起
  document.querySelectorAll(`.${CLASS}.is-visible`).forEach((node) => node.classList.remove('is-visible'));
}

let scrollBound = false;

export const vTip = {
  mounted(el: HTMLElement, binding: { value?: unknown }) {
    const text = typeof binding.value === 'string' ? binding.value : '';
    if (!text) return;
    const { bubble } = ensureBubble(el);
    bubble.textContent = text;
    // 原生 title 与我们的气泡同时存在会出现两套提示（且原生的键盘不可达）
    el.removeAttribute('title');
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('focus', onEnter);
    el.addEventListener('blur', onLeave);
    el.addEventListener('keydown', onKeydown);
    if (!scrollBound) {
      window.addEventListener('scroll', onScroll, true);
      scrollBound = true;
    }
  },
  updated(el: HTMLElement, binding: { value?: unknown }) {
    const tipState = state.get(el);
    if (!tipState) return;
    const text = typeof binding.value === 'string' ? binding.value : '';
    tipState.bubble.textContent = text;
    if (!text) tipState.hide();
  },
  unmounted(el: HTMLElement) {
    const tipState = state.get(el);
    if (!tipState) return;
    el.removeEventListener('mouseenter', onEnter);
    el.removeEventListener('mouseleave', onLeave);
    el.removeEventListener('focus', onEnter);
    el.removeEventListener('blur', onLeave);
    el.removeEventListener('keydown', onKeydown);
    tipState.bubble.remove();
    state.delete(el);
  },
};
