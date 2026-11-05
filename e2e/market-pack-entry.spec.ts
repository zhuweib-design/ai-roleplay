import { test, expect } from '@playwright/test';

/**
 * E2E · 空库的可选下载包入口（Q2）
 *
 * 产品口径：安装包与首启不带任何角色，内置角色包改为「可选下载包」。
 * 这条用例验证用户真的能从空的角色列表走进去，而不是只在单测里 emit 了事件：
 * 空库 → 入口可见 → 点击落到社区市场，且远程市场面板在场（角色包就在那里下载）。
 *
 * 不点「加载远程市场」：那一步要连 GitHub raw，网络在 CI 上是外部变量；
 * 目录完整性与真实安装链路分别由 `tests/core/market-catalog.test.ts` 与
 * `tests/stores/community-market-install-real-card.test.ts` 覆盖。
 */
test('空角色库 → 可选下载包入口 → 社区市场', async ({ page }) => {
  await page.goto('/character');

  await expect(page.getByText('还没有角色').first()).toBeVisible();
  const entry = page.locator('[data-rel-jump="characters-market-pack"]');
  await expect(entry).toBeVisible();
  await expect(entry).toHaveText('从社区市场下载角色包');

  await entry.click();
  await expect(page).toHaveURL(/\/community-market$/);
  await expect(page.locator('.remote-title')).toBeVisible();
});
