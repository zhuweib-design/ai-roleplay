import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 角色卡详情抽屉（MOBILE_PLAN 批次 1-5 / DEV_PLAN A11，方案乙）
 *
 * 证明四件事：
 * 1. **一屏 ≥3 张卡**——这是这条批次的核心判据。卡面四个 24px 动作按钮是
 *    "一屏一个主动作"的反例，也是一屏只有 1.5 张卡的直接原因；搬走后必须量出来。
 * 2. 手机卡面没有动作组（§6 决策乙 ②：卡面只留卡体本身可点）。
 * 3. 抽屉内三级排版齐全：简介/标签/统计 → 「开始对话」（唯一填充大按钮）→
 *    编辑/导出/删除一行；四动作可见可点（§8 验收原文）。
 * 4. 桌面完全不变：卡面四按钮仍在，点卡仍是直进编辑器。
 *
 * 造数直接写 IndexedDB（照 group-header-narrow 的做法）：这条用例只关心几何
 * 与动作流，走"新建角色"UI 会吃掉一半预算且证明不了组成层的事。
 */

const VIEW_W = 390;
const VIEW_H = 844;
const CHAR_IDS = ['cd-a', 'cd-b', 'cd-c', 'cd-d', 'cd-e'];

async function seedCharacters(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    (ids) =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => {
          const db = req.result;
          const now = new Date().toISOString();
          const chars = ids.map((id, i) => ({
            id,
            name: `抽屉角色${i + 1}`,
            description: `第 ${i + 1} 个角色的简介，用来填抽屉的确认区。`,
            personality: '',
            scenario: '',
            firstMessage: '',
            alternateGreetings: [],
            exampleMessages: '',
            characterNote: null,
            talkativeness: 50,
            tags: ['奇幻', '日常'],
            favorite: false,
            version: '1.0',
            createdAt: now,
            updatedAt: now,
            messages: [],
          }));
          const tx = db.transaction(['characters'], 'readwrite');
          for (const c of chars) tx.objectStore('characters').put(c);
          tx.oncomplete = () => {
            db.close();
            resolve('ok');
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    CHAR_IDS
  );
}

test('角色卡抽屉：一屏 ≥3 卡、动作全在抽屉、桌面不变', async ({ page }) => {
  await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
  await seedCharacters(page);
  await page.goto('/character');
  // storageState 预置了若干角色，网格里不止我们造的 5 张——所有定位都按名字精确匹配，不假设总数
  const myCard = page.locator('.char-card', { hasText: '抽屉角色1' });
  await expect(myCard).toBeVisible();

  // ── 判据一：一屏 ≥3 张卡（不滚动时视口内完整可见的卡数）──
  const visibleCards = await page.locator('.char-card').evaluateAll((els) =>
    els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 40;
    }).length
  );
  expect(
    visibleCards,
    `一屏只放得下 ${visibleCards} 张卡（判据 ≥3）。卡面动作若没搬走，卡会高出一截`
  ).toBeGreaterThanOrEqual(3);

  // ── 判据二：手机卡面没有动作组 ──
  await expect(page.locator('.card-actions')).toHaveCount(0);

  // ── 抽屉：三级排版齐全 ──
  await myCard.click();
  const drawer = page.locator('.bs-panel');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('抽屉角色1');
  await expect(drawer).toContainText('奇幻 · 日常');
  await expect(drawer.getByRole('button', { name: '开始对话' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '编辑' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '导出' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '删除' })).toBeVisible();

  // 「开始对话」：抽屉里唯一填充按钮，点了去对话页
  await drawer.getByRole('button', { name: '开始对话' }).click();
  await expect(page).toHaveURL(/\/chat$/);

  // ── 编辑从抽屉走 ──
  await page.goBack();
  await myCard.click();
  await page.locator('.bs-panel').getByRole('button', { name: '编辑' }).click();
  await expect(page).toHaveURL(/\/character\/cd-a\/edit$/);

  // ── Esc 关抽屉 ──
  await page.goBack();
  await myCard.click();
  await expect(page.locator('.bs-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bs-panel')).toHaveCount(0);

  // ── 桌面：卡面四按钮仍在，点卡仍直进编辑 ──
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.card-actions').first()).toBeVisible();
  await page.locator('.char-card', { hasText: '抽屉角色1' }).click();
  await expect(page).toHaveURL(/\/character\/cd-a\/edit$/);
});

test('抽屉里的删除走的是同一个确认 Modal（不是直接删）', async ({ page }) => {
  await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
  await seedCharacters(page);
  await page.goto('/character');
  await page.locator('.char-card', { hasText: '抽屉角色1' }).click();
  await page.locator('.bs-panel').getByRole('button', { name: '删除' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(page.locator('.bs-panel')).toHaveCount(0);
});
