/**
 * M3 前置：四条"看得见/跳得过"缺口的浏览器级证据
 * （设计文档 §1.4 的 E03 / E19 / E22 / E23），外加 1.1.0 发布时抓到的第五处——
 * 设置→关于的版本号那一行恒显示占位破折号。
 *
 * 这几条都是"界面说的和实际做的不一致"或"事实无处可查"，
 * 单测能守逻辑，但只有真实浏览器能证明用户看到的那句话是真的。
 *
 * 本文件**不纳入 webkit project**：E22 用例会写设置（图像 Provider 配置落盘），
 * 而 M2-b9 实测过同一 webkit 进程内多个 context 共享存储目录，
 * 前一个用例的 persistSettings() 会盖掉后一个用例的 settings.app（见
 * e2e/ux-interaction-feedback.spec.ts 顶部记的那次排查）。msedge 各 context 独立，不受影响。
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 版本号的真值就取仓库里的 package.json：界面显示与它不一致，这条用例必须红。
// 与 e2e/ux-duplicate-a11y-names.spec.ts 同一取文件方式（process.cwd() 是仓库根）。
const APP_VERSION = (
  JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string }
).version;

async function dismissWelcomeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
}

/** 造一个角色卡（与 chat-search.spec.ts 同一范式：db v6，characters 存 CharacterCard） */
async function seedCharacter(page: Page, id: string, name: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ cardId, cardName }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay', 6);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const now = new Date().toISOString();
      const tx = db.transaction('characters', 'readwrite');
      tx.objectStore('characters').put({
        id: cardId,
        name: cardName,
        avatar: '',
        description: '用于验证关联显示',
        personality: '',
        scenario: '',
        firstMessage: '',
        alternateGreetings: [],
        exampleMessages: '',
        characterNote: null,
        talkativeness: 50,
        tags: ['e2e-gap'],
        favorite: false,
        version: '1.0',
        createdAt: now,
        updatedAt: now,
        messages: [],
        boundWorldBookIds: [],
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { cardId: id, cardName: name }
  );
}

/** 造一本**全局**世界书（不绑定任何角色） */
async function seedGlobalLorebook(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ai-roleplay', 6);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const now = new Date().toISOString();
    const tx = db.transaction('lorebooks', 'readwrite');
    tx.objectStore('lorebooks').put({
      id: 'lb-e2e-gap-global',
      name: '全局生效的那本书',
      description: '',
      scope: 'global',
      active: true,
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: 'e2e-gap-on',
          title: '酒馆招牌',
          keys: [],
          content: '酒馆永远亮着灯。',
          enabled: true,
          strategy: 'constant',
          insertionOrder: 0,
          insertionPosition: 'beforeCharDefs',
          depth: 4,
          group: '',
          logic: 'AND_ANY',
        },
      ],
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

test.describe('E03 上下文面板与真实注入一致', () => {
  test('未绑定任何书时，全局书仍要出现在面板里并标明来源', async ({ page }) => {
    await seedCharacter(page, 'e2e-gap-char', '缺口验证角色');
    await seedGlobalLorebook(page);
    await page.goto('/chat');
    await dismissWelcomeModal(page);
    await page.getByRole('button', { name: '选择角色 缺口验证角色' }).click();

    const section = page.locator('section[aria-labelledby="ctx-world-title"]');
    await expect(section).toBeVisible();
    // 修前面板按 boundWorldBookIds 过滤，这里会显示"未绑定世界书"
    await expect(section.locator('.ctx-empty')).toHaveCount(0);
    await expect(section.locator('.ctx-section-value')).toHaveText('1 本');
    const row = section.locator('.world-lorebook');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('全局生效的那本书');
    await expect(row.locator('.world-global-tag')).toHaveText('全局生效');
  });

  test('面板里的全局书可点进世界书页（可见且可一跳）', async ({ page }) => {
    await seedCharacter(page, 'e2e-gap-char', '缺口验证角色');
    await seedGlobalLorebook(page);
    await page.goto('/chat');
    await dismissWelcomeModal(page);
    await page.getByRole('button', { name: '选择角色 缺口验证角色' }).click();

    await page.locator('[data-rel-jump="ctx-world-global"]').click();
    // M17-b 起跳转带上"点的是哪一本"：落地页打开的就是面板里这一本，
    // 而不是"store 里恰好选中谁算谁"，刷新/分享也带得住。
    await expect(page).toHaveURL(/\/worldbook\?book=lb-e2e-gap-global&from=\/chat/);
    // 落地页打开的就是面板里点的那本（不是"store 里恰好选中谁算谁"）
    await expect(page.locator('.lorebook-item[aria-current="true"]')).toContainText('全局生效的那本书');
    // 回程：带 from 进来就该一键回去（M2-b5 契约，M17-b 把这一跳也接上了）
    await expect(page.locator('[data-rel-jump="source-return"]')).toBeVisible();
    await page.locator('[data-rel-jump="source-return"]').click();
    await expect(page).toHaveURL(/\/chat$/);
  });
});

test.describe('E23 图片产物的去向说清楚', () => {
  test('图片页页头写明产物只进画廊、不进对话', async ({ page }) => {
    await page.goto('/image-gen');
    await dismissWelcomeModal(page);
    await expect(page.locator('.header-note')).toContainText('不会进入对话消息');
  });
});

test.describe('E22 图像 Provider 配置不再刷新即丢', () => {
  test('填完刷新后端点/模型/密钥都还在', async ({ page }) => {
    await page.goto('/image-gen');
    await dismissWelcomeModal(page);
    await page.getByRole('tab', { name: '设置' }).click();

    await expect(page.locator('.provider-source')).toContainText('随设置一起保存');
    await page.locator('#endpoint').fill('https://img.example.test/v1');
    await page.locator('#model').fill('e2e-image-model');
    await page.locator('#api-key').fill('sk-e2e-persist-me');

    /**
     * persistSettings 是 fire-and-forget 的 IndexedDB 写入：填完立刻 reload，
     * 并发抢 CPU 时 IDB 事务可能排在 reload 之后，值就丢了（第 4、5 轮全量各红过一次）。
     *
     * 但"等 endpoint 落盘"是**等错了对象**：设置是每改一次就写一次盘，而 endpoint 是这里
     * 第一个被 fill 的字段 —— 它在 #api-key 还没输入之前就已经落盘了，于是 poll 立刻通过，
     * 后面那次带密钥的写入还在飞，reload 就读到"端点/模型都对、密钥是空"。
     * 实测正是这个形状（全量 4 worker 下红的那次：#endpoint 与 #model 都恢复成功，
     * 只有 #api-key 为空）。
     *
     * 判据因此改成**三个字段一起等**：等价于"最后那次写入已落地"。等值，不等时间。
     *
     * 用 expect.poll 而不是 page.waitForFunction：后者在这个 Playwright 版本里
     * **不等页面里 async 函数返回的 Promise**（Promise 对象恒为真 ⇒ 立刻满足），
     * 负向对照实测：把判定改成 `async () => false` 用例照样绿。expect.poll 在 Node 侧
     * await 回调，才是真闸门。
     */
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const req = indexedDB.open('ai-roleplay');
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            try {
              const val = await new Promise<Record<string, unknown> | undefined>(
                (resolve, reject) => {
                  const req = db
                    .transaction('settings', 'readonly')
                    .objectStore('settings')
                    .get('app');
                  req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
                  req.onerror = () => reject(req.error);
                }
              );
              const cfg = val?.imageGenConfig as
                | { endpoint?: string; model?: string; apiKey?: string }
                | undefined;
              // 返回实际读到的三元组：失败信息里能直接看出"盘上停在哪一步"
              return [cfg?.endpoint, cfg?.model, cfg?.apiKey].join(' | ');
            } finally {
              db.close();
            }
          }),
        {
          timeout: 10_000,
          message: '盘上的 imageGenConfig 三个字段没同时到新值（最后一次写入没落地？）',
        }
      )
      .toBe('https://img.example.test/v1 | e2e-image-model | sk-e2e-persist-me');

    await page.reload();
    await dismissWelcomeModal(page);
    await page.getByRole('tab', { name: '设置' }).click();
    await expect(page.locator('#endpoint')).toHaveValue('https://img.example.test/v1');
    await expect(page.locator('#model')).toHaveValue('e2e-image-model');
    await expect(page.locator('#api-key')).toHaveValue('sk-e2e-persist-me');
  });

  test('「去设置」落到模型分类而不是外观', async ({ page }) => {
    await page.goto('/image-gen');
    await dismissWelcomeModal(page);
    await page.getByRole('tab', { name: '设置' }).click();
    await page.locator('[data-rel-jump="imggen-go-settings"]').click();
    await expect(page).toHaveURL(/\/settings\?cat=model/);
    await expect(page.locator('.settings-nav-item.active')).toContainText('模型');
  });

  test('设置里配了图像 Profile 后，图片页可一键填入（两处打通）', async ({ page }) => {
    await page.goto('/settings?cat=model');
    await dismissWelcomeModal(page);
    await page.getByRole('button', { name: /新增 API 配置/ }).click();
    await page.locator('#p-name').fill('E2E 图像配置');
    await page.locator('#p-baseurl').fill('https://profile.example.test/v1');
    await page.locator('#p-model').fill('profile-image-model');
    await page.locator('#p-apikey').fill('sk-from-profile');
    const category = page.locator('#p-category');
    if (await category.count()) {
      await category.selectOption('image-video');
    }
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('E2E 图像配置').first()).toBeVisible();
    // 分类下"设为主要"决定 getPrimaryModel('image-video') 取到谁
    const setPrimary = page.getByRole('button', { name: /设为主要/ }).first();
    if (await setPrimary.count()) await setPrimary.click();

    await page.goto('/image-gen');
    await dismissWelcomeModal(page);
    await page.getByRole('tab', { name: '设置' }).click();
    const fill = page.locator('[data-rel-jump="imggen-use-model-profile"]');
    await expect(fill).toBeVisible();
    await fill.click();

    await expect(page.locator('#endpoint')).toHaveValue('https://profile.example.test/v1');
    await expect(page.locator('#model')).toHaveValue('profile-image-model');
  });
});

test.describe('E19 已跟踪可查', () => {
  test('进过一次版本页的角色，卡片上出现可点回的标记', async ({ page }) => {
    await seedCharacter(page, 'e2e-gap-char', '缺口验证角色');

    // 版本页会在挂载时选中第一个角色并懒建仓库 ⇒ 该角色从此"已跟踪"。
    // 只等"下拉可见"不够：那不证明 selectCharacter 已跑、懒建仓库已落盘——
    // 负载高时用例会在选中完成前就跳走，刷新后仓库不存在，标记永远出不来。
    // 等到 select 的 value 真的变成目标角色（同步建仓已发生），再给
    // fire-and-forget 的快照写入留出落地时间，然后才离开页面。
    await page.goto('/character-version');
    await dismissWelcomeModal(page);
    const cvSelect = page.locator('.cv-char-select, select').first();
    await expect(cvSelect).toBeVisible();
    await expect(cvSelect).toHaveValue('e2e-gap-char', { timeout: 15_000 });
    await page.waitForTimeout(300);

    await page.goto('/character');
    await dismissWelcomeModal(page);
    const mark = page.locator('[data-rel-jump="char-tracked"]');
    await expect(mark).toHaveCount(1);
    await expect(mark).toContainText('已跟踪');

    await mark.click();
    await expect(page).toHaveURL(/\/character-version\?char=e2e-gap-char&from=\/character/);
  });
});

test.describe('关于页的版本号（1.1.0 发布时抓到：三个平台都显示破折号）', () => {
  test('关于页显示的就是 package.json 里的版本号', async ({ page }) => {
    // 现场：`appVersion` 声明后从未赋值，模板 `appVersion || '—'` 兜底，
    // 于是桌面 / 网页 / 安卓的"设置→关于"都显示"版本：—"，而发布说明写着"运行时读到的版本"。
    // 修法是编译期 define 注入 __APP_VERSION__；本用例断言的是**界面上的字符串**，
    // 所以配置被删、常量被改空、模板回退这三种情况都会在这里红，而不是等到人来肉眼核对。
    await page.goto('/settings?cat=about');
    await dismissWelcomeModal(page);

    const versionLine = page.locator('.data-mgmt-hint').filter({ hasText: '版本' }).first();
    await expect(versionLine).toBeVisible();
    await expect(versionLine).toContainText(APP_VERSION);
    await expect(versionLine).not.toContainText('—');
  });
});
