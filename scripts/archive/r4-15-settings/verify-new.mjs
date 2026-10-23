// R4-15 产物闭环核验：新组件里每个样式选择器的类都必须在它自己的模板里出现
import fs from 'node:fs';

const p = 'src/components/settings/SettingsContextLengthSection.vue';
const raw = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');
const t0 = lines.findIndex((l) => l.trim() === '<template>');
const t1 = lines.findIndex((l) => l.trim() === '</template>');
const s0 = lines.findIndex((l) => l.trim() === '<style scoped>');
const s1 = lines.findIndex((l) => l.trim() === '</style>');
const tpl = lines.slice(t0, t1 + 1).join('\n');

const live = new Set();
for (const m of tpl.matchAll(/class="([^"]*)"/g))
  for (const c of m[1].split(/\s+/)) if (c && !c.includes('{')) live.add(c);
for (const m of tpl.matchAll(/:class="\{([^}]*)\}"/g))
  for (const k of m[1].matchAll(/([a-zA-Z][a-zA-Z0-9_-]*)\s*:/g)) live.add(k[1]);

const cssLines = lines.slice(s0 + 1, s1);
let i = 0;
const problems = [];
while (i < cssLines.length) {
  const trimmed = cssLines[i].trim();
  if (!trimmed) { i++; continue; }
  if (trimmed.startsWith('/*')) { while (i < cssLines.length && !cssLines[i].includes('*/')) i++; i++; continue; }
  if (trimmed.startsWith('@media') || trimmed === '}') { i++; continue; }
  if (trimmed.includes('{')) {
    const sel = trimmed.replace(/\{.*/, '').trim();
    const cls = [...new Set([...sel.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]))];
    const miss = cls.filter((c) => !live.has(c));
    if (miss.length) problems.push({ line: i + s0 + 2, sel, miss });
    let depth = 1;
    let j = i + 1;
    while (j < cssLines.length && depth > 0) {
      depth += (cssLines[j].match(/\{/g) || []).length;
      depth -= (cssLines[j].match(/\}/g) || []).length;
      j++;
    }
    i = j;
    continue;
  }
  i++;
}
console.log('模板类:', [...live].sort().join(' '));
if (!problems.length) console.log('✓ 新组件内全部样式选择器均在本模板有命中');
else for (const p2 of problems) console.log(`✗ L${p2.line} ${p2.sel} 未命中: ${p2.miss.join(', ')}`);
