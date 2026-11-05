/**
 * 清掉屏幕上的提示浮层（toast）。
 *
 * 为什么要它：创建角色/群聊成功后会弹一条 success toast，在 ≤640 的移动档里 toast 底部定位，
 * 会盖住消息输入区。用例紧接着点"发送消息"就会被 toast 的关闭按钮拦截点击
 * （2026-10-26 在 mobile-functional 档实测：`<button aria-label="关闭通知"> intercepts pointer events`）。
 * 这是真实的移动端观感问题，已在 NEXT_STEPS 登记；用例这边先做成确定性等待，
 * 不靠"恰好几秒后它自己消失"。
 */
import type { Page } from '@playwright/test';

export async function clearToasts(page: Page, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = await page.locator('.toast').count();
    if (remaining === 0) return;
    const close = page.locator('.toast .toast-close').first();
    if ((await close.count()) > 0) {
      await close.click({ timeout: 1000 }).catch(() => undefined);
    }
    await page.waitForTimeout(120);
  }
}
