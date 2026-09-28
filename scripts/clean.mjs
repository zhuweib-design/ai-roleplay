#!/usr/bin/env node
/**
 * clean.mjs — 清理可再生构建/测试产物与本地日志（方案 C 防复发机制，2026-09-28）
 *
 * 清理对象（全部可由 npm run build / test:coverage / test:e2e 重新生成）：
 *   - dist/  coverage/  test-results/  playwright-report/
 *   - 根目录 *.log（门禁/构建调试重定向残留）
 *
 * 注意：本地沙箱环境存在 safe-delete guard（单次递归删除 >50 文件会被拦截）。
 * 若删除失败，本脚本会列出失败项并提示手动处理（或用 mv 移出项目后再删）；
 * CI（GitHub Actions）无此限制，可正常整目录递归删除。
 */

import { rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT_DIRS = ['dist', 'coverage', 'test-results', 'playwright-report'];

const failed = [];

for (const dir of PRODUCT_DIRS) {
  const p = join(ROOT, dir);
  if (!existsSync(p)) continue;
  try {
    rmSync(p, { recursive: true, force: true });
    console.log(`已清理目录 ${dir}/`);
  } catch (e) {
    failed.push(`${dir}/ — ${String(e.message).split('\n')[0]}`);
  }
}

let logCount = 0;
for (const name of readdirSync(ROOT)) {
  if (!name.endsWith('.log')) continue;
  try {
    rmSync(join(ROOT, name), { force: true });
    logCount++;
  } catch {
    failed.push(`${name} — 删除失败`);
  }
}
console.log(`已清理日志 ${logCount} 个`);

if (failed.length > 0) {
  console.error('\n以下条目删除失败（本地 safe-delete guard 或文件占用）：');
  for (const f of failed) console.error(`  - ${f}`);
  console.error('\n处理办法：用 mv 将其移出项目（如移到项目外暂存目录）后再删，或手动删除。');
  process.exit(1);
}

console.log('\nclean 完成。根目录已恢复整洁。');
