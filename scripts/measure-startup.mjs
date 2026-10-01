#!/usr/bin/env node
/**
 * measure-startup.mjs — 启动时延实测工具（性能优化验证）
 *
 * 目的：给「优化前 / 优化后」提供可复现的量化对比数据，替代估算值。
 * 指标：
 *   - readyMs：导航开始 → 存储初始化完成（html[data-app-ready="1"]），即 App.vue onMounted 全部 await 结束
 *   - DCL / load：浏览器导航指标
 *   - FCP：首次内容绘制
 *
 * 用法：
 *   1) npm run build
 *   2) npx vite preview --port 4173 &
 *   3) node scripts/measure-startup.mjs [url] [runs]
 *      默认 http://localhost:4173/ 跑 3 次取中位数
 *
 * 注意：必须在生产构建（preview）下测量，dev 模式受 HMR/依赖优化干扰不可比。
 */

import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/';
const runs = Number(process.argv[3] ?? 3);
const listResources = process.argv.includes('--list');

const browser = await chromium.launch();
const results = [];

for (let i = 0; i < runs; i++) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached', timeout: 30000 });
  } catch (err) {
    console.error(`第 ${i + 1} 次测量失败：${err.message}`);
    await context.close();
    continue;
  }
  const ready = Date.now() - t0;
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      domContentLoaded: Math.round(n?.domContentLoadedEventEnd ?? -1),
      load: Math.round(n?.loadEventEnd ?? -1),
      fcp: Math.round(fcp?.startTime ?? -1),
    };
  });
  // 首屏传输量：应用就绪时已加载的全部资源（HTTP 缓存未命中时的实际网络字节）
  const net = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource');
    let total = 0;
    let largest = { name: '', kb: 0 };
    const list = [];
    for (const e of entries) {
      const size = e.transferSize || 0;
      total += size;
      const name = e.name.split('/').pop();
      list.push({ name, kb: Math.round(size / 1024) });
      if (size > largest.kb * 1024) largest = { name, kb: Math.round(size / 1024) };
    }
    list.sort((a, b) => b.kb - a.kb);
    return {
      resourceCount: entries.length,
      transferKB: Math.round(total / 1024),
      largestResource: `${largest.name} (${largest.kb}KB)`,
      top: list.slice(0, 10),
    };
  });
  results.push({
    run: i + 1,
    readyMs: ready,
    ...nav,
    transferKB: net.transferKB,
    largestResource: net.largestResource,
    top: net.top,
  });
  await context.close();
}

await browser.close();

if (results.length === 0) {
  console.error('无有效测量结果（确认 preview 服务已在运行）。');
  process.exit(1);
}

const median = (key) => {
  const vals = results.map((r) => r[key]).sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
};

console.log('启动测量明细:');
for (const r of results) {
  console.log(
    `  #${r.run}  ready=${r.readyMs}ms  DCL=${r.domContentLoaded}ms  load=${r.load}ms  FCP=${r.fcp}ms  首屏传输=${r.transferKB}KB`
  );
}
console.log(
  `\n中位数（${results.length} 次）: ready=${median('readyMs')}ms  DCL=${median('domContentLoaded')}ms  load=${median('load')}ms  FCP=${median('fcp')}ms  首屏传输=${median('transferKB')}KB`
);
console.log(`最大首屏资源: ${results[0]?.largestResource ?? '-'}`);
if (listResources && results[0]?.top) {
  console.log('\n首屏资源 Top 10（按传输量）:');
  for (const r of results[0].top) console.log(`  ${String(r.kb).padStart(5)}KB  ${r.name}`);
}
