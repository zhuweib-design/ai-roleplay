/**
 * N 层导航改造的移动端回归（设计文档 §3.2.4：群聊移出 DETAIL_ROUTES）
 *
 * 现状缺陷：/group 既不在底部 Tab、又属二级沉浸页（隐藏底栏），进入后成为单向门。
 */
import { test, expect } from '@playwright/test';

test.describe('移动端底栏', () => {
  test('群聊页保留底栏，且底栏 5 个入口不增不减（A12：群聊已升为 Tab）', async ({ page }) => {
    await page.goto('/group');

    const bottomNav = page.locator('.bottom-nav');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.locator('.bottom-nav-item')).toHaveCount(5);
    for (const path of ['/chat', '/character', '/group', '/more', '/settings']) {
      await expect(bottomNav.locator(`a[href="${path}"]`)).toBeVisible();
    }
    // 群聊升为 Tab 后仍保留在「更多」聚合页里（conversation 组含 group）——
    // 两处入口并存是有意的：Tab 是主路径，聚合页是「按组浏览」的完整清单
    await bottomNav.locator('a[href="/more"]').click();
    await expect(page.locator('.more-card[href="/group"]')).toBeVisible();
    // 市场与世界书退出 Tab 后必须能在「更多」里找到（A12 判据的反向验证）
    await expect(page.locator('.more-card[href="/community-market"]')).toBeVisible();
    await expect(page.locator('.more-card[href="/worldbook"]')).toBeVisible();
  });

  test('二级沉浸页仍然隐藏底栏（未把隐藏规则整体拆掉）', async ({ page }) => {
    await page.goto('/character/new');
    await expect(page.locator('.bottom-nav')).toHaveCount(0);
  });
});
