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

// 提示是**一条队列，同时只显示队首**（`src/utils/toast-service.ts`），错误提示活 5 秒。
// 所以每条断言都按"那一条提示"定位，不抓屏幕上任意一条：只要有别的提示排在队首，
// `toContainText` 就会一直拿到它，5 秒 expect 超时后红。
function savedToast(page: Page) {
  return page.locator(TOAST, { hasText: '已保存' });
}

test('浏览器：触发下载，提示说清落在浏览器下载目录', async ({ page }) => {
  await openAuditExport(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出审计 JSON' }).click();

  // ① 下载真的发生了（不是只弹了一句提示）
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.json$/);

  // ② 提示说清落点
  await expect(savedToast(page)).toContainText('浏览器下载目录');
});

test('Tauri 桌面：同一落点，但文案不说"浏览器"', async ({ page }) => {
  // Tauri 的 UA 与普通浏览器一致，只靠这个全局标记区分。
  //
  // 标记**必须等启动之后再打**。原因（2026-10-19 全量跑红的复盘）：`storage-factory` 在启动时
  // 就看这个标记选适配器，见到它换成 `TauriFSAdapter`，而这里的桩是个空对象、没有 `invoke`，
  // 于是设置一读一写都抛 "window.__TAURI_INTERNALS__.invoke is not a function" 并弹出错误提示。
  // 提示只显示队首那条、错误提示活 5 秒——负载一高，它就压在"已保存"前面迟迟不上屏，
  // 断言拿到的是那句报错。实测：12 个自旋进程的负载下连跑 4 次红 1 次，与全量跑同一条报错。
  //
  // 这样做的取舍：被测的是**提示文案按环境分叉**，`detectSaveEnv()` 是在点导出时读的，
  // 启动后补标记足够触发它；代价是这里模拟的不是"开机就在 Tauri 里"的完整环境，
  // 真到 Tauri 里的持久化路径由 `src/storage/tauri-fs-adapter.ts` 的单测与桌面端实跑覆盖，不靠这条。
  await openAuditExport(page);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  await page.getByRole('button', { name: '导出审计 JSON' }).click();

  const saved = savedToast(page);
  await expect(saved).toBeVisible();
  await expect(saved).toContainText('系统下载目录');
  await expect(saved).not.toContainText('浏览器');
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
    const unsupported = page.locator(TOAST, { hasText: '不支持选择保存位置' });
    await expect(unsupported).toBeVisible();
    await expect(unsupported).not.toContainText('已保存');
  });
});
