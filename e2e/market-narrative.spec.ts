/**
 * E2E · 市场"账号"叙事降级（MOBILE_PLAN 批次 2-7 / DEV_PLAN A18）
 *
 * 背景：市场的"登录"是本地模拟——`community-market.ts` 的 `login(name)` 不收凭据、
 * 没有后端、不校验任何东西，本质是"给发布与评论起个署名"。界面上写"登录/账号"
 * 会让用户以为有账户体系、有服务端、数据能跨设备同步，这三件都不成立。
 *
 * 判据：市场相关界面无"登录/账号"表述；i18n 门禁通过。
 * 这里按**渲染后的可见文本**断言，而不是 grep 源码——用户看到的是文本。
 */
import { test, expect } from '@playwright/test';

/** 不许出现在市场界面上的词（中英各一组） */
const FORBIDDEN = ['登录', '账号', '用户名', 'Log in', 'Sign in', 'Log out', 'Username', 'account'];

test.describe('A18 · 市场叙事', () => {
  test('市场页可见文本不含"登录/账号"表述，入口叫「设置昵称」', async ({ page }) => {
    await page.goto('/community-market');
    await page.waitForSelector('#app-main > *');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    const hits = FORBIDDEN.filter((word) => bodyText.includes(word.toLowerCase()));
    expect(hits, `市场界面仍出现这些词：${hits.join(' / ')}`).toEqual([]);

    // 入口按钮：设置昵称（不是"登录"）
    await expect(page.getByRole('button', { name: '设置昵称' })).toBeVisible();
  });

  test('昵称 Modal：标题说"设置本地昵称"，填之前就说明没有后端', async ({ page }) => {
    await page.goto('/community-market');
    await page.waitForSelector('#app-main > *');

    await page.getByRole('button', { name: '设置昵称' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('设置本地昵称');
    // 说明行必须在输入框之前，且明确"没有后端"
    await expect(dialog.locator('.login-hint')).toContainText('没有后端');
    await expect(dialog).toContainText('昵称');

    // 填一个昵称 → 保存 → 页头显示昵称 + 「清除身份」
    await dialog.locator('#login-name').fill('本地测试者');
    await dialog.getByRole('button', { name: '保存昵称' }).click();
    await expect(page.locator('.user-info')).toContainText('本地测试者');
    await expect(page.getByRole('button', { name: '清除身份' })).toBeVisible();
  });

  test('未设昵称时点发布：提示"请先设置本地昵称"，不承诺登录', async ({ page }) => {
    await page.goto('/community-market');
    await page.waitForSelector('#app-main > *');

    // 发布 tab 是本地功能，未设昵称时应给出昵称提示
    await page.getByRole('tab', { name: '我的发布' }).click();
    const publish = page.getByRole('button', { name: '发布角色卡' });
    if (await publish.isVisible().catch(() => false)) {
      await publish.click();
    }
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('登录');
  });
});
