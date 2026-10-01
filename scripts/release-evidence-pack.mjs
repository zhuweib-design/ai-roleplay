/**
 * 质量证据包生成器（计划 §8.2）
 *
 * 背景：原 `release-evidence.mjs` 只产出一个 manifest.json，且把全部门禁标记为
 * `not-run`。计划 §8.2 要求**逐项 result 文件**（unit / e2e / build / csp / i18n /
 * contrast / schema / postgres / migration / provider …），§8.3 更把
 * 「质量门禁未执行或仅复用历史结果」列为发布 No-Go。
 *
 * 本脚本据此补齐：
 * - 实际运行可运行的门禁，按项写入真实结果（exit code / 耗时 / 输出摘要）；
 * - 依赖外部环境、本机无法运行的门禁（真实 PG、真实 Provider），显式记为
 *   `skipped` 并写明原因——**不伪造通过**（沿用原脚本的诚实策略）；
 * - 每项结果记录 commit SHA；`--check` 据此拒绝「仅复用历史结果」。
 *
 * 用法：
 *   node scripts/release-evidence-pack.mjs --write            # 生成证据包
 *   node scripts/release-evidence-pack.mjs --write --full     # 追加 e2e 用例
 *   node scripts/release-evidence-pack.mjs --check            # 发布门禁校验
 *   node scripts/release-evidence-pack.mjs --check --allow-skipped
 *
 * 输出：artifacts/release-evidence/v<version>/
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'artifacts', 'release-evidence', `v${pkg.version}`);
const FULL = args.includes('--full');

/** 单条命令的输出摘要上限（避免证据文件被超长日志撑爆）。 */
const TAIL_CHARS = 4000;

function git(command) {
  try {
    return execFileSync('git', command, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sha256File(relativePath) {
  const abs = path.join(ROOT, relativePath);
  return fs.existsSync(abs)
    ? crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
    : null;
}

const COMMIT = git(['rev-parse', 'HEAD']);
const BRANCH = git(['branch', '--show-current']);
const WORKTREE_CLEAN = git(['status', '--porcelain']) === '';

/** 通过 npm 运行脚本；返回退出码与输出。 */
function runNpmScript(name) {
  const started = Date.now();
  const result = spawnSync('npm', ['run', '--silent', name], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = (result.stdout ?? '').toString();
  const stderr = (result.stderr ?? '').toString();
  return {
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    output: `${stdout}${stderr}`,
  };
}

/** 判定式：把命令结果转成 gate 结果对象。 */
function makeResult({ id, plan, kind, result, artifacts = {} }) {
  const passed = result.exitCode === 0;
  return {
    id,
    // 计划 §8.2 中的目标文件名（便于与计划逐项对照）
    planFile: plan,
    status: passed ? 'passed' : 'failed',
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    commit: COMMIT,
    generatedAt: new Date().toISOString(),
    kind,
    outputTail: result.output.slice(-TAIL_CHARS),
    ...artifacts,
  };
}

/** 无法在本机运行的门禁：显式记录 skipped 与原因，绝不伪造通过。 */
function skippedResult({ id, plan, reason }) {
  return {
    id,
    planFile: plan,
    status: 'skipped',
    reason,
    commit: COMMIT,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 门禁清单。`npmScript` 存在则可运行；否则视为环境依赖，记为 skipped。
 * planFile 与计划 §8.2 的目录结构逐项对应。
 */
const GATES = [
  { id: 'unit-integration', planFile: 'unit-integration-result.json', npmScript: 'test' },
  { id: 'build', planFile: 'build-result.txt', npmScript: 'build' },
  { id: 'csp', planFile: 'csp-result.json', npmScript: 'check:csp' },
  { id: 'i18n', planFile: 'i18n-result.json', npmScript: 'i18n:check:strict' },
  { id: 'css-contrast', planFile: 'css-contrast-result.json', npmScript: 'a11y:contrast' },
  { id: 'runtime-schema', planFile: 'runtime-schema-result.json', npmScript: 'runtime:db:schema:check' },
  { id: 'snapshot-migration', planFile: 'snapshot-migration-result.json', npmScript: 'snapshot:migration:check' },
  { id: 'typecheck', planFile: 'typecheck-result.json', npmScript: 'typecheck' },
  { id: 'lint', planFile: 'lint-result.json', npmScript: 'lint' },
  {
    id: 'e2e-desktop',
    planFile: 'e2e-desktop-result.json',
    npmScript: 'test:e2e',
    // E2E 依赖 dev server / 浏览器，耗时长；默认按 --full 决定是否纳入
    requiresFull: true,
  },
  {
    id: 'e2e-mobile',
    planFile: 'e2e-mobile-result.json',
    npmScript: 'test:e2e',
    requiresFull: true,
  },
  {
    id: 'postgres-transaction',
    planFile: 'postgres-transaction-result.json',
    // 条件门禁（DB-01）：设置 RUNTIME_PG_TEST_URL 即真实执行被门控的集成测试，
    // 未设置则诚实 skipped。本机可用嵌入式 PG（artifacts/pg-embedded/run-pg-tests.mjs）。
    envKey: 'RUNTIME_PG_TEST_URL',
    skipReason: '需要真实 PostgreSQL 实例：设置 RUNTIME_PG_TEST_URL 后本门禁自动真实执行（本机可用 artifacts/pg-embedded/run-pg-tests.mjs 拉起嵌入式 PG）',
    run: () => {
      const started = Date.now();
      const result = spawnSync(
        'npx',
        [
          'vitest', 'run',
          'tests/runtime/postgres-runtime.integration.test.ts',
          'tests/runtime/postgres-group.integration.test.ts',
        ],
        { cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 }
      );
      return {
        exitCode: result.status ?? 1,
        durationMs: Date.now() - started,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      };
    },
  },
  {
    id: 'migration-restore',
    planFile: 'migration-restore-result.json',
    reason: '需要真实 PostgreSQL 实例执行 pg_dump/pg_restore 演练；本机未配置',
  },
  {
    id: 'provider-regression',
    planFile: 'provider-regression-result.json',
    // 条件门禁（API-01）：提供真实 Provider Key 后自动执行 opt-eval 的真实环境探针。
    envKey: 'OPENAI_API_KEY',
    skipReason: '需要真实 Provider API Key：设置 OPENAI_API_KEY（及可选 OPENAI_BASE_URL）后本门禁自动执行 opt-eval --with-api；仓库不内置密钥',
    run: () => {
      const started = Date.now();
      const result = spawnSync(
        'node',
        ['scripts/opt-eval.mjs', '--with-api', '--json'],
        { cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 }
      );
      return {
        exitCode: result.status ?? 1,
        durationMs: Date.now() - started,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      };
    },
  },
];

function buildPack() {
  const results = [];
  for (const gate of GATES) {
    if (gate.reason) {
      results.push(skippedResult({ id: gate.id, plan: gate.planFile, reason: gate.reason }));
      continue;
    }
    // 条件门禁（envKey + run）：环境就绪即真实执行；未就绪则诚实 skipped。
    if (gate.envKey && typeof gate.run === 'function') {
      if (!process.env[gate.envKey]) {
        results.push(skippedResult({ id: gate.id, plan: gate.planFile, reason: gate.skipReason }));
        continue;
      }
      process.stdout.write(`[release-evidence-pack] 运行门禁 ${gate.id}（${gate.envKey} 已设置）…\n`);
      const result = gate.run();
      results.push(makeResult({ id: gate.id, plan: gate.planFile, kind: `env:${gate.envKey}`, result }));
      continue;
    }
    if (gate.requiresFull && !FULL) {
      results.push(skippedResult({
        id: gate.id,
        plan: gate.planFile,
        reason: 'E2E 需 dev server 与浏览器且耗时较长；加 --full 纳入',
      }));
      continue;
    }
    const npmScript = gate.npmScript;
    const exists = typeof pkg.scripts?.[npmScript] === 'string';
    if (!exists) {
      results.push(skippedResult({ id: gate.id, plan: gate.planFile, reason: `缺少 npm 脚本：${npmScript}` }));
      continue;
    }
    process.stdout.write(`[release-evidence-pack] 运行门禁 ${gate.id}（npm run ${npmScript}）…\n`);
    const result = runNpmScript(npmScript);
    results.push(makeResult({ id: gate.id, plan: gate.planFile, kind: npmScript, result }));
  }
  return results;
}

/** 汇总成质量门禁清单（计划 §8.2 的 quality-gate-manifest.json）。 */
function buildQualityManifest(results) {
  const count = (status) => results.filter((r) => r.status === status).length;
  return {
    manifestVersion: 1,
    packageVersion: pkg.version,
    commit: COMMIT,
    branch: BRANCH,
    workingTreeClean: WORKTREE_CLEAN,
    generatedAt: new Date().toISOString(),
    artifactHashes: {
      'migrations/001_virtual_character_os.sql': sha256File('migrations/001_virtual_character_os.sql'),
    },
    gates: Object.fromEntries(results.map((r) => [r.id, {
      status: r.status,
      planFile: r.planFile,
      commit: r.commit,
      ...(r.status === 'skipped' ? { reason: r.reason } : { exitCode: r.exitCode, durationMs: r.durationMs }),
    }])),
    summary: {
      total: results.length,
      passed: count('passed'),
      failed: count('failed'),
      skipped: count('skipped'),
    },
  };
}

const KNOWN_ISSUES = `# 已知问题（1.0.0）

本文件记录发布时**仍未闭环**的项，避免"全部通过"的错觉掩盖真实缺口。

## 未在本机执行的门禁

以下门禁依赖外部环境，证据包中标记为 \`skipped\`（非伪造通过）：

- **postgres-transaction**（条件门禁）：设置 \`RUNTIME_PG_TEST_URL\` 即自动真实执行
  两个 Runtime PG 集成测试文件；本机可用 \`artifacts/pg-embedded/run-pg-tests.mjs\`
  拉起嵌入式 PostgreSQL 后执行（2026-10-01 已用该方式取得真实通过证据）。
- **migration-restore**：需真实实例执行 \`pg_dump\` / \`pg_restore\` 演练。
- **provider-regression**（条件门禁）：设置 \`OPENAI_API_KEY\`（及可选 \`OPENAI_BASE_URL\`）
  后自动执行 \`opt-eval --with-api\` 真实环境探针；仓库不内置密钥。

执行方式见 \`docs/dev/runtime-database-migration-runbook.md\` §5 与
\`docs/dev/data-backup-restore.md\` §4A.4。

## 计划符合度未闭环项

详见 \`docs/dev/PLAN_AUDIT_2026-09-28.md\`：其中 P2 项（群聊游标分页、创作模式 Preset、
预设/正则绑定、故事分支等）尚未实现；P1 的真实 PG / Provider 回归需在具备环境后执行。
`;

if (args.includes('--write')) {
  const results = buildPack();
  const manifest = buildQualityManifest(results);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // 逐项 result 文件
  for (const result of results) {
    const isTxt = result.planFile.endsWith('.txt');
    const body = isTxt
      ? `status: ${result.status}\nexitCode: ${result.exitCode ?? 'n/a'}\ndurationMs: ${result.durationMs ?? 'n/a'}\ncommit: ${result.commit}\n\n${result.outputTail ?? result.reason ?? ''}\n`
      : `${JSON.stringify(result, null, 2)}\n`;
    fs.writeFileSync(path.join(OUT_DIR, result.planFile), body, 'utf8');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'quality-gate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'release-commit.txt'), `${COMMIT ?? 'unknown'}\n${BRANCH ?? ''}\n`, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'known-issues.md'), KNOWN_ISSUES, 'utf8');

  console.log(`[release-evidence-pack] 已写入 ${path.relative(ROOT, OUT_DIR)}`);
  console.log(`[release-evidence-pack] passed=${manifest.summary.passed} failed=${manifest.summary.failed} skipped=${manifest.summary.skipped}`);
  if (manifest.summary.failed > 0) process.exitCode = 1;
}

if (args.includes('--check')) {
  const errors = [];
  const allowSkipped = args.includes('--allow-skipped');

  if (!fs.existsSync(path.join(OUT_DIR, 'quality-gate-manifest.json'))) {
    errors.push(`证据包不存在：请先运行 node scripts/release-evidence-pack.mjs --write（目标目录 ${path.relative(ROOT, OUT_DIR)}）`);
  } else {
    const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'quality-gate-manifest.json'), 'utf8'));
    // §8.3：不得仅复用历史结果
    if (manifest.commit !== COMMIT) {
      errors.push(`证据包来自 commit ${manifest.commit}，当前为 ${COMMIT}——不得复用历史结果（§8.3）`);
    }
    // 逐项 result 文件必须齐全
    for (const gate of GATES) {
      if (!fs.existsSync(path.join(OUT_DIR, gate.planFile))) {
        errors.push(`缺少结果文件：${gate.planFile}`);
      }
    }
    for (const [id, gate] of Object.entries(manifest.gates ?? {})) {
      if (gate.status === 'failed') errors.push(`门禁失败：${id}`);
      if (gate.status === 'skipped' && !allowSkipped) {
        errors.push(`门禁未执行：${id}（${gate.reason ?? '原因未记录'}）——若环境确实不具备，加 --allow-skipped 并在 known-issues.md 说明`);
      }
    }
  }

  if (errors.length) {
    console.error(errors.map((e) => `[release-evidence-pack] ${e}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('[release-evidence-pack] 证据包校验通过。');
  }
}

if (!args.includes('--write') && !args.includes('--check')) {
  console.log(JSON.stringify(buildQualityManifest(
    GATES.map((g) => ({ id: g.id, planFile: g.planFile, status: g.reason ? 'skipped' : 'planned', commit: COMMIT, reason: g.reason })),
  ), null, 2));
  console.log('\n[release-evidence-pack] 预览模式：加 --write 生成证据包，--check 校验。');
}
