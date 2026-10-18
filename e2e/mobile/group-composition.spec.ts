import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 群聊组成层（MOBILE_PLAN 批次 1-2 / DEV_PLAN A7）
 *
 * 要证明的三件事，缺一条这项就不算过：
 * 1. **两级互换真的成立**：手机上一级只见群列表、二级只见消息区，且互斥。
 * 2. **消息区拿回了高度**：390×844 下消息区 ≥40% 视口，且输入条在视口内；
 *    390×500（键盘弹起档）下输入条 bottom ≤500。这两条必须成对测——
 *    只测前者会得到绿灯而用户打不了字（方案文档 §7 风险 3 就是这么踩的）。
 * 3. **返回真的能回列表**：页内返回与系统返回（page.goBack）各一条。
 *    这条同时是 A8（useDrilldown 原语）的验收——原语交付时没有消费者，
 *    几何与返回断言都挂不上去，这是它的第一个真实消费者。
 *
 * 关于"群数 1→5 消息区不下降"这条判据：这里用**结构断言**替代读数——
 * 二级页里 `.group-list-panel` 的 computed display 为 `none`，它根本不参与布局，
 * 群数在结构上不可能影响消息区高度。这比抽样读数更强，也省掉 30 秒造数。
 *
 * 造数直接写 IndexedDB（照 `group-header-narrow.spec.ts` 的做法），不走 UI：
 * 这个用例只关心几何，走"设置→新增 API→建角色→建群"那套 UI 会吃掉一半预算，
 * 而它证明不了任何与组成层相关的事。
 */

const CHAR_IDS = ['char-gc-a', 'char-gc-b'];
const GROUP_ID = 'grp-composition';
const GROUP_NAME = '组成层复验群';

const VIEW_W = 390;
const VIEW_H_TALL = 844;
const VIEW_H_KEYBOARD = 500;

async function seedGroup(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ ids, groupId, groupName }: { ids: string[]; groupId: string; groupName: string }) =>
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
            name: groupName,
            description: '',
            members: chars.map((c) => ({
              characterId: c.id,
              name: c.name,
              joinedAt: now,
              allowAutoSelect: true,
            })),
            firstMessage: '',
            // 给足消息，让消息区有内容可量（空列表的高度断言会被 flex 兜底掩盖）
            messages: Array.from({ length: 8 }, (_, i) => ({
              id: `gc-m${i}`,
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `第 ${i + 1} 条消息`,
              characterId: i % 2 === 0 ? null : ids[0],
              characterName: i % 2 === 0 ? null : '甲角色',
              timestamp: now,
            })),
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
    { ids: CHAR_IDS, groupId: GROUP_ID, groupName: GROUP_NAME }
  );
}

function rectOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
  }, selector);
}

function displayOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).display : 'missing';
  }, selector);
}

test('群聊组成层：两级互换、消息区占比、输入条在视口内、返回可回列表', async ({ page }) => {
  await page.setViewportSize({ width: VIEW_W, height: VIEW_H_TALL });
  await seedGroup(page);
  await page.goto('/group');
  await expect(page.locator('.group-item').first()).toBeVisible();

  // ── 一级：只见列表 ──
  const listAtLevel1 = await rectOf(page, '.group-list-panel');
  expect(listAtLevel1?.height ?? 0, '一级页的群列表应当满屏，而不是被压到半个屏').toBeGreaterThan(
    VIEW_H_TALL * 0.5
  );
  expect(
    await displayOf(page, '.group-main-panel'),
    '一级页的主区必须不参与布局（否则就是"上下两段"而不是两级互换）'
  ).toBe('none');

  // ── 进二级 ──
  await page.locator('.group-item').first().click();
  await expect(page.locator('.messages-area')).toBeVisible();
  await expect(page.locator('.m-swap__back')).toBeVisible();

  // 消息区 ≥40%，且输入条在视口内（成对，缺一不可）
  const messages = await rectOf(page, '.messages-area');
  const inputTall = await rectOf(page, '.input-area');
  expect(
    messages?.height ?? 0,
    `消息区高度 ${Math.round(messages?.height ?? 0)}px，不足视口 40%（${VIEW_H_TALL * 0.4}px）`
  ).toBeGreaterThanOrEqual(VIEW_H_TALL * 0.4);
  expect(inputTall?.bottom ?? Infinity, '输入条被挤出视口').toBeLessThanOrEqual(VIEW_H_TALL);

  // 二级页里群列表不参与布局 ⇒ 群数不可能影响消息区（替代"1→5"读数）
  expect(await displayOf(page, '.group-list-panel')).toBe('none');

  // ── 键盘弹起档（390×500）：输入条必须还在视口里 ──
  await page.setViewportSize({ width: VIEW_W, height: VIEW_H_KEYBOARD });
  const inputShort = await rectOf(page, '.input-area');
  expect(
    inputShort?.bottom ?? Infinity,
    `500 高视口下输入条 bottom=${Math.round(inputShort?.bottom ?? -1)}，已被挤出视口`
  ).toBeLessThanOrEqual(VIEW_H_KEYBOARD);

  // ── 群设置抽屉：动作组搬进来了，页头不再有它们 ──
  await page.setViewportSize({ width: VIEW_W, height: VIEW_H_TALL });
  await expect(page.locator('.group-header .action-btn')).toHaveCount(0);
  await page.locator('.group-settings-btn').click();
  const drawer = page.locator('.settings-panel');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.members-bar')).toBeVisible();
  await expect(drawer.getByRole('button', { name: '添加成员' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);

  // ── 页内返回 ──
  await page.locator('.m-swap__back').click();
  await expect(page.locator('.group-list-panel')).toBeVisible();
  await expect(page.locator('.messages-area')).toBeHidden();

  // ── 系统返回（浏览器后退 / 安卓返回键同一条 popstate 路径）──
  await page.locator('.group-item').first().click();
  await expect(page.locator('.messages-area')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.group-list-panel')).toBeVisible();
  await expect(page.locator('.messages-area')).toBeHidden();

  // ── 回到桌面宽度：并置两栏与页头内联动作组都必须复原 ──
  // 同一个用例里测，不再造一次数：`isMobile()` 读的是 matchMedia，与 project 的
  // 设备模拟无关，改视口宽度就够。
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.group-item').first().click();
  await expect(page.locator('.group-list-panel')).toBeVisible();
  await expect(page.locator('.messages-area')).toBeVisible();
  await expect(page.locator('.group-header .action-btn').first()).toBeVisible();
  await expect(page.locator('.m-swap__back')).toHaveCount(0);
});
