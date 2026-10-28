/**
 * primitives-guard 的守卫测试（DEV_PLAN §7.8.1 共享原语化的配套门禁）
 *
 * 这条守卫的职责是"组件不许再复制一份与全局同值的 `.btn` 族规则，且每文件计数只许降"。
 * 它自己也要有守卫，否则会变成一条永远绿灯的死门禁（对比度门禁就那样死过一次）。
 *
 * 四条断言分别钉四件事：
 * 1. 严格模式在当前仓库通过（基线没写错、扫描没崩）
 * 2. 基线里的每个文件都还在磁盘上（文件改名/删除后基线会静默失效）
 * 3. `--list` 的当前计数与登记值一致（扫描口径变了会立刻暴露）
 * 4. **负向能力**：往一个文件里塞一条与全局同值的规则，守卫必须真的变红
 *    —— 前三条都只是"跑通"，只有这条能证明它咬得住。曾经就因为字段名写错
 *    （`b.sel` vs `r.selector`）而恒等于 0 命中，靠这条才发现。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT = resolve(ROOT, 'scripts/primitives-guard.mjs');
const PRIMITIVES = resolve(ROOT, 'src/styles/primitives.css');

/** 负向实验的落点：该文件的 .btn 是独立变体，塞一条全局同值规则必然触发守卫 */
const PROBE = resolve(ROOT, 'src/views/LocalModelView.vue');

function runGuard(args: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

function ratchetEntries(): Array<[string, number]> {
  const src = readFileSync(SCRIPT, 'utf8');
  const start = src.indexOf('const RATCHET = {');
  const block = src.slice(start, src.indexOf('};', start));
  return [...block.matchAll(/'([^']+)':\s*(\d+)/g)].map((m) => [m[1]!, Number(m[2])]);
}

describe('primitives-guard', () => {
  it('严格模式在当前仓库通过', () => {
    const r = runGuard(['--strict']);
    expect(r.status, r.stderr || r.stdout).toBe(0);
    expect(r.stdout).toContain('✓ 无同值重复');
  });

  it('全局原语文件存在且含按钮族基线', () => {
    expect(existsSync(PRIMITIVES), 'primitives.css 是守卫的前提，不能删').toBe(true);
    const css = readFileSync(PRIMITIVES, 'utf8');
    for (const sel of ['.btn', '.btn:disabled', '.btn-primary', '.btn-secondary', '.btn-sm']) {
      expect(css, `基线缺 ${sel}`).toContain(`${sel} {`);
    }
  });

  it('登记表里的每个文件都还在（文件改名后登记不能静默失效）', () => {
    const missing = ratchetEntries()
      .map(([f]) => f)
      .filter((f) => !existsSync(resolve(ROOT, f)));
    expect(missing, `这些文件已不存在，请删除对应登记：${missing.join(', ')}`).toEqual([]);
  });

  it('--list 的当前计数与登记值一致（口径漂移立刻暴露）', () => {
    const r = runGuard(['--list']);
    expect(r.status, r.stderr).toBe(0);
    const rows = [...r.stdout.matchAll(/^\s+\S\s+(\S+\.vue):\s+(\d+) \/ (\d+)$/gm)];
    expect(rows.length, '没解析到 --list 输出，格式可能变了').toBeGreaterThan(0);
    const drift = rows
      .filter((m) => m[2] !== m[3])
      .map((m) => `${m[1]}: 登记 ${m[2]} / 实测 ${m[3]}`);
    expect(drift, `计数与登记不符：\n${drift.join('\n')}`).toEqual([]);
  });

  describe('负向能力（证明它咬得住，而不是恒绿）', () => {
    let backup = '';
    afterEach(() => {
      if (backup) writeFileSync(PROBE, backup, 'utf8');
      backup = '';
    });

    it('塞入一条与全局逐字同值的规则 → 必须失败', () => {
      backup = readFileSync(PROBE, 'utf8');
      writeFileSync(
        PROBE,
        backup.replace('</style>', '.btn-secondary {\n  background: var(--card);\n}\n</style>'),
        'utf8'
      );
      const r = runGuard(['--strict']);
      expect(r.status, '守卫没拦住同值重复，说明检测逻辑失效').toBe(1);
      expect(r.stderr).toContain('复制了全局已有的 .btn-secondary');
    });
  });
});
