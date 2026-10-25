import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 缺模型时的空态是一个可点的入口（C-01 首聊走查的第一处摩擦）
 *
 * 修前：空态只有"示例开场白"，点了会发一条消息、然后得到一句不可操作的提示；
 * 用户得自己发现页头上方那颗「模型 需处理」的芯片可以点。
 * 修后：缺模型时示例开场白收起，原地给出「先配一个模型」按钮，点了带 from 回程跳设置。
 *
 * 负向对照：配好模型后，空态必须回到示例开场白、且不再出现这个按钮
 * （否则就是"入口永远在"，等于没修）。
 */

const CHAR_NAME = '空态入口验证角色';

function seedCharacter(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const tx = db.transaction(['characters'], 'readwrite');
    tx.objectStore('characters').put({
      id: 'char-empty-setup',
      name: '空态入口验证角色',
      description: 'C-01 空态验证',
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
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      messages: [],
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function openSeededChat(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (fnBody) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ai-roleplay', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const built = new Function(`return (${fnBody})`)() as (d: IDBDatabase) => Promise<void>;
    await built(db);
    db.close();
  }, seedCharacter.toString());
  await page.goto('/chat');
  await page.locator('.char-row', { hasText: CHAR_NAME }).click();
  await expect(page.locator('.empty-state-title')).toContainText(CHAR_NAME, { timeout: 15_000 });
}

test.describe('缺模型时的空态入口', () => {
  // 用默认 storageState：它只预置"引导已完成"，本来就没有任何 API 配置。
  // 刻意不给全新存储——那样每次导航都会被引导弹窗盖住，测的是弹窗不是空态。

  test('缺模型时空态给出「先配一个模型」，点了带 from 回程进设置', async ({ page }) => {
    await openSeededChat(page);

    const cta = page.getByRole('button', { name: '先配一个模型' });
    await expect(cta, '缺模型时没有给出可点的下一步').toBeVisible();
    // 示例开场白点了会失败（发送被拦），此时不该摆出来
    await expect(page.locator('.example-chip')).toHaveCount(0);
    // 描述也不能继续留着"从下面的开场白里挑一个"——那是一句做不到的承诺
    await expect(page.locator('.empty-state-desc')).not.toContainText('开场白');

    await cta.click();
    await expect(page).toHaveURL(/\/settings\?cat=model&from=/);
  });

  test('配好模型后回到示例开场白，入口不再出现', async ({ page }) => {
    // 配一个指向本机 mock 的配置（不发真请求，只为让"有模型"成立）
    await page.goto('/settings?cat=model');
    await page.getByRole('button', { name: '新增 API 配置' }).click();
    await page.locator('#p-name').fill('空态对照（mock）');
    await page.locator('#p-baseurl').fill(`http://localhost:${process.env.E2E_PORT ?? '5173'}/mock`);
    await page.locator('#p-model').fill('gpt-4o');
    await page.locator('#p-apikey').fill('test-key');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('空态对照（mock）').first()).toBeVisible();

    await openSeededChat(page);
    await expect(page.getByRole('button', { name: '先配一个模型' })).toHaveCount(0);
    await expect(page.locator('.example-chip').first()).toBeVisible();
  });
});
