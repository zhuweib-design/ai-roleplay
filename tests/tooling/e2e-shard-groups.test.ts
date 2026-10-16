/**
 * e2e 分片组的覆盖与保鲜守卫（M16-c 立，M17-a 加过期判定）
 *
 * CI 现在按 `e2e/shard-groups.mjs` 的文件清单跑四组，不再用 `--shard=i/4`。
 * 这把"条数均分"换成"时长按实测均分"（2026-10-11 单 worker 实测：极差从 3.31x 到 1.003x），
 * 但带来两个新风险，所以这里五道断言逐个兜住：
 * 1. 清单是生成的就可能漏 —— 漏掉的 spec 在 CI 上**静默不跑**，比慢一点严重得多；
 * 2. 权重会随代码漂移过期 —— 过期后分组只是"看起来均分"。
 *
 * 第 1 条不是假想：生成器第一版把 project 名写成 `\w`，而移动 project 叫
 * `mobile-msedge` / `mobile-functional-msedge` 带连字符 ⇒ 14 条用例整块没进权重，
 * 两个 mobile spec 谁都不属于。是这条断言把它顶出来的。
 *
 * 第 2 条用两个抓手：`MEASURED_AT` 距今 ≤30 天（跑数不会自己变老，靠人提醒），
 * 以及按 `SPEC_WEIGHTS` 现算的分组极差 ≤1.3（重生成后若仍不平，直接红）。
 * 数值层面的"新跑数 vs 现有分组"复核另有 `--check` 模式，需要一份新报告才能跑，
 * 因此不进 CI 门禁，只在重新测量时人工把关。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  E2E_GROUPS,
  MEASURED_AT,
  MEASURED_CASES,
  SPEC_WEIGHTS,
  groupWeights,
} from '../../e2e/shard-groups.mjs';

const MAX_AGE_DAYS = 30;
const MAX_SPREAD = 1.3;

function specsOnDisk(): string[] {
  const root = path.resolve(process.cwd(), 'e2e');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.spec.ts')) {
        out.push(path.relative(process.cwd(), full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return out.sort();
}

describe('e2e 分片组', () => {
  it('磁盘上每个 spec 恰好属于一组（漏了 CI 就不跑它）', () => {
    const disk = specsOnDisk();
    const flat = E2E_GROUPS.flat();
    expect(flat.length, `分组里 ${flat.length} 项 vs 磁盘 ${disk.length} 个 spec`).toBe(disk.length);
    expect(new Set(flat).size, '同一个 spec 被放进不止一组').toBe(flat.length);
    const missing = disk.filter((d) => !flat.includes(d));
    expect(missing, `这些 spec 没进任何一组，CI 会静默漏跑：${missing.join(', ')}`).toEqual([]);
  });

  it('每组都非空，四组形状与 shard 矩阵一致', () => {
    expect(E2E_GROUPS.length, 'CI 的 group 矩阵是 4，这里也得是 4').toBe(4);
    for (const [i, g] of E2E_GROUPS.entries()) {
      expect(g.length, `第 ${i + 1} 组是空的`).toBeGreaterThan(0);
    }
  });

  /** 权重表与分组必须是同一批文件：漏一个就没法算它 belongs to 哪组 */
  it('每个分组成员都有记录的权重，权重表也不含已不存在的文件', () => {
    const members = E2E_GROUPS.flat();
    const noWeight = members.filter((f) => typeof SPEC_WEIGHTS[f] !== 'number');
    expect(noWeight, `这些成员没有实测权重：${noWeight.join(', ')}`).toEqual([]);
    const stale = Object.keys(SPEC_WEIGHTS).filter((f) => !members.includes(f));
    expect(stale, `权重表里这些文件已不在任何组（清单比权重旧？）：${stale.join(', ')}`).toEqual([]);
    expect(MEASURED_CASES, '记录的用例条数与分组成员数量级不符').toBeGreaterThan(0);
  });

  it('按记录权重现算的分组极差不超过 1.3 倍', () => {
    const { sums, spread } = groupWeights();
    expect(spread, `权重 ${sums.map((s) => s.toFixed(0)).join('/')}s 已经失衡`).toBeLessThanOrEqual(MAX_SPREAD);
  });

  it('权重没过期（MEASURED_AT 起算 30 天内）', () => {
    const ageDays = (Date.now() - new Date(MEASURED_AT).getTime()) / 86_400_000;
    expect(Number.isFinite(ageDays), `MEASURED_AT 读不出时间：${MEASURED_AT}`).toBe(true);
    expect(
      ageDays,
      `分片权重已是 ${ageDays.toFixed(1)} 天前的跑数（上限 ${MAX_AGE_DAYS} 天）。重新测量：` +
        'npx playwright test --workers=1 --reporter=list > /tmp/e2e-1w.log && ' +
        'node scripts/e2e-shard-groups.mjs --report=/tmp/e2e-1w.log'
    ).toBeLessThanOrEqual(MAX_AGE_DAYS);
  });

  it('组文件由脚本生成，不是手抄清单', () => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'e2e/shard-groups.mjs'), 'utf8');
    expect(text).toContain('请勿手改');
    expect(text, '生成依据要写清用的哪份跑数').toMatch(/单 worker/);
    expect(text, '要留下重生成入口').toContain('e2e-shard-groups.mjs --report=');
  });
});
