#!/usr/bin/env node
/**
 * no-artifact-in-git-guard.mjs — 禁止把安装包/大二进制提交进 git 历史
 *
 * 背景：`scripts/android-apk.mjs` 每次出包都会把约 27MB 的 debug APK 复制到仓库根的
 * `installer/`。仓库现在是公开的，而 git 历史一旦收下就**永久占体积**——删掉记录也不会瘦，
 * 每个克隆的人都要拖着它。分发改走 GitHub Releases（拖文件即可，见指导文档 15.7）。
 *
 * `.gitignore` 挡住的是"顺手 add"，这一条挡的是"已经 add 了"：CI 里谁提交了安装包或
 * 超过体积上限的文件，作业直接红，而不是等下一个人克隆时才发现问题。
 *
 * 两条规则都按当前仓库实测过不会误伤（2026-10-16 量：已跟踪 1034 个文件里最大 418KB，
 * 扩展名分布里没有下面任何一个被拦的扩展；`android/gradle/wrapper/gradle-wrapper.jar`
 * 这种合法小依赖不在拦的扩展里）。
 *
 * 用法：
 *   node scripts/no-artifact-in-git-guard.mjs              # 校验已跟踪文件
 *   node scripts/no-artifact-in-git-guard.mjs --self-test  # 证明这把尺子自己还在咬
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 一律不许进库的扩展名（安装包、可执行体、压缩档、模型权重） */
const BLOCKED_EXT = new Set([
  'apk', 'aab', 'apks', 'xap', 'ipa',
  'exe', 'msi', 'msm', 'appx', 'dmg', 'pkg', 'deb', 'rpm',
  'dll', 'so', 'dylib', 'node', 'ocx',
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'iso',
  'wasm', 'onnx', 'pt', 'gguf', 'bin',
]);

/** 单个文件体积上限：实测最大已跟踪文件 418KB，留 2.5 倍余量 */
const MAX_BYTES = 1024 * 1024;

function extOf(file) {
  const i = file.lastIndexOf('.');
  return i < 0 ? '' : file.slice(i + 1).toLowerCase();
}

/**
 * 纯函数：给定"路径 + 体积"清单，返回违规项。
 * 校验与自测共用这一个入口，避免自测走的是另一套判断（那种自测会绿而门禁空跑）。
 */
export function findViolations(entries) {
  const out = [];
  for (const e of entries) {
    if (BLOCKED_EXT.has(extOf(e.path))) out.push({ ...e, reason: `扩展名 .${extOf(e.path)} 属安装/可执行/压缩/权重类产物` });
    else if (e.bytes > MAX_BYTES) out.push({ ...e, reason: `${(e.bytes / 1024 / 1024).toFixed(2)}MB 超过 ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB 上限` });
  }
  return out;
}

function scanTracked() {
  const paths = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const entries = [];
  if (!paths.length) return entries;
  // git ls-tree -l 给出每个 blob 的字节数（对象库里的真实大小，与磁盘换行转换无关）
  const lines = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-l', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).split('\n');
  const byPath = new Map();
  for (const line of lines) {
    const m = line.match(/^\S+ \S+ \S+\s+(\d+|-)\t(.+)$/);
    if (!m) continue;
    byPath.set(m[2], m[1] === '-' ? 0 : Number(m[1]));
  }
  for (const p of paths) entries.push({ path: p, bytes: byPath.get(p) ?? 0 });
  return entries;
}

function report() {
  const entries = scanTracked();
  const violations = findViolations(entries);
  if (!violations.length) {
    console.log(
      `[no-artifact-in-git] 通过：已跟踪 ${entries.length} 个文件，无安装/可执行/压缩/权重类产物，且都在 ${MAX_BYTES / 1024 / 1024}MB 以内` +
        `（最大 ${Math.max(...entries.map((e) => e.bytes)) / 1024 | 0}KB）`
    );
    return 0;
  }
  console.error(`[no-artifact-in-git] 发现 ${violations.length} 个不该进库的文件：`);
  for (const v of violations) console.error(`  ${v.path}  ← ${v.reason}`);
  console.error(
    '\n  安装包走 GitHub Releases（仓库页 Releases → 拖文件进 Assets），不要提交进 git 历史：\n' +
      '  历史里的大文件删不掉，每个克隆都要重新下载。指导文档 15.7 记了这个决定。'
  );
  return 1;
}

/**
 * 自测：把四组"人造清单"喂进与生产同一个 findViolations。
 * 覆盖面要求：既要有必须红的，也要有必须不红的（否则规则被写宽也能过）。
 */
function selfTest() {
  const cases = [
    { name: '安装包必须被拦', entries: [{ path: 'installer/AI酒馆-1.0.0-debug.apk', bytes: 27_000_000 }], expect: 1 },
    { name: '超体积上限的文本也要被拦', entries: [{ path: 'docs/huge.md', bytes: MAX_BYTES + 1 }], expect: 1 },
    { name: '负向对照：字体分片不该被拦', entries: [{ path: 'public/fonts/a.woff2', bytes: 58_000 }], expect: 0 },
    { name: '负向对照：gradle wrapper 的 jar 不该被拦', entries: [{ path: 'android/gradle/wrapper/gradle-wrapper.jar', bytes: 60_000 }], expect: 0 },
    { name: '负向对照：刚好在上限内不该被拦', entries: [{ path: 'e2e/neutrality-baseline.json', bytes: MAX_BYTES }], expect: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = findViolations(c.entries).length;
    const ok = got === c.expect;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${c.name} → 违规 ${got} 条（期望 ${c.expect}）`);
  }
  // 再加一条"尺子确实在读输入"的下限断言：全部用例合计必须扫到 5 条
  const scanned = cases.reduce((a, c) => a + c.entries.length, 0);
  if (scanned !== cases.length) {
    console.error(`  ✗ 自测用例数与输入数不一致（${cases.length} vs ${scanned}），说明有用例是空的`);
    failed++;
  }
  console.log(failed ? `[no-artifact-in-git] 自测失败：${failed} 项` : `[no-artifact-in-git] 自测通过：${cases.length} 项，含 3 条负向对照`);
  return failed ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('no-artifact-in-git-guard.mjs')) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : report());
}
