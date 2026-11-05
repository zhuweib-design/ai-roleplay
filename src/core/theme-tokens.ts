/* ═══════════════════════════════════════════════════════════════
   theme-tokens.ts — 自定义主题的组件色生成与对比度审计
   ═══════════════════════════════════════════════════════════════
   从 `theme-extractor.ts`（722 行）外提而来（B6，2026-10-26）：
   提取侧（颜色数学 + k-means 聚类 + 图片采样）留在原文件，这里只管
   "给定主色板 → 整套 CSS 变量 → 生成样式表"，以及上线前的对比度体检。

   搬移是逐字搬的，算法与常量一个字没改；等价性由
   `tests/core/theme-golden.test.ts` 的 sha256 指纹钉住。
   ═══════════════════════════════════════════════════════════════ */

import {
  adjustContrast,
  contrastRatio,
  hexToRgb,
  mix,
  rgbToHex,
  rgbToHsl,
  shade,
  squaredDist,
  type ContrastDirection,
  type ExtractedPalette,
  type Rgb,
} from './theme-extractor';

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

/** 生成的主题 CSS 变量（键为不含 -- 前缀的变量名，值为 css 颜色） */
export type ThemeTokens = Record<string, string>;
