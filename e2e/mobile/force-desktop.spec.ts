/**
 * E2E · 强制桌面档（MOBILE_PLAN 批次 2-5 / DEV_PLAN A16）
 *
 * `?forceDesktop=1` 把 viewportMode 钉成 desktop ⇒ `isMobile` 为 false ⇒
 * `App.vue` 的 `showBottomNav` 不渲染底部导航、NavRail 接管。
 *
 * **边界（重要，别误读这个开关）**：它切的是**运行时判定**（导航选型、抽屉、
 * 焦点、store 的 togglePanel 分支），**不切 CSS 断点**。样式里的 `@media
 * (max-width: 640px)` 仍然按真实宽度生效，所以 390 宽下强制桌面会看到
 * "判定是桌面、视觉按窄屏"的混合态——页面主体会被窄屏规则隐藏。
 * 因此这里的断言只覆盖判定的可观测后果（导航谁在谁不在），
 * 不去断言"390 宽下长得像桌面"——那需要属性驱动的整套 CSS，不在本项范围。
 */
import { test, expect } from '@playwright/test';

test.describe('A16 · 强制桌面档', () => {
  test('390 宽 + ?forceDesktop=1：底栏不渲染，桌面侧栏接管', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat?forceDesktop=1');
    // 等挂载即可，不等可见：窄屏下主体被 CSS 窄屏规则隐藏是预期内的（见文件头）
    await page.waitForSelector('#app-main', { state: 'attached' });

    await expect(page.locator('.bottom-nav')).toHaveCount(0);
    await expect(page.locator('.nav-rail-desktop')).toHaveCount(1);
    // 主内容不能再带"为底栏留白"的类（否则底部会空一条）
    await expect(page.locator('#app-main')).not.toHaveClass(/has-mobile-nav/);
  });

  test('?forceDesktop=0 解除后回到移动档（底栏 5 个入口回来）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat?forceDesktop=1');
    await page.waitForSelector('#app-main', { state: 'attached' });
    await expect(page.locator('.bottom-nav')).toHaveCount(0);

    // 解除：localStorage 里的开关被清掉，回到按宽度的真实判定
    await page.goto('/chat?forceDesktop=0');
    await page.waitForSelector('.bottom-nav');
    await expect(page.locator('.bottom-nav')).toHaveCount(1);
    await expect(page.locator('.bottom-nav-item')).toHaveCount(5);
    await expect(page.locator('.nav-rail-desktop')).toHaveCount(0);
  });

  test('开关跨路由保留（导航会丢 query，不能丢开关）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat?forceDesktop=1');
    await page.waitForSelector('#app-main', { state: 'attached' });

    // 直接落到另一个路由且**不带** ?forceDesktop：模块加载时只能靠持久化恢复。
    // 不用点侧栏链接——390 宽下侧栏被窄屏 CSS 隐藏，点不到（见文件头的边界说明）。
    await page.goto('/settings');
    await page.waitForSelector('#app-main', { state: 'attached' });
    await expect(page.locator('.bottom-nav'), '跨路由后开关丢了，底栏又冒出来').toHaveCount(0);
    await expect(page.locator('.nav-rail-desktop')).toHaveCount(1);
  });
});
