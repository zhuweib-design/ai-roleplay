#!/usr/bin/env node
/**
 * 把原型（docs/design/ai-chat-ui-redesign）的某套配色注入**真实产品页面**，
 * 出截图 + 在浏览器里实测文本对比度。
 *
 * 为什么不用静态门禁算：`scripts/check-contrast.mjs` 读的是 tokens.css 里的字面量配对，
 * 而产品有 `color-mix()` 派生层（--text-subheading 之类）与半透明背景，静态算不出来；
 * 设计师要看的恰恰是"落到真实页面上能不能读"。这里量的是渲染后的像素级答案。
 *
 * 用法（需 dev server 在跑）：
 *   node scripts/skin-preview.mjs                 # 默认跑通用的 5 款 a,b,c,d,e
 *   SKINS=a,b node scripts/skin-preview.mjs       # 指定哪几套
 *   OUT_DIR=docs/design/xxx node scripts/skin-preview.mjs
 *   BASE_URL=http://localhost:5179 node scripts/skin-preview.mjs
 *
 * 产出：
 *   <OUT_DIR>/<skin>-<route>.png   每套 × 每条路由一张截图
 *   <OUT_DIR>/preview-report.json  每套的对比度实测（最差配对、失败条数）与注入的变量清单
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROTO = path.join(ROOT, 'docs/design/ai-chat-ui-redesign/css');
const BASE = process.env.BASE_URL ?? 'http://localhost:5179';
const SKINS = (process.env.SKINS ?? 'a,b,c,d,e').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_DIR = process.env.OUT_DIR ?? path.join(ROOT, 'docs/design/THEME_5_GENERIC_PREVIEW');
const VIEWPORT = { width: 1280, height: 800 };

/** 截图用的路由：一眼能看出配色好坏的四个面 */
const ROUTES = [
  { path: '/chat', name: 'chat' },
  { path: '/character', name: 'characters' },
  { path: '/settings?cat=appearance', name: 'settings-appearance' },
  { path: '/worldbook', name: 'worldbook' },
];

const SKIN_NAMES = {
  base: '产品现状（默认深色）',
  a: '极光夜曲', b: '墨纸', c: '新终端', d: '樱雾玻璃', e: '新粗野',
  f: '赛璐璐', g: '魔法少女', h: '霓虹东京', i: '机甲机库', j: '大正浪漫', k: '水彩治愈', l: '蒸汽波', m: '学园制服',
};

/**
 * 原型 L2/L3 token → 产品语义变量。
 * 产品组件只认右边这一列名字（见 src/styles/tokens.css 与 theme-extractor.generateThemeTokens），
 * 所以"落地一套原型皮肤"的全部工作量就是这张表 + 表里补不上的那些。
 */
const MAP = {
  '--background': ['--color-bg-app'],
  '--card': ['--color-bg-panel', '--color-bg-surface'],
  '--card-elevated': ['--color-bg-surface-raised', '--color-bg-panel'],
  '--video-bg': ['--color-bg-inset', '--color-bg-canvas'],
  '--foreground': ['--color-text-primary'],
  '--muted-foreground': ['--color-text-secondary', '--color-text-tertiary'],
  '--on-media': ['--color-text-on-accent'],
  '--on-accent': ['--color-text-inverse', '--color-accent-contrast'],
  '--on-primary': ['--color-accent-contrast'],
  '--border': ['--color-border-strong', '--color-border-default'],
  '--primary': ['--color-accent'],
  '--primary-fg': ['--color-accent-hover', '--color-accent'],
  '--secondary': ['--color-accent-2', '--color-info'],
  '--ring': ['--color-focus-ring', '--color-accent-hover'],
  '--success': ['--color-success'],
  '--success-bg': ['--color-success-soft'],
  '--success-fg': ['--color-success'],
  '--destructive': ['--color-danger'],
  '--error': ['--color-danger'],
  '--error-bg': ['--color-danger-soft'],
  '--error-fg': ['--color-danger'],
  '--danger-fg': ['--color-danger'],
  '--danger-bg': ['--color-danger-soft'],
  '--danger-border': ['--color-danger-soft'],
  '--warning-fg': ['--color-warning'],
  '--warning-bg': ['--color-warning-soft'],
  '--warning-border': ['--color-warning-soft'],
  '--accent-blue': ['--color-info'],
  '--accent-orange': ['--color-warning', '--color-highlight'],
  '--tag-blue': ['--color-info'],
  '--tag-green': ['--color-success'],
  '--tag-purple': ['--color-accent'],
  '--tag-gray': ['--color-text-tertiary'],
  '--font-display': ['--font-family-display'],
  '--font-sans': ['--font-family-sans'],
  '--font-mono': ['--font-family-mono'],
  '--shadow-card': ['--shadow-sm'],
  '--shadow-elevated': ['--shadow-md'],
  '--shadow-popup': ['--shadow-lg'],
};

/** 结构层同名直传：原型每套都覆写这几条，正是 M18 说的"圆角同名不同值" */
const PASS_THROUGH = [
  '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl',
  '--size-border-thin', '--size-border-thick',
];

/** 解析原型主题文件：`--x: value;` 全量收集（含多行值以外的常规一行一条写法） */
function parseSkin(id) {
  if (id === 'base') return { id, file: '(产品现状，不注入)', vars: {} };
  const file = path.join(PROTO, `theme-${id}.css`);
  const text = fs.readFileSync(file, 'utf8');
  const vars = {};
  for (const m of text.matchAll(/^\s*(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    vars[m[1]] = m[2].trim();
  }
  return { id, file: path.relative(ROOT, file), vars };
}

/** 原型变量 → 产品变量的一张注入清单；同时记录"产品有、原型给不出"的缺口 */
function buildInjection(skin) {
  // INJECT_GROUPS=colors 时只注颜色，用来定位"某个非颜色变量把画面带歪了"这类问题
  const colorsOnly = process.env.INJECT_GROUPS === 'colors';
  const skip = /^--(radius|size-border|shadow|font)/;
  const set = {};
  const unresolved = [];
  for (const [productVar, candidates] of Object.entries(MAP)) {
    if (colorsOnly && skip.test(productVar)) continue;
    const hit = candidates.find((c) => skin.vars[c] !== undefined);
    if (hit) set[productVar] = skin.vars[hit];
    else unresolved.push(productVar);
  }
  if (!colorsOnly) {
    for (const name of PASS_THROUGH) {
      if (skin.vars[name] !== undefined) set[name] = skin.vars[name];
    }
  }
  return { set, unresolved };
}

/**
 * 浏览器里跑：收集可见文本节点的 fg × 有效背景，算 WCAG 对比度。
 * 半透明色按合成后的实际颜色算（原型大量用 rgba 表面），字体 ≥24px 或 ≥18.66px 粗体按 AA 大字标准 3:1。
 */
const AUDIT_FN = () => {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bgChain = (el) => {
    const layers = [];
    let n = el;
    let painted = false; // 命中过 background-image（渐变/图片）⇒ 无法用纯色算对比
    while (n) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') painted = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a >= 1) break;
      n = n.parentElement;
    }
    const base = layers.pop() ?? { r: 0, g: 0, b: 0, a: 1 };
    return { color: layers.reverse().reduce((acc, l) => over(l, acc), base), painted };
  };
  const out = [];
  const skippedPainted = new Map();
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const h = el.getBoundingClientRect();
    if (h.width < 2 || h.height < 2) continue;
    const text = (el.textContent ?? '').trim();
    if (!text || el.children.length > 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    // 屏幕外/裁剪掉的辅助元素（如"跳到主内容"）不参与配色评审
    if (cs.clip !== 'auto' || cs.clipPath !== 'none' || h.bottom < 0 || h.right < 0) continue;
    if (h.top >= window.innerHeight || h.left >= window.innerWidth) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const { color: bg, painted } = bgChain(el);
    const solid = over(fg, bg);
    const r = ratio(solid, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (painted) {
      // 渐变/图片底：纯色算不出来（产品里头像与主按钮就是这种）。单独计数，交给人看截图，
      // 与 Avatar.vue 注释同一口径："axe 无法计算渐变"。
      if (r < need) {
        const k = `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`;
        skippedPainted.set(k, (skippedPainted.get(k) ?? 0) + 1);
      }
      continue;
    }
    if (r >= need) continue;
    const cls = [...el.classList].slice(0, 2).join('.');
    const key = `${el.tagName}.${cls}|${cs.color}|${Math.round(r * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tag: `${el.tagName.toLowerCase()}.${cls || '-'}`,
      sample: text.slice(0, 18),
      color: cs.color,
      // 把"算出来压在什么颜色上"一起记下来：没有这一列，任何"换成某色就过线"的建议都无法复核
      onBackground: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      size: `${size}px${bold ? '/700' : ''}`,
      large,
      need,
      ratio: Math.round(r * 100) / 100,
    });
  }
  out.sort((a, b) => a.ratio - b.ratio);
  return { failures: out.slice(0, 40), gradientSkipped: [...skippedPainted.entries()].sort((a, b) => b[1] - a[1]) };
};

fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(PROTO)) throw new Error(`原型目录不存在：${PROTO}`);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];

try {
  for (const id of SKINS) {
    const skin = parseSkin(id);
    const { set, unresolved } = buildInjection(skin);
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.addInitScript(() => {
      // 首启欢迎窗带一层写死的 rgba(0,0,0,.65) 遮罩，会把整页压暗到看不出配色；
      // 截图前必须让它不出现（值 '1' 的约定见 src/utils/onboarding.ts）
      try { localStorage.setItem('ai-roleplay:onboarding-done', '1'); } catch { /* 注入失败时下面还有 Escape 兜底 */ }
    });
    await page.addInitScript((vars) => {
      // initScript 而不是 evaluate：路由切换会重新加载文档，注入必须重放
      const apply = () => {
        const root = document.documentElement;
        for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
      };
      if (document.documentElement) apply();
      else document.addEventListener('DOMContentLoaded', apply);
    }, set);

    const rows = [];
    for (const r of ROUTES) {
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('#app button', { timeout: 15000 });
      // 兜底：万一 localStorage 没生效（例如首帧前被重置），关掉任何遮罩再截
      if (await page.locator('.modal-overlay').count() > 0) {
        await page.keyboard.press('Escape');
        await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 }).catch(() => {});
      }
      // 首屏消息淡入与主题过渡都在跑，等它静止再截（与 a11y 审计同一口径）
      await page.waitForTimeout(700);
      const file = path.join(OUT_DIR, `${id}-${r.name}.png`);
      await page.screenshot({ path: file });
      /**
       * 注入生效探针：不核对这一步就可能出现"审计跑完了但其实皮肤没上去"的假结论。
       * 读三个地方：内联写的 --background、浏览器解析后的 html 变量值、body 实际背景色。
       */
      const probe = await page.evaluate(() => ({
        inlineBackground: document.documentElement.style.getPropertyValue('--background').trim(),
        resolvedBackground: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
        bodyColor: getComputedStyle(document.body).backgroundColor,
        foreground: getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim(),
        // 关键表面的实际颜色：截图看不出是谁把某块带歪时，用这一列定位
        surfaces: Object.fromEntries(
          ['body', '.app-shell', '.nav-rail', '.app-main', '.modal-overlay', '.modal-card']
            .map((s) => [s, (() => {
              const el = document.querySelector(s);
              if (!el) return null;
              const cs = getComputedStyle(el);
              return `${cs.backgroundColor} / ${cs.color}`;
            })()])
        ),
      }));
      const expected = set['--background'] ?? null;
      if (expected && probe.inlineBackground !== expected) {
        throw new Error(`注入未生效：期望 --background=${expected}，实得 "${probe.inlineBackground}"（${id} ${r.path}）`);
      }
      const audit = await page.evaluate(AUDIT_FN);
      rows.push({
        route: r.path,
        screenshot: path.relative(ROOT, file).split(path.sep).join('/'),
        probe,
        failures: audit.failures,
        gradientSkipped: audit.gradientSkipped,
      });
    }

    report.push({
      skin: id,
      skinName: SKIN_NAMES[id] ?? id,
      source: skin.file,
      tokensInSkin: Object.keys(skin.vars).length,
      injected: Object.keys(set).length,
      // 产品有、这套原型给不出对应值的语义变量：落地时必须逐条决定"沿用默认还是补一个"
      notProvidedBySkin: unresolved,
      routes: rows,
      totalFailures: rows.reduce((a, r) => a + r.failures.length, 0),
    });
    console.log(
      `[${id} ${SKIN_NAMES[id]}] 注入 ${Object.keys(set).length} 个产品变量（该套共 ${Object.keys(skin.vars).length} 个 token），` +
      `失败配对 ${rows.reduce((a, r) => a + r.failures.length, 0)} 处，缺值 ${unresolved.length} 条`
    );
    await page.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT_DIR, 'preview-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`done -> ${OUT_DIR}`);
