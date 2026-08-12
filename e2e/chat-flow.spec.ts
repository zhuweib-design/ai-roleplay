import { test, expect } from '@playwright/test';

/**
 * E2E · 对话全流程 (F02)
 * 配置 API → 新建角色 → 选择角色 → 发送消息 → mock SSE 流式回复
 */

// OpenAI 兼容 SSE 流式响应
function sseBody(): string {
  const chunks = ['你好', '，旅人', '！欢迎来到', ' AI 酒馆'];
  return (
    chunks
      .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: c }, finish_reason: null }] })}`)
      .join('\n\n') +
    '\n\ndata: [DONE]\n'
  );
}

test('配置 API → 新建角色 → 对话流式回复', async ({ page }) => {
  const name = `E2E对话-${Date.now()}`;

  // Mock：拦截发送到本地 mock 端点的 chat completions
  await page.route('**/mock/v1/chat/completions', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
      body: sseBody(),
    });
  });

  // 1. 配置 API Profile
  await page.goto('/settings');
  // 设置页为分类侧边栏：API 配置位于"模型"分类，先切换再操作
  await page.getByRole('tab', { name: /模型/ }).click();
  await page.getByRole('button', { name: '新增 API 配置' }).click();
  await expect(page.getByRole('dialog', { name: '新增 API 配置' })).toBeVisible();
  await page.locator('#p-name').fill('E2E 模型');
  await page.locator('#p-baseurl').fill('http://localhost:5173/mock');
  await page.locator('#p-model').fill('gpt-4o');
  await page.locator('#p-apikey').fill('test-key');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByLabel('API 配置', { exact: true }).getByText('E2E 模型')).toBeVisible();
  // 激活该配置（若未自动激活）
  const activateBtn = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activateBtn.count()) {
    await activateBtn.first().click();
  }

  // 2. 新建角色
  await page.goto('/character');
  await page.getByRole('button', { name: '新建角色' }).click();
  await page.getByLabel('名称').fill(name);
  await page.locator('#f-desc').fill('E2E 对话测试角色。');
  await page.locator('.header-btn.save').click();
  await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();

  // 3. 进入对话页，选择角色
  await page.goto('/chat');
  await page.getByRole('button', { name: `选择角色 ${name}` }).click();

  // 4. 发送消息
  const input = page.getByLabel('输入消息');
  await expect(input).toBeEnabled();
  await input.fill('你好，介绍一下自己');
  await page.getByRole('button', { name: '发送消息' }).click();

  // 5. 断言助手流式回复
  const assistantBubble = page.locator('.msg-bubble.msg-assistant');
  await expect(assistantBubble).toBeVisible({ timeout: 15_000 });
  await expect(assistantBubble).toContainText('你好，旅人！欢迎来到 AI 酒馆');
  // 用户消息已上屏
  await expect(page.locator('.msg-bubble.msg-user')).toContainText('你好，介绍一下自己');
});
