/**
 * E2E · 群聊深链 `?group=`（M15-d）
 *
 * 只跑 msedge：用例直接往 IndexedDB 写群记录，而 M2-b9 实测过同一 webkit 进程内多个
 * context 共享存储目录（前一个用例的落盘会盖掉后一个），与 e2e/ux-gap-visibility.spec.ts
 * 顶部记的同一件事，这里不再踩一遍。
 *
 * 三个覆盖面各对应一条真实主张：
 * 1. 归档页「前往群聊」把目标写进 URL —— 不是"跳过去之后再命令式选中"那种只活在内存里的做法；
 * 2. 刷新后仍在同一个群（地址栏带得住目标，才是可分享、可回退的链接）；
 * 3. 指向不存在的群时明确说"群聊不存在"，而不是悄悄打开另一个群。
 *
 * 造数用两个群且**让深链指向较旧的那个**：列表按 updatedAt 倒序，读库时序一旦没等住，
 * 表现就是落在最新的群上——那样这条用例才会红（负向对照见 tests/views/deep-link-group-query.test.ts）。
 */
import { test, expect, type Page } from '@playwright/test';

const NEWER_ID = 'e2e-grp-newer';
const TARGET_ID = 'e2e-grp-target';

async function dismissWelcomeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
}

/** 直接写 IndexedDB 造两个群；target 的 updatedAt 更旧 ⇒ 不是"自动选中第一条"会选中的那个 */
async function seedGroups(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ newerId, targetId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('groups', 'readwrite');
      const store = tx.objectStore('groups');
      const put = (id: string, name: string, updatedAt: string) =>
        store.put({
          id,
          name,
          description: '',
          members: [],
          firstMessage: '',
          messages: [
            {
              id: `${id}-m1`,
              role: 'user',
              content: `来自 ${name} 的一条消息`,
              characterId: null,
              characterName: null,
              timestamp: updatedAt,
            },
          ],
          mode: 'rotate',
          lastSpeakerId: null,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt,
          lifecycleStatus: 'active',
        });
      put(newerId, 'E2E 较新的群', '2026-10-09T00:00:00.000Z');
      put(targetId, 'E2E 深链目标群', '2026-10-02T00:00:00.000Z');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { newerId: NEWER_ID, targetId: TARGET_ID }
  );
}

async function currentGroupName(page: Page): Promise<string> {
  // 群列表里 aria-current="true" 的那一项就是界面正在显示的那个群
  return (await page.locator('.group-item[aria-current="true"]').innerText()).trim();
}

test.describe('群聊深链 ?group=', () => {
  test.beforeEach(async ({ page }) => {
    await seedGroups(page);
  });

  test('归档页「前往群聊」把目标写进 URL，并且落在那个群', async ({ page }) => {
    await page.goto('/archives');
    await dismissWelcomeModal(page);
    await page.locator('.archive-item', { hasText: 'E2E 深链目标群' }).click();
    await page.getByRole('button', { name: '前往群聊' }).click();

    await expect(page).toHaveURL(new RegExp(`/group\\?group=${TARGET_ID}`));
    await expect(page.locator('.group-item[aria-current="true"]')).toContainText('E2E 深链目标群');
  });

  test('刷新后还在同一个群（目标由地址栏带住，不只活在内存里）', async ({ page }) => {
    await page.goto(`/group?group=${TARGET_ID}`);
    await dismissWelcomeModal(page);
    await expect(page.locator('.group-item[aria-current="true"]')).toContainText('E2E 深链目标群');

    await page.reload();
    await dismissWelcomeModal(page);
    await expect(page.locator('.group-item[aria-current="true"]')).toContainText('E2E 深链目标群');
  });

  test('指向不存在的群时说"群聊不存在"，不含糊切到别的群', async ({ page }) => {
    await page.goto('/group?group=e2e-grp-gone');
    await dismissWelcomeModal(page);

    await expect(page.getByText('群聊不存在')).toBeVisible();
  });

  test('在页面里换群时地址栏跟着走', async ({ page }) => {
    await page.goto(`/group?group=${TARGET_ID}`);
    await dismissWelcomeModal(page);
    await currentGroupName(page);

    await page.locator('.group-item', { hasText: 'E2E 较新的群' }).click();
    await expect(page).toHaveURL(new RegExp(`group=${NEWER_ID}`));
    await expect(page.locator('.group-item[aria-current="true"]')).toContainText('E2E 较新的群');
  });
});
