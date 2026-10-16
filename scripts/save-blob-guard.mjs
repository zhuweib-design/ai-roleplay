#!/usr/bin/env node
/**
 * save-blob-guard.mjs — 禁止再新增"blob + `<a download>`"式存盘
 *
 * 背景（2026-10-14 在安卓模拟器上实测）：Capacitor 的 WebView 里
 * `URL.createObjectURL(blob)` + `<a download>` + `click()` 是**静默无效**的 ——
 * 不抛错、无下载记录、`/sdcard` 全盘搜不到文件，用户点了像没反应。
 * 所以存盘统一走 `src/utils/save-blob.ts` 的 `saveBlob()`（单一入口，接原生时只改这一处）。
 *
 * 注意：本文件上一版说"WebView 里 showSaveFilePicker 可用、会拉起系统保存界面"是错的。
 * 2026-10-14 复测：该 API 在 Chrome 133 Android WebView 里是桩，调用后 14ms 抛 AbortError、
 * 不弹任何界面；系统侧能弹（adb 发 CREATE_DOCUMENT 可拉起 documentsui），是 WebView 没接。
 * 详见 save-blob.ts 顶部注释。
 *
 * 规则：src 下除 save-blob.ts 外，任何人再写 `URL.createObjectURL(` 就红。
 * 存量已清零（2026-10-14：9 处导出全部改走 saveBlob），所以 BASELINE 现在是空表，
 * 任何一处新增（无论新文件还是旧文件）都直接红。
 * 为什么要清零而不是留基线：本仓的教训是"下一个人加第 N+1 处时没有任何东西提醒他"。
 *
 * 用法：
 *   node scripts/save-blob-guard.mjs              # 校验
 *   node scripts/save-blob-guard.mjs --self-test  # 证明这把尺子自己还在咬（造一处违规必须红）
 */
import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const ALLOWED = 'src/utils/save-blob.ts';

/**
 * 存量债务（文件 → 处数）。清掉一处就把数字改小，清完就删掉这一行。
 * 现在是空的：`URL.createObjectURL(` 只允许出现在 ALLOWED（save-blob.ts）里。
 */
const BASELINE = {};

const CREATE_RE = /URL\.createObjectURL\s*\(/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|vue)$/.test(name)) out.push(p);
  }
  return out;
}

/** 扫一遍 src，返回 { 相对路径: 处数 } */
function scan() {
  const found = {};
  for (const abs of walk(SRC)) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    if (rel === ALLOWED) continue;
    const n = (readFileSync(abs, 'utf8').match(CREATE_RE) ?? []).length;
    if (n > 0) found[rel] = n;
  }
  return found;
}

function report() {
  const found = scan();
  const problems = [];

  for (const [file, n] of Object.entries(found)) {
    const base = BASELINE[file];
    if (base === undefined) {
      problems.push(`新文件写了 blob 下载：${file}（${n} 处）⇒ 改用 saveBlob()，见 src/utils/save-blob.ts`);
    } else if (n > base) {
      problems.push(`${file} 从基线 ${base} 处涨到 ${n} 处 ⇒ 不许涨，改用 saveBlob()`);
    }
  }

  const shrunken = Object.entries(BASELINE).filter(([f, base]) => (found[f] ?? 0) < base);
  if (problems.length === 0) {
    const total = Object.values(found).reduce((a, b) => a + b, 0);
    console.log(`[save-blob] 通过：存量 ${total} 处（基线 ${Object.values(BASELINE).reduce((a, b) => a + b, 0)} 处）。`);
    for (const [f, base] of shrunken) console.log(`  可以下调基线：${f} ${base} → ${found[f] ?? 0}`);
    if (shrunken.length) console.log('  （基线只跟着降，不降不算红，但别忘了改小）');
    return 0;
  }
  console.error('[save-blob] 未通过：');
  for (const p of problems) console.error('  ' + p);
  return 1;
}

/** 自检：造一处违规必须红，删掉后必须绿 —— 否则这守卫是空跑的 */
function selfTest() {
  const fixture = join(SRC, '__save_blob_guard_fixture__.ts');
  let ok = true;
  try {
    writeFileSync(fixture, 'const u = URL.createObjectURL(new Blob([\'x\']));\nexport default u;\n', 'utf8');
    const code = report();
    if (code === 0) {
      console.error('自检失败：造出违规却没报红 ⇒ 守卫空跑');
      ok = false;
    } else {
      console.log('自检通过：造一处违规 ⇒ 红（守卫还在咬）');
    }
  } finally {
    rmSync(fixture, { force: true });
  }
  const code2 = report();
  if (code2 !== 0) {
    console.error('自检失败：删掉违规后没回绿（说明基线本身已经不准）');
    ok = false;
  } else {
    console.log('自检通过：还原后 ⇒ 绿');
  }
  return ok ? 0 : 1;
}

process.exit(process.argv.includes('--self-test') ? selfTest() : report());
