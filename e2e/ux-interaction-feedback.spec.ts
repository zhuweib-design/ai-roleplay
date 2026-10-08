/**
 * M2-b9：交互反馈的浏览器级证据
 *
 * 用户原话："提示弹窗需要自动关闭，目前按钮样式交互、滑块样式交互中颜色没有明显的变化，不太明显"。
 * 三条都要在真实浏览器里量到，而不是只看 CSS 文本：
 * 1. 滑块：轨道着色必须跟着值走（键盘与鼠标两条改值路径），且可点区域不能只有 4px 一条线；
 * 2. 按钮：悬停/按下必须有计算样式变化，侧栏激活项这种"组件自己写了 background 简体"的
 *    情况以前会把全局着色抹平（实测过），这里当回归点守住；
 * 3. 提示弹窗：会自己关、有倒计时条、鼠标停在上面时冻结。
 *
 * **本文件只用不改数据的触发路径**（改值都落在组件的本地 ref 上，提示走"发送被拦住"的守卫分支）。
 * 原因实测过：最初这里用设置页的"清除背景"触发提示，`webkit` project 里紧随其后的
 * `ux-prompt-trace` 稳定变红——刷新后 IndexedDB 的 `settings.app` 变成 `{apiProfiles: [], chatBackground:{type:'none'}}`，
 * 即本文件某次 `persistSettings()` 的快照落到了后面那个 context 里（同一 webkit 进程共享存储目录）。
 * 单跑 `ux-prompt-trace` 永远绿，所以只在本文件的用例里加"写设置"这一步就会触发。
 * 结论：这条链路是提示与着色的证据，不该顺带改用户数据。
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

async function dismissWelcomeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
}

const pctOf = (loc: Locator) =>
  loc.evaluate((el: HTMLInputElement) => el.style.getPropertyValue('--range-pct'));
const valueOf = (loc: Locator) => loc.evaluate((el: HTMLInputElement) => el.value);
const fillOf = (loc: Locator) =>
  loc.evaluate((el: HTMLInputElement) => getComputedStyle(el).backgroundImage);

test.describe('滑块进度着色', () => {
  test('轨道着色跟随值变化，可点区域够厚', async ({ page }) => {
    await page.goto('/settings');
    await dismissWelcomeModal(page);
    // 外观页的 .form-range 只绑组件本地 ref，改值不落盘
    const slider = page.locator('input.form-range').first();
    await expect(slider).toBeVisible();

    const pct = await pctOf(slider);
    expect(pct).toMatch(/^\d+(\.\d+)?%$/);
    expect(await fillOf(slider)).toContain('linear-gradient');

    await slider.focus();
    await page.keyboard.press('End');
    await expect.poll(() => pctOf(slider)).toBe('100.00%');
    expect(await fillOf(slider)).toMatch(/rgb\([^)]+\) 0px, rgb\([^)]+\) 100%/);

    await page.keyboard.press('Home');
    await expect.poll(() => pctOf(slider)).toBe('0.00%');
    expect(await fillOf(slider)).toMatch(/0px, rgb\([^)]+\) 0%/);

    // 鼠标拖动：从轨道偏左拖到偏右，值与着色都要跟
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
    }
    expect(Number((await pctOf(slider)).replace('%', ''))).toBeGreaterThan(50);
    expect(await valueOf(slider)).not.toBe('0');

    // 命中区域：可见轨道仍是一条细带，但盒子必须够厚才点得到拇指
    expect(box!.height).toBeGreaterThanOrEqual(16);
    const band = await slider.evaluate((el: HTMLInputElement) => getComputedStyle(el).backgroundSize);
    expect(band).toMatch(/^100% \d+px/);
  });

  test('聊天面板的 .tk-range 同样着色（只读检查，不改角色数据）', async ({ page }) => {
    await page.goto('/chat');
    await dismissWelcomeModal(page);
    const slider = page.locator('input.tk-range').first();
    await expect(slider).toBeVisible();
    expect(await fillOf(slider)).toContain('linear-gradient');
    expect(await pctOf(slider)).toMatch(/^\d+(\.\d+)?%$/);
    const box = await slider.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(16);
  });
});

test.describe('按钮按压反馈', () => {
  test('悬停与按下都有计算样式变化（含侧栏激活项）', async ({ page }) => {
    await page.goto('/chat');
    await dismissWelcomeModal(page);
    const active = page.locator('.nav-item.active').first();
    await expect(active).toBeVisible();

    const shadow = () => active.evaluate((el) => getComputedStyle(el).boxShadow);
    const idle = await shadow();
    await active.hover();
    await expect.poll(() => shadow()).not.toBe(idle);
    expect(await shadow()).toContain('inset');

    await page.mouse.down();
    await expect
      .poll(() => active.evaluate((el) => getComputedStyle(el).transform))
      .toMatch(/matrix\(1, 0, 0, 1, 0, 1\)/);
    await page.mouse.up();
  });

  test('禁用按钮不参与着色', async ({ page }) => {
    await page.goto('/chat');
    await dismissWelcomeModal(page);
    await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.id = 'probe-disabled';
      btn.disabled = true;
      btn.textContent = 'x';
      document.body.appendChild(btn);
    });
    const probe = page.locator('#probe-disabled');
    const before = await probe.evaluate((el) => getComputedStyle(el).boxShadow);
    await probe.hover({ force: true });
    expect(await probe.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(before);
  });
});

/** 走"发送被拦住"的守卫分支：只出提示，不落任何数据 */
async function raiseInfoToast(page: Page): Promise<Locator> {
  const input = page.getByLabel('输入消息');
  await expect(input).toBeVisible();
  await input.fill('这条不会发出去');
  await page.keyboard.press('Enter');
  const toast = page.locator('.toast');
  await expect(toast).toBeVisible();
  return toast;
}

test.describe('提示弹窗自动关闭', () => {
  test('提示几秒后自己消失，且带倒计时条', async ({ page }) => {
    await page.goto('/chat');
    await dismissWelcomeModal(page);
    const toast = await raiseInfoToast(page);
    const bar = page.locator('[data-toast-countdown]');
    await expect(bar).toBeVisible();

    const scale = async () =>
      Number(/scaleX\(([\d.]+)\)/.exec(await bar.evaluate((el: HTMLElement) => el.style.transform))?.[1] ?? '1');
    const first = await scale();
    expect(first).toBeLessThan(1);
    await page.waitForTimeout(1200);
    expect(await scale()).toBeLessThan(first);

    await expect(toast).toBeHidden({ timeout: 6000 });
  });

  test('鼠标停在提示上时计时冻结，移开后继续关闭', async ({ page }) => {
    await page.goto('/chat');
    await dismissWelcomeModal(page);
    const toast = await raiseInfoToast(page);
    await toast.hover();
    const bar = page.locator('[data-toast-countdown]');
    const frozen = await bar.evaluate((el: HTMLElement) => el.style.transform);
    // 3s 的时长，悬停 4.5s 仍在 ⇒ 计时确实被暂停
    await page.waitForTimeout(4500);
    expect(await bar.evaluate((el: HTMLElement) => el.style.transform)).toBe(frozen);
    await expect(toast).toBeVisible();

    await page.mouse.move(10, 400);
    await expect(toast).toBeHidden({ timeout: 5000 });
  });
});
