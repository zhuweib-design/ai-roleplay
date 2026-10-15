import { test, expect } from '@playwright/test';

/**
 * E2E · 聊天页输入条与长按动作条（OPT_PLAN_2026-10-15 专项 D / E）
 *
 * 只在移动 project（Pixel 5：393×851 / isMobile / hasTouch）下跑，
 * 因为断言的全是"触屏才有意义"的量：静止高度、发送键在右、超长内部滚动、
 * 长按判定窗口、以及操作栏是否还赖在气泡头顶。
 *
 * 长按用 CDP `Input.dispatchTouchEvent` 派发**真实**触摸事件（带 touches[]），
 * 与在安卓模拟器上探针验证用的是同一套事件源；合成 dispatchEvent 造不出 touches。
 *
 * 造数沿用 e2e/long-history-scroll.spec.ts 的 IndexedDB 直写方式（0 模型消耗）。
 */

const CHAR_ID = 'char-touch-e2e';
const CHAR_NAME = '长按输入条验证角色';

async function seed(page: import('@playwright/test').Page) {
  await page.evaluate(
    async (args) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('ai-roleplay', 6);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const messages = Array.from({ length: 6 }, (_, i) => ({
        id: `touch-m-${i + 1}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0 ? `第${i + 1}条 用户` : `第${i + 1}条 助手回复内容`,
        timestamp: Date.now() + i,
      }));
      const card = {
        id: args.id,
        name: args.name,
        description: 'e2e 角色',
        personality: '测试',
        scenario: '',
        firstMessage: '',
        alternateGreetings: [],
        exampleMessages: '',
        characterNote: null,
        talkativeness: 50,
        tags: ['e2e-touch'],
        favorite: false,
        version: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages,
      };
      const tx = db.transaction(['characters'], 'readwrite');
      tx.objectStore('characters').put(card);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: CHAR_ID, name: CHAR_NAME }
  );
}

async function cleanup(page: import('@playwright/test').Page) {
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ai-roleplay', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['characters'], 'readwrite');
    tx.objectStore('characters').delete(id);
    tx.oncomplete = () => db.close();
  }, CHAR_ID);
}

/** 打开到该角色的聊天页 */
async function openChat(page: import('@playwright/test').Page) {
  await page.goto('/');
  await seed(page);
  await page.goto('/chat');
  await page.locator('.msg-bubble').first().waitFor();
}

test.describe('移动端聊天页：输入条 + 长按动作条', () => {
  test.afterEach(async ({ page }) => {
    await cleanup(page);
  });

  test('环境自证：这一屏确实是指针粗糙的触屏端', async ({ page }) => {
    await page.goto('/chat');
    const flags = await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      noHover: matchMedia('(hover: none)').matches,
    }));
    // 后面所有断言都建立在这两个条件上；不成立就先在这里红，别伪装成通过
    expect(flags).toEqual({ coarse: true, noHover: true });
  });

  test('输入条：静止态矮、发送键在右、超长后内部滚动而不是无限长高', async ({ page }) => {
    await openChat(page);

    const idle = await page.evaluate(() => {
      const input = document.querySelector('#chat-input') as HTMLTextAreaElement;
      const footer = document.querySelector('.chat-footer') as HTMLElement;
      const send = document.querySelector('.send-btn-primary') as HTMLElement;
      const i = input.getBoundingClientRect();
      const s = send.getBoundingClientRect();
      return {
        footerHeight: Math.round(footer.getBoundingClientRect().height),
        inputHeight: Math.round(i.height),
        inputCenterX: Math.round(i.left + i.width / 2),
        sendCenterX: Math.round(s.left + s.width / 2),
        sendBottomWithinFooter: s.bottom <= footer.getBoundingClientRect().bottom + 1,
      };
    });
    // 静止态就是一行：输入区 ≤ 44px、整条输入条 ≤ 76px（实测 73，含 1px 上边框；改造前 90）
    expect(idle.inputHeight).toBeLessThanOrEqual(44);
    expect(idle.footerHeight).toBeLessThanOrEqual(76);
    // 「发送按钮应该在右面」的机器可断言形式
    expect(idle.sendCenterX).toBeGreaterThan(idle.inputCenterX);
    expect(idle.sendBottomWithinFooter).toBe(true);

    // 8 行内容：高度封顶（CSS max-height 160）且改为内部滚动
    await page.evaluate(() => {
      const input = document.querySelector('#chat-input') as HTMLTextAreaElement;
      input.value = Array.from({ length: 8 }, (_, i) => `第${i + 1}行输入内容`).join('\n');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const grown = await page.evaluate(() => {
      const input = document.querySelector('#chat-input') as HTMLTextAreaElement;
      return {
        clientHeight: Math.round(input.clientHeight),
        scrollHeight: Math.round(input.scrollHeight),
        overflowY: getComputedStyle(input).overflowY,
      };
    });
    expect(grown.clientHeight).toBeLessThanOrEqual(160);
    expect(grown.scrollHeight).toBeGreaterThan(grown.clientHeight);
    expect(['auto', 'scroll']).toContain(grown.overflowY);

    // 清空后回到静止高度（不是一路长回去）
    await page.evaluate(() => {
      const input = document.querySelector('#chat-input') as HTMLTextAreaElement;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const shrunk = await page.evaluate(
      () => Math.round((document.querySelector('#chat-input') as HTMLTextAreaElement).getBoundingClientRect().height)
    );
    expect(shrunk).toBeLessThanOrEqual(44);
  });

  test('触屏下操作栏不再常显在气泡头顶，长按才出动作条', async ({ page }) => {
    await openChat(page);

    const hidden = await page.evaluate(() => {
      const bar = document.querySelector('.msg-toolbar') as HTMLElement | null;
      if (!bar) return { found: false };
      const cs = getComputedStyle(bar);
      return { found: true, opacity: cs.opacity, pointerEvents: cs.pointerEvents };
    });
    expect(hidden.found).toBe(true);
    // 旧写法在这里是 opacity:1（每条 AI 气泡头顶常驻 6 个 24px 小按钮）
    expect(hidden.opacity).toBe('0');
    // 且隐藏态不能吃点击
    expect(hidden.pointerEvents).toBe('none');

    const target = page.locator('.msg-wrap-assistant').first();
    // 列表打开时落在最新一条，第一条助手消息其实在视口外；不先滚进来，
    // CDP 的触点会打到别处（boundingBox 给的是相对视口的坐标，可能是负数）
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await page.waitForTimeout(620);

    const sheet = page.locator('[role="dialog"][aria-modal="true"]');
    // 手指还按着就已经弹出 ⇒ 证明是长按计时器触发的，不是抬手后的副作用
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.sheet-item')).toHaveCount(7);
    await expect(sheet.getByText('重新生成')).toBeVisible();

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // 抬手会补发一次 click，落点正好在遮罩上；这一条钉住"同一次手势不会自己关掉它"
    await expect(sheet).toBeVisible();
  });

  test('负向对照：长按期间手指移动 14px（判为滚动）不弹动作条', async ({ page }) => {
    await openChat(page);

    const first = page.locator('.msg-wrap-assistant').first();
    await first.scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    const cdp = await page.context().newCDPSession(page);

    // CDP 的触点必须带同一个 id，否则 Chromium 不会把它当成同一次按压的
    // 后续 touchmove 派发（不带 id 时实测收不到移动事件，取消逻辑自然不会被触发）
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + 14, id: 1 }],
    });
    await page.waitForTimeout(620);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  });

  test('手指端 Enter 不发送（软键盘没有 Shift，回车留给换行）', async ({ page }) => {
    await openChat(page);

    const before = await page.locator('.msg-bubble').count();
    await page.locator('#chat-input').fill('回车不该把这条发出去');
    await page.locator('#chat-input').press('Enter');
    await page.waitForTimeout(400);

    expect(await page.locator('.msg-bubble').count()).toBe(before);
    // 文案也得跟着端型换，否则提示在教用户一个不存在的手势
    await expect(page.locator('#chat-input')).toHaveAttribute(
      'placeholder',
      '输入消息…'
    );
    // 回车没有发送，而是老老实实换行（改造前：手机上根本打不出第二行）
    const value = await page.locator('#chat-input').inputValue();
    expect(value.startsWith('回车不该把这条发出去')).toBe(true);
    expect(value.endsWith('\n')).toBe(true);
  });
});
