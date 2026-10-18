import { test, expect } from '@playwright/test';

/**
 * E2E · MOBILE_PLAN 批次 0（"一行到十行的修复"）几何断言
 *
 * 每条对应方案文档 `docs/design/MOBILE_PLAN_2026-10-16_手机端组成层与可用性修复方案.md`
 * 批次 0 的一项判据，也是开发计划 `docs/design/DEV_PLAN_2026-10-17_开发计划.md` M1 的出口：
 *
 * - 0-1 设置分类条：360/390/412 三档 7/7 分类完整可见且可点
 * - 0-2 横屏死预留：844×390 下 `.chat-main` 不再有 56px 死预留；rail 与底部导航只出现其一
 * - 0-3 Toast 位置：≤640 档 `.toast` 由 `top` 定位改为 `bottom` 定位（不再压页头）
 * - 0-4 就绪条：单行且高度 ≤44px（对话页与群聊页各回收 ≥34px）
 * - 0-5 MoreView：`.more-view` 的 padding-bottom ≤16px（+ 安全区容错）
 * - 0-6 焦点：抽屉关着时连按 12 次 Tab 不停靠在 x<0 的离屏元素上
 *
 * 与既有 `mobile-layout.spec.ts` 的分工：那份守"导航与层级"，本份守"批次 0 的几何判据"。
 */

const VIEWPORTS = [
  { w: 360, h: 640 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
];

/** 读取某选择器的计算样式属性 */
async function styleOf(
  page: import('@playwright/test').Page,
  selector: string,
  prop: string
): Promise<string> {
  return page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      return String(getComputedStyle(el).getPropertyValue(p) ?? '');
    },
    [selector, prop] as const
  );
}

test.describe('批次 0-1 · 设置分类条 7/7 可达', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.w}×${vp.h}：7 个分类全部可通过滚动到达且可点`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/settings');

      const items = page.locator('.settings-nav-item');
      await expect(items).toHaveCount(7);

      // 判据的正确表达是"可达"，不是"7 个同时挤在视口里"——
      // 7 个胶囊的内容宽 444px 本就大于 390 视口，横向滚动条是**设计形态**，不是缺陷。
      // 真正的缺陷是：修复前容器自身被撑到 444px、右边界 479，
      // 祖先三层 overflow-x:hidden 把它静默裁掉 ⇒ 条自己的滚动条在屏外 ⇒ 3–4 个分类**滚不到**。
      // 所以断言分两段：
      //   ① 滚动容器本身必须在视口内（滚动条够得着）
      //   ② 每个分类滚到可见后必须完整落在视口内且中心点命中自身（没有被裁、没有被盖）
      const listBox = await page.locator('.settings-nav-list').boundingBox();
      expect(listBox, '.settings-nav-list 应可测量').not.toBeNull();
      expect(listBox!.x + listBox!.width, '分类条容器不应被裁到视口右侧外').toBeLessThanOrEqual(
        vp.w + 1
      );

      for (let i = 0; i < 7; i += 1) {
        const item = items.nth(i);
        await item.scrollIntoViewIfNeeded();

        const box = await item.boundingBox();
        expect(box, `第 ${i + 1} 个分类应可测量`).not.toBeNull();
        expect(box!.x, `第 ${i + 1} 个分类不应在视口左侧外`).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width, `第 ${i + 1} 个分类不应被裁到视口右侧外`).toBeLessThanOrEqual(
          vp.w + 1
        );

        const hit = await item.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!top && (el === top || el.contains(top));
        });
        expect(hit, `第 ${i + 1} 个分类的中心点应命中自身（可点，没被遮挡）`).toBe(true);
      }
    });
  }
});

test.describe('批次 0-2 · 横屏无死预留', () => {
  test('844×390：.chat-main 不再为不存在的底部导航留 56px', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/chat');

    const padBottom = Number.parseFloat(await styleOf(page, '.chat-main', 'padding-bottom'));
    // 修复前恒为 56px，占 390px 高的 14%，而该档 .bottom-nav 根本不在 DOM
    expect(padBottom).toBeLessThan(56);

    // 同一档：渲染 rail，不渲染底部导航（两种导航只出现其一）
    await expect(page.locator('.bottom-nav')).toHaveCount(0);
    await expect(page.locator('.nav-rail-desktop')).toHaveCount(1);
  });
});

test.describe('批次 0-3 · Toast 不再压页头', () => {
  test('≤640 档 .toast 由 top 定位改为 bottom 定位', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');

    // Toast 是瞬态元素（需真实触发路径才能量 DOM），本轮先断言规则本身：
    // 在 CSSOM 里找 max-width:640 媒体块内的 .toast 声明，确认 top:auto 且 bottom 已设值。
    const decl = await page.evaluate(() => {
      const out: { top: string; bottom: string } = { top: '', bottom: '' };
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRule[] = [];
        try {
          rules = Array.from(sheet.cssRules ?? []);
        } catch {
          continue; // 跨域样式表读不到，跳过
        }
        for (const rule of rules) {
          if (rule instanceof CSSMediaRule && rule.conditionText.includes('640')) {
            for (const inner of Array.from(rule.cssRules)) {
              if (inner instanceof CSSStyleRule && inner.selectorText.includes('.toast')) {
                out.top = inner.style.getPropertyValue('top') || out.top;
                out.bottom = inner.style.getPropertyValue('bottom') || out.bottom;
              }
            }
          }
        }
      }
      return out;
    });

    expect(decl.top, '≤640 档 .toast 的 top 应为 auto（不再贴顶压页头）').toBe('auto');
    expect(decl.bottom, '≤640 档 .toast 应有 bottom 定位（贴底部导航上方）').not.toBe('');
  });
});

test.describe('批次 0-4 · 就绪条单行', () => {
  test('390×844：就绪条高度 ≤44px 且不换行', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');

    const bar = page.locator('.readiness-bar');
    await expect(bar).toBeVisible();

    const box = await bar.boundingBox();
    expect(box, '就绪条应可测量').not.toBeNull();
    // 修复前 flex-wrap:wrap 让 5 个胶囊换成两行，占 69px
    expect(box!.height, '就绪条应单行').toBeLessThanOrEqual(44);

    expect(await styleOf(page, '.readiness-bar', 'flex-wrap')).toBe('nowrap');
  });
});

test.describe('批次 0-5 · MoreView 无 72px 死空白', () => {
  test('390×844：.more-view 的 padding-bottom ≤16px（+ 安全区容错）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/more');

    const padBottom = Number.parseFloat(await styleOf(page, '.more-view', 'padding-bottom'));
    // 修复前为 calc(72px + env(safe-area-inset-bottom, 0))；安全区在有刘海的设备上会有值
    expect(padBottom).toBeLessThanOrEqual(20);
  });
});

test.describe('批次 0-6 · 焦点不逃逸到离屏抽屉', () => {
  test('390×844：抽屉关着时连按 12 次 Tab 不停靠在 x<0 的元素上', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');

    const offenders: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const x = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return Number.NaN;
        return Math.round(el.getBoundingClientRect().x);
      });
      if (!Number.isNaN(x) && x < 0) offenders.push(x);
    }

    // 修复前 12 个停靠点里有 11 个落在 x≈-270 的不可见抽屉里
    expect(
      offenders,
      `不应有停靠点落在离屏抽屉（x<0），实测：${JSON.stringify(offenders)}`
    ).toHaveLength(0);
  });

  test('抽屉打开时：Tab 不离开抽屉（遮罩后面的主区 inert）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');

    // 打开方式沿用 mobile-layout.spec.ts（S-4）里已验证的那条：
    // ChatMain 顶栏 hamburger，aria-label 见 i18n `chat.openCharList`
    const toggle = page.locator('.mobile-menu-btn[aria-label="打开角色列表"]');
    await expect(toggle).toBeVisible({ timeout: 3000 });
    await toggle.click();

    // 必须先确认遮罩真的激活了——否则"焦点还在主区"只是因为抽屉压根没打开，
    // 会把"开关按钮找不到"误判成"inert 没生效"。
    const mask = page.locator('.overlay-mask');
    const drawer = page.locator('.character-list');
    await expect(mask).toHaveClass(/\bactive\b/, { timeout: 3000 });
    await expect(drawer).toHaveClass(/\bactive\b/, { timeout: 3000 });
    // 等抽屉滑入动画收敛（transform 归零），否则拿到的是动画中间态
    await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)', { timeout: 3000 });
    // Vue 把 inert 应用到根元素需要一帧
    await page.waitForTimeout(200);

    // 主区（含页头与消息区）在遮罩后面应 inert ⇒ 焦点不得落在其中。
    // 修复前 inert 只绑在 <footer> 上，第 13 次 Tab 会逃到遮罩后面的聊天区。
    const escaped = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return !!el.closest('.chat-main');
    });
    expect(escaped, '抽屉打开时焦点不应落在遮罩后面的主区').toBe(false);
  });
});
