#!/usr/bin/env node
/**
 * vendor-fonts.mjs — 把 Google Fonts 的字体镜像到本仓库，消除第三方字体请求
 *
 * 背景（Web 端 SOP 评审 P2-2 / 威胁模型 §7.1）：
 *   index.html 原先从 fonts.googleapis.com / fonts.gstatic.com 加载
 *   Playfair Display（拉丁）+ Noto Serif SC（中文衬线），会向第三方暴露
 *   访问者 IP 与来源页（Referer），且是渲染阻塞资源。
 *
 * 本脚本把同一套字体（含 unicode-range 分片）镜像到 public/fonts/，
 * @font-face 的 src 改写为本地相对路径 —— 设计完全不变、零第三方请求，
 * 且运行时下载量与原来一致（浏览器仍按 unicode-range 只取用到的分片）。
 *
 * 实测体量：Playfair Display 8 分片 / ~180 KB；Noto Serif SC 97 分片 / ~4.8 MB；
 * 生成的 fonts.css 约 228 KB（与 Google 原 CSS 同量级）。
 *
 * ⚠️ 字体**不参与 PWA 预缓存**（vite.config.ts 的 globPatterns 已排除 woff2）：
 *   预缓存 97 个中文分片会白白下载 ~4.8 MB，而多数分片用户根本用不到。
 *   依赖 HTTP 缓存 + font-display: swap 的降级链即可。
 *
 * 用法：
 *   node scripts/vendor-fonts.mjs            # 镜像（已存在的文件跳过）
 *   node scripts/vendor-fonts.mjs --force    # 强制重新下载
 *   node scripts/vendor-fonts.mjs --check    # 只校验本地是否齐全，不下载（供门禁使用）
 *
 * 字体更新流程：改下方 FAMILIES → 跑本脚本 → 提交 public/fonts/ 与 index.html 的版本号。
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'fonts');

/** 需要镜像的字族与字重（与 index.html 原外链保持一致） */
const FAMILIES = [
  'Playfair+Display:wght@600;700',
  'Noto+Serif+SC:wght@600;700',
];

/** 现代浏览器 UA：Google 据此返回 woff2 + 完整 unicode-range 分片 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CSS_URL = `https://fonts.googleapis.com/css2?${FAMILIES.map((f) => `family=${f}`).join('&')}&display=swap`;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const CHECK_ONLY = args.includes('--check');

/** 有界并发下载 */
async function mapLimit(items, limit, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.text();
}

async function main() {
  console.log('[vendor-fonts] 拉取 Google Fonts CSS…');
  let css;
  try {
    css = await fetchText(CSS_URL);
  } catch (err) {
    console.error(`[vendor-fonts] 失败：无法获取字体 CSS（${err.message}）`);
    console.error('[vendor-fonts] 提示：本脚本需要联网。--check 模式不联网，仅校验本地文件。');
    process.exit(1);
  }

  // 收集全部 woff2 URL（去重，保持出现顺序以稳定产物）
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) ?? [])];
  if (urls.length === 0) {
    console.error('[vendor-fonts] 失败：CSS 中未找到任何 woff2 资源（Google 可能改了响应格式）');
    process.exit(1);
  }

  // 用 URL 的文件名作为本地名（gstatic 的文件名是内容哈希，天然唯一）
  const names = urls.map((u) => basename(new URL(u).pathname));
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) {
    console.error(`[vendor-fonts] 失败：本地文件名冲突 ${[...new Set(dupes)].join(', ')}`);
    process.exit(1);
  }

  const missing = urls.filter((_, i) => !existsSync(join(OUT_DIR, names[i])));
  console.log(
    `[vendor-fonts] 分片 ${urls.length} 个 ｜ 本地已有 ${urls.length - missing.length} ｜ 待下载 ${missing.length}`
  );

  if (CHECK_ONLY) {
    const cssPath = join(OUT_DIR, 'fonts.css');
    const cssOk = existsSync(cssPath);
    if (missing.length || !cssOk) {
      console.error(
        `[vendor-fonts] 校验失败：缺 ${missing.length} 个 woff2${cssOk ? '' : '、缺 fonts.css'}`
      );
      console.error('[vendor-fonts] 修复：运行 node scripts/vendor-fonts.mjs');
      process.exit(1);
    }
    console.log('[vendor-fonts] 校验通过：本地字体齐全。');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  let downloaded = 0;
  let bytes = 0;
  await mapLimit(
    urls.map((u, i) => ({ u, i })),
    8,
    async ({ u, i }) => {
      const dest = join(OUT_DIR, names[i]);
      if (!FORCE && existsSync(dest)) {
        bytes += statSync(dest).size;
        return;
      }
      const res = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`GET ${u} → HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buf);
      downloaded++;
      bytes += buf.length;
    }
  );

  // 改写 CSS：src 指向本地相对路径（fonts.css 与 woff2 同目录）
  const localCss = css.replace(
    /url\(https:\/\/fonts\.gstatic\.com\/([^)]+)\)/g,
    (_, p) => `url(${basename(p)})`
  );
  const header = `/* 由 scripts/vendor-fonts.mjs 生成，请勿手工编辑。\n   来源：Google Fonts（SIL Open Font License 1.1）\n   字族：${FAMILIES.join(' + ')}\n   分片：${urls.length} 个\n   更新：node scripts/vendor-fonts.mjs --force */\n`;
  writeFileSync(join(OUT_DIR, 'fonts.css'), header + localCss, 'utf8');

  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(`[vendor-fonts] 完成：新下载 ${downloaded} 个，本地共 ${urls.length} 个 / ${mb} MB`);
  console.log(`[vendor-fonts] 已生成 public/fonts/fonts.css（${(localCss.length / 1024).toFixed(0)} KB）`);
  console.log('[vendor-fonts] 提醒：字体不进 PWA 预缓存；改字体后请同步 index.html 的 ?v= 版本号。');
}

main().catch((err) => {
  console.error(`[vendor-fonts] 未捕获错误：${err.message}`);
  process.exit(1);
});
