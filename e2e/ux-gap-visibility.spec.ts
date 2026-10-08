/**
 * M3 前置：四条"看得见/跳得过"缺口的浏览器级证据
 * （设计文档 §1.4 的 E03 / E19 / E22 / E23）
 *
 * 这四条都是"界面说的和实际做的不一致"或"事实无处可查"，
 * 单测能守逻辑，但只有真实浏览器能证明用户看到的那句话是真的。
 *
 * 本文件**不纳入 webkit project**：E22 用例会写设置（图像 Provider 配置落盘），
 * 而 M2-b9 实测过同一 webkit 进程内多个 context 共享存储目录，
 * 前一个用例的 persistSettings() 会盖掉后一个用例的 settings.app（见
 * e2e/ux-interaction-feedback.spec.ts 顶部记的那次排查）。msedge 各 context 独立，不受影响。
 */
import { test, expect, type Page } from '@playwright/test';

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
    await expect(page).toHaveURL(/\/worldbook\?from=\/chat/);
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

    // 版本页会在挂载时选中第一个角色并懒建仓库 ⇒ 该角色从此"已跟踪"
    await page.goto('/character-version');
    await dismissWelcomeModal(page);
    await expect(page.locator('.cv-char-select, select').first()).toBeVisible();

    await page.goto('/character');
    await dismissWelcomeModal(page);
    const mark = page.locator('[data-rel-jump="char-tracked"]');
    await expect(mark).toHaveCount(1);
    await expect(mark).toContainText('已跟踪');

    await mark.click();
    await expect(page).toHaveURL(/\/character-version\?char=e2e-gap-char&from=\/character/);
  });
});
