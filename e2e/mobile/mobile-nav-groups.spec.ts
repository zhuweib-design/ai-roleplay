/**
 * 移动端底栏在群聊页与二级页的在场性
 *
 * 演进：A12（2-1）把群聊从"既不在 Tab、又属沉浸页"的单向门里救出来并升为 Tab；
 * A13（2-2）把剩下的 8 个二级视图也一并恢复——底栏在移动端恒在，不再有"沉浸页"例外。
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

  test('二级页也保留底栏（A13 之后不再有"沉浸页"例外）', async ({ page }) => {
    await page.goto('/character/new');
    // A13 之前这里断言 toHaveCount(0)：底栏被"二级沉浸页"规则摘掉。
    // 现在反过来——底栏恒在，归属感由高亮表达（编辑器亮「角色」）。
    // 全量 8 个视图的遍历在 e2e/mobile/detail-nav.spec.ts
    await expect(page.locator('.bottom-nav')).toHaveCount(1);
    await expect(page.locator('.bottom-nav-item.active')).toContainText('角色');
  });
});
