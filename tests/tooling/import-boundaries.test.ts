/**
 * 分层边界守卫（优化计划 后端 B3 的第一步）
 *
 * 为什么先加守卫再搬文件：`src/core` 反向依赖 `@/stores` 是评审记下的既有债
 * （2A-P2-03）。直接搬文件会牵动调用方，而"搬完又长回来"是这类整理最常见的结局
 * （单文件行数、控件尺寸、!important 都靠同一套"登记 + 只许降"的棘轮守住）。
 * 所以先把跨层引用变成红/绿判据，再逐条搬迁。
 *
 * B3 第二步已把这 4 个读 store 的文件搬出 core（`readiness` / `relations` / `guided-tasks`
 * 进 `src/composables/`，`deep-link-keys` 进 `src/stores/deep-link-gate.ts`），
 * 所以 `core -> stores` 这条从棘轮改成 `zero`：以后任何 core 文件 import store 直接红。
 *
 * 判据用解析后的真实目标层，不是字符串前缀：同一份依赖既可能写 `@/stores/x`，
 * 也可能写 `../stores/x`，只搜别名会漏（快照最初量 "core → api = 0" 就是这么漏的，
 * 实际有 `../api/api-client` 的 type 导入）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src');

/** 每条规则：from 层不得新增对 to 层的引用。mode=zero 表示当前已清零，必须保持 0。 */
const RULES: Array<{
  from: string;
  to: string;
  mode: 'zero' | 'ratchet';
  baseline?: Record<string, number>;
}> = [
  { from: 'core', to: 'stores', mode: 'zero' },
  { from: 'core', to: 'api', mode: 'ratchet', baseline: {
    'src/core/summarizer.ts': 2,
    'src/core/character-card.ts': 1,
    'src/core/tool-registry.ts': 1,
  } },
  { from: 'core', to: 'services', mode: 'zero' },
  { from: 'api', to: 'stores', mode: 'ratchet', baseline: { 'src/api/local-api-client.ts': 2 } },
  { from: 'api', to: 'core', mode: 'zero' },
  { from: 'api', to: 'storage', mode: 'zero' },
  { from: 'services', to: 'stores', mode: 'zero' },
  { from: 'storage', to: 'stores', mode: 'zero' },
  { from: 'runtime', to: 'stores', mode: 'zero' },
];

const ALIAS: Record<string, string> = {
  '@/': 'src/',
  '@core/': 'src/core/',
  '@storage/': 'src/storage/',
  '@api/': 'src/api/',
  '@services/': 'src/services/',
};

/** 把 import 说明符解析成 src 下的一级层名；解析不到（第三方包、样式、资源）返回 null */
export function layerOfSpecifier(fromFile: string, spec: string): string | null {
  let target: string;
  const alias = Object.keys(ALIAS).find((a) => spec.startsWith(a));
  if (alias) {
    target = path.join(ROOT, ALIAS[alias]!, spec.slice(alias.length));
  } else if (spec.startsWith('./') || spec.startsWith('../')) {
    target = path.resolve(path.join(ROOT, fromFile), '..', spec);
  } else {
    return null;
  }
  const rel = path.relative(SRC, target).split(path.sep).join('/');
  if (!rel || rel.startsWith('..')) return null;
  return rel.split('/')[0] ?? null;
}

const IMPORT_RE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

/** 扫描一个文件，返回 `from 层 -> to 层` 的命中次数 */
export function collectLayerEdges(relFile: string, text: string): Map<string, number> {
  const srcLayer = relFile.replace(/^src\//, '').split('/')[0]!;
  const out = new Map<string, number>();
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[1]!;
    const to = layerOfSpecifier(relFile, spec);
    if (!to) continue;
    const key = `${srcLayer} -> ${to}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function sourceFiles(): string[] {
  const out: string[] = [];
  (function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|vue)$/.test(entry.name)) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  })(SRC);
  return out;
}

describe('分层边界（跨层引用只许降不许升）', () => {
  const files = sourceFiles();
  const byRule = new Map<string, Record<string, number>>();
  for (const rel of files) {
    const edges = collectLayerEdges(rel, readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const rule of RULES) {
      const key = `${rule.from} -> ${rule.to}`;
      const count = edges.get(key);
      if (!count) continue;
      const bucket = byRule.get(key) ?? {};
      bucket[rel] = (bucket[rel] ?? 0) + count;
      byRule.set(key, bucket);
    }
  }

  for (const rule of RULES) {
    const key = `${rule.from} -> ${rule.to}`;
    it(`${key} 不新增`, () => {
      const current = byRule.get(key) ?? {};
      const baseline = rule.mode === 'zero' ? {} : (rule.baseline ?? {});
      const grew = Object.keys({ ...baseline, ...current })
        .map((f) => ({ f, base: baseline[f] ?? 0, cur: current[f] ?? 0 }))
        .filter((x) => x.cur > x.base);
      expect(
        grew,
        `${key} 长出新的跨层引用：${grew.map((g) => `${g.f} ${g.base}→${g.cur}`).join('；')}`
      ).toEqual([]);
    });
  }

  it('判据本身看得见新增违规（负向对照）', () => {
    const edges = collectLayerEdges('src/core/brand-new.ts', `import { useChatStore } from '@/stores/chat';\nimport { x } from '../stores/foo';`);
    expect(edges.get('core -> stores')).toBe(2);
    const clean = collectLayerEdges('src/core/clean.ts', `import type { Chat } from '../storage/types';`);
    expect(clean.get('core -> stores')).toBeUndefined();
  });

  it('登记的基线与实测一致（防止名单烂掉）', () => {
    for (const rule of RULES) {
      if (rule.mode === 'zero') continue;
      const key = `${rule.from} -> ${rule.to}`;
      const current = byRule.get(key) ?? {};
      expect(Object.keys(current).sort(), `${key} 的文件清单变了，请同步更新登记`)
        .toEqual(Object.keys(rule.baseline ?? {}).sort());
    }
  });
});
