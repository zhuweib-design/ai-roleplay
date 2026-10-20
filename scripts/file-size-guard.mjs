#!/usr/bin/env node
/**
 * file-size-guard.mjs — 单文件行数棘轮守卫（DEV_PLAN §7 大文件拆分专项的配套门禁）
 *
 * 为什么需要它：§7 拆完 24 个文件、新增 92 个文件，是 20–30 人日的投入。但拆分本身
 * 不带自锁——没有门禁的话，半年后同样的文件会重新长回去，这笔投入就白花了。
 * 项目已有 `important-guard`（!important 棘轮）、`token-guard`（死引用棘轮）两套成熟
 * 套路，这里沿用同一形状：**白名单 + 只许降不许升**。
 *
 * 判定规则：
 *   1. 不在白名单、且 > FAIL（1000 行）       → 失败（新长出来的大文件）
 *   2. 不在白名单、且 > WARN（800 行）        → 警告（不阻断，但要在评审里说明）
 *   3. 在白名单、且当前行数 > 登记行数        → 失败（拆过的文件又长回去了）
 *   4. 在白名单、且当前行数 ≤ WARN            → 通过，提示把条目删掉（它的债已经还完）
 *
 * 为什么白名单里锁"登记行数"而不只锁"存在性"：只锁存在性时，文件从 1000 长到 2000
 * 也算通过。§7 的价值全在"它会一直变小"，所以必须对增长有反应。
 *
 * 用法：
 *   node scripts/file-size-guard.mjs            # 报告（默认，不阻断）
 *   node scripts/file-size-guard.mjs --strict   # CI：按上面四条判定
 *   node scripts/file-size-guard.mjs --list     # 只看白名单现状
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

const STRICT = process.argv.includes('--strict');
const LIST = process.argv.includes('--list');

/** 失败阈值：超过即视为"大文件" */
const FAIL = 1000;
/** 警告阈值：超过即进入观察名单（拆分目标就是把这个数压到 0） */
const WARN = 800;

/**
 * 白名单：`文件 → { lines, reason }`。
 *
 * 纪律（与 important-guard 的棘轮同构）：
 * - 只允许**下调** lines，不允许上调；文件变小了就顺手改小，还完债就整条删掉；
 * - 新增条目必须在 reason 里写清"为什么现在不能拆"，否则评审直接打回；
 * - **数据文件例外（`ratchet: false`）**：i18n 字典随功能增长是常态，每个新 key
 *   都合法。对它们套棘轮，守卫会频繁假红、然后被绕过——那比没有守卫更糟。
 *   `ratchet: false` 的条目只展示现状，不参与增长判定，也不能用"行数没变"当
 *   不拆的理由（它们的理由写在 reason 里，与行数无关）。
 *
 * 现状基线：2026-10-18 实测（`wc -l`，含空行），26 个文件。明细与拆分计划见
 * `docs/design/DEV_PLAN_2026-10-17_开发计划.md` §7。
 */
/** 条目形状：lines=登记行数；reason=为什么在名单里；ratchet=false 时不判增长（数据文件） */
const ALLOWLIST = {
  // ── i18n 字典：数据文件，不拆（§7.2 已论证）──
  'src/i18n/locales/en.ts': { lines: 3417, ratchet: false, reason: 'i18n 字典，键平铺即其形状；随功能增长是常态，棘轮对它无意义' },
  'src/i18n/locales/zh.ts': { lines: 3416, ratchet: false, reason: '同上（中英键数严格相等，拆分会引入同步面）' },

  // ── R1 批（§7.3，优先拆分）──
  // 2026-10-19 R1-2 拆完：StoryEngineView 3326 → 652，已 ≤800，条目按 §7.10 删除。
  // 拆出 11 个文件：StoryQuickSetupPanel / StoryCard / StoryDetailPanel /
  // StoryDetailCharacters / StoryDetailWorld / StoryUploadModal / StoryImportModal /
  // StoryProtagonistModal + useStoryGeneration / useStoryFilters + story-display.ts
  // 2026-10-19 R1-3 拆完：WorldBookView 3115 → 741（≤800），条目按 §7.10 删除。
  // 拆出 9 个组件：LorebookHeader / LorebookListPanel / LorebookMetaSection /
  // LorebookWorldSections / LorebookBindings / LorebookEntryTree / LorebookEntryForm /
  // LorebookGenerateModal；+3 composable：useLorebookTree / useLorebookEntryForm / useLorebookIO。
  // 外壳（.worldbook-body / .lorebook-list-panel / .lorebook-editor-panel /
  // .editor-content / .entries-layout / .entries-list-panel / .entry-editor-panel）
  // 刻意留在视图里 —— 手机两级互换与第三态互斥都靠属性/后代选择器圈它们。
  // 2026-10-19 R1-4 拆完：SettingsModelPanel 2544 → 369（≤800），条目按 §7.10 删除。
  // 拆出 6 个组件：ModelCloudList / ModelLocalSection / ModelProfileList /
  // ModelProfileForm / ModelThinkingSection / ModelPresetSection
  // + composable：useModelProfileForm.ts。宿主只留 5 个 section 的顺序、云端/本地
  // Tab 切换、以及"两处新增入口 → 同一扇表单弹窗"的接线（`defineExpose` 转发）。
  'src/views/GroupChatView.vue': {
    // 2026-10-19 R1-1 拆完：2486 → 864（-1622）。仍 >800，保留条目继续压着。
    // 拆出 9 个文件：GroupListPanel / GroupMessageList / GroupMessageInput /
    // GroupCreateModal / GroupMemberModals / GroupNpcModal / CharacterPickerList
    // + useGroupComposer / useGroupMembers / useGroupLifecycle。
    lines: 864,
    reason: 'R1-1：已拆（2486 → 864），继续盯回长'
  },
  // 2026-10-19 R1-5 拆完：1742 → 583（-1159），销账。
  // 拆出 4 个文件：ChatHeader / ChatMessageArea / ChatComposer + useChatWindowing.ts。
  // 宿主只剩接线：三个子组件 + 四扇浮层 + 消息动作分发 + 导出 + API 错误诊断。

  // ── R2 批 ──
  // 2026-10-19 R2-1：CharacterEditorView 已拆（2320 → 532），本条销账。
  // 2026-10-19 R2-2：CharacterVersionView 已拆（1999 → 597），本条销账。
  'src/components/settings/SettingsAppearancePanel.vue': { lines: 1894, reason: 'R3-1：拆为 4 个文件' },
  // 2026-10-19 R2-4：CommunityMarketView 已拆（1838 → 580），本条销账。
  // 2026-10-19 R2-3：ContextPanel 已拆（1269 → 284），本条销账。
  'src/stores/settings.ts': { lines: 1621, reason: 'R2-5：拆为 3 个文件（其余 store 的拆分模板）' },

  // ── R3 批 ──
  'src/components/settings/SettingsDataPanel.vue': {
    // 2026-10-19 显式上调 1380 → 1389：C2 五处导出回显统一走 describeSaveResult
    // （取消不提示 / 成功说清落点 / 环境不支持说清去哪找）。R3-2 拆分时以拆后实测回填。
    lines: 1389,
    reason: 'R3-2：拆为 3 个文件',
  },
  'src/views/LocalModelView.vue': { lines: 1275, reason: 'R3-3：拆为 3 个文件' },
  'src/views/RandomEventsView.vue': { lines: 1269, reason: 'R3-4：拆为 3 个文件' },
  'src/views/CharactersView.vue': {
    // 2026-10-19 显式上调 1360 → 1388：B2/B3 触摸目标（页头与排序 ≥44、星标伪元素命中区）（合理功能增量，非无声漂移）。R3-5 拆分时以拆后实测回填。
    // 2026-10-18 显式上调：A11 角色抽屉状态 +66 行、判据瘦身样式 +27 行
    // （"一屏 ≥3 卡"的媒体块），合计 +93，均为合理功能增量而非无声漂移。
    // R3-5 拆分时以拆后实测回填。
    lines: 1388,
    reason: 'R3-5：拆为 3 个文件',
  },
  'src/views/ImageGeneratorView.vue': { lines: 1238, reason: 'R3-6：拆为 3 个文件' },

  // ── R4 批 ──
  'src/components/worldbook/WorldBookEventsPanel.vue': { lines: 1161, reason: 'R4-2：拆为 2 个文件' },
  'src/components/settings/VectorModelPanel.vue': { lines: 1024, reason: 'R4-1：拆为 2 个文件' },
  'src/stores/lorebook.ts': { lines: 1469, reason: 'R4-3：拆为 2 个文件' },
  'src/stores/chat-generation.ts': { lines: 1502, reason: 'R4-4：拆为 2 个文件' },
  'src/stores/story.ts': {
    // 2026-10-19 显式上调 1227 → 1228：C2 剧本导出回显走 describeSaveResult。
    // R4-5 拆分时以拆后实测回填。
    lines: 1228,
    reason: 'R4-5：拆为 2 个文件',
  },
  'src/core/community-market.ts': { lines: 1274, reason: 'R4-7：拆为 2 个文件' },
  'src/core/random-event-generator.ts': { lines: 1063, reason: 'R4-8：拆为 2 个文件' },
  'src/stores/group-chat.ts': { lines: 1077, reason: 'R4-6：拆为 2 个文件' },
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(vue|ts|css|mjs|js)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function countLines(file) {
  const text = readFileSync(file, 'utf8');
  // 与 `wc -l` 严格对齐：只数换行符（末尾无换行的最后一行，wc 也不算）。
  // 不对齐会让"末尾少一个换行"被误判成"文件缩小了"，棘轮直接失真。
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

const files = walk(SRC);
const findings = [];

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const lines = countLines(file);
  const allowed = ALLOWLIST[rel];

  if (allowed) {
    // 数据文件（ratchet: false）不判增长：它们只进展示，不进判定
    if (allowed.ratchet === false) {
      continue;
    }
    if (lines > allowed.lines) {
      findings.push({
        level: 'fail',
        rel,
        lines,
        msg: `白名单文件长大了：${allowed.lines} → ${lines}（+${lines - allowed.lines}）。棘轮只许降不许升`,
      });
    } else if (lines <= WARN) {
      findings.push({
        level: 'note',
        rel,
        lines,
        msg: `已降到警告线以下（${lines} ≤ ${WARN}），请从白名单删除这一条`,
      });
    }
  } else if (lines > FAIL) {
    findings.push({
      level: 'fail',
      rel,
      lines,
      msg: `新增大文件 ${lines} 行（阈值 ${FAIL}）。要么拆开，要么在白名单登记并写明为什么现在不能拆`,
    });
  } else if (lines > WARN) {
    findings.push({
      level: 'warn',
      rel,
      lines,
      msg: `${lines} 行，进入观察名单（>${WARN}）。拆分目标是把这类文件清零`,
    });
  }
}

if (LIST) {
  console.log('[file-size] 白名单现状（登记行数 → 当前行数）：');
  for (const [rel, meta] of Object.entries(ALLOWLIST)) {
    const full = join(ROOT, rel);
    let cur;
    try {
      cur = countLines(full);
    } catch {
      cur = '不存在';
    }
    const flag = typeof cur === 'number' && cur > meta.lines ? ' ← 超登记' : '';
    console.log(`  ${String(meta.lines).padStart(5)} → ${String(cur).padStart(5)}  ${rel}${flag}`);
  }
  console.log(`[file-size] 共 ${Object.keys(ALLOWLIST).length} 条`);
  process.exit(0);
}

const fails = findings.filter((f) => f.level === 'fail');
const warns = findings.filter((f) => f.level === 'warn');
const notes = findings.filter((f) => f.level === 'note');

const allowedFiles = Object.keys(ALLOWLIST);
const scanned = files.length;

console.log(`[file-size] 扫描 src 下 ${scanned} 个文件；白名单 ${allowedFiles.length} 个；阈值 warn ${WARN} / fail ${FAIL}`);

if (warns.length) {
  console.log(`\n[file-size] 观察名单（${warns.length} 个，>${WARN} 行且不在白名单）：`);
  for (const w of warns) console.log(`  ! ${String(w.lines).padStart(5)}  ${w.rel}`);
}

if (notes.length) {
  console.log(`\n[file-size] 已还完债（${notes.length} 个，可从白名单删除）：`);
  for (const n of notes) console.log(`  ✓ ${String(n.lines).padStart(5)}  ${n.rel}`);
}

if (fails.length) {
  console.error(`\n[file-size] 失败 ${fails.length} 项：`);
  for (const f of fails) console.error(`  ✗ ${f.rel} — ${f.msg}`);
}

if (!STRICT) {
  console.log(
    fails.length
      ? `\n[file-size] 非严格模式：以上 ${fails.length} 项在 --strict 下会失败（CI 用 --strict）`
      : '\n[file-size] 通过（非严格模式）'
  );
  process.exit(0);
}

if (fails.length) {
  console.error(`\n[file-size] 严格模式失败：${fails.length} 项。见 docs/design/DEV_PLAN_2026-10-17_开发计划.md §7`);
  process.exit(1);
}
console.log('\n[file-size] 严格模式通过：没有新增/长大的大文件');
