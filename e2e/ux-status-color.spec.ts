/**
 * M7-c：状态色口径的浏览器级断言
 *
 * 改前 `.status-completed` 这类规则不带元素限定，而卡片根元素与徽标吃同一个类，
 * 于是 `color` 从卡片一路继承下去——一份"已完成"的故事整张卡变绿（标题、人名、
 * 场景名全染上状态色）。真实浏览器实测过：改前 cardColor == titleColor == 状态绿。
 *
 * 这里钉的是**口径**而不是某个色号：颜色值从页面自己的 CSS 变量里读，
 * 换主题或调色板都不该让这条断言失效；断言的是"卡片正文不跟随状态色、
 * 徽标跟随、失败态额外给边框"。
 */
import { test, expect, type Page } from '@playwright/test';

const STATUSES = ['completed', 'analyzing', 'failed', 'pending'] as const;

async function seedStories(page: Page): Promise<void> {
  // 应用是异步开库的：紧跟在首次 goto 之后查 `indexedDB.databases()` 可能还是空，
  // 那会让下面取 [0].name 直接踩空（实测过这种时序抖动）。先等到库出现。
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          (await indexedDB.databases()).some((d) => d.name.startsWith('ai-roleplay'))
        ),
      { timeout: 15_000 }
    )
    .toBe(true);

  await page.evaluate(async () => {
    const dbs = (await indexedDB.databases()).filter((d) => d.name.startsWith('ai-roleplay'));
    const name = dbs.sort((a, b) => b.version - a.version)[0].name;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const now = Date.now();
    const stories = ['completed', 'analyzing', 'failed', 'pending'].map((status, i) => ({
      id: `story-color-${status}`,
      sourceFileName: `配色取证-${status}.txt`,
      depth: 'deep',
      status,
      createdAt: now + i,
      completedAt: now + i,
      textLength: 1200,
      chunkCount: 1,
      worldInfo: { name: '灰石诸国', type: '奇幻', description: '运河与石墙。' },
      characters: [{ name: '艾莉娅', description: '精灵法师。' }],
      scenes: [],
      events: [],
      scripts: [],
      protagonist: null,
    }));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('stories', 'readwrite');
      stories.forEach((s) => tx.objectStore('stories').put(s));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

test.describe('状态色只作用于徽标与边框', () => {
  test('四张不同状态的卡：正文色不跟随状态色，徽标跟随，失败态给红边框', async ({ page }) => {
    await page.goto('/story');
    await seedStories(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 断言全部用"四张卡互相比"，不读色号也不读 CSS 变量：
    // 换主题、调色板、改成 oklch 写法都不会让它假失败。
    const rows = await page.evaluate(() => {
      const cs = (el: Element | null, prop: string) =>
        el ? getComputedStyle(el)[prop as 'color'] : '';
      return [...document.querySelectorAll('.story-card')].map((card) => {
        const badge = card.querySelector('.status-badge');
        return {
          cls: card.className,
          cardColor: cs(card, 'color'),
          titleColor: cs(card.querySelector('.card-title'), 'color'),
          metaColor: cs(card.querySelector('.card-meta'), 'color'),
          badgeColor: cs(badge, 'color'),
          badgeBg: cs(badge, 'backgroundColor'),
          borderColor: cs(card, 'borderTopColor'),
        };
      });
    });

    const byStatus = new Map(rows.map((r) => [STATUSES.find((s) => r.cls.includes(s)) ?? '?', r]));
    expect([...byStatus.keys()].sort()).toEqual([...STATUSES].sort());

    // ① 正文色与状态无关：四张卡的标题/元信息/卡片自身颜色必须完全一致。
    //    改前它们各自等于自己的状态色（绿/蓝/红/橙），这条一测就破。
    //    用"四张互相比"而不是"和某个色号比"，换主题、调色板都不会假失败。
    const titles = new Set(rows.map((r) => r.titleColor));
    const cards = new Set(rows.map((r) => r.cardColor));
    const metas = new Set(rows.map((r) => r.metaColor));
    expect(titles.size, '标题色不该随状态变').toBe(1);
    expect(cards.size, '卡片自身不该设定跟随状态的 color').toBe(1);
    expect(metas.size, '元信息色不该随状态变').toBe(1);

    for (const [, row] of byStatus) {
      // ② 徽标才吃状态色，且带淡底
      expect(row.badgeColor).not.toBe(row.titleColor);
      expect(row.badgeBg).not.toBe('rgba(0, 0, 0, 0)');
    }
    // ③ 不同状态之间确实能靠徽标区分开（否则上面那条"不跟随"可能是把颜色抹平了）
    expect(new Set(rows.map((r) => r.badgeColor)).size).toBe(STATUSES.length);
    // ④ 失败态额外给红边框，其余状态不给
    const failedBorder = byStatus.get('failed')!.borderColor;
    expect(byStatus.get('completed')!.borderColor).not.toBe(failedBorder);
    expect(byStatus.get('analyzing')!.borderColor).not.toBe(failedBorder);
    expect(byStatus.get('pending')!.borderColor).not.toBe(failedBorder);
  });
});
