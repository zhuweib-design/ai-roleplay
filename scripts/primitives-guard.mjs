#!/usr/bin/env node
/**
 * primitives-guard.mjs — 共享原语复用守卫（`src/styles/primitives.css` 的配套门禁）
 *
 * 为什么需要它：R1-1 / R1-2 把视图切细后，每个新组件都复制了一份 `.btn`，
 * 两批合计多出约 600 行纯样板（DEV_PLAN §7.8.1 的归因）。把同值的那一份提到
 * 全局后，如果不加门禁，下一次拆分照样会复制——这笔整理就白做了。
 * 形状沿用 `file-size-guard` / `important-guard` 的成熟套路：
 * **同值重复直接失败 + 每文件计数棘轮只许降**。
 *
 * 判定规则：
 *   1. 某 .vue 里出现与 primitives.css **逐字同值**的 .btn 族规则 → 失败
 *      （说明在复制全局已有的东西，直接删掉即可，不需要保留）
 *   2. 某 .vue 的 .btn 族规则数 > 登记数 → 失败（长回去了）
 *   3. 某 .vue 的 .btn 族规则数 < 登记数 → 通过，提示把登记值下调
 *   4. primitives.css 自身不存在 → 失败（守卫的前提没了）
 *
 * 为什么第 1 条按"逐字同值"判而不是按"选择器存在"判：
 * 14 个文件里的 `.btn` 有 6 个不同变体（padding 6/8、radius-md/sm、card/card-elevated），
 * 它们视觉确实不同，**不能**合并。守卫只咬"本来就没差异却还写了一遍"的情况，
 * 否则会逼着人去合并本来就该分开的样式。
 *
 * 用法：
 *   node scripts/primitives-guard.mjs            # 报告（默认）
 *   node scripts/primitives-guard.mjs --strict   # CI：按上面四条判定
 *   node scripts/primitives-guard.mjs --list     # 看各文件当前计数
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const PRIMITIVES = join(SRC, 'styles', 'primitives.css');

const STRICT = process.argv.includes('--strict');
const LIST = process.argv.includes('--list');

/** 归入本守卫的按钮族选择器（不含 `.btn.primary` 这类历史两段式，见文件头说明） */
const BTN_FAMILY = /^\.btn(-primary|-secondary|-danger|-sm|-label|:disabled)?$/;

/**
 * 每文件 `.btn` 族规则数登记表：只许降不许升。
 *
 * 基线 2026-10-19（原语化完成后实测）。数值包含**变体不同、不能合并**的那些，
 * 所以不是 0 —— 它们各自负责一个视觉变体，属正常存在。未登记的文件视为 0：
 * 一旦新拆的组件又写了一份 `.btn`，这里立刻红。
 */
const RATCHET = {
  'src/components/common/ApiErrorModal.vue': 3,
  'src/components/random-events/SceneConfigModal.vue': 1,
  'src/components/random-events/TemplateEditorModal.vue': 1,
  'src/views/CommunityMarketView.vue': 4,
  'src/views/ImageGeneratorView.vue': 1,
  'src/views/LocalModelView.vue': 1,
  'src/views/RandomEventsView.vue': 1,
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

/** 规范化：压掉空白，便于逐字比对 */
function norm(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 取出 `.vue` 的样式段；纯 `.css` 文件原样返回。
 *
 * 必须限定在样式段内：模板里的 `@click` / `@/stores/...` 也带 `@`，
 * 直接在整文件上找 at-rule 会把它当起点、把后面大段内容当成块体吃掉
 * （行号还在，规则却没了 → 静默漏检）。
 */
function styleBlock(text) {
  const m = text.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : text;
}

/** 真正的 CSS at-rule（`@click` / `@/` 这类不算） */
const AT_RULE = /^@(media|supports|keyframes|font-face|layer|container|starting-style|property|scope)\b/;

/**
 * 剥掉 at-rule 块（保留行号，便于报错定位）。
 *
 * 为什么必须剥：媒体查询里的 `.btn-label { font-size: 16px }` 是**有意的窄屏覆盖**，
 * 不是"复制全局"。不剥的话守卫会把它当同值重复误报，然后被人加进豁免名单——
 * 那守卫就废了。只判顶层规则，语义才对得上"复制了全局基线"。
 */
function stripAtRules(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('@', i);
    if (at === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, at);
    if (!AT_RULE.test(text.slice(at, at + 24))) {
      out += '@';
      i = at + 1;
      continue;
    }
    const brace = text.indexOf('{', at);
    if (brace === -1) break;
    let depth = 1;
    let k = brace + 1;
    while (k < text.length && depth) {
      if (text[k] === '{') depth++;
      else if (text[k] === '}') depth--;
      k++;
    }
    out += '\n'.repeat(text.slice(at, k).split('\n').length - 1);
    i = k;
  }
  return out;
}

/**
 * 从 CSS 文本里抽出「顶层简单规则」（选择器不含嵌套、声明块内无嵌套）。
 * 只处理单层，够用：primitives.css 里全是扁平规则。
 */
function parseRules(text) {
  const rules = [];
  const re = /^([^\n{}]+?)\s*\{([^{}]*)\}/gm;
  let m;
  while ((m = re.exec(text))) {
    rules.push({ selector: m[1].trim(), body: norm(`{${m[2]}}`) });
  }
  return rules;
}

/**
 * 例外表：`文件::选择器 → 原因`。
 *
 * 只登记「逐字同值但**不能**删」的情况，每条必须写清为什么。空白原因视为无效登记，
 * 评审直接打回。目前只有一条，属于层叠顺序问题而不是偷懒。
 */
const EXEMPT = {
  'src/views/CommunityMarketView.vue::.btn-primary':
    '该文件的 .btn 是 rem 变体且用 `border: 1px solid transparent` 简写；删掉局部 .btn-primary 后 ' +
    '只剩全局 .btn-primary（0,1,0），border-color 会被局部 .btn（0,2,0）的简写覆盖，按钮边框变透明',
};

function main() {
  if (!existsSync(PRIMITIVES)) {
    console.error('[primitives-guard] 缺少 src/styles/primitives.css —— 守卫前提不存在');
    process.exit(STRICT ? 1 : 0);
  }

  const baseRules = parseRules(stripAtRules(styleBlock(readFileSync(PRIMITIVES, 'utf8'))))
    .filter((r) => BTN_FAMILY.test(r.selector))
    .map((r) => ({ sel: r.selector, body: r.body }));

  if (!baseRules.length) {
    console.error('[primitives-guard] primitives.css 里没解析到任何按钮族规则');
    process.exit(STRICT ? 1 : 0);
  }

  const files = walk(SRC);
  const dups = [];
  const counts = new Map();

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const rules = parseRules(stripAtRules(styleBlock(text))).filter((r) => BTN_FAMILY.test(r.selector));
    if (!rules.length) continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    counts.set(rel, rules.length);
    for (const r of rules) {
      const hit = baseRules.find((b) => b.sel === r.selector && b.body === r.body);
      if (hit && !EXEMPT[`${rel}::${r.selector}`]) dups.push({ file: rel, sel: r.selector });
    }
  }

  if (LIST) {
    console.log('文件 → .btn 族规则数（登记 / 当前）');
    for (const [f, n] of [...counts].sort()) {
      const reg = RATCHET[f] ?? 0;
      const mark = n > reg ? '↑超' : n < reg ? '↓可下调' : '=';
      console.log(`  ${mark} ${f}: ${reg} / ${n}`);
    }
    for (const f of Object.keys(RATCHET)) {
      if (!counts.has(f)) console.log(`  ↓ ${f}: ${RATCHET[f]} / 0（可删条目）`);
    }
    return;
  }

  const failures = [];
  const notes = [];

  for (const d of dups) {
    failures.push(
      `${d.file}: 复制了全局已有的 ${d.sel}（与 primitives.css 逐字同值）→ 删掉它，直接用全局`
    );
  }

  for (const [f, n] of counts) {
    const reg = RATCHET[f] ?? 0;
    if (n > reg) failures.push(`${f}: .btn 族规则 ${reg} → ${n}（长回去了，只许降不许升）`);
    else if (n < reg) notes.push(`${f}: 已降到 ${n}（登记 ${reg}，顺手把 RATCHET 改小）`);
  }

  for (const f of Object.keys(RATCHET)) {
    if (!counts.has(f)) notes.push(`${f}: 已无 .btn 族规则，可删除 RATCHET 条目`);
  }

  console.log(
    `[primitives-guard] 全局基线 ${baseRules.length} 条；扫描 ${files.length} 个 .vue，` +
      `命中 ${counts.size} 个含按钮族的文件；同值重复 ${dups.length} 处`
  );
  for (const n of notes) console.log(`  · ${n}`);

  if (failures.length) {
    console.error(`\n✗ ${failures.length} 项不合格：`);
    for (const f of failures) console.error(`  - ${f}`);
    if (STRICT) process.exit(1);
  } else {
    console.log('✓ 无同值重复，计数未增长');
  }
}

main();
