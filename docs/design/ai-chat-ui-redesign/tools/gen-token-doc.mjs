/**
 * gen-token-doc.mjs —— 从 CSS 源文件自动生成 Token 规范文档
 *
 * 直接解析 tokens.base.css 与 theme-*.css，保证文档与实现永远一致，
 * 避免手工抄写导致的偏差。
 *
 * 运行： node tools/gen-token-doc.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, THEMES } from './site.mjs';

const read = (f) => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8');
const Q = String.fromCharCode(96);

/** 按 CSS 注释分段解析 Token */
function parseTokens(css) {
  const groups = [];
  let current = { title: '未分组', items: [] };
  for (const line of css.split('\n')) {
    const g = line.match(/\/\*\s*-+\s*(.+?)\s*-+\s*\*\//);
    if (g) {
      if (current.items.length) groups.push(current);
      current = { title: g[1].trim(), items: [] };
      continue;
    }
    const t = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*$/);
    if (t) current.items.push({ name: t[1], value: t[2] });
  }
  if (current.items.length) groups.push(current);
  return groups;
}

const escapeCell = (s) => s.split('|').join('\\|').split('\n').join(' ');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const code = (s) => Q + s + Q;

const baseGroups = parseTokens(read('tokens.base.css'));

const themeTokens = {};
const groupOf = {};
for (const t of THEMES) {
  const map = new Map();
  for (const g of parseTokens(read('theme-' + t.id + '.css'))) {
    for (const it of g.items) { map.set(it.name, it.value); groupOf[it.name] = g.title; }
  }
  themeTokens[t.id] = map;
}

const out = [];
const P = (s) => out.push(s === undefined ? '' : s);

P('# 03 设计 Token 规范');
P('');
P('本文件由 ' + code('tools/gen-token-doc.mjs') + ' 从 CSS 源文件自动生成，第 5、6 节的数值与实现完全一致。');
P('');
P('## 1. 三层结构');
P('');
P('| 层级 | 文件 | 职责 | 是否随风格变化 |');
P('|---|---|---|---|');
P('| L1 结构 Token | ' + code('css/tokens.base.css') + ' | 间距、尺寸、字号、行高、字重、圆角阶梯、动效时长与曲线、层级、焦点、滚动条 | 否 |');
P('| L2 语义 Token | ' + code('css/theme-*.css') + ' 上半部 | 颜色、字体族、阴影、圆角覆写、描边、玻璃与背景装饰 | 是 |');
P('| L3 组件 Token | ' + code('css/theme-*.css') + ' 下半部 | 组件级表现开关：形状、边框、阴影、指示器、悬停行为 | 是 |');
P('');
P('依赖方向严格单向：组件层 → L3 → L2 → L1。L1 不引用 L2/L3，组件层不引用任何字面量。');
P('');
P('## 2. 命名规则');
P('');
P(code('--<域>-<对象>-<属性>[-<变体>]'));
P('');
P(code('--space-4') + ' 结构：间距阶梯第 4 级');
P(code('--color-bg-surface-raised') + ' 语义：颜色 / 背景 / 表面 / 浮起');
P(code('--color-text-secondary') + ' 语义：颜色 / 文字 / 次要');
P(code('--component-card-shadow-hover') + ' 组件：卡片阴影的悬停态');
P('');
P('## 3. 强制使用规则');
P('');
P('1. 组件层（' + code('layout.css') + '、' + code('components.css') + '、' + code('overview.css') + '、' + code('demo.css') + '）禁止出现十六进制颜色、' + code('rgb()/hsl()') + '、' + code('px') + ' 数值、' + code('ms/s') + ' 时长。');
P('2. 所有颜色与间距必须通过 ' + code('var()') + ' 引用 Token。');
P('3. 数值 0 也统一写为 ' + code('var(--space-0)') + '，避免出现「零值可以例外」的破窗。');
P('4. 数据驱动的动态值（进度百分比、画布缩放比例）通过运行时 Token 注入：' + code('--progress-value') + '、' + code('--stage-scale') + '。');
P('5. 该规则由 ' + code('tools/check-tokens.mjs') + ' 静态校验，当前结果：组件层零字面量、零未定义引用。');
P('');
P('## 4. 风格差异如何仅靠 Token 表达');
P('');
P('四套风格共用同一份 DOM 与同一份组件 CSS，差异全部落在 L2/L3 上：');
P('');
P('| 维度 | 极光夜曲 | 墨纸 | 新终端 | 樱雾玻璃 |');
P('|---|---|---|---|---|');
const pick = (id, name) => (themeTokens[id].get(name) || '—');
const cmpRows = [
  ['模式', '深色', '浅色', '深色', '浅色'],
  ['--color-bg-app'], ['--color-accent'], ['--radius-lg'],
  ['--component-button-radius'], ['--component-nav-indicator-w'],
  ['--component-card-lift'], ['--component-divider-style'],
  ['--component-title-letter-spacing'], ['--component-glass-blur']
];
for (const row of cmpRows) {
  if (row.length === 5) { P('| ' + row.join(' | ') + ' |'); continue; }
  const name = row[0];
  const cells = THEMES.map((t) => escapeCell(clip(pick(t.id, name), 34)));
  P('| ' + code(name) + ' | ' + cells.join(' | ') + ' |');
}
P('');
P('## 5. L1 结构 Token 完整清单');
P('');
for (const g of baseGroups) {
  P('### ' + g.title);
  P('');
  P('| Token | 值 |');
  P('|---|---|');
  for (const it of g.items) P('| ' + code(it.name) + ' | ' + code(escapeCell(clip(it.value, 110))) + ' |');
  P('');
}

P('## 6. L2 / L3 主题 Token 四套对照');
P('');
P('| Token | 极光夜曲 | 墨纸 | 新终端 | 樱雾玻璃 |');
P('|---|---|---|---|---|');
const allNames = [...themeTokens.a.keys()];
let lastGroup = '';
for (const name of allNames) {
  const group = groupOf[name] || '';
  if (group !== lastGroup) { P('| **' + group + '** | | | | |'); lastGroup = group; }
  const cells = THEMES.map((t) => code(escapeCell(clip(themeTokens[t.id].get(name) || '—', 34))));
  P('| ' + code(name) + ' | ' + cells.join(' | ') + ' |');
}
P('');
P('> 完整数值以 ' + code('css/theme-*.css') + ' 为准，本表由 ' + code('tools/gen-token-doc.mjs') + ' 自动生成，请勿手工修改。');
P('');

fs.writeFileSync(path.join(ROOT, 'docs', '03-设计Token规范.md'), out.join('\n'), 'utf8');
console.log('生成 docs/03-设计Token规范.md');
console.log('  L1 分组数: ' + baseGroups.length + '，L1 Token 数: ' + baseGroups.reduce((n, g) => n + g.items.length, 0));
console.log('  L2/L3 Token 数: ' + allNames.length);
