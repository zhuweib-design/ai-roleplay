import { test, expect } from '@playwright/test';

/**
 * E2E · 移动端布局与抽屉层级（P1-6）
 *
 * 仅在移动视口 project（`mobile-msedge` / `mobile-chromium`，`devices['Pixel 5']`）下运行，
 * 由 `playwright.config.ts` 的 `testMatch: '**\/mobile/**\/*.spec.ts'` 限定到本目录。
 *
 * 覆盖此前零自动化的移动端专属行为，对应缺陷项验收标准：
 * - S-1 / I-4：≤640 下 NavRail 真卸载、BottomNav（6 主入口含"更多"）唯一高亮
 * - S-4：抽屉打开时遮罩层级 抽屉(70) > 遮罩(60) > 底部导航(40)，且底部导航区域点击被拦截
 * - S-6 / I-13：抽屉形态在 ≤1024 生效（Pixel 5 落在 ≤640 档）
 * - 640 边界：主流程无横向溢出
 *
 * 用例文案依赖 zh 语言（`storageState` 预置 onboarding 完成，首访默认中文）。
 */

/** 底部导航 6 个主入口（D-11：新增"更多"聚合页；路径取自 src/router/index.ts） */
const MAIN_TABS: Array<{ label: string; path: string }> = [
  { label: '会话', path: '/chat' },
  { label: '角色', path: '/character' },
  { label: '市场', path: '/community-market' },
  { label: '世界书', path: '/worldbook' },
  { label: '更多', path: '/more' },
  { label: '设置', path: '/settings' },
];

/** 读取元素计算后的 z-index（无值按 0 计） */
async function zIndexOf(page: import('@playwright/test').Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return NaN;
    return Number(getComputedStyle(el).zIndex) || 0;
  }, selector);
}

test.describe('移动端（≤640px）', () => {
  test('底部导航：可见、NavRail 卸载、5 个 tab 可切换且高亮唯一', async ({ page }) => {
    await page.goto('/chat');

    const bottomNav = page.locator('nav.bottom-nav');
    await expect(bottomNav).toBeVisible();

    // S-1：≤640 下 NavRail 由 v-if 真卸载，而非仅 CSS 隐藏
    await expect(page.locator('.nav-rail-desktop')).toHaveCount(0);

    // 5 个主 tab 全部可达
    const items = bottomNav.locator('.bottom-nav-item');
    await expect(items).toHaveCount(6);
    for (const t of MAIN_TABS) {
      await expect(bottomNav.locator(`a[href="${t.path}"]`)).toBeVisible();
    }

    // 逐个切换：URL 迁移 + 高亮（.active / aria-current）随之唯一迁移
    for (const t of MAIN_TABS) {
      const link = bottomNav.locator(`a[href="${t.path}"]`);
      await link.click();

      await expect(page).toHaveURL(new RegExp(`${t.path.replace(/\//g, '\\/')}$`));
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(link).toHaveClass(/\bactive\b/);
      // 同一时刻只允许一个 tab 高亮（I-4 双高亮回归防线）
      await expect(bottomNav.locator('.bottom-nav-item[aria-current="page"]')).toHaveCount(1);
    }
  });

  test('抽屉打开时遮罩层级正确，点击底部导航区域被拦截（S-4）', async ({ page }) => {
    await page.goto('/chat');

    const bottomNav = page.locator('nav.bottom-nav');
    await expect(bottomNav).toBeVisible();

    // 打开角色列表抽屉（ChatMain 顶栏 hamburger，label 见 i18n chat.openCharList）
    await page.locator('.mobile-menu-btn[aria-label="打开角色列表"]').click();

    const mask = page.locator('.overlay-mask');
    const drawer = page.locator('.character-list');
    await expect(mask).toHaveClass(/\bactive\b/);
    await expect(drawer).toHaveClass(/\bactive\b/);

    // 等抽屉滑入动画收敛（transform 归零），否则命中测试会拿到动画中间态
    await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

    // 层级：抽屉(70) > 遮罩(60) > 底部导航(40)
    const zDrawer = await zIndexOf(page, '.character-list');
    const zMask = await zIndexOf(page, '.overlay-mask');
    const zNav = await zIndexOf(page, '.bottom-nav');
    expect(zMask).toBeGreaterThan(zNav);
    expect(zDrawer).toBeGreaterThan(zMask);

    const box = await bottomNav.boundingBox();
    expect(box, '底部导航应有可点击区域').not.toBeNull();

    // 探测点取最右侧 tab（设置）中心：在左抽屉 280px 宽度之外，但仍落在底部导航上。
    // 抽屉(z70) 合法地压在底部导航左段之上，故必须避开它才能验证「遮罩拦截」。
    const probe = { x: box!.x + box!.width * 0.9, y: box!.y + box!.height / 2 };

    // 命中测试：该点最上层元素须为遮罩 —— 即底部导航在此处被遮罩变暗且不可点
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? `${el.tagName}.${el.className}` : 'null';
      },
      probe,
    );
    expect(hit).toContain('overlay-mask');

    // 点击该点：遮罩消费点击并关闭抽屉，且不发生路由跳转
    const urlBefore = page.url();
    await page.mouse.click(probe.x, probe.y);

    await expect(mask).not.toHaveClass(/\bactive\b/);
    await expect(drawer).not.toHaveClass(/\bactive\b/);
    expect(page.url()).toBe(urlBefore);
  });

  test('主流程 5 个 tab 页无横向溢出', async ({ page }) => {
    for (const t of MAIN_TABS) {
      await page.goto(t.path);
      await expect(page.locator('nav.bottom-nav')).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // 允许 1px 亚像素误差
      expect(overflow, `${t.path} 出现横向溢出 ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
