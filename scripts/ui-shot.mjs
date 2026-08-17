// P2-6 UI 冒烟: 全模块截图(遍历所有路由, 供逐张 UI 核验)
// 运行: node scripts/ui-shot.mjs (需 dev server 运行, 默认 5174)
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
// THEME: 指定主题生成对应截图（如 THEME=light / THEME=midnight）。
// 省略时沿用默认主题，输出到 ui-shots/ 根（维持 P2-6 深色基线行为）。
const THEME = process.env.THEME;
const OUT = THEME ? `ui-shots/themes/${THEME}` : 'ui-shots';
const VIEWPORT = { width: 1280, height: 800 };

const routes = [
  { path: '/chat', name: '01-chat' },
  { path: '/character', name: '02-characters' },
  { path: '/character/new', name: '03-character-new' },
  { path: '/settings', name: '04-settings' },
  { path: '/worldbook', name: '05-worldbook' },
  { path: '/group', name: '06-group' },
  { path: '/databank', name: '07-databank' },
  { path: '/archives', name: '08-archives' },
  { path: '/story', name: '09-story' },
  { path: '/random-events', name: '10-random-events' },
  { path: '/local-model', name: '11-local-model' },
  { path: '/image-gen', name: '12-image-gen' },
  { path: '/character-version', name: '13-character-version' },
  { path: '/community-market', name: '14-community-market' },
  { path: '/profile', name: '15-profile' },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(BASE);
  // 关闭新手引导 + 保证会话
  await page.evaluate(() => {
    try { localStorage.setItem('ai-roleplay:onboarding-done', '1'); } catch { /* ignore */ }
  });

  // 指定主题：进入设置页点击对应主题卡片（点击会持久化 settings.theme，后续路由加载均应用）
  if (THEME) {
    try {
      await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(600);
      const card = page.locator(`.theme-card[data-value="${THEME}"]`);
      if (await card.count() > 0) {
        await card.click();
        await page.waitForTimeout(400);
        console.log(`[theme] switched -> ${THEME}`);
      } else {
        console.log(`[theme] WARN: 未找到主题卡片 data-value="${THEME}"，沿用默认`);
      }
    } catch (err) {
      console.log(`[theme] FAIL: ${err.message.split('\n')[0]}`);
    }
  }

  for (const r of routes) {
    try {
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: false });
      console.log(`[ok] ${r.name} (${r.path})`);
    } catch (err) {
      console.log(`[FAIL] ${r.name} (${r.path}): ${err.message.split('\n')[0]}`);
    }
  }
  // 设置页: 展开各分类 Tab 核验
  try {
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(600);
    const tabs = await page.locator('[role="tab"]').allInnerTexts();
    for (let i = 0; i < tabs.length; i++) {
      await page.locator('[role="tab"]').nth(i).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/04-settings-tab${i}.png` });
    }
    console.log('[ok] settings tabs:', tabs.join(' / '));
  } catch (err) {
    console.log('[FAIL] settings tabs:', err.message.split('\n')[0]);
  }
  await page.close();
} finally {
  await browser.close();
}
console.log('done ->', OUT);
