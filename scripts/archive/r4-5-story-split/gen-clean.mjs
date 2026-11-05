// R4-5 宿主收尾：剔除下放后失效的 import 说明符
// 判据机械：import 说明符的本地名在「import 块之外」的代码（剥注释后）再无出现即删
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const HOST = join(ROOT, 'src', 'stores', 'story.ts');

const CRLF = '\r\n';
const writeCRLF = (p, s) => writeFileSync(p, s.replace(/\r?\n/g, CRLF));

const lines = readFileSync(HOST, 'utf8').replace(/\r\n/g, '\n').split('\n');

const start = lines.findIndex((l) => l.startsWith('import '));
if (start < 0) throw new Error('未找到 import 块');
let end = start;
while (end < lines.length && lines[end] !== '') end++;
if (end === lines.length) throw new Error('import 块未找到结束空行');
const importBlock = lines.slice(start, end).join('\n');
const tail = lines.slice(end).join('\n');

// 使用面判定须剔除注释，否则注释里提到的名字会把 import 钉住
const tailCode = tail
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/(?<![:\w])\/\/.*$/gm, '');

const stmtRe = /^import (type )?\{([\s\S]*?)\} from '([^']+)';$/gm;
const stmts = [];
let m;
while ((m = stmtRe.exec(importBlock)) !== null) {
  const specs = m[2].split(',').map((x) => x.trim()).filter(Boolean);
  stmts.push({ isType: Boolean(m[1]), specs, from: m[3] });
}
if (stmts.length < 10) throw new Error(`import 语句只解析到 ${stmts.length} 条，明显偏少`);

const localName = (spec) => spec.replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim();

const kept = [];
const dropped = [];
for (const s of stmts) {
  const keepSpecs = s.specs.filter((spec) => {
    const name = localName(spec);
    const used = new RegExp(`\\b${name}\\b`).test(tailCode);
    if (!used) dropped.push(`${s.from} :: ${name}`);
    return used;
  });
  if (keepSpecs.length > 0) kept.push({ ...s, specs: keepSpecs });
}
if (dropped.length === 0) throw new Error('没有剔除任何 import —— 生成器未生效');
// 五个工厂导入必须全留
for (const f of ['createStoryPersistenceOps', 'createStoryAnalysisOps', 'createStoryImportOps', 'createStoryProtagonistOps', 'createStoryTimeOps']) {
  if (!kept.some((s) => s.specs.some((x) => x.includes(f)))) throw new Error(`工厂导入被误删：${f}`);
}

const format = (s) => {
  const oneLine = `import ${s.isType ? 'type ' : ''}{ ${s.specs.join(', ')} } from '${s.from}';`;
  if (oneLine.length <= 100) return oneLine;
  return `import ${s.isType ? 'type ' : ''}{\n${s.specs.map((x) => `  ${x},`).join('\n')}\n} from '${s.from}';`;
};

let out = lines.slice(0, start).join('\n') + '\n' + kept.map(format).join('\n') + '\n' + tail;
out = out.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n');
writeCRLF(HOST, out);
console.log(`[clean] 剔除 import 说明符 ${dropped.length} 个，宿主 ${out.split('\n').length - 1} 行`);
for (const d of dropped) console.log('  - ' + d);
