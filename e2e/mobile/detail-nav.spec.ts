/**
 * A13 / 批次 2-2：8 个视图恢复保留底部导航
 *
 * 缺陷：底栏此前只在主 Tab 页出现，9 条路由（去重后 8 个视图）被当成"二级沉浸页"
 * 摘掉导航。手机 PWA 里没有浏览器返回键，这些页面进去就是单向门——唯一的出路是
 * 页面自己那枚返回按钮，而"新建角色"这类页面连返回都没有。
 *
 * 判据（MOBILE_PLAN §8 2-2）：**无页面摘导航**——遍历 8 个视图，底栏都在场。
 *
 * 8 个视图来自 `DETAIL_ROUTES` 去重（`character-edit` 与 `character-new` 共用
 * CharacterEditorView，所以是 8 不是 9）。这里用 `/character/new` 代表编辑器，
 * 免得依赖种子角色的 id。
 */
import { test, expect, type Page } from '@playwright/test';

/** 8 个曾被摘掉导航的视图（路径 → 该路由在 nav-model 里的归属段） */
const DETAIL_VIEWS: Array<{ path: string; label: string; section: string }> = [
  { path: '/character/new', label: '角色编辑（新建）', section: '角色' },
  { path: '/databank', label: '数据银行', section: '更多' },
  { path: '/archives', label: '记录', section: '更多' },
  { path: '/story', label: '故事引擎', section: '更多' },
  { path: '/random-events', label: '随机事件', section: '更多' },
  { path: '/local-model', label: '本地模型', section: '更多' },
  { path: '/image-gen', label: '生图', section: '更多' },
  { path: '/character-version', label: '角色版本', section: '更多' },
];

async function navState(page: Page) {
  const nav = page.locator('.bottom-nav');
  return {
    count: await nav.count(),
    items: await nav.locator('.bottom-nav-item').count(),
    active: (await nav.locator('.bottom-nav-item.active').allTextContents()).map((s) => s.trim()),
  };
}

test.describe('A13 · 二级页不摘底部导航', () => {
  test('8 个视图逐个遍历：底栏都在场、5 个入口、且恰好高亮一项', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const report: string[] = [];
    for (const view of DETAIL_VIEWS) {
      await page.goto(view.path);
      // 等**路由组件**挂载，不是等底栏：底栏在 app 挂载那一刻就在 DOM 里，
      // 此时 router 还没解析完、route.name 仍是 undefined ⇒ 高亮项数为 0。
      // 单跑时懒加载快、恰好赶在 router ready 之后，全量套跑就露馅（2026-10-18 实测）。
      await page.waitForSelector('#app-main > *');
      await page.waitForSelector('.bottom-nav');
      const state = await navState(page);
      report.push(
        `${view.label}(${view.path}): nav=${state.count} items=${state.items} active=${state.active.join('|') || '无'}`
      );
      expect(state.count, `${view.label}：底栏被摘掉了`).toBe(1);
      expect(state.items, `${view.label}：入口数不是 5`).toBe(5);
      expect(state.active, `${view.label}：高亮项数应为 1`).toHaveLength(1);
      // 归属段必须表达出来：编辑器亮「角色」，其余都亮「更多」
      expect(state.active[0], `${view.label}：应高亮「${view.section}」`).toContain(view.section);
    }
    // 失败时把整轮读数打出来，比单条断言更好定位
    test.info().annotations.push({ type: '遍历读数', description: report.join('\n') });
  });

  test('从二级页点底栏能离开（单向门已消除）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/databank');
    await page.waitForSelector('#app-main > *');
    await page.waitForSelector('.bottom-nav');

    await page.locator('.bottom-nav a[href="/chat"]').click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('.bottom-nav-item.active')).toContainText('会话');
  });

  test('二级页的底栏不遮挡内容：主内容底边 ≤ 底栏顶边', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/archives');
    await page.waitForSelector('#app-main > *');
    await page.waitForSelector('.bottom-nav');

    const box = await page.evaluate(() => {
      const main = document.querySelector('#app-main')?.getBoundingClientRect();
      const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
      return { mainBottom: main ? Math.round(main.bottom) : -1, navTop: nav ? Math.round(nav.top) : -1 };
    });
    expect(box.mainBottom, `主内容底边 ${box.mainBottom} 越过了底栏顶边 ${box.navTop}`).toBeLessThanOrEqual(
      box.navTop
    );
  });
});
