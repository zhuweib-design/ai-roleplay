/**
 * M2-b3：世界书注入痕迹（E02）的浏览器级证据
 *
 * 链路是真实的：mock SSE 模型 + IndexedDB 造一本全局常驻条目的世界书 + 真发一条消息，
 * 断言"本轮注入 N 条设定"确实出现、能跳回来源书、刷新后仍在（持久化生效）。
 */
import { test, expect, type Page } from '@playwright/test';

function sseBody(): string {
  const chunks = ['你好', '，旅人', '！'];
  return (
    chunks
      .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: c }, finish_reason: null }] })}`)
      .join('\n\n') + '\n\ndata: [DONE]\n'
  );
}

/** 造一本带"常驻"条目的全局世界书（strategy='constant' ⇒ 每轮必然注入，不依赖关键词命中） */
async function seedGlobalLorebook(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ai-roleplay');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lorebooks', 'readwrite');
      const store = tx.objectStore('lorebooks');
      store.put({
        id: 'lb-e2e-trace',
        name: 'E2E 痕迹世界',
        description: '',
        scope: 'global',
        active: true,
        entries: [
          {
            id: 'e2e-entry-const',
            title: '永恒酒馆',
            keys: [],
            content: '酒馆永远亮着灯。',
            enabled: true,
            strategy: 'constant',
            insertionOrder: 0,
            insertionPosition: 'beforeCharDefs',
            depth: 4,
            group: '',
            logic: 'AND_ANY',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

async function configureMockProfile(page: Page): Promise<void> {
  await page.goto('/settings?cat=model');
  await expect(page.locator('.settings-nav-item.active')).toContainText('模型');
  await page.getByRole('button', { name: '新增 API 配置' }).click();
  await page.locator('#p-name').fill('E2E 痕迹模型');
  await page.locator('#p-baseurl').fill(`http://localhost:${process.env.E2E_PORT ?? '5173'}/mock`);
  await page.locator('#p-model').fill('gpt-4o');
  await page.locator('#p-apikey').fill('test-key');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByText('E2E 痕迹模型').first()).toBeVisible();
  const activate = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activate.count()) await activate.first().click();
}

test.describe('注入痕迹（E02）', () => {
  test('常驻条目被注入时，回复下方出现可核对的痕迹，并能跳回来源世界书', async ({ page }) => {
    await page.route('**/mock/v1/chat/completions', (route) =>
      void route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
        body: sseBody(),
      })
    );

    await page.goto('/chat');
    await configureMockProfile(page);
    await page.goto('/chat');
    await seedGlobalLorebook(page);
    await page.reload();

    // 世界书芯片应转就绪（同一判定源，两条断言互相印证）
    await expect(page.locator('[data-rel-jump="readiness-worldbook"]')).toHaveClass(/is-ready/);

    const input = page.getByLabel('输入消息');
    await expect(input).toBeEnabled();
    await input.fill('今晚酒馆开门吗');
    await page.getByRole('button', { name: '发送消息' }).click();

    const bubble = page.locator('.msg-bubble.msg-assistant').last();
    await expect(bubble).toContainText('你好，旅人！', { timeout: 15_000 });

    const toggle = bubble.locator('.trace-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('1 条设定');

    await toggle.click();
    await expect(bubble.locator('.trace-entry')).toHaveText('永恒酒馆');
    await expect(bubble.locator('.trace-link')).toHaveText('E2E 痕迹世界');

    await bubble.locator('.trace-link').click();
    await expect(page).toHaveURL(/\/worldbook\?from=\/chat$/);

    // 痕迹随消息持久化：先证明它真的写进了 IndexedDB（而非只活在内存），再验证回读
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<boolean>((resolve, reject) => {
                const open = indexedDB.open('ai-roleplay');
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                  const db = open.result;
                  const req = db.transaction('chats', 'readonly').objectStore('chats').getAll();
                  req.onerror = () => {
                    db.close();
                    reject(req.error);
                  };
                  req.onsuccess = () => {
                    const chats = req.result as Array<{ messages?: Array<{ promptTrace?: unknown[] }> }>;
                    const found = chats.some((chat) =>
                      (chat.messages ?? []).some((m) => (m.promptTrace?.length ?? 0) > 0)
                    );
                    db.close();
                    resolve(found);
                  };
                };
              })
          ),
        { timeout: 15_000 }
      )
      .toBe(true);

    // 回读：刷新后不需要任何手动操作，最近一段会话自己接回（D-Q 的行为定义）
    await page.goBack();
    await expect(page).toHaveURL(/\/chat/);
    await page.reload();

    const restored = page.locator('.msg-bubble.msg-assistant').last();
    await expect(restored).toContainText('你好，旅人！', { timeout: 15_000 });
    const persisted = restored.locator('.trace-toggle');
    await expect(persisted).toBeVisible();
    await expect(persisted).toContainText('1 条设定');
    // 接回的是"当前会话"，会话行必须同步高亮（否则用户看到的是无源的历史）
    await expect(page.locator('.conv-row.active')).toBeVisible();
  });
});
