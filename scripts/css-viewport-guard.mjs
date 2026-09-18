#!/usr/bin/env node
/**
 * css-viewport-guard.mjs — 跨端评审 S-8 的 CI 守卫
 * 依据 docs/fixes/cross-client-review-2026-09-07.md：
 *   移动端动态视口工具条（地址栏显隐）会导致 100vh 计算高度包含/排除工具条，
 *   出现内容被遮挡或留白。统一改用 100dvh（dynamic viewport height）。
 *
 * 约定（双写兜底）：每个使用视口高度的 100vh 必须紧跟一行 100dvh 作为覆盖，
 *   旧浏览器用 100vh 兜底、支持 dvh 的浏览器以 100dvh 生效。
 *   本守卫禁止「裸 100vh」（即其后未紧邻 100dvh 行的写法）。
 *
 * 例外：tokens 等设计令牌层若需定义 --vh 变量可单独评估，但业务 CSS 一律双写。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

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

const files = walk(SRC, []).filter((f) => /\.(css|vue|scss|sass)$/.test(f));

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('100vh')) continue;
    // 同一行既写了 100vh 又写了 100dvh（极少，视为合法双写）放行
    if (lines[i].includes('100dvh')) continue;
    const next = lines[i + 1];
    if (next && next.includes('100dvh')) continue;
    errors.push(
      `${relative(ROOT, file)}:${i + 1} 裸 100vh（${lines[i].trim()}）— ` +
        `必须紧跟一行 100dvh 作为覆盖（双写兜底：旧浏览器 100vh 兜底，dvh 浏览器生效）`
    );
  }
}

if (errors.length) {
  console.error('\n[css-viewport-guard] 失败：发现 ' + errors.length + ' 处裸 100vh\n');
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(
    '\n修复指引：将 `100vh` 改为双写 —— 保留原行并紧随其后加一行同属性的 `100dvh`（如 height: 100vh; 换行 height: 100dvh;）。\n'
  );
  process.exit(1);
} else {
  console.log('[css-viewport-guard] 通过：无裸 100vh（全部为 100vh + 100dvh 双写）。');
}
