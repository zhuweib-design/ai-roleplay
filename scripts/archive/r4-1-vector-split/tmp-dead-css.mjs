#!/usr/bin/env node
/**
 * 临时工具：死样式扫描（拆分前的必做体检）
 *
 * 判据：一条规则的所有类选择器都必须出现在模板里。
 *   - 只要有一个类不在模板中，整条规则永远匹配不到（后代选择器同理）
 *   - `:class="{ active: cond }"` 的对象语法要解析键名
 *   - `<style scoped>` 里的 `:deep(X)` 剥掉包装后按 X 判定
 *
 * 坑（都踩过）：
 *   1. 「任一活类即算活」会漏掉 `.ctx-preset .btn.active` 这类
 *   2. 注释替换成等长内容时必须保留内部换行，否则行号前移
 *   3. 顶层 `<template>` 判定要用「行首无缩进」，否则插槽 `</template>` 截断模板
 *   4. CRLF：必须 split(/\r?\n/)
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tmp-dead-css.mjs <file.vue>');
  process.exit(2);
}
const src = readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);

// ── 1. 定位 style 块（行号 1-based）──
let styleStart = -1;
let styleEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (styleStart < 0 && /^<style\b/.test(lines[i])) styleStart = i + 1;
  else if (styleStart > 0 && lines[i] === '</style>') {
    styleEnd = i;
    break;
  }
}

// ── 2. 定位模板（顶层 <template> 必须行首无缩进）──
function templateRange() {
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (start < 0 && /^<template\b/.test(lines[i])) start = i;
    else if (start >= 0 && lines[i] === '</template>') {
      end = i;
      break;
    }
  }
  return [start, end];
}

let [tplStart, tplEnd] = templateRange();
if (tplStart < 0) {
  // 无模板（纯 ts）→ 全活
  tplStart = 0;
  tplEnd = 0;
}
const tplLines = lines.slice(tplStart, tplEnd + 1);

// ── 3. 收集模板里出现过的所有 class token ──
const classTokens = new Set();
function harvest(text) {
  // class="a b c" 与 :class="'a b'" 里的静态部分
  for (const m of text.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
    for (const tok of m[1].split(/\s+/)) if (tok && !tok.includes('{')) classTokens.add(tok);
  }
  for (const m of text.matchAll(/\bclass\s*=\s*'([^']*)'/g)) {
    for (const tok of m[1].split(/\s+/)) if (tok) classTokens.add(tok);
  }
  // :class="{ active: cond, 'x-y': c }" → 取键名
  for (const m of text.matchAll(/:class\s*=\s*"\{([^}]*)\}"/g)) {
    for (const part of m[1].split(',')) {
      const k = part.split(':')[0].trim().replace(/^['"]|['"]$/g, '');
      if (k) classTokens.add(k);
    }
  }
  // 数组/三元语法里的字符串字面量（:class="[a, cond ? 'b' : 'c']"）
  for (const m of text.matchAll(/:class\s*=\s*"([^"]*)"/g)) {
    for (const lit of m[1].matchAll(/['"]([A-Za-z0-9_:/-]+)['"]/g)) classTokens.add(lit[1]);
  }
  // 普通 attribute 值里的裸词不算 class，但在 :class 表达式外出现的模板字符串拼接也兜一下
  for (const m of text.matchAll(/class\s*=\s*\{?`([^`]*)`/g)) {
    for (const tok of m[1].split(/[\s${}]+/)) if (/^[A-Za-z][\w-]*$/.test(tok)) classTokens.add(tok);
  }
}
harvest(tplLines.join('\n'));

// 组件标签（PascalCase）也当"选择器可能命中"的线索：`.foo-bar` 可能来自子组件根 class，
// 但 scoped 下到不了子组件内部，命中随宿主。这里不做宽松处理。

// ── 4. 解析 style 块，逐条规则判定 ──
const styleText = lines.slice(styleStart, styleEnd).join('\n');

/** 剥掉字符串与注释，等长保留换行 */
function blank(text) {
  let out = text;
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:\\.|[^"\\])*"/g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/'(?:\\.|[^'\\])*'/g, (m) => m.replace(/[^\n]/g, ' '));
  return out;
}
const clean = blank(styleText);
const cleanLines = clean.split('\n');

/** 从 clean 文本里按花括号栈提取 (startLine, selector, body) */
const stack = [];
const rules = [];
let buf = '';
for (let i = 0; i < cleanLines.length; i++) {
  const line = cleanLines[i];
  for (const ch of line) {
    if (ch === '{') {
      stack.push({ sel: buf.trim(), startLine: i });
      buf = '';
    } else if (ch === '}') {
      const top = stack.pop();
      if (top && stack.length === 0) {
        rules.push({ startLine: top.startLine, sel: top.sel });
      } else if (top) {
        // 嵌套在 @media / @supports 内：只有父级是 at-rule 时才算真规则
        const parent = stack[stack.length - 1];
        const parentIsAt = parent && parent.sel.trim().startsWith('@');
        if (parentIsAt) {
          rules.push({ startLine: top.startLine, sel: top.sel, media: parent.sel.trim() });
        }
      }
      buf = '';
    } else {
      buf += ch;
    }
  }
  buf += ' '; // 换行折叠成空格（选择器可能跨行）
}

/** 从选择器里提取类名 */
function classesOf(sel) {
  const out = [];
  // 剥 :deep(X) → X
  let s = sel;
  let go = true;
  while (go) {
    const m = s.match(/:deep\(([^()]*(?:\([^()]*\))?[^()]*)\)/);
    if (!m) {
      go = false;
      break;
    }
    s = s.slice(0, m.index) + ' ' + m[1] + ' ' + s.slice(m.index + m[0].length);
  }
  for (const m of s.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.push(m[1]);
  return out;
}

const dead = [];
const alive = [];
for (const r of rules) {
  const cls = classesOf(r.sel);
  if (cls.length === 0) {
    alive.push(r);
    continue;
  }
  const missing = cls.filter((c) => !classTokens.has(c));
  if (missing.length === 0) alive.push(r);
  else dead.push({ ...r, cls, missing });
}

// 统计每行归属
const deadLines = new Set();
for (const d of dead) {
  // 从规则起始行到对应 `}` 的行数：用原始 styleLines 粗略回溯
  let depth = 0;
  let started = false;
  for (let i = d.startLine; i < cleanLines.length; i++) {
    for (const ch of cleanLines[i]) {
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') depth--;
    }
    deadLines.add(i);
    if (started && depth === 0) break;
  }
}

console.log(`文件: ${file}`);
console.log(`总行 ${lines.length}；style 块 ${styleStart + 1}-${styleEnd}`);
console.log(`模板 class token ${classTokens.size} 个；样式规则 ${rules.length} 条`);
console.log(`死规则 ${dead.length} 条 / 占样式行 ${deadLines.size} 行`);
if (dead.length) {
  console.log('--- 死规则明细（style 内行号）---');
  for (const d of dead) {
    console.log(`  L${styleStart + d.startLine + 1}  ${d.media ? '[' + d.media + '] ' : ''}${d.sel.replace(/\s+/g, ' ')}   ← 缺 ${d.missing.join(', ')}`);
  }
}
