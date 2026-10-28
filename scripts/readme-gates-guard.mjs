#!/usr/bin/env node
/**
 * 门禁：README 的门禁清单必须与 CI 实际跑的守卫一致
 *
 * 起因（2026-10-19）：给 README 补口径时发现，`check:file-size` / `check:control-size` /
 * `check:primitives` / `check:no-release-assets` 四条守卫早就进了 `.github/workflows/ci.yml`，
 * 但中英两份 README 一条都没提——清单是靠人手抄的，加一条守卫没人回头补文档。
 * README 是"提交前该跑什么"的唯一入口，漏一条就等于让所有人按残缺清单跑，
 * 这正是 10-16 那次"只跑熟悉的几条、把违规放进 master"的同一个形状。
 *
 * 判据（双向）：
 *   1. `quality-gates` 里每条 `npm run X`（不含 `X:self-test` 那种伴生步）都必须出现在
 *      README 中英两侧的"本地开发门禁"代码块里 ⇒ 缺了就红；
 *   2. 那块里列了但 CI 不跑的，同样红 ⇒ 防反向漂移；
 *   3. 从 ci.yml 一条都没解析出来也红 ⇒ 防"判据空跑"（作业改名/缩进变了会让集合凭空变空，
 *      那时前两条会全体通过，看着绿其实什么都没比对）。
 *
 * 不覆盖的部分（说明白，别当成全查了）：README 里那段用中文散文描述 CI 顺序的文字不参与比对，
 * 因为它写的是步骤中文名而不是脚本名；本门禁只认代码块里的 `npm run`。
 *
 * 用法：
 *   node scripts/readme-gates-guard.mjs              # 比对当前仓库
 *   node scripts/readme-gates-guard.mjs --self-test  # 纯函数自检（不读文件）
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

/** 伴生的自检步不算"提交前要跑的门禁"，README 也不该为它们各写一行 */
const SELF_TEST_SUFFIX = ':self-test';

/** 从 ci.yml 文本里取 `quality-gates` 这段 job 的 npm run 脚本名 */
export function ciGateScripts(ciYml) {
  const lines = ciYml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^ {2}quality-gates:/.test(l));
  if (start === -1) return [];
  const block = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    // 缩进 2 且非空 ⇒ 到了下一个 job，quality-gates 段结束
    if (/^ {2}\S/.test(lines[i])) break;
    block.push(lines[i]);
  }
  const found = [];
  for (const line of block) {
    // 注释行里的 `npm run X` 不算 CI 实跑（ci.yml 里"各子检查仍可单独运行"那段就是注释）
    if (/^\s*#/.test(line)) continue;
    for (const m of line.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) found.push(m[1]);
  }
  return [...new Set(found)].filter((name) => !name.endsWith(SELF_TEST_SUFFIX));
}

/**
 * 从 README 文本里取"本地开发门禁"之后第一个代码块中的 npm run 脚本名。
 * 标题按语言各认一种，取第一个命中；代码块只认 ```bash 围栏。
 */
export function readmeGateScripts(readme, headings) {
  const lines = readme.split(/\r?\n/);
  const headingAt = headings
    .map((h) => lines.findIndex((l) => l.trim() === h))
    .find((i) => i >= 0);
  if (headingAt === -1) return null;
  let fence = -1;
  for (let i = headingAt + 1; i < lines.length; i += 1) {
    if (fence === -1) {
      if (/^```bash\s*$/.test(lines[i])) fence = i;
      continue;
    }
    if (/^```\s*$/.test(lines[i])) break;
  }
  if (fence === -1) return null;
  const end = lines.findIndex((l, idx) => idx > fence && /^```\s*$/.test(l));
  const body = lines.slice(fence + 1, end === -1 ? lines.length : end).join('\n');
  const found = [];
  for (const m of body.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
    if (!m[1].endsWith(SELF_TEST_SUFFIX)) found.push(m[1]);
  }
  return [...new Set(found)];
}

/** 纯判据：返回违规清单（每条一句人话），空数组即通过 */
export function findViolations(ciScripts, readmePairs) {
  const out = [];
  if (ciScripts.length === 0) {
    out.push('从 ci.yml 的 quality-gates 里一条 npm run 都没解析到：判据空跑，本次比对不作数');
    return out;
  }
  for (const { label, scripts } of readmePairs) {
    if (scripts === null) {
      out.push(`${label}：找不到"本地开发门禁"标题或它下面的 bash 代码块，无法比对`);
      continue;
    }
    const missing = ciScripts.filter((s) => !scripts.includes(s));
    const extra = scripts.filter((s) => !ciScripts.includes(s));
    if (missing.length) {
      out.push(`${label} 缺 ${missing.length} 条 CI 实跑的守卫：${missing.join(', ')}`);
    }
    if (extra.length) {
      out.push(`${label} 列了 ${extra.length} 条 CI 不跑的守卫：${extra.join(', ')}`);
    }
  }
  return out;
}

function selfTest() {
  const ci = ['lint', 'check:save-blob', 'check:no-artifact', 'build'];
  const cases = [
    { name: '两侧都全 ⇒ 不违规', ci, pairs: [{ label: 'zh', scripts: ci }, { label: 'en', scripts: ci }], want: 0 },
    { name: '少抄一条 ⇒ 违规', ci, pairs: [{ label: 'zh', scripts: ci.slice(1) }, { label: 'en', scripts: ci }], want: 1 },
    { name: '多列一条 CI 不跑的 ⇒ 违规', ci, pairs: [{ label: 'zh', scripts: ci }, { label: 'en', scripts: [...ci, 'check:gone'] }], want: 1 },
    { name: '标题/代码块找不到 ⇒ 违规（不是静默跳过）', ci, pairs: [{ label: 'zh', scripts: null }], want: 1 },
    { name: 'CI 解析成空集合 ⇒ 违规（防判据空跑）', ciScriptsEmpty: true, pairs: [{ label: 'zh', scripts: ci }], want: 1 },
    { name: '伴生的 self-test 步不算门禁', ciWithSelf: true, pairs: [{ label: 'zh', scripts: ci }, { label: 'en', scripts: ci }], want: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const ciSet = c.ciScriptsEmpty ? [] : c.ciWithSelf ? [...ci, 'check:save-blob'] : ci;
    const pairs = c.pairs.map((p) => ({ ...p }));
    const got = findViolations(ciSet, pairs).length;
    const ok = got === c.want;
    if (!ok) failed += 1;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name}（期望 ${c.want} 条违规，实得 ${got}）`);
  }
  // 再各验一条抽取逻辑：self-test 伴生步必须被滤掉、README 块必须按语言分别命中
  const filtered = ciGateScripts('  quality-gates:\n    steps:\n      - run: npm run check:save-blob\n      - run: npm run check:save-blob:self-test\n');
  const okFilter = filtered.length === 1 && filtered[0] === 'check:save-blob';
  if (!okFilter) failed += 1;
  console.log(`${okFilter ? 'OK  ' : 'FAIL'} ci.yml 抽取会滤掉 :self-test 伴生步（实得 ${filtered.join(',') || '无'}）`);
  const readme = '### 本地开发门禁\n\n```bash\nnpm run lint\nnpm run build\n```\n\n```bash\nnpm run tauri:build\n```\n';
  const got1 = readmeGateScripts(readme, ['### 本地开发门禁', '### Local quality gates']);
  const ok1 = got1 && got1.length === 2 && got1[0] === 'lint' && got1[1] === 'build';
  if (!ok1) failed += 1;
  console.log(`${ok1 ? 'OK  ' : 'FAIL'} README 只认门禁标题下第一个代码块（实得 ${got1 ? got1.join(',') : 'null'}）`);
  const got2 = readmeGateScripts('### Local quality gates\n\n```bash\nnpm run lint\n```\n', ['### 本地开发门禁', '### Local quality gates']);
  const ok2 = got2 && got2.length === 1;
  if (!ok2) failed += 1;
  console.log(`${ok2 ? 'OK  ' : 'FAIL'} 英文标题同样命中（实得 ${got2 ? got2.join(',') : 'null'}）`);
  const ok3 = ciGateScripts('  other-job:\n    steps:\n      - run: npm run lint\n').length === 0;
  if (!ok3) failed += 1;
  console.log(`${ok3 ? 'OK  ' : 'FAIL'} 别的 job 里的 npm run 不计进来（实得 ${ok3 ? '0' : '非 0'}）`);
  const ok4 = ciGateScripts('  quality-gates:\n    steps:\n      # 单独跑：npm run check:breakpoints\n      - run: npm run lint\n').join() === 'lint';
  if (!ok4) failed += 1;
  console.log(`${ok4 ? 'OK  ' : 'FAIL'} ci.yml 注释里提到的脚本不算 CI 实跑（实得 ${ciGateScripts('  quality-gates:\n    steps:\n      # 单独跑：npm run check:breakpoints\n      - run: npm run lint\n').join() || '无'}）`);
  const total = cases.length + 5;
  if (failed) {
    console.error(`[readme-gates] 自检失败 ${failed} 项 / 共 ${total} 项`);
    return 1;
  }
  console.log(`[readme-gates] 自检通过：${total} 项`);
  return 0;
}

function report(violations, ciScripts) {
  if (!violations.length) {
    console.log(`[readme-gates] 通过：CI quality-gates 实跑 ${ciScripts.length} 条守卫，README 中英两份都对得上。`);
    return 0;
  }
  console.error(`[readme-gates] README 的门禁清单与 CI 不一致（共 ${violations.length} 处）`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error('  CI 侧解析到的守卫：' + ciScripts.join(', '));
  return 1;
}

if (SELF_TEST) {
  process.exitCode = selfTest();
} else {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const zh = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const en = fs.readFileSync(path.join(ROOT, 'README-EN.md'), 'utf8');
  const ciScripts = ciGateScripts(ci);
  const violations = findViolations(ciScripts, [
    { label: 'README.md（中文）', scripts: readmeGateScripts(zh, ['### 本地开发门禁']) },
    { label: 'README-EN.md（英文）', scripts: readmeGateScripts(en, ['### Local quality gates', '### 本地开发门禁']) },
  ]);
  process.exitCode = report(violations, ciScripts);
}
