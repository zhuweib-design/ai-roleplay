import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * 主题皮肤的"点卡 → 确认已落盘"这一步的公共实现。
 *
 * 为什么需要它：主题写盘是**异步**的，而皮肤一多，"点完卡立刻导航"就会踩到竞态——
 * 文档重新加载时那次写入还没落，应用回落到默认皮肤。实测两种表现：
 * - 中性网「brutal」一条红了 143 处，每一条实得值都是 dark 的（`rgb(245,245,247)`、
 *   `border-radius: 12px`、`1px` 边框），也就是整份采样采的是另一套皮肤；
 * - `theme-flow` 刷新后回的是循环末尾点击的那款，不是键盘选中的那款。
 *
 * 为什么判据是"读盘"而不是"reload 后看 data-theme"：后者看着更真实，实际会**稳定失败**。
 * 实测把验证写成 reload 轮询后，brutal 在 30s 内一次都没成立过——reload 会让应用重新读盘，
 * 读到的还是旧值，随后那次"读档回写"又盖掉刚点的新值，于是每轮都输。
 * 直接读 IndexedDB 里那条设置记录不引入导航，写入落地了就是落地了。
 *
 * 库/表/键见 `src/storage/indexeddb-adapter.ts`：db=`ai-roleplay`，store=`settings`，key=`app`。
 */

/** 读盘上那条设置记录里的 theme；读不到时把实际看到的东西原样返回，便于失败信息指认结构 */
function readPersistedTheme(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open('ai-roleplay');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('settings')) {
            db.close();
            resolve('(库里没有 settings 这个 store)');
            return;
          }
          const get = db.transaction('settings', 'readonly').objectStore('settings').get('app');
          get.onsuccess = () => {
            const rec = get.result as { theme?: string; value?: { theme?: string } } | undefined;
            db.close();
            resolve(rec?.value?.theme ?? rec?.theme ?? `(${JSON.stringify(get.result) ?? '记录为空'})`);
          };
          get.onerror = () => {
            db.close();
            resolve('(读取失败)');
          };
        };
        req.onerror = () => resolve('(打开失败)');
      })
  );
}

/** 等盘上那条记录的 theme 真的变成指定皮肤 */
export async function waitForPersistedTheme(page: Page, theme: string, timeout = 20_000): Promise<void> {
  await expect
    .poll(() => readPersistedTheme(page), {
      message: `${theme} 在 ${timeout / 1000}s 内没写进 IndexedDB（实得见上一条）`,
      timeout,
      intervals: [300, 600, 1200],
    })
    .toBe(theme);
}

/** 走真实 UI 切到指定皮肤，并等它落盘；调用方随后可以放心导航 */
export async function applyThemeAndWait(
  page: Page,
  theme: string,
  route = '/settings?cat=appearance'
): Promise<void> {
  await page.goto(route);
  const card = page.locator(`.theme-card[data-value="${theme}"]`);
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await waitForPersistedTheme(page, theme);
}
