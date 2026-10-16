/**
 * build-components.mjs —— 生成原子 / 分子 / 组织组件展示页
 *
 * 展示页同时引入四套主题，通过顶部切换器改写根元素 data-theme，
 * 以此证明「组件与风格解耦」。
 *
 * 运行： node tools/build-components.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, THEMES, COMPONENT_CSS, page } from './site.mjs';
import { inlineIcons, ICONS, svg } from './icons.mjs';

/* 风格切换器 */
const themeSwitcher = () =>
  '<div class="theme-switcher" role="group" aria-label="切换设计风格">' +
  THEMES.map((t) =>
    '<button type="button" class="theme-switcher__item" data-theme-switch="' + t.id + '" aria-pressed="false">' +
      '<span class="theme-switcher__dot"></span>' + t.name +
    '</button>'
  ).join('') +
  '</div>';

/* 图标总览网格 */
const iconGrid = () =>
  Object.keys(ICONS).map((name) =>
    '<div class="icon-cell">' + svg(name) + '<span>' + name + '</span></div>'
  ).join('\n');

const PAGES = [
  { file: 'atoms', partial: 'atoms-body.html', title: '原子组件' },
  { file: 'molecules', partial: 'molecules-body.html', title: '分子组件' },
  { file: 'organisms', partial: 'organisms-body.html', title: '组织组件' }
];

for (const p of PAGES) {
  let body = fs.readFileSync(path.join(ROOT, 'partials', p.partial), 'utf8');
  body = body.replace('<!--THEME_SWITCHER-->', themeSwitcher());
  body = body.replace('<!--ICON_GRID-->', iconGrid());
  body = inlineIcons(body);

  const html = page({
    title: p.title + ' —— AI 虚拟对话界面组件库',
    themeId: 'a',
    cssFiles: COMPONENT_CSS,
    content: body,
    scripts: ['../js/slider-fill.js', '../js/theme-switch.js']
  });

  fs.writeFileSync(path.join(ROOT, 'components', p.file + '.html'), html, 'utf8');
  console.log('生成 components/' + p.file + '.html');
}
