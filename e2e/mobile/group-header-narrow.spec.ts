import { test, expect } from '@playwright/test';

/**
 * E2E · 群聊页头部在窄屏下不许被压成"一列一个字"
 *
 * 来源：2026-10-16 模拟器（412×842）真机读数。`.group-title-row` 是
 * `justify-content: space-between` 的 flex，标题没有 `min-width:0`、右侧 6 个按钮不换行，
 * 于是 flex 把两者一起压到内容最小宽以下 —— 群名变成竖排一字一行，按钮里的"添加成员"
 * 也变成竖排。截图见交付目录 群聊分段_真机.png。
 *
 * 断言只问浏览器最后算出来的几何，不问 CSS 写了什么（静态守卫量不到这种收缩）。
 */

const CHAR_IDS = ['char-gh-a', 'char-gh-b'];
const GROUP_ID = 'grp-header-narrow';

async function seedGroup(page: import('@playwright/test').Page) {
  await page.goto('/');
  // 页面上下文拿不到模块常量，ids 与 groupId 都要显式传进去
  await page.evaluate(
    ({ ids, groupId }: { ids: string[]; groupId: string }) =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => {
          const db = req.result;
          const now = new Date().toISOString();
          const chars = ids.map((id, i) => ({
            id,
            name: i === 0 ? '甲角色' : '乙角色',
            description: '',
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
          }));
          const group = {
            id: groupId,
            name: '窄屏头部复验群',
            description: '',
            members: chars.map((c) => ({ characterId: c.id, name: c.name, joinedAt: now, allowAutoSelect: true })),
            firstMessage: '',
            messages: [{ id: 'm1', role: 'user', content: '第一句', timestamp: now }],
            mode: 'natural',
            lastSpeakerId: null,
            createdAt: now,
            updatedAt: now,
            lifecycleStatus: 'active',
            archivedAt: null,
          };
          const tx = db.transaction(['characters', 'groups'], 'readwrite');
          for (const c of chars) tx.objectStore('characters').put(c);
          tx.objectStore('groups').put(group);
          tx.oncomplete = () => {
            db.close();
            resolve('ok');
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { ids: CHAR_IDS, groupId: GROUP_ID }
  );
}

test('群聊页头部：412px 下群名保持一行、按钮文字不竖排', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 844 });
  await seedGroup(page);
  await page.goto('/group');
  await page.locator('.group-item', { hasText: '窄屏头部复验群' }).first().click();
  await expect(page.locator('.group-header-actions .action-btn').first()).toBeVisible();

  const title = page.locator('.group-title-row h2');
  const titleBox = await title.boundingBox();
  expect(titleBox, '群名量不到').not.toBeNull();
  // 16px 字号单行 ≈ 19–24px；被压成竖排时会是 5 个字 × 行高 ≈ 100px
  expect(
    titleBox!.height,
    `群名高度 ${Math.round(titleBox!.height)}px，超过单行上限 28px ⇒ 被压成一列一个字`
  ).toBeLessThanOrEqual(28);

  const widths = await page.locator('.group-header-actions .action-btn').evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().width))
  );
  expect(widths.length, '按钮一个都没量到').toBeGreaterThan(0);
  const tooNarrow = widths.filter((w) => w < 56);
  expect(
    tooNarrow,
    `这些按钮宽度 <56px（文字被压成竖排）：${tooNarrow.join(', ')}px ｜ 全部=${widths.join(',')}`
  ).toEqual([]);
});

test('负向对照：视口更宽时同一组断言也成立（不是靠窄屏侥幸）', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 844 });
  await seedGroup(page);
  await page.goto('/group');
  await page.locator('.group-item', { hasText: '窄屏头部复验群' }).first().click();
  const titleBox = await page.locator('.group-title-row h2').boundingBox();
  expect(titleBox!.height).toBeLessThanOrEqual(28);
});
