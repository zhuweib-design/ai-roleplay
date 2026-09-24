import { test, expect } from '@playwright/test';

function replyBody(): string {
  return 'data: ' + JSON.stringify({ choices: [{ delta: { content: '群聊真实回复' }, finish_reason: null }] }) +
    '\n\ndata: [DONE]\n';
}

test('两个角色群聊使用真实模型、独立 Runtime Context 与 Event', async ({ page }) => {
  const prefix = `群聊E2E-${Date.now()}`;
  const names = [`${prefix}-甲`, `${prefix}-乙`];
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  await page.route('**/mock/v1/chat/completions', (route) => {
    requests.push(route.request().postDataJSON());
    void route.fulfill({ status: 200, contentType: 'text/event-stream', body: replyBody() });
  });

  await page.goto('/settings');
  await page.getByRole('tab', { name: /模型/ }).click();
  await page.getByRole('button', { name: '新增 API 配置' }).click();
  await page.locator('#p-name').fill('群聊测试模型');
  await page.locator('#p-baseurl').fill(`http://localhost:${process.env.E2E_PORT ?? '5173'}/mock`);
  await page.locator('#p-model').fill('gpt-4o');
  await page.locator('#p-apikey').fill('test-key');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  const activate = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activate.count()) await activate.first().click();

  for (const name of names) {
    await page.goto('/character');
    await page.getByRole('button', { name: '新建角色' }).click();
    await page.getByLabel('名称').fill(name);
    await page.locator('#f-desc').fill(`${name}的私有设定`);
    await page.locator('.header-btn.save').click();
    await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();
  }

  await page.goto('/group');
  await page.getByRole('button', { name: '新建群聊' }).click();
  const dialog = page.getByRole('dialog', { name: '创建群聊' });
  await dialog.locator('#new-group-name').fill('测试双角色群');
  for (const name of names) await dialog.locator('.char-pick').filter({ hasText: name }).click();
  await dialog.getByRole('button', { name: '创建', exact: true }).click();

  const input = page.getByLabel('消息输入');
  await input.fill('第一轮讨论');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.locator('.msg-assistant .msg-content').last()).toHaveText('群聊真实回复');
  expect(requests).toHaveLength(1);
  const firstContext = requests[0]!.messages.find((message) =>
    message.role === 'system' && message.content.includes('[Virtual Character Runtime State]')
  );
  expect(firstContext).toBeDefined();
  const firstSpeaker = names.find((name) => firstContext!.content.includes(`Identity: ${name}`));
  expect(firstSpeaker).toBeDefined();
  expect(firstContext!.content).not.toContain(`${names.find((name) => name !== firstSpeaker)}的私有设定`);

  await input.fill('第二轮讨论');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.locator('.msg-assistant .msg-content')).toHaveCount(2);
  await expect.poll(() => requests.length).toBe(2);
  const secondContext = requests[1]!.messages.find((message) =>
    message.role === 'system' && message.content.includes('[Virtual Character Runtime State]')
  );
  expect(secondContext).toBeDefined();
  expect(secondContext!.content).toContain('group_observation');
  expect(secondContext!.content).toContain(names.find((name) => name !== firstSpeaker));
  expect(secondContext!.content).not.toContain(`${firstSpeaker}的私有设定`);
  expect(requests[1]!.messages.some((message) => message.content.includes('群聊真实回复'))).toBe(true);

  await page.getByRole('radio', { name: '指定发言' }).click();
  await input.fill(`@${names[0]}`);
  await page.locator('.mention-item').filter({ hasText: names[0]! }).click();
  await input.fill(`@${names[0]} 第三轮讨论`);
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(page.locator('.msg-assistant .msg-content')).toHaveCount(3);
  await expect(page.locator('.msg-assistant .msg-sender').last()).toHaveText(names[0]!);
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open('ai-roleplay');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onerror = () => { db.close(); reject(req.error); };
      req.onsuccess = () => {
        const snapshots = req.result as Array<{ value?: { events?: Array<{ payload?: { userMessage?: string } }> } }>;
        const count = snapshots.filter(({ value }) => value?.events?.some((event) =>
          event.payload?.userMessage === '第一轮讨论' || event.payload?.userMessage === '第二轮讨论'
        )).length;
        db.close();
        resolve(count);
      };
    };
  })), { timeout: 10_000 }).toBe(2);
});

// 中止生成：请求保持挂起时提供停止入口，中止后回到可发送状态且不提交公共回合
test('群聊生成中可中止，且中止后不提交公共回合与旁听事件', async ({ page }) => {
  const prefix = `群聊中止-${Date.now()}`;
  const names = [`${prefix}-甲`, `${prefix}-乙`];
  let requestCount = 0;

  // 关键：请求保持挂起，让生成停留在进行中，从而真实触发停止按钮。
  // 不调用 route.fulfill，浏览器端 fetch 一直 pending，直到 abort() 中止。
  await page.route('**/mock/v1/chat/completions', () => {
    requestCount += 1;
  });

  await page.goto('/settings');
  await page.getByRole('tab', { name: /模型/ }).click();
  await page.getByRole('button', { name: '新增 API 配置' }).click();
  await page.locator('#p-name').fill('中止测试模型');
  await page.locator('#p-baseurl').fill(`http://localhost:${process.env.E2E_PORT ?? '5173'}/mock`);
  await page.locator('#p-model').fill('gpt-4o');
  await page.locator('#p-apikey').fill('test-key');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  const activate = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activate.count()) await activate.first().click();

  for (const name of names) {
    await page.goto('/character');
    await page.getByRole('button', { name: '新建角色' }).click();
    await page.getByLabel('名称').fill(name);
    await page.locator('#f-desc').fill(`${name}的私有设定`);
    await page.locator('.header-btn.save').click();
    await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();
  }

  await page.goto('/group');
  await page.getByRole('button', { name: '新建群聊' }).click();
  const dialog = page.getByRole('dialog', { name: '创建群聊' });
  await dialog.locator('#new-group-name').fill('中止测试群');
  for (const name of names) await dialog.locator('.char-pick').filter({ hasText: name }).click();
  await dialog.getByRole('button', { name: '创建', exact: true }).click();

  const input = page.getByLabel('消息输入');
  await input.fill('这轮将被中止');
  await page.getByRole('button', { name: '发送消息' }).click();

  // 生成挂起中：发送按钮必须切换为停止按钮
  const stopButton = page.getByRole('button', { name: '停止生成' });
  await expect(stopButton).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: '发送消息' })).toHaveCount(0);
  // Runtime 初始化先于模型请求；等待请求真正发出，确保中止的是进行中的生成
  await expect.poll(() => requestCount, { timeout: 10_000 }).toBe(1);

  // 中止：必须回到可发送状态
  await stopButton.click();
  await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);

  // 中止后不得提交公共回合，也不得投递任何成员旁听事件
  const eventCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open('ai-roleplay');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      req.onerror = () => { db.close(); reject(req.error); };
      req.onsuccess = () => {
        const snapshots = req.result as Array<{
          key?: string;
          value?: { events?: Array<{ payload?: { userMessage?: string } }> };
        }>;
        const count = snapshots.filter((record) =>
          record.key?.startsWith('virtual-character-runtime:') &&
          record.value?.events?.some((event) => event.payload?.userMessage === '这轮将被中止')
        ).length;
        db.close();
        resolve(count);
      };
    };
  }));
  expect(eventCount).toBe(0);
});
