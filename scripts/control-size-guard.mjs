#!/usr/bin/env node
/**
 * control-size-guard — 控件高度字面量棘轮（MOBILE_PLAN 批次 3-1 / DEV_PLAN B1）
 *
 * 为什么需要它：`--size-control-*`（xs 24 / sm 28 / md 36 / lg 44 / touch 44）
 * 是控件尺寸的单一来源，但组件里仍散落着 `height: 32px` 这类字面量。
 * 字面量的两个害处：
 *   1. 批次 3-2 要在 ≤640 把阶梯整体上移（sm36/md44/lg48），**没接 token 的控件
 *      不会跟着变大**——"手机上按钮 44px"这条判据就永远差一截；
 *   2. 改一次设计尺寸要全仓搜，漏掉一处就是"这个按钮跟别的不一样高"。
 *
 * 判定与 token-guard / important-guard 同构：按文件锁存量，**只许降不许升**。
 * 只锁总数不够——"这里迁了 3 处、那里新写 3 处"会互相抵消成平局。
 *
 * 统计口径（刻意窄）：
 *   - 只看 `src/components/**` 与 `src/views/**` 的 .vue：`src/styles` 是 token
 *     与布局骨架的家，那里的 height 不是"控件"。
 *   - 只看 20–60px：小于 20 的多是图标/圆点，大于 60 的是容器高度。
 *   - `height` 与 `min-height` 都算（两者都在定控件尺寸）。
 *   - 不区分"是否已接 token"——接了 token 的写法是 `var(--size-control-md)`，
 *     根本不会命中 `\d+px`，所以计数下降本身就是迁移进度的度量。
 *
 * 三种模式：
 *   node scripts/control-size-guard.mjs            # 只统计（迁移动员 / 看分布）
 *   node scripts/control-size-guard.mjs --strict   # 棘轮（CI 用）
 *   node scripts/control-size-guard.mjs --list     # 打印每文件登记值与当前值
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const LIST = argv.includes('--list');

/**
 * 按文件的存量基线（2026-10-18 B1 迁移后实测）。
 *
 * 未列出的文件视为 0：新写一处字面量就会红。
 * 迁移进度：从 104 处降到下面的数字；剩下的都是"尺度缺口"（22/26/30/32/34/40…），
 * 它们没有对应的 token，硬映射会改变桌面密度，留给下一轮设计系统决策。
 */
const BASELINE = {
  // 2026-10-19 R1-5：7 → 1。页头三键 32×3 + 搜索条 min-height 44 / 输入 32 / 按钮 30 与
  // 回到底部 34 随 ChatHeader / ChatComposer / ChatMessageArea 搬走，总数不变（7）。
  'src/components/chat/ChatMain.vue': 1,
  // R1-5 新增：页头菜单键 32 + 右簇三键 32×3 + 搜索输入 32 + 搜索按钮 30 + 搜索条 min-height 44
  'src/components/chat/ChatHeader.vue': 5,
  // R1-5 新增：回到底部浮动按钮 34
  'src/components/chat/ChatMessageArea.vue': 1,
  'src/components/chat/MessageActionSheet.vue': 1,
  'src/components/chat/NewConversationModal.vue': 3,
  'src/components/chat/RuntimeStatePanel.vue': 1,
  'src/components/chat/StatusHud.vue': 1,
  'src/components/chat/ThinkingBlock.vue': 1,
  'src/components/common/EmptyState.vue': 1,
  'src/components/common/GuidedTasksCard.vue': 2,
  'src/components/common/OnboardingModal.vue': 1,
  'src/components/common/StepFlow.vue': 1,
  'src/components/group/GroupInfoPanel.vue': 1,
  // R1-1（2026-10-19）：这两处不是新增，是从 GroupChatView 原样搬过来的
  // （.group-avatar 36px / .gen-spinner 32px）。视图那边同步从 2 降到 0，总数不变。
  'src/components/group/GroupListPanel.vue': 1,
  'src/components/group/GroupNpcModal.vue': 1,
  // 2026-10-19 R2-3：4 → 2（.ctx-close 32 / .ctx-header 56 留在宿主外壳；
  // .ctx-schema-toggle 与 .ctx-schema-add 两个 32 随状态栏搬到 ContextStatusSection）。
  'src/components/layout/ContextPanel.vue': 2,
  'src/components/layout/context/ContextStatusSection.vue': 2,
  'src/components/mobile/BottomNav.vue': 1,
  'src/components/random-events/TemplateEditorModal.vue': 1,
  'src/components/settings/SettingsAboutPanel.vue': 1,
  // 2026-10-20 R3-1：5 → 0。宿主只剩装配（32 行），三个 32px 字面量随分区搬到
  // AppearanceThemeSection（.theme-swatch 32 / .theme-swatch 的 width 不计，
  // 实为 .theme-swatch height 32 + .data-mgmt-btn 未命中 ⇒ 2 处）
  // 与 AppearanceUiCustomSection（.bg-source-tab height 32）。总数不变，只换归属。
  'src/components/settings/SettingsAppearancePanel.vue': 0,
  'src/components/settings/AppearanceThemeSection.vue': 2,
  'src/components/settings/AppearanceUiCustomSection.vue': 1,
  'src/components/settings/SettingsDataPanel.vue': 0,
  // 2026-10-20 R3-2：宿主 2 → 0，.data-mgmt-select 32 搬到 SettingsDataDailySection、
  // .modal-btn 32 搬到 SettingsDataModals。总数 60 不变，只换归属。
  'src/components/settings/SettingsDataDailySection.vue': 1,
  'src/components/settings/SettingsDataModals.vue': 1,
  // 2026-10-19 R1-4：4 → 2（.data-mgmt-btn 32 / .modal-btn 32 仍留在宿主的两段
  // section 骨架里；.modal-btn 32 与 .data-mgmt-btn 32 各被搬到 ModelProfileForm /
  // ModelLocalSection，值未改，只是换了归属）。
  'src/components/settings/SettingsModelPanel.vue': 2,
  'src/components/settings/ModelLocalSection.vue': 1,
  'src/components/settings/ModelProfileForm.vue': 1,
  'src/components/settings/ModelProfileList.vue': 1,
  'src/components/settings/SettingsSecurityPanel.vue': 1,
  'src/components/settings/VectorModelPanel.vue': 1,
  'src/components/worldbook/QuickLorebookFlow.vue': 1,
  // 2026-10-19 R1-3：条目树的 .tree-action-btn 26 / .entry-toggle 22、
  // 已绑定角色的 .bound-chars-count 20 随组件搬到新文件（值未改，只是换了归属）。
  'src/components/worldbook/LorebookEntryTree.vue': 2,
  'src/components/worldbook/LorebookBindings.vue': 1,
  // 2026-10-19 R2-1：7 → 1（.preset-swatch 32 / .upload-btn 32 搬到 AvatarSection，
  // .add-stat-btn 26 / .stat-input 32 / .stat-select 32 / .stat-remove 32 搬到 AttrSection，
  // 值一处未改，只是换了归属；剩下 1 处是 .modal-btn 32）。
  'src/views/CharacterEditorView.vue': 1,
  'src/components/character/editor/CharacterEditorAvatarSection.vue': 2,
  'src/components/character/editor/CharacterEditorAttrSection.vue': 4,
  // 2026-10-19 R2-2：1 → 0（.commit-dot 的 24px 随提交列表搬到 VersionHistoryPanel）。
  'src/views/CharacterVersionView.vue': 0,
  'src/components/character/version/VersionHistoryPanel.vue': 1,
  'src/views/CharactersView.vue': 3,
  // 2026-10-19 R2-4：1 → 0（.form-textarea 的 min-height:60px 整体搬到 MarketDetailModal，
  // 宿主无 textarea；总数 62 不变）。
  'src/views/CommunityMarketView.vue': 0,
  'src/components/market/MarketDetailModal.vue': 1,
  'src/views/DataBankView.vue': 1,
  // 2026-10-19 R1-1：2 → 0（.group-avatar / .gen-spinner 随组件搬走，见上方两条）
  // 2026-10-20 R3-6：1 → 0（.form-textarea 的 min-height:60px 随生成面板搬到
  // ImageGenGeneratePanel；下面一行登记它，总数 60 不变）。
  'src/views/ImageGeneratorView.vue': 0,
  'src/views/ImageGenGeneratePanel.vue': 1,
  // 2026-10-19 R1-3：4 → 1（.tree-action-btn 26 / .entry-toggle 22 / .bound-chars-count 20
  // 随组件搬到 LorebookEntryTree / LorebookBindings；剩下 1 处是 .wb-open-flow-inline 的 min-height:32px）。
  'src/views/WorldBookView.vue': 1,
};

const ROOTS = ['src/components', 'src/views'];
const HEIGHT_RE = /(?:^|[^-\w])(min-height|height):\s*(\d+)px/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

function countFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  let n = 0;
  for (const m of text.matchAll(HEIGHT_RE)) {
    const px = Number(m[2]);
    if (px >= 20 && px <= 60) n += 1;
  }
  return n;
}

const files = ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
const counts = new Map();
for (const file of files) {
  const n = countFile(file);
  if (n > 0) counts.set(path.relative(ROOT, file).replace(/\\/g, '/'), n);
}

const total = [...counts.values()].reduce((a, b) => a + b, 0);
const baselineTotal = Object.values(BASELINE).reduce((a, b) => a + b, 0);

if (LIST) {
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [file, n] of rows) {
    const base = BASELINE[file] ?? 0;
    const mark = n > base ? '✗' : n < base ? '↓' : ' ';
    console.log(`${mark} ${String(n).padStart(3)} (登记 ${String(base).padStart(3)})  ${file}`);
  }
  console.log(`\n合计 ${total} 处（登记 ${baselineTotal}）`);
  process.exit(0);
}

const regressions = [];
const improvements = [];
for (const [file, n] of counts) {
  const base = BASELINE[file] ?? 0;
  if (n > base) regressions.push({ file, n, base });
}
for (const [file, base] of Object.entries(BASELINE)) {
  const n = counts.get(file) ?? 0;
  if (n < base) improvements.push({ file, n, base });
}

console.log(`[control-size] 扫描 ${files.length} 个 .vue：字面量 ${total} 处（登记 ${baselineTotal}）`);

if (improvements.length > 0) {
  console.log('[control-size] 这些文件已经比登记值小，请顺手下调基线：');
  for (const { file, n, base } of improvements) console.log(`  ↓ ${file} ${base} → ${n}`);
}

if (!STRICT) process.exit(0);

if (regressions.length > 0) {
  console.error('[control-size] 失败：控件高度字面量只许降不许升');
  for (const { file, n, base } of regressions) {
    console.error(`  ✗ ${file} — 登记 ${base} → 当前 ${n}（+${n - base}）`);
  }
  console.error('  接 token：--size-control-xs 24 / sm 28 / md 36 / lg 44 / touch 44');
  console.error('  真的没有对应档位（尺度缺口）就在 §7.10 同类纪律下显式上调基线并写原因');
  process.exit(1);
}

console.log('[control-size] 严格模式通过：控件高度字面量没有增长');
