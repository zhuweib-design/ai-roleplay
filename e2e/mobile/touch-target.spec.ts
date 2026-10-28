/**
 * E2E · 触摸目标 ≥44px 比例（MOBILE_PLAN 批次 3-2 / 3-3 / DEV_PLAN B2、B3）
 *
 * 判据：独立可点元素 **≥44px 比例 ≥90%**（390 / 360 两档）。
 *
 * 为什么量"有效命中区"而不是 `getBoundingClientRect()`：
 * 批次 3-3 的手法是用透明伪元素把命中区撑到 44、**视觉尺寸不变**（就绪条 chip
 * 只有 25px 高，撑到 44 会把"就绪条单行 ≤44"那条判据撑破）。伪元素不改变元素的
 * rect，所以 rect 量法会把这些"已经够好点"的控件算成不合格——那是量错了东西。
 * 这里用 `elementFromPoint` 从中心向外逐像素探，探到"点不到自己"为止，
 * 得到的就是**手指实际能命中的尺寸**。
 *
 * 排除项只有一类：`.skip-link`（键盘专用，聚焦才出现，手指永远碰不到）。
 */
import { test, expect, type Page } from '@playwright/test';

/** 六个主要移动端页面：判据要求覆盖"独立可点元素"，不是某一页 */
const PAGES = ['/chat', '/character', '/group', '/more', '/settings', '/worldbook'];
const MIN_TARGET = 44;

interface ProbeResult {
  path: string;
  total: number;
  small: Array<{ cls: string; w: number; h: number }>;
  ratio: number;
}

async function measure(page: Page, path: string): Promise<ProbeResult> {
  await page.goto(path);
  await page.waitForSelector('#app-main > *');
  // 让懒加载的次级区块与字体度量稳定下来再量
  await page.waitForTimeout(350);

  const raw = await page.evaluate((minTarget) => {
    const SELECTOR = 'button, a[href], [role="button"], [role="tab"], input[type="checkbox"], select';

    /** 祖先里有 display:none / visibility:hidden / opacity:0 ⇒ 不可见 */
    function hiddenByAncestor(el: HTMLElement): boolean {
      let node: HTMLElement | null = el;
      while (node && node !== document.body) {
        const s = getComputedStyle(node);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return true;
        node = node.parentElement;
      }
      return false;
    }

    function hits(el: HTMLElement, x: number, y: number): boolean {
      const t = document.elementFromPoint(x, y);
      return !!t && (t === el || el.contains(t));
    }

    /** 从中心向外探，返回实际可命中的宽高（上限 60，够判定 44 即可） */
    function effectiveSize(el: HTMLElement): { w: number; h: number } {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const grow = (dx: number, dy: number): number => {
        let d = 0;
        while (d < 30 && hits(el, cx + dx * (r.width / 2 + d + 1), cy + dy * (r.height / 2 + d + 1))) d += 1;
        return d;
      };
      return {
        w: Math.round(r.width + grow(-1, 0) + grow(1, 0)),
        h: Math.round(r.height + grow(0, -1) + grow(0, 1)),
      };
    }

    const visible = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
      if (el.classList.contains('skip-link')) return false; // 键盘专用
      if (hiddenByAncestor(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      // 只量**完整落在视口内**的元素：被视口边缘裁掉的元素，向外探针伸不出去，
      // 量出来必然偏小（实测第 4 张卡的星标 y=826，命中区被下边缘截断 ⇒ 24×24）。
      // 那不是"控件太小"，是"它有一半在屏幕外"，两种问题不能混在一个指标里。
      if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) {
        return false;
      }
      return true;
    });

    const small: Array<{ cls: string; w: number; h: number }> = [];
    for (const el of visible) {
      const { w, h } = effectiveSize(el);
      if (w < minTarget || h < minTarget) {
        small.push({ cls: String(el.className || el.tagName).slice(0, 36), w, h });
      }
    }
    return { total: visible.length, small };
  }, MIN_TARGET);

  return {
    path,
    total: raw.total,
    small: raw.small,
    ratio: raw.total === 0 ? 1 : 1 - raw.small.length / raw.total,
  };
}

for (const width of [390, 360]) {
  test.describe(`${width} 宽 · 触摸目标`, () => {
    test(`六个主要页面独立可点元素 ≥${MIN_TARGET}px 的比例 ≥90%`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });

      const results: ProbeResult[] = [];
      for (const path of PAGES) results.push(await measure(page, path));

      const report = results
        .map(
          (r) =>
            `${r.path}: ${(r.ratio * 100).toFixed(1)}%（${r.total - r.small.length}/${r.total}）` +
            (r.small.length ? `\n    不足：${r.small.map((s) => `${s.cls} ${s.w}×${s.h}`).join(' ｜ ')}` : '')
        )
        .join('\n  ');

      test.info().annotations.push({ type: `读数 ${width}`, description: report });
      // 同时打到 stdout：list reporter 不显示 annotation，CI 日志里得能看见读数
      console.log(`\n[${width}px]\n  ${report}`);

      const failed = results.filter((r) => r.ratio < 0.9);
      expect(
        failed.map((r) => `${r.path} = ${(r.ratio * 100).toFixed(1)}%`),
        `这些页面的可点元素不足 ${MIN_TARGET}px：\n  ${report}`
      ).toEqual([]);
    });
  });
}
