/**
 * 门禁：GitHub Release 上不保留任何安装包资产（2026-10-19 定的策略）
 *
 * 起因：v0.2.0 那次还在用 automation 往 Release 传桌面安装包，v1.1.1 又在 2026-10-16 手工挂过
 * 一个安卓 debug 包，两处都在 2026-10-19 撤下。"以后不再上传任何安装包"光写在文档里挡不住下一次，
 * 所以这里做成一条可执行的检查：Release 的 assets 数组非空即红。
 *
 * 口径说明：GitHub 自动生成的 Source code (zip/tar.gz) **不在** assets 里，是归档链接，
 * 所以这条门禁不会误伤源码归档；只有人（或 workflow）主动上传的文件才算资产。
 *
 * 用法：
 *   node scripts/no-release-assets-guard.mjs              # 打 API 查当前仓库
 *   node scripts/no-release-assets-guard.mjs --self-test  # 纯函数自检（不联网）
 *
 * 默认匿名访问公开仓库即可；私有仓库或限流时给 GITHUB_TOKEN 环境变量。
 */

import process from 'node:process';

const SELF_TEST = process.argv.includes('--self-test');

/** 纯判据：输入 releases 数组，输出违规项。*/
export function findViolations(releases) {
  const out = [];
  for (const rel of releases ?? []) {
    for (const asset of rel.assets ?? []) {
      out.push({
        tag: rel.tag_name ?? '(无标签)',
        name: asset.name ?? '(无名)',
        sizeMB: asset.size != null ? (asset.size / 1048576).toFixed(1) : '?',
        url: asset.browser_download_url ?? '',
      });
    }
  }
  return out;
}

async function fetchReleases() {
  const api = process.env.GITHUB_API_URL || 'https://api.github.com';
  const repo = process.env.GITHUB_REPOSITORY || 'zhuweib-design/ai-roleplay';
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${api}/repos/${repo}/releases?per_page=100`, { headers });
  if (!res.ok) throw new Error(`读 releases 失败：${res.status} ${res.statusText}`);
  return { list: await res.json(), repo };
}

function report(violations, repo) {
  if (!violations.length) {
    console.log(`[no-release-assets] 通过：${repo} 的 Release 上没有任何资产（源码归档不算资产）。`);
    return 0;
  }
  console.error(`[no-release-assets] 违反策略：Release 上存在 ${violations.length} 个资产（安装包不上传，见本文件头部说明）`);
  for (const v of violations) console.error(`  - ${v.tag} / ${v.name} (${v.sizeMB} MB) ${v.url}`);
  return 1;
}

function selfTest() {
  const cases = [
    { name: '只有源码归档（assets 为空）→ 不违规', releases: [{ tag_name: 'v1.0.0', assets: [] }], want: 0 },
    { name: '挂了一个 APK → 违规', releases: [{ tag_name: 'v1.1.1', assets: [{ name: 'a.apk', size: 27000000 }] }], want: 1 },
    { name: '非安装包文件也算资产 → 违规（策略是零资产，不是黑名单）', releases: [{ tag_name: 'v0.2.0', assets: [{ name: 'checksums.txt', size: 12 }] }], want: 1 },
    { name: '多个 release 混合 → 只数有资产的那条', releases: [{ tag_name: 'v1', assets: [] }, { tag_name: 'v2', assets: [{ name: 'x.exe', size: 1 }] }], want: 1 },
    { name: '缺 assets 字段（旧数据形状）→ 不炸且不违规', releases: [{ tag_name: 'v3' }], want: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = findViolations(c.releases).length;
    const ok = got === c.want;
    if (!ok) failed += 1;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name}（期望 ${c.want}，实得 ${got}）`);
  }
  if (failed) {
    console.error(`[no-release-assets] 自检失败 ${failed} 项`);
    return 1;
  }
  console.log(`[no-release-assets] 自检通过：${cases.length} 项`);
  return 0;
}

if (SELF_TEST) {
  process.exitCode = selfTest();
} else {
  try {
    const { list, repo } = await fetchReleases();
    process.exitCode = report(findViolations(list), repo);
  } catch (e) {
    console.error(`[no-release-assets] 无法判定：${e.message}`);
    process.exitCode = 1;
  }
}
