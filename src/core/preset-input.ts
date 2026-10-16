/**
 * 有预设值的输入框：聚焦时清空、没改就失焦回填
 *
 * 诉求（2026-10-14）："有默认值时，写入数字时默认值还保留，还要手动去删除。"
 * 本模块把这条变成一个全局行为，不给 40 多处调用点各加一遍：
 * - 聚焦时若已有值 ⇒ 清空并把**原值挪到 placeholder**（不是消失，是挪个位置继续看得见）；
 * - 用户一个字都没输入 ⇒ 失焦时写回原值；
 * - 用户输入过（包括输入后又自己删空）⇒ 保持他给的结果，不再回填。
 *
 * 三条实现约束是这套行为不出事的前提：
 * 1. 清空/回填只用**属性方式**改 `el.value`，不派发 `input`/`change`。
 *    Vue 的 `v-model` 与 `@change` 都挂在事件上，所以"聚焦清空"不会被误当成用户改动写进 store；
 *    反过来，一旦真派发就会把默认值冲没 —— 那正是下面那条 topP 陷阱的成因。
 * 2. "输入过"以 `input` 事件为准（不是"值变了"）。全仓有一类字段是
 *    **留空＝不传＝用供应商默认**（`SettingsModelPanel.vue` 的 topP / presence / frequency），
 *    判据若用"值变了"，用户想把它清空回"未设置"就会被失焦回填挡死。
 * 3. 只接管 `number` 一类。理由是这类字段的痛点最实（8192 / 1024 / 0.7 这种预置数字，
 *    要先手动删干净才能输入新的），而**文本框不该被清**：角色名、API 地址、自定义 CSS
 *    这些是"进去接着改几个字"的编辑动作，聚焦就清空会把人删掉自己没打算动的内容。
 *    （2026-10-14 用户定：收成只有 number。）
 *    `range`（无法为空）、`select` / `checkbox` / `radio` / `file` / `password` / `textarea`
 *    一律不接管；带 `data-preset-off` 的元素也不接管（个别的号确实要保留老行为时的退出阀）。
 *
 * 为什么用全局委托而不是像 `v-range` 那样逐点挂指令：`v-range` 的顾虑是"属性式改值收不到"，
 * 而这里只在 focus 的那一刻读一次 `el.value`，DOM 上此刻是什么就是什么，v-model 改的值同样读得到；
 * 逐点挂指令则要动 40 多个文件，改漏一处就出现"这个框会清、那个框不会"的不一致。
 */

/** 被接管元素的一次编辑会话状态 */
type PresetSession = {
  /** 聚焦那一刻的原值 */
  value: string;
  /** 元素本来的 placeholder（可能没有），失焦时要还原成它 */
  placeholder: string | null;
  /** 用户是否输入过 */
  dirty: boolean;
};

const ACTIVE = new WeakMap<Element, PresetSession>();

function isField(el: EventTarget | null): el is HTMLInputElement {
  // 只认 number：其余类型（range / select / checkbox / file / password，以及文本框与
  // textarea）都不接管 —— 见文件头第 3 条约束里"文本框不该被清"那条判断。
  return el instanceof HTMLInputElement && el.type === 'number';
}

function onFocusIn(ev: FocusEvent): void {
  const el = ev.target;
  if (!isField(el) || ACTIVE.has(el)) return;
  if (el.hasAttribute('data-preset-off')) return;
  const original = el.value;
  if (original === '') return; // 本来就空着：没有要挪走的预设值
  ACTIVE.set(el, { value: original, placeholder: el.getAttribute('placeholder'), dirty: false });
  el.value = '';
  el.placeholder = original;
}

/** 只在捕获阶段记"用户输入过"，不改值也不阻止任何默认行为 */
function onInput(ev: Event): void {
  const st = ev.target instanceof HTMLElement ? ACTIVE.get(ev.target) : undefined;
  if (st) st.dirty = true;
}

function onFocusOut(ev: FocusEvent): void {
  const el = ev.target;
  if (!isField(el)) return;
  const st = ACTIVE.get(el);
  if (!st) return;
  ACTIVE.delete(el);
  // placeholder 是我们临时挪过去的，无论后面走哪条分支都要先还原
  if (st.placeholder === null) el.removeAttribute('placeholder');
  else el.setAttribute('placeholder', st.placeholder);
  if (!st.dirty && el.value === '') el.value = st.value;
}

let installed = false;

/** 装一次（重复调用无效）；SSR / 非浏览器环境下不调用 */
export function installPresetInputBehavior(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('focusin', onFocusIn);
  // 失焦时 Vue 可能正在重渲染（v-model 回写），用捕获阶段先于组件自身的 blur 处理
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('input', onInput, true);
}

/** 仅供测试：卸掉监听器并复位单例标记 */
export function uninstallPresetInputBehaviorForTest(): void {
  if (typeof document === 'undefined') return;
  document.removeEventListener('focusin', onFocusIn);
  document.removeEventListener('focusout', onFocusOut, true);
  document.removeEventListener('input', onInput, true);
  installed = false;
}
