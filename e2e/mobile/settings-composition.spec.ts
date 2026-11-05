import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 设置两级互换（MOBILE_PLAN 批次 1-4 / DEV_PLAN A10）
 *
 * 证明五件事：
 * 1. 手机上一级只有分类列表、二级只有内容区，互斥（不是"上列表下内容"两段）。
 * 2. 一级的 7 个分类**全部可见且命中区 ≥44px**——这不是 0-1 的重复：0-1 证明的是
 *    "横向滚动条够得着"，这里证明"根本不需要横向滚动"。两条并存正是缓解与治本的区别。
 * 3. 页内返回与系统返回都能回一级（后者同时是 A8 原语的第二个真实消费者）。
 * 4. 深链 `?cat=` 在手机上直接落二级（用户是被"去设置"指引来的，不该再让他找一遍）。
 * 5. 桌面仍是左栏 + 内容并置，且没有返回按钮。
 */

const VIEW_W = 390;
const VIEW_H = 844;

function displayOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).display : 'missing';
  }, selector);
}

test('设置两级互换：分类列表 → 分类页 → 返回，且桌面并置不受影响', async ({ page }) => {
  await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
  await page.goto('/settings');

  // ── 一级：只有分类列表 ──
  await expect(page.locator('.settings-nav-item')).toHaveCount(7);
  expect(await displayOf(page, '.settings-body'), '一级页的内容区必须不参与布局').toBe('none');

  // 一级列表必须占满（不是"内容高度 + 下半屏背景"）：
  // 桌面给 .settings-nav 的 align-self: flex-start 是为 sticky 侧栏设的，
  // 纵向 flex 里不覆盖它，一级就会在上半屏缩成一团
  const navBox = await page.locator('.settings-nav').boundingBox();
  expect(navBox, '一级列表量不到').not.toBeNull();
  expect(
    navBox!.height,
    `一级列表高度 ${Math.round(navBox!.height)}px，不足视口 60%（${Math.round(VIEW_H * 0.6)}px）`
  ).toBeGreaterThanOrEqual(VIEW_H * 0.6);

  // 7 个分类竖排全可见，且命中区 ≥44px（0-1 之后的新验收线，不再是"滚得到"）
  for (let i = 0; i < 7; i += 1) {
    const item = page.locator('.settings-nav-item').nth(i);
    await expect(item, `第 ${i + 1} 个分类应可见`).toBeVisible();
    const box = await item.boundingBox();
    expect(box, `第 ${i + 1} 个分类量不到`).not.toBeNull();
    expect(box!.height, `第 ${i + 1} 个分类命中区 ${Math.round(box!.height)}px < 44px`).toBeGreaterThanOrEqual(44);
    // 完整落在视口内：竖排列表不需要横向滚动
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(VIEW_W + 1);
  }

  // ── 进二级（第 6 个是「安全」，A7 那轮踩过的"最难到达的分类"）──
  const security = page.locator('.settings-nav-item').nth(5);
  await security.click();
  await expect(page.locator('.settings-body')).toBeVisible();
  expect(await displayOf(page, '.settings-nav'), '二级页的分类列表必须不参与布局').toBe('none');

  // 二级顶栏：说出去向的返回 + 当前分类名（不是笼统的「设置」）
  const back = page.locator('.m-swap__back');
  await expect(back).toBeVisible();
  await expect(back).toContainText('所有分类');
  await expect(page.locator('.settings-title')).toContainText('安全');

  // ── 页内返回 ──
  await back.click();
  await expect(page.locator('.settings-nav-item').first()).toBeVisible();
  expect(await displayOf(page, '.settings-body')).toBe('none');

  // ── 系统返回（浏览器后退 / 安卓返回键同一条 popstate 路径）──
  await security.click();
  await expect(page.locator('.settings-body')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.settings-nav-item').first()).toBeVisible();
  expect(await displayOf(page, '.settings-body')).toBe('none');

  // ── 桌面宽度：并置两栏，无返回按钮 ──
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.settings-nav-item').nth(1).click();
  await expect(page.locator('.settings-nav-item').first()).toBeVisible();
  await expect(page.locator('.settings-body')).toBeVisible();
  await expect(page.locator('.m-swap__back')).toHaveCount(0);
});

test('深链 ?cat= 在手机上直接落二级', async ({ page }) => {
  await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
  await page.goto('/settings?cat=security');

  await expect(page.locator('.settings-body')).toBeVisible();
  await expect(page.locator('.settings-title')).toContainText('安全');
  await expect(page.locator('.m-swap__back')).toBeVisible();
});
