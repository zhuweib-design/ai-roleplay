// 对比度静态门禁（Phase G3 / P1-2 重构）
//
// 旧版缺陷（09-21 全检报告 P1-2）：
//   ① 硬编码 5 个主题的色值表，**从不读取 tokens.css / themes.css**
//      → 改了 token 门禁毫无感知
//   ② 22 条清单只覆盖「设计意图上正确」的配对，**不覆盖新增派生 token**
//   ③ 不建模「token 作文本叠同色染层」这一实际缺陷形态
//   结果：本仓曾出现 --on-media 白字叠亮色 primary/secondary（dark 1.38:1、
//   theatre 2.40:1）而门禁**改动前后输出逐字相同** —— 绿灯不能作为验证证据。
//
// 本版改为「读真实数据源」：
//   A. 从 tokens.css / themes.css 解析各主题变量，递归解析 var() 与 color-mix()
//   B. 扫描 src/ 下 .vue/.css 的样式规则，提取**实际出现的** color × background
//      配对（含 color-mix 染层合成），逐主题计算
//   C. 保留关键语义配对清单（值同样取自解析结果，不再硬编码）
//
// 用法：node scripts/check-contrast.mjs [--self-test]

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AA = 4.5;

// ── 颜色工具 ──────────────────────────────────────────────────────────────

/** 解析颜色表达式为 {r,g,b,a}；支持 #RGB/#RRGGBB/#RRGGBBAA、rgb()/rgba()、transparent */
function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();

  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };

  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean);
    const num = (v) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    return {
      r: num(parts[0]),
      g: num(parts[1]),
      b: num(parts[2]),
      a: parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]),
    };
  }
  return null;
}

/** WCAG 2.1 相对亮度（仅对不透明色有意义；带 alpha 须先合成） */
function luminance(c) {
  const t = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * t(c.r) + 0.7152 * t(c.g) + 0.0722 * t(c.b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** sRGB 线性插值（对应 CSS color-mix(in srgb, ...)） */
function colorMix(c1, p1, c2, p2) {
  const w1 = p1 / 100;
  const w2 = p2 / 100;
  return {
    r: c1.r * w1 + c2.r * w2,
    g: c1.g * w1 + c2.g * w2,
    b: c1.b * w1 + c2.b * w2,
    a: (c1.a ?? 1) * w1 + (c2.a ?? 1) * w2,
  };
}

/** 半透明色合成到不透明背景上（source-over） */
function blendOver(fg, bg) {
  const a = fg.a ?? 1;
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

const toHex = (c) =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

// ── CSS 解析 ──────────────────────────────────────────────────────────────

/** 提取最内层 `selector { body }` 规则（不支持嵌套声明，对本项目足够） */
function extractRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    rules.push({ selector: m[1].trim(), body: m[2] });
  }
  return rules;
}

/** 收集选择器块内的自定义属性 */
function collectVars(rules, selectorMatch) {
  const vars = new Map();
  for (const { selector, body } of rules) {
    if (!selectorMatch(selector)) continue;
    for (const decl of body.split(';')) {
      const i = decl.indexOf(':');
      if (i === -1) continue;
      const name = decl.slice(0, i).trim();
      if (!name.startsWith('--')) continue;
      vars.set(name, decl.slice(i + 1).trim());
    }
  }
  return vars;
}

/**
 * 解析值表达式为 {r,g,b,a}：递归处理 var(--x[, fallback]) 与 color-mix(in srgb, A p%, B)。
 * 变量未定义且无 fallback 时返回 null（视为「无法静态判定」，跳过而非误报）。
 */
function resolveValue(expr, vars, seen = new Set()) {
  if (!expr) return null;
  const s = expr.trim();

  const varMatch = s.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (varMatch) {
    const [, name, fallback] = varMatch;
    if (seen.has(name)) return null; // 循环引用
    const next = new Set(seen).add(name);
    const raw = vars.get(name);
    if (raw !== undefined) {
      const resolved = resolveValue(raw, vars, next);
      if (resolved) return resolved;
    }
    if (fallback) return resolveValue(fallback, vars, next);
    return null;
  }

  const mixMatch = s.match(
    /^color-mix\(\s*in\s+srgb\s*,\s*([\s\S]+?)\s+([\d.]+)%\s*,\s*([\s\S]+?)\s*\)$/
  );
  if (mixMatch) {
    const [, aExpr, aPctRaw, bExpr] = mixMatch;
    const p1 = parseFloat(aPctRaw);
    const c1 = resolveValue(aExpr, vars, new Set(seen));
    const c2 = resolveValue(bExpr, vars, new Set(seen));
    if (!c1 || !c2) return null;
    return colorMix(c1, p1, c2, 100 - p1);
  }

  return parseColor(s);
}

/** 从 CSS 声明块中取出某属性的原始值（支持 color / background / background-color） */
function pickDecl(body, prop) {
  for (const decl of body.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    const name = decl.slice(0, i).trim().toLowerCase();
    if (name !== prop) continue;
    const value = decl.slice(i + 1).trim();
    if (value.startsWith('url(')) return null; // 背景图，静态不可判
    return value;
  }
  return null;
}

// ── 加载主题变量 ──────────────────────────────────────────────────────────

const tokensCss = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const themesCss = readFileSync(join(ROOT, 'src/styles/themes.css'), 'utf8');

const tokensRules = extractRules(tokensCss);
const themeRules = extractRules(themesCss);

/** :root 是 dark 主题的基础值 */
const baseVars = collectVars(tokensRules, (sel) => sel === ':root');

const themeVars = new Map([['dark', baseVars]]);
for (const { selector } of themeRules) {
  const m = selector.match(/\[data-theme=['"]([^'"]+)['"]\]/);
  if (!m) continue;
  const override = collectVars(themeRules, (sel) => sel === selector);
  themeVars.set(m[1], new Map([...baseVars, ...override]));
}

const themeNames = [...themeVars.keys()];

// ── A. 关键语义配对（值取自解析结果，不再硬编码） ──────────────────────────

const semanticChecks = [
  { name: '正文/背景', fg: 'foreground', bg: 'background' },
  { name: '正文/卡片', fg: 'foreground', bg: 'card' },
  { name: '次要文本/背景', fg: 'muted-foreground', bg: 'background' },
  { name: '次要文本/卡片', fg: 'muted-foreground', bg: 'card' },
  { name: '次要文本/浮起卡片', fg: 'muted-foreground', bg: 'card-elevated' },
  { name: '强调文本(secondary)/背景', fg: 'secondary', bg: 'background' },
  { name: '强调文本(secondary)/卡片', fg: 'secondary', bg: 'card' },
  { name: '品牌文本(primary-fg)/背景', fg: 'primary-fg', bg: 'background' },
  { name: '品牌文本(primary-fg)/卡片', fg: 'primary-fg', bg: 'card' },
  { name: '错误文本(destructive)/卡片', fg: 'destructive', bg: 'card' },
  { name: '主按钮文字 on-primary/primary', fg: 'on-primary', bg: 'primary' },
  { name: '次按钮文字 on-accent/secondary', fg: 'on-accent', bg: 'secondary' },
  { name: '错误提示 error-fg/error-bg', fg: 'error-fg', bg: 'error-bg' },
  { name: '成功提示 success-fg/success-bg', fg: 'success-fg', bg: 'success-bg' },
  { name: '信息文本 accent-blue/背景', fg: 'accent-blue', bg: 'background' },
  { name: '信息文本 accent-blue/卡片', fg: 'accent-blue', bg: 'card' },
  { name: '警示文本 accent-orange/背景', fg: 'accent-orange', bg: 'background' },
  { name: '警示文本 accent-orange/卡片', fg: 'accent-orange', bg: 'card' },
  { name: '警告文本 warning-fg/背景', fg: 'warning-fg', bg: 'background' },
  { name: '警告文本 warning-fg/卡片', fg: 'warning-fg', bg: 'card' },
  // ↓ P1-2 新增：派生 token（强调色「作文字」的可读变体）
  { name: '【派生】secondary-text/背景', fg: 'secondary-text', bg: 'background' },
  { name: '【派生】secondary-text/卡片', fg: 'secondary-text', bg: 'card' },
  { name: '【派生】secondary-text/浮起卡片', fg: 'secondary-text', bg: 'card-elevated' },
  { name: '【派生】warning-text/背景', fg: 'warning-text', bg: 'background' },
  { name: '【派生】warning-text/卡片', fg: 'warning-text', bg: 'card' },
  { name: '【派生】accent-blue-text/背景', fg: 'accent-blue-text', bg: 'background' },
  { name: '【派生】accent-blue-text/卡片', fg: 'accent-blue-text', bg: 'card' },
];

// ── B. 扫描真实样式：实际出现的 color × background 配对 ─────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(vue|css)$/.test(entry)) out.push(p);
  }
  return out;
}

/** 从 .vue 中取出 <style> 内容；.css 直接返回全文 */
function styleOf(file, content) {
  if (file.endsWith('.css')) return content;
  const blocks = [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  return blocks.join('\n');
}

/** 收集真实配对：{ file, selector, fgExpr, bgExpr } */
const scannedPairs = [];
for (const file of walk(join(ROOT, 'src'))) {
  const css = styleOf(file, readFileSync(file, 'utf8'));
  for (const { selector, body } of extractRules(css)) {
    const fgExpr = pickDecl(body, 'color');
    const bgExpr = pickDecl(body, 'background') ?? pickDecl(body, 'background-color');
    if (!fgExpr || !bgExpr) continue;
    if (!/var\(/.test(fgExpr)) continue; // 只关心走 token 的
    scannedPairs.push({ file: file.replace(ROOT, '').replace(/\\/g, '/'), selector, fgExpr, bgExpr });
  }
}

/** 对一条配对，在指定主题下求「文字色 on 实际背景」 */
function evaluatePair(fgExpr, bgExpr, vars) {
  const fgRaw = resolveValue(fgExpr, vars);
  if (!fgRaw) return null;

  // 背景可能是染层（半透明）→ 需合成到卡片面上才是真实观感
  let bg = resolveValue(bgExpr, vars);
  if (!bg) return null;
  if ((bg.a ?? 1) < 1) {
    const card = resolveValue('var(--card)', vars) ?? { r: 0, g: 0, b: 0, a: 1 };
    bg = blendOver(bg, card);
  }
  // 文字色带 alpha 时同样先合成
  const fg = (fgRaw.a ?? 1) < 1 ? blendOver(fgRaw, bg) : fgRaw;

  return { ratio: contrastRatio(fg, bg), fg: toHex(fg), bg: toHex(bg) };
}

// ── 自检模式：构造违规样本，确认门禁真的能拦下 ──────────────────────────────

if (process.argv.includes('--self-test')) {
  const darkVars = themeVars.get('dark');
  // 正样本：应当达标
  const okPair = evaluatePair('var(--on-accent)', 'var(--secondary)', darkVars);
  // 负样本：历史缺陷形态（白字叠亮青）——必须被判为不达标
  const badPair = evaluatePair('var(--on-media)', 'var(--secondary)', darkVars);

  let pass = true;
  if (!okPair || okPair.ratio < AA) {
    console.error(`✗ 自检失败：正样本 on-accent/secondary 应达标，实际 ${okPair?.ratio?.toFixed(2) ?? 'n/a'}`);
    pass = false;
  }
  if (!badPair || badPair.ratio >= AA) {
    console.error(`✗ 自检失败：负样本 on-media/secondary 应不达标，实际 ${badPair?.ratio?.toFixed(2) ?? 'n/a'}`);
    pass = false;
  }
  console.log('─── 自检（正/负样本） ───');
  console.log(`  正样本 on-accent/secondary = ${okPair?.ratio.toFixed(2)}:1（期望 ≥ ${AA}）`);
  console.log(`  负样本 on-media/secondary  = ${badPair?.ratio.toFixed(2)}:1（期望 < ${AA}）`);
  console.log(pass ? '\n✓ 自检通过：门禁能区分正负样本。' : '\n✗ 自检未通过。');
  process.exit(pass ? 0 : 1);
}

// ── 执行检查 ──────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  WCAG 对比度门禁（读 tokens.css/themes.css 真实变量 + 扫描实际样式）');
console.log(`  主题：${themeNames.join(' / ')}   阈值：AA ≥ ${AA}:1`);
console.log('═══════════════════════════════════════════════════════════\n');

/**
 * B 部分（实际样式扫描）的存量棘轮基线。
 *
 * 为何是棘轮而非硬卡：B 部分扫描的是**全仓真实配对**（448 处），其中 156 处
 * 为历史存量低对比度（09-21 全检报告 P1-1 列的 9 处 + P2-6 的 13 处只是其中
 * 一小部分）。按项目约定「存量未收敛的规则用棘轮而非硬卡目标值」（同
 * `!important` 基线 46 的做法）——只允许下降，不允许新增。
 *
 * 收敛后请同步下调此值；若某次改动使数字上升，说明引入了新的低对比度配对。
 */
const BASELINE_SCAN_FAILURES = 131;

let semanticFailed = 0;
let scanFailed = 0;

console.log(`── A. 关键语义配对（${semanticChecks.length} 项 × ${themeNames.length} 主题）──`);
for (const themeName of themeNames) {
  const vars = themeVars.get(themeName);
  const themeFails = [];
  for (const check of semanticChecks) {
    const res = evaluatePair(`var(${check.fg})`, `var(${check.bg})`, vars);
    if (!res) continue; // 变量未定义（如该主题未覆盖），跳过而非误报
    if (res.ratio < AA) themeFails.push({ check, res });
  }
  const total = semanticChecks.length;
  if (themeFails.length === 0) {
    console.log(`  ✓ ${themeName}：${total} 项全部达标`);
  } else {
    console.log(`  ✗ ${themeName}：${themeFails.length}/${total} 项不达标`);
    for (const { check, res } of themeFails) {
      semanticFailed++;
      console.log(`      FAIL  ${check.name}: ${res.ratio.toFixed(2)}:1  (${res.fg} on ${res.bg})`);
    }
  }
}

console.log(`\n── B. 实际样式扫描（${scannedPairs.length} 处 color×background 配对）──`);
const scanFails = [];
for (const pair of scannedPairs) {
  for (const themeName of themeNames) {
    const res = evaluatePair(pair.fgExpr, pair.bgExpr, themeVars.get(themeName));
    if (!res) continue;
    if (res.ratio < AA) {
      scanFails.push({ ...pair, themeName, res });
    }
  }
}
scanFailed = scanFails.length;
const scanDelta = scanFailed - BASELINE_SCAN_FAILURES;

if (scanFailed === 0) {
  console.log(`  ✓ 全部配对在 ${themeNames.length} 个主题下均 ≥ ${AA}:1`);
} else {
  const byFile = new Map();
  for (const f of scanFails) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  const verdict =
    scanDelta > 0 ? '✗ 超出基线（新增回归）' : scanDelta < 0 ? '↓ 低于基线（已收敛）' : '= 与基线持平';
  console.log(
    `  ${scanFailed} 处不达标，分布在 ${byFile.size} 个文件 ｜ 基线 ${BASELINE_SCAN_FAILURES} ｜ ${verdict}`
  );
  // 只在超基线时逐条列出，避免持平/收敛时刷屏；持平与收敛默认打印前 20 条便于观察。
  // 传 --list-all 可强制列出全部（用于批量收敛存量）。
  const showAll = scanDelta > 0 || process.argv.includes('--list-all');
  let printed = 0;
  for (const [file, list] of byFile) {
    if (!showAll && printed >= 20) break;
    console.log(`    ${file}`);
    for (const f of list) {
      if (!showAll && printed >= 20) {
        console.log('      …（其余从略；超基线时会全部列出）');
        break;
      }
      printed++;
      console.log(
        `      [${f.themeName}] ${f.selector}  ${f.res.ratio.toFixed(2)}:1  (${f.res.fg} on ${f.res.bg})`
      );
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════');

// A 部分硬卡（设计意图层面必须全达标）；B 部分棘轮（存量债只许降不许升）
const semanticOk = semanticFailed === 0;
const scanOk = scanDelta <= 0;

if (semanticOk && scanOk) {
  console.log(`✓ 对比度门禁通过：语义配对全达标；实际扫描 ${scanFailed} 处存量（基线 ${BASELINE_SCAN_FAILURES}）。`);
  if (scanDelta < 0) {
    console.log(`  ↳ 已收敛 ${-scanDelta} 处，建议把 BASELINE_SCAN_FAILURES 下调为 ${scanFailed}。`);
  }
  process.exit(0);
}
if (!semanticOk) console.log(`✗ 语义配对有 ${semanticFailed} 项未达 AA ${AA}:1（硬门禁）。`);
if (!scanOk) console.log(`✗ 实际扫描超出基线 ${scanDelta} 处（新增低对比度配对，属回归）。`);
console.log('  提示：跑 `node scripts/check-contrast.mjs --self-test` 可验证门禁本身是否有效。');
process.exit(1);
