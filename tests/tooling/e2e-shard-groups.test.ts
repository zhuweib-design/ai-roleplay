/**
 * e2e 分片组的覆盖守卫（M16-c）
 *
 * CI 现在按 `e2e/shard-groups.mjs` 的文件清单跑四组，不再用 `--shard=i/4`。
 * 这把"条数均分"换成"时长按实测均分"（2026-10-11 单 worker 实测：极差从 3.31x 到 1.006x），
 * 但带来一个新风险：**清单是手写的就可能漏**。漏掉的 spec 在 CI 上静默不跑，
 * 比原来慢一点严重得多。所以这里钉四条：
 * 1. 磁盘上每个 spec 恰好属于一组（不多不少，也不重复）；
 * 2. 每组都非空；
 * 3. 每组都记了实测权重，且组间极差不超过 1.3 倍（超过就说明该重新生成了）；
 * 4. 组文件是脚本生成的（带"请勿手改"与生成依据），不是手抄的清单。
 *
 * 第 1 条不是假想：解析器最初把 project 名写成 `\\w+`，整个移动 project 的 14 条用例
 * 都不在权重里，两个 mobile spec 于是没进任何组 —— 正是这条断言把它抓出来的。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_GROUPS } from '../../e2e/shard-groups.mjs';

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

  it('组间实测权重极差不超过 1.3 倍，否则该重新生成', () => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'e2e/shard-groups.mjs'), 'utf8');
    const secs = [...text.matchAll(/第 \d+ 组：实测 (\d+)s/g)].map((m) => Number(m[1]));
    expect(secs.length, '没从组文件里读到实测权重').toBe(E2E_GROUPS.length);
    expect(Math.max(...secs) / Math.min(...secs), `权重 ${secs.join('/')} 已经失衡`).toBeLessThanOrEqual(1.3);
  });

  it('组文件由脚本生成，不是手抄清单', () => {
    const text = fs.readFileSync(path.resolve(process.cwd(), 'e2e/shard-groups.mjs'), 'utf8');
    expect(text).toContain('请勿手改');
    expect(text, '生成依据要写清用的哪份跑数').toMatch(/--reporter=list|单 worker/);
  });
});
