import { test, expect } from '@playwright/test';

/**
 * E2E · 切换供应商时的预填（C-01 零配置首聊的第一步）
 *
 * 为什么要有浏览器这一层：纯函数测的是"该不该换"，测不到表单有没有真的调它、
 * `lastProvider` 有没有在新建/编辑时被正确重置。这里的判据全是输入框里的实际值。
 *
 * 现场缺陷（修前）：新建配置初值是 OpenAI，切到 Anthropic 后端点仍是 api.openai.com、
 * 模型仍是 gpt-4o，点"测试连接"必然失败，而界面上看不出是没跟着切。
 */

test.describe('模型配置：供应商预填', () => {
  test('切到 Anthropic 后端点与模型都跟着换，手填的端点不被覆盖', async ({ page }) => {
    await page.goto('/settings?cat=model');
    await expect(page.locator('.settings-nav-item.active')).toContainText('模型');

    await page.getByRole('button', { name: '新增 API 配置' }).click();
    const provider = page.locator('#p-provider');
    const baseUrl = page.locator('#p-baseurl');
    const model = page.locator('#p-model');

    // 初值：OpenAI
    await expect(baseUrl).toHaveValue('https://api.openai.com');
    await expect(model).toHaveValue('gpt-4o');

    // 切到 Anthropic：两个都跟着换
    await provider.selectOption('anthropic');
    await expect(baseUrl, '端点没跟着切：切完还在打 OpenAI 的地址').toHaveValue('https://api.anthropic.com');
    await expect(model, '模型没跟着切：Anthropic 端点配 gpt-4o 必然 404').toHaveValue('claude-sonnet-4-5');

    // 手填端点后再切：自建反代不能被默认值覆盖
    await baseUrl.fill('https://my-proxy.example/v1');
    await provider.selectOption('deepseek');
    await expect(baseUrl, '手填的端点被默认值覆盖了').toHaveValue('https://my-proxy.example/v1');
    // 模型没动过，仍然跟着换
    await expect(model).toHaveValue('deepseek-chat');

    await page.getByRole('button', { name: '取消' }).click();
  });

  test('切到「自定义」时清掉上一家的默认端点（不留一个假的已填值）', async ({ page }) => {
    await page.goto('/settings?cat=model');
    await page.getByRole('button', { name: '新增 API 配置' }).click();

    const baseUrl = page.locator('#p-baseurl');
    await page.locator('#p-provider').selectOption('anthropic');
    await expect(baseUrl).toHaveValue('https://api.anthropic.com');
    await page.locator('#p-provider').selectOption('custom');
    await expect(baseUrl).toHaveValue('');

    await page.getByRole('button', { name: '取消' }).click();
  });
});
