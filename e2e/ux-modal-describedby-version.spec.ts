import { test, expect, type Page } from '@playwright/test';
import { auditOpenDialog } from './a11y-dup-audit';

/**
 * E2E · 版本管理页的两个对话框（M11-c）
 *
 * 台账里这两条原来登记为 `blocked`，理由是"链路长度超出本批预算"。本批走完发现：
 * **提交对话框一步就到**（点「提交」即开，不要求有未提交改动）；**冲突对话框**需要
 * 两条分支各自改过同一个字段再合并，链路长但全是界面操作，不需要任何外部 git。
 *
 * 版本库是应用自己实现的（`stores/character-version.ts` + 落盘），所以夹具也只在应用内造。
 */

async function expectDescribedResolved(page: Page, expectedIds: string[]): Promise<string[]> {
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  const state = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { title: '', raw: '', resolved: [] as Array<{ id: string; exists: boolean; inside: boolean; text: string }> };
    const raw = d.getAttribute('aria-describedby') ?? '';
    return {
      title: d.querySelector('.modal-title')?.textContent?.trim() ?? '',
      raw,
      resolved: raw
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => {
          const el = document.getElementById(id);
          return { id, exists: !!el, inside: !!el && d.contains(el), text: (el?.textContent ?? '').trim() };
        }),
    };
  });
  expect(state.raw, `「${state.title}」没有 aria-describedby`).not.toBe('');
  expect(state.resolved.map((r) => r.id), '登记的 id 与实际引用不一致').toEqual(expectedIds);
  for (const r of state.resolved) {
    expect(r.exists, `#${r.id} 在运行时 DOM 里不存在`).toBe(true);
    expect(r.inside, `#${r.id} 存在但不在这个对话框内部`).toBe(true);
    expect(r.text.length, `#${r.id} 解析到了，但里面没有文字`).toBeGreaterThan(0);
  }
  // M12-b：这一刻对话框已经开着，同一套重复 id/可访问名判定顺手跑一遍
  expect(await auditOpenDialog(page), `对话框「${state.title}」内部有可访问名问题`).toEqual([]);
  return state.resolved.map((r) => r.text);
}

/** 建一个角色并返回它的 id（走快速档，和 e2e 里既有用法一致） */
async function createCharacter(page: Page, name: string): Promise<string> {
  await page.goto('/character');
  await page.getByRole('button', { name: '新建角色' }).click();
  await page.locator('#qc-name').fill(name);
  await page.locator('#qc-desc').fill('初始描述：雨夜的港口城市。');
  await page.locator('[data-rel-jump="quick-char-create"]').click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.goto('/character');
  const card = page.getByRole('article', { name: `角色：${name}` });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '编辑角色' }).click();
  await page.waitForURL(/\/edit/);
  return page.url().match(/\/character\/([^/]+)\/edit/)?.[1] ?? '';
}

/**
 * 改角色的描述并保存（制造一次"分支上的改动"）。
 *
 * 走列表点进编辑，而不是直接 goto 深链接：Safari 下深链接会赶在角色库从 IndexedDB
 * 读回来之前渲染出表单，于是名称是空的、保存一直 disabled（实测 5 次轮询都是空值）。
 * 从列表进则列表本身就是"库已经读完"的证据。
 */
async function editDescription(page: Page, name: string, id: string, text: string): Promise<void> {
  await page.goto('/character');
  const card = page.getByRole('article', { name: `角色：${name}` });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: '编辑角色' }).click();
  await page.waitForURL(/\/edit/);
  await expect(page.locator('#f-name')).not.toHaveValue('', { timeout: 15_000 });
  await page.locator('#f-desc').fill(text);
  await page.locator('.header-btn.save').click();
  await expect(page).toHaveURL(/\/character$/, { timeout: 10_000 });
  // 等**应用自己的视图**里出现新描述，而不只是等 IndexedDB。
  // 保存是 fire-and-forget：Safari 下 IDB 稍后才写完，而版本页在这之前就已经把角色
  // 读进内存了——只等 IDB 会让版本页拿着旧描述去提交，两条分支快照相同 ⇒ 合并不出冲突。
  await expect(
    page.getByRole('article', { name: `角色：${name}` }),
    '应用内存里还是旧描述，此时去提交会提交出同样的快照'
  ).toContainText(text, { timeout: 15_000 });
  await waitCharacterDescription(page, id, text);
}

/**
 * 等角色的新描述**真的落进 IndexedDB**再往下走。
 *
 * 保存是 fire-and-forget（`stores/character.ts` 里 `void persistCharacter(id)`），
 * 而下一步是整页跳转到版本页提交快照。Safari 的事务更慢：没等落盘就跳，版本页读到的
 * 还是旧描述，两条分支提交出同样的内容 ⇒ 合并"自动解决 0 个字段"、冲突框永不出现
 * （实测 Chromium 过、Safari 不过，就是这个竞态）。
 */
async function waitCharacterDescription(page: Page, id: string, text: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (charId) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open('ai-roleplay');
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          const card = await new Promise<{ description?: string } | undefined>((resolve, reject) => {
            const req = db.transaction('characters', 'readonly').objectStore('characters').get(charId);
            req.onsuccess = () => resolve(req.result as { description?: string } | undefined);
            req.onerror = () => reject(req.error);
          });
          db.close();
          return card?.description ?? '';
        }, id),
      { timeout: 20_000, message: '描述没落进 IndexedDB，版本页会读到旧值' }
    )
    .toBe(text);
}

/**
 * 切到指定分支，并**断言切换真的生效**。
 *
 * 之前这里靠 `getByRole('button', { name: '切换' }).first()/.last()` 点，Safari 下会点错：
 * 只有"非当前分支"的卡片才有「切换」按钮，按钮数量随当前分支变化，位置猜不得。
 * 没断言时的后果是两次改动都落在同一条分支上，合并自然"自动解决 0 个字段"，
 * 冲突对话框永远不出现（实测 Safari 就是这样，Chromium 正常）。
 */
async function switchBranch(page: Page, target: string): Promise<void> {
  await page.getByRole('tab', { name: /分支/ }).click();
  const card = page.locator('.branch-card', { hasText: target }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByRole('button', { name: '切换到此分支' }).click();
  await expect(
    page.locator('.branch-card', { hasText: target }).first()
  ).toContainText('当前', { timeout: 10_000 });
}

async function commitWithMessage(page: Page, message: string, charName: string): Promise<void> {
  const before = await page.locator('.commit-item').count();
  const commitBtn = page.getByRole('button', { name: '提交' }).first();
  await expect(commitBtn).toBeEnabled({ timeout: 15_000 });
  await commitBtn.click();
  // 提交失败时对话框同样会关（只留一条错误提示），所以"框关了"证明不了成功；
  // 真正的证据在下面的"历史多一条"。这里等按钮可点是等"角色已从 IndexedDB 读回来"——
  // Safari 下版本页会先渲染出禁用的提交按钮，抢在读回来之前点必然失败。
  await page.locator('#commit-msg-input').fill(message);
  await page.getByRole('dialog').getByRole('button', { name: '确认提交' }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  // 真正的成功证据：历史多一条
  await expect
    .poll(async () => await page.locator('.commit-item').count(), {
      timeout: 15_000,
      message: `提交「${message}」没有进历史（角色：${charName}），说明快照没写进去`,
    })
    .toBeGreaterThan(before);
}

test.describe('版本管理页', () => {
  test('提交对话框：说明接进了无障碍树', async ({ page }) => {
    const name = `E2E版本提交-${Date.now()}`;
    const id = await createCharacter(page, name);
    await page.goto(`/character-version?char=${id}`);
    await page.waitForSelector('.page-body, [role="tabpanel"]');

    // 页头提交按钮 :disabled="!currentCharacter"——webkit 读回角色库慢，
    // 先渲染出的是禁用按钮，抢在读回之前点等于没点，对话框永远开不出来。
    // （同文件冲突用例的 commitWithMessage 早就等了 toBeEnabled，这里补齐。）
    const commitBtn = page.getByRole('button', { name: '提交' }).first();
    await expect(commitBtn).toBeEnabled({ timeout: 15_000 });
    await commitBtn.click();
    const texts = await expectDescribedResolved(page, ['cv-commit-desc']);
    expect(texts[0].length).toBeGreaterThan(4);
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  });

  /**
   * 双内核都要取证。M11 时它只在 Chromium 过，原因是产品侧的：
   * 版本页在角色库读完之前就决定了"这条 URL 是哪个角色"，Safari 读库慢一点，
   * 于是落进"自动选中第一条"= mock 种子角色，两条分支提交的都是同一份种子快照
   * ⇒ 合并自然"自动解决 0 个字段"。诊断证据（落盘的 `characterId` 是 `seraphina`、
   * 每条 commit 的 snapshot 都是种子描述）见设计文档 M12-a 节。
   * 修法是视图先 `await characterStore.ensureLoaded()`，并去掉"悄悄换角色"那条退路。
   */
  test('合并冲突对话框：两条分支各改同一字段后合并', async ({ page }) => {
    const name = `E2E版本冲突-${Date.now()}`;
    const id = await createCharacter(page, name);
    await page.goto(`/character-version?char=${id}`);
    await page.waitForSelector('.page-body, [role="tabpanel"]');

    // 基线提交：先把当前状态存进去，后面两条分支才有共同的祖先
    await commitWithMessage(page, '基线', name);

    // 分支 alt 上改描述
    await page.getByRole('tab', { name: /分支/ }).click();
    await page.getByRole('button', { name: '新建分支' }).click();
    await page.locator('#branch-name-input').fill('alt');
    await page.getByRole('dialog').getByRole('button', { name: '创建' }).click();
    await switchBranch(page, 'alt');
    await editDescription(page, name, id, '分支 alt 的描述：桥断了。');
    await page.goto(`/character-version?char=${id}`);
    await commitWithMessage(page, 'alt 改动', name);

    // 回到主分支，改同一个字段 ⇒ 合并时必然冲突
    await page.getByRole('tab', { name: /分支/ }).click();
    await switchBranch(page, 'main');
    await editDescription(page, name, id, '主分支的描述：桥修好了。');
    await page.goto(`/character-version?char=${id}`);
    await commitWithMessage(page, 'main 改动', name);

    await page.getByRole('tab', { name: /合并/ }).click();
    await page.locator('#merge-source').selectOption('alt');
    await page.getByRole('button', { name: '合并' }).last().click();

    const texts = await expectDescribedResolved(page, ['cv-conflict-desc']);
    expect(texts[0].length).toBeGreaterThan(4);
    await page.keyboard.press('Escape');
  });
});
