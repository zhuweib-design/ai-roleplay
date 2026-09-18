#!/usr/bin/env node
/**
 * breakpoint-guard.mjs — 跨端评审 S-10 的 CI 守卫
 * 依据 deliverables/cross-client-review-2026-09-07.md 第 8.2 节配套约束：
 *   1. 断点数字只出现在 L1（src/styles/tokens-responsive.css）。
 *      除该文件外，任何 @media 里的 width/height 数字若不在规范允许集内即失败。
 *   2. window.matchMedia 只出现在 L4（src/core/viewport.ts）。
 *      其余文件出现 matchMedia( 调用即失败。
 *   3. L1(CSS 变量) 与 L4(TS 常量) 的断点数值必须保持一致。
 *
 * 规范断点集（与 tokens-responsive.css 同步；新增第 7 个值必须先改该文件）：
 *   380 / 480 / 640 / 641 / 900 / 1024 / 1025
 * 说明：900 是横屏复合断点（max-width:900px + max-height:480px），仅用于高度压缩，
 *      允许出现在 @media 中；其余非规范数字（如 1100/1023/600/567/539）一律禁止。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

// 规范断点允许集（px 数值）
const ALLOWED = new Set([380, 480, 640, 641, 900, 1024, 1025]);

// L1 / L4 唯一来源文件
const L1 = join(SRC, 'styles', 'tokens-responsive.css');
const L4 = join(SRC, 'core', 'viewport.ts');

const errors = [];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'coverage' || name.startsWith('.')) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

// ── 1. @media 断点数字检查（除 L1 外）──
const mediaRe = /@media[^{]*?\((?:max|min)-(width|height):\s*(\d+)px/g;
const files = walk(SRC, []);
for (const file of files) {
  if (file === L1) continue;
  if (!/\.(css|vue|ts|tsx|js|jsx)$/.test(file)) continue;
  const content = readFileSync(file, 'utf8');
  let m;
  mediaRe.lastIndex = 0;
  while ((m = mediaRe.exec(content)) !== null) {
    const num = Number(m[2]);
    if (!ALLOWED.has(num)) {
      errors.push(
        `${relative(ROOT, file)}:${lineOf(content, m.index)} 野断点 @media (${m[1]}: ${num}px) — ` +
          `不在规范集 {380,480,640,641,900,1024,1025}；请改用 tokens-responsive.css 的 --bp-*，或就近取规范边界`
      );
    }
  }
}

// ── 2. matchMedia 调用检查（除 L4 外）──
const mmRe = /matchMedia\s*\(/g;
for (const file of files) {
  if (file === L4) continue;
  if (!/\.(ts|tsx|js|jsx|vue)$/.test(file)) continue;
  const content = readFileSync(file, 'utf8');
  let m;
  mmRe.lastIndex = 0;
  while ((m = mmRe.exec(content)) !== null) {
    errors.push(
      `${relative(ROOT, file)}:${lineOf(content, m.index)} 出现 window.matchMedia( — ` +
        `只允许在 src/core/viewport.ts（L4 唯一来源）；业务层请用 useViewport()`
    );
  }
}

// ── 3. L1(CSS) 与 L4(TS) 断点数值同步 ──
function readTokens() {
  const css = readFileSync(L1, 'utf8');
  const map = {};
  const re = /--bp-([\w-]+):\s*(\d+)px/g;
  let m;
  while ((m = re.exec(css)) !== null) map[m[1]] = Number(m[2]);
  return map;
}
function readTsBreakpoints() {
  const ts = readFileSync(L4, 'utf8');
  const block = ts.match(/breakpoints\s*=\s*\{([\s\S]*?)\};/);
  const map = {};
  if (!block) return map;
  const re = /(\w+):\s*(\d+)/g;
  let m;
  while ((m = re.exec(block[1])) !== null) map[m[1]] = Number(m[2]);
  return map;
}
const tokens = readTokens();
const tsBp = readTsBreakpoints();
// token 名 -> breakpoints key 映射
const MAP = {
  'mobile-max': 'mobileMax',
  'tablet-min': 'tabletMin',
  'tablet-max': 'tabletMax',
  'desktop-min': 'desktopMin',
  'narrow-max': 'narrowMax',
  'landscape-h': 'landscapeH',
  'landscape-w': 'landscapeW',
};
for (const [tokenName, tsKey] of Object.entries(MAP)) {
  const a = tokens[tokenName];
  const b = tsBp[tsKey];
  if (a === undefined || b === undefined) {
    errors.push(`断点同步缺失：--bp-${tokenName} (${a}) vs breakpoints.${tsKey} (${b})`);
  } else if (a !== b) {
    errors.push(`断点数值不一致：--bp-${tokenName}=${a}px 但 breakpoints.${tsKey}=${b}；L1 与 L4 必须同步`);
  }
}

// ── 输出 ──
if (errors.length) {
  console.error('\n[breakpoint-guard] 失败：发现 ' + errors.length + ' 处违规\n');
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(
    '\n修复指引：断点数字仅在 src/styles/tokens-responsive.css 定义；JS 端判定统一用 src/core/viewport.ts 的 useViewport()。\n'
  );
  process.exit(1);
} else {
  console.log('[breakpoint-guard] 通过：无野断点、matchMedia 唯一来源、L1/L4 数值同步。');
}
