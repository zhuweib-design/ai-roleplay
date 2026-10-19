#!/usr/bin/env node
/**
 * Token 使用体检与死引用棘轮（M18 试点 → M19 入门禁）
 *
 * 判定形状抄 docs/design/ai-chat-ui-redesign/tools/check-tokens.mjs（原型自带工具），
 * 但那个脚本把主题与页面清单硬编码在源码头里（只列 a–d 四套），拿来扫产品会漏，
 * 所以这里重写成"从仓库现状发现文件"。
 *
 * 为什么默认不阻断：新门禁第一次跑必须先量假阳数。实测到的两类假阳就是证据：
 * ① `--range-pct` 由 `el.style.setProperty()` 运行时写入（src/core/range-fill.ts:25），
 *    按"未定义"报是错的；② `src/styles` 里写 hex 是**调色板定义本身**，与"组件层绕过 token"
 *    是两回事，混在一起数会高估一个数量级（组件层 147 处 vs 含 styles 的 354 行）。
 * `--strict` 只把 A 类（组件层裸引用未定义 token，且非运行时注入）变成退出码 1。
 *
 * 三种模式：
 *   node scripts/token-guard.mjs              # 只统计（迁移动员用，看盘子多大）
 *   node scripts/token-guard.mjs --strict     # 棘轮：A 类按文件只许减不许增（CI 用）
 *   node scripts/token-guard.mjs --self-test  # 用合成夹具验门禁自己有力气（CI 用）
 *
 * 为什么要 --self-test：2026-10-07 的对比度门禁就是硬编码色值后与代码脱钩、变成永远绿灯的
 * 死门禁。棘轮的基线是手写的存量数字，一旦扫描逻辑回归（比如把运行时注入重新算成违规、
 * 或把 styles 目录混进来），基线数字会一起失真。self-test 用固定的小夹具跑**同一份扫描代码**，
 * 夹具的期望值是我手工能算对的量，所以它能区分"代码改了"和"门禁坏了"。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const SELF_TEST = argv.includes('--self-test');

/**
 * A 类（组件层裸引用未定义 token）的存量基线：2026-10-11 实测 74 处 / 4 文件。
 *
 * 为什么要基线而不是直接清零：这批是"改名即失效"的历史遗留（StoryEngineView 独占 55 处），
 * 逐条要么映射要么删，属于 M21 的活。迁移途中若把门禁做成"零容忍"，就会逼着顺手乱改；
 * 所以按对比度门禁同一套路：**多一处即红，少一处提示下调基线**。
 *
 * 为什么按文件锁而不是只锁总数（self-test 第 5 条就是钉这件事）：只锁总数时
 * "这里收敛 5 处、别的文件新长 5 处"会互相抵消成平局，实测那种抵消态下总数正好等于基线
 * 而按文件锁照样变红。
 */
const BASELINE_UNDEF_BARE = {
  'src/views/StoryEngineView.vue': 12,
  'src/components/story/StoryDetailCharacters.vue': 12,
  'src/views/CommunityMarketView.vue': 10,
  'src/components/story/StoryUploadModal.vue': 10,
  'src/components/story/StoryDetailWorld.vue': 9,
  'src/components/story/StoryDetailPanel.vue': 6,
  'src/components/worldbook/LorebookBindings.vue': 5,
  'src/components/story/StoryCard.vue': 4,
  'src/components/story/StoryProtagonistModal.vue': 4,
  'src/views/CharacterEditorView.vue': 4,
  'src/components/story/StoryQuickSetupPanel.vue': 1,
};

const SKIP_RE = /(node_modules|dist|public[\\/]vendor|src[\\/]runtime)/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_RE.test(full)) walk(full, out);
    } else if (/\.(vue|css|ts)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const relOf = (f) => path.relative(ROOT, f).split(path.sep).join('/');

/** .vue 取 <style> 块（带行号）；.css 取全文 */
function styleLines(f, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  if (f.endsWith('.css')) {
    lines.forEach((l, i) => out.push({ line: i + 1, text: l }));
    return out;
  }
  let inStyle = false;
  lines.forEach((l, i) => {
    if (/^\s*<style\b/.test(l)) inStyle = true;
    else if (/^\s*<\/style>/.test(l)) inStyle = false;
    else if (inStyle) out.push({ line: i + 1, text: l });
  });
  return out;
}

/**
 * 纯函数：文件名 → 源码文本 的集合，产出四类统计。
 * self-test 用合成夹具调它，CI 用真实 src 调它，走的是同一份判定。
 */
function scanContents(contents) {
  const defined = new Set();
  const runtimeSet = new Set();
  for (const [f, text] of contents) {
    if (f.endsWith('.ts')) {
      for (const m of text.matchAll(/setProperty\(\s*['"](--[A-Za-z0-9-]+)['"]/g)) runtimeSet.add(m[1]);
      continue;
    }
    for (const m of text.matchAll(/^[^\S\n]*(--[A-Za-z0-9-]+)\s*:/gm)) defined.add(m[1]);
    for (const m of text.matchAll(/['"](--[A-Za-z0-9-]+)['"]\s*:/g)) runtimeSet.add(m[1]);
  }

  const undefBare = [];
  const undefWithFallback = new Map();
  const color = { component: 0, componentFiles: new Set(), stylesDir: 0 };
  const literalPx = new Map();

  for (const [f, text] of contents) {
    if (!f.endsWith('.vue') && !f.endsWith('.css')) continue;
    const inStylesDir = f.startsWith('src/styles/');
    for (const { line, text: raw } of styleLines(f, text)) {
      const t = raw.trim();
      if (!t || t.startsWith('/*') || t.startsWith('*')) continue;

      for (const m of t.matchAll(/var\((--[A-Za-z0-9-]+)(\s*,[^)]*)?\)/g)) {
        const name = m[1];
        if (defined.has(name) || runtimeSet.has(name)) continue;
        if (m[2]) undefWithFallback.set(name, (undefWithFallback.get(name) ?? 0) + 1);
        else if (!inStylesDir) undefBare.push({ f, line, name });
      }
      const hits = t.match(/#(?:[0-9a-fA-F]{3,8})\b|\brgba?\(|\bhsla?\(/g)?.length ?? 0;
      if (hits > 0) {
        if (inStylesDir) color.stylesDir += hits;
        else {
          color.component += hits;
          color.componentFiles.add(f);
        }
      }
      if (!inStylesDir) {
        const prop = t.split(':')[0]?.trim() ?? '?';
        for (const hit of t.matchAll(/\b\d+(?:\.\d+)?px\b/g)) {
          void hit;
          literalPx.set(prop, (literalPx.get(prop) ?? 0) + 1);
        }
      }
    }
  }

  const byFile = new Map();
  for (const r of undefBare) byFile.set(r.f, (byFile.get(r.f) ?? 0) + 1);
  const byName = new Map();
  for (const r of undefBare) byName.set(r.name, (byName.get(r.name) ?? 0) + 1);

  return {
    scanned: contents.size,
    definedCount: defined.size,
    runtimeCount: runtimeSet.size,
    undefBare,
    byFile,
    byName,
    undefWithFallback,
    color,
    literalPx,
  };
}

/** 纯函数：按文件比较当前量与基线 ⇒ 谁涨了（红）、谁收敛了（提示下调） */
function ratchet(currentByFile, baseline) {
  const grew = [];
  const shrunk = [];
  for (const f of new Set([...Object.keys(baseline), ...currentByFile.keys()])) {
    const cur = currentByFile.get(f) ?? 0;
    const base = baseline[f] ?? 0;
    if (cur > base) grew.push({ f, base, cur, delta: cur - base });
    else if (cur < base) shrunk.push({ f, base, cur, delta: cur - base });
  }
  const currentTotal = [...currentByFile.values()].reduce((a, b) => a + b, 0);
  const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);
  return { grew, shrunk, currentTotal, baselineTotal, ok: grew.length === 0 };
}

// ── self-test：夹具期望值是手工可算的量 ──
if (SELF_TEST) {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });

  const S1 = scanContents(
    new Map([['src/views/Fake.vue', '<template><i/></template>\n<style scoped>\n.a { color: var(--zzz-undef); }\n</style>\n']])
  );
  check('能抓到组件层裸引用未定义 token（棘轮的捕获得存在）', S1.byFile.get('src/views/Fake.vue') === 1, `实得 ${S1.byFile.get('src/views/Fake.vue') ?? 0} 处`);

  const S2 = scanContents(
    new Map([
      ['src/core/range-fill.ts', "el.style.setProperty('--range-pct', String(v));\n"],
      ['src/views/Fake.vue', '<style scoped>\n.a { background: var(--range-pct); }\n</style>\n'],
    ])
  );
  check('运行时 setProperty 写入的键不算违规（假阳①不能复活）', S2.undefBare.length === 0, `实报 ${S2.undefBare.length} 处`);

  const S3 = scanContents(
    new Map([['src/views/Fake.vue', '<style scoped>\n.a { color: var(--zzz-undef, #fff); }\n</style>\n']])
  );
  check('带兜底值归 B 类，不进 A 类（硬错口径不能扩大）', S3.undefBare.length === 0 && S3.undefWithFallback.get('--zzz-undef') === 1, `A=${S3.undefBare.length}，B=${S3.undefWithFallback.get('--zzz-undef') ?? 0}`);

  const S4 = scanContents(new Map([['src/styles/palette.css', '.x { color: #ffffff; background: var(--zzz-undef); }\n']]));
  check('src/styles 的字面量计入调色板、不算组件层违规（假阳②不能复活）', S4.color.component === 0 && S4.color.stylesDir === 1 && S4.undefBare.length === 0, `组件层颜色 ${S4.color.component}，styles 颜色 ${S4.color.stylesDir}，A=${S4.undefBare.length}`);

  const S5 = scanContents(
    new Map([
      [
        'src/views/Fake.vue',
        '<style scoped>\n.a {\n  --zzz-def: 1px;\n  color: var(--zzz-def);\n  width: 13px;\n}\n</style>\n',
      ],
    ])
  );
  check('已声明的变量不误报，但字面量 px 仍计入 D 类', S5.undefBare.length === 0 && (S5.literalPx.get('width') ?? 0) === 1, `A=${S5.undefBare.length}，width 的 px=${S5.literalPx.get('width') ?? 0}`);

  // 棘轮本体：总数相等但按文件有涨有落 ⇒ 必须红（只锁总数时这里是绿的）
  const R1 = ratchet(new Map([['a.vue', 2], ['b.vue', 1]]), { 'a.vue': 1, 'b.vue': 2 });
  check(
    '总数抵消、单文件上涨 ⇒ 红（按文件锁强于总数锁）',
    R1.ok === false && R1.currentTotal === 3 && R1.baselineTotal === 3 && R1.grew[0]?.f === 'a.vue',
    `ok=${R1.ok}，总数 ${R1.currentTotal}/${R1.baselineTotal}，涨在 ${R1.grew.map((g) => g.f).join(',') || '无'}`
  );

  const R2 = ratchet(new Map([['a.vue', 1]]), { 'a.vue': 3, 'b.vue': 2 });
  check('纯收敛 ⇒ 绿且给出下调提示', R2.ok === true && R2.grew.length === 0 && R2.shrunk.length === 2, `ok=${R2.ok}，收敛 ${R2.shrunk.length} 个文件`);

  const R3 = ratchet(new Map(Object.entries(BASELINE_UNDEF_BARE)), BASELINE_UNDEF_BARE);
  check('基线原样 ⇒ 绿（夹具本身不能天然红）', R3.ok === true && R3.grew.length === 0 && R3.shrunk.length === 0, `ok=${R3.ok}`);

  const R4 = ratchet(new Map([['src/views/BrandNew.vue', 1]]), BASELINE_UNDEF_BARE);
  check('新文件长出 1 处死引用 ⇒ 红（迁移途中最容易漏的一类）', R4.ok === false && R4.grew[0]?.base === 0, `ok=${R4.ok}，${JSON.stringify(R4.grew[0] ?? null)}`);

  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}  [${r.detail}]`);
    if (!r.pass) failed++;
  }
  console.log(`\ntoken-guard self-test：${results.length - failed}/${results.length} 通过`);
  if (failed > 0) {
    console.error('失败：门禁的判定能力回归了（不是产品代码的问题，先修 scripts/token-guard.mjs）。');
    process.exitCode = 1;
  }
} else {
  const contents = new Map(walk(path.join(ROOT, 'src')).map((f) => [relOf(f), fs.readFileSync(f, 'utf8')]));
  const s = scanContents(contents);

  console.log(`扫描：src 下 ${s.scanned} 个文件（vue/css/ts）；CSS 定义 ${s.definedCount} 个变量、运行时写入 ${s.runtimeCount} 个`);
  console.log('');
  console.log(`A. 组件层裸引用未定义 token（声明今天即失效）：${s.undefBare.length} 处 / ${s.byFile.size} 文件 / ${s.byName.size} 个变量名`);
  for (const [f, n] of [...s.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${String(n).padStart(3)}  ${f}`);
  console.log(`   变量名：${[...s.byName.keys()].join(', ')}`);
  console.log('');
  const fbTotal = [...s.undefWithFallback.values()].reduce((a, b) => a + b, 0);
  console.log(`B. 未定义但有兜底值（兜底未必是本意，需逐条人判）：${fbTotal} 处 / ${s.undefWithFallback.size} 个变量名`);
  for (const [n, c] of [...s.undefWithFallback.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${String(c).padStart(3)}  ${n}`);
  console.log('');
  console.log(`C. 字面量颜色：组件层 ${s.color.component} 处 / ${s.color.componentFiles.size} 文件；src/styles ${s.color.stylesDir} 处（那是调色板定义本身，不算违规）`);
  const pxEntries = [...s.literalPx.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`D. 组件层字面量 px 合计 ${pxEntries.reduce((a, [, n]) => a + n, 0)} 处，按属性 top 12：`);
  for (const [p, n] of pxEntries.slice(0, 12)) console.log(`   ${String(n).padStart(5)}  ${p}`);
  console.log('');

  const r = ratchet(s.byFile, BASELINE_UNDEF_BARE);
  console.log(`口径：A 是硬错（迁移必须映射到真实 token）；B 要人判；C/D 才是"待 token 化"的量。基线 ${r.baselineTotal} 处（按文件锁）。`);

  if (!STRICT) {
    console.log('     统计模式不阻断；CI 用 --strict 走棘轮。');
  } else if (!r.ok) {
    console.error('\nA 类新增（棘轮只许减不许增）：');
    for (const g of r.grew) console.error(`   ${g.f}: ${g.base} → ${g.cur}（+${g.delta}）`);
    console.error(
      `\n失败：新增裸引用未定义 token。这类声明今天在浏览器里就是失效的（整条属性被丢弃）。\n` +
        '修复：换成 src/styles 里真有的语义 token（tokens.css / tokens-structure.css），或删掉那条无效声明；\n' +
        '只有在确实要新引入一个 token 定义时才允许上调基线，并在提交说明里写清定义落在哪个文件。'
    );
    process.exitCode = 1;
  } else {
    console.log(`--strict：A 类未新增（${r.currentTotal} 处 ≤ 基线 ${r.baselineTotal}）。`);
    if (r.shrunk.length > 0) {
      console.log('   已收敛，建议把基线下调锁定成果：');
      for (const x of r.shrunk) console.log(`   ${x.f}: ${x.base} → ${x.cur}（${x.delta}）`);
    }
  }
}
