#!/usr/bin/env node
/**
 * css-conventions-guard.mjs — CSS 约定守卫「单一入口」编排器
 *
 * 背景：CI 的 quality-gates 原本为 4 道 CSS 约定守卫各起一个步骤
 *   （check:breakpoints / check:viewport / check:hover / check:important），
 *   加上 I-7 可编辑控件字号守卫共 5 道。为收敛 CI 步骤数、同时避免「多份实现漂移」，
 *   本脚本作为**编排器**依次以子进程调用各守卫脚本并汇总逐项结果：
 *     · 任一项失败 → 整体退出码非 0；
 *     · 每项输出带编号与名称，失败时一眼看出「哪一项 / 哪个文件哪一行」。
 *
 * 为什么用「子进程编排」而不是「抽公共模块再复制检查逻辑」：
 *   - 各守卫脚本保持零依赖、可独立运行（本地针对性调试仍走原命令）；
 *   - 编排器不感知任何检查细节，判定语义 100% 由子脚本决定 —— 逻辑只有一份，天然不会漂移；
 *   - 新增子检查只需在下方 CHECKS 追加一行，改动面最小。
 *
 * 用法：node scripts/css-conventions-guard.mjs（或 npm run check:css-conventions）
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * 子检查清单（顺序即执行顺序，与 ci.yml / README 的枚举保持一致）。
 * 新增守卫：在此追加一项即可，编排器与 CI 步骤无需改动。
 */
const CHECKS = [
  { name: '断点单一来源守卫', cmd: 'check:breakpoints', script: 'scripts/breakpoint-guard.mjs' },
  { name: '动态视口守卫', cmd: 'check:viewport', script: 'scripts/css-viewport-guard.mjs' },
  { name: '触屏 hover 守卫', cmd: 'check:hover', script: 'scripts/hover-guard.mjs' },
  { name: '!important 棘轮守卫', cmd: 'check:important', script: 'scripts/important-guard.mjs' },
  {
    name: 'I-7 可编辑控件字号守卫',
    cmd: 'check:i7-control-font-size',
    script: 'scripts/i7-control-font-size-guard.mjs',
  },
];

const failed = [];

console.log(
  `[css-conventions] CSS 约定守卫：依次执行 ${CHECKS.length} 项子检查（任一项失败即整体失败）\n`
);

CHECKS.forEach((check, i) => {
  const abs = join(ROOT, check.script);
  const seq = `[${i + 1}/${CHECKS.length}]`;
  console.log(`══ ${seq} ${check.name} · npm run ${check.cmd} ══`);

  if (!existsSync(abs)) {
    console.error(`  ✗ 找不到守卫脚本：${check.script}\n`);
    failed.push({ seq, ...check });
    return;
  }

  const result = spawnSync(process.execPath, [abs], { cwd: ROOT, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const code = result.status;
  if (code === 0) {
    console.log(`✓ ${seq} 通过\n`);
  } else {
    console.error(`✗ ${seq} 失败（退出码 ${code ?? 'null'}）\n`);
    failed.push({ seq, ...check });
  }
});

if (failed.length) {
  console.error(
    `[css-conventions] 汇总：${CHECKS.length - failed.length}/${CHECKS.length} 通过，失败 ${failed.length} 项：`
  );
  for (const f of failed) console.error(`  ✗ ${f.seq} ${f.name} · npm run ${f.cmd}`);
  console.error('[css-conventions] 失败：请按上方 ✗ 项的输出定位文件与行号后修复。\n');
  process.exit(1);
}

console.log(`[css-conventions] 汇总：${CHECKS.length}/${CHECKS.length} 全部通过。`);
