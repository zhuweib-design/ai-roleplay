/**
 * E2E · 世界书深链 `?book=`（M17-b，第二条按 URL 寻址的新深链）
 *
 * 只跑 msedge：用例直接往 IndexedDB 写世界书，与 e2e/ux-deep-link-group.spec.ts 同一理由
 * （M2-b9 实测过同一 webkit 进程内多个 context 共享存储目录，前一个用例的落盘会盖掉后一个）。
 *
 * 这条链路原来最刺眼的地方：上下文面板与注入痕迹都列出了"哪本书生效"，点进去却只跳到
 * `/worldbook`，落地页选中谁取决于 store 里恰好是什么 —— 面板高亮的那本和页面打开的那本
 * 可以不是同一本，而且刷新即丢。现在由 URL 携带目标。
 *
 * 面板那一跳（E03 入口）与回程芯片的断言在 e2e/ux-gap-visibility.spec.ts 里，本文件只管 URL 侧。
 * 造数刻意让深链指向 **updatedAt 较旧** 的那本：store 在读完库会默认选中列表第一本
 * （`loadLorebooks` 按 updatedAt 降序），不这样安排就分不清"深链真的命中了"还是
 * "只是默认选中"。
 */
import { test, expect, type Page } from '@playwright/test';

const NEWER_ID = 'e2e-book-newer';
const TARGET_ID = 'e2e-book-target';

async function dismissWelcomeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
}

/** 直接写 IndexedDB 造两本书；target 的 updatedAt 更旧 ⇒ 不是"默认选中第一本"会选中的那本 */
async function seedBooks(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ newerId, targetId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('lorebooks', 'readwrite');
      const store = tx.objectStore('lorebooks');
      const put = (id: string, name: string, updatedAt: string) =>
        store.put({
          id,
          name,
          description: '',
          scope: 'global',
          active: true,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt,
          entries: [
            {
              id: `${id}-e1`,
              title: '常驻条目',
              keys: [],
              content: `${name} 的一条常驻内容。`,
              enabled: true,
              caseSensitive: false,
              priority: 5,
              placement: 'before_character_definition',
              insertion_order: 0,
              matchType: 'constant',
            },
          ],
        });
      put(newerId, 'E2E 较新的书', '2026-10-09T00:00:00.000Z');
      put(targetId, 'E2E 深链目标书', '2026-10-02T00:00:00.000Z');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { newerId: NEWER_ID, targetId: TARGET_ID }
  );
}

function activeBookName(page: Page) {
  // 世界书列表里 aria-current="true" 的那一项就是界面正在打开的那本
  return page.locator('.lorebook-item[aria-current="true"]');
}

test.describe('世界书深链 ?book=', () => {
  test.beforeEach(async ({ page }) => {
    await seedBooks(page);
  });

  test('直接打开带书 id 的链接，命中那本而不是默认第一本', async ({ page }) => {
    await page.goto(`/worldbook?book=${TARGET_ID}`);
    await dismissWelcomeModal(page);
    await expect(activeBookName(page)).toContainText('E2E 深链目标书');

    await page.reload();
    await dismissWelcomeModal(page);
    await expect(activeBookName(page)).toContainText('E2E 深链目标书');
  });

  test('在页面里换书时地址栏跟着走', async ({ page }) => {
    await page.goto(`/worldbook?book=${TARGET_ID}`);
    await dismissWelcomeModal(page);

    await page.locator('.lorebook-item', { hasText: 'E2E 较新的书' }).click();
    await expect(page).toHaveURL(new RegExp(`book=${NEWER_ID}`));
    await expect(activeBookName(page)).toContainText('E2E 较新的书');
  });

  test('指向不存在的书时说出来，不含糊打开另一本', async ({ page }) => {
    await page.goto('/worldbook?book=e2e-book-gone');
    await dismissWelcomeModal(page);

    await expect(page.getByText('找不到那本世界书')).toBeVisible();
  });
});
