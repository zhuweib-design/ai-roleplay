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
  await page.getByRole('button', { name: '完整表单' }).click(); // 新建角色默认落在快速档；这些用例走完整表单，先切档再填字段
  await expect(page).toHaveURL(/\/character\/new/);

  // 2. 填写表单并保存
  await page.getByLabel('名称').fill(name);
  await page.locator('#f-desc').fill('E2E 自动化测试角色：一位来自远方的旅人。');
  await page.locator('.header-btn.save').click();

  // 3. 保存后跳回列表，卡片出现
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();

  // 4. 进入编辑：改名
  // 手机视口（≤640）点卡不再直进编辑，而是开详情抽屉（方案乙），「编辑」在抽屉里；
  // 桌面保持点卡直进。用视口宽度判断而非 DOM 探测，与 chat-flow 的写法一致，
  // 也避免组件挂载前探测的时序竞态。
  const isNarrow = (page.viewportSize()?.width ?? 1280) <= 640;
  await page.getByRole('article', { name: `角色：${name}` }).click();
  if (isNarrow) {
    await page.locator('.bs-panel').getByRole('button', { name: '编辑' }).click();
  }
  await expect(page).toHaveURL(/\/character\/.+\/edit/);
  const renamed = `${name}-已改名`;
  await page.getByLabel('名称').fill(renamed);
  await page.locator('.header-btn.save').click();
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${renamed}` })).toBeVisible();

  // 5. 删除：编辑页删除 + 确认弹窗
  // 与第 4 步同一个分叉：窄视口要先从抽屉里点「编辑」才到编辑页。
  await page.getByRole('article', { name: `角色：${renamed}` }).click();
  if (isNarrow) {
    await page.locator('.bs-panel').getByRole('button', { name: '编辑' }).click();
  }
  await expect(page).toHaveURL(/\/character\/.+\/edit/);
  await page.getByRole('button', { name: '删除角色' }).click();
  // 确认弹窗（modal-confirm 按钮文本「删除」）
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${renamed}` })).toHaveCount(0);
});
