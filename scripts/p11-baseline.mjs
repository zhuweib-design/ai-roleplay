// P2-11 Phase 1: 长对话基线压测脚本
// 通过 Playwright(msedge 无头) + IndexedDB seed 注入 1k/5k/10k 消息角色,
// 实测当前 ChatMain 窗口化渲染: 初始 DOM / 上滚 20 次后 DOM 增长 / 滚动帧率 / 内存。
// 运行: node scripts/p11-baseline.mjs  (需 dev server 已运行, 默认 http://localhost:5174)
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const DB = 'ai-roleplay';
const STORE = 'characters';
const TAG = 'p11-bench';

function makeCard(id, name, n) {
  const now = Date.now();
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `第 ${i} 条消息：翡翠森林的精灵守护者缓缓睁开双眼，凝视着远方的旅人。`.repeat(3),
      timestamp: now - (n - i) * 1000,
    });
  }
  return {
    id,
    name,
    description: 'P2-11 Phase1 压测角色',
    personality: '性能测试',
    scenario: '',
    firstMessage: '测试开始',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [TAG],
    favorite: false,
    version: '1.0',
    createdAt: new Date(now - n * 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    messages,
  };
}

async function seed(page, card) {
  await page.goto(BASE);
  await page.evaluate(
    async ({ DB, STORE, TAG, card }) => {
      // 关闭新手引导(P2-7), 避免首次启动 Modal 遮挡交互
      try { localStorage.setItem('ai-roleplay:onboarding-done', '1'); } catch { /* 忽略 */ }
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open(DB, 6);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      // 清理旧压测角色
      const clean = db.transaction(STORE, 'readwrite');
      await new Promise((resolve) => {
        const r = clean.objectStore(STORE).getAll();
        r.onsuccess = () => {
          for (const c of r.result) {
            if (Array.isArray(c.tags) && c.tags.includes(TAG)) {
              clean.objectStore(STORE).delete(c.id);
            }
          }
          resolve();
        };
      });
      await new Promise((resolve) => { clean.oncomplete = resolve; });
      // 写入压测角色卡(含 messages)
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(card);
      await new Promise((resolve) => { tx.oncomplete = resolve; });
      db.close();
    },
    { DB, STORE, TAG, card }
  );
}

async function openChat(page, cardName) {
  await page.goto(`${BASE}/chat`);
  // 对话页侧边栏的角色入口按钮(aria-label = "选择角色 {name}")
  await page.getByRole('button', { name: `选择角色 ${cardName}` }).click();
  await page.waitForTimeout(2500);
  const dbg = await page.evaluate(() => {
    const main = document.querySelector('.chat-main, .chat-content, .app-main');
    return {
      mainText: (main?.textContent ?? '').slice(0, 200).replaceAll('\n', ' | '),
      bubbles: document.querySelectorAll('.msg-bubble').length,
      hasMsgArea: !!document.querySelector('.chat-messages'),
    };
  });
  console.log('  [debug]', JSON.stringify(dbg));
  await page.waitForSelector('.msg-bubble', { timeout: 15000 });
}

function sampleDom(page) {
  return page.evaluate(() => {
    const bubbles = document.querySelectorAll('.msg-bubble').length;
    const total = document.querySelectorAll('.chat-messages *').length;
    return { bubbles, total };
  });
}

async function scrollToTopTimes(page, times) {
  const perf = await page.evaluate(async (times) => {
    const el = document.querySelector('.chat-messages');
    if (!el) return { error: 'no .chat-messages' };
    let frames = 0;
    const frameStart = performance.now();
    let rafStop = false;
    const rafLoop = () => {
      if (rafStop) return;
      frames++;
      requestAnimationFrame(rafLoop);
    };
    requestAnimationFrame(rafLoop);
    const t0 = performance.now();
    for (let i = 0; i < times; i++) {
      el.scrollTop = 0; // 触发 scrollTop<300 的自动加载
      // 等待加载完成(loadingOlder 释放 + nextTick 重渲染)
      await new Promise((r) => setTimeout(r, 350));
    }
    const t1 = performance.now();
    rafStop = true;
    return { elapsedMs: t1 - t0, frames, fps: Math.round((frames / (t1 - frameStart)) * 1000) };
  }, times);
  return perf;
}

async function benchmark(count) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const card = makeCard(`p11-${count}`, `压测${count}`, count);
  try {
    const page = await browser.newPage();
    await seed(page, card);
    await openChat(page, card.name);
    const initial = await sampleDom(page);
    const scroll = await scrollToTopTimes(page, 20);
    const after = await sampleDom(page);
    const memory = await page.evaluate(() => ({
      usedMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
      totalMB: performance.memory ? Math.round(performance.memory.totalJSHeapSize / 1048576) : -1,
    }));
    console.log(JSON.stringify({ count, initial, after, scroll, memory }));
    await page.close();
  } finally {
    await browser.close();
  }
}

console.log('P2-11 Phase 1 基线压测 (dev:', BASE, ')');
for (const n of [1000, 5000, 10000]) {
  console.log(`--- ${n} 条消息 ---`);
  await benchmark(n);
}
console.log('done');
