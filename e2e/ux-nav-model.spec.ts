/**
 * N 层导航改造的桌面端回归（UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §4 可执行断言）
 *
 * 覆盖三条原本靠人工才会发现的问题：
 * 1. 激活态由点击写入（characterStore.currentNav）→ 二级页高亮失准
 * 2. path 前缀陷阱（/character 是 /character-version 的前缀）
 * 3. /more 只有移动端入口，桌面端不可达
 */
import { test, expect } from '@playwright/test';

const GROUP_LABELS = ['会话', '创作', '能力', '历史'];

test.describe('桌面端分层导航', () => {
  test('rail 按 4 个内容组渲染，共 15 个入口（12 内容 + 3 系统）', async ({ page }) => {
    await page.goto('/chat');

    const rail = page.locator('.nav-rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.nav-group-label')).toHaveText(GROUP_LABELS);
    await expect(rail.locator('.nav-item')).toHaveCount(15);
    // 每个入口都带一句话职责（hover 提示），不再只有图标和名字
    await expect(rail.locator('.nav-item[title]')).toHaveCount(15);
  });

  test('侧栏二次排版：不需要滚动就够得着全部入口，设置钉在最底（M2-b7）', async ({ page }) => {
    await page.goto('/chat');

    const rail = page.locator('.nav-rail');
    const metrics = await rail.evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      lastBottom: Math.round(el.getBoundingClientRect().bottom),
      viewport: window.innerHeight,
    }));
    // 旧版实测 scrollHeight 978 > clientHeight 800（15 个竖排卡片 + 4 个组标题），
    // 底部入口要靠滚动才够得着；横排后必须不溢出
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
    expect(metrics.lastBottom).toBeLessThanOrEqual(metrics.viewport);

    // 顺序契约：设置是 rail 最后一个入口（此前它夹在「能力」组中间）
    await expect(rail.locator('.nav-item').last()).toHaveAttribute('aria-label', '设置');
    // 几何契约：入口是横排一行的小高度（旧版竖排卡片是 56px）
    const itemHeight = await rail
      .locator('.nav-item')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(itemHeight).toBeLessThanOrEqual(34);
  });

  test('侧栏入口可编辑：在「更多」里收起一个入口，rail 少一项且刷新后仍是收起状态（M2-b8）', async ({ page }) => {
    await page.goto('/chat');
    const rail = page.locator('.nav-rail');
    await expect(rail.locator('.nav-item')).toHaveCount(15);
    await expect(rail.locator('[data-rel-jump="nav-story"]')).toHaveCount(1);

    await page.goto('/more');
    await page.locator('[data-rel-jump="more-rail-edit"]').click();
    const storySwitch = page.locator('#rail-show-story');
    await expect(storySwitch).toBeChecked();
    await storySwitch.uncheck();
    await expect(page.locator('[data-rel-jump="more-rail-edit"]')).toContainText('已隐藏 1 个入口');

    await page.goto('/chat');
    await expect(rail.locator('.nav-item')).toHaveCount(14);
    await expect(rail.locator('[data-rel-jump="nav-story"]')).toHaveCount(0);
    // 刷新后仍是收起状态（偏好持久化）
    await page.reload();
    await expect(rail.locator('[data-rel-jump="nav-story"]')).toHaveCount(0);

    // 收起 ≠ 找不回来：聚合页仍然列着它
    await page.goto('/more');
    await expect(rail.locator('[data-rel-jump="nav-story"]')).toHaveCount(0);
    await expect(page.locator('[data-rel-jump="more-story"]')).toHaveCount(1);

    // 一键恢复
    await page.locator('[data-rel-jump="more-rail-edit"]').click();
    await page.locator('[data-rel-jump="more-rail-reset"]').click();
    await page.goto('/chat');
    await expect(rail.locator('.nav-item')).toHaveCount(15);
    await expect(rail.locator('[data-rel-jump="nav-story"]')).toHaveCount(1);
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
