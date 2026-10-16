/**
 * build-pages.mjs —— 生成四套风格的完整页面与风格总览
 *
 * 运行： node tools/build-pages.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, THEMES, THEME_GROUPS, COMMON_CSS, page } from './site.mjs';
import { inlineIcons } from './icons.mjs';

/* 1. 共享 DOM：四套风格共用同一份结构 */
const rawBody = fs.readFileSync(path.join(ROOT, 'partials', 'page-body.html'), 'utf8');
const body = inlineIcons(rawBody);

/* 2. 四套风格页面 */
for (const t of THEMES) {
  const html = page({
    title: t.name + ' / ' + t.en + ' —— AI 虚拟对话界面（1920 x 1080）',
    themeId: t.id,
    cssFiles: [...COMMON_CSS.slice(0, 2), 'css/theme-' + t.id + '.css', ...COMMON_CSS.slice(2)],
    content: body,
    scripts: ['js/slider-fill.js', 'js/panel-toggle.js', 'js/stage-scale.js']
  });
  const file = 'style-' + t.id + '.html';
  fs.writeFileSync(path.join(ROOT, file), html, 'utf8');
  console.log('生成 ' + file);
}

/* 3. 风格总览 index.html */
const swatch = (token, label) =>
  '<div class="swatch">' +
    '<span class="swatch__chip" style="background-color: var(' + token + ')"></span>' +
    '<span>' + label + '</span>' +
  '</div>';

const previewFor = () =>
  '<div class="overview-preview">' +
    '<div class="overview-preview__rail">' +
      '<span class="overview-preview__line overview-preview__line--accent"></span>' +
      '<span class="overview-preview__line"></span>' +
      '<span class="overview-preview__line"></span>' +
      '<span class="overview-preview__line overview-preview__line--short"></span>' +
    '</div>' +
    '<div class="overview-preview__main">' +
      '<span class="overview-preview__title"></span>' +
      '<span class="overview-preview__pill"></span>' +
      '<span class="overview-preview__pill overview-preview__pill--ghost"></span>' +
    '</div>' +
  '</div>';

const cardFor = (t) =>
  '<article class="overview-card" data-theme="' + t.id + '">' +
    previewFor() +
    '<div class="overview-card__body">' +
      '<div class="row row--between">' +
        '<h2 class="card__title">' + t.name + '</h2>' +
        '<span class="badge badge--mono">' + t.en + '</span>' +
      '</div>' +
      '<p class="card__subtitle">' + t.tagline + '</p>' +
      '<div class="overview-swatches">' +
        swatch('--color-bg-app', '背景') +
        swatch('--color-accent', '主色') +
        swatch('--color-accent-2', '辅色') +
        swatch('--color-highlight', '点缀') +
        swatch('--color-text-primary', '文字') +
      '</div>' +
      '<a class="btn btn--primary btn--block" href="style-' + t.id + '.html">' +
        '<i class="btn__icon" data-icon="eye"></i>打开完整页面</a>' +
    '</div>' +
  '</article>';

const groupSections = THEME_GROUPS.map((g) => {
  const list = THEMES.filter((t) => t.group === g.key);
  if (!list.length) return '';
  return [
    '<section class="overview-group">',
    '  <div class="overview-group__head">',
    '    <h2 class="overview-group__title">' + g.key + '风格</h2>',
    '    <p class="overview-group__desc">' + g.desc + '</p>',
    '  </div>',
    '  <div class="overview-grid">',
    list.map(cardFor).join('\n'),
    '  </div>',
    '</section>'
  ].join('\n');
}).filter(Boolean).join('\n');

const overviewContent = [
  '<div class="doc-page">',
  '  <div class="doc-page__inner">',
  '    <header class="stack stack--md">',
  '      <h1 class="doc-title">AI 虚拟对话界面 · 风格总览</h1>',
  '      <p class="doc-subtitle">同一套 DOM 结构与组件库，十三套设计 Token。基准画布 1920 x 1080。',
  '        所有颜色、间距、圆角、阴影均来自 Token，组件层不含任何硬编码取值。</p>',
  '      <div class="demo-row">',
  '        <a class="btn btn--sm" href="components/atoms.html"><i class="btn__icon" data-icon="box"></i>原子组件</a>',
  '        <a class="btn btn--sm" href="components/molecules.html"><i class="btn__icon" data-icon="layers"></i>分子组件</a>',
  '        <a class="btn btn--sm" href="components/organisms.html"><i class="btn__icon" data-icon="grid"></i>组织组件</a>',
  '        <a class="btn btn--sm" href="docs/01-需求与功能字段.md"><i class="btn__icon" data-icon="file-text"></i>设计文档</a>',
  '      </div>',
  '    </header>',
  groupSections,
  '  </div>',
  '</div>',
  ''
].join('\n');

const indexHtml = page({
  title: 'AI 虚拟对话界面 · 风格总览',
  themeId: 'a',
  cssFiles: [
    'css/reset.css', 'css/tokens.base.css',
    'css/theme-a.css', 'css/theme-b.css', 'css/theme-c.css', 'css/theme-d.css', 'css/theme-e.css',
    'css/theme-f.css', 'css/theme-g.css', 'css/theme-h.css', 'css/theme-i.css',
    'css/theme-j.css', 'css/theme-k.css', 'css/theme-l.css', 'css/theme-m.css',
    'css/layout.css', 'css/components.css', 'css/responsive.css', 'css/overview.css'
  ],
  content: inlineIcons(overviewContent)
});

fs.writeFileSync(path.join(ROOT, 'index.html'), indexHtml, 'utf8');
console.log('生成 index.html');
