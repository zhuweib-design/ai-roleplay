#!/usr/bin/env node
/**
 * i7-control-font-size-guard.mjs — 跨端评审 I-7 的 CI 守卫
 *
 * 背景：iOS Safari 在聚焦 font-size < 16px 的可编辑控件（input / textarea / select）时
 *   会自动放大页面（zoom），顶破布局。业界通用兜底是在移动断点内把可编辑控件的
 *   font-size 抬到 16px。本项目已有实现 —— src/styles/app-global.css 的
 *   `@media (max-width: 640px)` 内 `input, textarea, select { font-size: 16px; }`，
 *   但此前没有任何门禁保护它：删掉或改小都不会被发现（I-7 登记为「未转门禁」）。
 *
 * 本守卫做两件事：
 *   1. 硬检查（阻断）：src/ 下必须存在一条在移动断点（max-width ≤ 640px）内生效的规则，
 *      其选择器覆盖 input、textarea、select（**元素类型选择器**），且声明 font-size ≥ 16px。缺失即失败。
 *   2. 告警（不阻断，区分「已覆盖 / 未覆盖」）：扫描 src/ 下指向可编辑控件、且声明 font-size < 16px
 *      的**单个选择器**，逐个判定是否已被移动覆盖 —— 若同文件内存在「源码序在其后、位于 ≤640px 媒体查询内、
 *      含同一（规范化后）选择器、且声明 font-size ≥ 16px」的规则，则算「已覆盖」（不再告警）；
 *      否则计入「未覆盖」告警（仍需人工核查）。
 *      这样告警只反映**真正未被移动兜底覆盖**的选择器，避免「有意保留给桌面的 <16px 声明」造成永久噪声。
 *
 *      「已覆盖」判定的**前提**：覆盖块使用与顶层规则**完全相同的选择器**（规范化空白后逐字相同）。
 *      本检查**不建模 CSS 特异性**——若覆盖块换用更弱的选择器（如用 `input` 去覆盖 `.field-input`），
 *      层叠上仍可能被压制，但本静态检查会误判为「已覆盖」。故修复此类问题时**务必沿用原选择器**。
 *
 * 判定边界（重要，用于抑制误报）：
 *   - 硬检查**只认元素类型选择器**（`input` / `textarea` / `select`），语义与历史一致；
 *   - 告警在元素类型选择器之外，**额外**纳入「模板里挂在 <input>/<textarea>/<select> 标签上的类名」
 *     所指向的规则（如 `.field-input`、`.ctx-textarea`）——纯 CSS 无法判断类名语义，
 *     故反查 `.vue` 模板：某类名**仅**出现在控件标签、未出现在其他元素上时，才视为控件类名；
 *   - 不覆盖：`:class` 对象键形式（`{ foo: cond }`）绑定的类名、以及挂在非控件元素上的
 *     contenteditable 类名 —— 宁可保守，避免误报淹没信号。
 *
 * 范围：`.css` 文件与 `.vue` 的 `<style>` 块；统计前剥离 CSS 注释（保持行号不变）。
 * 移动断点口径与 scripts/breakpoint-guard.mjs 一致：`max-width ≤ 640px` 视为移动断点。
 *
 * 注意：本守卫只能证明「兜底规则**存在**」这一静态事实；该规则在真实浏览器里是否**生效**，
 *   受层叠特异性影响（组件 scoped 规则可能压制它），需结合告警清单人工核查。
 *
 * 用法：node scripts/i7-control-font-size-guard.mjs（或 npm run check:i7-control-font-size）
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

/** 移动断点上限（与 breakpoint-guard.mjs / viewport.ts 的 mobileMax=640 一致） */
const MOBILE_MAX = 640;
/** iOS 聚焦自动放大的字号阈值：可编辑控件 font-size 必须 ≥ 16px */
const MIN_FONT_SIZE = 16;
/** 触发 iOS 自动放大的可编辑控件元素 */
const CONTROL_ELEMENTS = ['input', 'textarea', 'select'];

const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'coverage' || name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(css|vue|scss|sass)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** 剥离 CSS 注释，但保留换行，使行号与源文件一致（避免注释里的字样被计入） */
function stripCommentsKeepLines(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * 取文件的「CSS 文本」：.vue 只保留 <style> 块内容，块外内容以空格掩码，
 * 同时保留每行长度与换行，确保后续解析出的行号仍指向源文件真实行号。
 */
function cssTextOf(file, raw) {
  if (!file.endsWith('.vue')) return raw;
  const lines = raw.split('\n');
  let inStyle = false;
  const out = [];
  for (const line of lines) {
    if (!inStyle) {
      if (/<style\b[^>]*>/i.test(line)) {
        inStyle = true;
        let rest = line.replace(/<style\b[^>]*>/i, (m) => ' '.repeat(m.length));
        if (/<\/style>/i.test(rest)) {
          inStyle = false;
          rest = rest.replace(/<\/style>/i, (m) => ' '.repeat(m.length));
        }
        out.push(rest);
      } else {
        out.push(' '.repeat(line.length));
      }
    } else if (/<\/style>/i.test(line)) {
      inStyle = false;
      out.push(line.replace(/<\/style>/i, (m) => ' '.repeat(m.length)));
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

/** 行号映射：给定字符下标返回 1-based 行号 */
function makeLineOf(text) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  return (idx) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** 数值 + 单位 → px（rem/em 按根字号 16px 近似） */
function toPx(num, unit) {
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  return unit.toLowerCase() === 'px' ? n : n * 16;
}

/** 判断媒体查询前奏是否落在移动断点内（max-width ≤ 640px，且不含排除移动的 min-width） */
function isMobileMedia(prelude) {
  const maxWidths = [...prelude.matchAll(/max-width\s*:\s*([\d.]+)(px|rem|em)/gi)].map((m) =>
    toPx(m[1], m[2])
  );
  const minWidths = [...prelude.matchAll(/min-width\s*:\s*([\d.]+)(px|rem|em)/gi)].map((m) =>
    toPx(m[1], m[2])
  );
  const hasMobileMax = maxWidths.some((w) => w !== null && w <= MOBILE_MAX);
  const hasDesktopMin = minWidths.some((w) => w !== null && w > MOBILE_MAX);
  return hasMobileMax && !hasDesktopMin;
}

/**
 * 轻量 CSS 块解析：返回全部「规则」（选择器 + 声明体 + 是否位于移动断点内 + 行号）。
 * 覆盖本仓库常规写法（单行紧凑规则、嵌套 @media / @supports），不追求完整 CSS 语法。
 */
function parseRules(cssText, lineOf) {
  const rules = [];
  const stack = []; // { kind: 'media' | 'at' | 'rule', inMobile, selector, openIndex, line }
  let segmentStart = 0;

  const firstNonWs = (start, end) => {
    let i = start;
    while (i < end && /\s/.test(cssText[i])) i++;
    return i;
  };

  for (let i = 0; i < cssText.length; i++) {
    const ch = cssText[i];
    if (ch === '{') {
      const prelude = cssText.slice(segmentStart, i).trim();
      const parentInMobile = stack.length ? stack[stack.length - 1].inMobile : false;
      if (/^@media\b/i.test(prelude)) {
        stack.push({ kind: 'media', inMobile: parentInMobile || isMobileMedia(prelude) });
      } else if (prelude.startsWith('@')) {
        stack.push({ kind: 'at', inMobile: parentInMobile });
      } else {
        stack.push({
          kind: 'rule',
          inMobile: parentInMobile,
          selector: prelude,
          openIndex: i,
          selStart: firstNonWs(segmentStart, i),
          line: lineOf(firstNonWs(segmentStart, i)),
        });
      }
      segmentStart = i + 1;
    } else if (ch === '}') {
      const top = stack.pop();
      if (top && top.kind === 'rule') {
        rules.push({
          selector: top.selector,
          declText: cssText.slice(top.openIndex + 1, i),
          declStart: top.openIndex + 1,
          inMobile: top.inMobile,
          orderIndex: top.selStart,
          line: top.line,
        });
      }
      segmentStart = i + 1;
    } else if (ch === ';') {
      segmentStart = i + 1;
    }
  }
  return rules;
}

/** 选择器是否含某**元素类型选择器** token（如 `input`、`input[type=text]`、`.field input`） */
function selectorHasElementType(selector, element) {
  // 元素名须为独立的类型选择器 token：前置为行首/空白/组合符/逗号/括号，
  // 后置为空白/组合符/逗号/伪类/属性/ID/类（如 `input`、`input[type=text]`、
  // `.field input`；而 `.chat-input` 前置是 `-`，不匹配）。
  const re = new RegExp(`(?:^|[\\s>+~,(])${element}(?=[\\s>+~,.:[\\]#]|$)`, 'i');
  return re.test(selector);
}

/** 选择器是否含某类选择器 `.name`（须为独立 token，避免 `.field-input-x` 命中 `.field-input`） */
function selectorHasClass(selector, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(selector);
}

/**
 * 选择器是否「指向可编辑控件」：元素类型选择器（input/textarea/select）、
 * `[contenteditable]`、或模板中确认挂到控件标签上的类名（CONTROL_CLASSES）。
 */
function selectorCoversControl(selector) {
  if (CONTROL_ELEMENTS.some((el) => selectorHasElementType(selector, el))) return true;
  if (/\[contenteditable\b/i.test(selector)) return true;
  for (const cls of CONTROL_CLASSES) {
    if (selectorHasClass(selector, cls)) return true;
  }
  return false;
}

/** 提取声明体中的 font-size 声明（含原始值与换算 px、在声明体内的下标） */
function findFontSizes(declText) {
  const out = [];
  const re = /font-size\s*:\s*([^;{}]+)/gi;
  let m;
  while ((m = re.exec(declText)) !== null) {
    const raw = m[1].trim();
    const unit = raw.match(/^([\d.]+)(px|rem|em)\b/i);
    out.push({ raw, px: unit ? toPx(unit[1], unit[2]) : null, index: m.index });
  }
  return out;
}

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** 从一个标签字符串里提取 class 名（静态 class 属性 + `:class` 的字符串字面量） */
function extractClassNames(tag) {
  const names = new Set();
  const staticAttr = tag.match(/\bclass\s*=\s*"([^"]*)"/i) || tag.match(/\bclass\s*=\s*'([^']*)'/i);
  if (staticAttr) for (const c of staticAttr[1].split(/\s+/)) if (c) names.add(c);
  const dynAttr = tag.match(/:class\s*=\s*"([^"]*)"/i) || tag.match(/:class\s*=\s*'([^']*)'/i);
  if (dynAttr) {
    for (const lit of dynAttr[1].matchAll(/['"]([^'"]+)['"]/g)) {
      for (const c of lit[1].split(/\s+/)) if (c) names.add(c);
    }
  }
  return names;
}

/**
 * 反查 `.vue` 模板，收集「确认挂到可编辑控件标签上」的类名。
 * 为抑制误报，仅当某类名**只**出现在 input/textarea/select 标签、未出现在任何其他元素上时才纳入。
 */
function collectControlClasses(files) {
  const onControl = new Set();
  const onOther = new Set();
  const tagRe = /<([a-zA-Z][\w-]*)\b[^>]*>/g;
  for (const file of files) {
    if (!file.endsWith('.vue')) continue;
    const text = readFileSync(file, 'utf8');
    let m;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(text)) !== null) {
      const isControl = CONTROL_ELEMENTS.includes(m[1].toLowerCase());
      const target = isControl ? onControl : onOther;
      for (const name of extractClassNames(m[0])) target.add(name);
    }
  }
  const result = new Set();
  for (const cls of onControl) if (!onOther.has(cls)) result.add(cls);
  return result;
}

// ── 扫描 ──
const FILES = walk(SRC);
/** 模板中确认挂到 input/textarea/select 上的类名（用于告警，不参与硬检查） */
const CONTROL_CLASSES = collectControlClasses(FILES);

/** 规范化单个选择器：折叠内部空白 + trim，用于「单个选择器」精确比对 */
function normalizeSelector(s) {
  return s.replace(/\s+/g, ' ').trim();
}

let hardOk = null; // 满足硬检查的兜底规则
const mobileControlRules = []; // 移动断点内、且含元素类型选择器的规则（供诊断）
let coveredCount = 0; // 已覆盖：同文件、源码序在其后、位于 ≤640px 内且声明 font-size ≥ 16px 的同选择器规则

for (const file of FILES) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const css = stripCommentsKeepLines(cssTextOf(file, readFileSync(file, 'utf8')));
  const lineOf = makeLineOf(css);

  // 每文件一次解析，便于「同文件内前后规则」互相比对
  const infos = parseRules(css, lineOf).map((rule) => ({
    ...rule,
    parts: rule.selector.split(',').map(normalizeSelector).filter(Boolean),
    sizes: findFontSizes(rule.declText),
  }));

  for (const rule of infos) {
    const has16 = rule.sizes.some((s) => s.px !== null && s.px >= MIN_FONT_SIZE);

    // 硬检查候选：移动断点内、含 **裸元素类型选择器** input/textarea/select 三者、且 font-size ≥ 16px。
    // 注：D1 之后各组件也新增了「.form-row input 等后代选择器」的 ≤640 覆盖，若仍用 selectorHasElementType
    // （后代也算），删掉全局兜底 app-global.css 后会被组件块误判为「已满足」，导致硬检查失效。
    // 故此处要求选择器是**裸元素类型选择器**（即全局兜底 `input, textarea, select` 形态），
    // 以确保「删掉/改小全局兜底 → exit 1」这一语义不被削弱。
    // 已知过严（fail-closed，偏安全方向，宁可误红不漏放）：等价的 `:where(input, textarea, select)`、
    // `body input, body textarea, body select` 等写法会被判为**不满足**而误报失败；
    // 如需把全局兜底改写成这类形式，请同步调整本判定。
    if (
      rule.inMobile &&
      CONTROL_ELEMENTS.every((el) => rule.parts.some((p) => p.toLowerCase() === el))
    ) {
      mobileControlRules.push({
        rel,
        line: rule.line,
        selector: collapse(rule.selector),
        sizes: rule.sizes,
        satisfies: has16,
      });
      if (has16 && !hardOk) hardOk = { rel, line: rule.line };
    }

    // 告警分类（按逗号拆分到单个选择器）：仅针对指向可编辑控件且声明 < 16px 的选择器
    const under16 = rule.sizes.filter((s) => s.px !== null && s.px < MIN_FONT_SIZE);
    if (!under16.length) continue;
    for (const part of rule.parts) {
      if (!selectorCoversControl(part)) continue;
      // 「已覆盖」= 同文件、源码序在其后、位于 ≤640px 媒体查询内、声明 ≥16px、且含同一（规范化）选择器
      const covered = infos.some(
        (c) =>
          c !== rule &&
          c.inMobile &&
          c.orderIndex > rule.orderIndex &&
          c.sizes.some((s) => s.px !== null && s.px >= MIN_FONT_SIZE) &&
          c.parts.includes(part)
      );
      if (covered) {
        coveredCount += 1;
      } else {
        const declLine = lineOf(rule.declStart + under16[0].index);
        warnings.push(
          `${rel}:${declLine} 未覆盖的可编辑控件字号 ${under16.map((s) => s.raw).join(', ')}（< 16px）` +
            `—— 选择器 \`${part}\`；该选择器在移动断点（≤${MOBILE_MAX}px）内无 ≥${MIN_FONT_SIZE}px 覆盖，iOS 聚焦会放大页面`
        );
      }
    }
  }
}

// 硬检查：必须存在移动断点内的可编辑控件 16px 兜底
if (!hardOk) {
  errors.push(
    `未找到「移动断点（max-width ≤ ${MOBILE_MAX}px）内覆盖 input / textarea / select 且 font-size ≥ ${MIN_FONT_SIZE}px」的兜底规则`
  );
}

// ── 输出 ──
console.log(
  `[i7-control-font-size-guard] 已覆盖（移动断点内有 ≥${MIN_FONT_SIZE}px 覆盖）: ${coveredCount} 条`
);
console.log(`[i7-control-font-size-guard] 未覆盖: ${warnings.length} 条`);

if (warnings.length) {
  console.log(
    '\n[i7-control-font-size-guard] 未覆盖明细（不阻断，仅提示人工核查）—— 判定范围：input/textarea/select ' +
      '元素类型选择器、[contenteditable]、以及模板中确认挂到控件标签上的类名：'
  );
  for (const w of warnings) console.log('  ⚠ ' + w);
  console.log('');
}

if (errors.length) {
  console.error(`\n[i7-control-font-size-guard] 失败：${errors.length} 处问题\n`);
  for (const e of errors) console.error('  ✗ ' + e);
  if (mobileControlRules.length) {
    console.error('\n移动断点内、针对可编辑控件的现有规则（诊断）：');
    for (const r of mobileControlRules) {
      const sizeText = r.sizes.length
        ? r.sizes.map((s) => `${s.raw}${s.px === null ? '(无法换算)' : `=${s.px}px`}`).join(', ')
        : '未声明 font-size';
      console.error(`  · ${r.rel}:${r.line} \`${r.selector}\` → font-size: ${sizeText}`);
    }
  } else {
    console.error('\n移动断点内未发现任何针对 input / textarea / select 的规则。');
  }
  console.error(
    '\n修复指引：在 src/styles/app-global.css 的 @media (max-width: 640px) 内保留（或补回）兜底 ——\n' +
      '  input,\n  textarea,\n  select {\n    font-size: 16px;\n  }\n' +
      '不得删除或降到 16px 以下，否则 iOS Safari 聚焦时会自动放大页面。\n'
  );
  process.exit(1);
}

console.log(
  `[i7-control-font-size-guard] 通过：兜底规则存在（${hardOk.rel}:${hardOk.line}）；未覆盖 ${warnings.length} 条。`
);
console.log(
  '[i7-control-font-size-guard] 说明：以上仅为「兜底规则存在」的静态事实；该规则在真实浏览器里是否**生效**受层叠特异性影响' +
    '（组件 scoped 规则可能压制它），请结合上方未覆盖清单人工核查，勿据此认为已防护。'
);
