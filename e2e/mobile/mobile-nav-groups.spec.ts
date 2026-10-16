/**
 * N 层导航改造的移动端回归（设计文档 §3.2.4：群聊移出 DETAIL_ROUTES）
 *
 * 现状缺陷：/group 既不在底部 Tab、又属二级沉浸页（隐藏底栏），进入后成为单向门。
 */
import { test, expect } from '@playwright/test';

test.describe('移动端底栏', () => {
  test('群聊页保留底栏，且底栏 6 个入口不增不减', async ({ page }) => {
    await page.goto('/group');

    const bottomNav = page.locator('.bottom-nav');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.locator('.bottom-nav-item')).toHaveCount(6);
    for (const path of ['/chat', '/character', '/community-market', '/worldbook', '/more', '/settings']) {
      await expect(bottomNav.locator(`a[href="${path}"]`)).toBeVisible();
    }
    // 单聊/群聊之间可从"更多"聚合页互跳（conversation 组含 group）
    await bottomNav.locator('a[href="/more"]').click();
    await expect(page.locator('.more-card[href="/group"]')).toBeVisible();
  });

  test('二级沉浸页仍然隐藏底栏（未把隐藏规则整体拆掉）', async ({ page }) => {
    await page.goto('/character/new');
    await expect(page.locator('.bottom-nav')).toHaveCount(0);
  });
});
