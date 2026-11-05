import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 弹窗内部的触摸命中区（2D-P1-04 里"弹窗内部"那一半）
 *
 * 为什么单开一条：既有 `touch-target.spec.ts` 量的是 `#app-main` 里的页面级控件，
 * 而弹窗挂在 body 下，从来不在它的选择器范围内。于是 2D 从代码里读出的
 * 「弹窗按钮 32 高、关闭键 26」一直没有任何门禁盯着——不是回归，是判据没覆盖。
 *
 * 量法与那条 spec 完全一致：`elementFromPoint` 从中心向外逐像素探，量**手指实际
 * 能命中的尺寸**，所以用透明伪元素撑命中区（不改视觉）的做法在这里是算数的。
 *
 * 阈值取"一个都不许少"而不是 ≥90%：一个对话框里可点元素只有 2-5 个，
 * 按比例会在"4 个里坏 1 个"时放行，那正是这里要拦的情形。
 */

const VIEW_W = 390;
const VIEW_H = 844;
const MIN_TARGET = 44;

interface Offender {
  cls: string;
  text: string;
  w: number;
  h: number;
}

/** 量当前打开的对话框内部；没有对话框时返回 null */
async function probeDialog(page: Page): Promise<{ total: number; small: Offender[] } | null> {
  return page.evaluate((min) => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const SELECTOR = 'button, a[href], [role="button"], input[type="checkbox"], select';
    const hidden = (el: HTMLElement) => {
      let n: HTMLElement | null = el;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return true;
        n = n.parentElement;
      }
      return false;
    };
    const hits = (el: HTMLElement, x: number, y: number) => {
      const t = document.elementFromPoint(x, y);
      return !!t && (t === el || el.contains(t));
    };
    const size = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const grow = (dx: number, dy: number) => {
        let d = 0;
        while (d < 30 && hits(el, cx + dx * (r.width / 2 + d + 1), cy + dy * (r.height / 2 + d + 1))) d += 1;
        return d;
      };
      return {
        w: Math.round(r.width + grow(-1, 0) + grow(1, 0)),
        h: Math.round(r.height + grow(0, -1) + grow(0, 1)),
      };
    };
    const els = Array.from(dialog.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
      if (hidden(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) return false;
      // 中心点必须命中自己：被同层别的元素盖住时，向外探必然探不出去
      const r2 = el.getBoundingClientRect();
      return hits(el, r2.left + r2.width / 2, r2.top + r2.height / 2);
    });
    const small: Offender[] = [];
    for (const el of els) {
      const { w, h } = size(el);
      if (w < min || h < min) {
        small.push({
          cls: String(el.className || el.tagName).slice(0, 40),
          text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 16),
          w,
          h,
        });
      }
    }
    return { total: els.length, small };
  }, MIN_TARGET);
}

const format = (r: { total: number; small: Offender[] } | null) =>
  r === null ? '（没找到对话框）' : `${r.total - r.small.length}/${r.total} 达标` + (r.small.length ? `；不足：${r.small.map((s) => `${s.cls} "${s.text}" ${s.w}×${s.h}`).join(' ｜ ')}` : '');

test.describe('弹窗内部命中区（390 宽）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('首次引导弹窗内每个可点元素有效命中区 ≥44', async ({ page }) => {
    await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
    await page.goto('/');
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);
    const result = await probeDialog(page);
    test.info().annotations.push({ type: '引导弹窗读数', description: format(result) });
    console.log(`\n[引导弹窗] ${format(result)}`);
    expect(result?.small ?? [], '引导弹窗里有可点元素命中区不足 44').toEqual([]);
    expect(result!.total, '判据空跑：弹窗里一个可点元素都没量到').toBeGreaterThanOrEqual(2);
  });

  test('确认删除弹窗内每个可点元素有效命中区 ≥44', async ({ page }) => {
    await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
    await page.goto('/');
    // 这一条要的是"确认弹窗"，先把引导关掉
    const close = page.getByRole('button', { name: /关闭|以后再说|跳过/ }).first();
    if (await close.count()) await close.click().catch(() => undefined);
    await page.evaluate(() => localStorage.setItem('ai-roleplay:onboarding-done', '1'));

    await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const req = indexedDB.open('ai-roleplay', 6);
          req.onsuccess = () => {
            const db = req.result;
            const now = new Date().toISOString();
            const tx = db.transaction(['characters'], 'readwrite');
            tx.objectStore('characters').put({
              id: 'mtt-a',
              name: '命中区角色',
              description: '只为了开一次确认弹窗',
              personality: '',
              scenario: '',
              firstMessage: '',
              alternateGreetings: [],
              exampleMessages: '',
              characterNote: null,
              talkativeness: 50,
              tags: [],
              favorite: false,
              version: '1.0',
              createdAt: now,
              updatedAt: now,
              messages: [],
            });
            tx.oncomplete = () => {
              db.close();
              resolve('ok');
            };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        })
    );

    await page.goto('/character');
    await page.locator('.char-card', { hasText: '命中区角色' }).click();
    await page.locator('.bs-panel').getByRole('button', { name: '删除' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400);
    const result = await probeDialog(page);
    test.info().annotations.push({ type: '确认弹窗读数', description: format(result) });
    console.log(`\n[确认删除弹窗] ${format(result)}`);
    expect(result?.small ?? [], '确认删除弹窗里有可点元素命中区不足 44').toEqual([]);
    expect(result!.total, '判据空跑：弹窗里一个可点元素都没量到').toBeGreaterThanOrEqual(2);
  });
});
