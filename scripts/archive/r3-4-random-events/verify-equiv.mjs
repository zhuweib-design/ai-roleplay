/**
 * R3-4 附带校验：css-equiv 报的「丢失」是否都是形式变化 / 死规则删除（而不是真搬漏）
 *
 * 本轮三类形态：
 *   1. deep 化：宿主里 `.btn` → `:deep(.btn)`（选择器文本变化，body 逐字相同）
 *   2. 搬进 GeneratorPanel / ResultsPanel 的 plain 规则 —— 多文件集合比对时已回来，不在丢失清单
 *   3. 死规则删除：`.form-hint.success-hint`（拆前扫描即 0 使用点）
 *
 * 用法：node scripts/archive/r3-4-random-events/verify-equiv.mjs
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE_PATH = 'src/views/RandomEventsView.vue';
const FILES = [
  'src/views/RandomEventsView.vue',
  'src/views/RandomEventsTemplatesPanel.vue',
  'src/views/RandomEventsScenesPanel.vue',
  'src/views/RandomEventsGeneratorPanel.vue',
  'src/views/RandomEventsResultsPanel.vue',
];

// 拆前扫描已确认的死规则（deadcss-before.mjs 输出 1 条）
const KNOWN_DEAD = new Set(['.form-hint.success-hint']);

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

const deepOf = (sel) => `:deep(${sel})`;

let deepHit = 0;
let deadHit = 0;
const bad = [];
for (const r of lost) {
  const want = `${r.prefix} || ${deepOf(r.sel)} || ${r.body}`;
  if (curSet.has(want)) {
    deepHit += 1;
  } else if (KNOWN_DEAD.has(r.sel)) {
    deadHit += 1;
  } else {
    bad.push(r);
  }
}

console.log(`基线 ${baseRules.length} / 当前 ${curRules.length} / 丢失 ${lost.length}`);
console.log(`其中 :deep 形式变化 ${deepHit} / 死规则删除 ${deadHit} / 真丢失 ${bad.length}`);
for (const r of bad) console.log(`✗ 真丢失 [${r.prefix || '(无媒体前缀)'}] ${r.sel} || ${r.body}`);
process.exit(bad.length === 0 ? 0 : 1);
