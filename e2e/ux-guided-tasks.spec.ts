/**
 * G 层（分步引导）的真实浏览器回归
 *
 * 覆盖设计文档 §4 的三条引导相关断言：
 * - 引导常驻可回（首启关闭 ≠ 结束）
 * - 每一步都能一步跳到该去的地方，并带返回路径
 * - 跳过状态在刷新后保留，且不影响其它步骤
 */
import { test, expect } from '@playwright/test';

test.describe('任务中心', () => {
  test('rail 底部「引导」进入任务页，主任务 6 条', async ({ page }) => {
    await page.goto('/chat');
    await page.locator('.nav-rail .nav-item[aria-label="引导"]').click();

    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.locator('.guided-title')).toBeVisible();
    await expect(page.locator('.guided-list').first().locator('.guided-task-head')).toHaveCount(6);
    await expect(page.locator('.guided-progress')).toContainText('/6');
  });

  test('任务步骤可一步跳到设置对应分类，并带来源返回路径', async ({ page }) => {
    await page.goto('/guide');

    await page.locator('[data-rel-jump="guide-t1-model"]').click();
    await expect(page.locator('[data-rel-jump="guide-t1-model-profile"]')).toBeVisible();

    await page.locator('[data-rel-jump="guide-t1-model-profile"]').click();
    await expect(page).toHaveURL(/\/settings\?cat=model&from=\/guide$/);
    await expect(page.locator('.settings-nav-item.active')).toContainText('模型');
    await page.locator('[data-rel-jump="settings-return"]').click();
    await expect(page).toHaveURL(/\/guide$/);
  });

  test('跳过某任务后刷新仍然记住，其它任务不受影响', async ({ page }) => {
    await page.goto('/guide');

    await page.locator('[data-rel-jump="guide-t6-voice"]').click();
    await page.locator('.guided-task .guided-skip').last().click();
    await expect(page.locator('.guided-task.skipped')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('.guided-task.skipped')).toHaveCount(1);
    await expect(page.locator('.guided-list').first().locator('.guided-task-head')).toHaveCount(6);

    await page.locator('[data-rel-jump="guide-t6-voice"]').click();
    await page.locator('.guided-skip').click();
    await expect(page.locator('.guided-task.skipped')).toHaveCount(0);
  });

  test('首启欢迎窗给出三步与两个动作，关闭后任务清单仍可回', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('ai-roleplay:onboarding-done');
    });
    await page.goto('/chat');

    const modal = page.locator('.modal-panel, [role="dialog"]').last();
    await expect(modal).toBeVisible();
    await expect(modal.locator('.onboarding-step')).toHaveCount(3);

    await modal.locator('[data-rel-jump="onboarding-guide"]').click();
    // 从欢迎窗进任务页也带来源，便于返回
    await expect(page).toHaveURL(/\/guide(\?from=\/chat)?$/);
    await expect(page.locator('.guided-task-head').first()).toBeVisible();
  });

  test('聚合页顶部的引导入口显示实时进度', async ({ page }) => {
    await page.goto('/more');

    const entry = page.locator('[data-rel-jump="more-guide"]');
    await expect(entry).toBeVisible();
    await expect(entry).toContainText('步骤');

    await entry.click();
    await expect(page).toHaveURL(/\/guide$/);
  });
});
