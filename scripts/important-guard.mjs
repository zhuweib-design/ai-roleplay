#!/usr/bin/env node
/**
 * important-guard.mjs — 跨端评审 S-1 的「棘轮」守卫（Web SOP 评审 P2-4）
 *
 * 背景：S-1 的评审目标是把 `responsive.css` 的 `!important` 降到个位数，并在 CI 加一条
 *   「禁止 !important 增量」的检查。实测目标未达成（`responsive.css` 仍有 18 处），
 *   且该检查从未建立 —— 属于「评审建议未转门禁」的典型。
 *
 * 本守卫采取**棘轮（ratchet）策略**，而不是一步到位：
 *   - 全量计数 **不得超过** BASELINE_TOTAL（当前存量），一旦新增即失败；
 *   - 计数下降时通过，并提示可下调基线（鼓励逐步收敛）；
 *   - 同时输出分文件明细，便于定位增量来自哪里。
 *
 * 之所以不直接卡「个位数」：S-1 的历史目标值在现状下无法一次性达成，硬卡会让门禁
 *   长期红着、进而被绕过（正是评审批评的失效模式）。棘轮保证「不恶化」，并留下
 *   可见的下降路径；目标值见 S-1 的后续收敛计划。
 *
 * 注意：统计前会剥离 CSS 注释，避免把「注释里提到 !important」计入。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

/** 当前存量基线（2026-09-18 实测，已剥离注释）。只允许下调，不允许上调。 */
const BASELINE_TOTAL = 46;
/** S-1 的历史目标（responsive.css 收敛到个位数）—— 仅作提示，不阻断 */
const RESPONSIVE_TARGET_FILE = 'src/styles/responsive.css';
const RESPONSIVE_TARGET_MAX = 9;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(css|vue|scss|sass)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** 剥离 CSS 注释（/* ... *\/ 含跨行），避免注释中的字样被计入 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

const counts = new Map();
let total = 0;

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const n = (stripComments(readFileSync(file, 'utf8')).match(/!important/g) ?? []).length;
  if (n > 0) {
    counts.set(rel, n);
    total += n;
  }
}

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`[important-guard] 当前 !important 总数：${total}（基线 ${BASELINE_TOTAL}）`);
for (const [file, n] of sorted) console.log(`    ${String(n).padStart(3)}  ${file}`);

const responsiveCount = counts.get(RESPONSIVE_TARGET_FILE) ?? 0;
if (responsiveCount > RESPONSIVE_TARGET_MAX) {
  console.log(
    `[important-guard] 提示：${RESPONSIVE_TARGET_FILE} 仍有 ${responsiveCount} 处（S-1 目标 ≤${RESPONSIVE_TARGET_MAX}，尚未达成）`
  );
}

if (total > BASELINE_TOTAL) {
  console.error(
    `\n[important-guard] 失败：!important 新增了 ${total - BASELINE_TOTAL} 处（${BASELINE_TOTAL} → ${total}）\n`
  );
  console.error(
    '修复指引：优先用提高选择器特异性、调整样式引入顺序、或改用 CSS 变量/token 替代 !important。\n' +
      '若确有必要新增，请同步下调其他处（保持总数不增），并在 MR 说明理由。\n'
  );
  process.exit(1);
}

if (total < BASELINE_TOTAL) {
  console.log(
    `\n[important-guard] 通过：!important 已减少 ${BASELINE_TOTAL - total} 处。` +
      `建议把 BASELINE_TOTAL 下调为 ${total}，以锁定成果。`
  );
} else {
  console.log('\n[important-guard] 通过：!important 未新增。');
}
