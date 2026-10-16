/**
 * site.mjs —— 站点级共享定义
 * 供 build-pages.mjs 与 build-components.mjs 复用，避免重复维护风格清单与页面外壳。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录 */
export const ROOT = path.resolve(__dirname, '..');

/** 风格清单：id 必须与 css/theme-<id>.css 中的 [data-theme] 选择器一致 */
export const THEMES = [
  { id: 'a', name: '极光夜曲', en: 'Aurora Nocturne', group: '通用', tagline: '深色沉浸 · 玻璃拟态 · 极光光晕' },
  { id: 'b', name: '墨纸', en: 'Ink and Paper', group: '通用', tagline: '浅色阅读 · 直角细线 · 近乎无动效' },
  { id: 'c', name: '新终端', en: 'Neo Terminal', group: '通用', tagline: '纯黑 HUD · 全等宽字形 · 扫描线' },
  { id: 'd', name: '樱雾玻璃', en: 'Sakura Glass', group: '通用', tagline: '明亮柔和 · 超大圆角 · 彩色投影' },
  { id: 'e', name: '新粗野', en: 'Neo Brutal', group: '通用', tagline: '硬边框 · 硬阴影 · 零圆角 · 高饱和撞色' },
  { id: 'f', name: '赛璐璐', en: 'Cel Shade', group: '二次元', tagline: '动画平涂 · 双色硬切 · 网点纸' },
  { id: 'g', name: '魔法少女', en: 'Magical Girl', group: '二次元', tagline: '粉紫渐变 · 发光光晕 · 全圆角' },
  { id: 'h', name: '霓虹东京', en: 'Neon Tokyo', group: '二次元', tagline: '深蓝紫夜 · 霓虹粉青 · 赛博网格' },
  { id: 'i', name: '机甲机库', en: 'Mecha Hangar', group: '二次元', tagline: '枪灰金属 · 警示黄 · 工业硬边' },
  { id: 'j', name: '大正浪漫', en: 'Taisho Roman', group: '二次元', tagline: '和纸纹样 · 朱红描金 · 衬线标题' },
  { id: 'k', name: '水彩治愈', en: 'Watercolor Healing', group: '二次元', tagline: '淡彩晕染 · 柔和漫反射 · 纸纹' },
  { id: 'l', name: '蒸汽波', en: 'Vaporwave', group: '二次元', tagline: '深紫霓虹 · 透视网格 · 90 年代' },
  { id: 'm', name: '学园制服', en: 'School Uniform', group: '二次元', tagline: '藏青领巾红 · 苏格兰格 · 清爽' }
];

/** 总览页分组定义 */
export const THEME_GROUPS = [
  { key: '通用', desc: '面向通用产品的克制取向，覆盖深色沉浸、浅色阅读、终端、柔和与粗野。' },
  { key: '二次元', desc: '面向 ACG 场景，共 8 套：动画赛璐璐平涂、魔法少女、赛博和风、机甲工业、大正浪漫、水彩治愈、蒸汽波与学园制服。' }
];

/** 产品页面的样式加载顺序 */
export const COMMON_CSS = [
  'css/reset.css',
  'css/tokens.base.css',
  'css/layout.css',
  'css/components.css',
  'css/responsive.css'
];

/** 组件展示页的样式加载顺序（同时引入四套主题，靠 data-theme 切换） */
export const COMPONENT_CSS = [
  '../css/reset.css',
  '../css/tokens.base.css',
  '../css/theme-a.css',
  '../css/theme-b.css',
  '../css/theme-c.css',
  '../css/theme-d.css',
  '../css/theme-e.css',
  '../css/theme-f.css',
  '../css/theme-g.css',
  '../css/theme-h.css',
  '../css/theme-i.css',
  '../css/theme-j.css',
  '../css/theme-k.css',
  '../css/theme-l.css',
  '../css/theme-m.css',
  '../css/layout.css',
  '../css/components.css',
  '../css/responsive.css',
  '../css/overview.css',
  '../css/demo.css'
];

/** 生成一个完整的静态 HTML 页面外壳 */
export function page({ title, themeId, cssFiles, content, scripts = [], lang = 'zh-CN' }) {
  const links = cssFiles.map((f) => '  <link rel="stylesheet" href="' + f + '">').join('\n');
  const scriptsHtml = scripts.map((s) => '<script src="' + s + '"></script>').join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="' + lang + '" data-theme="' + themeId + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="color-scheme" content="dark light">',
    '  <title>' + title + '</title>',
    '  <!-- 样式加载顺序：重置 -> 结构 Token -> 主题 Token -> 布局 -> 组件 -->',
    links,
    '</head>',
    '<body>',
    content,
    scriptsHtml,
    '</body>',
    '</html>',
    ''
  ].join('\n');
}
