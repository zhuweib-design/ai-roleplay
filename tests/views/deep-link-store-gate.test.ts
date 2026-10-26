/**
 * 静态守卫：按 URL 里的记录 id 找数据的视图，必须走共享 composable `useDeepLinkId`，
 * 而且**它接的键要和被直读的键是同一个**（M13-a 立，M14-a 收拢，M15-a 按键核对）
 *
 * 起因是 M12-a：版本页在角色库从 IndexedDB 读完之前就解析 `?char=`，匹配不到就退到
 * "选中第一条"，于是整条版本历史悄悄写在 mock 种子角色身上（Safari 稳定复现，
 * Chromium 只是快到来得及）。同类的 `?story=` 也是同一时刻下判断，后果是静默不选中。
 *
 * 守卫跟着事实走了三层：
 * - M13-a：文件里要有 `ensureLoaded(`。被 M14-a 否掉——自己 await 也算绕开闸门时序。
 * - M14-a：文件里要有 `useDeepLinkId(`。这层仍然有个洞：**它只看"出现过"**，于是
 *   "读了 `?book=`，却用 `useDeepLinkId({ key: 'char' })` 接另一个键"照样放行，
 *   而 `?group=` `?doc=` 这些还没人用的键，一旦用错就完全没人管。
 * - M15-a：按键核对。直读的记录 id 键必须出现在某个 `useDeepLinkId(` 调用的 `key:`
 *   字面量里；`key` 写成变量（守卫看不见键名）也算违规。
 *
 * 一个必须处理的干扰：视图里满地是 `{ key: 'history', label: … }` 这种 Tab 定义，
 * 全文抓 `key:` 会把它们当成 composable 的键而误放行，所以 `key` 只在**括号配对出来的
 * 那次调用实参范围内**取。
 *
 * 反证（都实测过会红）：绕开 composable、自己 await、键名错配、解构写法、key 非字面量、
 * Tab 键干扰；另外对 `RECORD_ID_KEYS` 里全部十个键逐个跑一遍"接对不报 / 接错必报"，
 * 免得清单写了 `book` 却只有 `char` 真的被测过。
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

/** 源码里"直接从 URL 取来的键名"：点号、方括号字符串、解构三种写法 */
function directUrlKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const m of text.matchAll(/route\.(?:query|params)\.([A-Za-z_]\w*)/g)) keys.add(m[1] ?? '');
  for (const m of text.matchAll(/route\.(?:query|params)\[\s*['"](\w+)['"]\s*\]/g)) keys.add(m[1] ?? '');
  // const { char, group } = route.query —— 键名在花括号里，不在 route.query.X 形状里
  for (const m of text.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*route\.(?:query|params)/g)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const name = raw.trim().split(/[:\s]/)[0];
      if (name) keys.add(name);
    }
  }
  return keys;
}

/**
 * 每次 `useDeepLinkId(` 调用声明的键。
 *
 * 只看括号配对出来的那段实参：全文抓 `key:` 会把 `{ key: 'history', label: … }`
 * 这类 Tab 定义也算进来，于是"根本没接这个键"能被一行无关的 Tab 骗成"接了"。
 */
function composableKeys(text: string): { literals: string[]; nonLiteral: number } {
  const literals: string[] = [];
  let nonLiteral = 0;
  for (const m of text.matchAll(/useDeepLinkId\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const callText = text.slice(open, end + 1);
    const km = /(?:^|[\s,(])key\s*:\s*['"]([^'"]+)['"]/.exec(callText);
    if (km) literals.push(km[1] ?? '');
    else nonLiteral++; // 没有字面量 key：要么写成变量（看不见键名），要么根本没写
  }
  return { literals, nonLiteral };
}

/**
 * 登记表里真实存在的键（`src/stores/deep-link-gate.ts` 的 DEEP_LINK_GATES 成员）。
 *
 * M16-b 起，"这个键该等哪个库"由那张表决定；视图用了没登记的键，运行时拿不到闸门。
 * 守卫这里从源码读键名，避免测试与实现各写一份清单而悄悄漂移。
 */
function registeredKeys(): string[] {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/stores/deep-link-gate.ts'), 'utf8');
  const body = /DEEP_LINK_GATES\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(src)?.[1] ?? '';
  const keys = [...body.matchAll(/(?:^|[\s,{])(\w+)\s*:\s*\(\)/g)].map((m) => m[1] ?? '');
  expect(keys.length, `从 DEEP_LINK_GATES 读到 0 个键，八成是正则失配`).toBeGreaterThan(0);
  return keys;
}

/**
 * @param sources 文件名 → 源码
 * @param registered 已登记的深链键（默认读真实登记表；逐键覆盖那条用例传的是"假装全都登记了"）
 * @returns 违规清单：`文件 → 直读但没被同键接住的记录 id 键`／`文件 → 用了没登记的键`
 */
export function findUngatedIdLookups(
  sources: Record<string, string>,
  registered: string[] = registeredKeys()
): string[] {
  const hits: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    const recordKeys = [...directUrlKeys(text)].filter(
      (k) => RECORD_ID_KEYS.has(k) && !NON_RECORD_KEYS.has(k)
    );
    const { literals, nonLiteral } = composableKeys(text);
    // M16-b：用了没登记的键 ⇒ 运行时拿不到闸门（composable 的 load 缺省要靠这张表）
    for (const k of literals.filter((x) => !registered.includes(x))) {
      hits.push(`${file} → 深链键 '${k}' 没登记在 DEEP_LINK_GATES`);
    }
    if (recordKeys.length === 0) continue;
    const ungated = recordKeys.filter((k) => !literals.includes(k));
    if (ungated.length > 0) hits.push(`${file} → ${ungated.sort().join(', ')}`);
    if (nonLiteral > 0 && ungated.length > 0) {
      hits.push(`${file} → useDeepLinkId 的 key 不是字面量，守卫无法核对键名`);
    }
  }
  return hits.sort();
}

/**
 * 已经接入了 composable 的视图（正则失配时这条会先红）。
 * GroupChatView 是 M15-d 新接的 `?group=`，也是守卫升级成"按键核对"后第一条真接线的深链。
 */
export const GATED_VIEWS = [
  'CharacterEditorView.vue',
  'CharacterVersionView.vue',
  'GroupChatView.vue',
  'StoryEngineView.vue',
  // M17-b 接的第二条新深链：?book=
  'WorldBookView.vue',
];

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

describe('深链必须按同一个键走 useDeepLinkId', () => {
  it('真实源码里没有"按 URL 记录 id 找数据却没走 composable"的视图', () => {
    const sources = readViews();
    const gated = Object.keys(sources).filter((f) => /useDeepLinkId\s*\(/.test(sources[f] ?? '')).sort();
    expect(gated, '扫描器没在源码里看到已接入 composable 的视图，说明正则失配了').toEqual(GATED_VIEWS.map((v) => `views/${v}`));

    expect(findUngatedIdLookups(sources), '这些视图会在读库完成前解析 URL 里的记录 id').toEqual([]);
  });

  /**
   * 守卫自己也得接住每一个声明过的键：清单里写了 `book`，但真实源码只有 char/story/id
   * 用过，于是 `?book=` 的接线从来没被这条守卫验过。这里对十个键逐个跑一遍
   * "接对 ⇒ 不报""没接 ⇒ 必报"，把清单变成断言。
   */
  it('RECORD_ID_KEYS 里每个键都真的被这套判定覆盖', () => {
    // 这一条只问"同键核对"管不管得住每个声明过的键，所以给一张"全都登记了"的假登记表；
    // 真登记表面（M16-b）由下面那条单独的用例核对。
    const allRegistered = [...RECORD_ID_KEYS];
    for (const key of RECORD_ID_KEYS) {
      const ungated = `const v = route.query.${key} as string; void v;`;
      expect(findUngatedIdLookups({ 'K.vue': ungated }, allRegistered), `键 ${key} 没走 composable 却没被报出来`).toEqual([
        `K.vue → ${key}`,
      ]);
      const gated = `${ungated}
useDeepLinkId({ key: '${key}', load: () => Promise.resolve(), onResolved: (id) => void id });`;
      expect(findUngatedIdLookups({ 'K.vue': gated }, allRegistered), `键 ${key} 已经用同键接住，不该误报`).toEqual([]);
    }
  });

  /**
   * M16-b 新加的第二层：composable 用的键必须在登记表 `DEEP_LINK_GATES` 里。
   *
   * 缺省闸门现在来自那张表（视图不传 `load` 时），用了没登记的键 ⇒ 运行时拿不到闸门。
   * 光靠类型拦不住"键名来自动态拼接"这类写法，所以这里再钉一层静态的。
   */
  it('composable 用的键必须登记在 DEEP_LINK_GATES 里', () => {
    const registered = registeredKeys();
    // 登记表自己是清单的子集：登记了清单外的键说明两边漂移了
    for (const k of registered) {
      expect(RECORD_ID_KEYS.has(k), `登记表里的键 ${k} 不在 RECORD_ID_KEYS 清单里`).toBe(true);
    }
    // 真实四个视图用的键都必须已在表上
    expect(registered, '真实源码里用到的键没都登记').toEqual(
      expect.arrayContaining(['char', 'id', 'group', 'story', 'book'])
    );

    // 反证：接了同键但那个键没登记 ⇒ 报
    expect(
      findUngatedIdLookups({
        'FakeView.vue': `
        const v = route.query.lorebook as string; void v;
        useDeepLinkId({ key: 'lorebook', load: () => store.ensureLoaded(), onResolved: (id) => void id });
      `,
      }, ['char', 'group'])
    ).toEqual(["FakeView.vue → 深链键 'lorebook' 没登记在 DEEP_LINK_GATES"]);

    // 默认用真实登记表：`lorebook` 这个别名仍未登记，同键接住也照样报（这一层是 M16-b 加的）。
    // 反过来说，`book` 从 M17-b 起已是真实接线的键，不能再当"未登记"的例子用。
    expect(
      findUngatedIdLookups({
        'FakeView.vue': `
        const v = route.query.lorebook as string; void v;
        useDeepLinkId({ key: 'lorebook', onResolved: (id) => void id });
      `,
      })
    ).toEqual(["FakeView.vue → 深链键 'lorebook' 没登记在 DEEP_LINK_GATES"]);
    // 已登记的 book 用同键接住 ⇒ 不报
    expect(
      findUngatedIdLookups({
        'FakeView.vue': `
        const v = route.query.book as string; void v;
        useDeepLinkId({ key: 'book', onResolved: (id) => void id });
      `,
      })
    ).toEqual([]);
  });

  it('负向对照：绕开、自 await、键错配、解构、非字面量、Tab 键干扰都要报', () => {
    const allRegistered = [...RECORD_ID_KEYS];
    const offender = `
      const id = route.query.group as string;
      store.groups.find((g) => g.id === id);
    `;
    expect(findUngatedIdLookups({ 'FakeView.vue': offender }, allRegistered)).toEqual(['FakeView.vue → group']);

    // 自己 await 闸门也算绕开——M13-a 那版会放过这种写法，M14-a 起必须走 composable
    expect(findUngatedIdLookups({ 'FakeView.vue': `${offender}
void store.ensureLoaded();` }, allRegistered)).toEqual(['FakeView.vue → group']);

    // 同一份代码，真的用同一个键接住了就不再报
    expect(findUngatedIdLookups({ 'FakeView.vue': `${offender}
useDeepLinkId({ key: 'group', load: () => store.ensureLoaded(), onResolved: (id) => void id });` }, allRegistered)).toEqual([]);

    /**
     * M14-a 那版的洞：文件里出现过 `useDeepLinkId(` 就放行，接的是哪个键不管。
     * 这里读 `?book=` 却用 key:'char' 接另一个角色——必须报。
     */
    const mismatched = `
      const bookId = route.query.book as string;
      store.lorebooks.find((b) => b.id === bookId);
      useDeepLinkId({ key: 'char', load: () => characterStore.ensureLoaded(), onResolved: (id) => void id });
    `;
    expect(findUngatedIdLookups({ 'FakeView.vue': mismatched }, allRegistered), '接错键也算没接住，M14-a 那版会放过').toEqual([
      'FakeView.vue → book',
    ]);

    // 解构写法同样要抓
    expect(
      findUngatedIdLookups({ 'FakeView.vue': 'const { scene } = route.query; void scene;' }, allRegistered),
      '解构取键的写法没被抓'
    ).toEqual(['FakeView.vue → scene']);

    // key 写成变量：守卫看不见键名，不能当成"接住了"
    expect(findUngatedIdLookups({ 'FakeView.vue': `
      const docId = route.query.doc as string;
      useDeepLinkId({ key: docKey, load: () => store.ensureLoaded(), onResolved: (id) => void id });
    ` }, allRegistered)).toEqual(['FakeView.vue → doc', 'FakeView.vue → useDeepLinkId 的 key 不是字面量，守卫无法核对键名']);

    // Tab 定义里的 `key:` 不能被当成 composable 的键（视图里满地都是这种对象）
    expect(findUngatedIdLookups({ 'FakeView.vue': `
      const tabs = [{ key: 'doc', label: '文档' }, { key: 'history', label: '历史' }];
      void tabs;
      const docId = route.query.doc as string;
    ` }, allRegistered), '无关对象里的 key 误当成闸门').toEqual(['FakeView.vue → doc']);

    /**
     * 括号配对只在**这一次调用的实参范围**内找 key：这里 composable 接的是 'char'，
     * 后面 Tab 数组里恰好有个 `key: 'doc'`，直读 `?doc=` 仍然必须报。
     * 若哪天配对逻辑退化成"全文抓 key:"，这条就会变绿——那正是 M14-a 版的漏法。
     */
    expect(findUngatedIdLookups({ 'FakeView.vue': `
      useDeepLinkId({ key: 'char', load: () => characterStore.ensureLoaded(), onResolved: (id) => void id });
      const tabs = [{ key: 'doc', label: '文档' }];
      void tabs;
      const docId = route.query.doc as string;
    ` }, allRegistered), '别处的 key 字面量被误当成这个键的闸门').toEqual(['FakeView.vue → doc']);

    const settingsLike = `
      const cat = route.query.cat;
      const back = route.query.from;
      if (typeof cat === 'string') activeCategory.value = cat;
      void back;
    `;
    expect(findUngatedIdLookups({ 'SettingsView.vue': settingsLike }, allRegistered), '分类与回程键不该被当成记录 id').toEqual([]);
  });
});
