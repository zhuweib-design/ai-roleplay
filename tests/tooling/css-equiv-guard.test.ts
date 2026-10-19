/**
 * css-equiv-guard 的守卫测试（R 类拆分的行为不变验证）
 *
 * 这道工具的价值全在"搬漏了它会红"。所以测试钉三件事：
 * 1. self-test 9 条全过——判定能力本身没回归；
 * 2. 真在 R1-3 上回放：以拆前 ref 为基线跑 WorldBookView + 9 个拆出文件，
 *    必须报「0 条丢失」。这条是回归钉子：将来谁再动这些组件的样式，
 *    被 CI 拉起时若把某条规则搬丢，这里会红。
 * 3. 反例也走一遍：把一个子组件从参数里去掉，必须报丢失（证明不是空转）。
 *
 * 基线 ref 用 `25451f8`（R-P 批收尾，即 R1-3 拆分的父提交）。这是硬编码的历史
 * 事实，不会漂移；如果将来这个 ref 因为仓库重整而取不到，第 2 条会明确报
 * "取不到基线"，而不是静默通过。
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = process.cwd();

/** R1-3 拆分的父提交（拆前 WorldBookView 3115 行状态） */
const R13_BASE = '25451f8';
/** R1-3 拆出的 9 个含样式的文件（useLorebook*.ts 无样式块，不入参） */
const R13_FILES = [
  'src/views/WorldBookView.vue',
  'src/components/worldbook/LorebookHeader.vue',
  'src/components/worldbook/LorebookListPanel.vue',
  'src/components/worldbook/LorebookMetaSection.vue',
  'src/components/worldbook/LorebookWorldSections.vue',
  'src/components/worldbook/LorebookBindings.vue',
  'src/components/worldbook/LorebookEntryTree.vue',
  'src/components/worldbook/LorebookEntryForm.vue',
  'src/components/worldbook/LorebookGenerateModal.vue',
];

const VIEW = 'src/views/WorldBookView.vue';

function run(args: string[]) {
  return spawnSync(process.execPath, [resolve(ROOT, 'scripts/css-equiv-guard.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

describe('css-equiv-guard', () => {
  it('self-test 全过（判定能力未回归）', () => {
    const r = run(['--self-test']);
    expect(r.status, `self-test 失败：\n${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('9/9 通过');
  });

  it('R1-3 回放：拆前后规则集 0 条丢失', () => {
    const r = run(['--base', R13_BASE, ...R13_FILES]);
    expect(r.status, `回放失败：\n${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('0 条丢失');
  });

  it('反例：只给主视图、不给子组件 ⇒ 必须报丢失（证明判定不是空转）', () => {
    const r = run(['--base', R13_BASE, VIEW]);
    expect(r.status, '少了子组件却报通过，说明工具没在看子组件').toBe(1);
    expect(r.stderr).toContain('丢失');
  });
});
