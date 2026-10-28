/**
 * 自定义主题生成的"输出指纹"回归（B6 拆分的安全网）
 *
 * `theme-extractor.ts` 722 行里，组件色生成段（generateThemeTokens / tokensToCss /
 * buildCustomThemeCss）是纯函数，也是 B6 要外提的那一段。纯搬移的判据不该是
 * "看起来一样"：这里对三组代表性调色板把整套 CSS 压成一个 sha256，
 * 搬之前记下指纹，搬之后必须一字不差。
 *
 * 三组覆盖：深色基调（avgLuminance<0.42）、浅色基调、边界值（0.42 附近 + 单色板）。
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { type ExtractedPalette } from '@/core/theme-extractor';
import { buildCustomThemeCss, generateThemeTokens } from '@/core/theme-tokens';

const PALETTES: Array<{ name: string; palette: ExtractedPalette; bg?: string }> = [
  {
    name: 'dark-base',
    palette: {
      colors: ['#101820', '#1f6feb', '#e8dcc8', '#2d333b', '#7ee787'],
      ratios: [0.42, 0.21, 0.18, 0.12, 0.07],
      avgLuminance: 0.14,
    },
    bg: 'url("data:image/png;base64,AAAA")',
  },
  {
    name: 'light-base',
    palette: {
      colors: ['#f6f1e7', '#b23a2f', '#2b5bff', '#efe9dc'],
      ratios: [0.5, 0.2, 0.18, 0.12],
      avgLuminance: 0.82,
    },
  },
  {
    name: 'boundary-mid',
    palette: {
      colors: ['#7a7f88', '#3c4657'],
      ratios: [0.6, 0.4],
      avgLuminance: 0.42,
    },
    bg: 'linear-gradient(#000, #fff)',
  },
];

function fingerprint(): string {
  const blob = PALETTES.map((p) => buildCustomThemeCss(generateThemeTokens(p.palette), p.bg)).join(
    '\n/* ---- */\n'
  );
  return createHash('sha256').update(blob).digest('hex');
}

describe('自定义主题生成的输出指纹', () => {
  it('三组调色板生成的整套 CSS 与登记的指纹一致', () => {
    const got = fingerprint();
    // 期望值由本测试首次运行打印后登记；改动 generateThemeTokens 的任何算法都会在这里红
    expect(got).toBe('0af79314045ed351c97c699e3d888383ba7eaa882cc97ae484822e3aaccfd99e');
  });

  it('每组都真的产出了 token（防止空对象把指纹做成同一个值）', () => {
    for (const p of PALETTES) {
      const tokens = generateThemeTokens(p.palette);
      expect(Object.keys(tokens).length, `${p.name} 生成的 token 数`).toBeGreaterThan(20);
      expect(tokens.background, `${p.name} 缺 background`).toMatch(/^#/);
      expect(tokens.foreground, `${p.name} 缺 foreground`).toMatch(/^#/);
    }
  });
});
