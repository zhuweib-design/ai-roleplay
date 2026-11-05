/**
 * control-size-guard 的守卫测试（MOBILE_PLAN 批次 3-1 / DEV_PLAN B1）
 *
 * 这条守卫的职责是"控件高度字面量只许降不许升"。它自己也要有守卫，否则
 * 半年后会变成一条永远绿灯的死门禁（对比度门禁就那样死过一次）。
 *
 * 三条断言分别钉三件事：
 * 1. 严格模式在当前仓库通过（基线没写错、扫描没崩）
 * 2. 基线里的每个文件都还在磁盘上（文件改名/删除后基线会静默失效）
 * 3. `--list` 的合计与基线合计一致（扫描口径变了会立刻暴露）
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT = resolve(ROOT, 'scripts/control-size-guard.mjs');

function runGuard(args: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

function baselineEntries(): Array<[string, number]> {
  const src = readFileSync(SCRIPT, 'utf8');
  const block = src.slice(src.indexOf('const BASELINE = {'), src.indexOf('};', src.indexOf('const BASELINE = {')));
  return [...block.matchAll(/'([^']+)':\s*(\d+)/g)].map((m) => [m[1]!, Number(m[2])]);
}

describe('control-size-guard', () => {
  it('严格模式在当前仓库通过', () => {
    const r = runGuard(['--strict']);
    expect(r.status, r.stderr || r.stdout).toBe(0);
    expect(r.stdout).toContain('严格模式通过');
  });

  it('基线里的每个文件都还在（文件改名后基线不能静默失效）', () => {
    const missing = baselineEntries()
      .map(([file]) => file)
      .filter((file) => !existsSync(resolve(ROOT, file)));
    expect(missing, `这些文件已不存在，请同步清理基线：${missing.join(', ')}`).toEqual([]);
  });

  it('--list 的合计与基线合计一致（扫描口径漂移会立刻暴露）', () => {
    const expected = baselineEntries().reduce((sum, [, n]) => sum + n, 0);
    const r = runGuard(['--list']);
    expect(r.status).toBe(0);
    expect(r.stdout, r.stdout).toContain(`合计 ${expected} 处`);
  });
});
