import { test, expect } from '@playwright/test';

/**
 * E2E · 主题系统 (F09)
 * 5 主题切换 + data-theme 生效 + radiogroup 键盘导航
 */
test('主题：切换全部 5 主题并验证 data-theme 与键盘导航', async ({ page }) => {
  await page.goto('/settings');

  const group = page.getByRole('radiogroup', { name: '选择主题' });
  await expect(group).toBeVisible();

  const themes: Array<{ value: string; label: string }> = [
    { value: 'dark', label: '深色' },
    { value: 'light', label: '亮色' },
    { value: 'midnight', label: '午夜蓝' },
    { value: 'oled', label: 'OLED 黑' },
    { value: 'theatre', label: '暗夜剧场' },
  ];

  // 逐个点击切换：aria-checked + data-theme 同步
  for (const t of themes) {
    const card = page.locator(`.theme-card[data-value="${t.value}"]`);
    await card.click();
    await expect(card).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', t.value);
  }

  // radiogroup 键盘导航：聚焦暗夜剧场后按 ArrowLeft 回到 OLED
  const theatre = page.locator('.theme-card[data-value="theatre"]');
  await theatre.focus();
  await expect(theatre).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.theme-card[data-value="oled"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled');

  // 刷新后主题保持（持久化）
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled');
});
