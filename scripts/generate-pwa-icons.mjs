/**
 * PWA 正式图标生成脚本（纯 Node 原生 zlib 手工编码 PNG）
 *
 * 用途：为 PWA 生成精确尺寸 PNG 图标（512/192/180），安装态必需。
 * 方案：程序化像素绘制（品牌红圆角底 + 白色对话气泡 + 三圆点），
 *      —— 避免依赖第三方图片库 / GenerateImage 尺寸下限限制。
 *
 * 用法：node scripts/generate-pwa-icons.mjs
 * 输出：public/pwa-512x512.png、public/pwa-192x192.png、public/apple-touch-icon.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 品牌色（design-system §3.2） ──
const BRAND = [220, 20, 52]; // #DC1434 品牌红
const FG = [255, 255, 255]; // 白色 前景
const DOT = [220, 20, 52]; // 圆点深红(气泡内)

// ── CRC32 ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: None
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (1 + width * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 几何绘制:品牌图标 ──
/** 圆角矩形含点判定(clamp 到中心矩形求最近点距离) */
function rrContains(x, y, rx, ry, rw, rh, r) {
  const cx = Math.min(Math.max(x, rx), rx + rw);
  const cy = Math.min(Math.max(y, ry), ry + rh);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function makeIcon(n) {
  const rgba = Buffer.alloc(n * n * 4); // 默认透明
  const bgR = n * 0.24; // 底圆角
  const b = { x: n * 0.25, y: n * 0.24, w: n * 0.50, h: n * 0.44, r: n * 0.12 }; // 白气泡
  const dotR = n * 0.04;
  const dots = [
    [n * 0.40, n * 0.46],
    [n * 0.50, n * 0.46],
    [n * 0.60, n * 0.46],
  ];

  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const x = px + 0.5, y = py + 0.5;
      const i = (py * n + px) * 4;
      // 圆角底(品牌红)
      if (!rrContains(x, y, n * 0.5 - n * 0.36, n * 0.5 - n * 0.36, n * 0.72, n * 0.72, bgR)) continue;
      let c = BRAND;
      // 白对话气泡
      if (rrContains(x, y, b.x, b.y, b.w, b.h, b.r)) c = FG;
      // 气泡内品牌红三点
      for (const [dx, dy] of dots) {
        const ddx = x - dx, ddy = y - dy;
        if (ddx * ddx + ddy * ddy <= dotR * dotR) c = DOT;
      }
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return rgba;
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const sizes = [
  ['pwa-512x512.png', 512],
  ['pwa-192x192.png', 192],
  ['apple-touch-icon.png', 180],
];
for (const [file, size] of sizes) {
  const png = encodePng(size, size, makeIcon(size));
  writeFileSync(join(OUT, file), png);
  console.log(`✓ ${file} (${size}x${size}, ${png.length} bytes)`);
}
console.log('PWA icons generated.');