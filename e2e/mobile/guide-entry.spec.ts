/**
 * E2E · guide 移动端入口（MOBILE_PLAN 批次 2-6 / DEV_PLAN A17）
 *
 * 判据：手机新用户 **≤3 步**到达任务中心。
 *
 * 这一项的原始方案是「把 `nav-model` 的 guide 项 `inMore` 置 true，让它进
 * 『更多』聚合页的卡片列表」。A12 实测发现那样做是错的：`MoreView` 顶部本来
 * 就有一张**专门的引导卡**（`.more-guide`，带"已完成 n/6 个任务"的实时进度），
 * 再进卡片列表会出现两个入口指向同一页（A12 的 `ux-guided-tasks` 直接报
 * strict mode violation：`[data-rel-jump="more-guide"]` 命中 2 个元素）。
 *
 * 所以这一项落地成**断言**而不是改代码：证明现有路径已经是 2 步，
 * 并把"为什么 inMore 保持 false"钉在测试里，避免下一个人再去"补"一次。
 */
import { test, expect } from '@playwright/test';

test.describe('A17 · guide 手机入口', () => {
  test('底栏「更多」→ 顶部引导卡 → 任务中心，2 步可达（判据 ≤3）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');
    await page.waitForSelector('#app-main > *');

    // 第 1 步：底栏「更多」
    await page.locator('.bottom-nav a[href="/more"]').click();
    await expect(page).toHaveURL(/\/more$/);

    // 引导卡在「更多」页顶部，带实时进度（不是列表里的一张普通卡片）
    const guideCard = page.locator('.more-guide');
    await expect(guideCard).toBeVisible();
    await expect(guideCard).toHaveAttribute('href', '/guide');
    await expect(guideCard.locator('.more-guide-progress')).toContainText('/6');

    // 第 2 步：点引导卡
    await guideCard.click();
    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.locator('.guided-title')).toBeVisible();
  });

  test('引导入口只有一处：聚合页卡片列表里不再重复出现（A12 回滚的理由）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/more');
    await page.waitForSelector('#app-main > *');

    // 顶部专用卡 1 个
    await expect(page.locator('[data-rel-jump="more-guide"]')).toHaveCount(1);
    // 卡片列表里没有第二个指向 /guide 的入口
    await expect(page.locator('.more-card[href="/guide"]')).toHaveCount(0);
  });
});
