#!/usr/bin/env node
/**
 * csp-audit.mjs — Web 端 CSP **运行时**审计（手动诊断工具，非 CI 门禁）
 *
 * 与 scripts/csp-guard.mjs 的分工：
 * - csp-guard.mjs（静态契约，已接入 CI）：校验构建产物**含**正确 CSP、未被削弱；
 * - csp-audit.mjs（运行时，本脚本）：用真实浏览器加载生产构建，监听
 *   securitypolicyviolation，确认 CSP **没有误伤**实际功能（放行清单是否够用）。
 *
 * 使用场景：任何改动 CSP 允许清单、新增第三方资源（CDN/字体/模型源）、
 *   或新增运行时样式注入之后，运行本脚本确认无新增违规。
 *
 * 用法：
 *   npm run build
 *   npx vite preview --port 4173 --strictPort     # 另开一个终端
 *   node scripts/csp-audit.mjs                    # 或 BASE_URL=... node scripts/csp-audit.mjs
 *
 * 输出：逐路由的 CSP 违规数 / console 错误 / 404，并做一次负向对照
 *   （注入内联脚本，确认 CSP 确实被浏览器执行而非仅存在于 HTML 中）。
 *
 * 为何不接入 CI：需要「构建产物 + 静态服务器 + 真实浏览器」三件套，
 *   放进 quality-gates 会显著拉长门禁；静态契约检查已覆盖「CSP 被静默移除/削弱」这一主要回归风险。
 */

import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';

/** 覆盖主要路由类型：主 Tab / 详情页 / 编辑器 / 移动端也用的页面 */
const ROUTES = [
  '/chat',
  '/character',
  '/community-market',
  '/worldbook',
  '/settings',
  '/character/new',
  '/profile',
  '/databank',
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const ctx = await browser.newContext();
// 预置 onboarding 完成标志，避免引导弹窗遮挡导致组件不渲染（漏检违规）
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('ai-roleplay:onboarding-done', '1');
  } catch {
    /* ignore */
  }
});
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
const notFound = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('response', (r) => {
  if (r.status() === 404) notFound.push(r.url());
});

// 每次导航前重置违规收集器
await page.addInitScript(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__csp.push({
      directive: e.violatedDirective,
      blockedURI: e.blockedURI,
      source: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : '',
    });
  });
});

const results = [];
for (const route of ROUTES) {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  notFound.length = 0;
  try {
    await page.goto(BASE + route, { waitUntil: 'load', timeout: 20_000 });
    await page.waitForTimeout(1200);
    const csp = await page.evaluate(() => window.__csp ?? []);
    results.push({
      route,
      csp,
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      notFound: [...notFound],
    });
  } catch (err) {
    results.push({
      route,
      error: String(err),
      csp: [],
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      notFound: [...notFound],
    });
  }
}

// ── 负向对照：确认 CSP 真的被浏览器执行（而非仅存在于 HTML 中）──
await page.goto(BASE + '/chat', { waitUntil: 'load' });
const negativeControl = await page.evaluate(async () => {
  const before = window.__csp.length;
  const s = document.createElement('script');
  s.textContent = 'window.__inlineRan = true;';
  document.head.appendChild(s);
  await new Promise((r) => setTimeout(r, 300));
  return {
    inlineExecuted: window.__inlineRan === true,
    newViolations: window.__csp.slice(before).map((v) => `${v.directive} <- ${v.blockedURI}`),
  };
});

await browser.close();

let totalCsp = 0;
for (const r of results) {
  totalCsp += r.csp.length;
  const flag = r.csp.length === 0 && !r.error ? 'OK  ' : 'FAIL';
  console.log(
    `[${flag}] ${r.route}  csp=${r.csp.length} consoleErr=${r.consoleErrors.length} pageErr=${r.pageErrors.length} 404=${r.notFound.length}` +
      (r.error ? ` ERROR=${r.error.slice(0, 120)}` : '')
  );
  for (const v of r.csp) console.log(`        CSP 违规: ${v.directive}  <-  ${v.blockedURI}  ${v.source}`);
  for (const c of r.consoleErrors.slice(0, 3)) console.log(`        console: ${c.slice(0, 160)}`);
  for (const p of r.pageErrors.slice(0, 3)) console.log(`        pageerror: ${p.slice(0, 160)}`);
  for (const n of r.notFound.slice(0, 3)) console.log(`        404: ${n}`);
}

console.log(`\n总计 CSP 违规: ${totalCsp}`);
console.log('负向对照（注入内联脚本，应被 script-src 拦截）:');
console.log(`  内联脚本实际执行: ${negativeControl.inlineExecuted}   （期望 false）`);
console.log(`  新增违规: ${JSON.stringify(negativeControl.newViolations)}`);

const enforced = negativeControl.inlineExecuted === false && negativeControl.newViolations.length > 0;
if (totalCsp > 0) {
  console.error('\n[FAIL] 存在 CSP 违规 —— 放行清单不足，请调整 vite.config.ts 的 WEB_CSP_DIRECTIVES。');
  process.exit(1);
}
if (!enforced) {
  console.error('\n[FAIL] 负向对照未生效 —— CSP 可能未被浏览器执行（检查 meta 是否被移除或写错）。');
  process.exit(1);
}
console.log('\n[PASS] 无 CSP 违规，且负向对照确认 CSP 已被浏览器执行。');
