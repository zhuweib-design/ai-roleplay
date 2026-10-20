#!/usr/bin/env node
/**
 * 临时死样式扫描器（R3-6）
 *
 * 比 R4-2 的粗扫器多两条能力：
 *  1. 解析 `:class="{ active: ... }"` 的对象语法键名（含单引号/无引号）
 *  2. 解析 `:class="[cond ? 'a' : 'b']"` 的数组语法字面量
 * 判据：选择器里的「每个」类都必须在模板中出现，任一缺失 ⇒ 该规则永远匹配不到。
 *
 * 用法：node scripts/tmp-deadcss.mjs src/views/ImageGeneratorView.vue
 */
import { readFileSync } from 'node:fs';

const FILE = process.argv[2] ?? 'src/views/ImageGeneratorView.vue';
const src = readFileSync(FILE, 'utf8');

const tplStart = src.indexOf('<template>');
const tplEnd = src.lastIndexOf('</template>');
const styStart = src.indexOf('<style');
const styEnd = src.lastIndexOf('</style>');
const tpl = src.slice(tplStart, tplEnd);
const sty = src.slice(styStart, styEnd);

/** 模板里出现过的全部类名（字面量 + :class 字面量 + :class 对象语法键名） */
const classTokens = new Set();

// 1) 静态 class="..."
for (const m of tpl.matchAll(/(?<![:\w-])class="([^"]*)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c && !c.includes('{')) classTokens.add(c);
}
// 2) :class 的值区域（到属性结束引号），抽出所有「标识符:」「'x'」「"x"」
for (const m of tpl.matchAll(/:class="([^"]*)"/g)) {
  const v = m[1];
  // 对象语法键名：{ enabled: ... } / { 'is-open': x }
  for (const k of v.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$-]*)\s*:/g)) classTokens.add(k[1]);
  // 对象语法带引号键名：{ 'is-open': x }
  for (const k of v.matchAll(/(?:^|[{,\s])'([\w-]+)'\s*:/g)) classTokens.add(k[1]);
  // 数组/三元里的字符串字面量
  for (const k of v.matchAll(/'([\w-]+)'/g)) classTokens.add(k[1]);
  for (const k of v.matchAll(/"([\w-]+)"/g)) classTokens.add(k[1]);
}

/** 去掉 :class 区域后做一次全模板标识符兜底（避免漏掉拼接类名） */
const tplPlain = tpl.replace(/:class="[^"]*"/g, ' ');
const plainIds = new Set(tplPlain.match(/[A-Za-z_$][\w$-]*/g) ?? []);

/** 解析 style 段的规则（含 @media 前缀） */
const lines = sty.split('\n');
const rules = [];
let stack = []; // 媒体前缀栈
let buf = '';
const styLineOffset = src.slice(0, styStart).split('\n').length; // <style> 所在行

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  const line = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!line) continue;
  const absLine = styLineOffset + i;

  if (line.startsWith('@media') || line.startsWith('@supports')) {
    stack.push(line.replace(/\s*\{$/, ''));
    buf = '';
    continue;
  }
  if (line === '}') {
    if (stack.length > 0 && buf.trim() === '') {
      stack.pop();
    }
    buf = '';
    continue;
  }
  const openIdx = line.indexOf('{');
  if (openIdx !== -1) {
    const sel = line.slice(0, openIdx).trim();
    if (sel) {
      // 收集本块 body
      const bodyLines = [];
      let depth = 1;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l2 = lines[j].replace(/\/\*[\s\S]*?\*\//g, '');
        for (const ch of l2) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        if (depth === 0) break;
        bodyLines.push(l2);
      }
      rules.push({
        media: stack.join(' && '),
        sel,
        body: bodyLines.join('\n').trim(),
        line: absLine,
        startLine: absLine,
        endLine: styLineOffset + j,
      });
      i = j;
      buf = '';
      continue;
    }
  }
  buf += ' ' + line;
}

/** 从选择器抽出所有类名 */
function classesOf(sel) {
  const out = [];
  // 去掉 :deep(...) / :global(...) 包装但保留内部
  const s = sel.replace(/:deep\(/g, '(').replace(/:global\(/g, '(');
  for (const m of s.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.push(m[1]);
  return out;
}

const dead = [];
const live = [];
for (const r of rules) {
  const cls = classesOf(r.sel);
  if (cls.length === 0) continue; // 元素/伪类选择器不参与
  const missing = cls.filter((c) => !classTokens.has(c) && !plainIds.has(c));
  if (missing.length > 0) dead.push({ ...r, missing, cls });
  else live.push({ ...r, cls });
}

console.log(`文件：${FILE}`);
console.log(`模板类名 token：${classTokens.size} 个`);
console.log(`style 规则总数（含 @media 内）：${rules.length}`);
console.log(`疑似死规则（选择器含模板中不存在的类）：${dead.length}\n`);
for (const d of dead) {
  console.log(`L${d.startLine}-${d.endLine}  ${d.media ? '[' + d.media + '] ' : ''}${d.sel}`);
  console.log(`    缺失类: ${d.missing.join(', ')}`);
  console.log(`    body: ${d.body.replace(/\s+/g, ' ').slice(0, 140)}`);
  console.log('');
}
