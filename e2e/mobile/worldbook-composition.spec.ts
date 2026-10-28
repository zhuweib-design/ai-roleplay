/**
 * E2E · 世界书两级互换（MOBILE_PLAN 批次 1-3 / DEV_PLAN A9）
 *
 * 判据（MOBILE_PLAN §8 1-3）：**无三级嵌套滚动**（同屏内 列表 / 详情 / 外滚
 * 三个独立滚动容器）；**主体区 ≥40%**。
 *
 * 改之前：`.lorebook-list-panel` 38vh + `.entries-list-panel` 38vh + 页面外滚，
 * 三层各自滚动，手指划一下不知道滚的是哪层；条目树还常被挤到 0 高。
 *
 * 改之后：
 *   一级 = 世界书列表（满屏）
 *   二级 = 该书：条目树随 `.editor-content` 单容器滚动
 *   条目表单 = 二级内的互斥第三态（替换条目树，带「← 条目列表」回头路）
 *
 * 造数直接点「新建」（store.createLorebook 会顺手选中新书），不写 IndexedDB：
 * 世界书的形状（entries/scope/worldDescription…）比群聊复杂得多，手写造数容易
 * 造出一本"看起来对但 store 读不出来"的书，反而证明不了组成层。
 */
import { test, expect, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return { display: 'missing', height: 0, top: 0 };
      const r = el.getBoundingClientRect();
      return { display: getComputedStyle(el).display, height: Math.round(r.height), top: Math.round(r.top) };
    };
    return {
      level: document.querySelector('.worldbook-view')?.getAttribute('data-level'),
      list: box('.lorebook-list-panel'),
      editor: box('.lorebook-editor-panel'),
      entries: box('.entries-list-panel'),
      entryForm: box('.entry-editor-panel'),
    };
  });
}

const VIEW_H = 844;

test.describe('A9 · 世界书两级互换', () => {
  test('390 宽：一级列表满屏、二级编辑器满屏，两级互斥', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: VIEW_H });
    await page.goto('/worldbook');
    await page.waitForSelector('#app-main > *');

    // ── 一级 ──
    let s = await state(page);
    expect(s.level, '一级的 data-level 不对').toBe('1');
    expect(s.list.display, '一级必须显示列表').not.toBe('none');
    expect(s.editor.display, '一级的内容区必须不参与布局（否则就是"上下两段"）').toBe('none');
    expect(
      s.list.height,
      `一级列表只有 ${s.list.height}px（视口 ${VIEW_H}），没有满屏`
    ).toBeGreaterThanOrEqual(VIEW_H * 0.4);

    // ── 进二级（新建会顺手选中新书）──
    await page.locator('.new-btn').click();
    await expect(page.locator('.lorebook-editor-panel')).toBeVisible();

    s = await state(page);
    expect(s.level).toBe('2');
    expect(s.list.display, '二级里列表必须让位').toBe('none');
    expect(
      s.editor.height,
      `二级主体区只有 ${s.editor.height}px，判据要求 ≥40% 视口`
    ).toBeGreaterThanOrEqual(VIEW_H * 0.4);
  });

  test('二级只有一个滚动容器：条目树不自带滚动', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: VIEW_H });
    await page.goto('/worldbook');
    await page.waitForSelector('#app-main > *');
    await page.locator('.new-btn').click();
    await expect(page.locator('.lorebook-editor-panel')).toBeVisible();

    const scrolls = await page.evaluate(() => {
      const pick = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return 'missing';
        return getComputedStyle(el).overflowY;
      };
      return {
        content: pick('.editor-content'),
        entriesPanel: pick('.entries-list-panel'),
        entriesList: pick('.entries-list'),
      };
    });

    // 条目树 / 条目面板不再自己滚（改前分别是 auto / auto）
    expect(scrolls.entriesPanel, '条目面板还在自己滚 ⇒ 又变成嵌套滚动').not.toBe('auto');
    expect(scrolls.entriesList, '条目树还在自己滚 ⇒ 又变成嵌套滚动').not.toBe('auto');
    // 二级内容区承担滚动
    expect(scrolls.content).toBe('auto');
  });

  test('条目表单与条目树互斥，且能返回条目列表', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: VIEW_H });
    await page.goto('/worldbook');
    await page.waitForSelector('#app-main > *');
    await page.locator('.new-btn').click();
    await expect(page.locator('.lorebook-editor-panel')).toBeVisible();

    await page.locator('.add-entry-btn').click();

    // 表单出现、条目树让位（互斥，不是上下两段）
    await expect(page.locator('.entry-editor-panel')).toBeVisible();
    let s = await state(page);
    expect(s.entries.display, '条目树没有让位给表单').toBe('none');

    // 回头路：按钮说出目的地
    const back = page.locator('.wb-entry-back');
    await expect(back).toBeVisible();
    await expect(back).toContainText('条目列表');
    await back.click();

    s = await state(page);
    expect(s.entries.display, '返回后条目树没回来').not.toBe('none');
    expect(s.entryForm.display, '返回后表单没让位').toBe('none');
  });

  test('页内返回与系统返回都回到一级，且不离开 /worldbook', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: VIEW_H });
    await page.goto('/worldbook');
    await page.waitForSelector('#app-main > *');
    await page.locator('.new-btn').click();
    await expect(page.locator('.lorebook-editor-panel')).toBeVisible();

    // 页内返回（页头「返回」）
    await page.locator('.header-btn.back').click();
    await expect(page.locator('.lorebook-list-panel')).toBeVisible();
    await expect(page.locator('.lorebook-editor-panel')).toBeHidden();
    expect(new URL(page.url()).pathname, '页内返回不该离开世界书页').toBe('/worldbook');

    // 再进二级，用系统返回
    await page.locator('.lorebook-item').first().click();
    await expect(page.locator('.lorebook-editor-panel')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.lorebook-list-panel')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/worldbook');
  });

  test('桌面 1280：两栏并置（两级互换不接管桌面）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/worldbook');
    await page.waitForSelector('#app-main > *');

    await expect(page.locator('.lorebook-list-panel')).toBeVisible();
    await page.locator('.new-btn').click();
    await expect(page.locator('.lorebook-editor-panel')).toBeVisible();
    // 桌面两级同时在场
    await expect(page.locator('.lorebook-list-panel')).toBeVisible();
  });
});
