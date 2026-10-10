/**
 * 静态守卫：按 URL 里的记录 id 找数据的视图，必须先过对应 store 的加载闸门（M13-a）
 *
 * 起因是 M12-a：版本页在角色库从 IndexedDB 读完之前就解析 `?char=`，匹配不到就退到
 * "选中第一条"，于是整条版本历史悄悄写在 mock 种子角色身上（Safari 稳定复现，
 * Chromium 只是快到来得及）。同类的 `?story=` 也是同一时刻下判断，后果是静默不选中。
 *
 * 一次性修两个视图不够——下一个加 `?group=` 的人是同样地写，没人会想起这条约束。
 * 所以把约束变成扫描：视图里出现"URL 键长得像记录 id"却没有 `ensureLoaded(` ⇒ 红。
 *
 * 两条反证保证这条守卫不是空转：
 * - 现场喂一段没有闸门的源码，扫描器必须报出来；补上闸门后必须不报；
 * - 扫描器必须在真实源码里真的看到那三个已接闸门的视图（看不到就是正则失配）。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** 这些 URL 键指向 store 里的某条记录，读库没完成时内存里根本没有它 */
const RECORD_ID_KEYS = new Set([
  'char',
  'story',
  'id',
  'group',
  'book',
  'lorebook',
  'doc',
  'document',
  'event',
  'scene',
]);

/** 这些键不是记录 id（`cat` 是静态分类、`from` 是回程路径），不该被误伤 */
const NON_RECORD_KEYS = new Set(['cat', 'from', 'q', 'lang']);

/**
 * @param sources 文件名 → 源码
 * @returns 违规清单：`文件 → 用到的 URL 键`
 */
export function findUngatedIdLookups(sources: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    const keys = new Set<string>();
    for (const m of text.matchAll(/route\.(?:query|params)\.([A-Za-z_]\w*)/g)) keys.add(m[1] ?? '');
    for (const m of text.matchAll(/route\.(?:query|params)\[\s*['"](\w+)['"]\s*\]/g)) keys.add(m[1] ?? '');
    const recordKeys = [...keys].filter((k) => RECORD_ID_KEYS.has(k) && !NON_RECORD_KEYS.has(k));
    if (recordKeys.length > 0 && !/ensureLoaded\s*\(/.test(text)) {
      hits.push(`${file} → ${recordKeys.sort().join(', ')}`);
    }
  }
  return hits.sort();
}

/** 已经接了闸门的视图（正则失配时这条会先红） */
export const GATED_VIEWS = ['CharacterEditorView.vue', 'CharacterVersionView.vue', 'StoryEngineView.vue'];

// jsdom 环境里 import.meta.url 不是 file: URL，用 cwd 解析（vitest 固定在仓库根运行，
// 下面 files.length 的守卫兜住跑错目录的情况）
function readViews(): Record<string, string> {
  const out: Record<string, string> = {};
  // 视图与组件都扫：今天只有视图按 URL 取 id（已核实组件里零处），
  // 但"下一个把 ?group= 写在组件里"正是这条守卫要挡的情况。
  const walk = (rel: string) => {
    const abs = path.resolve(process.cwd(), rel);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(path.join(rel, entry.name));
      else if (entry.name.endsWith('.vue')) {
        const rel2 = path.relative(path.resolve(process.cwd(), 'src'), full).split(path.sep).join('/');
        out[rel2] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk('src/views');
  walk('src/components');
  expect(Object.keys(out).length, `只读到 ${Object.keys(out).length} 个组件，八成不是仓库根`).toBeGreaterThan(50);
  return out;
}

describe('深链必须等 store 读完', () => {
  it('真实源码里没有"按 URL 记录 id 找数据却没等闸门"的视图', () => {
    const sources = readViews();
    const gated = Object.keys(sources).filter((f) => /ensureLoaded\s*\(/.test(sources[f] ?? '')).sort();
    expect(gated, '扫描器没在源码里看到已接闸门的视图，说明正则失配了').toEqual(GATED_VIEWS.map((v) => `views/${v}`));

    expect(findUngatedIdLookups(sources), '这些视图会在读库完成前解析 URL 里的记录 id').toEqual([]);
  });

  it('负向对照：漏闸门要报、接上闸门不报、非记录 id 的键不误伤', () => {
    const offender = `
      const id = route.query.group as string;
      store.groups.find((g) => g.id === id);
    `;
    expect(findUngatedIdLookups({ 'FakeView.vue': offender })).toEqual(['FakeView.vue → group']);

    // 同一份代码，只要真的等了闸门就不再报（本守卫查的是"有没有等"这件事）
    expect(findUngatedIdLookups({ 'FakeView.vue': `${offender}
void store.ensureLoaded();` })).toEqual([]);

    const settingsLike = `
      const cat = route.query.cat;
      const back = route.query.from;
      if (typeof cat === 'string') activeCategory.value = cat;
      void back;
    `;
    expect(findUngatedIdLookups({ 'SettingsView.vue': settingsLike }), '分类与回程键不该被当成记录 id').toEqual([]);
  });
});
