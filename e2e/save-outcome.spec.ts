/**
 * E2E · 导出落点回显（DEV_PLAN C2 / OPT_PLAN 专项 A1）
 *
 * 三端各一条：
 * 1. **浏览器**：真的触发下载，且提示说清"落在浏览器下载目录"；
 * 2. **Tauri 桌面**：同一落点，但文案不叫"浏览器"（那一端没有这个概念）；
 * 3. **安卓 WebView**：`showSaveFilePicker` 是桩（立刻抛 AbortError）⇒ 不许说
 *    "已保存"，必须说清"去哪找"。这条正是"点了导出没反应"的回归防线。
 *
 * 用"导出审计 JSON"这个入口：它不需要任何造数（审核日志为空也能导出），
 * 断言点全在"提示说了什么"上，不依赖业务数据形状。
 */
import { test, expect, type Page } from '@playwright/test';

/** 打开设置 → 数据分类，等导出按钮出现 */
async function openAuditExport(page: Page): Promise<void> {
  await page.goto('/settings?cat=data');
  // 「数据操作审计日志」在「运维与兼容」折叠段里（默认收起），先展开
  const collapse = page.getByRole('button', { name: /运维与兼容/ });
  await collapse.waitFor({ state: 'visible' });
  if ((await collapse.getAttribute('aria-expanded')) !== 'true') await collapse.click();
  // 路由组件是懒加载 chunk：等真正的按钮，不要等 app 外壳
  await page.getByRole('button', { name: '导出审计 JSON' }).waitFor({ state: 'visible' });
}

const TOAST = '.toast-message';

test('浏览器：触发下载，提示说清落在浏览器下载目录', async ({ page }) => {
  await openAuditExport(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出审计 JSON' }).click();

  // ① 下载真的发生了（不是只弹了一句提示）
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.json$/);

  // ② 提示说清落点
  await expect(page.locator(TOAST)).toContainText('已保存');
  await expect(page.locator(TOAST)).toContainText('浏览器下载目录');
});

test('Tauri 桌面：同一落点，但文案不说"浏览器"', async ({ page }) => {
  // Tauri 的 UA 与普通浏览器一致，只靠这个全局标记区分
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  await openAuditExport(page);

  await page.getByRole('button', { name: '导出审计 JSON' }).click();

  await expect(page.locator(TOAST)).toContainText('已保存');
  await expect(page.locator(TOAST)).toContainText('系统下载目录');
  await expect(page.locator(TOAST)).not.toContainText('浏览器');
});

test.describe('安卓 WebView', () => {
  // `; wv)` 是安卓 WebView 的 UA 标记（isAndroidWebView 认的就是它）
  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36',
  });

  test('面板是桩（立刻抛 AbortError）⇒ 不说已保存，说清去哪找', async ({ page }) => {
    // 复刻真机实测的桩行为：函数存在、能调用、十几毫秒内抛 AbortError、不拉界面
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).showSaveFilePicker = () =>
        Promise.reject(Object.assign(new Error('user aborted'), { name: 'AbortError' }));
    });
    await page.goto('/settings?cat=data');
    // 窄屏下设置是两级页面：先进「数据」分类
    const dataCat = page.locator('.settings-nav-item[data-cat="data"]');
    if (await dataCat.isVisible().catch(() => false)) await dataCat.click();
    // 展开「运维与兼容」，再等导出按钮
    const collapse = page.getByRole('button', { name: /运维与兼容/ });
    await collapse.waitFor({ state: 'visible' });
    if ((await collapse.getAttribute('aria-expanded')) !== 'true') await collapse.click();
    await page.getByRole('button', { name: '导出审计 JSON' }).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: '导出审计 JSON' }).click();

    // 关键断言：**不许**说"已保存"（旧实现归成 cancelled 后干脆什么都不说）
    await expect(page.locator(TOAST)).toContainText('不支持选择保存位置');
    await expect(page.locator(TOAST)).not.toContainText('已保存');
  });
});
