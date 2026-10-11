#!/usr/bin/env node
/**
 * Token 使用体检（M18 试点）—— 默认只统计，不当门禁
 *
 * 判定形状抄 docs/design/ai-chat-ui-redesign/tools/check-tokens.mjs（原型自带工具），
 * 但那个脚本把主题与页面清单硬编码在源码头里（只列 a–d 四套），拿来扫产品会漏，
 * 所以这里重写成"从仓库现状发现文件"。
 *
 * 为什么默认不阻断：新门禁第一次跑必须先量假阳数。实测到的两类假阳就是证据：
 * ① `--range-pct` 由 `el.style.setProperty()` 运行时写入（src/core/range-fill.ts:25），
 *    按"未定义"报是错的；② `src/styles` 里写 hex 是**调色板定义本身**，与"组件层绕过 token"
 *    是两回事，混在一起数会高估一个数量级（组件层 147 处 vs 含 styles 的 354 行）。
 * `--strict` 只把 A 类（组件层裸引用未定义 token，且非运行时注入）变成退出码 1。
 *
 * 用法：node scripts/token-guard.mjs [--strict]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const STRICT = process.argv.includes('--strict');
const SKIP_RE = /(node_modules|dist|public[\\/]vendor|src[\\/]runtime)/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_RE.test(full)) walk(full, out);
    } else if (/\.(vue|css|ts)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const relOf = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const contents = new Map(walk(path.join(ROOT, 'src')).map((f) => [relOf(f), fs.readFileSync(f, 'utf8')]));

// ── 定义处（CSS 变量声明）与运行时写入（style 绑定键 / setProperty） ──
const defined = new Set();
const runtimeSet = new Set();
for (const [f, text] of contents) {
  if (f.endsWith('.ts')) {
    for (const m of text.matchAll(/setProperty\(\s*['"](--[A-Za-z0-9-]+)['"]/g)) runtimeSet.add(m[1]);
    continue;
  }
  for (const m of text.matchAll(/^[^\S\n]*(--[A-Za-z0-9-]+)\s*:/gm)) defined.add(m[1]);
  for (const m of text.matchAll(/['"](--[A-Za-z0-9-]+)['"]\s*:/g)) runtimeSet.add(m[1]);
}

/** .vue 取 <style> 块（带行号）；.css 取全文 */
function styleLines(f, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  if (f.endsWith('.css')) {
    lines.forEach((l, i) => out.push({ line: i + 1, text: l }));
    return out;
  }
  let inStyle = false;
  lines.forEach((l, i) => {
    if (/^\s*<style\b/.test(l)) inStyle = true;
    else if (/^\s*<\/style>/.test(l)) inStyle = false;
    else if (inStyle) out.push({ line: i + 1, text: l });
  });
  return out;
}

const undefBare = []; // A 类：组件层裸引用未定义 token ⇒ 该声明今天是失效的
const undefWithFallback = new Map(); // B 类：未定义但有兜底（按变量名聚合）
const color = { component: 0, componentFiles: new Set(), stylesDir: 0 };
const literalPx = new Map();

for (const [f, text] of contents) {
  if (!f.endsWith('.vue') && !f.endsWith('.css')) continue;
  const inStylesDir = f.startsWith('src/styles/');
  for (const { line, text: raw } of styleLines(f, text)) {
    const t = raw.trim();
    if (!t || t.startsWith('/*') || t.startsWith('*')) continue;

    for (const m of t.matchAll(/var\((--[A-Za-z0-9-]+)(\s*,[^)]*)?\)/g)) {
      const name = m[1];
      if (defined.has(name) || runtimeSet.has(name)) continue;
      if (m[2]) undefWithFallback.set(name, (undefWithFallback.get(name) ?? 0) + 1);
      else if (!inStylesDir) undefBare.push({ f, line, name });
    }
    const hits = t.match(/#(?:[0-9a-fA-F]{3,8})\b|\brgba?\(|\bhsla?\(/g)?.length ?? 0;
    if (hits > 0) {
      if (inStylesDir) color.stylesDir += hits;
      else {
        color.component += hits;
        color.componentFiles.add(f);
      }
    }
    if (!inStylesDir) {
      const prop = t.split(':')[0]?.trim() ?? '?';
      for (const hit of t.matchAll(/\b\d+(?:\.\d+)?px\b/g)) {
        void hit;
        literalPx.set(prop, (literalPx.get(prop) ?? 0) + 1);
      }
    }
  }
}

const byFile = new Map();
for (const r of undefBare) byFile.set(r.f, (byFile.get(r.f) ?? 0) + 1);
const byName = new Map();
for (const r of undefBare) byName.set(r.name, (byName.get(r.name) ?? 0) + 1);

console.log(`扫描：src 下 ${contents.size} 个文件（vue/css/ts）；CSS 定义 ${defined.size} 个变量、运行时写入 ${runtimeSet.size} 个`);
console.log('');
console.log(`A. 组件层裸引用未定义 token（声明今天即失效）：${undefBare.length} 处 / ${byFile.size} 文件 / ${byName.size} 个变量名`);
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${String(n).padStart(3)}  ${f}`);
console.log(`   变量名：${[...byName.keys()].join(', ')}`);
console.log('');
const fbTotal = [...undefWithFallback.values()].reduce((a, b) => a + b, 0);
console.log(`B. 未定义但有兜底值（兜底未必是本意，需逐条人判）：${fbTotal} 处 / ${undefWithFallback.size} 个变量名`);
for (const [n, c] of [...undefWithFallback.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${String(c).padStart(3)}  ${n}`);
console.log('');
console.log(`C. 字面量颜色：组件层 ${color.component} 处 / ${color.componentFiles.size} 文件；src/styles ${color.stylesDir} 处（那是调色板定义本身，不算违规）`);
const pxEntries = [...literalPx.entries()].sort((a, b) => b[1] - a[1]);
console.log(`D. 组件层字面量 px 合计 ${pxEntries.reduce((a, [, n]) => a + n, 0)} 处，按属性 top 12：`);
for (const [p, n] of pxEntries.slice(0, 12)) console.log(`   ${String(n).padStart(5)}  ${p}`);
console.log('');
console.log(`口径：A 是硬错（迁移必须映射到真实 token）；B 要人判；C/D 才是"待 token 化"的量。当前${STRICT ? '为 --strict 模式' : '为统计模式（不阻断）'}。`);
if (STRICT && undefBare.length > 0) process.exitCode = 1;
