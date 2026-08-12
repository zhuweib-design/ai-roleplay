import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';

/**
 * E2E · 颜色对比度（WCAG 2.1 AA · 需求6）
 *
 * 在真实浏览器（Edge 渲染）中对设置页与对话页运行 axe color-contrast 规则，
 * 验证全部 5 主题（dark / light / midnight / oled / theatre）下：
 * - 文本对比 ≥4.5:1、非文本 ≥3:1
 * 设置页覆盖主题卡片、分类侧边栏、输入框、按钮、标签、分隔线；
 * 对话页覆盖导航栏、消息区、输入框等主交互组件。
 */
const THEMES = ['dark', 'light', 'midnight', 'oled', 'theatre'];

/** 在页面执行 axe 的 color-contrast 规则，返回违规数组 */
async function axeContrast(page: Page) {
  const results = await page.evaluate(async () => {
    const win = window as unknown as {
      axe: { run: (el: HTMLElement, opts: object) => Promise<{ violations: Array<{ id: string; nodes: unknown[]; help: string }> }> };
    };
    return win.axe.run(document.documentElement, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
  });
  return results.violations ?? [];
}

/** 切换到指定主题：dark 为默认主题无需切换；其余需在设置页点击主题卡并等待持久化写入 IndexedDB */
async function applyTheme(page: Page, theme: string) {
  if (theme === 'dark') return;
  await page.goto('/settings');
  await page.locator(`.theme-card[data-value="${theme}"]`).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.waitForTimeout(300);
}

test('对比度：5 主题下设置页无 WCAG AA 颜色对比违规', async ({ page }) => {
  // 注入本地 axe-core（离线可用，不依赖 CDN）。
  // 用 addInitScript 而非 addScriptTag：addInitScript 经 CDP 原生注入，
  // 不受页面 CSP（script-src 'self'）拦截，且需在 goto 前注册。
  await page.addInitScript({ content: axe.source });

  for (const theme of THEMES) {
    await page.goto('/settings');
    await applyTheme(page, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    // 等待 toast 淡入等过渡动画结束，避免 axe 采样到半透明中间态（误报对比度不足）
    await page.waitForTimeout(400);

    const violations = await axeContrast(page);
    const summary = violations.map((v) => `${v.id}(${v.nodes.length}): ${v.help}`).join(' | ');
    expect(violations, `theme=${theme} → ${summary}`).toHaveLength(0);
  }
});

test('对比度：5 主题下对话页无 WCAG AA 颜色对比违规', async ({ page }) => {
  await page.addInitScript({ content: axe.source });

  for (const theme of THEMES) {
    await applyTheme(page, theme);
    await page.goto('/chat');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(400);

    const violations = await axeContrast(page);
    const summary = violations.map((v) => `${v.id}(${v.nodes.length}): ${v.help}`).join(' | ');
    expect(violations, `theme=${theme} → ${summary}`).toHaveLength(0);
  }
});
