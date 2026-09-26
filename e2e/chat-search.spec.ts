import { test, expect } from '@playwright/test';

/**
 * E2E · 长对话全文搜索
 * 直接写入 IndexedDB 构造长历史，验证搜索不受当前虚拟化窗口限制。
 */
test('搜索未渲染的历史消息并跳转到目标', async ({ page }) => {
  const name = `E2E搜索-${Date.now()}`;
  const messages = Array.from({ length: 250 }, (_, index) => ({
    id: `search-m-${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: index === 12 ? '很早以前的目标历史消息' : `普通历史消息 ${index}`,
    timestamp: Date.now() + index,
  }));
  const card = {
    id: `e2e-search-${Date.now()}`,
    name,
    description: '全文搜索 E2E 角色',
    personality: '测试',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: ['e2e-search'],
    favorite: false,
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages,
  };

  await page.goto('/');
  await page.evaluate(async (value) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ai-roleplay', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('characters', 'readwrite');
    tx.objectStore('characters').put(value);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, card);

  await page.goto('/chat');
  await page.getByRole('button', { name: `选择角色 ${name}` }).click();
  await expect(page.locator('.msg-bubble')).toHaveCount(100);

  await page.getByRole('button', { name: '搜索对话消息' }).click();
  await page.locator('#chat-history-search').fill('目标历史');
  await expect(page.locator('#chat-search-status')).toContainText('0/1');
  await page.getByRole('button', { name: '下一个匹配' }).click();

  await expect(page.locator('#chat-search-status')).toContainText('1/1');
  await expect(page.locator('[data-message-id="search-m-12"]')).toBeVisible();
  await expect(page.locator('.message-search-active')).toHaveCount(1);
});
