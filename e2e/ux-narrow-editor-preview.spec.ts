/**
 * M8-a：窄屏时角色编辑器的"实时预览"不能被表单压住
 *
 * 根因（浏览器实测钉住，不是猜的）：`.editor-preview` 带 `overflow-y: auto`，
 * 而滚动容器**没有块方向的 max-content 高度**——切到单列后它的网格行轨塌成
 * 标题那一行（34px），盒子却照旧画 407px，于是下面的表单叠在它上面。
 * 断点里补 `overflow: visible` 后行轨变成 407.219px，重叠消失；
 * 只写 `height: auto` 无效（试过，行轨仍是 34px）。
 *
 * 这条只能在真实浏览器里量：jsdom 不做布局，`getBoundingClientRect` 全是 0。
 */
import { test, expect, type Page } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/character/seraphina/edit');
  await page.waitForSelector('.editor-preview');
  await page.waitForSelector('.form-section');
}

async function boxes(page: Page) {
  return page.evaluate(() => {
    const pv = document.querySelector('.editor-preview').getBoundingClientRect();
    const fs = document.querySelector('.form-section').getBoundingClientRect();
    return {
      preview: { top: pv.top, bottom: pv.bottom, height: pv.height },
      fieldset: { top: fs.top, bottom: fs.bottom },
      rows: getComputedStyle(document.querySelector('.editor-body')).gridTemplateRows,
    };
  });
}

for (const width of [390, 640, 1000, 1024]) {
  test(`预览卡与表单在 ${width}px 下不重叠`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openEditor(page);

    const b = await boxes(page);
    // 预览必须真的展开（塌成 34px 就是那个缺陷的指纹）
    expect(b.preview.height).toBeGreaterThan(300);
    // 预览排在表单前面，且两者不交叠
    expect(b.preview.top).toBeLessThan(b.fieldset.top);
    expect(b.fieldset.top).toBeGreaterThanOrEqual(b.preview.bottom - 1);
  });
}

test('≥1100px 仍是两列侧栏（滚动容器保留，别把桌面端一起改掉）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page);

  const side = await page.evaluate(() => {
    const pv = document.querySelector('.editor-preview');
    const fs = document.querySelector('.form-section');
    const a = pv.getBoundingClientRect();
    const b = fs.getBoundingClientRect();
    return {
      sideBySide: a.left >= b.right - 1,
      overflowY: getComputedStyle(pv).overflowY,
    };
  });
  expect(side.sideBySide).toBe(true);
  expect(side.overflowY).toBe('auto');
});
