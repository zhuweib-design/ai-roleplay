import { test } from '@playwright/test';

/**
 * E2E · 主题视觉快照（视觉优化 需求6）
 *
 * 为每个深色主题生成设置页与对话页的全页截图，供人工核验：
 * 背景/卡片/边框层级、文本对比、按钮/输入框/焦点环、图标清晰度。
 * 截图输出至 test-results/theme-shots/{theme}-{page}.png
 */
const themes = ['dark', 'midnight', 'oled', 'theatre'];

for (const theme of themes) {
  test(`视觉快照：${theme} 主题设置页与对话页`, async ({ page }) => {
    // 设置页
    await page.goto('/settings');
    await page.locator(`.theme-card[data-value="${theme}"]`).click();
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
