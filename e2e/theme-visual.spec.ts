import { test } from '@playwright/test';
import { THEME_PRESETS } from '../src/types';
import { applyThemeAndWait } from './theme-persistence';

/**
 * E2E · 主题视觉快照（视觉优化 需求6）
 *
 * 为每款内置皮肤生成设置页与对话页的全页截图，供人工核验：
 * 背景/卡片/边框层级、文本对比、按钮/输入框/焦点环、图标清晰度。
 * 截图输出至 test-results/theme-shots/{theme}-{page}.png
 */
const themes: string[] = [...THEME_PRESETS];

for (const theme of themes) {
  test(`视觉快照：${theme} 主题设置页与对话页`, async ({ page }) => {
    /**
     * 点卡后必须等它**真的落盘**，否则下面 `goto('/chat')` 会让文档重新加载、回落到默认皮肤，
     * 于是 `{theme}-chat.png` 悄悄是另一套皮肤的样子——截图是给人当验收依据的，
     * 错套比缺失更坏。实测这个竞态在 9 款 × 4 worker 的全量跑里会命中（中性网同因红过 143 处）。
     */
    await applyThemeAndWait(page, theme, '/settings');
    await page.waitForTimeout(600); // 等待主题过渡与 toast 淡入稳定
    await page.screenshot({
      path: `test-results/theme-shots/${theme}-settings.png`,
      fullPage: true,
    });

    // 对话页（主交互面：导航栏 + 消息区 + 输入框）
    await page.goto('/chat');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `test-results/theme-shots/${theme}-chat.png`,
      fullPage: true,
    });
  });
}
