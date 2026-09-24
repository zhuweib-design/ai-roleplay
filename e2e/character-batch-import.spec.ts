import { test, expect } from '@playwright/test';

function v2(name: string): Buffer {
  return Buffer.from(JSON.stringify({
    spec: 'chara_card_v2', spec_version: '2.0',
    data: {
      name, description: `${name}的设定`, personality: '谨慎', scenario: '旅馆',
      first_mes: '你好', mes_example: '', tags: [], alternate_greetings: [], extensions: {},
    },
  }));
}

test('一次导入两个角色并同步独立 Runtime 快照，刷新后仍可读取', async ({ page }) => {
  const names = [`批量甲-${Date.now()}`, `批量乙-${Date.now()}`];
  await page.goto('/character');
  await page.locator('input[type=file]').setInputFiles(names.map((name) => ({
    name: `${name}.json`, mimeType: 'application/json', buffer: v2(name),
  })));
  await expect(page.getByText('导入 2 个角色，Runtime 同步 2 个，失败 0 个')).toBeVisible();
  for (const name of names) await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();
  const runtimeNames = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const open = indexedDB.open('ai-roleplay');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => {
        const records = request.result as Array<{ key: string; value?: { character?: { profile?: { displayName?: string } } } }>;
        const result = records.filter((record) => record.key.startsWith('virtual-character-runtime:'))
          .map((record) => record.value?.character?.profile?.displayName ?? '');
        db.close();
        resolve(result);
      };
    };
  }));
  for (const name of names) expect(runtimeNames).toContain(name);
  await page.reload();
  for (const name of names) await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();
});


test('批量导入遇到 Runtime 持久化失败后可在本页重试，且不重复角色', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let failOnce = sessionStorage.getItem('runtime-fail-once') !== 'done';
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'snapshots' && failOnce) {
        failOnce = false;
        sessionStorage.setItem('runtime-fail-once', 'done');
        throw new DOMException('模拟 Runtime 写入失败', 'QuotaExceededError');
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  const name = `重试角色-${Date.now()}`;
  await page.goto('/character');
  await page.locator('input[type=file]').setInputFiles({
    name: `${name}.json`, mimeType: 'application/json', buffer: v2(name),
  });
  await expect(page.getByText('导入 1 个角色，Runtime 同步 0 个，失败 1 个')).toBeVisible();
  await expect(page.getByRole('article', { name: `角色：${name}` })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('button', { name: '重试同步 1 个角色' })).toBeVisible();
  await page.getByRole('button', { name: '重试同步 1 个角色' }).click();
  await expect(page.getByText('导入 1 个角色，Runtime 同步 1 个，失败 0 个')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试同步 1 个角色' })).toHaveCount(0);
  await expect(page.getByRole('article', { name: `角色：${name}` })).toHaveCount(1);
});

test('拒绝超过 50 个文件且不产生部分角色', async ({ page }) => {
  await page.goto('/character');
  await page.locator('input[type=file]').setInputFiles(Array.from({ length: 51 }, (_, i) => ({
    name: `limit-${i}.json`, mimeType: 'application/json', buffer: v2(`limit-${i}`),
  })));
  await expect(page.getByText('每批最多导入 50 个 JSON 文件')).toBeVisible();
  await expect(page.getByRole('article', { name: '角色：limit-0' })).toHaveCount(0);
});
