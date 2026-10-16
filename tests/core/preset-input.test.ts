/**
 * 有预设值输入框的"聚焦清空 / 未改回填"行为
 *
 * 每条都对着一条会出事的地方写：
 * - 清空**不得**派发 input/change（否则会把默认值当作用户改动落进 store，
 *   而 `SettingsView.vue` 那批是 `:value` + `@change` 的写法，收事件不收回写）；
 * - "输入过"必须按事件判，不是按"值变了"判 —— 否则 `SettingsModelPanel.vue` 里
 *   "留空＝不传＝用供应商默认"的 topP / presence / frequency 永远清不掉；
 * - 原 placeholder 不能被吃掉；
 * - range / select / password / 显式 `data-preset-off` 不接管。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPresetInputBehavior, uninstallPresetInputBehaviorForTest } from '@/core/preset-input';

type AnyField = HTMLInputElement | HTMLTextAreaElement;

function focus(el: AnyField): void {
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

function blur(el: AnyField): void {
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

/** 模拟真实键入：派发 input 事件并把值写进去（顺序与浏览器一致） */
function type(el: AnyField, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function makeNumber(value: string, extra: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'number';
  el.value = value;
  for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('preset-input', () => {
  let events: string[];
  let spy: (e: Event) => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    events = [];
    spy = (e: Event) => events.push(e.type);
    document.addEventListener('input', spy, true);
    document.addEventListener('change', spy, true);
    installPresetInputBehavior();
  });

  afterEach(() => {
    document.removeEventListener('input', spy, true);
    document.removeEventListener('change', spy, true);
    uninstallPresetInputBehaviorForTest();
  });

  it('聚焦时有预设值 ⇒ 清空并把原值挪到 placeholder', () => {
    const el = makeNumber('8192');
    focus(el);
    expect(el.value).toBe('');
    expect(el.placeholder).toBe('8192');
  });

  it('清空与回填都不派发 input/change（不会把默认值当成用户改动落盘）', () => {
    const el = makeNumber('1024');
    focus(el);
    blur(el);
    expect(events).toEqual([]);
    expect(el.value).toBe('1024');
  });

  it('一个字都没输入 ⇒ 失焦写回原值，placeholder 撤掉', () => {
    const el = makeNumber('1024');
    focus(el);
    blur(el);
    expect(el.value).toBe('1024');
    expect(el.hasAttribute('placeholder')).toBe(false);
  });

  it('输入过 ⇒ 保留用户给的值，placeholder 还原', () => {
    const el = makeNumber('8192');
    focus(el);
    type(el, '32000');
    blur(el);
    expect(el.value).toBe('32000');
    expect(el.hasAttribute('placeholder')).toBe(false);
  });

  it('输入后又自己删空 ⇒ 视为"要留空"，失焦不回填（topP 那类留空＝不传的字段靠这条）', () => {
    const el = makeNumber('0.8');
    focus(el);
    type(el, '0.5');
    type(el, '');
    blur(el);
    expect(el.value).toBe('');
    expect(events).toEqual(['input', 'input']);
  });

  it('本来就空着的框 ⇒ 聚焦不做任何事', () => {
    const el = makeNumber('');
    focus(el);
    expect(el.value).toBe('');
    expect(el.hasAttribute('placeholder')).toBe(false);
    blur(el);
  });

  it('原有 placeholder 在失焦后回到原位（临时挪用它，不吞掉）', () => {
    const el = makeNumber('44100', { placeholder: '请输入采样率' });
    focus(el);
    expect(el.placeholder).toBe('44100');
    blur(el);
    expect(el.placeholder).toBe('请输入采样率');
  });

  it('textarea / text / url 不接管（用户定：只收 number —— 文本框是"进去接着改几个字"）', () => {
    const ta = document.createElement('textarea');
    ta.value = '已有的自定义 CSS';
    const text = makeNumber('', { type: 'text' });
    text.value = '雨夜的港口城市';
    const url = makeNumber('', { type: 'url' });
    url.value = 'https://api.example.com';
    document.body.append(ta, text, url);

    for (const el of [ta, text, url] as AnyField[]) {
      focus(el);
      expect(el.value).not.toBe('');
      expect(el.placeholder ?? '').toBe('');
      blur(el);
    }
  });

  it('range / select / password / data-preset-off 不接管', () => {
    const range = document.createElement('input');
    range.type = 'range';
    range.value = '60';
    const select = document.createElement('select');
    const opt = document.createElement('option');
    opt.value = 'a';
    select.appendChild(opt);
    select.value = 'a';
    const pwd = document.createElement('input');
    pwd.type = 'password';
    pwd.value = 'secret';
    const optedOut = makeNumber('0.7', { 'data-preset-off': '' });
    document.body.append(range, select, pwd);

    for (const el of [range, select, pwd, optedOut] as AnyField[]) {
      focus(el);
      expect(el.value).not.toBe('');
      expect(el.placeholder ?? '').toBe('');
      blur(el);
    }
  });

  it('重复 focusin（焦点没走）不会把已清空的状态当成原值记下来', () => {
    const el = makeNumber('7');
    focus(el);
    focus(el);
    blur(el);
    expect(el.value).toBe('7');
  });
});
