/**
 * theme-extractor · 自定义主题对比度回归测试
 *
 * 背景：静态门禁 scripts/check-contrast.mjs 只覆盖 5 个内置主题，
 * 不覆盖用户上传背景图后由 generateThemeTokens() 派生的「自定义主题」。
 * 本测试复用门禁的同一套「前景/背景」对（22 对），对代表性调色板扫描，
 * 断言每一对均 ≥4.5:1（WCAG 2.1 AA），并断言新增 token 确实产出。
 *
 * 历史缺陷（本测试防回归）：
 * - 对比度对齐了错误的参照色（统一对齐纯白/纯黑），导致深色背景下
 *   primary-fg 等品牌/强调文本对比塌陷（最差 1.07:1）；
 * - destructive / accent-blue / accent-orange 三个 token 未产出，
 *   165 处 UI 引用回退到内置主题色值。
 */
import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  hslToRgb,
  rgbToHex,
  type ExtractedPalette,
  type Rgb,
} from '@/core/theme-extractor';
import { generateThemeTokens } from '@/core/theme-tokens';

const AA = 4.5;

/** 与 scripts/check-contrast.mjs 完全一致的 22 个检查对 */
const CHECKS: Array<{ name: string; fg: string; bg: string }> = [
  // 文本
  { name: '前景/背景（正文）', fg: 'foreground', bg: 'background' },
  { name: '前景/卡片（正文）', fg: 'foreground', bg: 'card' },
  { name: 'muted/背景（次要文本）', fg: 'muted-foreground', bg: 'background' },
  { name: 'muted/卡片（次要文本）', fg: 'muted-foreground', bg: 'card' },
  { name: 'muted/card-elevated（输入提示）', fg: 'muted-foreground', bg: 'card-elevated' },
  { name: 'secondary/背景（强调文本）', fg: 'secondary', bg: 'background' },
  { name: 'secondary/卡片（强调文本）', fg: 'secondary', bg: 'card' },
  { name: 'primary-fg/背景（品牌色文本）', fg: 'primary-fg', bg: 'background' },
  { name: 'primary-fg/卡片（品牌色文本）', fg: 'primary-fg', bg: 'card' },
  { name: 'destructive/卡片（错误文本）', fg: 'destructive', bg: 'card' },
  // 按钮文字
  { name: 'on-primary/primary（主按钮）', fg: 'on-primary', bg: 'primary' },
  { name: 'on-accent/secondary（次按钮）', fg: 'on-accent', bg: 'secondary' },
  // 错误/成功提示
  { name: 'error-fg/error-bg', fg: 'error-fg', bg: 'error-bg' },
  { name: 'success-fg/success-bg', fg: 'success-fg', bg: 'success-bg' },
  // 扩展强调色 · 文本 on 背景/卡片
  { name: 'accent-blue/背景（信息文本）', fg: 'accent-blue', bg: 'background' },
  { name: 'accent-blue/卡片（信息文本）', fg: 'accent-blue', bg: 'card' },
  { name: 'accent-orange/背景（警示文本）', fg: 'accent-orange', bg: 'background' },
  { name: 'accent-orange/卡片（警示文本）', fg: 'accent-orange', bg: 'card' },
  { name: 'warning-fg/背景（警告文本）', fg: 'warning-fg', bg: 'background' },
  { name: 'warning-fg/卡片（警告文本）', fg: 'warning-fg', bg: 'card' },
  // 扩展强调色 · 按钮文字（on-accent on accent-*）
  { name: 'on-accent/accent-blue（信息按钮）', fg: 'on-accent', bg: 'accent-blue' },
  { name: 'on-accent/accent-orange（警示按钮）', fg: 'on-accent', bg: 'accent-orange' },
];

/** 三个曾经缺失、必须产出的 token */
const REQUIRED_TOKENS = ['destructive', 'accent-blue', 'accent-orange'];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** 由 HSL 构造 hex（复用被测模块的转换，避免测试侧自造转换引入偏差） */
function hslHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/** 生成一批合成调色板：12 色相 × 6 明度 × 3 饱和度，每组 4 个邻近变体 */
function makeSyntheticPalettes(): Array<{ label: string; palette: ExtractedPalette }> {
  const out: Array<{ label: string; palette: ExtractedPalette }> = [];
  const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const lights = [0.12, 0.25, 0.4, 0.55, 0.7, 0.85];
  const sats = [0.25, 0.6, 0.95];
  for (const h of hues) {
    for (const l of lights) {
      for (const s of sats) {
        const colors = [
          hslHex(h, s * 100, l * 100),
          hslHex(h, s * 100, Math.max(0, l * 100 - 12)),
          hslHex(h, s * 100, Math.min(100, l * 100 + 10)),
          hslHex((h + 20) % 360, Math.max(0, s * 100 - 15), l * 100),
        ];
        out.push({ label: `h${h}-l${l}-s${s}`, palette: { colors, ratios: [0.5, 0.25, 0.15, 0.1], avgLuminance: l } });
      }
    }
  }
  return out;
}

/** 一组手工挑选的极端/现实调色板（纯黑、纯白、高饱和、灰阶、双主色） */
function makeEdgePalettes(): Array<{ label: string; palette: ExtractedPalette }> {
  const mk = (label: string, colors: string[], avgLuminance: number) => ({
    label,
    palette: { colors, ratios: colors.map(() => 1 / colors.length), avgLuminance },
  });
  return [
    mk('纯黑', ['#000000', '#050505', '#0a0a0a', '#020202'], 0.004),
    mk('纯白', ['#ffffff', '#fafafa', '#f5f5f5', '#fdfdfd'], 0.99),
    mk('纯红', ['#ff0000', '#cc0000', '#990000', '#660000'], 0.28),
    mk('纯黄', ['#ffff00', '#ffee00', '#ffdd00', '#ffcc00'], 0.72),
    mk('纯蓝', ['#0000ff', '#0000cc', '#000099', '#000066'], 0.06),
    mk('灰阶深', ['#1a1a1a', '#2a2a2a', '#3a3a3a', '#4a4a4a'], 0.08),
    mk('灰阶浅', ['#e8e8e8', '#dcdcdc', '#d0d0d0', '#c4c4c4'], 0.78),
    mk('中性中灰', ['#808080', '#8c8c8c', '#767676', '#6a6a6a'], 0.5),
    mk('双主色紫青', ['#786af3', '#7d69f4', '#25f4ee', '#14d6d0'], 0.2),
    mk('暖橙棕', ['#b45309', '#e0a060', '#78350f', '#f59e0b'], 0.3),
    mk('青绿冷调', ['#0a7a77', '#059669', '#065f46', '#34d399'], 0.25),
    mk('洋红粉', ['#e85d7f', '#f43f5e', '#be123c', '#fb7185'], 0.35),
  ];
}

interface Failure {
  label: string;
  check: string;
  ratio: number;
  fg: string;
  bg: string;
}

/** 对给定调色板集合扫描 22 对，返回全部不达标项（供断言与报告） */
function scan(
  palettes: Array<{ label: string; palette: ExtractedPalette }>
): { failures: Failure[]; missing: Failure[] } {
  const failures: Failure[] = [];
  const missing: Failure[] = [];
  for (const { label, palette } of palettes) {
    const tokens = generateThemeTokens(palette) as Record<string, string>;
    for (const c of CHECKS) {
      const fg = tokens[c.fg];
      const bg = tokens[c.bg];
      if (!fg || !bg) {
        missing.push({ label, check: c.name, ratio: 0, fg: c.fg, bg: c.bg });
        continue;
      }
      const ratio = contrastRatio(hexToRgb(fg), hexToRgb(bg));
      if (ratio < AA) {
        failures.push({ label, check: c.name, ratio, fg, bg });
      }
    }
  }
  return { failures, missing };
}

function fmt(items: Failure[], limit = 20): string {
  return items
    .slice(0, limit)
    .map((f) => `    ${f.label}  ${f.check}: ${f.ratio.toFixed(2)}:1  (${f.fg} on ${f.bg})`)
    .join('\n');
}

describe('自定义主题对比度回归（22 对全部 ≥4.5:1）', () => {
  const synthetic = makeSyntheticPalettes();
  const edges = makeEdgePalettes();
  const all = [...synthetic, ...edges];

  it(`合成调色板扫描（${synthetic.length} 组）无一对不达标`, () => {
    const { failures, missing } = scan(synthetic);
    const summary = failures.length
      ? `\n  不达标样例:\n${fmt(failures)}\n  合计 ${failures.length} 项`
      : '';
    expect(missing, `缺失 token:\n${fmt(missing)}`).toHaveLength(0);
    expect(failures, `对比度未达标:${summary}`).toHaveLength(0);
  });

  it(`极端/现实调色板（${edges.length} 组）无一对不达标`, () => {
    const { failures, missing } = scan(edges);
    const summary = failures.length
      ? `\n  不达标样例:\n${fmt(failures)}\n  合计 ${failures.length} 项`
      : '';
    expect(missing, `缺失 token:\n${fmt(missing)}`).toHaveLength(0);
    expect(failures, `对比度未达标:${summary}`).toHaveLength(0);
  });

  it('必须产出 destructive / accent-blue / accent-orange 三个 token', () => {
    for (const { label, palette } of all) {
      const tokens = generateThemeTokens(palette) as Record<string, string>;
      for (const key of REQUIRED_TOKENS) {
        expect(tokens[key], `${label} 缺失 ${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('深色基调下强调色偏亮、浅色基调下偏暗（方向性 sanity check）', () => {
    const dark = generateThemeTokens({
      colors: ['#0a0a14', '#1b2a5e', '#7f1d1d', '#3f3f46'],
      ratios: [0.5, 0.2, 0.2, 0.1],
      avgLuminance: 0.06,
    });
    const light = generateThemeTokens({
      colors: ['#fef7ed', '#fde8d7', '#f7c5b1', '#e8e2d9'],
      ratios: [0.4, 0.3, 0.2, 0.1],
      avgLuminance: 0.85,
    });
    // 深色基调：按钮底色偏亮 → 黑字
    expect(dark['on-primary']).toBe('#000000');
    expect(hexToRgb(dark['accent-blue']!).b).toBeGreaterThan(120);
    // 浅色基调：按钮底色偏暗 → 白字
    expect(light['on-primary']).toBe('#ffffff');
  });
});
