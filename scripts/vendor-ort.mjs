/**
 * ORT_ISOLATION_DESIGN S2c · onnxruntime-web vendor 外置
 *
 * 把 onnxruntime-web 的自包含 ESM 产物（ort.bundle.min.mjs）与其 wasm 依赖复制到
 * public/vendor/ort/，使浏览器在运行时从同源路径动态 import——ort 由此**退出构建
 * chunk 图**（rolldown 的 interop-helper 共享会把 ort chunk 拖回首屏，见设计文档 §2/
 * 修订④）。wasm 与 mjs 同目录，ort 内部的 `new URL('./ort-wasm-*.wasm', import.meta.url)`
 * 相对解析自动命中。
 *
 * 用法：
 *   node scripts/vendor-ort.mjs            # 复制（幂等）
 *   node scripts/vendor-ort.mjs --check    # 校验已存在且与 node_modules 版本一致
 *
 * 退出码：0 = 成功；1 = 校验失败 / 复制出错。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const DEST_DIR = path.join(PROJECT_ROOT, 'public', 'vendor', 'ort');

/** 需要外置的文件（mjs + 当前构建实际解析的 jsep wasm flavor） */
const FILES = ['ort.bundle.min.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

const CHECK = process.argv.includes('--check');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  const problems = [];
  for (const file of FILES) {
    const src = path.join(SRC_DIR, file);
    const dest = path.join(DEST_DIR, file);
    if (!fs.existsSync(src)) {
      problems.push(`源文件缺失：${path.relative(PROJECT_ROOT, src)}（onnxruntime-web 未安装？）`);
      continue;
    }
    if (CHECK) {
      if (!fs.existsSync(dest)) {
        problems.push(`未外置：${path.relative(PROJECT_ROOT, dest)} —— 运行 node scripts/vendor-ort.mjs`);
        continue;
      }
      const srcHash = sha256(fs.readFileSync(src));
      const destHash = sha256(fs.readFileSync(dest));
      if (srcHash !== destHash) {
        problems.push(`版本漂移：${file} 与 node_modules 不一致 —— 重新运行 node scripts/vendor-ort.mjs`);
      }
    } else {
      fs.mkdirSync(DEST_DIR, { recursive: true });
      fs.copyFileSync(src, dest);
      const kb = (fs.statSync(dest).size / 1024).toFixed(0);
      console.log(`[vendor-ort] ${file} → public/vendor/ort/（${kb} KB）`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`[vendor-ort] ✗ ${p}`);
    process.exit(1);
  }
  if (CHECK) {
    console.log('[vendor-ort] ✓ vendor 文件齐全且与 node_modules 版本一致');
  } else {
    console.log('[vendor-ort] 完成');
  }
}

main();
