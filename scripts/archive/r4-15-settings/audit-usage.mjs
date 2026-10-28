// R4-15 使用面核对：为「上下文长度配置」抽组件做边界证据
import fs from 'node:fs';

const target = 'src/views/SettingsView.vue';
const raw = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');
const tStart = lines.findIndex((l) => l.trim() === '<template>');
const tEnd = lines.findIndex((l) => l.trim() === '</template>');
const sStart = lines.findIndex((l) => l.trim() === '<style scoped>');
const sEnd = lines.findIndex((l) => l.trim() === '</style>');

// 上下文段边界（1 基行号）：section 从注释到 </section>
const SEC_START = 278;
const SEC_END = 337;

// 段落内出现过的 class
const secTpl = lines.slice(SEC_START - 1, SEC_END).join('\n');
const secClasses = new Set();
for (const m of secTpl.matchAll(/class="([^"]*)"/g))
  for (const c of m[1].split(/\s+/)) if (c && !c.includes('{')) secClasses.add(c);
for (const m of secTpl.matchAll(/:class="\{([^}]*)\}"/g))
  for (const k of m[1].matchAll(/([a-zA-Z][a-zA-Z0-9_-]*)\s*:/g)) secClasses.add(k[1]);

// 段落外（父模板其余部分）出现的 class
const outsideTpl = [...lines.slice(tStart, SEC_START - 1), ...lines.slice(SEC_END, tEnd + 1)].join('\n');
const outClasses = new Set();
for (const m of outsideTpl.matchAll(/class="([^"]*)"/g))
  for (const c of m[1].split(/\s+/)) if (c && !c.includes('{')) outClasses.add(c);
for (const m of outsideTpl.matchAll(/:class="\{([^}]*)\}"/g))
  for (const k of m[1].matchAll(/([a-zA-Z][a-zA-Z0-9_-]*)\s*:/g)) outClasses.add(k[1]);

// 子组件根元素类（scoped 可命中，属"段落外仍需要"）
const rootOwner = new Map();
for (const f of fs.readdirSync('src/components/settings')) {
  if (!f.endsWith('.vue')) continue;
  const src = fs.readFileSync('src/components/settings/' + f, 'utf8').replace(/\r\n/g, '\n');
  const t0 = src.indexOf('<template>');
  const t1 = src.indexOf('</template>');
  const body = src.slice(t0 + 10, t1);
  const tag = body.match(/<([a-z][a-z0-9-]*)([^>]*)>/i);
  if (!tag) continue;
  const cm = tag[2].match(/class="([^"]*)"/);
  if (!cm) continue;
  for (const c of cm[1].split(/\s+/)) {
    if (!c || c.includes('{')) continue;
    if (!rootOwner.has(c)) rootOwner.set(c, []);
    rootOwner.get(c).push(f);
  }
}

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
    const start = i + sStart + 2;
    const sel = trimmed.replace(/\{.*/, '').trim();
    let depth = 1;
    let j = i + 1;
    while (j < cssLines.length && depth > 0) {
      depth += (cssLines[j].match(/\{/g) || []).length;
      depth -= (cssLines[j].match(/\}/g) || []).length;
      j++;
    }
    rules.push({ sel, start, end: j + sStart + 1, at: atCtx });
    i = j;
    continue;
  }
  i++;
}

console.log('上下文段 class:', [...secClasses].join(' '));
console.log('\n=== 每个规则归属判定 ===');
const move = [], keep = [], dead = [];
for (const r of rules) {
  const cls = [...new Set([...r.sel.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]))];
  if (!cls.length) continue;
  const inSec = cls.filter((c) => secClasses.has(c));
  const inOut = cls.filter((c) => outClasses.has(c));
  const inRoot = cls.filter((c) => rootOwner.has(c));
  let verdict;
  if (!inSec.length && !inOut.length && !inRoot.length) verdict = 'DEAD';
  else if (inSec.length && !inOut.length && !inRoot.length) verdict = 'MOVE';
  else verdict = 'KEEP';
  const rec = { ...r, cls, inSec, inOut, inRoot, verdict };
  if (verdict === 'MOVE') move.push(rec);
  else if (verdict === 'DEAD') dead.push(rec);
  else keep.push(rec);
  console.log(`${verdict.padEnd(5)} ${String(r.start).padStart(4)}-${String(r.end).padStart(4)} ${(r.at ? '[' + r.at + '] ' : '').padEnd(0)}${r.sel}${inRoot.length ? '  ←根:' + inRoot.join(',') : ''}${inOut.length ? '  ←段外:' + inOut.join(',') : ''}`);
}
console.log('\nMOVE', move.length, '| KEEP', keep.length, '| DEAD', dead.length);
console.log('MOVE 行数:', move.reduce((a, b) => a + (b.end - b.start + 1), 0));
console.log('DEAD 行数:', dead.reduce((a, b) => a + (b.end - b.start + 1), 0));
