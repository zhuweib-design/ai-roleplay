/**
 * ORT_ISOLATION_DESIGN S4 / G-1 · 首屏 ort 排除检查（S2c 后口径）
 *
 * 验收：
 *  1) dist/assets 不存在 ort.bundle.min*.js chunk，也不存在 ort-wasm*.wasm
 *     —— onnxruntime-web 已整体退出构建产物（浏览器运行时从 public/vendor/ort/
 *     同源动态 import，见 src/core/onnx-embedding-provider.ts resolveOrtModuleUrl）；
 *  2) dist/index.html 的入口/modulepreload 无 ort 引用；
 *  3) 防回退：从入口 JS 沿**静态** `import … from "./chunk"` 边 BFS，断言可达集合
 *     内无任何文件含 `ort.bundle.min` 字样（动态 import 边不遍历）。
 *
 * 前置：先 `npm run build`。vendor 文件缺失时先运行 `node scripts/vendor-ort.mjs`。
 * 退出码：0 = 通过；1 = 发现 ort 回归；2 = 构建产物缺失。
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(PROJECT_ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'public', 'vendor', 'ort');

const ORT_PATTERN = 'ort.bundle.min';
const STATIC_EDGE = /(?:from\s*|^\s*import\s*)"(\.\/[^"]+\.js)"/g;

function main() {
  const indexHtmlPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.error('[check-ort] 未找到 dist/index.html —— 请先运行 npm run build');
    process.exit(2);
  }

  // 0) vendor 就绪（mjs + wasm）
  const vendorFiles = ['ort.bundle.min.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];
  for (const f of vendorFiles) {
    if (!fs.existsSync(path.join(VENDOR_DIR, f))) {
      console.error(`[check-ort] ✗ 缺少 vendor 文件 public/vendor/ort/${f} —— 运行 node scripts/vendor-ort.mjs`);
      process.exit(1);
    }
  }

  // 1) 构建产物不含 ort chunk / ort wasm
  const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js') || f.endsWith('.wasm'));
  const ortChunks = files.filter(
    (f) =>
      (f.startsWith('ort.bundle.min') && f.endsWith('.js')) ||
      (f.startsWith('ort-wasm') && f.endsWith('.wasm'))
  );

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const entries = [...indexHtml.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)]
    .map((m) => path.basename(m[1]));
  const preloads = [...indexHtml.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)]
    .map((m) => path.basename(m[1]));

  if (entries.length === 0) {
    console.error('[check-ort] index.html 中未找到 module 入口 script');
    process.exit(2);
  }

  const sourceOf = new Map(
    fs
      .readdirSync(ASSETS)
      .filter((f) => f.endsWith('.js'))
      .map((f) => [f, fs.readFileSync(path.join(ASSETS, f), 'utf8')])
  );
  const edgesOf = new Map();
  for (const [name, src] of sourceOf) {
    const edges = new Set();
    for (const m of src.matchAll(STATIC_EDGE)) {
      const target = path.basename(m[1]);
      if (sourceOf.has(target)) edges.add(target);
    }
    edgesOf.set(name, edges);
  }
  const visited = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of edgesOf.get(cur) ?? []) queue.push(next);
  }
  const firstScreenOrt = [...visited].filter((f) => sourceOf.get(f).includes(ORT_PATTERN));
  const preloadOrt = preloads.filter((p) => p.includes(ORT_PATTERN));

  console.log(`[check-ort] 入口: ${entries.join(', ')}；首屏静态可达 chunk: ${visited.size} 个`);
  console.log(
    `[check-ort] 构建产物中的 ort 文件: ${ortChunks.length ? ortChunks.join(', ') : '（无 ✓）'}`
  );

  if (ortChunks.length > 0) {
    console.error('[check-ort] ✗ 构建产物包含 ort 文件（应经 public/vendor/ort 外置加载）');
    process.exit(1);
  }
  if (firstScreenOrt.length > 0) {
    console.error(`[check-ort] ✗ 首屏静态可达 chunk 引用 ort：${firstScreenOrt.join(', ')}`);
    process.exit(1);
  }
  if (preloadOrt.length > 0) {
    console.error(`[check-ort] ✗ index.html 仍引用 ort：${preloadOrt.join(', ')}`);
    process.exit(1);
  }
  console.log('[check-ort] ✓ ort 已退出构建产物；首屏（entry 静态可达集合）无 ort 引用');
  process.exit(0);
}

main();
