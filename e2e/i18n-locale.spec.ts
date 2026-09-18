import { test, expect } from '@playwright/test';

/**
 * E2E · 首访语言检测（P2-3）
 *
 * 验证「无持久化语言时按 `navigator.language` 兜底」在真实浏览器中生效。
 *
 * 背景：`playwright.config.ts` 的全局 `use.locale` 固定为 `zh-CN`，以保证既有用例的
 * 中文文案断言稳定。本文件用 `test.use` 覆盖为 `en-US`，专门走英文分支 —— 否则
 * 这条新逻辑在 E2E 层完全没有覆盖。
 *
 * 注意：每个用例使用独立的 browser context（Playwright 默认），因此不会把语言
 * 持久化到其他用例。
 */
test.use({ locale: 'en-US' });

test('首访（无持久化语言）时界面按浏览器语言渲染为英文', async ({ page }) => {
  await page.goto('/chat');

  // 导航无障碍名称应为英文（zh 为「主导航」/ Main navigation 对应 en）
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  // <html lang> 应同步为 en（setLocale 会写入）
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // 左侧导航项文案为英文（zh 为「角色」）
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Characters' }),
  ).toBeVisible();
});
