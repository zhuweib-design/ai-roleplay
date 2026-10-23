#!/usr/bin/env node
/**
 * CSS 规则集等价比对（R 类拆分的"行为不变"机械证据）
 *
 * 背景：R-A 批拆 View 时，样式随组件搬走。父级 scoped 到不了子组件内部，
 * 所以搬漏一条覆盖规则（R1-2 漏抄 ≤640 档 `.search-input{font-size:16px}`，
 * 手机搜索框矮 3px）时，静态守卫全绿、单测全绿，只有逐屏像素比对能看出来。
 * 本脚本把那次人工发现变成可复用的一次性判定：拆前文件 vs 拆后文件集合，
 * 逐规则取 (媒体查询前缀, selector, body) 做多重集差集。
 *
 * 判定：
 *   · 丢失规则 > 0 → 失败（这就是"搬漏了"）
 *   · 多出规则 → 只提示（拆分必然产生重复副本：每个子组件各带一份基类）
 *
 * 用法：
 *   node scripts/css-equiv-guard.mjs --base <ref> <file> [moreFiles...]
 *   # 基线取 `git show <ref>:<file>`；当前取磁盘上的全部 <file>
 *   # 拆出文件路径与基线不同时加 --from <baselinePath>
 *
 * 例（R1-3 回放）：
 *   node scripts/css-equiv-guard.mjs --base 25451f8 \
 *     src/views/WorldBookView.vue src/components/worldbook/Lorebook*.vue
 *
 * 为什么基线走 git 而不是"复制一份旧源码"：拆完就提交了，旧路径在 HEAD 已不存在；
 * 且这样不必 stash、不必构建两份产物、不必起 preview —— R1-3 那轮跑的是
 * "两个构建产物各起 preview 再截图"，用于像素比对没问题，用于规则集比对太重。
 *
 * 注意：本脚本**不进 CI**。它需要指定一个历史基线，没有待拆文件时无事可做。
 * CI 的常驻守卫是 check:file-size / check:control-size / check:primitives /
 * check:token-baseline；本脚本是拆分当轮的一次性验证工具（跑完留档即可）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

// ── 解析 ──

/** 取全部 `<style>` 块（.vue 允许多块，只取第一块会漏规则）；`.css` 取全文 */
export function styleOf(text, file = '') {
  if (file.endsWith('.css')) return text;
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out.join('\n');
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * 历史 token 别名表（2026-10-23 死 token 归零时引入）。
 *
 * 为什么需要：本脚本拿**历史基线**比规则体，而 2026-10-23 的 MOBILE_PLAN 批次 4
 * 把 81 处「引用了一个从未定义过的 token」的声明映射到了真实 token。规则的选择器
 * 与声明结构都没变，只有 `var()` 里的名字变了 —— 从"这条声明被浏览器静默丢弃"
 * 变成"这条声明终于生效"。这不是搬漏，但字符串比对会判成丢失 4 条（假阳性）。
 *
 * 为什么不干脆放宽判定或改基线 ref：基线 ref 就是 R1-3 拆分前的父提交，改了
 * 回放就失去意义；而放宽判定会让真正的搬漏漏网。别名表只在 `var(--旧名)` 这一
 * 个维度上做等价，其余一个字符都不放过。
 *
 * 维护：旧名全部已从代码里消失（`grep` 应为 0 命中）。这张表是**历史债的记账**，
 * 不是给新代码留的活口 —— 新代码禁止再写旧名。
 */
export const TOKEN_RENAMES = {
  '--on-surface-variant': '--muted-foreground',
  '--on-surface': '--foreground',
  '--on-bg': '--foreground',
  '--text': '--foreground',
  '--bg': '--card',
  '--border-subtle': '--border',
  '--bg-default': '--card',
};

/** 把规则体里的旧 token 名换成现名，使"历史上同一条声明"两侧可比 */
export function normalizeTokens(body) {
  return body.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g, (whole, name) =>
    TOKEN_RENAMES[name] ? `var(${TOKEN_RENAMES[name]})` : whole
  );
}

/**
 * 有意为之的规则体变更台账（2026-10-23 对比度存量收敛时引入）。
 *
 * 为什么需要：本脚本以**历史基线**做等价比对，"搬漏"与"故意改值"在字符串层面
 * 长得一模一样。52 处对比度存量收敛里，WorldBook 两个文件的规则体被有意改过
 * （`--accent-orange` / `--accent-blue` 换成 -text 变体），于是回放报"丢失 2 条"。
 *
 * 口径为什么是「选择器 + 旧规则体全文」而不是只写选择器：只写选择器的话，将来
 * 真把这条规则搬丢了、同时又因别的理由改过它的值，就会被这张表静默放过。写全文
 * 意味着**旧值一字不差**才算登记过——改了字面就自动失效，回到"报丢失"。
 *
 * 维护：这是历史债记账，不是活口。新代码里的规则变更不需要登记（登记只为兼容
 * 固定的历史基线），登记项也只服务于 `--base 25451f8` 这一次回放。
 */
export const INTENTIONAL_BODY_CHANGES = {
  '.bound-chars-count || display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--accent-blue-bg, rgba(96, 165, 250, 0.15)); color: var(--accent-blue); font-size: 12px; font-weight: 600;':
    '数字徽章文字 --accent-blue → --accent-blue-text（dark 下 4.39，差 0.11 不达标）',
  '.action-btn.extend || color: var(--accent-orange); border-color: var(--accent-orange);':
    '按钮文字 --accent-orange → --accent-orange-text，边框保留原色（light 下 3.88）',
};

/** 去掉容器前缀（@media 包裹层），只留「选择器 || 规则体」用于查台账 */
export const bodyKey = (key) => key.split(' || ').slice(1).join(' || ').trim();

/**
 * 按括号深度切选择器组：`.a, .b` → ['.a', '.b']。
 * 不能用 `split(',')` —— `:is(a, b)` / `:not(a, b)` 里的逗号会被切坏，
 * 那是假阳性（明明同一条规则，却被报成"丢了一条"）。
 */
export function splitSel(sel) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out.map(norm).filter(Boolean);
}

/**
 * 剥规则：产出 `{prefix, sel, body}`，prefix 是外层 at-rule 链（如
 * `@media (max-width: 640px)`）。
 *
 * 为什么要记 at-rule 链而不是"整个 @media 块当一条"：拆文件时常把一条
 * 组选择器 `.a, .b {...}` 拆到两个文件各写一份，语义等价。若把整块当原子，
 * 这种情况会被误报成丢失。所以必须落到单条选择器粒度再比。
 */
export function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of clean) {
    if (ch === '{') {
      const sel = buf.trim();
      // 容器（@media / @supports / @keyframes / @container）不是规则，它只提供前缀
      stack.push({ sel, body: '', isContainer: sel.startsWith('@') });
      buf = '';
    } else if (ch === '}') {
      const frame = stack.pop();
      if (!frame) {
        buf += ch;
        continue;
      }
      if (!frame.isContainer && frame.sel) {
        const prefix = stack.map((s) => s.sel).join(' / ');
        for (const sel of splitSel(frame.sel)) {
          out.push({ prefix, sel, body: norm(frame.body) });
        }
      }
      buf = '';
    } else {
      const top = stack[stack.length - 1];
      // 容器里跑的是"下一条规则的头部文字"，进 buf；规则里跑的是声明，进 body。
      // 混了就会把 `.input ` 当声明吃掉、选择器变空（首版就是这个 bug）。
      if (!top || top.isContainer) buf += ch;
      else top.body += ch;
    }
  }
  return out;
}

const keyOf = (r) => `${r.prefix} || ${r.sel} || ${normalizeTokens(r.body)}`;

export function styleKeys(text, file = '') {
  return rules(styleOf(text, file)).map(keyOf);
}

/** 多重集差集：返回 `want` 里比 `have` 多出来的那些（重复次数也算） */
export function diff(want, have) {
  const haveCount = new Map();
  for (const k of have) haveCount.set(k, (haveCount.get(k) ?? 0) + 1);
  const missing = [];
  for (const k of want) {
    const n = haveCount.get(k) ?? 0;
    if (n > 0) haveCount.set(k, n - 1);
    else missing.push(k);
  }
  const wantCount = new Map();
  for (const k of want) wantCount.set(k, (wantCount.get(k) ?? 0) + 1);
  const extra = [];
  for (const k of have) {
    const n = wantCount.get(k) ?? 0;
    if (n > 0) wantCount.set(k, n - 1);
    else extra.push(k);
  }
  return { missing, extra };
}

// ── self-test ──

function selfTest() {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });

  const A = '<style scoped>\n.a { color: red; }\n.b { color: blue; }\n</style>';
  check('同一份源码 ⇒ 无丢失无多出', (() => {
    const d = diff(styleKeys(A), styleKeys(A));
    return d.missing.length === 0 && d.extra.length === 0;
  })(), '');

  const dropped = '<style scoped>\n.a { color: red; }\n</style>';
  check('少一条规则 ⇒ 报丢失且能指名', (() => {
    const d = diff(styleKeys(A), styleKeys(dropped));
    return d.missing.length === 1 && d.missing[0].includes('.b');
  })(), '');

  // 拆文件最常见的形态：一条组选择器被拆到两个文件各写一份
  const grown = '<style scoped>\n.a { color: red; }\n.b { color: blue; }\n.c { color: green; }</style>';
  check('多一条规则 ⇒ 只提示不报丢失', (() => {
    const d = diff(styleKeys(A), styleKeys(grown));
    return d.missing.length === 0 && d.extra.length === 1;
  })(), '');

  const grouped = '<style scoped>\n.a,\n.b { color: red; }\n</style>';
  const splitIntoTwo =
    '<style scoped>\n.a { color: red; }</style><style scoped>\n.b { color: red; }</style>';
  check('组选择器拆到两个文件 ⇒ 等价（选择器组必须展开）', (() => {
    const d = diff(styleKeys(grouped), styleKeys(splitIntoTwo));
    return d.missing.length === 0 && d.extra.length === 0;
  })(), '');

  const iterable = '<style scoped>\n:is(.a, .b) { color: red; }\n</style>';
  check(':is() 内逗号不被当成选择器组（防假阳性）', (() => {
    const ks = styleKeys(iterable);
    return ks.length === 1 && ks[0].includes(':is(.a, .b)');
  })(), '');

  const inMedia = '<style scoped>\n@media (max-width: 640px) {\n.input { font-size: 16px; }\n}\n</style>';
  check('@media 内的规则带前缀区分（同选择器不同断点不混同）', (() => {
    const ks = styleKeys(inMedia);
    return ks.length === 1 && ks[0].startsWith('@media (max-width: 640px)');
  })(), '');

  const mediaLost = '<style scoped>\n.input { font-size: 16px; }\n</style>';
  check('断点覆盖被搬漏 ⇒ 报丢失（R1-2 踩过的那个坑）', (() => {
    const d = diff(styleKeys(inMedia), styleKeys(mediaLost));
    return d.missing.length === 1 && d.missing[0].includes('@media');
  })(), '');

  const kf = '<style scoped>\n@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }\n</style>';
  const kfLost = '<style scoped>\n.nothing { color: red; }\n</style>';
  check('@keyframes 内容可见（不被当空体跳过）', (() => {
    const d = diff(styleKeys(kf), styleKeys(kfLost));
    return d.missing.length >= 2;
  })(), '');

  check('注释不影响判定', (() => {
    const withComment = '<style scoped>\n/* 说明 */\n.a { color: red; }\n.b { color: blue; }\n</style>';
    return diff(styleKeys(A), styleKeys(withComment)).missing.length === 0;
  })(), '');

  // ── 历史 token 别名（2026-10-23 批次 4）──
  const oldTok = '<style scoped>\n.a { color: var(--text); background: var(--bg); }\n</style>';
  const newTok = '<style scoped>\n.a { color: var(--foreground); background: var(--card); }\n</style>';
  check('旧 token 改名为现名 ⇒ 判等价（历史回放不误报搬漏）', (() => {
    const d = diff(styleKeys(oldTok), styleKeys(newTok));
    return d.missing.length === 0 && d.extra.length === 0;
  })(), '');

  const nearTok = '<style scoped>\n.a { color: var(--foreground); background: var(--border); }\n</style>';
  check('token 改了但**改错**（--bg→--border）⇒ 仍报丢失', (() => {
    const d = diff(styleKeys(oldTok), styleKeys(nearTok));
    return d.missing.length === 1;
  })(), '');

  const otherProp = '<style scoped>\n.a { color: var(--foreground); background: var(--card); font-size: 13px; }\n</style>';
  check('token 等价但多出声明 ⇒ 仍判不等（别名表只管 token 名）', (() => {
    const d = diff(styleKeys(oldTok), styleKeys(otherProp));
    return d.missing.length === 1;
  })(), '');

  // ── 有意变更台账（2026-10-23 对比度收敛）──
  check('台账按「选择器 + 旧规则体全文」匹配 ⇒ 命中登记项', (() => {
    const registered = Object.keys(INTENTIONAL_BODY_CHANGES)[1];
    return Boolean(INTENTIONAL_BODY_CHANGES[bodyKey(` || ${registered}`)]);
  })(), '');
  check('登记过的规则体改掉一个字符 ⇒ 不再命中（台账不是活口）', (() => {
    const [sel, body] = Object.keys(INTENTIONAL_BODY_CHANGES)[1].split(' || ');
    return !INTENTIONAL_BODY_CHANGES[bodyKey(` || ${sel} || ${body};`)] && Boolean(body);
  })(), '');
  check('容器前缀不影响台账匹配（@media 里包着的同一条规则）', (() => {
    const registered = Object.keys(INTENTIONAL_BODY_CHANGES)[1];
    return (
      bodyKey(`@media (hover: hover) and (pointer: fine) || ${registered}`) === registered
    );
  })(), '');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    if (!r.pass) failed++;
  }
  console.log(`\ncss-equiv-guard self-test：${results.length - failed}/${results.length} 通过`);
  if (failed > 0) {
    console.error('失败：本脚本的判定能力回归了（不是待拆文件的问题）。');
    process.exitCode = 1;
  }
}

// ── 主流程 ──

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();

  const baseIdx = argv.indexOf('--base');
  const fromIdx = argv.indexOf('--from');
  const base = baseIdx >= 0 ? argv[baseIdx + 1] : null;
  const fromOverride = fromIdx >= 0 ? argv[fromIdx + 1] : null;

  const skip = new Set();
  if (baseIdx >= 0) {
    skip.add(baseIdx);
    skip.add(baseIdx + 1);
  }
  if (fromIdx >= 0) {
    skip.add(fromIdx);
    skip.add(fromIdx + 1);
  }
  const files = argv.filter((_, i) => !skip.has(i) && !_.startsWith('--'));

  if (!base || files.length === 0) {
    console.error('用法: node scripts/css-equiv-guard.mjs --base <ref> <file> [moreFiles...]');
    console.error('     node scripts/css-equiv-guard.mjs --self-test');
    process.exitCode = 1;
    return;
  }

  const fromPath = fromOverride ?? files[0];
  let baseSrc;
  try {
    baseSrc = execFileSync('git', ['show', `${base}:${fromPath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    console.error(`失败：取不到基线 ${base}:${fromPath}`);
    console.error('检查 ref 与路径是否正确（拆完后旧路径在 HEAD 已不存在，须给拆前的 ref）。');
    process.exitCode = 1;
    return;
  }

  const currentKeys = [];
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) {
      console.error(`失败：当前文件不存在 ${f}`);
      process.exitCode = 1;
      return;
    }
    currentKeys.push(...styleKeys(fs.readFileSync(abs, 'utf8'), f));
  }
  const baseKeys = styleKeys(baseSrc, fromPath);

  const { missing, extra } = diff(baseKeys, currentKeys);

  // 「搬漏」与「有意改值」在字符串层面同形，靠台账区分：台账按「选择器 + 旧规则体全文」
  // 精确匹配，改一个字就不再命中（防止台账变成掩盖真搬漏的活口）。
  const intentional = missing.filter((k) => INTENTIONAL_BODY_CHANGES[bodyKey(k)]);
  const realMissing = missing.filter((k) => !INTENTIONAL_BODY_CHANGES[bodyKey(k)]);

  console.log(`基线 ${base}:${fromPath} → ${baseKeys.length} 条规则`);
  console.log(`当前 ${files.length} 个文件 → ${currentKeys.length} 条规则`);
  if (intentional.length > 0) {
    console.log(`已登记的规则体变更 ${intentional.length} 条（不算丢失，逐条附理由）：`);
    for (const k of intentional) console.log(`   ~ ${bodyKey(k)}\n     理由：${INTENTIONAL_BODY_CHANGES[bodyKey(k)]}`);
  }
  console.log('');

  if (realMissing.length > 0) {
    console.error(`失败：丢失 ${realMissing.length} 条规则（拆文件时搬漏了）：`);
    for (const k of realMissing) console.error(`   - ${k}`);
    console.error('\n处理：把缺的规则补进对应的子组件（scoped 到不了子组件内部，父级规则不会生效）。');
    console.error('若确认是"故意改值"而非搬漏，请登记到 INTENTIONAL_BODY_CHANGES 并写清理由。');
    process.exitCode = 1;
    return;
  }

  console.log(`--strict：0 条丢失${extra.length > 0 ? `；多出 ${extra.length} 条（拆分产生的重复副本，正常）` : ''}`);
  if (extra.length > 0) {
    const shown = extra.slice(0, 8);
    for (const k of shown) console.log(`   + ${k}`);
    if (extra.length > shown.length) console.log(`   ... 另有 ${extra.length - shown.length} 条`);
    console.log('   多出的是各子组件自带的一份基类（.btn / .form-* / .action-btn 等），');
    console.log('   若其中有"本该只有一份"的原语，考虑提到 src/styles/primitives.css。');
  }
}

main();
