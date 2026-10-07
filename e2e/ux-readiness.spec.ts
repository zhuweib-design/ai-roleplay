/**
 * L 层（关联可视化）的真实浏览器回归
 *
 * 覆盖设计文档 §4 的四条断言：
 * - 未就绪时在"发送之前"就给出原因与一步跳转，且落地正确的设置类
 * - 深链带 from，设置页提供返回来源
 * - 数据银行把两条隐藏前提（向量开关默认关 / 静态通道需绑世界书）摆到页面上
 * - 群聊显式声明它不加载世界书与文档检索
 */
import { test, expect } from '@playwright/test';

test.describe('就绪状态与关联跳转', () => {
  test('对话页就绪条渲染五个依赖芯片，未配置模型时点击可直达模型类并返回', async ({ page }) => {
    await page.goto('/chat');

    const bar = page.locator('.readiness-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.readiness-chip')).toHaveCount(5);

    const model = bar.locator('[data-rel-jump="readiness-model"]');
    await expect(model).toHaveClass(/is-attention/);
    await expect(model).toHaveAttribute('title', /模型配置/);

    await model.click();
    await expect(page).toHaveURL(/\/settings\?cat=model&from=\/chat/);
    await expect(page.locator('.settings-nav-item.active')).toContainText('模型');

    const back = page.locator('[data-rel-jump="settings-return"]');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('数据银行把两条隐藏前提显示为可完成清单', async ({ page }) => {
    await page.goto('/databank');

    const notice = page.locator('.prereq-notice');
    await expect(notice).toBeVisible();
    await expect(notice.locator('.prereq-row')).toHaveCount(3);
    await expect(notice).toContainText('向量检索');
    await expect(notice).toContainText('绑定世界书');

    await notice.locator('[data-rel-jump="prereq-vector-switch"]').click();
    await expect(page).toHaveURL(/\/settings\?cat=model&from=/);
  });

  test('群聊页头声明能力差异，并同样带就绪条', async ({ page }) => {
    await page.goto('/group');
    await expect(page.locator('.group-capability-note')).toBeVisible();
    await expect(page.locator('.readiness-bar')).toBeVisible();
  });

  test('世界书的"已绑定角色"从只读列表变成可点入口', async ({ page }) => {
    await page.goto('/worldbook');

    // "已绑定角色"区只在编辑器态出现：先选中一本（空态时先建一本）
    const firstBook = page.locator('.lorebook-item').first();
    if (await firstBook.count()) {
      await firstBook.click();
    } else {
      await page.locator('.empty-state .link-btn').click();
    }
    await expect(page.locator('.bound-chars-section')).toBeVisible();

    const emptyJump = page.locator('[data-rel-jump="wb-bound-empty"]');
    if (await emptyJump.count()) {
      await emptyJump.click();
      await expect(page).toHaveURL(/\/character\?from=\/worldbook/);
      return;
    }

    const link = page.locator('.bound-char-link').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/character\/.+\/edit\?from=\/worldbook/);
  });
});
