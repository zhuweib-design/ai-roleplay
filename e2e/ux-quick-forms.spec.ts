/**
 * M3-b3：两个快速档的浏览器级证据
 *
 * 快速档存在的理由是"最短生效路径"，所以断言全部落在**路径本身**上：
 * 新建角色只填两项就能开始对话；世界书三步做完，设定就真的进了上下文面板。
 * 后者尤其重要——它同时是 E03 的下游验证（面板列的是真正注入的那批书）。
 */
import { test, expect, type Page } from '@playwright/test';

async function dismissWelcome(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
}

test.describe('角色快速档', () => {
  test('默认落在快速档，只填名字就能建好并进对话', async ({ page }) => {
    await page.goto('/character');
    await dismissWelcome(page);
    await page.getByRole('button', { name: '新建角色' }).click();
    await expect(page).toHaveURL(/\/character\/new/);

    await expect(page.locator('.quick-char')).toBeVisible();
    // 完整表单不在 DOM 里（v-if）：两档同时留会重复"名称"标签，隐藏字段还能被 Tab 进去
    await expect(page.locator('#f-desc')).toHaveCount(0);
    await expect(page.locator('.header-btn.save')).toHaveCount(0);

    await page.locator('#qc-name').fill('E2E 快速档角色');
    await page.locator('#qc-desc').fill('雨夜的港口城市，说话简短。');
    await page.locator('[data-rel-jump="quick-char-create"]').click();

    await expect(page).toHaveURL(/\/chat$/);
    await page.goto('/character');
    await dismissWelcome(page);
    await expect(page.getByRole('article', { name: /E2E 快速档角色/ })).toBeVisible();
  });

  test('名字为空时不建角色，给出可见原因', async ({ page }) => {
    await page.goto('/character/new');
    await dismissWelcome(page);
    await page.locator('[data-rel-jump="quick-char-create"]').click();

    await expect(page.locator('.quick-char [role="alert"]')).toHaveText('名称为必填项');
    await expect(page).toHaveURL(/\/character\/new/);
  });

  test('可切到完整表单，切回后快速档仍在', async ({ page }) => {
    await page.goto('/character/new');
    await dismissWelcome(page);
    await page.locator('[data-rel-jump="char-create-full"]').click();
    await expect(page.locator('.editor-body')).toBeVisible();
    await expect(page.locator('.quick-char')).toHaveCount(0);
    // 头部那颗"保存"只在完整档出现，避免两条保存路径并存
    await expect(page.locator('.header-btn.save')).toBeVisible();

    await page.locator('[data-rel-jump="char-create-quick"]').click();
    await expect(page.locator('.quick-char')).toBeVisible();
    await expect(page.locator('.editor-body')).toHaveCount(0);
  });
});

test.describe('世界书最小生效三步', () => {
  test('三步做完后，这本书出现在上下文面板里（说明真的生效了）', async ({ page }) => {
    await page.goto('/worldbook');
    await dismissWelcome(page);

    // 三步流程是"看得见但不抢页面"的入口：空态里那颗按钮展开它
    await page.locator('[data-rel-jump="quick-wb-open"]').click();
    const flow = page.locator('.quick-wb');
    await expect(flow).toBeVisible();
    await expect(flow.locator('.step-flow-row')).toHaveCount(3);
    // 没建书时后两步不可操作
    await expect(page.locator('[data-rel-jump="quick-wb-add-entry"]')).toBeDisabled();
    await expect(page.locator('[data-rel-jump="quick-wb-bind"]')).toBeDisabled();

    await page.locator('#qw-book-name').fill('E2E 港口设定');
    await page.locator('[data-rel-jump="quick-wb-create-book"]').click();
    await page.locator('#qw-entry-title').fill('酒馆招牌');
    await page.locator('#qw-entry-content').fill('酒馆永远亮着灯。');
    await page.locator('[data-rel-jump="quick-wb-add-entry"]').click();
    await page.locator('[data-rel-jump="quick-wb-bind"]').click();

    await expect(flow.locator('.quick-wb-done')).toBeVisible();
    await expect(flow.locator('.step-flow-row.done')).toHaveCount(3);
    // 建书会自动选中它，流程不能因此消失（第一版就栽在这里）
    await expect(flow).toBeVisible();

    await page.goto('/chat');
    await dismissWelcome(page);
    const world = page.locator('section[aria-labelledby="ctx-world-title"]');
    await expect(world).toContainText('E2E 港口设定');
    await expect(world).toContainText('1 条启用');
  });

  test('书名为空时第一步不建书并说明原因', async ({ page }) => {
    await page.goto('/worldbook');
    await dismissWelcome(page);
    await page.locator('[data-rel-jump="quick-wb-open"]').click();
    await page.locator('[data-rel-jump="quick-wb-create-book"]').click();
    await expect(page.locator('.quick-wb [role="alert"]')).toHaveText('先给世界书起个名字。');
    await expect(page.locator('.quick-wb .step-flow-row.done')).toHaveCount(0);
  });
});

/**
 * 预设值输入框的聚焦行为（见 src/core/preset-input.ts）
 *
 * 挂在"快速档"这个文件里而不是新开一个 spec：新开文件要重跑一次单 worker 全量
 * 才能补 CI 分片权重（一次 12–17 分钟），而这条用例测的就是表单聚焦行为，主题相合。
 *
 * 三段各锁一件事，缺一段就是不同的 bug：
 * 1. 聚焦即清空，且原值挪到 placeholder（看不见原值 = 用户不敢动）；
 * 2. 没改就走开 ⇒ 原值回来，且**没有**任何一次写盘（清空的值若被当成用户改动，
 *    默认值就静默丢了 —— 这条最狠，界面上完全看不出来）；
 * 3. 真改了 ⇒ 值留下并落进 IndexedDB 的设置记录（读盘，不靠 reload 后看 DOM：
 *    设置写盘是异步的，reload 抢在写之前读到的是旧值，那样稳定假绿/假红）。
 */
test.describe('预设值输入框的聚焦行为', () => {
  /** 读盘上设置记录里的某个字段（键与形状见 e2e/theme-persistence.ts 的注释） */
  async function readPersistedSetting(page: import('@playwright/test').Page, key: string) {
    return page.evaluate(
      (k) =>
        new Promise<unknown>((resolve) => {
          const req = indexedDB.open('ai-roleplay');
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('settings')) {
              db.close();
              resolve('(库里没有 settings store)');
              return;
            }
            const get = db.transaction('settings', 'readonly').objectStore('settings').get('app');
            get.onsuccess = () => {
              db.close();
              const rec = get.result as { value?: Record<string, unknown> } & Record<string, unknown>;
              resolve((rec?.value as Record<string, unknown> | undefined)?.[k] ?? rec?.[k]);
            };
            get.onerror = () => {
              db.close();
              resolve('(读取失败)');
            };
          };
          req.onerror = () => resolve('(打开失败)');
        }),
      key
    );
  }

  test('聚焦清空并可看见原值；未改动失焦回填且不写盘；改了就落进设置记录', async ({ page }) => {
    await page.goto('/settings?cat=model');
    await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached', timeout: 30_000 });
    const max = page.getByLabel('上下文窗口上限 (Token)');
    await expect(max).toHaveValue('8192');
    const before = await readPersistedSetting(page, 'maxContextTokens');

    // 1) 聚焦：值被挪走，原值改由 placeholder 顶上
    await max.click();
    await expect(max).toHaveValue('');
    await expect(max).toHaveAttribute('placeholder', '8192');

    // 2) 一个字没输就走开：原值回来，临时 placeholder 撤掉，盘上记录没被动过
    await page.keyboard.press('Tab');
    await expect(max).toHaveValue('8192');
    expect(await max.evaluate((el) => el.hasAttribute('placeholder'))).toBe(false);
    expect(await readPersistedSetting(page, 'maxContextTokens')).toEqual(before);

    // 3) 真的改：新值留下，并等它写进设置记录
    await max.click();
    await max.fill('16384');
    await page.keyboard.press('Tab');
    await expect(max).toHaveValue('16384');
    await expect
      .poll(() => readPersistedSetting(page, 'maxContextTokens'), { timeout: 15_000 })
      .toBe(16384);
  });
});
