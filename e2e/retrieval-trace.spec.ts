import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 检索命中回显（C-03 第一步）在真实浏览器里的三段链路
 *
 * 单测已经钉住"组装那一刻的痕迹会挂到消息上"，但那条走的是内存对象。
 * 这里要的是另外两件事，只有真浏览器能回答：
 * 1. 痕迹真的写进了 IndexedDB 里那份记录（不是只活在内存，刷新就没了）；
 * 2. 从盘上回读后，气泡下方仍然出现"本轮检索命中 N 条"，展开能看到是哪几条、多相关。
 *
 * 造数直接写 IndexedDB（照 long-history-scroll 的做法）：双通道向量检索默认关着，
 * 而且要走通它得配真实嵌入模型；回显这件事的判据是"记录里有，界面上就有"，
 * 与检索本身怎么算无关。
 */

// 种子函数用 .toString() 传进页面执行，闭包里的常量它拿不到 ⇒
// seedTracedCharacter / cleanup 体内只能写字面量，这里的常量只给测试侧用。
const CHAR_NAME = '检索痕迹验证角色';

function seedTracedCharacter(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const card = {
      id: 'char-retrieval-trace',
      name: '检索痕迹验证角色',
      description: 'C-03 回显验证角色',
      personality: '测试',
      scenario: '',
      firstMessage: '',
      alternateGreetings: [],
      exampleMessages: '',
      characterNote: null,
      talkativeness: 50,
      tags: ['e2e-retrieval-trace'],
      favorite: false,
      version: '1.0',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      messages: [
        { id: 'rt-u1', role: 'user', content: '你还记得我喜欢什么天气吗', timestamp: now },
        {
          id: 'rt-a1',
          role: 'assistant',
          content: '你喜欢下雨天。',
          timestamp: now + 1,
          retrievalTrace: [
            { id: 'memory:session-rt-rain', label: '用户喜欢在下雨天读书', score: 0.912, source: 'memory' },
            { id: 'd1-0', label: '旅行手记：城市的地下铁网', score: 2, source: 'document' },
            { id: 'lorebook:lb1:e1', label: '永恒酒馆', score: 0.42, source: 'lore' },
          ],
        },
      ],
    };
    const tx = db.transaction(['characters'], 'readwrite');
    tx.objectStore('characters').put(card);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function cleanup(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['characters'], 'readwrite');
    tx.objectStore('characters').delete('char-retrieval-trace');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function runInDb(page: Page, fn: (db: IDBDatabase) => Promise<void>): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (fnBody) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ai-roleplay', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const built = new Function(`return (${fnBody})`)() as (d: IDBDatabase) => Promise<void>;
    await built(db);
    db.close();
  }, fn.toString());
}

test.describe('检索命中回显（C-03）', () => {
  test.afterEach(async ({ page }) => {
    await runInDb(page, cleanup);
  });

  test('盘上的痕迹回读后，气泡下方给出可展开的命中清单', async ({ page }) => {
    await runInDb(page, seedTracedCharacter);

    await page.goto('/chat');
    // 角色行的可访问名带"选择角色 …（当前）"后缀，且页面上还有 Runtime 状态按钮含同名，
    // 按名匹配会撞 strict mode ⇒ 用行本身的类名定位。
    await page.locator('.char-row', { hasText: CHAR_NAME }).click();
    await expect(page.locator('.msg-bubble', { hasText: '你喜欢下雨天。' })).toBeVisible({ timeout: 15_000 });

    const bubble = page.locator('.msg-turn', { hasText: '你喜欢下雨天。' }).last();
    const toggle = bubble.locator('.retrieval-trace-toggle');
    await expect(toggle, '回显条没出现：回读链路（type-adapters）或渲染挂错了一环').toBeVisible();
    await expect(toggle).toContainText('本轮检索命中 3 条');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(bubble.locator('.retrieval-trace-item')).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const rows = bubble.locator('.retrieval-trace-item');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('用户喜欢在下雨天读书');
    // 分数不上脸（三路口径不同），只在悬停提示里
    await expect(rows.nth(0)).toHaveAttribute('title', /0\.912/);
    await expect(rows.nth(1)).toContainText('旅行手记：城市的地下铁网');
    await expect(rows.nth(2)).toContainText('永恒酒馆');

    // 来源标记与三路检索的叫法一致（记忆 / 资料 / 设定），不是第四种叫法
    await expect(rows.nth(0).locator('.retrieval-trace-channel')).toHaveText('记忆');
    await expect(rows.nth(1).locator('.retrieval-trace-channel')).toHaveText('资料');
    await expect(rows.nth(2).locator('.retrieval-trace-channel')).toHaveText('设定');
  });

  test('没有痕迹的旧消息不渲染回显条（不留一颗点了没反应的按钮）', async ({ page }) => {
    await runInDb(page, seedTracedCharacter);
    await page.goto('/chat');
    // 角色行的可访问名带"选择角色 …（当前）"后缀，且页面上还有 Runtime 状态按钮含同名，
    // 按名匹配会撞 strict mode ⇒ 用行本身的类名定位。
    await page.locator('.char-row', { hasText: CHAR_NAME }).click();
    await expect(page.locator('.msg-bubble', { hasText: '你还记得我喜欢什么天气吗' })).toBeVisible({ timeout: 15_000 });

    const userTurn = page.locator('.msg-turn', { hasText: '你还记得我喜欢什么天气吗' }).first();
    await expect(userTurn.locator('.retrieval-trace-toggle')).toHaveCount(0);
  });
});
