import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';

/**
 * E2E · 颜色对比度（WCAG 2.1 AA · 需求6）
 *
 * 在真实浏览器（Edge 渲染）中运行 axe color-contrast 规则，验证全部内置皮肤
 * （dark / light / midnight / oled / theatre）下：
 * - 文本对比 ≥4.5:1、非文本 ≥3:1
 *
 * 覆盖范围：
 * 1) 设置页（主题卡片、分类侧边栏、输入框、按钮、标签、分隔线）· 每款皮肤一次
 * 2) 对话页（导航栏、消息区、输入框等主交互组件）· 每款皮肤一次
 * 3) 2026-09 全路由审计中出过违规的 7 条路由 · **全部内置皮肤**（7 × 皮肤数 次扫描）
 */
// 清单来自 src/types 的 THEME_PRESETS（唯一的内置皮肤来源），新增皮肤不必再改这里
import { THEME_PRESETS } from '../src/types';
import { applyThemeAndWait } from './theme-persistence';

const THEMES: string[] = [...THEME_PRESETS];

/**
 * 2026-09 全路由 × 全主题审计中曾出现违规的 7 条路由。
 * 采用**全部内置皮肤**覆盖（7 × 皮肤数 次扫描）而非抽样：
 * 用全覆盖（零漏检）而非 11 次抽样；代价是这条曾经是全套里最慢的单点，
 * 因此下面按主题拆成了 5 条用例（见文件末尾的拆分原因）。
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

/**
 * 切换到指定主题：dark 为默认主题无需切换。
 * 落盘判据用 `theme-persistence.ts` 里那份（直接读 IndexedDB，不导航不 reload）——
 * 本用例是在同一个页面里连着切 9 款皮肤，用 reload 验证会稳定失败。
 */
async function applyTheme(page: Page, theme: string) {
  if (theme === 'dark') return;
  await applyThemeAndWait(page, theme, '/settings');
  await page.waitForTimeout(300);
}

/**
 * 等过渡动画全部结束再跑 axe。
 *
 * 原先是固定 `waitForTimeout(450)`：实测对话页消息淡入期间元素处于半透明中间态，
 * ~350ms 采样会让 axe 把混合后的中间色误判为对比度不足（dark /chat 曾误报 6 个
 * `.msg-narration`，稳定后为 0）。但固定时长是**猜的**：皮肤加到 9 款、4 worker 并发时
 * 它就不够了——实测「theatre + 9 款皮肤 + 4 worker」会红在 `.nav-item.active` 上，
 * axe 报的字色 #2d2618、底色 #ca536f 两个都不属于任何一套皮肤，正是 .15s 颜色过渡的中间帧。
 *
 * 改成问浏览器"还有在跑的动画吗"：`document.getAnimations()` 覆盖 transition 与 animation
 * 两类，长度为 0 才是真的静止。留 300ms 下限是为了不在"动画还没被派发出去"时就抢先通过。
 */
async function settle(page: Page) {
  await page.waitForTimeout(300);
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'paused').length
        ),
      { message: '2.5s 内仍有动画在跑，axe 会采到过渡中间色', timeout: 2500 }
    )
    .toBe(0);
}

test('对比度：每款皮肤下设置页无 WCAG AA 颜色对比违规', async ({ page }) => {
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

test('对比度：每款皮肤下对话页无 WCAG AA 颜色对比违规', async ({ page }) => {
  // 测量静态终态：系统减弱动画会禁用消息淡入，避免并发渲染时抽样到半透明帧。
  await page.emulateMedia({ reducedMotion: 'reduce' });
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

/**
 * 按主题拆成 5 条用例，而不是 1 条跑完 35 次扫描。
 *
 * 合在一起时它要 90s（自己的预算）且经常撞穿——撞穿的那一轮它还在占着 CPU，
 * 把同一批并行用例一起拖红（实测连带红过"任务中心"与 E19/E22）。
 * 拆开之后每条只有 7 次扫描、约 8–12s，红的时候也能直接说出是哪个主题出的问题。
 */
for (const theme of THEMES) {
  test(`对比度：审计路由 7 条在「${theme}」主题下无 WCAG AA 颜色对比违规`, async ({ page }) => {
    await page.addInitScript({ content: axe.source });
    await applyTheme(page, theme);
    for (const route of AUDITED_ROUTES) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await settle(page);

      const violations = await axeContrast(page);
      const summary = violations.map((v) => `${v.id}(${v.nodes.length}): ${v.help}`).join(' | ');
      expect(violations, `route=${route} theme=${theme} → ${summary}`).toHaveLength(0);
    }
  });
}
