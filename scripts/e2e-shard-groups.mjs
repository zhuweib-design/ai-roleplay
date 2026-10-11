#!/usr/bin/env node
/**
 * e2e 分片权重生成器 / 复核器（M16-c 立，M17-a 加过期门禁）
 *
 * 为什么不用 `--shard=i/4`：Playwright 只按**用例条数**切，不看每条跑多久。
 * 2026-10-11 单 worker 全量实测（177 条 / 34 个 spec）按文件汇总后，四片是
 * 507s / 390s / 515s / 156s，最慢片是最快片的 3.31 倍——整套墙钟由最慢那片决定，
 * 其余机器提前空闲。按时长贪心均衡（LPT）后是 165/165/166/165s，极差 1.006x。
 *
 * 三种用法：
 *   node scripts/e2e-shard-groups.mjs --report=<list报告> [--groups=4]
 *     重新测量并写 e2e/shard-groups.mjs（跑数：`npx playwright test --workers=1 --reporter=list`）
 *   node scripts/e2e-shard-groups.mjs --check=<list报告>
 *     **不写文件**，只拿新跑数复核现有分组的极差；超阈值或出现权重表里没有的 spec ⇒ 退码 1
 *   node scripts/e2e-shard-groups.mjs --group=<n>
 *     打印第 n 组的文件清单（CI 用它拼命令行参数）
 *
 * 权重会过期，所以生成文件里带 MEASURED_AT / SOURCE_COMMIT / 每条 spec 的权重，
 * tests/tooling/e2e-shard-groups.test.ts 判三件事：每个 spec 恰好属于一组、
 * 权重距今没超 30 天、按权重表算出的分组极差 ≤1.3。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GROUP_FILE = path.join(ROOT, 'e2e', 'shard-groups.mjs');
/** 分组允许的最大极差；超过就说明这份权重已经不代表现在的用例形状 */
const MAX_SPREAD = 1.3;
/** 权重保鲜期（天）：过期由守卫红字提醒重新跑单 worker 基线 */
const MAX_AGE_DAYS = 30;

const argv = process.argv.slice(2);
const argOf = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : undefined;
};

/** 从 `--reporter=list` 的输出里提每条用例的秒数，按 spec 文件汇总（跨 project 相加） */
function readWeights(reportPath) {
  const text = fs.readFileSync(path.resolve(reportPath), 'utf8');
  // 失败行也要计入权重，否则下一次跑数会少掉红的那几条。
  // 项目名含连字符（mobile-functional-msedge），字符类必须带 -：
  // 早先只写 \w 时整个移动 project 的 14 条用例不进权重，两个 mobile spec
  // 因此没进任何组 ⇒ CI 会静默不跑它们（覆盖断言抓到过这个）。
  const anyLine =
    /^\s*\S+\s+\d+\s+\[[\w-]+\]\s+›\s+(\S+?\.spec\.\w+):\d+:\d+\s+›.*?\((\d+(?:\.\d+)?)(ms|s)\)/;
  const weights = new Map();
  let counted = 0;
  for (const raw of text.split(/\r?\n/)) {
    const m = anyLine.exec(raw);
    if (!m) continue;
    const rel = m[1].replace(/\\/g, '/');
    const sec = parseFloat(m[2]) / (m[3] === 'ms' ? 1000 : 1);
    weights.set(rel, (weights.get(rel) ?? 0) + sec);
    counted++;
  }
  if (weights.size === 0) {
    throw new Error(`从 ${reportPath} 没解析出任何用例时长（要 --reporter=list 的产物）`);
  }
  return { weights, counted };
}

/** 贪心：按时长降序，每次丢进当前最轻的组（LPT 近似，实践上够平） */
function balance(weights, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  const sums = new Array(groupCount).fill(0);
  for (const [file, sec] of [...weights.entries()].sort((a, b) => b[1] - a[1])) {
    const i = sums.indexOf(Math.min(...sums));
    groups[i].push(file);
    sums[i] += sec;
  }
  return { groups, sums };
}

function currentHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown'; // 不在 git 里跑时只少一个溯源字段，过期判定看日期
  }
}

function writeFile(groups, sums, source, counted, weights) {
  const total = sums.reduce((a, b) => a + b, 0);
  const spread = Math.max(...sums) / Math.min(...sums);
  const body = groups
    .map(
      (g, i) =>
        `  // 第 ${i + 1} 组：实测 ${sums[i].toFixed(0)}s\n  [\n${g
          .sort()
          .map((f) => `    '${f}',`)
          .join('\n')}\n  ],`
    )
    .join('\n');
  const weightLines = [...weights.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([f, s]) => `  '${f}': ${s.toFixed(1)},`)
    .join('\n');
  const content = `/**
 * e2e 分片组（由 scripts/e2e-shard-groups.mjs 生成，请勿手改）
 *
 * 生成依据：${source} 的**单 worker**实测时长（${counted} 条用例 / ${total.toFixed(0)}s）。
 * 按下面这份权重贪心均衡（LPT）后四组极差约 ${spread.toFixed(3)}x。
 * 为什么不用 --shard：Playwright 只按用例条数切、不看时长，实测极差到过 3.31x。
 *
 * 重新测量：
 *   npx playwright test --workers=1 --reporter=list > /tmp/e2e-1w.log
 *   node scripts/e2e-shard-groups.mjs --report=/tmp/e2e-1w.log
 * 只复核不写文件：--check=/tmp/e2e-1w.log（极差超过 ${MAX_SPREAD} 退码 1）。
 * tests/tooling/e2e-shard-groups.test.ts 守三件事：每个 spec 恰好属于一组、
 * 权重距今 ≤${MAX_AGE_DAYS} 天、按本表权重算出的分组极差 ≤${MAX_SPREAD}。
 */

/** 跑数时间（ISO）。守卫用它判权重是否过期，CI 里也读得到 */
export const MEASURED_AT = '${new Date().toISOString()}';
/** 生成时所处的 commit（溯源用，不参与判定） */
export const SOURCE_COMMIT = '${currentHead()}';
/** 跑数里的用例条数与总时长（秒） */
export const MEASURED_CASES = ${counted};
export const MEASURED_TOTAL_SEC = ${total.toFixed(1)};
/** 每个 spec 的实测权重（秒，跨 project 相加） */
export const SPEC_WEIGHTS = {
${weightLines}
};

export const E2E_GROUPS = [
${body}
];

/** 第 n 组（1 起）的文件清单 */
export function groupFiles(n) {
  return E2E_GROUPS[n - 1] ?? [];
}

/** 用 SPEC_WEIGHTS 算当前分组的各组权重与极差（--check 与守卫都走它） */
export function groupWeights() {
  const sums = E2E_GROUPS.map((g) => g.reduce((a, f) => a + (SPEC_WEIGHTS[f] ?? 0), 0));
  return { sums, spread: Math.max(...sums) / Math.min(...sums) };
}
`;
  fs.writeFileSync(GROUP_FILE, content, 'utf8');
  // 配套类型声明：测试从这份清单 import，没有声明文件时 TS 报隐式 any（TS7016）。
  // 扩展名必须是 .d.mts —— .d.ts 在 ESM 解析规则下不会被 `x.mjs` 认到。
  fs.writeFileSync(
    GROUP_FILE.replace(/\.mjs$/, '.d.mts'),
    `/** 由 scripts/e2e-shard-groups.mjs 生成，请勿手改（与 shard-groups.mjs 同版本） */
export declare const E2E_GROUPS: string[][];
export declare const MEASURED_AT: string;
export declare const SOURCE_COMMIT: string;
export declare const MEASURED_CASES: number;
export declare const MEASURED_TOTAL_SEC: number;
export declare const SPEC_WEIGHTS: Record<string, number>;
export declare function groupFiles(n: number): string[];
export declare function groupWeights(): { sums: number[]; spread: number };
`,
    'utf8'
  );
  console.log(
    `已写 ${path.relative(ROOT, GROUP_FILE)}：${groups.length} 组，权重 ${sums.map((s) => s.toFixed(0)).join(' / ')}s，极差 ${spread.toFixed(3)}x`
  );
}

const groupArg = argOf('group');
const reportArg = argOf('report');
const checkArg = argOf('check');

if (groupArg) {
  const mod = await import(pathToFileURL(GROUP_FILE).href);
  console.log(mod.groupFiles(Number(groupArg)).join(' '));
} else if (checkArg) {
  const { weights, counted } = readWeights(checkArg);
  const mod = await import(pathToFileURL(GROUP_FILE).href);
  const sums = mod.E2E_GROUPS.map((g) => g.reduce((a, f) => a + (weights.get(f) ?? 0), 0));
  const spread = Math.max(...sums) / Math.min(...sums);
  const unknown = [...weights.keys()].filter((f) => !mod.SPEC_WEIGHTS[f]);
  console.log(
    `新跑数 ${counted} 条；按现有分组算出的权重 ${sums.map((s) => s.toFixed(0)).join(' / ')}s，极差 ${spread.toFixed(3)}x`
  );
  if (unknown.length) {
    console.error(`跑数里这些 spec 在权重表没有（组文件比跑数旧）：${unknown.join(', ')}`);
    process.exitCode = 1;
  }
  if (spread > MAX_SPREAD) {
    console.error(`极差 ${spread.toFixed(2)}x 超过 ${MAX_SPREAD}，请用 --report=${checkArg} 重新分组`);
    process.exitCode = 1;
  } else if (!process.exitCode) {
    console.log('分组仍然够平，无需重生成');
  }
} else if (reportArg) {
  const { weights, counted } = readWeights(reportArg);
  const groupCount = Number(argOf('groups') ?? 4);
  const { groups, sums } = balance(weights, groupCount);
  writeFile(groups, sums, path.basename(reportArg), counted, weights);
} else {
  console.error('用法：--report=<list 报告> [--groups=4] | --check=<list 报告> | --group=<n>');
  process.exitCode = 1;
}
