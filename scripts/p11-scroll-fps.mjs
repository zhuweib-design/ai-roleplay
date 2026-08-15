// P2-11 Phase 5: 连续滚动帧率压测(真实滚动体验)
// 10000 条消息角色, 连续 wheel 滚动 3s, 采样 rAF 帧率 + DOM 恒定验证
// 运行: node scripts/p11-scroll-fps.mjs (需 dev server 运行, 默认 5174)
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
    id, name,
    description: 'P2-11 Phase5 压测角色',
    personality: '性能测试',
    scenario: '', firstMessage: '测试开始',
    alternateGreetings: [], exampleMessages: '', characterNote: null,
    talkativeness: 50, tags: [TAG], favorite: false, version: '1.0',
    createdAt: new Date(now - n * 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    messages,
  };
}

async function seed(page, card) {
  await page.goto(BASE);
  await page.evaluate(
    async ({ DB, STORE, TAG, card }) => {
      try { localStorage.setItem('ai-roleplay:onboarding-done', '1'); } catch { /* ignore */ }
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open(DB, 6);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const clean = db.transaction(STORE, 'readwrite');
      await new Promise((resolve) => {
        const r = clean.objectStore(STORE).getAll();
        r.onsuccess = () => {
          for (const c of r.result) if (Array.isArray(c.tags) && c.tags.includes(TAG)) clean.objectStore(STORE).delete(c.id);
          resolve();
        };
      });
      await new Promise((resolve) => { clean.oncomplete = resolve; });
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(card);
      await new Promise((resolve) => { tx.oncomplete = resolve; });
      db.close();
    },
    { DB, STORE, TAG, card }
  );
}

async function run() {
  const count = 10000;
  const card = makeCard(`p11-fps`, `压测FPS`, count);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await seed(page, card);
    await page.goto(`${BASE}/chat`);
    await page.getByRole('button', { name: `选择角色 压测FPS` }).click();
    await page.waitForSelector('.msg-bubble', { timeout: 15000 });
    // 滚到底部(初始尾部窗口)
    await page.evaluate(() => {
      const el = document.querySelector('.chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(300);
    const initial = await page.evaluate(() => ({
      bubbles: document.querySelectorAll('.msg-bubble').length,
      total: document.querySelectorAll('.chat-messages *').length,
    }));

    // 连续滚动 3s(上滚, 模拟用户翻阅历史), rAF 帧率采样
    const scrollPerf = await page.evaluate(async () => {
      const el = document.querySelector('.chat-messages');
      if (!el) return { error: 'no container' };
      let frames = 0;
      const t0 = performance.now();
      const rafLoop = () => {
        frames++;
        if (performance.now() - t0 < 3000) requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);
      const iv = setInterval(() => { el.scrollTop = Math.max(0, el.scrollTop - 250); }, 16);
      await new Promise((r) => setTimeout(r, 3000));
      clearInterval(iv);
      const ms = performance.now() - t0;
      return {
        frames,
        ms: Math.round(ms),
        fps: Math.round(frames / (ms / 1000)),
        bubbles: document.querySelectorAll('.msg-bubble').length,
        total: document.querySelectorAll('.chat-messages *').length,
        scrollTop: Math.round(el.scrollTop),
      };
    });

    const memory = await page.evaluate(() => ({
      usedMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    }));
    console.log(JSON.stringify({ count, initial, scroll3s: scrollPerf, memory }));
    await page.close();
  } finally {
    await browser.close();
  }
}

console.log('P2-11 Phase 5 连续滚动压测 (dev:', BASE, ')');
await run();
console.log('done');
