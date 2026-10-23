/**
 * R3-4 死样式扫描（模板类名取并集）
 *
 * 与 scripts/tmp-deadcss.mjs 的差别：宿主里的 `:deep(.x)` 指向**子组件内部**，
 * 逐文件比对会把这些误判成死规则。故模板类名从整组文件取并集，样式仍逐文件比对。
 *
 * 判据（R3-1 立的）：选择器里的**每个**类都必须在模板中出现，任一缺失 ⇒ 永远匹配不到。
 *
 * 用法：node scripts/archive/r3-4-random-events/deadcss-check.mjs
 */
import { readFileSync } from 'node:fs';

const FILES = [
  'src/views/RandomEventsView.vue',
  'src/views/RandomEventsTemplatesPanel.vue',
  'src/views/RandomEventsScenesPanel.vue',
  'src/views/RandomEventsGeneratorPanel.vue',
  'src/views/RandomEventsResultsPanel.vue',
];

/** 模板里出现过的全部类名：静态 class + :class 字面量 + :class 对象键名 */
function tokensOf(tpl) {
  const set = new Set();
  for (const m of tpl.matchAll(/(?<![:\w-])class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c && !c.includes('{')) set.add(c);
  }
  for (const m of tpl.matchAll(/:class="([^"]*)"/g)) {
    const v = m[1];
    for (const k of v.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$-]*)\s*:/g)) set.add(k[1]);
    for (const k of v.matchAll(/(?:^|[{,\s])'([\w-]+)'\s*:/g)) set.add(k[1]);
    for (const k of v.matchAll(/'([\w-]+)'/g)) set.add(k[1]);
    for (const k of v.matchAll(/"([\w-]+)"/g)) set.add(k[1]);
  }
  return set;
}

const texts = FILES.map((f) => ({ f, src: readFileSync(f, 'utf8') }));
const tplAll = new Set();
const plainAll = new Set();
for (const { src } of texts) {
  const tpl = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'));
  for (const t of tokensOf(tpl)) tplAll.add(t);
  for (const t of tpl.replace(/:class="[^"]*"/g, ' ').match(/[A-Za-z_$][\w$-]*/g) ?? []) plainAll.add(t);
}

/** 解析一个文件的 style 段规则 */
function rules(src, file) {
  const styStart = src.indexOf('<style');
  const sty = src.slice(styStart, src.lastIndexOf('</style>'));
  const off = src.slice(0, styStart).split('\n').length;
  const lines = sty.split('\n');
  const out = [];
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!line) continue;
    if (line.startsWith('@media') || line.startsWith('@supports')) {
      stack.push(line.replace(/\s*\{$/, ''));
      continue;
    }
    if (line === '}') {
      if (stack.length && !(lines[i - 1] ?? '').includes('{')) stack.pop();
      continue;
    }
    const oi = line.indexOf('{');
    if (oi === -1) continue;
    const sel = line.slice(0, oi).trim();
    if (!sel) continue;
    let depth = 1;
    let j = i + 1;
    for (; j < lines.length; j++) {
      for (const ch of lines[j].replace(/\/\*[\s\S]*?\*\//g, '')) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0) break;
    }
    out.push({ file, media: [...stack].join(' && '), sel, line: off + i, end: off + j });
    i = j;
  }
  return out;
}

function classesOf(sel) {
  const s = sel.replace(/:deep\(/g, '(').replace(/:global\(/g, '(');
  return [...s.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}

let total = 0;
let dead = 0;
for (const { f, src } of texts) {
  const rs = rules(src, f);
  total += rs.length;
  for (const r of rs) {
    const cls = classesOf(r.sel);
    if (cls.length === 0) continue;
    const missing = cls.filter((c) => !tplAll.has(c) && !plainAll.has(c));
    if (missing.length) {
      dead += 1;
      console.log(`✗ ${f}:${r.line}-${r.end}  [${r.media || '-'}] ${r.sel}`);
      console.log(`   缺失类: ${missing.join(', ')}`);
    }
  }
}
console.log(`\n扫描 ${FILES.length} 个文件 / ${total} 条规则；死规则 ${dead} 条`);
process.exit(dead === 0 ? 0 : 1);
