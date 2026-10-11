#!/usr/bin/env node
/**
 * e2e 分片权重生成器（M16-c）
 *
 * 为什么不用 `--shard=i/4`：Playwright 只按**用例条数**切，不看每条跑多久。
 * 2026-10-11 实测（本地单 worker 全量，177 条 / 32 个 spec）：四片的时长是
 * 507s / 390s / 515s / 156s，最慢片是最快片的 3.31 倍——整套 e2e 的墙钟由最慢那片决定，
 * 另外三台机器提前空闲。改成"按实测时长分组"后极差压到 1.05 倍。
 *
 * 用法：
 *   node scripts/e2e-shard-groups.mjs --report=<list 报告文件> [--groups=4]
 *     重新计算并写 e2e/shard-groups.mjs（本地跑 `npx playwright test --workers=1 --reporter=list`
 *     的输出重定向到文件即可）
 *   node scripts/e2e-shard-groups.mjs --group=2
 *     打印第 2 组的文件清单（CI 用它拼命令行参数）
 *
 * 权重是"多久之前测的"这件事会过期，所以生成文件里带跑数日期与总时长，
 * 而 tests/tooling/e2e-shard-groups.test.ts 守住"每个 spec 恰好属于一组"，
 * 免得新增用例没进任何组被 CI 静默漏掉。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GROUP_FILE = path.join(ROOT, 'e2e', 'shard-groups.mjs');

const argv = process.argv.slice(2);
const argOf = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : undefined;
};

/** 从 `--reporter=list` 的输出里提每条用例的秒数，按 spec 文件汇总（跨 project 相加） */
function readWeights(reportPath) {
  const text = fs.readFileSync(reportPath, 'utf8');
  // 项目名含连字符（mobile-functional-msedge），所以字符类要带上 -；
  // 早先只写 \w+ 时整个移动 project 的 14 条用例都不在权重表里，两个 mobile spec
  // 因此没进任何分组 ⇒ CI 会静默不跑它们（tests/tooling/e2e-shard-groups.test.ts 就是拦这个的）
  const line =
    /^\s*(?:ok|passed|✓|failed|✘)\s+\d+\s+\[[\w-]+\]\s+›\s+(\S+?\.spec\.\w+):\d+:\d+\s+›.*?\((\d+(?:\.\d+)?)(ms|s)\)/;
  // 失败行也要计入权重，否则下一次跑数的权重会少掉红的那几条
  const anyLine =
    /^\s*\S+\s+\d+\s+\[[\w-]+\]\s+›\s+(\S+?\.spec\.\w+):\d+:\d+\s+›.*?\((\d+(?:\.\d+)?)(ms|s)\)/;
  const weights = new Map();
  let counted = 0;
  for (const raw of text.split(/\r?\n/)) {
    const m = line.exec(raw) ?? anyLine.exec(raw);
    if (!m) continue;
    const rel = m[1].replace(/\\/g, '/');
    const sec = parseFloat(m[2]) / (m[3] === 'ms' ? 1000 : 1);
    weights.set(rel, (weights.get(rel) ?? 0) + sec);
    counted++;
  }
  if (weights.size === 0) {
    throw new Error(`从 ${reportPath} 没解析出任何用例时长（格式不对？要 --reporter=list）`);
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

function writeFile(groups, sums, source, counted) {
  const total = sums.reduce((a, b) => a + b, 0);
  const body = groups
    .map(
      (g, i) =>
        `  // 第 ${i + 1} 组：实测 ${sums[i].toFixed(0)}s\n  [\n${g
          .sort()
          .map((f) => `    '${f}',`)
          .join('\n')}\n  ],`
    )
    .join('\n');
  const content = `/**
 * e2e 分片组（由 scripts/e2e-shard-groups.mjs 生成，请勿手改）
 *
 * 生成依据：${source} 的**单 worker**实测时长（${counted} 条用例 / ${total.toFixed(0)}s，
 * 日期见最近一次提交这条文件的记录）。四组权重极差约 ${(Math.max(...sums) / Math.min(...sums)).toFixed(2)}x。
 * 为什么不用 --shard：Playwright 只按用例条数切，不看时长，实测极差到过 3.31x。
 *
 * 新增 spec 后要重新生成：
 *   npx playwright test --workers=1 --reporter=list > /tmp/e2e-1w.log
 *   node scripts/e2e-shard-groups.mjs --report=/tmp/e2e-1w.log
 * tests/tooling/e2e-shard-groups.test.ts 会守住"每个 spec 恰好属于一组"。
 */
export const E2E_GROUPS = [
${body}
];

/** 第 n 组（1 起）的文件清单 */
export function groupFiles(n) {
  return E2E_GROUPS[n - 1] ?? [];
}
`;
  fs.writeFileSync(GROUP_FILE, content, 'utf8');
  // 配套的类型声明：测试从这份清单 import，没有声明文件时 TS 报隐式 any（TS7016）。
  // 扩展名必须是 .d.mts —— .d.ts 在 ESM 解析规则下不会被 `x.mjs` 认到。
  // 让生成器把类型一起生成，而不是在调用点压错误，两边永远同版本。
  fs.writeFileSync(
    GROUP_FILE.replace(/\.mjs$/, '.d.mts'),
    `/** 由 scripts/e2e-shard-groups.mjs 生成，请勿手改（与 shard-groups.mjs 同版本） */
export declare const E2E_GROUPS: string[][];
export declare function groupFiles(n: number): string[];
`,
    'utf8'
  );
  console.log(`已写 ${path.relative(ROOT, GROUP_FILE)}：${groups.length} 组，权重 ${sums.map((s) => s.toFixed(0)).join(' / ')}s`);
}

const groupArg = argOf('group');
const reportArg = argOf('report');

if (groupArg) {
  const mod = await import(pathToFileURL(GROUP_FILE).href);
  console.log(mod.groupFiles(Number(groupArg)).join(' '));
} else if (reportArg) {
  const { weights, counted } = readWeights(path.resolve(reportArg));
  const groupCount = Number(argOf('groups') ?? 4);
  const { groups, sums } = balance(weights, groupCount);
  writeFile(groups, sums, path.basename(reportArg), counted);
} else {
  console.error('用法：--report=<list 报告> [--groups=4] 或 --group=<n>');
  process.exitCode = 1;
}
