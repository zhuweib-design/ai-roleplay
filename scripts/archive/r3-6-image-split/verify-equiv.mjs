/**
 * R3-6 附带校验：css-equiv 报的「丢失」是否都是 `:deep()` 形式变化（而不是真搬漏）
 *
 * css-equiv 的判据是 (媒体前缀, selector, body) 三元组逐字比对，`:deep()` 包装会改变
 * selector 文本，于是被记成「丢失」。本脚本把每条「丢失」都拿去当前文件里找
 * `.image-gen-view :deep(<原选择器>)` + **逐字相同的 body**，找到即视为形式变化。
 *
 * 用法：node scripts/archive/r3-6-image-split/verify-equiv.mjs
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_PATH = 'src/views/ImageGeneratorView.vue';
const FILES = [
  'src/views/ImageGeneratorView.vue',
  'src/views/ImageGenGeneratePanel.vue',
  'src/views/ImageGenGalleryPanel.vue',
  'src/views/ImageGenSettingsPanel.vue',
];

const stripCmt = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
const styleOf = (t) =>
  [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => stripCmt(m[1])).join('\n');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** 轻量规则解析：返回拆到单选择器的 (prefix, sel, body) */
function rules(text) {
  const out = [];
  const stack = [];
  let seg = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const p = norm(text.slice(seg, i));
      const parent = stack.length ? stack[stack.length - 1].prefix : '';
      if (/^@(media|supports|container|layer)\b/i.test(p)) stack.push({ kind: 'at', prefix: p });
      else if (p.startsWith('@')) stack.push({ kind: 'at', prefix: parent, opaque: true });
      else stack.push({ kind: 'rule', prefix: parent, sel: p, open: i });
      seg = i + 1;
    } else if (ch === '}') {
      const t = stack.pop();
      if (t && t.kind === 'rule') {
        out.push({ prefix: t.prefix, sel: t.sel, body: norm(text.slice(t.open + 1, i)) });
      }
      seg = i + 1;
    } else if (ch === ';' && stack.length === 0) {
      seg = i + 1;
    }
  }
  return out.flatMap((r) => r.sel.split(',').map(norm).filter(Boolean).map((p) => ({ ...r, sel: p })));
}

const baseRules = rules(styleOf(execFileSync('git', ['show', `HEAD:${BASE_PATH}`], { encoding: 'utf8' })));
const curRules = FILES.flatMap((f) => rules(styleOf(fs.readFileSync(f, 'utf8'))));

const key = (r) => `${r.prefix} || ${r.sel} || ${r.body}`;
const curSet = new Set(curRules.map(key));
const lost = baseRules.filter((r) => !curSet.has(key(r)));

const deepOf = (sel) => `.image-gen-view :deep(${sel})`;

console.log(`基线规则 ${baseRules.length} / 当前规则 ${curRules.length} / 丢失 ${lost.length}\n`);
let bad = 0;
for (const r of lost) {
  const want = `${r.prefix} || ${deepOf(r.sel)} || ${r.body}`;
  const hit = curSet.has(want);
  if (!hit) bad += 1;
  console.log(`${hit ? '✓ 形式变化（:deep）' : '✗ 真丢失'}  [${r.prefix || '(无媒体前缀)'}] ${r.sel}`);
  if (hit) console.log(`    → ${deepOf(r.sel)}（body 逐字相同）`);
}
console.log(`\n真丢失 ${bad} 条`);
process.exit(bad === 0 ? 0 : 1);
