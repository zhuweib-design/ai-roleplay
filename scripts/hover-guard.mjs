#!/usr/bin/env node
/**
 * hover-guard.mjs — 跨端评审 I-5 / Web SOP 评审 P2-5 的 CI 守卫
 *
 * 背景：触屏设备上 tap 会触发 :hover 并**粘滞**（直到点别处才消失），
 *   导致按钮/卡片处于错误的持续高亮态。修复方案是把 hover 样式按设备能力分流：
 *
 *     @media (hover: hover) and (pointer: fine) {
 *       .btn:hover { ... }
 *     }
 *
 *   同时，凡「hover 才显形」的交互（如 hover 才可见的工具条）必须另配
 *   `@media (hover: none)` 常显兜底，否则触屏用户永远看不到该元素。
 *
 * 本守卫做两件事：
 *   1. 禁止 src 下出现「不在 (hover: hover) media 内」的 :hover 规则；
 *   2. 报告「hover 才显形」交互（hover 规则的**声明体**里出现 visibility: visible / display:）
 *      是否已配 (hover: none) 兜底 —— 仅告警，不阻断（兜底可能写在同一文件的别处）。
 *
 * 例外说明：选择器里同时含 :hover 与 :focus-visible/:active 的规则**不能整体包裹**
 *   （会让触屏外接键盘丢失焦点样式），须拆成两条：hover 分支包裹、focus 分支不包裹。
 *   本守卫对这类组合规则同样报错，并给出拆分指引。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

const HOVER_MEDIA_RE = /@media[^{]*hover\s*:\s*hover/;
const NONE_MEDIA_RE = /@media[^{]*hover\s*:\s*none/;

const errors = [];
const warnings = [];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC, []).filter((f) => /\.(css|vue|scss|sass)$/.test(f));

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf8').split('\n');

  /** 块栈：每项标记该块是否为 (hover: hover) media */
  const stack = [];
  /** 疑似「hover 才显形」的规则（声明体含 visibility: visible / display:） */
  const revealLike = [];
  let hasNoneFallback = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const inComment = trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//');

    if (NONE_MEDIA_RE.test(line)) hasNoneFallback = true;

    if (!inComment && line.includes(':hover')) {
      const guarded = stack.some((s) => s.hover);
      const selectorPart = line.split('{')[0];
      const mixedPseudo = /:(focus|active|focus-within|focus-visible)\b/.test(selectorPart);

      if (!guarded) {
        errors.push(
          `${rel}:${i + 1} 未守卫的 :hover —— ${trimmed.slice(0, 90)}`
        );
      } else if (mixedPseudo) {
        errors.push(
          `${rel}:${i + 1} :hover 与 :focus/:active 写在同一选择器列表中，不能整体包裹 —— ${trimmed.slice(0, 90)}`
        );
      } else {
        // 收集该规则的声明体（直到花括号配平），用于「hover 才显形」判定。
        // 只认真正的显隐声明：visibility: visible / display: —— 避免把
        // transform: translateY(-1px)（悬浮位移）或类名里的 "visibility" 误判为显形。
        const body = [];
        let depth = 0;
        let started = false;
        for (let k = i; k < lines.length; k++) {
          body.push(lines[k]);
          depth += (lines[k].match(/\{/g) ?? []).length;
          depth -= (lines[k].match(/\}/g) ?? []).length;
          // 单行规则（{ 与 } 同行）也要立刻收口，否则会越过规则边界收集到无关声明
          if (lines[k].includes('{')) started = true;
          if (started && depth <= 0) break;
        }
        const bodyText = body.slice(1).join(' ');
        if (/visibility\s*:\s*visible|display\s*:/.test(bodyText)) {
          revealLike.push({ line: i + 1, text: trimmed.slice(0, 90) });
        }
      }
    }

    // 维护块栈（一行内既有 { 又有 } 的紧凑写法净变化为 0，不影响嵌套判断）
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    for (let k = 0; k < opens; k++) stack.push({ hover: HOVER_MEDIA_RE.test(line) });
    for (let k = 0; k < closes && stack.length; k++) stack.pop();
  }

  // 告警（不阻断）：本文件有 hover 显隐类交互但无 (hover: none) 兜底
  if (revealLike.length > 0 && !hasNoneFallback) {
    warnings.push(
      `${rel} 有 ${revealLike.length} 条 hover 规则疑似「hover 才显形」` +
        `（声明体含 visibility: visible / display:），但本文件未发现 @media (hover: none) 兜底 —— ` +
        `请确认触屏用户仍能看到该元素。涉及行：${revealLike.map((r) => r.line).join(', ')}`
    );
  }
}

if (warnings.length) {
  console.log('[hover-guard] 告警（不阻断）：');
  for (const w of warnings) console.log('  ⚠ ' + w);
}

if (errors.length) {
  console.error(`\n[hover-guard] 失败：发现 ${errors.length} 处问题\n`);
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(
    '\n修复指引：把 hover 规则包进按设备能力分流的媒体查询 ——\n' +
      '  @media (hover: hover) and (pointer: fine) {\n' +
      '    .btn:hover { ... }\n' +
      '  }\n' +
      '若选择器同时含 :focus-visible / :active，须拆成两条：\n' +
      '  hover 分支包进上面的媒体查询，focus 分支保持原样（不加守卫）。\n' +
      '若该交互是「hover 才显形」，还需补 @media (hover: none) { ... } 常显兜底。\n'
  );
  process.exit(1);
}

console.log(
  `[hover-guard] 通过：src 下全部 :hover 规则均已按 (hover: hover) and (pointer: fine) 分流。`
);
