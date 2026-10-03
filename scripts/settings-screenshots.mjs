/**
 * 优化项 8 S7 验收截图：设置页 6 个分区逐一渲染（拆分后各子组件可用性冒烟）。
 * 运行：npx playwright test --config playwright.config.ts 之外单独执行：
 *   node scripts/settings-screenshots.mjs
 * 前置：npm run build && npx vite preview --port 4173
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots';
mkdirSync(OUT, { recursive: true });

const TABS = ['appearance', 'model', 'extension', 'security', 'data', 'about'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:4173/#/settings', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

for (const tab of TABS) {
  // 点击侧边栏分类按钮（按 aria/data 分类 id 匹配）
  const btn = page.locator(`[data-category="${tab}"], button:has-text("${tab}")`).first();
  const fallback = page.getByRole('tab').filter({ hasText: /./ }).nth(TABS.indexOf(tab));
  if (await btn.count()) {
    await btn.click();
  } else {
    await fallback.click();
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/after-${tab}.png`, fullPage: false });
  console.log(`captured ${tab}`);
}
await browser.close();
console.log('done');
