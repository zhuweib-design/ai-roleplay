// R4-15 死样式审计 v3：判据 = 父模板类 ∪ 子组件根元素类
// 依据：Vue scoped CSS 同时作用于「本模板元素」与「子组件根元素」
import fs from 'node:fs';

const target = 'src/views/SettingsView.vue';
const raw = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');
const sStart = lines.findIndex((l) => l.trim() === '<style scoped>');
const sEnd = lines.findIndex((l) => l.trim() === '</style>');
const tStart = lines.findIndex((l) => l.trim() === '<template>');
const tEnd = lines.findIndex((l) => l.trim() === '</template>');
const tpl = lines.slice(tStart, tEnd + 1).join('\n');

// 1) 父模板直接使用的类
const live = new Set();
for (const m of tpl.matchAll(/class="([^"]*)"/g))
  for (const c of m[1].split(/\s+/)) if (c && !c.includes('{') && !c.includes('}')) live.add(c);
for (const m of tpl.matchAll(/:class="\{([^}]*)\}"/g))
  for (const k of m[1].matchAll(/([a-zA-Z][a-zA-Z0-9_-]*)\s*:/g)) live.add(k[1]);

// 2) 父模板里出现的所有子组件，其根元素 class 也可被命中
const imported = [...tpl.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]);
const uniqImported = [...new Set(imported)];
const rootClasses = new Map();
// 从 script 的 import 语句解析组件路径
const scriptBlock = lines.slice(1, lines.findIndex((l) => l.trim() === '</script>')).join('\n');
const importMap = new Map();
for (const m of scriptBlock.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s+'@\/([^']+)'/g)) {
  importMap.set(m[1], 'src/' + m[2]);
}
for (const comp of uniqImported) {
  const rel = importMap.get(comp);
  if (!rel || !fs.existsSync(rel)) {
    rootClasses.set(comp, null);
    continue;
  }
  const src = fs.readFileSync(rel, 'utf8').replace(/\r\n/g, '\n');
  const t0 = src.indexOf('<template>');
  const t1 = src.indexOf('</template>');
  const body = src.slice(t0 + 10, t1);
  // 找第一个开标签（跳过注释与 v-if 前的文本）
  const tag = body.match(/<([a-z][a-z0-9-]*)([^>]*)>/i);
  const cls = [];
  if (tag) {
    const cm = tag[2].match(/class="([^"]*)"/);
    if (cm) {
      // 只取静态类；含 {{ }} 的跳过
      for (const c of cm[1].split(/\s+/)) if (c && !c.includes('{{') && !c.includes('{')) cls.push(c);
    }
  }
  rootClasses.set(comp, cls);
}
console.log('=== 子组件根元素类 ===');
for (const [comp, cls] of rootClasses) console.log(`${comp.padEnd(28)} ${cls === null ? '(未解析到路径)' : cls.join(' ') || '(无 class)'}`);

for (const [, cls] of rootClasses) if (cls) cls.forEach((c) => live.add(c));

// 3) 解析 style 规则
const cssLines = lines.slice(sStart + 1, sEnd);
const rules = [];
let i = 0;
let atCtx = '';
while (i < cssLines.length) {
  const trimmed = cssLines[i].trim();
  if (!trimmed) { i++; continue; }
  if (trimmed.startsWith('/*')) {
    while (i < cssLines.length && !cssLines[i].includes('*/')) i++;
    i++;
    continue;
  }
  if (trimmed.startsWith('@media')) { atCtx = trimmed.replace(/\s*\{$/, ''); i++; continue; }
  if (trimmed === '}') { atCtx = ''; i++; continue; }
  if (trimmed.includes('{')) {
    const start = i + 1;
    const sel = trimmed.replace(/\{.*/, '').trim();
    let depth = 1;
    let j = i + 1;
    while (j < cssLines.length && depth > 0) {
      depth += (cssLines[j].match(/\{/g) || []).length;
      depth -= (cssLines[j].match(/\}/g) || []).length;
      j++;
    }
    rules.push({ sel, start, end: j, at: atCtx });
    i = j;
    continue;
  }
  i++;
}

const dead = [], part = [], ok = [];
for (const r of rules) {
  const cls = [...new Set([...r.sel.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]))];
  if (!cls.length) continue;
  const hit = cls.filter((c) => live.has(c));
  const miss = cls.filter((c) => !live.has(c));
  if (!hit.length) dead.push({ ...r, miss });
  else if (miss.length) part.push({ ...r, miss });
  else ok.push(r);
}
console.log(`\n规则总数 ${rules.length} | 存活 ${ok.length} | 全死 ${dead.length} | 部分 ${part.length}`);
console.log('\n=== DEAD（全部选择器均无命中） ===');
let n = 0;
for (const d of dead) {
  const len = d.end - d.start + 1;
  n += len;
  console.log(`${String(d.start).padStart(4)}-${String(d.end).padStart(4)} (${String(len).padStart(2)}行) ${d.at ? `[${d.at}] ` : ''}${d.sel}`);
}
console.log('DEAD 合计行数:', n);
console.log('\n=== PART（含未命中选择器，需人工判） ===');
for (const d of part) console.log(`${String(d.start).padStart(4)}-${String(d.end).padStart(4)} ${d.at ? `[${d.at}] ` : ''}${d.sel} | 未命中: ${d.miss.join(', ')}`);
