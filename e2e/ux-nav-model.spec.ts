/**
 * N 层导航改造的桌面端回归（UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §4 可执行断言）
 *
 * 覆盖三条原本靠人工才会发现的问题：
 * 1. 激活态由点击写入（characterStore.currentNav）→ 二级页高亮失准
 * 2. path 前缀陷阱（/character 是 /character-version 的前缀）
 * 3. /more 只有移动端入口，桌面端不可达
 */
import { test, expect } from '@playwright/test';

const GROUP_LABELS = ['对话', '创作', '能力', '档案'];

test.describe('桌面端分层导航', () => {
  test('rail 按 4 个内容组渲染，共 14 个入口（13 内容 + 1 系统）', async ({ page }) => {
    await page.goto('/chat');

    const rail = page.locator('.nav-rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.nav-group-label')).toHaveText(GROUP_LABELS);
    await expect(rail.locator('.nav-item')).toHaveCount(14);
    // 每个入口都带一句话职责（hover 提示），不再只有图标和名字
    await expect(rail.locator('.nav-item[title]')).toHaveCount(14);
  });

  test('高亮由路由派生：新建角色页仍点亮「角色」', async ({ page }) => {
    await page.goto('/character/new');

    const active = page.locator('.nav-rail .nav-item[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('aria-label', '角色');
  });

  test('版本管理不被误判为角色入口（前缀陷阱）', async ({ page }) => {
    await page.goto('/character-version');

    const active = page.locator('.nav-rail .nav-item[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('aria-label', '版本管理');
  });

  test('聚合页在桌面端可达，并按组渲染且卡片显示描述', async ({ page }) => {
    await page.goto('/chat');
    await page.locator('.nav-rail .nav-item[aria-label="更多"]').click();

    await expect(page).toHaveURL(/\/more$/);
    // 群聊/数据银行·故事·随机事件/本地模型·图片/记录·版本 = 4 个组都有卡片
    await expect(page.locator('.more-section-title')).toHaveCount(4);
    await expect(page.locator('.more-card')).toHaveCount(8);
    await expect(page.locator('.more-card-desc').first()).toContainText('对话');
    // 系统项自身高亮，而不是留在上一个内容入口
    await expect(page.locator('.nav-rail .nav-item[aria-current="page"]')).toHaveAttribute('aria-label', '更多');
  });
});
