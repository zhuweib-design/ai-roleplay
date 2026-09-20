import { test, expect, type Page } from '@playwright/test';
import path from 'path';

/**
 * E2E · 自定义主题对比度（F08.4 · 端到端不变式守卫）
 *
 * 覆盖「上传背景图 → k-means 取色 → generateThemeTokens 派生 → CSS 变量实际应用」
 * 这条完整链路（单测 tests/core/theme-contrast.test.ts 只覆盖函数返回值）。
 *
 * 不变式（而非具体色值）：无论从图片派生出什么调色板，scripts/check-contrast.mjs
 * 的 22 对「前景/背景」均须 ≥4.5:1（WCAG 2.1 AA）。
 * 之所以断言不变式：k-means 初始化含随机性，同一图片每次提取的调色板可能不同，
 * 断言「无论派生出什么，22 对都达标」才既稳定又真正验证修复的鲁棒性。
 */
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

/** 22 对涉及的全部变量名（去重），用于一次性从浏览器读取 */
const KEYS = Array.from(new Set(CHECKS.flatMap((c) => [c.fg, c.bg])));

/** 三个曾缺失、必须产出的 token */
const REQUIRED_TOKENS = ['destructive', 'accent-blue', 'accent-orange'];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim();
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** WCAG 相对亮度（与门禁脚本同一公式） */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

/** WCAG 对比度（与门禁脚本同一公式） */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 在设置页上传真实背景图并应用自定义主题，返回生效的 CSS 变量表。
 */
async function applyCustomThemeFromImage(page: Page, imagePath: string): Promise<Record<string, string>> {
  await page.goto('/settings');
  // 打开自定义主题编辑器（无自定义数据时点击 custom 主题卡会展开面板）
  await page.locator('.theme-card[data-value="custom"]').click();
  const fileInput = page.locator('input[type="file"][accept="image/*"]').first();
  await fileInput.setInputFiles(path.resolve(imagePath));
  // 等待主色提取完成（提取成功后「应用该主题」按钮出现）
  const applyBtn = page.getByRole('button', { name: '应用该主题' });
  await applyBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await applyBtn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'custom');
  // 等待 <style id="custom-theme"> 注入并完成样式计算
  await page.waitForTimeout(300);

  return page.evaluate((keys) => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = cs.getPropertyValue(`--${k}`).trim();
    return out;
  }, KEYS);
}

test('自定义主题：上传真实背景图后 22 对对比度全部 ≥4.5:1', async ({ page }) => {
  const vars = await applyCustomThemeFromImage(page, 'public/assets/hero-cyber-nexus.jpg');

  // 三个新增 token 必须实际产出（非空且为 hex 颜色）
  for (const key of REQUIRED_TOKENS) {
    expect(vars[key], `--${key} 未产出`).toMatch(/^#[0-9a-f]{6}$/);
  }

  // 复算 22 对，收集不达标项（便于失败时定位）
  const failures: string[] = [];
  for (const c of CHECKS) {
    const fg = vars[c.fg];
    const bg = vars[c.bg];
    if (!fg || !bg) {
      failures.push(`${c.name}: 变量缺失 (--${c.fg}="${fg}", --${c.bg}="${bg}")`);
      continue;
    }
    const ratio = contrast(fg, bg);
    if (ratio < AA) failures.push(`${c.name}: ${ratio.toFixed(2)}:1 (${fg} on ${bg})`);
  }

  expect(
    failures,
    `自定义主题对比度未达标（共 ${failures.length} 项）:\n${failures.join('\n')}`
  ).toHaveLength(0);
});
