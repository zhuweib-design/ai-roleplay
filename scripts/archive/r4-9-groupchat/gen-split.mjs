/**
 * R4-9 GroupChatView 拆分生成器（一次性临时脚本，跑完即弃）
 *
 * 铁律（DEV_PLAN §7.12 / O-4 / O-14 / O-15）：
 * 1. 基准是只读归档副本 `GroupChatView.orig.vue.txt`，不读源文件（会被覆写）
 * 2. seg() 越界 / 切空立即抛错，不返回空串
 * 3. 断言一律 A[n-1]（1-based 行号 → 0-based 下标）
 * 4. 尾部空串先 pop（文件以换行结尾时 split('\n') 比 wc -l 多一段）
 * 5. 内存归一 LF；本仓库 .vue / .ts 工作区为 LF，直接写 LF
 * 6. 边界字符串逐字符从归档拷，禁手打
 *
 * 切片设计（关键：toast 三件套留在宿主）：
 *   109-111  建群/删群/NPC 三个弹窗 ref        → composable
 *   116-119  NPC 派生状态                      → composable
 *   112-114  toastOpen / toastType / toastMessage → 留宿主（多消费方出口）
 *   262-373  12 个写操作函数                   → composable
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ARCH = path.join(ROOT, 'scripts/archive/r4-9-groupchat/GroupChatView.orig.vue.txt');

const raw = fs.readFileSync(ARCH, 'utf8').replace(/\r\n/g, '\n');
const A = raw.split('\n');
while (A.length > 0 && A[A.length - 1] === '') A.pop();

function assert(cond, msg) {
  if (!cond) throw new Error('[R4-9] 断言失败：' + msg);
}
function assertLine(n, expect) {
  const actual = A[n - 1];
  assert(actual !== undefined, `第 ${n} 行不存在（文件共 ${A.length} 行）`);
  assert(
    actual === expect,
    `第 ${n} 行不匹配\n  期望: ${JSON.stringify(expect)}\n  实际: ${JSON.stringify(actual)}`
  );
}

// ── 基线断言 ──
assert(A.length === 864, `归档应为 864 行，实际 ${A.length}`);
assertLine(1, '<script setup lang="ts">');
assertLine(374, '</script>');
assertLine(376, '<template>');
assertLine(595, '</template>');
assertLine(597, '<style scoped>');
assertLine(864, '</style>');

assertLine(108, '// ── UI 状态 ──');
assertLine(109, 'const createModalOpen = ref(false);');
assertLine(110, 'const deleteGroupTargetId = ref<string | null>(null);');
assertLine(111, 'const deleteModalOpen = ref(false);');
assertLine(112, 'const toastOpen = ref(false);');
assertLine(114, "const toastMessage = ref('');");
assertLine(116, '// ── F10.3 随机 NPC 生成状态 ──');
assertLine(117, 'const npcModalOpen = ref(false);');
assertLine(119, 'const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);');
assertLine(120, '');
assertLine(139, '// ── Toast ──');
assertLine(262, 'function openCreateModal() {');
assertLine(373, '}');

function seg(start, end, label) {
  assert(start >= 1 && end >= start && end <= A.length, `${label} 越界 ${start}-${end}`);
  const out = A.slice(start - 1, end);
  assert(out.length === end - start + 1, `${label} 长度不符 ${out.length}`);
  assert(out.join('').trim() !== '', `${label} 切出空内容`);
  return out;
}

const COMP_STATE = [...seg(109, 111, 'modal-refs'), '', ...seg(116, 119, 'npc-state')];
const ACTIONS_BLOCK = seg(262, 373, 'actions');

// 262-373 共 9 个顶层函数（含 2 个 async：handleStImport / confirmGenerateNpc）
const topFns = ACTIONS_BLOCK.filter((l) => /^(async )?function /.test(l));
assert(topFns.length === 9, `actions 片段应有 9 个顶层函数，实际 ${topFns.length}`);
for (const name of [
  'openCreateModal',
  'confirmCreate',
  'deleteGroup',
  'confirmDeleteGroup',
  'handleStImport',
  'handleExportGroupSt',
  'openNpcModal',
  'confirmGenerateNpc',
  'setMode',
]) {
  assert(
    topFns.some((l) => l.includes(`function ${name}(`)),
    `actions 片段缺少函数 ${name}`
  );
}
assert(
  COMP_STATE.filter((l) => /^(export )?(async )?function /.test(l)).length === 0,
  '状态片段不应含顶层函数'
);
assert(
  !COMP_STATE.some((l) => l.includes('toast')),
  '状态片段不应含 toast 三件套（多消费方出口留宿主）'
);
// hasApiProfile 引 settingsStore 是合理的：composable 内部自取该 store
assert(
  COMP_STATE.some((l) => l.includes('hasApiProfile')),
  '状态片段应含 hasApiProfile（NPC 上线校验用）'
);

// ── 生成 composable ──
const ind = (l) => (l === '' ? '' : '  ' + l);

const composable = `/**
 * useGroupActions — 群聊页的写操作（R4-9 从 GroupChatView 拆出）
 *
 * 归它管的：建群 / 删群 / SillyTavern 导入导出 / 随机 NPC 生成 / 发言模式切换，
 * 以及这些动作背后的弹窗开关与"上线校验"。
 * 不归它管：列表选中与深链（宿主留 selectGroup）、消息发送（useGroupComposer）、
 * 成员增删（useGroupMembers）、归档恢复（useGroupLifecycle）、Toast 渲染（宿主）。
 *
 * deps 只传两项：
 * - \`showToast\`：四个 composable 共用的唯一出口，必须由宿主持有实例，
 *   否则同一操作会在两处弹不同 toast。
 * - \`selectGroup\`：建群后顺手选中新群，而选中牵着地址栏 replace 与手机两级互换的
 *   压栈顺序（见宿主 selectGroup 上的长注释），抽进来会把 useDrilldown 一起拽走。
 *
 * store 与 useViewport 内部自取：全局单例，注入只会让签名变长。
 */
import { computed, ref } from 'vue';
import { useGroupChatStore } from '@/stores/group-chat';
import { useChatStore } from '@/stores/chat';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useViewport } from '@/core/viewport';
import { uiCharToGroupCard } from '@/services/type-adapters';
import { t } from '@/i18n';
import type { GroupChatMode } from '@/core/group-chat';
import type { CharacterTemplateId } from '@core/character-generator';
import type { ToastKind } from '@/composables/useGroupComposer';

export interface GroupActionsOptions {
  showToast: (type: ToastKind, message: string) => void;
  selectGroup: (id: string) => void;
}

export function useGroupActions(options: GroupActionsOptions) {
  const groupStore = useGroupChatStore();
  const chatStore = useChatStore();
  const characterStore = useCharacterStore();
  const settingsStore = useSettingsStore();
  const { isMobile } = useViewport();

  const { showToast, selectGroup } = options;

  const currentGroup = computed(() => groupStore.currentGroup);

${COMP_STATE.map(ind).join('\n')}

${ACTIONS_BLOCK.map(ind).join('\n')}

  return {
    createModalOpen,
    deleteModalOpen,
    npcModalOpen,
    npcGenerating,
    openCreateModal,
    confirmCreate,
    deleteGroup,
    confirmDeleteGroup,
    handleStImport,
    handleExportGroupSt,
    openNpcModal,
    confirmGenerateNpc,
    setMode,
  };
}
`;

const OUT_COMPOSABLE = path.join(ROOT, 'src/composables/useGroupActions.ts');
fs.writeFileSync(OUT_COMPOSABLE, composable, 'utf8');

// ── 改写宿主 ──
const HEAD = seg(1, 107, 'head'); // 到 backToGroupList 结束
const MID = seg(120, 261, 'mid'); // 计算属性 / showToast / 三个既有 composable / watch / selectGroup / 深链 / syncRemoteTurns

const UI_STATE = [
  '// ── UI 状态（toast 三件套留宿主：四个 composable 共用同一出口）──',
  'const toastOpen = ref(false);',
  "const toastType = ref<'info' | 'success' | 'error'>('info');",
  "const toastMessage = ref('');",
];

const ACTION_LINES = [
  '// ── 写操作（建群/删群/ST 导入导出/NPC/模式）──',
  '// 整块在 useGroupActions 里，这里只解构模板要绑的开关与处理器。',
  'const {',
  '  createModalOpen,',
  '  deleteModalOpen,',
  '  npcModalOpen,',
  '  npcGenerating,',
  '  openCreateModal,',
  '  confirmCreate,',
  '  deleteGroup,',
  '  confirmDeleteGroup,',
  '  handleStImport,',
  '  handleExportGroupSt,',
  '  openNpcModal,',
  '  confirmGenerateNpc,',
  '  setMode,',
  '} = useGroupActions({ showToast, selectGroup });',
];

const TAIL = seg(374, A.length, 'tail'); // </script> + template + style

const hostParts = [...HEAD, '', ...UI_STATE, '', ...MID, ...ACTION_LINES, '', ...TAIL];
let host = hostParts.join('\n') + '\n';
// 归一多余空行（切片拼接处可能叠出两个空行）
host = host.replace(/\n{3,}/g, '\n\n');

const OUT_HOST = path.join(ROOT, 'src/views/GroupChatView.vue');
fs.writeFileSync(OUT_HOST, host, 'utf8');

// ── 收尾统计 ──
const countLines = (p) => fs.readFileSync(p, 'utf8').split('\n').length - 1;
console.log('[R4-9] 生成完成');
console.log('  src/composables/useGroupActions.ts', countLines(OUT_COMPOSABLE), '行');
console.log('  src/views/GroupChatView.vue      ', countLines(OUT_HOST), '行');
console.log('  actions 片段顶层函数数          ', topFns.length);
