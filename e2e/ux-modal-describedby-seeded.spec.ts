import { test, expect, type Page } from '@playwright/test';

/**
 * E2E · 需要造数才看得到的三个对话框（M10-a）
 *
 * M9-d 的台账里有三条当时登记成 `blocked`：消息删除、故事删除、数据银行删除。
 * 理由都是"要先有那条数据"。这三条数据可以直接写 IndexedDB（仓库里已有同法：
 * `ux-status-color` 造故事、`long-history-scroll` 造 320 条消息），所以本批把它们
 * 从"造不出"改成"验过了"。
 *
 * 断言与另两份 spec 同一条：`[role=dialog]` 的 `aria-describedby` 必须**正好**是登记的那条 id，
 * 且反查得到的节点就在对话框内部、有实际文字。
 */

interface Resolved {
  id: string;
  exists: boolean;
  inside: boolean;
  text: string;
}

async function expectDescribedResolved(page: Page, expectedIds: string[]): Promise<string[]> {
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  const state = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { title: '', raw: '', resolved: [] as Resolved[] };
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
          return {
            id,
            exists: !!el,
            inside: !!el && d.contains(el),
            text: (el?.textContent ?? '').trim(),
          };
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
  return state.resolved.map((r) => r.text);
}

/**
 * 往应用真正在用的库里写记录。
 *
 * 库名由 `resolveDbName()` 决定（可能是 `ai-roleplay-<profile>`），且应用是异步开库的，
 * 所以先等库出现、再挑版本号最高的那个 —— 这两步都是 `ux-status-color` 踩过的时序坑。
 */
async function seed(
  page: Page,
  storeWrites: Array<{ store: string; records: unknown[] }>
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          (await indexedDB.databases()).some((d) => d.name?.startsWith('ai-roleplay'))
        ),
      { timeout: 15_000 }
    )
    .toBe(true);

  await page.evaluate(async (writes) => {
    const dbs = (await indexedDB.databases()).filter((d) => d.name?.startsWith('ai-roleplay'));
    const name = dbs.sort((a, b) => b.version - a.version)[0]!.name!;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    for (const w of writes) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(w.store, 'readwrite');
        for (const rec of w.records) tx.objectStore(w.store).put(rec as never);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  }, storeWrites);
}

const stamp = () => Date.now();

test.describe('造数才看得到的对话框', () => {
  test('消息删除确认：说明接进了无障碍树', async ({ page }) => {
    const charName = `E2E消息删除说明-${stamp()}`;
    await page.goto('/character');
    await seed(page, [
      {
        store: 'characters',
        records: [
          {
            id: `e2e-msg-${stamp()}`,
            name: charName,
            description: '用于验证消息删除对话框',
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [
              { id: 'm-1', role: 'user', content: '今晚酒馆开门吗', timestamp: stamp() },
              { id: 'm-2', role: 'assistant', content: '开着呢，进来坐。', timestamp: stamp() + 1 },
            ],
          },
        ],
      },
    ]);
    await page.reload({ waitUntil: 'networkidle' });
    // 点卡片本身是进编辑器；要进对话得走卡片上的「对话」按钮
    await page
      .getByRole('article', { name: `角色：${charName}` })
      .getByRole('button', { name: '对话' })
      .click();
    await expect(page).toHaveURL(/\/chat/);

    // 工具条只在助手气泡上（用户气泡没有「删除」），取第一条助手气泡
    const bubble = page.locator('.msg-bubble.msg-assistant').first();
    await expect(bubble).toBeVisible();
    await bubble.hover();
    await bubble.getByRole('button', { name: '删除' }).click();
    const texts = await expectDescribedResolved(page, ['msg-delete-desc']);
    expect(texts[0]).toContain('删除');
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  });

  test('故事删除确认：说明接进了无障碍树', async ({ page }) => {
    const storyName = `E2E说明接力故事-${stamp()}`;
    await page.goto('/story');
    await seed(page, [
      {
        store: 'stories',
        records: [
          {
            id: `e2e-story-${stamp()}`,
            sourceFileName: `${storyName}.txt`,
            depth: 'deep',
            status: 'completed',
            createdAt: stamp(),
            completedAt: stamp(),
            textLength: 1200,
            chunkCount: 1,
            worldInfo: { name: '灰石诸国', type: '奇幻', description: '运河与石墙。' },
            characters: [{ name: '艾莉娅', description: '精灵法师。' }],
            scenes: [],
            events: [],
            scripts: [],
            protagonist: null,
          },
        ],
      },
    ]);
    await page.reload({ waitUntil: 'networkidle' });

    await page.locator('.story-card').first().getByRole('button', { name: '删除故事' }).click();
    const texts = await expectDescribedResolved(page, ['story-delete-desc']);
    expect(texts[0].length).toBeGreaterThan(4);
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  });

  test('数据银行删除确认：说明接进了无障碍树', async ({ page }) => {
    const docName = `E2E说明接力文档-${stamp()}.txt`;
    await page.goto('/databank');
    await seed(page, [
      {
        store: 'documents',
        records: [
          {
            id: `e2e-doc-${stamp()}`,
            name: docName,
            scope: 'global',
            chunks: [],
            fileSize: 2048,
            mimeType: 'text/plain',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    ]);
    await page.reload({ waitUntil: 'networkidle' });

    await page.locator('.card-btn.delete-btn').first().click();
    const texts = await expectDescribedResolved(page, ['db-delete-desc']);
    expect(texts[0].length).toBeGreaterThan(4);
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  });
});
