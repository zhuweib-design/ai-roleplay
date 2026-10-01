/**
 * EVAL-01/02/03 · 评测执行脚本（eval-run）
 *
 * 对应计划 §3.3 评测基础设施：
 * - EVAL-01：加载 `eval/setting-facts-dataset.v1.json` 固定评测集（版本化，fail-fast 校验）；
 * - EVAL-02：固定命令一键运行判定链，输出机器可读 JSON + 人读摘要，失败非零退出码；
 * - EVAL-03：`--manifest` 落盘 manifest（commit / 数据集版本与 sha256 / 执行时间 / 结果摘要 / owner）。
 *
 * 判定链本体在 `src/core/eval-judgment.ts`（纯函数），经 esbuild 打包后调用——
 * 与 opt-eval.mjs 相同的复用机制；同 commit + 同参数运行结果确定。
 *
 * 诚实边界：离线产出的指标是「判定链在授权夹具（authored-fixture）上的自检 /
 * 回归基准」，**不是**真实 LLM 的设定一致率；后者依赖真实模型调用，由
 * opt-eval.mjs 的 requires-real-env 清单如实标注，两者不可互相替代。
 *
 * 运行方式：
 *   node scripts/eval-run.mjs                 # 运行判定链，输出人读摘要
 *   node scripts/eval-run.mjs --json          # 额外输出结构化 JSON
 *   node scripts/eval-run.mjs --strict        # 有指标不达标即退出码 1
 *   node scripts/eval-run.mjs --manifest      # 追加落盘 docs/dev/eval-manifest.json
 *
 * 退出码：0 = 运行完成（--strict 下表示门禁全通过）；1 = 校验失败 / 指标不达标。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const DATASET_PATH = path.join(PROJECT_ROOT, 'eval', 'setting-facts-dataset.v1.json');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'docs', 'dev', 'eval-manifest.json');
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'artifacts', 'eval-judgment-bundle.mjs');

/** 阈值来源：计划 §3.3 / opt-eval 既有口径（核心 100%，全量 ≥95%，情绪连贯 ≥90%） */
const THRESHOLDS = {
  coreConsistency: 1.0,
  fullConsistency: 0.95,
  emotionCoherence: 0.9,
  safetyCompliance: 1.0,
};

// ─────────────────────────────────────────────────────────────
// 参数解析
// ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const FLAG_JSON = argv.includes('--json');
const FLAG_STRICT = argv.includes('--strict');
const FLAG_MANIFEST = argv.includes('--manifest');

// ─────────────────────────────────────────────────────────────
// 判定链打包（esbuild stdin → artifacts → 动态 import，与 opt-eval 同机制）
// ─────────────────────────────────────────────────────────────

async function loadJudgmentChain() {
  const entry = [
    `export * as judgment from './src/core/eval-judgment.ts';`,
  ].join('\n');
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: PROJECT_ROOT, sourcefile: 'eval-run-entry.ts', loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: ['vue', 'gpt-tokenizer'],
    alias: { '@': path.join(PROJECT_ROOT, 'src') },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  if (!fs.existsSync(path.dirname(BUNDLE_PATH))) {
    fs.mkdirSync(path.dirname(BUNDLE_PATH), { recursive: true });
  }
  fs.writeFileSync(BUNDLE_PATH, result.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(BUNDLE_PATH).href);
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

async function main() {
  const { judgment } = await loadJudgmentChain();

  const raw = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  const validation = judgment.validateDataset(raw);
  if (!validation.ok) {
    console.error('[eval-run] 数据集校验失败（fail-fast，不在坏数据上产出数字）：');
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const lines = [];
  const line = (s = '') => { lines.push(s); if (!FLAG_JSON) console.log(s); };

  line(`eval-run · 数据集 ${raw.datasetId} ${raw.datasetVersion}`);
  line(`  样本 ${raw.samples.length} 条；判定链 = src/core/eval-judgment.ts（确定性，无 LLM）`);
  line('');

  // ── 逐层判定 ──
  const factsReports = [];
  let safetyAgree = 0;
  let safetyTotal = 0;
  let emotionAdjacent = 0;
  let emotionAgreeing = 0;
  let factTotal = 0;
  let coreTotal = 0;

  for (const sample of raw.samples) {
    if (sample.layer === 'group-safety') {
      const cases = sample.safetyCases ?? [];
      const report = judgment.judgeSafety(cases);
      safetyAgree += report.judgments.filter((j) => j.compliant).length;
      safetyTotal += report.judgments.length;
      continue;
    }
    const fr = judgment.judgeFacts(sample.facts ?? [], sample.turns);
    factsReports.push({ sampleId: sample.id, report: fr });
    factTotal += fr.fullTotal;
    coreTotal += fr.coreTotal;
    if (sample.emotionCorpus === true) {
      const ec = judgment.emotionCoherence(sample.turns);
      emotionAdjacent += ec.adjacentPairs;
      emotionAgreeing += ec.agreeingPairs;
    }
  }

  // 汇总一致率：全量口径（跨样本合并分母），核心口径同理
  const consistentFull = factsReports.reduce(
    (acc, { report }) => acc + report.judgments.filter((j) => j.consistent).length, 0);
  const consistentCore = factsReports.reduce((acc, { report, sampleId }) => {
    const sample = raw.samples.find((s) => s.id === sampleId);
    const coreFacts = (sample.facts ?? []).filter((f) => f.core === true);
    return acc + report.judgments.filter((j) => {
      const fact = coreFacts.find((f) => f.id === j.factId);
      return fact !== undefined && j.consistent;
    }).length;
  }, 0);

  const fullRate = factTotal === 0 ? 0 : consistentFull / factTotal;
  const coreRate = coreTotal === 0 ? null : consistentCore / coreTotal;
  const emotionRate = emotionAdjacent === 0 ? null : emotionAgreeing / emotionAdjacent;
  const safetyRate = safetyTotal === 0 ? null : safetyAgree / safetyTotal;

  line('判定链自检指标（authored-fixture 语料，非真实 LLM 数字）：');
  const metrics = [
    {
      id: 'core-setting-consistency-selfcheck',
      name: '核心设定一致率（自检）',
      value: coreRate,
      target: `>= ${THRESHOLDS.coreConsistency * 100}%`,
      pass: coreRate !== null && coreRate >= THRESHOLDS.coreConsistency,
    },
    {
      id: 'full-setting-consistency-selfcheck',
      name: '全量设定一致率（自检）',
      value: fullRate,
      target: `>= ${THRESHOLDS.fullConsistency * 100}%`,
      pass: fullRate >= THRESHOLDS.fullConsistency,
    },
    {
      id: 'emotion-label-coherence-selfcheck',
      name: '情绪标注相邻连贯率（detectEmotion 回归基准）',
      value: emotionRate,
      target: emotionRate === null ? '无可比轮对' : `>= ${THRESHOLDS.emotionCoherence * 100}%`,
      pass: emotionRate !== null && emotionRate >= THRESHOLDS.emotionCoherence,
    },
    {
      id: 'group-safety-compliance-selfcheck',
      name: '群聊安全合规率（自检）',
      value: safetyRate,
      target: safetyRate === null ? '无用例' : `>= ${THRESHOLDS.safetyCompliance * 100}%`,
      pass: safetyRate !== null && safetyRate >= THRESHOLDS.safetyCompliance,
    },
  ];

  let allPass = true;
  for (const m of metrics) {
    const valueText = m.value === null ? 'n/a' : `${(m.value * 100).toFixed(1)}%`;
    const mark = m.pass ? 'PASS' : 'FAIL';
    if (!m.pass) allPass = false;
    line(`  [${mark}] ${m.name}: ${valueText}（目标 ${m.target}）`);
  }
  line('');
  line(`事实总数 ${factTotal}（计划要求 20–50）；核心事实 ${coreTotal}（要求 ≤10）`);
  line('诚实边界：以上为判定链自检数字；真实 LLM 一致率仍属 requires-real-env（见 opt-eval）。');

  const report = {
    mode: 'offline-fixture-selfcheck',
    datasetId: raw.datasetId,
    datasetVersion: raw.datasetVersion,
    datasetSha256: crypto.createHash('sha256').update(fs.readFileSync(DATASET_PATH)).digest('hex'),
    factTotal,
    coreTotal,
    metrics,
    allPass,
    ranAt: new Date().toISOString(),
  };

  if (FLAG_JSON) {
    console.log(JSON.stringify(report, null, 2));
  }

  // ── EVAL-03：manifest 落盘 ──
  if (FLAG_MANIFEST) {
    let commit = 'unknown';
    try {
      commit = execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    } catch {
      // 无 git 环境时如实记录 unknown，不编造
    }
    const manifest = {
      schemaVersion: 1,
      kind: 'aijiuguan-eval-manifest',
      mode: report.mode,
      commit,
      dataset: {
        id: report.datasetId,
        version: report.datasetVersion,
        path: path.relative(PROJECT_ROOT, DATASET_PATH),
        sha256: report.datasetSha256,
      },
      owner: raw.owner ?? '【待确认】',
      ranAt: report.ranAt,
      environment: { node: process.version },
      thresholds: THRESHOLDS,
      results: metrics.map(({ id, value, target, pass }) => ({ id, value, target, pass })),
      summary: `${metrics.filter((m) => m.pass).length}/${metrics.length} 项达标`,
      honestBoundary:
        '判定链自检数字，非真实 LLM 指标；真实环境指标由 opt-eval.mjs requires-real-env 清单管理。',
    };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    if (!FLAG_JSON) console.log(`\nmanifest 已写入：${path.relative(PROJECT_ROOT, MANIFEST_PATH)}`);
  }

  if (FLAG_STRICT && !allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[eval-run] 运行出错：', err);
  process.exit(1);
});
