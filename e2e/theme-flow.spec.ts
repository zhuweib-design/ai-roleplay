import { test, expect } from '@playwright/test';
import { THEME_PRESETS } from '../src/types';

/**
 * E2E · 主题系统 (F09)
 * 每款内置皮肤切换 + data-theme 生效 + radiogroup 键盘导航
 */
test('主题：切换全部内置皮肤并验证 data-theme 与键盘导航', async ({ page }) => {
  await page.goto('/settings');

  const group = page.getByRole('radiogroup', { name: '选择主题' });
  await expect(group).toBeVisible();

  /**
   * 清单取自 src/types 的 THEME_PRESETS（内置皮肤的唯一来源）。这里原先手写了一份八条的清单，
   * 靠下面"卡片总数 = 清单数 + custom"那条断言兜住漏改——M23-f 加第 9 款时它确实红了，
   * 但红法是"记得改两处"，不是"不需要改"。改成取同一来源后，新增皮肤这一条零改动。
   */
  const themes = [...THEME_PRESETS];

  // 逐个点击切换：aria-checked + data-theme 同步
  for (const value of themes) {
    const card = page.locator(`.theme-card[data-value="${value}"]`);
    await card.click();
    await expect(card).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  }

  // 卡片总数 = 内置皮肤 + custom：皮肤清单若还有别处手写而漏改，这里会露出来
  await expect(page.locator('.theme-card[data-value]')).toHaveCount(themes.length + 1);

  // radiogroup 键盘导航：聚焦暗夜剧场后按 ArrowLeft 回到 OLED（验证键盘导航即时响应）。
  // 顺带纠正本文件旧注释的一处错话：键盘切换**是**会写持久化的 —— 循环里最后点击的是清单
  // 末尾那款，而下面的刷新断言回来的仍是 OLED，只有"键盘那次切换落过盘"才解释得通。
  const theatre = page.locator('.theme-card[data-value="theatre"]');
  await theatre.focus();
  await expect(theatre).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.theme-card[data-value="oled"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled');

  // 刷新后主题保持：回到的应是**最后一次切换**（键盘那次）选中的 OLED，而不是循环末尾的皮肤
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled');
});
