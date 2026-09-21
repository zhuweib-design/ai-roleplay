import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';

/**
 * E2E · 颜色对比度（WCAG 2.1 AA · 需求6）
 *
 * 在真实浏览器（Edge 渲染）中运行 axe color-contrast 规则，验证全部 5 主题
 * （dark / light / midnight / oled / theatre）下：
 * - 文本对比 ≥4.5:1、非文本 ≥3:1
 *
 * 覆盖范围：
 * 1) 设置页（主题卡片、分类侧边栏、输入框、按钮、标签、分隔线）· 5 主题
 * 2) 对话页（导航栏、消息区、输入框等主交互组件）· 5 主题
 * 3) 2026-09 全路由审计中出过违规的 7 条路由 · **全量 5 主题**（7×5=35 次扫描）
 */
const THEMES = ['dark', 'light', 'midnight', 'oled', 'theatre'];

/**
 * 2026-09 全路由 × 全主题审计中曾出现违规的 7 条路由。
 * 采用**全量 5 主题**覆盖（7×5=35 次扫描）而非抽样：
 * 实测（本地 6 worker）35 次与 11 次抽样在**全量 E2E 墙钟耗时上相同（均 ~71s）**——
 * 该用例与其它 E2E 并行执行，未落在关键路径上；单独跑 `contrast-axe` 文件时
 * 35 次约 38s、11 次约 22s（+16s），仍在可接受范围。故用全覆盖换取零漏检。
 */
const AUDITED_ROUTES = [
  '/image-gen',
  '/profile',
  '/character',
  '/local-model',
  '/story',
  '/community-market',
  '/random-events',
];

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

/**
 * 等待 toast/消息淡入等过渡动画结束，再运行 axe。
 *
 * 为什么必须是 450ms、不要为了提速改小：
 * 实测对话页消息淡入期间元素处于半透明中间态，若在 ~350ms 采样，axe 会把
 * 混合后的中间色误判为对比度不足（dark /chat 曾误报 6 个 .msg-narration 节点，
 * 稳定后为 0）。450ms 留足过渡余量，避免这类「假阳性」。
 */
async function settle(page: Page) {
  await page.waitForTimeout(450);
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
    await settle(page);

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
    await settle(page);

    const violations = await axeContrast(page);
    const summary = violations.map((v) => `${v.id}(${v.nodes.length}): ${v.help}`).join(' | ');
    expect(violations, `theme=${theme} → ${summary}`).toHaveLength(0);
  }
});

test('对比度：7 条审计路由 × 5 主题无 WCAG AA 颜色对比违规', async ({ page }) => {
  // 35 次扫描 + 每次 450ms 稳定等待 → 单用例约 30s，超过默认 30s 超时，故显式放宽。
  test.setTimeout(90_000);
  await page.addInitScript({ content: axe.source });

  // 按主题分组执行：同一主题只切换一次，再依次访问全部审计路由（降低切主题开销）
  for (const theme of THEMES) {
    await applyTheme(page, theme);
    for (const route of AUDITED_ROUTES) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await settle(page);

      const violations = await axeContrast(page);
      const summary = violations.map((v) => `${v.id}(${v.nodes.length}): ${v.help}`).join(' | ');
      expect(violations, `route=${route} theme=${theme} → ${summary}`).toHaveLength(0);
    }
  }
});
