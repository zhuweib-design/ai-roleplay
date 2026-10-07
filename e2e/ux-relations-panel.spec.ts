/**
 * M2-b5：角色关联面板（ModuleRelationsPanel）的浏览器级证据
 *
 * 设计文档 §1.4 把"角色 ⇄ 其他模块"登记为多条 B/C 类边（配了看不见、看见了跳不过去）。
 * 这里验证的是**用户在真实浏览器里看到的那句话是不是真的**：
 * 裸角色的四行必须老实说"尚未 / 没有"，造一本全局世界书后那一行必须给出真实计数，
 * 而且点进去要带回得来路。
 *
 * 第二个用例是 E17（群成员可点进编辑）——同一批"看见但跳不过去"的边，宿主在群聊页。
 */
import { test, expect, type Page } from '@playwright/test';

/** 造一本带"常驻"条目的全局世界书（与 ux-prompt-trace 同一造数范式） */
async function seedGlobalLorebook(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ai-roleplay');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lorebooks', 'readwrite');
      tx.objectStore('lorebooks').put({
        id: 'lb-e2e-rel',
        name: 'E2E 关联世界',
        description: '',
        scope: 'global',
        active: true,
        entries: [
          {
            id: 'e2e-rel-on',
            title: '亮着的条目',
            keys: [],
            content: '这段正文不该出现在关联面板上。',
            enabled: true,
            strategy: 'constant',
            insertionOrder: 0,
            insertionPosition: 'beforeCharDefs',
            depth: 4,
            group: '',
            logic: 'AND_ANY',
          },
          {
            id: 'e2e-rel-off',
            title: '停用的条目',
            keys: [],
            content: '停用不该被计数。',
            enabled: false,
            strategy: 'constant',
            insertionOrder: 1,
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

test.describe('角色关联面板（M2-b5）', () => {
  test('裸角色老实说"没有"，造了世界书后给出真实计数并能一跳带回路', async ({ page }) => {
    await page.goto('/character/seraphina/edit');
    const panel = page.locator('.relations');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.relations-row')).toHaveCount(6);

    // 未配置就是未配置——这一行此前根本不存在，用户只能靠猜
    await expect(panel.locator('[data-rel-id="model"]')).toContainText('未配置任何 API 配置');
    await expect(panel.locator('[data-rel-id="version"]')).toContainText('尚未跟踪');
    await expect(panel.locator('[data-rel-id="groups"]')).toContainText('不在任何群聊');
    await expect(panel.locator('[data-rel-id="documents"]')).toContainText('还没有可检索的文档');

    await seedGlobalLorebook(page);
    await page.reload();
    await expect(panel).toBeVisible();

    const worldbook = panel.locator('[data-rel-id="worldbook"]');
    await expect(worldbook).toContainText('生效 1 本');
    // 停用条目不得被计入（计数口径与 prompt 扫描一致）
    await expect(worldbook).toContainText('启用条目 1 条');
    // 面板只报关系，不搬运正文
    await expect(panel).not.toContainText('这段正文不该出现在关联面板上');

    await panel.locator('[data-rel-jump="rel-worldbook"]').click();
    await expect(page).toHaveURL(/\/worldbook\?from=\/character\/seraphina\/edit$/);
    await page.getByRole('button', { name: '返回来源页' }).click();
    await expect(page).toHaveURL(/\/character\/seraphina\/edit/);
  });

  test('群成员名字可点进该角色的编辑页，并带回来路（E17）', async ({ page }) => {
    const name = `关联E2E-${Date.now()}`;
    await page.goto('/character');
    await page.getByRole('button', { name: '新建角色' }).click();
    await page.getByLabel('名称').fill(name);
    await page.locator('#f-desc').fill('用于群成员跳转测试。');
    await page.locator('.header-btn.save').click();
    await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();

    await page.goto('/group');
    await page.getByRole('button', { name: '新建群聊' }).click();
    const dialog = page.getByRole('dialog', { name: '创建群聊' });
    await dialog.locator('#new-group-name').fill('关联测试群');
    await dialog.locator('.char-pick').filter({ hasText: name }).click();
    await dialog.locator('.char-pick').filter({ hasText: 'Seraphina' }).click();
    await dialog.getByRole('button', { name: '创建', exact: true }).click();

    // 成员此前只是一个名字（E17 的可看见不可跳）；现在点它就进该角色的编辑页
    await page.locator('.member-chip').filter({ hasText: name }).locator('.member-name').click();
    await expect(page).toHaveURL(/\/character\/[^/]+\/edit\?from=\/group$/);
    await expect(page.locator('#f-name')).toHaveValue(name);

    await page.getByRole('button', { name: '返回来源页' }).click();
    await expect(page).toHaveURL(/\/group/);
  });
});
