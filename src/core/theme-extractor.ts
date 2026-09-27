/* ═══════════════════════════════════════════════════════════════
   theme-extractor.ts — 自定义主题：主色提取 + 组件色生成
   ═══════════════════════════════════════════════════════════════
   1. 从背景图片中提取主色调（k-means 聚类，默认 6 个主色）
   2. 根据提取的主色自动推导整套组件 CSS 变量（保证 WCAG 对比度）

   纯函数部分（聚类 / 推导）可独立单元测试；
   图片采样部分依赖浏览器 Canvas。
   ═══════════════════════════════════════════════════════════════ */

// ─── 颜色工具（纯函数） ───

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/** 提取后的主色板 */
export interface ExtractedPalette {
  /** 主色列表（按占比降序，hex 小写），长度 ≤ maxColors */
  colors: string[];
  /** 各主色占比（0-1，与 colors 一一对应，和为 1） */
  ratios: number[];
  /** 全图平均相对亮度（0 黑 ~ 1 白），用于判断深浅基调 */
  avgLuminance: number;
}

/** 生成的主题 CSS 变量（键为不含 -- 前缀的变量名，值为 css 颜色） */
export type ThemeTokens = Record<string, string>;

/** 采样像素（纯数据，便于测试） */
export interface PixelSample {
  r: number;
  g: number;
  b: number;
}

const MAX_ITERATIONS = 20;
const DEFAULT_K = 6;
/** 采样目标尺寸（宽或高的最大边长），控制聚类计算量 */
export const SAMPLE_MAX_DIM = 96;

// 颜色格式转换

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace(/^#/, '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(h, 16);
  if (Number.isNaN(num) || h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      break;
    case gn:
      h = ((bn - rn) / d + 2) * 60;
      break;
    default:
      h = ((rn - gn) / d + 4) * 60;
      break;
  }
  return { h: ((h % 360) + 360) % 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = Math.max(0, Math.min(1, s / 100));
  const ln = Math.max(0, Math.min(1, l / 100));
  if (sn === 0) {
    const v = ln * 255;
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue2rgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: hue2rgb(hn + 1 / 3) * 255,
    g: hue2rgb(hn) * 255,
    b: hue2rgb(hn - 1 / 3) * 255,
  };
}

/** WCAG 相对亮度（0-1） */
export function luminance(c: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  );
}

/** WCAG 对比度（1-21） */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 自定义主题运行时对比度检查结果。 */
export interface ThemeContrastIssue {
  foreground: string;
  background: string;
  ratio: number;
}

/**
 * 检查主题令牌中实际使用的前景/背景组合。
 * 该检查供运行时应用用户上传主题前调用，避免仅依赖内置主题静态门禁。
 */
export function auditThemeContrast(tokens: ThemeTokens, minimum = 4.5): ThemeContrastIssue[] {
  const pairs: Array<[string, string]> = [
    ['foreground', 'background'],
    ['foreground', 'card'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'card-elevated'],
    ['secondary', 'background'],
    ['secondary', 'card'],
    ['primary-fg', 'background'],
    ['primary-fg', 'card'],
    ['destructive', 'card'],
    ['on-primary', 'primary'],
    ['on-accent', 'secondary'],
    ['on-accent', 'accent-blue'],
    ['on-accent', 'accent-orange'],
    ['error-fg', 'error-bg'],
    ['success-fg', 'success-bg'],
    ['accent-blue', 'background'],
    ['accent-blue', 'card'],
    ['accent-orange', 'background'],
    ['accent-orange', 'card'],
    ['warning-fg', 'background'],
    ['warning-fg', 'card'],
  ];
  const issues: ThemeContrastIssue[] = [];
  for (const [foreground, background] of pairs) {
    const fg = tokens[foreground];
    const bg = tokens[background];
    if (!fg || !bg || !/^#[0-9a-f]{6}$/i.test(fg) || !/^#[0-9a-f]{6}$/i.test(bg)) continue;
    const ratio = contrastRatio(hexToRgb(fg), hexToRgb(bg));
    if (ratio < minimum) issues.push({ foreground, background, ratio });
  }
  return issues;
}

/** adjustContrast 的搜索方向：auto 自动判定；lighten 提亮；darken 压暗 */
export type ContrastDirection = 'auto' | 'lighten' | 'darken';

/**
 * 调整颜色亮度，使与目标色对比度 ≥ targetRatio
 * 策略：若原色已达标直接返回；否则沿「远离目标」方向二分搜索，
 * 取最接近原亮度的达标边界（保留色相与饱和度，避免压成纯黑/纯白）。
 *
 * 单调性：对比度随「远离目标亮度」单调变化。
 * - darken（目标更亮，需压暗）：lightness ↑ → 对比 ↓，达标区在低亮度侧，
 *   二分找最大达标亮度（lo 上推）。
 * - lighten（目标更暗，需提亮）：lightness ↑ → 对比 ↑，达标区在高亮度侧，
 *   二分找最小达标亮度（hi 下压）。
 *
 * direction：
 * - 'auto'（默认）依「目标与当前亮度」自动判定方向，适用于目标为纯黑/纯白等
 *   极端参照的常规场景；
 * - 当「当前色与目标处于同一亮度侧」（如纯黑/纯白/纯黄作主色、目标为邻近中间表面）时，
 *   自动判定会选错方向而无法达标，此时须显式指定 'lighten' / 'darken'。
 */
export function adjustContrast(
  color: Rgb,
  target: Rgb,
  targetRatio: number,
  { steps = 24, direction = 'auto' }: { steps?: number; direction?: ContrastDirection } = {}
): Rgb {
  if (contrastRatio(color, target) >= targetRatio) return color;
  const base = rgbToHsl(color.r, color.g, color.b);
  const darken =
    direction === 'auto' ? luminance(target) > luminance(color) : direction === 'darken';
  let lo = 0;
  let hi = 100;
  let best = color;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    const cand = hslToRgb(base.h, base.s, mid);
    if (contrastRatio(cand, target) >= targetRatio) {
      best = cand;
      if (darken) lo = mid; // 已达标且更亮 → 继续上探更高亮度边界
      else hi = mid; // 已达标且更暗 → 继续下压找更低亮度边界
    } else {
      if (darken) hi = mid; // 太亮不达标 → 向下收
      else lo = mid; // 太暗不达标 → 向上收
    }
  }
  return best;
}

/** 与某颜色混合（weight 为该颜色的混合占比 0-1） */
export function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  const w = Math.max(0, Math.min(1, weight));
  return {
    r: a.r * (1 - w) + b.r * w,
    g: a.g * (1 - w) + b.g * w,
    b: a.b * (1 - w) + b.b * w,
  };
}

/** 将颜色按权重压向目标（用于生成表面层级） */
function shade(color: Rgb, target: Rgb, weight: number): Rgb {
  return mix(color, target, weight);
}

// ─── k-means 聚类 ───

interface Centroid extends Rgb {
  /** 该簇累计像素数 */
  size: number;
}

/**
 * 对 RGB 像素点做 k-means 聚类
 * @param points  像素点列表
 * @param k       簇数量
 * @returns 聚类中心（按簇大小降序）
 */
export function kMeans(points: readonly Rgb[], k: number): Centroid[] {
  const n = points.length;
  if (n === 0) return [];
  const K = Math.max(1, Math.min(k, n));

  // 初始化：k-means++（间隔最远采样，避免空簇与局部最优）
  const centroids: Centroid[] = [];
  centroids.push({ ...points[0]!, size: 0 });
  for (let c = 1; c < K; c++) {
    let total = 0;
    const weights: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      for (const cen of centroids) {
        const d = squaredDist(points[i]!, cen);
        if (d < minD) minD = d;
      }
      weights[i] = minD * minD;
      total += weights[i]!;
    }
    if (total <= 0) {
      // 全部点与现有中心重合，随机补充
      const ri = Math.floor(Math.random() * n);
      centroids.push({ ...points[ri]!, size: 0 });
      continue;
    }
    let r = Math.random() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push({ ...points[pick]!, size: 0 });
  }

  const labels = new Int32Array(n);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // 分配
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      let label = 0;
      for (let c = 0; c < K; c++) {
        const d = squaredDist(points[i]!, centroids[c]!);
        if (d < minD) {
          minD = d;
          label = c;
        }
      }
      if (labels[i] !== label) {
        labels[i] = label;
        changed = true;
      }
    }
    if (!changed) break;
    // 更新中心
    const sums = new Array(K).fill(0).map(() => ({ r: 0, g: 0, b: 0, size: 0 }));
    for (let i = 0; i < n; i++) {
      const s = sums[labels[i]!]!;
      s.r += points[i]!.r;
      s.g += points[i]!.g;
      s.b += points[i]!.b;
      s.size++;
    }
    for (let c = 0; c < K; c++) {
      const s = sums[c]!;
      if (s.size > 0) {
        centroids[c] = {
          r: s.r / s.size,
          g: s.g / s.size,
          b: s.b / s.size,
          size: s.size,
        };
      }
    }
  }

  // 统计最终簇大小并按占比降序
  const sizes = new Array(K).fill(0);
  for (let i = 0; i < n; i++) sizes[labels[i]!]!++;
  return centroids
    .map((c, idx) => ({ ...c, size: sizes[idx]! }))
    .sort((a, b) => b.size - a.size);
}

function squaredDist(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * 从像素列表提取主色板（纯函数，可测）
 * - 过滤透明/接近背景的像素
 * - k-means 聚类 → 按占比排序取前 maxColors
 * - 计算全图平均亮度
 */
export function extractPaletteFromPixels(
  pixels: readonly PixelSample[],
  {
    k = DEFAULT_K,
    maxColors = 6,
    minRatio = 0.015,
  }: { k?: number; maxColors?: number; minRatio?: number } = {}
): ExtractedPalette {
  const n = pixels.length;
  if (n === 0) return { colors: [], ratios: [], avgLuminance: 0.5 };

  const points: Rgb[] = pixels.map((p) => ({ r: p.r, g: p.g, b: p.b }));

  // 估算平均亮度（用于深浅判断），降采样加速
  const step = Math.max(1, Math.floor(n / 4000));
  let lumSum = 0;
  let lumCount = 0;
  for (let i = 0; i < n; i += step) {
    lumSum += luminance(points[i]!);
    lumCount++;
  }
  const avgLuminance = lumCount > 0 ? lumSum / lumCount : 0.5;

  const clusters = kMeans(points, k);
  const colors: string[] = [];
  const ratios: number[] = [];
  let accounted = 0;
  for (const c of clusters) {
    const ratio = c.size / n;
    if (ratio < minRatio) continue;
    if (colors.length >= maxColors) break;
    colors.push(rgbToHex(c.r, c.g, c.b));
    ratios.push(ratio);
    accounted += ratio;
  }
  // 归一化占比
  const normRatios = accounted > 0 ? ratios.map((r) => r / accounted) : ratios;
  return { colors, ratios: normRatios, avgLuminance };
}

// i18n-ignore-start  // 运行时错误消息（经 toast 详情透传，非 UI 文案）

/**
 * 从图片（URL / data URL / base64）提取主色板
 * 依赖浏览器 Canvas，非浏览器环境抛错
 */
export async function extractPaletteFromImage(src: string): Promise<ExtractedPalette> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Canvas 不可用：主色提取仅支持浏览器/Tauri 环境');
  }
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  // 等比缩放到采样尺寸
  const scale = Math.min(1, SAMPLE_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const pixels: PixelSample[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 128) continue; // 过滤透明
    // 预乘 alpha，避免半透明边缘污染
    const alpha = a / 255;
    pixels.push({
      r: Math.round(data[i]! * alpha + 255 * (1 - alpha)),
      g: Math.round(data[i + 1]! * alpha + 255 * (1 - alpha)),
      b: Math.round(data[i + 2]! * alpha + 255 * (1 - alpha)),
    });
  }
  return extractPaletteFromPixels(pixels);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// i18n-ignore-end

// ─── 组件色生成（纯函数，可测） ───

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * 文本/按钮对比度目标（WCAG AA）。取 4.5 略加余量，
 * 抵消 rgbToHex 8bit 量化带来的微小误差，保证最终 hex 复算仍 ≥4.5:1。
 */
const TEXT_RATIO = 4.6;

/**
 * 表面层相对纯前景的对比度目标。高于文本目标，为后续派生的文本 token
 * 预留「离前景最近」的亮度空间（背景 ≥8:1、卡片 ≥7:1、浮层 ≥6:1）。
 */
const SURFACE_RATIO = { background: 8, card: 7, elevated: 6 } as const;

/** 非文本 UI 元素（边框）相对表面的对比度目标（WCAG 1.4.11），含量化余量 */
const BORDER_RATIO = 3.2;

// 语义色基色：不随主题切换的「语义锚点」，仅亮度随基调调整（保留色相/饱和度）
const SUCCESS_BASE: Rgb = { r: 16, g: 185, b: 129 };
const SUCCESS_FG_BASE: Rgb = { r: 52, g: 211, b: 153 };
const ERROR_BASE: Rgb = { r: 234, g: 79, b: 83 };
const ERROR_FG_BASE: Rgb = { r: 255, g: 100, b: 133 };
const WARNING_BASE: Rgb = { r: 245, g: 158, b: 11 };
const ACCENT_BLUE_BASE: Rgb = { r: 96, g: 165, b: 250 };
const ACCENT_ORANGE_BASE: Rgb = { r: 224, g: 160, b: 96 };

/** Rgb → 小写 hex（语义色与返回值统一出口） */
function hex(c: Rgb): string {
  return rgbToHex(c.r, c.g, c.b);
}

/**
 * 根据提取的主色板生成整套主题 CSS 变量
 *
 * 策略（每个 token 对齐它「实际被使用的背景」，而非统一对齐前景）：
 * - 按平均亮度判断深浅基调（dark/light），深色用白前景/黑表面，反之亦然
 * - 表面层由最贴近基调方向的主色派生，并用 adjustContrast 锁定
 *   background/card/card-elevated 对纯前景的对比度（≥8/7/6:1），
 *   把「离前景最近」的 card-elevated 亮度限制在安全区
 * - 所有「文本类」token 一律对齐 card-elevated（对浅色文本最亮、对深色文本最暗的
 *   最难表面）——对齐它即自动满足对 background / card 的对比度要求
 * - 按钮文字取纯黑/纯白：深色基调用黑字（底色偏亮）、浅色基调用白字（底色偏暗），
 *   与「强调色作为文本须足够亮/暗」的方向一致，故按钮约束与文本约束不冲突
 * - error/success 语义各自闭环（fg 对齐自身 bg）；destructive/danger-* 从同一红派生
 */
export function generateThemeTokens(palette: ExtractedPalette): ThemeTokens {
  const { colors, avgLuminance } = palette;
  if (colors.length === 0) return {};

  const isDark = avgLuminance < 0.42;
  const baseRgb = colors.map(hexToRgb);

  // 前景参照（文本方向）与背景参照（表面方向）
  const fgRef = isDark ? WHITE : BLACK;
  const bgRef = isDark ? BLACK : WHITE;
  // 文本/按钮的调整方向：深色基调需提亮（远离暗表面），浅色基调需压暗（远离亮表面）。
  // 显式指定方向可避免「当前色与目标同侧」时自动判定选错方向（见 adjustContrast 文档）。
  const dir: ContrastDirection = isDark ? 'lighten' : 'darken';

  // ── 表面层 ──
  // 1) 取最贴近基调方向的主色作底色，向基调方向轻推
  let bgBase = baseRgb[0]!;
  let bestDist = Infinity;
  for (const c of baseRgb) {
    const d = squaredDist(c, bgRef);
    if (d < bestDist) {
      bestDist = d;
      bgBase = c;
    }
  }
  bgBase = shade(bgBase, bgRef, 0.15);

  // 2) 锁定三档表面与纯前景的对比度（≥8/7/6:1）。
  //    这既保证正文可读，又把 card-elevated（离前景最近者）的亮度限制在安全区，
  //    为所有文本 token 留出 ≥4.5:1 的可达空间。
  const bg = adjustContrast(bgBase, fgRef, SURFACE_RATIO.background);
  const card = adjustContrast(shade(bg, fgRef, isDark ? 0.12 : 0.05), fgRef, SURFACE_RATIO.card);
  const cardElevated = adjustContrast(
    shade(card, fgRef, isDark ? 0.12 : 0.04),
    fgRef,
    SURFACE_RATIO.elevated
  );
  const videoBg = shade(bg, fgRef, isDark ? 0.06 : 0.03);

  // card-elevated 是「离前景最近」的表面：对浅色文本最亮、对深色文本最暗，
  // 是三类表面中最难达标者。文本 token 对齐它即可自动满足对 background / card 的要求。
  const worstSurface = cardElevated;

  // ── 前景与次要文本 ──
  const fg = isDark ? WHITE : BLACK;
  const muted = adjustContrast(shade(fg, bg, isDark ? 0.34 : 0.42), worstSurface, TEXT_RATIO, {
    direction: dir,
  });

  // ── 品牌色 ──
  // 按钮文字取纯黑/纯白：深色基调按钮底色偏亮 → 黑字；浅色基调底色偏暗 → 白字。
  const onPrimaryRef = isDark ? BLACK : WHITE;
  const sortedBySaturation = [...baseRgb].sort(
    (a, b) => rgbToHsl(b.r, b.g, b.b).s - rgbToHsl(a.r, a.g, a.b).s
  );
  const primarySrc = sortedBySaturation[0] ?? bg;
  const secondarySrc = sortedBySaturation[1] ?? primarySrc;

  // primary：仅作按钮/装饰底色 → 对齐按钮文字
  const primary = adjustContrast(primarySrc, onPrimaryRef, TEXT_RATIO, { direction: dir });
  // primary-fg：品牌色文本 → 对齐最难表面
  const primaryFg = adjustContrast(primarySrc, worstSurface, TEXT_RATIO, { direction: dir });
  // secondary / accent-*：既作按钮底色又作强调文本 → 先满足按钮对，再对齐最难表面
  // （后者为更严约束，且不会反向破坏按钮对：深色基调两者同向提亮、浅色同向压暗）
  const secondary = adjustContrast(
    adjustContrast(secondarySrc, onPrimaryRef, TEXT_RATIO, { direction: dir }),
    worstSurface,
    TEXT_RATIO,
    { direction: dir }
  );
  const accentBlue = adjustContrast(
    adjustContrast(ACCENT_BLUE_BASE, onPrimaryRef, TEXT_RATIO, { direction: dir }),
    worstSurface,
    TEXT_RATIO,
    { direction: dir }
  );
  const accentOrange = adjustContrast(
    adjustContrast(ACCENT_ORANGE_BASE, onPrimaryRef, TEXT_RATIO, { direction: dir }),
    worstSurface,
    TEXT_RATIO,
    { direction: dir }
  );
  const onPrimary = hex(onPrimaryRef);
  const onAccent = hex(onPrimaryRef);

  // ── 语义色（各自闭环：fg 对齐自身提示底色）──
  const success = adjustContrast(SUCCESS_BASE, fg, TEXT_RATIO, { direction: dir });
  const successBg = mix(bg, SUCCESS_BASE, isDark ? 0.14 : 0.06);
  const successFg = adjustContrast(SUCCESS_FG_BASE, successBg, TEXT_RATIO, { direction: dir });
  const error = adjustContrast(ERROR_BASE, fg, TEXT_RATIO, { direction: dir });
  const errorBg = mix(bg, ERROR_BASE, isDark ? 0.16 : 0.06);
  const errorFg = adjustContrast(ERROR_FG_BASE, errorBg, TEXT_RATIO, { direction: dir });

  // 警示色：warning-fg 作文本（对背景/卡片），warning-bg/border 为半透明提示面
  const warningFg = adjustContrast(WARNING_BASE, worstSurface, TEXT_RATIO, { direction: dir });
  const warningBg = mix(bg, WARNING_BASE, isDark ? 0.16 : 0.08);
  const warningBorder = mix(bg, WARNING_BASE, isDark ? 0.32 : 0.4);

  // destructive：破坏性操作的实色红（删除按钮/文字/边框），对齐卡片；
  // danger-* 为 error 语义的半透明提示面，从同一红派生以保持色调一致。
  const destructive = adjustContrast(ERROR_BASE, worstSurface, TEXT_RATIO, { direction: dir });
  const dangerBg = mix(bg, ERROR_BASE, isDark ? 0.1 : 0.04);
  const dangerBorder = mix(bg, ERROR_BASE, isDark ? 0.32 : 0.4);

  // 边框：与背景 ≥3:1（非文本 UI 元素）
  const border = adjustContrast(shade(fg, bg, isDark ? 0.62 : 0.7), bg, BORDER_RATIO, {
    direction: dir,
  });

  // 标签色：作文本使用，对齐最难表面
  const tagBlue = adjustContrast({ r: 96, g: 165, b: 250 }, worstSurface, TEXT_RATIO, { direction: dir });
  const tagPurple = adjustContrast({ r: 192, g: 132, b: 252 }, worstSurface, TEXT_RATIO, { direction: dir });
  const tagGreen = adjustContrast({ r: 52, g: 211, b: 153 }, worstSurface, TEXT_RATIO, { direction: dir });
  const tagGray = adjustContrast({ r: 156, g: 163, b: 175 }, worstSurface, TEXT_RATIO, { direction: dir });

  return {
    background: hex(bg),
    card: hex(card),
    'card-elevated': hex(cardElevated),
    'video-bg': hex(videoBg),
    foreground: hex(fg),
    'muted-foreground': hex(muted),
    border: hex(border),
    primary: hex(primary),
    'primary-fg': hex(primaryFg),
    secondary: hex(secondary),
    'on-primary': onPrimary,
    'on-accent': onAccent,
    'on-media': hex(isDark ? WHITE : BLACK),
    // 破坏性操作实色红（删除按钮/文字/边框）
    destructive: hex(destructive),
    success: hex(success),
    'success-fg': hex(successFg),
    'success-bg': hex(successBg),
    error: hex(error),
    'error-fg': hex(errorFg),
    'error-bg': hex(errorBg),
    'warning-fg': hex(warningFg),
    'warning-bg': hex(warningBg),
    'warning-border': hex(warningBorder),
    // danger-* 为 error 语义别名（fg 同 error-fg），bg/border 为半透明提示面
    'danger-fg': hex(errorFg),
    'danger-bg': hex(dangerBg),
    'danger-border': hex(dangerBorder),
    // 扩展强调色（信息蓝 / 警示橙）：作文本对齐表面，同时作按钮底色
    'accent-blue': hex(accentBlue),
    'accent-orange': hex(accentOrange),
    'tag-blue': hex(tagBlue),
    'tag-purple': hex(tagPurple),
    'tag-green': hex(tagGreen),
    'tag-gray': hex(tagGray),
  };
}

/**
 * 将主题令牌序列化为可注入的 CSS 文本
 * 例如：--background: #0b0b10; --card: #1a1c2b; ...
 */
export function tokensToCss(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `--${key}: ${value};`)
    .join('\n');
}

/**
 * 生成覆盖 CSS 变量的 <style> 内容。
 * 通过更高优先级选择器覆盖 tokens.css 的 :root 默认值。
 */
export function buildCustomThemeCss(tokens: ThemeTokens, backgroundValue?: string): string {
  const lines: string[] = [];
  lines.push(':root[data-theme="custom"] {');
  lines.push(tokensToCss(tokens));
  if (backgroundValue) {
    // 全局背景图（主题背景），叠加默认暗色遮罩保证文字可读性
    lines.push(
      `  --custom-theme-bg-image: url("${backgroundValue.replace(/"/g, '\\"')}");`
    );
  }
  lines.push('}');
  lines.push('');
  lines.push(':root[data-theme="custom"] .app-shell {');
  lines.push('  background-image: var(--custom-theme-bg-image);');
  lines.push('  background-size: cover;');
  lines.push('  background-position: center;');
  lines.push('  background-attachment: fixed;');
  lines.push('}');
  lines.push(':root[data-theme="custom"] .app-shell::before {');
  lines.push('  content: "";');
  lines.push('  position: fixed;');
  lines.push('  inset: 0;');
  lines.push('  background: color-mix(in srgb, var(--background) 86%, transparent);');
  lines.push('  pointer-events: none;');
  lines.push('  z-index: 0;');
  lines.push('}');
  // 主要面板半透明化，让背景图透出（同时保留文字可读性）
  lines.push(':root[data-theme="custom"] .nav-rail,');
  lines.push(':root[data-theme="custom"] .chat-header,');
  lines.push(':root[data-theme="custom"] .chat-footer,');
  lines.push(':root[data-theme="custom"] .character-list,');
  lines.push(':root[data-theme="custom"] .context-panel {');
  lines.push('  background: color-mix(in srgb, var(--card) 88%, transparent);');
  lines.push('  backdrop-filter: blur(10px);');
  lines.push('  -webkit-backdrop-filter: blur(10px);');
  lines.push('}');
  lines.push(':root[data-theme="custom"] .chat-main {');
  lines.push('  background: color-mix(in srgb, var(--background) 88%, transparent);');
  lines.push('  backdrop-filter: blur(10px);');
  lines.push('  -webkit-backdrop-filter: blur(10px);');
  lines.push('}');
  lines.push(':root[data-theme="custom"] .app-main,');
  lines.push(':root[data-theme="custom"] .nav-rail,');
  lines.push(':root[data-theme="custom"] .chat-main {');
  lines.push('  position: relative;');
  lines.push('  z-index: 1;');
  lines.push('}');
  return lines.join('\n');
}
