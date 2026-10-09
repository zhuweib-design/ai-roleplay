/**
 * M6-d：随机事件注入回显（E11）的浏览器级证据
 *
 * M6-c 的覆盖停在 store + 组件两层，缺的正是这条"事件是上一轮生成、下一轮注入"的链路。
 * 这里走真实界面：打桩端点**按请求分流**（聊天请求回 SSE、事件生成请求回 JSON）→
 * 生成器页把开关与概率配好 → 对话第一轮生成事件（当轮不该有回显）→
 * 第二轮注入并回显 → 跳回随机事件模块带回程 → 刷新后痕迹仍在（持久化）。
 *
 * 三个前置事实决定了这条用例的形状：
 * 1. 事件表不落盘（`stores/events.ts` 注明仅内存维护），所以第一轮之后**一律用客户端跳转**，
 *    任何 `page.goto` 都会把刚生成的事件抹掉；
 * 2. 生成的事件挂在 `lorebooks[0].id` 上，角色收集不到世界书时事件永远注入不了，
 *    所以必须先造一本全局书；
 * 3. 无模板时决策走"无候选 ⇒ `defaultProbability`"分支（`templates` 默认空、
 *    全仓无 e2e 会造模板），把概率拉到 100 才能免掉 `Math.random()` 的不确定性。
 *
 * 说明：`configureMockProfile` / `waitProfileActivatedPersisted` / `seedGlobalLorebook`
 * 与 `ux-prompt-trace.spec.ts` 同构但**故意各留一份**——那份有 webkit 串跑的抖动史
 * （§七 #20），为 DRY 去动它不值当；两处若开始漂移，以本文件注释里的原因为准。
 */
import { test, expect, type Page } from '@playwright/test';

const PROFILE_NAME = 'E2E 事件模型';
const LOREBOOK_ID = 'lb-e2e-event';
const LOREBOOK_NAME = 'E2E 事件世界';
const EVENT_NAME = '断桥拦路';
const EVENT_DESC = '商队必经的木桥昨夜断了，队伍只能绕行河滩。';

function chatSse(): string {
  const chunks = ['你好', '，旅人', '！'];
  return (
    chunks
      .map((c) =>
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: c }, finish_reason: null }] })}`
      )
      .join('\n\n') + '\n\ndata: [DONE]\n'
  );
}

/** 事件生成请求的识别标记：`buildRandomEventMessages` 的 system 文案（核心模块里唯一的这句） */
const EVENT_SYSTEM_MARKER = 'RPG 事件生成器';

async function seedGlobalLorebook(page: Page): Promise<void> {
  await page.evaluate(
    async ({ id, name }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ai-roleplay');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('lorebooks', 'readwrite');
        tx.objectStore('lorebooks').put({
          id,
          name,
          description: '',
          scope: 'global',
          active: true,
          entries: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: LOREBOOK_ID, name: LOREBOOK_NAME }
  );
}

/**
 * 等"配置存在 **且** 已被激活"两件事都落盘。
 * 只等名字出现会在第一次写入后就放行（激活与新建是两次独立写入），紧随的 reload 丢激活态。
 */
async function waitProfileActivatedPersisted(page: Page, name: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (want) =>
            new Promise<string>((resolve, reject) => {
              const open = indexedDB.open('ai-roleplay');
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const db = open.result;
                const req = db.transaction('settings', 'readonly').objectStore('settings').get('app');
                req.onerror = () => {
                  db.close();
                  reject(req.error);
                };
                req.onsuccess = () => {
                  const rec = req.result as
                    | { apiProfiles?: Array<{ id: string; name: string }>; activeApiProfileId?: string | null }
                    | undefined;
                  const active = rec?.activeApiProfileId ?? null;
                  const named = rec?.apiProfiles?.find((p) => p.name === want)?.id ?? null;
                  db.close();
                  resolve(active !== null && active === named ? 'activated' : 'pending');
                };
              };
            }),
          name
        ),
      { timeout: 15_000 }
    )
    .toBe('activated');
}

async function configureMockProfile(page: Page): Promise<void> {
  await page.goto('/settings?cat=model');
  await page.getByRole('button', { name: '新增 API 配置' }).click();
  await page.locator('#p-name').fill(PROFILE_NAME);
  await page.locator('#p-baseurl').fill(`http://localhost:${process.env.E2E_PORT ?? '5173'}/mock`);
  await page.locator('#p-model').fill('gpt-4o');
  await page.locator('#p-apikey').fill('test-key');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByText(PROFILE_NAME).first()).toBeVisible();
  const activate = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activate.count()) await activate.first().click();
  await waitProfileActivatedPersisted(page, PROFILE_NAME);
}

/**
 * 等生成器配置真的落盘（快照 `random-events:store:v1`）。
 * `updateGeneratorConfig` 里是 `void persistNow()`，只等"点过保存"会在写入前就放行，
 * 紧随的整页跳转于是把配置读回默认值——事件永远不会生成，失败点离原因很远。
 */
async function waitGeneratorConfigPersisted(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>((resolve, reject) => {
              const open = indexedDB.open('ai-roleplay');
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const db = open.result;
                const req = db
                  .transaction('snapshots', 'readonly')
                  .objectStore('snapshots')
                  .get('random-events:store:v1');
                req.onerror = () => {
                  db.close();
                  reject(req.error);
                };
                req.onsuccess = () => {
                  const rec = req.result as
                    | { value?: { data?: { generatorConfig?: { enabled?: boolean; defaultProbability?: number } } } }
                    | undefined;
                  const cfg = rec?.value?.data?.generatorConfig;
                  db.close();
                  resolve(cfg?.enabled === true && cfg?.defaultProbability === 100 ? 'saved' : 'pending');
                };
              };
            })
        ),
      { timeout: 15_000 }
    )
    .toBe('saved');
}

/** 客户端跳转（不重载，保住内存里的事件表） */
async function goRail(page: Page, label: string): Promise<void> {
  await page.locator('.nav-rail').getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(250);
}

async function send(page: Page, text: string): Promise<void> {
  const input = page.getByLabel('输入消息');
  await expect(input).toBeEnabled();
  await input.fill(text);
  await page.getByRole('button', { name: '发送消息' }).click();
}

test.describe('随机事件注入回显（E11）', () => {
  test('上一轮生成的事件在下一轮注入，气泡给出可核对的回显、能跳回模块、刷新后仍在', async ({
    page,
  }) => {
    let eventCalls = 0;
    await page.route('**/mock/v1/chat/completions', (route) => {
      const raw = route.request().postData() ?? '';
      if (raw.includes(EVENT_SYSTEM_MARKER)) {
        eventCalls += 1;
        return void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [
              { message: { role: 'assistant', content: JSON.stringify({ name: EVENT_NAME, description: EVENT_DESC }) } },
            ],
          }),
        });
      }
      return void route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
        body: chatSse(),
      });
    });

    await page.goto('/chat');
    await configureMockProfile(page);
    await seedGlobalLorebook(page);
    await waitProfileActivatedPersisted(page, PROFILE_NAME);
    await page.reload();

    // ── 配置生成器：启用 + 概率拉满（这一步走真实界面，reload 之后配也能证明配置持久化）──
    await page.goto('/random-events');
    await page.locator('#tab-generator').click();
    await expect(page.locator('#panel-generator')).toBeVisible();
    await page.locator('#gen-enabled').check();
    await page.locator('#gen-prob').fill('100');
    await page.locator('#panel-generator').getByRole('button', { name: '保存配置' }).click();
    await waitGeneratorConfigPersisted(page);

    // 回到对话：整页重载，用"芯片仍就绪"证明配置与 Profile 都落盘了
    await page.goto('/chat');
    await expect(page.locator('[data-rel-jump="readiness-model"]')).toHaveClass(/is-ready/);

    // ── 第一轮：生成事件（本轮提示词里还没有它，所以本轮**不该**有回显）──
    await send(page, '今晚酒馆开门吗');
    const first = page.locator('.msg-bubble.msg-assistant').last();
    await expect(first).toContainText('你好，旅人！', { timeout: 15_000 });
    await expect(first.locator('.event-trace-toggle')).toHaveCount(0);

    // 等事件真的生成出来：客户端跳到随机事件页看结果卡（page.goto 会抹掉内存里的事件表）
    await goRail(page, '随机事件');
    await page.locator('#tab-results').click();
    await expect(page.locator('.result-card').first()).toContainText(EVENT_NAME, { timeout: 15_000 });
    expect(eventCalls).toBe(1);

    // ── 第二轮：事件被注入，回显出现 ──
    await goRail(page, '对话');
    await send(page, '再给我一杯');
    const second = page.locator('.msg-bubble.msg-assistant').last();
    await expect(second).toContainText('你好，旅人！', { timeout: 15_000 });

    const toggle = second.locator('.event-trace-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('1 条随机事件');

    await toggle.click();
    await expect(second.locator('.event-trace-name')).toHaveText(EVENT_NAME);
    // 回显不带事件正文：description 是模型生成的整段文本，既撑体积也可能摊出未公开设定
    await expect(second.locator('.event-trace-list')).not.toContainText(EVENT_DESC.slice(0, 10));

    await second.locator('.event-trace-link').click();
    await expect(page).toHaveURL(/\/random-events\?from=\/chat$/);
    // 跳过去看到的是同一条事件（模块侧的生成历史）
    await page.locator('#tab-results').click();
    await expect(page.locator('.result-card').first()).toContainText(EVENT_NAME);

    await goRail(page, '对话');

    // 先证明痕迹真的写进了 IndexedDB（而非只活在内存），再验证刷新后的回读
    await expect
      .poll(
        () =>
          page.evaluate(
            (want) =>
              new Promise<boolean>((resolve, reject) => {
                const open = indexedDB.open('ai-roleplay');
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                  const db = open.result;
                  const req = db.transaction('chats', 'readonly').objectStore('chats').getAll();
                  req.onerror = () => {
                    db.close();
                    reject(req.error);
                  };
                  req.onsuccess = () => {
                    const chats = req.result as Array<{
                      messages?: Array<{ eventTrace?: Array<{ name?: string }> }>;
                    }>;
                    const found = chats.some((chat) =>
                      (chat.messages ?? []).some((m) =>
                        (m.eventTrace ?? []).some((e) => e.name === want)
                      )
                    );
                    db.close();
                    resolve(found);
                  };
                };
              }),
            EVENT_NAME
          ),
        { timeout: 15_000 }
      )
      .toBe(true);

    await page.reload();
    const restored = page.locator('.msg-bubble.msg-assistant').last();
    await expect(restored).toContainText('你好，旅人！', { timeout: 15_000 });
    const persisted = restored.locator('.event-trace-toggle');
    await expect(persisted).toBeVisible();
    await expect(persisted).toContainText('1 条随机事件');
    // 刷新后事件表是空的（内存态），回显只能来自消息自己带的痕迹——这正是当初要落盘的理由
    expect(eventCalls).toBe(1);
  });
});
