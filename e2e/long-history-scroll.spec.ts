import { test, expect } from '@playwright/test';

/**
 * E2E · D-5 / D-6 修复验证（REAL_DEVICE_TEST_2026-10-03 §七 自动化盲区补漏）
 *
 * 原缺陷（仅真实浏览器可现形，jsdom 不派发 scroll 事件）：
 * - D-5：打开长群聊落在列表中部并自行扩页（smooth 滚底 + 触顶误判）
 * - D-6：单聊顶部占位高度被增量累加重复计数（windowStart=0 时仍有 29740px 空白）
 *
 * 修复后断言：
 * - D-5：打开 150 条群聊后视口落在**最新一条**（底部），尾窗口 60 条
 * - D-6：单聊把"加载更早消息"点到尽头后，顶部占位高度为 0（且消息 #001 真实渲染）
 *
 * 造数方式沿用 B10 附录 A（IndexedDB 直写，0 模型消耗）；用例自清理。
 */

const DB_NAME = 'ai-roleplay';
const DB_VERSION = 6;

async function seed(page: import('@playwright/test').Page, fn: (db: IDBDatabase) => Promise<void>) {
  await page.evaluate(async (fnBody) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ai-roleplay', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // fnBody 以源码字符串传入，页内重建为函数
    const fn = new Function(`return (${fnBody})`)() as (db: IDBDatabase) => Promise<void>;
    await fn(db);
    db.close();
  }, fn.toString());
}

/** 在页面上下文内执行的种子函数（序列化传入） */
function seedGroupD5(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.parse('2026-10-03T10:00:00.000Z');
    const members = [['kael', 'Kael'], ['lyra', 'Lyra'], ['mira', 'Mira']].map(
      ([characterId, name]) => ({
        characterId,
        name,
        joinedAt: new Date(t0).toISOString(),
        allowAutoSelect: true,
      }),
    );
    const msgs = Array.from({ length: 150 }, (_, k) => {
      const i = k + 1;
      const m = members[i % 3]!;
      return {
        id: `d5-${String(i).padStart(3, '0')}`,
        role: i % 7 === 0 ? 'user' : 'assistant',
        content: `D5分页标记#${String(i).padStart(3, '0')} ${m!.name}`,
        timestamp: new Date(t0 + i * 1000).toISOString(),
        swipes: [],
        swipeIndex: 0,
        characterId: m!.characterId,
        characterName: m!.name,
      };
    });
    const group = {
      id: 'group-d5-fix',
      name: 'D5-修复验证群',
      description: '',
      members,
      firstMessage: msgs[0]!.content,
      messages: msgs,
      mode: 'natural',
      lastSpeakerId: 'mira',
      createdAt: new Date(t0).toISOString(),
      updatedAt: new Date(t0 + 200000).toISOString(),
      lifecycleStatus: 'active',
    };
    const tx = db.transaction(['groups'], 'readwrite');
    tx.objectStore('groups').put(group);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function seedChatD6(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const name = 'D5D6-修复验证角色';
    const messages = Array.from({ length: 320 }, (_, index) => ({
      id: `d6-m-${String(index + 1).padStart(3, '0')}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `D6窗口化标记${String(index + 1).padStart(3, '0')}`,
      timestamp: Date.now() + index,
    }));
    const card = {
      id: 'char-d5d6-fix',
      name,
      description: 'D5/D6 E2E 角色',
      personality: '测试',
      scenario: '',
      firstMessage: '',
      alternateGreetings: [],
      exampleMessages: '',
      characterNote: null,
      talkativeness: 50,
      tags: ['e2e-d5d6'],
      favorite: false,
      version: '1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages,
    };
    const tx = db.transaction(['characters'], 'readwrite');
    tx.objectStore('characters').put(card);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function cleanup(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['groups', 'characters'], 'readwrite');
    tx.objectStore('groups').delete('group-d5-fix');
    tx.objectStore('characters').delete('char-d5d6-fix');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

test.describe('D-5 / D-6 长历史滚动修复', () => {
  test.afterEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async (fnBody) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('ai-roleplay', 6);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const fn = new Function(`return (${fnBody})`)() as (db: IDBDatabase) => Promise<void>;
      await fn(db);
      db.close();
    }, cleanup.toString());
  });

  test('D-5：打开 150 条群聊后视口落在最新一条（尾窗口 60 条）', async ({ page }) => {
    await page.goto('/');
    await seed(page, seedGroupD5);
    await page.goto('/group');
    await page.getByRole('button', { name: /D5-修复验证群/ }).click();
    await page.waitForTimeout(800);

    const state = await page.evaluate(() => {
      const el = document.querySelector('.messages-area') as HTMLElement | null;
      const rows = document.querySelectorAll('.msg-row').length;
      const badge = document.querySelector('.load-earlier-row')?.textContent ?? '';
      return {
        scrollTop: el?.scrollTop ?? -1,
        clientHeight: el?.clientHeight ?? -1,
        scrollHeight: el?.scrollHeight ?? -1,
        rows,
        badge,
        lastRowText: ((): string => { const rows = document.querySelectorAll('.msg-row'); return rows.length ? (rows[rows.length - 1] as HTMLElement).textContent ?? '' : ''; })(),
      };
    });

    // 修复目标①：打开即落在最新一条（视口底对齐，允许 80px 内的误差）
    const bottomGap = state.scrollHeight - state.scrollTop - state.clientHeight;
    expect(bottomGap).toBeLessThanOrEqual(80);
    // 尾窗口：DOM 60 行 = TURN_PAGE_SIZE
    expect(state.rows).toBe(60);
    // 徽标提示窗口外还有 90 条
    expect(state.badge).toContain('90');
    // 最新一条（d5-150）在视口内
    expect(state.lastRowText).toContain('D5分页标记#150');
  });

  test('D-6：单聊点到窗口起点后顶部占位为 0（不再无界增长）', async ({ page }) => {
    await page.goto('/');
    await seed(page, seedChatD6);
    await page.goto('/chat');
    await page.getByRole('button', { name: /选择角色 D5D6-修复验证角色/ }).click();
    await expect(page.locator('.msg-bubble')).toHaveCount(100);

    // 反复"加载更早消息"直到窗口起点（100→200→300→320，最多 4 次）
    const btn = page.locator('.load-older-btn');
    for (let i = 0; i < 4 && (await btn.count()); i++) {
      await btn.click();
      await page.waitForTimeout(300);
    }
    await expect(btn).toHaveCount(0);

    // D-6 修复断言：windowStart=0 时**顶部占位必须消失**（原缺陷：29740px 幽灵空白），
    // 且首条消息真实渲染。DOM 恒 ≤ 2×RENDER_WINDOW（滑窗语义，与 B10 实测一致）。
    const spacerState = await page.evaluate(() => {
      const content = document.querySelector('.chat-messages-content');
      const firstBubble = content?.querySelector('.msg-bubble');
      // 顶部占位 = 首个 .msg-bubble 之前（同父内）出现的 .msg-spacer
      let topSpacerPx: string | null = null;
      if (firstBubble) {
        let node: Element | null = firstBubble.previousElementSibling;
        while (node) {
          if (node.classList.contains('msg-spacer')) {
            topSpacerPx = (node as HTMLElement).style.height;
            break;
          }
          node = node.previousElementSibling;
        }
      }
      return {
        topSpacerPx,
        firstRendered: !!firstBubble,
        firstText: firstBubble?.textContent ?? '',
        bubbles: content?.querySelectorAll('.msg-bubble').length ?? 0,
      };
    });
    expect(spacerState.topSpacerPx === null || spacerState.topSpacerPx === '0px').toBe(true);
    expect(spacerState.firstRendered).toBe(true);
    expect(spacerState.firstText).toContain('D6窗口化标记001');
    expect(spacerState.bubbles).toBeLessThanOrEqual(200);
  });
});
