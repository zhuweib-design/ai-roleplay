/**
 * E2E · 首聊验收记录（C-01 五人试用的采集表）
 *
 * 判据三件事，都是"记录人真正会做"的动作：
 * 1. 在「设置 → 数据 → 运维与兼容」里能记一行，表格里立刻看得到结论与被卡住的步骤；
 * 2. 刷新之后那一行还在（落的是本机 localStorage，不是内存）；
 * 3. 导出 CSV 真的产生一个文件，文件名带日期（不是只弹一句提示）。
 *
 * 不测导出内容本身（表头与转义由 `tests/core/trial-sheet.test.ts` 覆盖）——
 * 这里只验"这条链路接上了"。
 */
import { test, expect, type Page } from '@playwright/test';

const SECTION_TITLE = '首聊验收记录';

async function openTrialSection(page: Page): Promise<void> {
  await page.goto('/settings?cat=data');
  const collapse = page.getByRole('button', { name: /运维与兼容/ });
  await collapse.waitFor({ state: 'visible' });
  if ((await collapse.getAttribute('aria-expanded')) !== 'true') await collapse.click();
  await page.locator('.data-mgmt-subtitle', { hasText: SECTION_TITLE }).waitFor({ state: 'visible' });
}

function trialSection(page: Page) {
  return page.locator('.data-mgmt-row').filter({ hasText: SECTION_TITLE });
}

test('记一行：结论与被卡住的步骤都进表格，刷新后还在', async ({ page }) => {
  // 清掉上一次留下的记录：先打开一次页面拿到同源上下文，再清、再重进
  await page.goto('/settings?cat=data');
  await page.evaluate(() => localStorage.removeItem('ai-roleplay:trial-records'));
  await openTrialSection(page);

  const section = trialSection(page);
  await expect(section.locator('tbody tr')).toHaveCount(0);
  await expect(section).toContainText('还没有记录');

  await section.getByLabel('参与者代号').fill('E2E-P1');
  await section.getByLabel('结论').selectOption('blocked');
  // 结论不是"走完了"时才出现步骤选择
  await section.getByLabel('卡在哪一步').selectOption('firstToken');
  await section.getByLabel('备注').fill('点发送后一直转圈');
  await section.getByRole('button', { name: '记录本次' }).click();

  await expect(page.locator('.toast-message', { hasText: '已记录本次试用' })).toBeVisible();
  const row = section.locator('tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('E2E-P1');
  await expect(row).toContainText('卡住了');
  await expect(row).toContainText('④ 看到回复开始');
  await expect(row).toContainText('点发送后一直转圈');

  // 刷新：记录在 localStorage 里，表格折叠段的开合状态也被记住
  await page.reload();
  await page.locator('.data-mgmt-subtitle', { hasText: SECTION_TITLE }).waitFor({ state: 'visible' });
  await expect(trialSection(page).locator('tbody tr')).toContainText('E2E-P1');
});

test('导出 CSV 真的产生文件，文件名带日期', async ({ page }) => {
  await openTrialSection(page);
  const section = trialSection(page);

  // 至少有一条记录才允许导出（空表会被拦下并提示）
  if ((await section.locator('tbody tr').count()) === 0) {
    await section.getByLabel('参与者代号').fill('E2E-P2');
    await section.getByRole('button', { name: '记录本次' }).click();
    await expect(section.locator('tbody tr')).toHaveCount(1);
  }

  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: '导出 CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^first-chat-trial-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('取消勾选路径：结论回到"走完了"时步骤选择收起', async ({ page }) => {
  await openTrialSection(page);
  const section = trialSection(page);

  await section.getByLabel('结论').selectOption('blocked');
  await expect(section.getByLabel('卡在哪一步')).toBeVisible();
  await section.getByLabel('结论').selectOption('ok');
  await expect(section.getByLabel('卡在哪一步')).toHaveCount(0);
});
