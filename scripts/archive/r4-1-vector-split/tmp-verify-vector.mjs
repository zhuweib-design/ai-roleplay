#!/usr/bin/env node
/**
 * 临时校验：R4-1 的 22 条「丢失」逐条回查
 *
 * 1. 是否 `:deep()` 形式差异（selector 被 `.settings-section :deep(X)` 包裹、body 逐字一致）
 * 2. 该 X 里的每个类是否真的出现在**任一**子组件模板中（否则是真空规则，删掉才对）
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { rules, styleKeys, diff, styleOf } from './css-equiv-guard.mjs';

const BASE = 'src/components/settings/VectorModelPanel.vue';
const CURRENT = [
  'src/components/settings/VectorModelPanel.vue',
  'src/components/settings/VectorModelEnhanceSection.vue',
  'src/components/settings/VectorModelInstallSection.vue',
  'src/components/settings/VectorModelUserSection.vue',
  'src/components/settings/VectorModelRemoteSection.vue',
];

const baseText = execFileSync('git', ['show', `HEAD:${BASE}`], { encoding: 'utf8' });
const baseRules = rules(styleOf(baseText, BASE));

const curKeys = [];
const curRules = [];
for (const f of CURRENT) {
  const txt = readFileSync(f, 'utf8');
  curKeys.push(...styleKeys(txt, f));
  curRules.push(...rules(styleOf(txt, f)));
}

const { missing, extra } = diff(baseRules.map((r) => `${r.prefix} || ${r.sel} || ${r.body}`), curKeys);

// 子组件模板里出现过的 class（全部 5 个文件合并）
const tokens = new Set();
for (const f of CURRENT) {
  const txt = readFileSync(f, 'utf8');
  const ts = txt.split('\n').findIndex((l) => l === '<template>');
  const lines = txt.split('\n');
  const te = lines.findIndex((l, i) => i > ts && l === '</template>');
  const tpl = ts >= 0 ? lines.slice(ts, te + 1).join('\n') : '';
  for (const m of tpl.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) for (const t of m[1].split(/\s+/)) if (t) tokens.add(t);
  for (const m of tpl.matchAll(/:class\s*=\s*"\{([^}]*)\}"/g))
    for (const p of m[1].split(',')) {
      const k = p.split(':')[0].trim().replace(/^['"]|['"]$/g, '');
      if (k) tokens.add(k);
    }
}

const classesOf = (sel) => {
  let s = sel;
  let go = true;
  while (go) {
    const m = s.match(/:deep\(([^()]*(?:\([^()]*\))?[^()]*)\)/);
    if (!m) break;
    s = s.slice(0, m.index) + ' ' + m[1] + ' ' + s.slice(m.index + m[0].length);
  }
  return [...s.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
};

const DEEP = '.settings-section :deep(';
let deepOk = 0;
const realMissing = [];
const deadDeleted = [];
for (const key of missing) {
  const [prefix, sel, body] = key.split(' || ');
  const wantPrefix = prefix;
  const wantSel = `${DEEP}${sel})`;
  const hit = curRules.find((r) => r.prefix === wantPrefix && r.sel === wantSel && r.body === body);
  if (hit) {
    // 再查目标类是否落在模板里
    const cls = classesOf(wantSel).filter((c) => c !== 'settings-section');
    const absent = cls.filter((c) => !tokens.has(c));
    if (absent.length === 0) {
      deepOk++;
      continue;
    }
    // 宿主自身用的类（settings-section / section-*）也在这里被 tokens 覆盖
    realMissing.push(`${key}   ← 目标类不在任一模板: ${absent.join(', ')}`);
    continue;
  }
  // 死样式删除：body 一致但新集合里完全没有该选择器 ⇒ 检查其类是否在模板中
  const cls = classesOf(sel);
  const absent = cls.filter((c) => !tokens.has(c));
  if (absent.length) {
    deadDeleted.push(`${sel}  ← 模板中不存在 ${absent.join(', ')}（死规则，删除正确）`);
  } else {
    realMissing.push(`${key}   ← 未找到 :deep 等价、且类活着`);
  }
}

console.log(`基线 ${baseRules.length} 条 / 当前 ${curRules.length} 条`);
console.log(`丢失 ${missing.length} 条：`);
console.log(`  · 等价迁移为 :deep() 且目标类在模板中： ${deepOk} 条`);
console.log(`  · 死样式删除：                          ${deadDeleted.length} 条`);
for (const d of deadDeleted) console.log(`      ${d}`);
console.log(`  · 真丢失（需修）：                      ${realMissing.length} 条`);
for (const d of realMissing) console.log(`      ✗ ${d}`);
console.log(`\n多出 ${extra.length} 条（拆分产生的副本，预期内）`);
for (const e of extra) console.log(`  + ${e}`);
process.exit(realMissing.length === 0 ? 0 : 1);
