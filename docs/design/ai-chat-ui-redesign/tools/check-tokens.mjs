/**
 * check-tokens.mjs —— 设计 Token 合规性静态校验
 *
 * 校验项：
 *   1. 组件层是否出现颜色 / px 间距 / 时长字面量
 *   2. 是否存在引用了但未定义的 Token
 *   3. 是否把尺寸类 Token 误用到 opacity 等非长度属性
 *   4. HTML 内联 style 是否绕过 Token
 *
 * 运行： node tools/check-tokens.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './site.mjs';

/** 必须做到零字面量的组件层文件 */
const STRICT = ['css/layout.css', 'css/components.css', 'css/responsive.css', 'css/overview.css', 'css/demo.css'];
/** Token 定义文件（允许出现字面量） */
const TOKEN_FILES = ['css/tokens.base.css', 'css/theme-a.css', 'css/theme-b.css', 'css/theme-c.css', 'css/theme-d.css'];

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- 1. 收集已定义 Token ---------- */
const defined = new Set();
for (const f of TOKEN_FILES) {
  for (const m of read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
}

/* ---------- 2. 字面量扫描 ---------- */
const problems = [];
for (const f of STRICT) {
  let inComment = false;
  read(f).split('\n').forEach((line, i) => {
    let code = line;
    if (inComment) {
      const end = code.indexOf('*/');
      if (end === -1) return;
      code = code.slice(end + 2);
      inComment = false;
    }
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');
    const open = code.indexOf('/*');
    if (open !== -1) {
      code = code.slice(0, open);
      inComment = true;
    }
    // 媒体查询阈值无法使用 CSS 变量，属规范硬限制，豁免
    if (/^\s*@media/.test(code)) return;
    const color = code.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/);
    if (color) problems.push({ f, line: i + 1, kind: '颜色字面量', hit: color[0], text: line.trim() });
    const px = code.match(/(?<![\w-])\d+(?:\.\d+)?px/g);
    if (px) problems.push({ f, line: i + 1, kind: 'px 字面量', hit: px.join(' '), text: line.trim() });
    const time = code.match(/(?<![\w-])\d+(?:\.\d+)?(?:ms|s)\b/g);
    if (time) problems.push({ f, line: i + 1, kind: '时长字面量', hit: time.join(' '), text: line.trim() });
    const misuse = code.match(/opacity:\s*var\(--(?:space|size|radius|font|icon)/);
    if (misuse) problems.push({ f, line: i + 1, kind: 'Token 类型误用', hit: misuse[0], text: line.trim() });
  });
}

/* ---------- 3. 未定义 Token 引用 ---------- */
const used = new Map();
for (const f of [...STRICT, ...TOKEN_FILES, 'css/reset.css']) {
  for (const m of read(f).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(f);
  }
}
const undefinedTokens = [...used.entries()]
  .filter(([t]) => !defined.has(t))
  .map(([t, files]) => ({ token: t, files: [...files] }));

/* ---------- 4. 未使用的 Token（提示级） ---------- */
const unused = [...defined].filter((t) => !used.has(t)).sort();

/* ---------- 5. HTML 内联 style 合规 ---------- */
const HTML = ['index.html', 'style-a.html', 'style-b.html', 'style-c.html', 'style-d.html',
  'components/atoms.html', 'components/molecules.html', 'components/organisms.html'];
const inlineIssues = [];
for (const f of HTML) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/style="([^"]*)"/g)) {
    const v = m[1];
    const hasLiteral = /#[0-9a-fA-F]{3,8}|rgba?\(|\d+px/.test(v);
    if (hasLiteral && !/var\(/.test(v)) inlineIssues.push({ f, text: v });
  }
}

/* ---------- 输出 ---------- */
console.log('=== Token 合规性校验 ===');
console.log('已定义 Token 数量: ' + defined.size);
console.log('被引用 Token 数量: ' + used.size);
console.log('');

if (problems.length) {
  console.log('[FAIL] 组件层字面量 ' + problems.length + ' 处：');
  for (const p of problems) console.log('  ' + p.f + ':' + p.line + '  [' + p.kind + '] ' + p.hit + '   << ' + p.text);
} else {
  console.log('[PASS] 组件层无颜色 / px / 时长字面量');
}

console.log('');
if (undefinedTokens.length) {
  console.log('[FAIL] 未定义 Token ' + undefinedTokens.length + ' 个：');
  for (const u of undefinedTokens) console.log('  ' + u.token + '  引用于 ' + u.files.join(', '));
} else {
  console.log('[PASS] 所有 var() 引用均有定义');
}

console.log('');
if (inlineIssues.length) {
  console.log('[WARN] HTML 内联样式绕过 Token ' + inlineIssues.length + ' 处：');
  for (const i of inlineIssues) console.log('  ' + i.f + '  style="' + i.text + '"');
} else {
  console.log('[PASS] HTML 内联样式全部通过 var() 引用 Token');
}

console.log('');
console.log('[INFO] 定义但未被引用的 Token（' + unused.length + ' 个）：');
console.log('  ' + (unused.join(', ') || '无'));
