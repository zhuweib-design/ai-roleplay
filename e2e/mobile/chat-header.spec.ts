/**
 * E2E · 单聊页头去分段控件（MOBILE_PLAN 批次 2-4 / DEV_PLAN A15）
 *
 * 现状（批次 2-4 之前，390 宽实测）：页头一行塞了 菜单按钮 26 + 角色名 62 +
 * 单聊⇄群聊分段控件 146 + 动作组，角色名被压到 28px——只剩两三个字。
 *
 * 处置：**手机档不挂分段控件**。A12 把群聊升成底部 Tab 之后，这条切换在手机上
 * 就是"底栏那个「群聊」Tab"，而它自己占 146px。桌面没有底栏，切换仍然需要，
 * 所以按端分流而不是删组件。
 *
 * 判据：`.chat-title` ≥200px（MOBILE_PLAN §8 2-4）。
 */
import { test, expect, type Page } from '@playwright/test';

async function titleBox(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.chat-title');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  });
}

test.describe('A15 · 单聊页头', () => {
  test('390 宽：角色名拿到剩余宽度（.chat-title ≥200px），分段控件不挂', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');
    await page.waitForSelector('#app-main > *');
    await expect(page.locator('.chat-title')).toBeVisible();

    const box = await titleBox(page);
    expect(box, '量不到 .chat-title').not.toBeNull();
    expect(
      box!.width,
      `标题区只有 ${box!.width}px（判据 ≥200）：分段控件还在抢宽度`
    ).toBeGreaterThanOrEqual(200);

    // 手机档不挂分段控件——底栏「群聊」Tab 就是那条通道
    await expect(page.locator('.chat-mode-switch-slot')).toHaveCount(0);
    // 页头仍然单行（56px），没有因为去控件而换行撑高
    const header = await page.locator('.chat-header').boundingBox();
    expect(Math.round(header?.height ?? 0), '页头被撑高了').toBeLessThanOrEqual(60);
  });

  test('桌面 1280：分段控件仍在（没有底栏，切换需要它）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/chat');
    await page.waitForSelector('#app-main > *');

    await expect(page.locator('.chat-mode-switch-slot')).toHaveCount(1);
    const box = await titleBox(page);
    expect(box!.width, '桌面标题区不该比手机档还窄').toBeGreaterThanOrEqual(200);
  });
});
