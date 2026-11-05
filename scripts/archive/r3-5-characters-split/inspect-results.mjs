import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const base = 'test-results';
const dirs = readdirSync(base).filter((d) => {
  try { return readdirSync(join(base, d)).length >= 0; } catch { return false; }
});
const out = [`dirs: ${dirs.length}`];
for (const d of dirs.slice(0, 4)) {
  const files = readdirSync(join(base, d));
  out.push(`${d} => ${files.join(', ')}`);
  const ec = join(base, d, 'error-context.md');
  if (existsSync(ec)) out.push(readFileSync(ec, 'utf8').slice(0, 1200));
}
import { writeFileSync } from 'node:fs';
writeFileSync('scripts/archive/r3-5-characters-split/inspect-out.txt', out.join('\n=====\n'));
