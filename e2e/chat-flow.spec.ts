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
  const outgoingRequests: Array<{ messages: Array<{ role: string; content: string }> }> = [];

  // Mock：拦截发送到本地 mock 端点的 chat completions
  await page.route('**/mock/v1/chat/completions', (route) => {
    outgoingRequests.push(route.request().postDataJSON());
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
  await page.locator('#p-baseurl').fill(`http://localhost:${process.env.E2E_PORT ?? '5173'}/mock`);
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
  await page.getByRole('button', { name: '完整表单' }).click(); // 新建角色默认落在快速档；这些用例走完整表单，先切档再填字段
  await page.getByLabel('名称').fill(name);
  await page.locator('#f-desc').fill('E2E 对话测试角色。');
  await page.locator('.header-btn.save').click();
  await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();

  // 3. 进入对话页，选择角色
  await page.goto('/chat');
  // 移动视口（≤640px）下角色列表收在抽屉中，需先展开；桌面端不渲染该按钮。
  // 用视口宽度判断而非 DOM 探测，避免组件挂载前的时序竞态。
  const isNarrow = (page.viewportSize()?.width ?? 1280) <= 640;
  if (isNarrow) {
    await page.getByRole('button', { name: '打开角色列表' }).click();
  }
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
  expect(outgoingRequests).toHaveLength(1);
  const runtimeSystemMessage = outgoingRequests[0]!.messages.find((message) =>
    message.role === 'system' && message.content.includes('[Virtual Character Runtime State]')
  );
  expect(runtimeSystemMessage?.content).toContain(name);

  // 等待异步 Runtime Event 持久化，再验证下一轮上下文确实包含上一轮事实。
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve, reject) => {
    const open = indexedDB.open('ai-roleplay');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const snapshots = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      snapshots.onerror = () => { db.close(); reject(snapshots.error); };
      snapshots.onsuccess = () => {
        const records = snapshots.result as Array<{
          key: string;
          value?: { events?: Array<{ payload?: { userMessage?: string; assistantMessage?: string } }> };
        }>;
        const found = records.some((record) =>
          record.key.startsWith('virtual-character-runtime:') &&
          record.value?.events?.some((event) =>
            event.payload?.userMessage === '你好，介绍一下自己' &&
            event.payload?.assistantMessage === '你好，旅人！欢迎来到 AI 酒馆'
          )
        );
        db.close();
        resolve(Boolean(found));
      };
    };
  })), { timeout: 10_000 }).toBe(true);

  await input.fill('请记住刚才的对话');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect.poll(() => outgoingRequests.length).toBe(2);
  const secondSystemMessage = outgoingRequests[1]!.messages.find((message) =>
    message.role === 'system' && message.content.includes('[Virtual Character Runtime State]')
  );
  expect(secondSystemMessage?.content).toContain('Recent events: conversation_turn');
  expect(secondSystemMessage?.content).toContain('你好，介绍一下自己');
});
