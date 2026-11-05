/**
 * 前端入口的服务端隔离守卫（后端优化计划 B2 的配套判据）
 *
 * 拆 barrel 之前，`src/runtime/index.ts` 把 postgres-*、server-runtime 和浏览器要用的
 * chat-bridge、runtime-id 混在同一个入口里，"前端不会被打进去"这件事全靠 tree-shaking 兜底
 * （2A-P3-01 就是这么记的）。tree-shaking 是构建器的善意，不是契约：谁在某个 .vue 里
 * 顺手 `import { createServerRuntime } from '@/runtime'`，pg 就进了浏览器包，
 * 而且没有任何一道门会红。
 *
 * 这里把契约变成判据：从 `src/main.ts` 出发，只沿**静态** import/export-from 边走，
 * 可达集合里不许出现服务端专用模块，也不许出现 `pg`。动态 import 不算边（那是运行期决定）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src');

/** 只给服务端宿主用的模块：出现在前端可达集合里就是回归 */
const SERVER_ONLY_FILES = [
  'src/runtime/postgres-store.ts',
  'src/runtime/postgres-executor.ts',
  'src/runtime/postgres-group-runtime.ts',
  'src/runtime/server-runtime.ts',
  // 这两个只被上面那几个引用，但既然它们也是服务端专用，直接进名单更稳：
  // 少一个"靠上游文件挡住"的间接前提
  'src/runtime/runtime-http-handler.ts',
  'src/runtime/runtime-group-http-handler.ts',
  'src/runtime/postgres-sql-port.ts',
  'src/runtime/postgres-store-writer.ts',
];

const ALIASES: Array<[string, string]> = [
  ['@core/', 'src/core/'],
  ['@storage/', 'src/storage/'],
  ['@api/', 'src/api/'],
  ['@services/', 'src/services/'],
  ['@/', 'src/'],
];

/** 抓静态边：`import x from '...'`、`import '...'`、`export * from '...'`；动态 import 不算 */
export function parseStaticImports(source: string): string[] {
  const specs: string[] = [];
  const fromRe = /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(fromRe)) specs.push(m[1]!);
  for (const m of source.matchAll(bareRe)) specs.push(m[1]!);
  return specs;
}

/** 解析到 src 内的真实文件；解析不到（第三方、样式、资源）返回 null */
export function resolveImportPath(fromFile: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith('./') || spec.startsWith('../')) {
    base = path.normalize(path.dirname(fromFile) + '/' + spec);
  } else {
    for (const [find, to] of ALIASES) {
      if (spec.startsWith(find)) {
        base = path.join(ROOT, to + spec.slice(find.length));
        break;
      }
    }
  }
  if (!base) return null;
  const candidates = [
    base + '.ts',
    base + '.vue',
    path.join(base, 'index.ts'),
    base,
  ];
  for (const c of candidates) {
    const rel = path.relative(ROOT, c).replace(/\\/g, '/');
    if (!rel.startsWith('src/')) continue;
    if (existsSync(c) && !c.endsWith('.d.ts')) return rel;
  }
  return null;
}

/** 从入口出发沿静态边 BFS；readImports 注入，便于用合成图复验判据有没有牙 */
export function collectReachable(
  entry: string,
  readImports: (relFile: string) => string[]
): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of readImports(current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

const fsReadImports = (rel: string): string[] => {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const source = readFileSync(abs, 'utf8');
  const specs = parseStaticImports(source);
  // .vue 的依赖写在 <script> 里，模板/样式里的 @import 不参与模块图
  const out: string[] = [];
  for (const spec of specs) {
    const resolved = resolveImportPath(rel, spec);
    if (resolved) out.push(resolved);
  }
  return out;
};

describe('前端入口的服务端隔离', () => {
  const reachable = collectReachable('src/main.ts', fsReadImports);

  it('判据不是空跑：从 main.ts 真的走得到一批 src 文件，且含已知的运行时客户端', () => {
    // 下限取保守值：这张图塌了（比如解析器不认新别名）会立刻低于它
    expect(reachable.size, `静态可达集合只有 ${reachable.size} 个文件`).toBeGreaterThan(150);
    expect(reachable.has('src/runtime/index.ts'), 'barrel 本身都走不到，说明解析器坏了').toBe(true);
  });

  for (const file of SERVER_ONLY_FILES) {
    it(`静态可达集合里没有 ${file}`, () => {
      expect(
        reachable.has(file),
        `${file} 被前端静态引到了：${[...reachable].filter((f) => f.includes('postgres') || f.includes('server-runtime')).join(', ') || '（可达集合里没有同类文件）'}`
      ).toBe(false);
    });
  }

  it('前端可达集合里没有任何一处静态 import pg', () => {
    const importers: string[] = [];
    for (const file of reachable) {
      const specs = parseStaticImports(readFileSync(path.join(ROOT, file), 'utf8'));
      if (specs.some((s) => s === 'pg' || s.startsWith('pg/'))) importers.push(file);
    }
    expect(importers, `这些前端文件静态依赖 pg：${importers.join(', ')}`).toEqual([]);
  });

  it('barrel 只导出前端安全模块，服务端专用模块集中在 runtime/server.ts', () => {
    const barrel = readFileSync(path.join(SRC, 'runtime/index.ts'), 'utf8');
    const serverEntry = readFileSync(path.join(SRC, 'runtime/server.ts'), 'utf8');
    for (const mod of ['postgres-store', 'postgres-executor', 'postgres-group-runtime', 'server-runtime']) {
      expect(barrel.includes(`./${mod}`), `index.ts 仍在导出 ./${mod}`).toBe(false);
      expect(serverEntry.includes(`./${mod}`), `server.ts 没有导出 ./${mod}`).toBe(true);
    }
  });

  it('负向对照：把服务端模块接回前端图，判据必须红', () => {
    const graph = new Map<string, string[]>([
      ['src/main.ts', ['src/app.ts']],
      ['src/app.ts', ['src/runtime/server.ts']],
      ['src/runtime/server.ts', ['src/runtime/server-runtime.ts']],
      ['src/runtime/server-runtime.ts', []],
    ]);
    const fake = (f: string) => graph.get(f) ?? [];
    const set = collectReachable('src/main.ts', fake);
    expect(set.has('src/runtime/server-runtime.ts'), '合成图里接上了却没被走到 ⇒ BFS 本身坏了').toBe(true);
    // 同一条判据在这张图上应当判负
    expect(SERVER_ONLY_FILES.some((f) => set.has(f))).toBe(true);
  });
});
