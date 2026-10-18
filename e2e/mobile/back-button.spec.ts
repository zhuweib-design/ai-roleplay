/**
 * E2E · Android 返回键三态（MOBILE_PLAN 批次 2-3 / DEV_PLAN A14）
 *
 * 安卓返回键与浏览器后退是同一条路径（popstate），所以这里全部用 `page.goBack()`
 * 模拟——它在浏览器里就是"后退一格"，与真机返回键等价。
 *
 * 判据（MOBILE_PLAN §8 2-3）三条路径各一条：
 * 1. **关层**：抽屉开着 → 返回只关抽屉，底下的二级页必须还在
 *    （A7 登记的"一次退两级"边界就在这里被根治）
 * 2. **回一级**：二级页 → 返回回到列表级
 * 3. **默认**：一级 Tab 页 → 返回交给路由（真的回到上一个页面）
 *
 * 造数直接写 IndexedDB（照 group-composition 的做法）：本用例只关心返回键语义，
 * 走 UI 建角色/建群会吃掉一半预算且证明不了返回键的事。
 */
import { test, expect, type Page } from '@playwright/test';

const CHAR_IDS = ['char-back-a', 'char-back-b'];
const GROUP_ID = 'grp-back-button';
const GROUP_NAME = '返回键复验群';

async function seedGroup(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ ids, groupId, groupName }: { ids: string[]; groupId: string; groupName: string }) =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => {
          const db = req.result;
          const now = new Date().toISOString();
          const chars = ids.map((id, i) => ({
            id,
            name: i === 0 ? '返回甲' : '返回乙',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: '',
            alternateGreetings: [],
            exampleMessages: '',
            characterNote: null,
            talkativeness: 50,
            tags: [],
            favorite: false,
            version: '1.0',
            createdAt: now,
            updatedAt: now,
            messages: [],
          }));
          const group = {
            id: groupId,
            name: groupName,
            description: '',
            members: chars.map((c) => ({
              characterId: c.id,
              name: c.name,
              joinedAt: now,
              allowAutoSelect: true,
            })),
            firstMessage: '',
            messages: Array.from({ length: 4 }, (_, i) => ({
              id: `back-m${i}`,
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `第 ${i + 1} 条消息`,
              characterId: i % 2 === 0 ? null : ids[0],
              characterName: i % 2 === 0 ? null : '返回甲',
              timestamp: now,
            })),
            mode: 'natural',
            lastSpeakerId: null,
            createdAt: now,
            updatedAt: now,
            lifecycleStatus: 'active',
            archivedAt: null,
          };
          const tx = db.transaction(['characters', 'groups'], 'readwrite');
          for (const c of chars) tx.objectStore('characters').put(c);
          tx.objectStore('groups').put(group);
          tx.oncomplete = () => {
            db.close();
            resolve('ok');
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { ids: CHAR_IDS, groupId: GROUP_ID, groupName: GROUP_NAME }
  );
}

/** 进二级（选中本用例造的那个群） */
async function openGroupDetail(page: Page): Promise<void> {
  await page.goto('/group');
  await page.waitForSelector('#app-main > *');
  await page.locator('.group-item', { hasText: GROUP_NAME }).first().click();
  await expect(page.locator('.messages-area')).toBeVisible();
}

test.describe('A14 · 返回键三态', () => {
  test('第一态「关层」：抽屉开着时返回只关抽屉，二级页不动', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGroup(page);
    await openGroupDetail(page);

    await page.locator('.group-settings-btn').click();
    await expect(page.locator('.bs-panel')).toBeVisible();

    await page.goBack();

    // 抽屉关掉
    await expect(page.locator('.bs-panel')).toHaveCount(0);
    // 但二级页必须还在——修复前这一次返回会把二级一起退掉，抽屉还盖在列表上
    await expect(page.locator('.messages-area')).toBeVisible();
    await expect(page.locator('.group-list-panel')).toBeHidden();
    expect(new URL(page.url()).pathname, '关抽屉不该离开 /group').toBe('/group');
  });

  test('第二态「回一级」：二级页返回回到列表级，且仍在同一路由', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGroup(page);
    await openGroupDetail(page);

    await page.goBack();

    await expect(page.locator('.group-list-panel')).toBeVisible();
    await expect(page.locator('.messages-area')).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/group');
  });

  test('第三态「默认」：一级 Tab 页不吞返回键，交给路由后退', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/character');
    await page.waitForSelector('#app-main > *');

    // 从「角色」点底栏到「更多」，形成一条真实的后退历史
    await page.locator('.bottom-nav a[href="/more"]').click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(page.locator('.more-card').first()).toBeVisible();

    await page.goBack();

    // 一级页不该压历史层：返回就是普通的路由后退
    await expect(page).toHaveURL(/\/character$/);
  });

  test('层序完整：关抽屉 → 回一级 → 离开页面，一次一层', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedGroup(page);
    await openGroupDetail(page);

    await page.locator('.group-settings-btn').click();
    await expect(page.locator('.bs-panel')).toBeVisible();

    await page.goBack(); // 1) 关抽屉
    await expect(page.locator('.bs-panel')).toHaveCount(0);
    await expect(page.locator('.messages-area')).toBeVisible();

    await page.goBack(); // 2) 回列表级
    await expect(page.locator('.group-list-panel')).toBeVisible();

    await page.goBack(); // 3) 离开 /group
    await expect(page).not.toHaveURL(/\/group$/);
  });
});
