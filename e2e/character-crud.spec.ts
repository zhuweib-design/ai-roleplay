import { test, expect } from '@playwright/test';

/**
 * E2E · 角色完整生命周期 (F01)
 * 新建 → 保存 → 列表出现 → 编辑 → 删除
 */
test('角色完整生命周期：新建→保存→列表→编辑→删除', async ({ page }) => {
  const name = `E2E角色-${Date.now()}`;

  // 1. 从列表进入新建
  await page.goto('/character');
  await page.getByRole('button', { name: '新建角色' }).click();
  await expect(page).toHaveURL(/\/character\/new/);

  // 2. 填写表单并保存
  await page.getByLabel('名称').fill(name);
  await page.locator('#f-desc').fill('E2E 自动化测试角色：一位来自远方的旅人。');
  await page.locator('.header-btn.save').click();

  // 3. 保存后跳回列表，卡片出现
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();

  // 4. 进入编辑：改名
  await page.getByRole('article', { name: `角色：${name}` }).click();
  await expect(page).toHaveURL(/\/character\/.+\/edit/);
  const renamed = `${name}-已改名`;
  await page.getByLabel('名称').fill(renamed);
  await page.locator('.header-btn.save').click();
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${renamed}` })).toBeVisible();

  // 5. 删除：编辑页删除 + 确认弹窗
  await page.getByRole('article', { name: `角色：${renamed}` }).click();
  await expect(page).toHaveURL(/\/character\/.+\/edit/);
  await page.getByRole('button', { name: '删除角色' }).click();
  // 确认弹窗（modal-confirm 按钮文本「删除」）
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${renamed}` })).toHaveCount(0);
});
