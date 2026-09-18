import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * E2E · 灾备闭环（Web SOP 评审 P1-10）
 *
 * 目的：把「导出备份 → 数据丢失 → 导入还原」这条路径从**仅文档化**
 * （`docs/dev/data-backup-restore.md`）升级为**持续验证**，防止灾备链路静默失效。
 *
 * 覆盖点：
 * 1. 导出备份确实产生可下载文件，且内容含当前数据（格式契约）；
 * 2. 数据被删除后，导入同一备份能完整还原；
 * 3. 导入流程给出「导入结果」反馈（不是静默成功）。
 *
 * 端归属：Web（数据落在 IndexedDB）。桌面端走文件系统，不在本用例范围。
 */

/** 打开「设置 → 数据」分类（设置页各分类以 v-show 切换，默认停在「外观」） */
async function openDataSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  // 分类导航按钮的文本 = 标签 + 描述；只有「数据」分类的文本含「数据」
  await page.locator('.settings-nav-item').filter({ hasText: '数据' }).click();
  await expect(page.locator('.data-mgmt-section').first()).toBeVisible();
}

test('灾备闭环：导出备份 → 删除数据 → 导入还原', async ({ page }) => {
  const name = `E2E灾备角色-${Date.now()}`;

  // ── 1. 造一条可识别数据 ──
  await page.goto('/character');
  await page.getByRole('button', { name: '新建角色' }).click();
  await expect(page).toHaveURL(/\/character\/new/);
  await page.getByLabel('名称').fill(name);
  await page.locator('#f-desc').fill('E2E 灾备闭环用例角色。');
  await page.locator('.header-btn.save').click();
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();

  // ── 2. 导出备份并校验内容 ──
  await openDataSettings(page);
  // 备份区块：以小节标题定位，避免与页面内其它 file input 冲突
  const backupBlock = page.locator('.data-mgmt-block').filter({ hasText: '全量备份与恢复' });
  await expect(backupBlock).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await backupBlock.getByRole('button', { name: '导出备份' }).click();
  const download = await downloadPromise;

  const backupPath = test.info().outputPath('ai-roleplay-backup.json');
  await download.saveAs(backupPath);
  expect(download.suggestedFilename()).toMatch(/^ai-roleplay-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const raw = await readFile(backupPath, 'utf8');
  const backup = JSON.parse(raw) as { characters?: Array<{ name?: string }> };
  expect(Array.isArray(backup.characters), '备份应含 characters 数组').toBe(true);
  expect(
    backup.characters!.some((c) => c.name === name),
    '备份内容应包含刚创建的角色',
  ).toBe(true);

  // ── 3. 删除该角色，制造「数据丢失」 ──
  await page.goto('/character');
  await page.getByRole('article', { name: `角色：${name}` }).click();
  await expect(page).toHaveURL(/\/character\/.+\/edit/);
  await page.getByRole('button', { name: '删除角色' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page).toHaveURL(/\/character$/, { timeout: 5000 });
  await expect(page.getByRole('article', { name: `角色：${name}` })).toHaveCount(0);

  // ── 4. 导入备份还原 ──
  await openDataSettings(page);
  const backupBlockAgain = page.locator('.data-mgmt-block').filter({ hasText: '全量备份与恢复' });
  await backupBlockAgain.locator('input[type="file"]').setInputFiles(backupPath);

  // 导入完成应有明确反馈（导入结果弹窗），而非静默成功
  const resultDialog = page.getByRole('dialog', { name: '导入结果' });
  await expect(resultDialog).toBeVisible({ timeout: 15_000 });

  // ── 5. 数据确实回来了 ──
  await page.goto('/character');
  await expect(page.getByRole('article', { name: `角色：${name}` })).toBeVisible();
});
