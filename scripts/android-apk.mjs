#!/usr/bin/env node
/**
 * Android 出包一体化脚本：一条命令出 debug APK
 *
 *   node scripts/android-apk.mjs              # 构建 Web → cap sync → 打补丁 → assembleDebug → 复制到 installer/
 *   node scripts/android-apk.mjs --skip-build # 跳过 vite 构建（只重打原生层，改 gradle 配置时用）
 *   ANDROID_BUILD_TYPE=release node scripts/android-apk.mjs   # release（缺 keystore 时回退 debug）
 *
 * 为什么不直接用 `npx cap build android`：它默认产 AAB 且要求 release 签名，缺 keystore 会失败。
 * 这里走 `gradlew assembleDebug`，debug keystore 由 gradle 自动生成，产物可直接装真机。
 *
 * 三处"不改就构建失败"的补丁由本脚本幂等写入（见 patch* 函数），所以 `android/` 即便不入库、
 * 由 `npx cap add android` 重新生成，出包仍然一次通过。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = path.join(ROOT, 'android');

/** 本机工具链（不在 PATH 上），与参考项目共用同一套；可被同名环境变量覆盖 */
const TOOLCHAIN = process.env.ANDROID_TOOLCHAIN ?? 'D:/AI_data/xiaoshuo_skill_kaifa/.android-toolchain';
const JDK = path.join(TOOLCHAIN, 'jdk-21.0.12.1+1');
const SDK = path.join(TOOLCHAIN, 'sdk');

const buildType = process.env.ANDROID_BUILD_TYPE === 'release' ? 'release' : 'debug';
const skipBuild = process.argv.includes('--skip-build');

function env() {
  const e = { ...process.env };
  if (fs.existsSync(JDK)) e.JAVA_HOME ||= JDK;
  if (fs.existsSync(SDK)) {
    e.ANDROID_HOME ||= SDK;
    e.ANDROID_SDK_ROOT ||= SDK;
  }
  return e;
}

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}${cwd ? `  (cwd=${path.relative(ROOT, cwd) || '.'})` : ''}`);
  execSync(cmd, { stdio: 'inherit', cwd: cwd ?? ROOT, env: env() });
}

function requireToolchain() {
  const missing = [JDK, SDK, path.join(SDK, 'platform-tools', 'adb.exe')].filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.error(
      `工具链缺失：${missing.join(' , ')}\n` +
        `  装好 Android SDK 与 JDK21 后用 ANDROID_HOME / JAVA_HOME（或 ANDROID_TOOLCHAIN）指过来。`
    );
    process.exit(1);
  }
}

/**
 * 补丁 1：SDK 位置。`cap add android` 不会生成 local.properties，缺它 gradle 直接报找不到 SDK。
 *
 * 反斜杠必须写**两枚**：properties 把单枚当转义符，`D:\AI_data` 会被读成 `D:AI_data`，
 * 表现是 `compileDebugJavaWithJavac` 报 "文件名、目录名或卷标语法不正确"，
 * 看着像工具链坏了，其实是一行转义（本机踩过，两份能用的配置都是双枚写法）。
 * 这一步还会把已有的错值改对，所以拿到旧工程重跑也安全。
 */
function patchLocalProperties() {
  const f = path.join(ANDROID, 'local.properties');
  const BS2 = String.raw`\\`;
  // 注意：path.join 在 Windows 上已经把分隔符归成**单**枚反斜杠，所以这里不能用
  // "把 / 换成 \\\\" 的写法（没有 / 可换，写出来还是单枚，properties 读成坏路径 —— 本机就是这么废的）。
  // 正确做法：按两种分隔符拆开，再用两枚反斜杠拼回去。
  const want = `sdk.dir=${SDK.split(/[\\/]/).join(BS2)}`;
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  if (cur.split(/\r?\n/).some((l) => l.trim() === want)) return;
  const kept = cur
    .split(/\r?\n/)
    .filter((l) => !/^sdk\.dir=/.test(l))
    .join('\n');
  fs.writeFileSync(f, `${kept.trimEnd()}${kept.trim() ? '\n' : ''}${want}\n`, 'utf8');
  console.log(`[patch] local.properties ← ${want}`);
}

/**
 * 补丁 2：wrapper 的发行包形态。
 * Capacitor 生成的 properties 指 `-all.zip`（约 200 MB），而这台机器缓存里只有完整的 `-bin`；
 * 直连 services.gradle.org 会下到一半断掉，表现为"工具链像没装"。
 */
function patchWrapperDistribution() {
  const f = path.join(ANDROID, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  if (!fs.existsSync(f)) return;
  const cur = fs.readFileSync(f, 'utf8');
  const next = cur.replace(/gradle-([0-9.]+)-all\.zip/, 'gradle-$1-bin.zip');
  if (next !== cur) {
    fs.writeFileSync(f, next, 'utf8');
    console.log('[patch] gradle-wrapper.properties：-all.zip → -bin.zip（复用本机缓存）');
  }
}

/**
 * 补丁 3：依赖仓库镜像 + 重试参数。
 * google()/mavenCentral() 在这台机器上拉不动 AndroidX 与 AGP；镜像放前面、官方源留作兜底。
 */
function patchRepositories() {
  const f = path.join(ANDROID, 'build.gradle');
  if (!fs.existsSync(f)) return;
  let cur = fs.readFileSync(f, 'utf8');
  const MIRROR = `        maven { url 'https://maven.aliyun.com/repository/google' }\n        maven { url 'https://maven.aliyun.com/repository/public' }\n`;
  if (!cur.includes('maven.aliyun.com')) {
    cur = cur.replace(/repositories \{\n(\s+)google\(\)/g, `repositories {\n${MIRROR}$1google()`);
    fs.writeFileSync(f, cur, 'utf8');
    console.log('[patch] build.gradle：两处 repositories 前置阿里镜像');
  }
  const gp = path.join(ANDROID, 'gradle.properties');
  if (fs.existsSync(gp)) {
    const g = fs.readFileSync(gp, 'utf8');
    if (!g.includes('repository.max.retries')) {
      fs.writeFileSync(
        gp,
        `${g.trimEnd()}\n\n# 本机网络拉依赖会偶发中断，抬高重试与等待上限\nsystemProp.org.gradle.internal.repository.max.retries=5\nsystemProp.org.gradle.internal.repository.max.wait.ms=600000\n`,
        'utf8'
      );
      console.log('[patch] gradle.properties：加依赖重试与等待上限');
    }
  }
}

/** 原生壳不存在就生成一次（`cap add android` 只在新建时跑） */
function ensureAndroidProject() {
  if (fs.existsSync(ANDROID)) return;
  console.log('[step] android/ 不存在 ⇒ npx cap add android');
  run('npx cap add android');
}

function main() {
  requireToolchain();
  if (!skipBuild) run('npm run build');
  ensureAndroidProject();
  patchLocalProperties();
  patchWrapperDistribution();
  patchRepositories();
  run('npx cap sync android');
  // 直接点名 gradlew.bat：execSync 在 Windows 上用的就是 cmd.exe，不需要（也不能）再加一层
  // `cmd.exe //c`——那是 Git Bash 里为躲开路径转换的写法，进到 cmd.exe 会变成未知开关，
  // 结果只打印一个 Windows banner 就退出，产物自然是空的。
  // --rerun-tasks：cap sync 是增量同步，gradle 会命中缓存复用上一次产物
  const task = buildType === 'release' ? 'assembleRelease' : 'assembleDebug';
  run(`gradlew.bat ${task} --rerun-tasks --console=plain`, ANDROID);

  const src = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', buildType, `app-${buildType}.apk`);
  if (!fs.existsSync(src)) {
    console.error(`[失败] 找不到产物 ${src}`);
    process.exit(1);
  }
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const outDir = path.join(ROOT, 'installer');
  fs.mkdirSync(outDir, { recursive: true });
  const outName = `AI酒馆-${version}-${buildType}.apk`;
  const out = path.join(outDir, outName);
  fs.copyFileSync(src, out);
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`\n[ok] APK：${out} （${mb} MB）`);
  console.log('  装真机：adb install -r "' + out + '"');
  console.log('  起应用：adb shell am start -n com.zhuweib.airoleplay/.MainActivity');
}

main();
