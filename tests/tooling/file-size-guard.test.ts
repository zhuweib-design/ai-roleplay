/**
 * file-size-guard 的守卫测试（DEV_PLAN §7.10）
 *
 * 这道门禁的价值全在"它会失败"。所以测试只钉两件事：
 * 1. 严格模式在当前仓库上必须通过（否则 CI 红、然后被绕过——那正是 §7.1 批评的失效模式）；
 * 2. 白名单条目数必须等于登记值（防止有人为了让红变绿而整条删掉，
 *    删了条目文件仍 >1000 行，第二年的"来不及拆"就变成"从来没打算拆"）。
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

function runGuard(args: string[]) {
  return spawnSync(process.execPath, [resolve(ROOT, 'scripts/file-size-guard.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

describe('file-size-guard', () => {
  it('严格模式在当前仓库通过', () => {
    const r = runGuard(['--strict']);
    expect(r.status, `守卫失败输出：\n${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('严格模式通过');
  });

  /*
   * 2026-10-19：R1-2 把 StoryEngineView 拆到 652 行（≤800），按 §7.10「还完债就删条目」
   * 销掉一条，白名单从 26 变 25。
   * 2026-10-19：R1-3 把 WorldBookView 拆到 741 行（≤800），再销一条，25 → 24。
   * 2026-10-19：R1-4 把 SettingsModelPanel 拆到 369 行（≤800），再销一条，24 → 23。
   * 2026-10-19：R1-5 把 ChatMain 拆到 583 行（≤800），再销一条，23 → 22。
   */
  it('白名单条目数固定为 22（2 个 i18n 字典 + 20 个未拆完的目标）', () => {
    const r = runGuard(['--list']);
    expect(r.status).toBe(0);
    const m = /共 (\d+) 条/.exec(r.stdout);
    expect(m, `输出里没有条目数：\n${r.stdout}`).not.toBeNull();
    // 数字变小=有人删了条目；数字变大=有人塞了新的大文件进来。两边都要解释
    expect(Number(m![1])).toBe(22);
  });

  it('白名单每一条都带 reason（没有理由的豁免等于没有门禁）', () => {
    const src = readFileSync(resolve(ROOT, 'scripts/file-size-guard.mjs'), 'utf8');
    const allow = src.split('const ALLOWLIST = {')[1]?.split('\n};')[0] ?? '';
    const entries = [...allow.matchAll(/^\s{2}'[^']+':\s*\{/gm)];
    const reasons = [...allow.matchAll(/reason:/g)];
    expect(entries.length, '白名单条目数应为 22').toBe(22);
    expect(reasons.length, '每条都要有 reason').toBe(entries.length);
  });
});
