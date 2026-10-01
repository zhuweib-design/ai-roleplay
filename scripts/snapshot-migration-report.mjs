/**
 * 快照迁移兼容性报告（MIG-01）
 *
 * 计划要求 MIG-01 交付「migration fixtures / forward migration /
 * restore verification / 兼容性报告」四项。本脚本产出最后一项：
 * 遍历仓库内已登记的快照迁移计划，校验其自洽性（链路连续、无环、版本单调），
 * 并输出人读报告，便于发布前归档与评审。
 *
 * 用法：
 *   node scripts/snapshot-migration-report.mjs            # 打印报告
 *   node scripts/snapshot-migration-report.mjs --check    # 自检失败则非零退出（门禁用）
 *   node scripts/snapshot-migration-report.mjs --json     # 机器可读输出
 *
 * 说明：脚本通过静态解析 src/storage/snapshot-plans.ts 获取计划清单，
 * 避免引入 TS 运行时依赖；自洽性校验逻辑与 src/storage/snapshot-migration.ts
 * 的 validateMigrationPlan 同构，两侧不一致时由测试兜底（见 snapshot-migration.test.ts）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plansPath = path.join(root, 'src', 'storage', 'snapshot-plans.ts');
const source = fs.readFileSync(plansPath, 'utf8');

/** 从 TS 源码抽取每个计划的 key / currentVersion / legacyVersion 与步骤版本区间。 */
function parsePlans(text) {
  const plans = [];
  // 以 `export const XXX_MIGRATION_PLAN: SnapshotMigrationPlan = { ... };` 分块
  const blockPattern = /export const (\w+_MIGRATION_PLAN): SnapshotMigrationPlan = \{([\s\S]*?)\n\};/g;
  let block;
  while ((block = blockPattern.exec(text)) !== null) {
    const [, name, body] = block;
    const key = body.match(/key:\s*'([^']+)'/)?.[1];
    const currentVersion = Number(body.match(/currentVersion:\s*(\d+)/)?.[1]);
    const legacyVersion = Number(body.match(/legacyVersion:\s*(\d+)/)?.[1] ?? 0);
    const steps = [];
    const stepPattern = /from:\s*(\d+),\s*\n\s*to:\s*(\d+),/g;
    let step;
    while ((step = stepPattern.exec(body)) !== null) {
      steps.push({ from: Number(step[1]), to: Number(step[2]) });
    }
    if (key && Number.isFinite(currentVersion)) {
      plans.push({ name, key, currentVersion, legacyVersion, steps });
    }
  }
  return plans;
}

/** 与 validateMigrationPlan 同构的自洽性校验。 */
function validate(plan) {
  const errors = [];
  if (plan.legacyVersion > plan.currentVersion) {
    errors.push(`legacyVersion(${plan.legacyVersion}) 高于 currentVersion(${plan.currentVersion})`);
  }
  const byFrom = new Map();
  for (const step of plan.steps) {
    if (step.to <= step.from) errors.push(`步骤 ${step.from} → ${step.to} 未向前推进`);
    if (byFrom.has(step.from)) errors.push(`版本 ${step.from} 存在重复步骤`);
    byFrom.set(step.from, step.to);
  }
  let cursor = plan.legacyVersion;
  const visited = new Set();
  while (cursor < plan.currentVersion) {
    if (visited.has(cursor)) { errors.push(`迁移链在版本 ${cursor} 成环`); break; }
    visited.add(cursor);
    const next = byFrom.get(cursor);
    if (next === undefined) { errors.push(`缺少从版本 ${cursor} 出发的步骤`); break; }
    cursor = next;
  }
  if (cursor > plan.currentVersion) errors.push(`迁移链越过目标版本，止于 ${cursor}`);
  return errors;
}

const plans = parsePlans(source);
if (plans.length === 0) {
  console.error('[snapshot-migration] 未从 snapshot-plans.ts 解析到任何迁移计划');
  process.exitCode = 1;
} else {
  const results = plans.map((plan) => ({ ...plan, errors: validate(plan) }));
  const failed = results.filter((r) => r.errors.length > 0);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ plans: results, ok: failed.length === 0 }, null, 2));
  } else {
    console.log('[snapshot-migration] 快照迁移兼容性报告');
    console.log(`  计划总数：${results.length}`);
    for (const r of results) {
      const mark = r.errors.length === 0 ? 'OK  ' : 'FAIL';
      console.log(`  [${mark}] ${r.key}`);
      console.log(`         版本 ${r.legacyVersion} → ${r.currentVersion}，步骤 ${r.steps.length} 段`);
      for (const step of r.steps) console.log(`         - ${step.from} → ${step.to}`);
      for (const err of r.errors) console.log(`         ! ${err}`);
    }
    console.log(failed.length === 0
      ? '[snapshot-migration] 全部计划自洽'
      : `[snapshot-migration] ${failed.length} 个计划存在问题`);
  }

  if (process.argv.includes('--check') && failed.length > 0) process.exitCode = 1;
}
