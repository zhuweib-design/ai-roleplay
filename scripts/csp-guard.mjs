#!/usr/bin/env node
/**
 * csp-guard.mjs — Web SOP 评审 P0-2 的 CI 守卫
 *
 * 背景：Web 端此前**完全没有 CSP**（仓库唯一的 CSP 定义在 src-tauri/tauri.conf.json，
 *   属桌面端），Web 端 XSS 仅靠 core/sanitize.ts 的 DOMPurify 单层防线，无纵深防御。
 *   修复方式：vite.config.ts 的 webCspPlugin() 在「生产构建 + 非 Tauri」时向
 *   index.html 注入 CSP meta。
 *
 * 本守卫对**构建产物**做静态契约校验，防止 CSP 被静默移除或削弱：
 *   1. dist/index.html 必须存在且含 Content-Security-Policy meta；
 *   2. 必须包含关键指令：default-src 'self' / script-src 'self' / object-src 'none' / base-uri 'self'；
 *   3. script-src 中不得出现 'unsafe-eval' / 'unsafe-inline'（这两个放行会让 CSP 形同虚设）；
 *   4. 构建产物中不得出现「无 src 的内联 <script>」——会被自身 CSP 拦截，导致白屏。
 *
 * 前置条件：需先执行 npm run build（CI 中紧跟 Build 步骤之后）。
 *
 * 边界说明：本守卫是**静态契约**检查，不执行浏览器。运行时违规检查
 *   （真实浏览器监听 securitypolicyviolation）属一次性验证，记录于
 *   docs/web-sop-review-2026-09-18.md，未纳入 CI。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// 默认校验 dist/index.html；可选传入路径覆盖（便于自测守卫本身）
const ENTRY = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'dist', 'index.html');
const REL = relative(ROOT, ENTRY).replace(/\\/g, '/');

/** 必须出现的关键指令（正则片段，作用于解码后的 CSP 内容） */
const REQUIRED = [
  { label: "default-src 'self'", re: /(^|;)\s*default-src[^;]*'self'/ },
  { label: "script-src 'self'", re: /(^|;)\s*script-src[^;]*'self'/ },
  { label: "object-src 'none'", re: /(^|;)\s*object-src[^;]*'none'/ },
  { label: "base-uri 'self'", re: /(^|;)\s*base-uri[^;]*'self'/ },
];

/** script-src 中禁止出现的放行（会让 CSP 形同虚设） */
const FORBIDDEN_IN_SCRIPT_SRC = ["'unsafe-eval'", "'unsafe-inline'"];

/** 解码 Vite 写属性时产生的 HTML 实体 */
function decodeEntities(s) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const errors = [];

if (!existsSync(ENTRY)) {
  console.error(
    `\n[csp-guard] 失败：未找到 ${REL}\n\n` +
      '  本守卫校验的是构建产物，请先执行：npm run build\n' +
      '  （CI 中该步骤紧跟 Build 之后，顺序由 .github/workflows/ci.yml 保证）\n'
  );
  process.exit(1);
}

const html = readFileSync(ENTRY, 'utf8');

// ── 1. CSP meta 存在 ──
const metaRe = /<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/i;
const metaTag = html.match(metaRe)?.[0];
if (!metaTag) {
  errors.push(
    `${REL} 未找到 Content-Security-Policy meta —— ` +
      'Web 端 CSP 由 vite.config.ts 的 webCspPlugin() 注入，请确认该插件仍注册于 plugins 且未被 Tauri 分支短路'
  );
}

const contentMatch = metaTag?.match(/content=["']([^"']*)["']/i);
const csp = contentMatch ? decodeEntities(contentMatch[1]) : '';

if (metaTag && !csp) {
  errors.push(`${REL} 的 CSP meta 缺少 content 属性`);
}

// ── 2. 关键指令齐备 ──
if (csp) {
  for (const { label, re } of REQUIRED) {
    if (!re.test(csp)) errors.push(`CSP 缺少关键指令：${label}`);
  }

  // ── 3. script-src 不得被削弱 ──
  const scriptSrc = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('script-src'));
  if (scriptSrc) {
    for (const bad of FORBIDDEN_IN_SCRIPT_SRC) {
      if (scriptSrc.includes(bad)) {
        errors.push(
          `CSP 的 script-src 含 ${bad} —— 该放行使 CSP 失去对脚本注入的拦截能力（P0-2 修复目标即为此）`
        );
      }
    }
  }
}

// ── 4. 构建产物不得含无 src 的内联 script（会被自身 CSP 拦截） ──
const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
const inlineTags = scriptTags.filter((t) => !/\bsrc\s*=/i.test(t));
if (inlineTags.length > 0) {
  errors.push(
    `构建产物含 ${inlineTags.length} 个无 src 的内联 <script>（如 ${inlineTags[0].slice(0, 80)}）—— ` +
      "会被自身 CSP 的 script-src 'self' 拦截导致白屏；请改为外链脚本或同步调整 CSP"
  );
}

if (errors.length) {
  console.error(`\n[csp-guard] 失败：发现 ${errors.length} 项问题\n`);
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(
    '\n修复指引：CSP 允许清单定义在 vite.config.ts 的 WEB_CSP_DIRECTIVES；\n' +
      '  如确需新增放行，请同时评估其安全影响并更新本守卫的关键指令清单。\n'
  );
  process.exit(1);
}

const directiveCount = csp.split(';').filter((s) => s.trim()).length;
console.log(
  `[csp-guard] 通过：${REL} 含 CSP meta（${directiveCount} 条指令），` +
    "关键指令齐备、script-src 未被 'unsafe-eval'/'unsafe-inline' 削弱、无内联 script。"
);
