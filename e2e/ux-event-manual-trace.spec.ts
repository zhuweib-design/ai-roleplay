/**
 * M6-f：在世界书事件面板里手工配一条事件，让它被注入（§七 #21 修好之后的现场）
 *
 * M6-d 那条 e2e 走的是"生成器 → 下一轮注入"；这条走的是**用户手配**这条路，
 * 并且顺带把两条之前没有浏览器证据的链路一起钉住：
 * 1. 世界书事件面板逐字段输入真的存得进去（改前是死路：三个必填互相顶回，
 *    输入框又是单向绑定，字看着还在、store 里是空的）；
 * 2. 事件由**关键词在同一轮触发并同一轮注入**（`scanAndApplyTriggers` 先应用触发
 *    再拼注入文本），与 M6-d 的"上一轮生成、下一轮注入"是两条不同的路径。
 *
 * 负向对照放在同一轮之前：先发一条不含关键词的消息，气泡不该有回显；
 * 再发含关键词的那条才有。夹具完全相同，只有消息文本不同。
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCharacter } from './helpers/seed-character';

const PROFILE_NAME = 'E2E 手配事件模型';
const LOREBOOK_ID = 'lb-e2e-manual';
const LOREBOOK_NAME = 'E2E 手配世界';
const EVENT_NAME = '断桥拦路';
const KEYWORD = '商队';

function chatSse(): string {
  return (
    `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: '桥那边过不去啦' }, finish_reason: null }] })}` +
    '\n\ndata: [DONE]\n'
  );
}

async function seedGlobalLorebook(page: Page): Promise<void> {
  await page.evaluate(
    async ({ id, name }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('lorebooks', 'readwrite');
        tx.objectStore('lorebooks').put({
          id,
          name,
          description: '',
          scope: 'global',
          active: true,
          entries: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: LOREBOOK_ID, name: LOREBOOK_NAME }
  );
}

async function waitProfileActivatedPersisted(page: Page, name: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (want) =>
            new Promise<string>((resolve, reject) => {
              const open = indexedDB.open('ai-roleplay');
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const db = open.result;
                const req = db.transaction('settings', 'readonly').objectStore('settings').get('app');
                req.onerror = () => {
                  db.close();
                  reject(req.error);
                };
                req.onsuccess = () => {
                  const rec = req.result as
                    | { apiProfiles?: Array<{ id: string; name: string }>; activeApiProfileId?: string | null }
                    | undefined;
                  const active = rec?.activeApiProfileId ?? null;
                  const named = rec?.apiProfiles?.find((p) => p.name === want)?.id ?? null;
                  db.close();
                  resolve(active !== null && active === named ? 'activated' : 'pending');
                };
              };
            }),
          name
        ),
      { timeout: 15_000 }
    )
    .toBe('activated');
}

async function configureMockProfile(page: Page): Promise<void> {
  await page.goto('/settings?cat=model');
  await page.getByRole('button', { name: '新增 API 配置' }).click();
  await page.locator('#p-name').fill(PROFILE_NAME);
  await page.locator('#p-baseurl').fill(`http://localhost:${process.env.E2E_PORT ?? '5173'}/mock`);
  await page.locator('#p-model').fill('gpt-4o');
  await page.locator('#p-apikey').fill('test-key');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByText(PROFILE_NAME).first()).toBeVisible();
  const activate = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activate.count()) await activate.first().click();
  await waitProfileActivatedPersisted(page, PROFILE_NAME);
}

async function send(page: Page, text: string): Promise<void> {
  const input = page.getByLabel('输入消息');
  await expect(input).toBeEnabled();
  await input.fill(text);
  await page.getByRole('button', { name: '发送消息' }).click();
}

test.describe('世界书手工配置的事件被注入（E11 第二条路径）', () => {
  test('逐字段配一条全局关键词事件，命中它的那一轮给出回显', async ({ page }) => {
    await page.route('**/mock/v1/chat/completions', (route) =>
      void route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
        body: chatSse(),
      })
    );

    await seedCharacter(page, { favorite: true });
    await page.goto('/chat');
    await configureMockProfile(page);
    await seedGlobalLorebook(page);
    await waitProfileActivatedPersisted(page, PROFILE_NAME);
    await page.reload();

    // ── 在世界书的事件面板里逐字段配（这条路径改前是死路）──
    await page.goto('/worldbook');
    await page.locator('.lorebook-item').filter({ hasText: LOREBOOK_NAME }).first().click();
    await page.locator('.add-event-btn').click();
    await page.locator('[id^="evt-name-"]').fill(EVENT_NAME);
    await page.locator('[id^="evt-desc-"]').fill('商队必经的木桥昨夜断了，只能绕行河滩。');
    await page.locator('[id^="evt-kw-"]').fill(KEYWORD);

    // 存进去了的证据：编辑器标题与列表项都用事件名渲染，改前这里永远是"未命名"
    await expect(page.locator('.event-editor-header h3')).toHaveText(EVENT_NAME);
    await expect(page.locator('.event-item').first()).toContainText(EVENT_NAME);
    // 概率默认 100，不改动它——要改的是"能不能存"，不是"多大概率"
    await expect(page.locator('[id^="evt-prob-"]')).toHaveValue('100');

    // ── 回对话：客户端跳转，事件表只在内存里 ──
    await page.locator('.nav-rail').getByRole('button', { name: '对话', exact: true }).click();
    await page.waitForTimeout(250);

    // 负向对照：不含关键词的这一轮不该有回显
    await send(page, '今晚酒馆开门吗');
    const miss = page.locator('.msg-turn').last();
    await expect(miss).toContainText('桥那边过不去啦', { timeout: 15_000 });
    await expect(miss.locator('.event-trace-toggle')).toHaveCount(0);

    // 命中关键词：同一轮触发并同一轮注入
    await send(page, `我听说那支${KEYWORD}迟到了`);
    const hit = page.locator('.msg-turn').last();
    await expect(hit).toContainText('桥那边过不去啦', { timeout: 15_000 });
    const toggle = hit.locator('.event-trace-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('1 条随机事件');

    await toggle.click();
    await expect(hit.locator('.event-trace-name')).toHaveText(EVENT_NAME);

    // 跳回随机事件模块并带来源
    await hit.locator('.event-trace-link').click();
    await expect(page).toHaveURL(/\/random-events\?from=\/chat$/);
  });
});
