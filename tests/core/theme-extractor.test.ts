/**
 * theme-extractor — 自定义主题主色提取与组件色生成 (F08.4) 测试
 *
 * 覆盖：
 * - 颜色工具：hex/rgb/hsl 互转、亮度、对比度
 * - k-means 聚类：同色像素聚为一簇、多色分离
 * - extractPaletteFromPixels：占比排序、过滤低占比簇
 * - generateThemeTokens：深/浅基调判定、前景对比度 ≥4.5:1
 * - tokensToCss 序列化
 */
import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  luminance,
  contrastRatio,
  adjustContrast,
  kMeans,
  extractPaletteFromPixels,
  generateThemeTokens,
  tokensToCss,
  buildCustomThemeCss,
} from '@core/theme-extractor';

describe('颜色工具', () => {
  it('hexToRgb / rgbToHex 互转', () => {
    expect(hexToRgb('#fe2c55')).toEqual({ r: 254, g: 44, b: 85 });
    expect(rgbToHex(254, 44, 85)).toBe('#fe2c55');
    // 短 hex
    expect(hexToRgb('#f25')).toEqual({ r: 255, g: 34, b: 85 });
    // 非法输入回退黑
    expect(hexToRgb('zzz')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('rgbToHsl / hslToRgb 互转', () => {
    const hsl = rgbToHsl(255, 0, 0);
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.s).toBeCloseTo(100, 0);
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    expect(rgb.r).toBeCloseTo(255, 0);
    expect(rgb.g).toBeCloseTo(0, 0);
  });

  it('luminance / contrastRatio', () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    expect(luminance(white)).toBeCloseTo(1, 2);
    expect(luminance(black)).toBeCloseTo(0, 2);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 0);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 2);
  });

  it('adjustContrast 提升对比度至目标', () => {
    const color = { r: 230, g: 40, b: 70 }; // 偏亮红
    const target = { r: 255, g: 255, b: 255 };
    const adjusted = adjustContrast(color, target, 4.5);
    expect(contrastRatio(adjusted, target)).toBeGreaterThanOrEqual(4.5);
  });

  it('adjustContrast 保留色相，不会压成纯黑/纯白（回归：蓝紫主按钮）', () => {
    const color = { r: 108, g: 99, b: 242 }; // #6c63f2 蓝紫
    const target = { r: 255, g: 255, b: 255 };
    const adjusted = adjustContrast(color, target, 4.5);
    expect(contrastRatio(adjusted, target)).toBeGreaterThanOrEqual(4.5);
    // 色相仍为蓝紫（约 240±30），且未塌缩为黑
    const hsl = rgbToHsl(adjusted.r, adjusted.g, adjusted.b);
    expect(hsl.h).toBeGreaterThan(210);
    expect(hsl.h).toBeLessThan(270);
    expect(hsl.l).toBeGreaterThan(15);
    // 保留可辨识的蓝色分量
    expect(adjusted.b).toBeGreaterThan(adjusted.r);
    // 反向：暗色需提亮时不会变成纯白
    const dark = { r: 30, g: 20, b: 90 };
    const brightened = adjustContrast(dark, { r: 0, g: 0, b: 0 }, 4.5);
    expect(contrastRatio(brightened, { r: 0, g: 0, b: 0 })).toBeGreaterThanOrEqual(4.5);
    expect(rgbToHsl(brightened.r, brightened.g, brightened.b).l).toBeLessThan(90);
  });
});

describe('k-means 聚类', () => {
  it('同色像素聚为一簇', () => {
    const points = Array.from({ length: 50 }, () => ({ r: 10, g: 200, b: 30 }));
    const clusters = kMeans(points, 3);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0]!.size).toBe(50);
    expect(clusters[0]!.r).toBeCloseTo(10, 0);
  });

  it('多色像素分离为多个簇并按占比降序', () => {
    const red = Array.from({ length: 60 }, () => ({ r: 200, g: 10, b: 10 }));
    const blue = Array.from({ length: 40 }, () => ({ r: 10, g: 10, b: 200 }));
    const clusters = kMeans([...red, ...blue], 2);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.size).toBeGreaterThanOrEqual(clusters[1]!.size);
  });
});

describe('extractPaletteFromPixels', () => {
  it('返回占比降序的主色板', () => {
    const red = Array.from({ length: 60 }, () => ({ r: 200, g: 20, b: 20 }));
    const green = Array.from({ length: 40 }, () => ({ r: 20, g: 180, b: 30 }));
    const palette = extractPaletteFromPixels([...red, ...green], { maxColors: 6 });
    expect(palette.colors.length).toBeGreaterThanOrEqual(2);
    expect(palette.ratios).toHaveLength(palette.colors.length);
    // 占比为 1 的归一化
    const sum = palette.ratios.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('空像素返回空板', () => {
    const palette = extractPaletteFromPixels([]);
    expect(palette.colors).toEqual([]);
    expect(palette.avgLuminance).toBe(0.5);
  });
});

describe('generateThemeTokens', () => {
  it('深色图片 → 生成深色主题且前景对比度达标', () => {
    const palette = {
      colors: ['#0a0a14', '#1b2a5e', '#7f1d1d', '#3f3f46', '#52525b', '#111827'],
      ratios: [0.5, 0.2, 0.1, 0.1, 0.05, 0.05],
      avgLuminance: 0.06,
    };
    const tokens = generateThemeTokens(palette);
    expect(tokens.background).toMatch(/^#[0-9a-f]{6}$/);
    const bg = hexToRgb(tokens.background!);
    const fg = hexToRgb(tokens.foreground!);
    expect(luminance(bg)).toBeLessThan(0.2); // 深色背景
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    // primary 与 on-primary 对比达标
    const primary = hexToRgb(tokens.primary!);
    const onPrimary = hexToRgb(tokens['on-primary']!);
    expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it('浅色图片 → 生成浅色主题', () => {
    const palette = {
      colors: ['#fef7ed', '#fde8d7', '#f7c5b1', '#e8e2d9', '#d9d2c7', '#c9c0b2'],
      ratios: [0.4, 0.25, 0.15, 0.1, 0.05, 0.05],
      avgLuminance: 0.85,
    };
    const tokens = generateThemeTokens(palette);
    const bg = hexToRgb(tokens.background!);
    const fg = hexToRgb(tokens.foreground!);
    expect(luminance(bg)).toBeGreaterThan(0.5); // 浅色背景
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('空色板返回空 tokens', () => {
    expect(generateThemeTokens({ colors: [], ratios: [], avgLuminance: 0.5 })).toEqual({});
  });

  // ── 极端色用例（评审 B：极端色偏低/偏高亮度仍保证对比度） ──
  it('极端黑（纯黑图片）→ 前景/主按钮对比度仍达标', () => {
    const palette = {
      colors: ['#000000', '#050505', '#0a0a0a', '#000000', '#020202', '#010101'],
      ratios: [0.5, 0.2, 0.1, 0.1, 0.05, 0.05],
      avgLuminance: 0.004,
    };
    const tokens = generateThemeTokens(palette);
    const bg = hexToRgb(tokens.background!);
    const fg = hexToRgb(tokens.foreground!);
    // 深色主题：背景黑、前景白
    expect(luminance(bg)).toBeLessThan(0.05);
    expect(luminance(fg)).toBeGreaterThan(0.9);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    // 主按钮与按钮文字
    const primary = hexToRgb(tokens.primary!);
    const onPrimary = hexToRgb(tokens['on-primary']!);
    expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it('极端白（纯白图片）→ 前景/主按钮对比度仍达标', () => {
    const palette = {
      colors: ['#ffffff', '#fafafa', '#f5f5f5', '#ffffff', '#fdfdfd', '#f2f2f2'],
      ratios: [0.5, 0.2, 0.1, 0.1, 0.05, 0.05],
      avgLuminance: 0.99,
    };
    const tokens = generateThemeTokens(palette);
    const bg = hexToRgb(tokens.background!);
    const fg = hexToRgb(tokens.foreground!);
    expect(luminance(bg)).toBeGreaterThan(0.95);
    expect(luminance(fg)).toBeLessThan(0.05);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    const primary = hexToRgb(tokens.primary!);
    const onPrimary = hexToRgb(tokens['on-primary']!);
    expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it('极端高饱和色（纯红/纯黄/纯蓝分别作主色）→ 前景对比度仍达标', () => {
    const cases = [
      { colors: ['#ff0000', '#cc0000', '#990000', '#660000', '#330000', '#000000'], avgLuminance: 0.28 }, // 纯红
      { colors: ['#ffff00', '#ffee00', '#ffdd00', '#ffcc00', '#ffbb00', '#ffaa00'], avgLuminance: 0.72 }, // 纯黄
      { colors: ['#0000ff', '#0000cc', '#000099', '#000066', '#000033', '#000000'], avgLuminance: 0.06 }, // 纯蓝
    ];
    for (const c of cases) {
      const tokens = generateThemeTokens({
        colors: c.colors,
        ratios: [0.5, 0.2, 0.1, 0.1, 0.05, 0.05],
        avgLuminance: c.avgLuminance,
      });
      const bg = hexToRgb(tokens.background!);
      const fg = hexToRgb(tokens.foreground!);
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      // muted-foreground 亦需相对背景达标（正文级小字 ≥4.5:1）
      const muted = hexToRgb(tokens['muted-foreground']!);
      expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('极端低饱和（灰阶图）→ 前景/边框/主按钮对比度仍达标', () => {
    const palette = {
      colors: ['#1a1a1a', '#2a2a2a', '#3a3a3a', '#4a4a4a', '#5a5a5a', '#6a6a6a'],
      ratios: [0.5, 0.2, 0.1, 0.1, 0.05, 0.05],
      avgLuminance: 0.08,
    };
    const tokens = generateThemeTokens(palette);
    const bg = hexToRgb(tokens.background!);
    const fg = hexToRgb(tokens.foreground!);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    // 边框需 ≥3:1（非文字界面元素）
    const border = hexToRgb(tokens.border!);
    expect(contrastRatio(border, bg)).toBeGreaterThanOrEqual(3);
    const primary = hexToRgb(tokens.primary!);
    const onPrimary = hexToRgb(tokens['on-primary']!);
    expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('序列化', () => {
  it('tokensToCss 生成 --key: value; 格式', () => {
    const css = tokensToCss({ background: '#0b0b10', card: '#1a1c2b' });
    expect(css).toContain('--background: #0b0b10;');
    expect(css).toContain('--card: #1a1c2b;');
  });

  it('buildCustomThemeCss 生成 data-theme=custom 覆盖规则', () => {
    const css = buildCustomThemeCss({ background: '#0b0b10' }, 'data:image/png;base64,xxx');
    expect(css).toContain(':root[data-theme="custom"]');
    expect(css).toContain('--custom-theme-bg-image');
    expect(css).toContain('background-image: var(--custom-theme-bg-image)');
  });
});
