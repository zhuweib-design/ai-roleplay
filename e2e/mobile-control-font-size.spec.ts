/**
 * E2E · 移动端可编辑控件的实际字号必须 ≥16px（I-7 的运行时版本，M23-c）
 *
 * 为什么再来一条：`scripts/i7-control-font-size-guard.mjs` 是静态扫 CSS 文本的，
 * 它判断"某条 <16px 的规则已被移动兜底覆盖"的依据是**同文件里有一条同选择器且 ≥16px 的规则**。
 * 但设置面板一族里有成批"scoped 样式 + 类名不在本模板"的死规则（2026-10-12 在真实 DOM 上实测：
 * `SettingsExtensionPanel.vue` 样式里的 `.field-input` / `.form-textarea` / `.custom-css-textarea`
 * / `.data-mgmt-select` / `.profile-input` 等 9 个类，元素全都不带本组件的 data-v 属性 ⇒ 命不中），
 * 这些死规则会被静态守卫算成"已覆盖"——**守卫自己可能是空跑的**。
 *
 * 这条用例不问 CSS 写了什么，只问浏览器最后算出多少：在 390 与 640 两个宽度下，
 * 遍历路由，取所有**可见**的 input / textarea / select，读它们的计算字号。
 *
 * 牙齿实测（2026-10-12）：把某条兜底规则改成 13px 后本用例红，还原后绿；
 * 对照见 CHANGELOG 的 M23-c 条目。
 */
import { test, expect, type Page } from '@playwright/test';

const ROUTES = [
  '/chat',
  '/character',
  '/character/new',
  '/worldbook',
  '/group',
  '/databank',
  '/story',
  '/random-events',
  '/community-market',
  '/local-model',
  '/image-gen',
  '/archives',
  '/guide',
  '/settings',
  '/settings?cat=model',
  '/settings?cat=retrieval',
  '/settings?cat=extension',
  '/settings?cat=data',
  '/settings?cat=security',
  '/settings?cat=appearance',
];

/** iOS 聚焦自动放大的阈值：可编辑控件的计算字号必须 ≥16px */
const MIN_PX = 16;

async function collectUnderSized(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (el.getAttribute('type') === 'hidden') continue;
      const px = parseFloat(cs.fontSize);
      if (!Number.isFinite(px) || px >= min) continue;
      const cls = [...el.classList].slice(0, 2).join('.');
      const owner = el.closest('[class]');
      out.push(
        `${el.tagName.toLowerCase()}${el.getAttribute('type') ? `[type=${el.getAttribute('type')}]` : ''}` +
          `.${cls || '-'} 字号 ${px}px（祖先 ${(owner?.className ?? '').toString().slice(0, 30)}）`
      );
    }
    return out;
  }, MIN_PX);
}

/**
 * 按"宽度 × 路由分组"切开，而不是一条用例跑完 19 条路由。
 *
 * 起因：全量 8 worker 实测这两条各用掉整整 60s 撞穿预算（红相是 timeout，不是字号违规），
 * 4 worker 也会随机红。一条用例里 19 次 `page.goto` 走的是 vite 的按需编译，冷模块图
 * 在并发下被放大——慢是并发争抢，不是断言变多。沿用本仓库既有做法：**沿用例本来就在
 * 遍历的那个维度切**（这里是路由），切完一条只有 4–5 次导航，红的时候也能直接说出
 * 是哪一段路由出的问题。下面那条"分组必须等于原清单"的自检保证切开没漏路由。
 */
const CHUNK = 5;
const ROUTE_GROUPS: string[][] = [];
for (let i = 0; i < ROUTES.length; i += CHUNK) ROUTE_GROUPS.push(ROUTES.slice(i, i + CHUNK));

test('I-7 用例的路由分组没有漏掉任何一条路由', () => {
  expect(ROUTE_GROUPS.flat()).toEqual(ROUTES);
});

for (const width of [390, 640]) {
  for (const [gi, group] of ROUTE_GROUPS.entries()) {
    test(
      `移动端 I-7 运行时判定：${width}px 宽 · 路由第 ${gi + 1}/${ROUTE_GROUPS.length} 组（${group[0]}…${group.at(-1)}）`,
      async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        const offenders: string[] = [];
        for (const route of group) {
          await page.goto(route);
          await expect.poll(async () => page.locator('#app button').count()).toBeGreaterThan(0);
          await page.keyboard.press('Escape').catch(() => {});
          const bad = await collectUnderSized(page);
          offenders.push(...bad.map((b) => `${route} → ${b}`));
        }
        expect(
          offenders,
          `以下可编辑控件在 ${width}px 下字号 <${MIN_PX}px（iOS Safari 聚焦会放大整页）：\n${offenders.join('\n')}`
        ).toEqual([]);
      }
    );
  }
}
