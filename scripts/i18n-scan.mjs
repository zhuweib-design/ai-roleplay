#!/usr/bin/env node
/**
 * i18n 硬编码中文扫描门禁（T-13）
 *
 * 用途：扫描 src/ 下 Vue/TS 文件中未走 i18n 的硬编码中文 UI 文案。
 * 验收目标：切英文后无硬编码中文残留。
 *
 * 忽略策略（非 UI 文案，不算违规）：
 * - 注释：//、/* *\/、<!-- -->、/** *\/、JSDoc
 * - console.* 调试日志
 * - src/i18n/locales/zh.ts 是文案源（src/i18n 目录级忽略）
 * - src/data（mock 数据，非 UI 文案）
 *
 * 白名单机制（渐进式门禁）：
 * - .i18nignore 列出"暂未迁移"的文件/目录，默认扫描时跳过
 * - --strict 忽略白名单全量扫描（最终验收 / 单文件校验用）
 * - 每完成一个文件的文案抽取，将其从 .i18nignore 移除，门禁即刻生效
 *
 * 用法：
 *   node scripts/i18n-scan.mjs            # 扫描已迁移文件（默认）
 *   node scripts/i18n-scan.mjs --strict   # 全量强制（最终验收）
 *   node scripts/i18n-scan.mjs --limit N  # 仅显示前 N 条违规（默认 50）
 *
 * 退出码：0=通过；1=存在违规（CI 门禁用）
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const IGNORE_FILE = join(ROOT, '.i18nignore');

// 中文字符正则
const CJK_RE = /[\u4e00-\u9fa5]/;

// 文件扩展名白名单
const EXTS = new Set(['.vue', '.ts', '.tsx', '.js']);

// 默认忽略目录（文案源 / 数据 / 构建产物）
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'i18n', 'data', 'model']);

/** 读取 .i18nignore（每行一个相对路径，支持 # 注释与目录前缀） */
function loadIgnoreList() {
  if (!existsSync(IGNORE_FILE)) return [];
  return readFileSync(IGNORE_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function walk(dir) {
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!IGNORED_DIRS.has(name)) results.push(...walk(full));
    } else if (EXTS.has(name.slice(name.lastIndexOf('.')))) {
      results.push(full);
    }
  }
  return results;
}

/** 是否命中忽略清单（精确路径或目录前缀） */
function isIgnored(rel, ignoreList) {
  const r = rel.replace(/\\/g, '/');
  return ignoreList.some((pat) => {
    const p = pat.replace(/\\/g, '/').replace(/^\.\//, '');
    return r === p || r.startsWith(p + '/') || r.endsWith('/' + p);
  });
}

/**
 * 逐行去除注释后返回"可能含 UI 文案"的有效代码片段。
 * 返回 '' 表示该行整体为注释/日志，跳过。
 */
function effectiveCode(line, state) {
  let text = line;

  // ① HTML 注释（Vue 模板）——维护跨行状态
  if (state.inHtmlComment) {
    const end = text.indexOf('-->');
    if (end < 0) return '';
    text = text.slice(end + 3);
    state.inHtmlComment = false;
  }
  if (text.includes('<!--')) {
    const start = text.indexOf('<!--');
    const end = text.indexOf('-->', start);
    if (end >= 0) {
      text = text.slice(0, start) + text.slice(end + 3);
    } else {
      state.inHtmlComment = true;
      text = text.slice(0, start);
    }
  }
  if (text.trimStart().startsWith('-->')) return '';

  // ② 块注释（JSDoc / 多行 /* */）——维护跨行状态
  if (state.inBlock) {
    const end = text.indexOf('*/');
    if (end < 0) return '';
    text = text.slice(end + 2);
    state.inBlock = false;
  }
  const blockStart = text.indexOf('/*');
  if (blockStart >= 0) {
    const before = text.slice(0, blockStart);
    const after = text.slice(blockStart + 2);
    const end = after.indexOf('*/');
    if (end >= 0) {
      text = before + after.slice(end + 2);
    } else {
      state.inBlock = true;
      text = before;
    }
  }

  // ③ 整行 // 注释
  if (text.trimStart().startsWith('//')) return '';

  // ④ 行内 // 注释（跳过字符串字面量内的 //）
  let inStr = false;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === quote) inStr = false;
    } else if (c === '"' || c === "'" || c === '`') {
      inStr = true;
      quote = c;
    } else if (c === '/' && text[i + 1] === '/') {
      text = text.slice(0, i);
      break;
    }
  }

  // ⑤ console.* 调试日志整行跳过
  if (/console\.(log|warn|error|info|debug)\(/.test(text)) return '';

  return text;
}

/** 是否属于技术常量/数据行（行内允许中文，非 UI 文案） */
function isTechLine(code) {
  const trimmed = code.trim();
  // 纯字符串字面量行（mock 数据 / 字典值）
  if (/^['"`].*['"`],?$/.test(trimmed)) return true;
  // 含 URL
  if (/https?:\/\//.test(code)) return true;
  return false;
}

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;

const files = walk(SRC);
const ignoreList = loadIgnoreList();
const scanned = strict
  ? files
  : files.filter((f) => !isIgnored(relative(ROOT, f), ignoreList));
const skipped = files.length - scanned.length;

const violations = [];
for (const file of scanned) {
  const rel = relative(ROOT, file);
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const st = { inBlock: false, inHtmlComment: false };
  for (let i = 0; i < lines.length; i++) {
    const code = effectiveCode(lines[i], st);
    if (!code || !CJK_RE.test(code)) continue;
    if (isTechLine(code)) continue;
    violations.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 140)}`);
  }
}

if (violations.length > 0) {
  const mode = strict ? 'strict 全量' : '已迁移文件';
  console.error(`\n✗ i18n 门禁未通过：${mode}发现 ${violations.length} 处硬编码中文（UI 文案应走 @/i18n）\n`);
  violations.slice(0, limit).forEach((v) => console.error(`  ${v}`));
  if (violations.length > limit) {
    console.error(`  … 共 ${violations.length} 处（--limit 控制显示数量）`);
  }
  if (!strict) {
    console.error(`\n（本次扫描 ${scanned.length} 个已迁移文件，跳过 ${skipped} 个未迁移文件）`);
    console.error('提示：将新完成抽取的文件从 .i18nignore 移除即可纳入门禁。\n');
  }
  process.exit(1);
} else {
  if (strict) {
    console.log(`✓ strict 门禁通过：src 全部 ${scanned.length} 个文件无硬编码中文 UI 文案残留`);
  } else {
    console.log(`✓ i18n 门禁通过：${scanned.length} 个已迁移文件无硬编码中文残留（跳过 ${skipped} 个未迁移）`);
  }
}
