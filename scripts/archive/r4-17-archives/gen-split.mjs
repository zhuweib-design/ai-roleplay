// R4-17 行号切片生成器：ArchivesView.vue 803 → 宿主 + ArchiveDetailModal
//
// 切面判据（DEV_PLAN §7.12「实例封闭符号引用计数」）：
//   「查看对话 Modal」是完整闭环 —— 它的模板、8 个样式块、标题/成员/消息渲染、
//   前往群聊的关闭动作全在这里；宿主对它只有两处引用（v-model 开关 + 选中群聊对象）。
//   goToGroupChat 里唯一的跨域依赖是 navigation（pushWithReturn），保留在宿主，
//   子组件改发 go-group 事件，宿主零逻辑损失。
//
// 顺带清理（死代码，非「拆一半」）：
//   - Toast 三件套：toastOpen/toastMessage/toastType 全仓无任何置 true 的写入点，
//     组件挂上去也永不显示（注释自陈「保留用于后续错误反馈扩展」）
//   - .link-btn 样式块：父模板/子组件根元素均无命中（空态去路由 EmptyState 自己带 action）
//
// 铁律（O-4）：基准只读归档副本；越界/切空立即抛错；CRLF 归一 LF 落盘。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const BASE = path.join(ROOT, 'scripts/archive/r4-17-archives/ArchivesView.orig.vue.txt');
const HOST = path.join(ROOT, 'src/views/ArchivesView.vue');
const NEW = path.join(ROOT, 'src/components/archives/ArchiveDetailModal.vue');
const FMT = path.join(ROOT, 'src/utils/format.ts');

const readLF = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const writeLF = (p, text) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
};

const A = readLF(BASE).split('\n');
while (A[A.length - 1] === '') A.pop();

function at(n) {
  const v = A[n - 1];
  if (v === undefined) throw new Error(`行 ${n} 越界（基准共 ${A.length} 行）`);
  return v;
}
function assertLine(n, expect, label) {
  const got = at(n);
  if (got !== expect) {
    throw new Error(
      `${label}：第 ${n} 行不匹配\n  期望: ${JSON.stringify(expect)}\n  实际: ${JSON.stringify(got)}`
    );
  }
}
function slice(a, b) {
  if (a < 1 || b > A.length || a > b) throw new Error(`切片越界 ${a}-${b}（基准 ${A.length} 行）`);
  const out = A.slice(a - 1, b);
  if (!out.length) throw new Error(`切片 ${a}-${b} 为空`);
  return out;
}

// ── 边界断言：逐字对照归档 ───────────────────────────────────────────
assertLine(1, '<script setup lang="ts">', 'script 头');
assertLine(27, "import Modal from '@/components/common/Modal.vue';", 'Modal import');
assertLine(28, "import Toast from '@/components/common/Toast.vue';", 'Toast import');
assertLine(29, "import type { GroupChat } from '@/core/group-chat';", 'GroupChat import');
assertLine(31, "import { t } from '@/i18n';", 'i18n import');
assertLine(54, '// ── 选中查看的群聊 ──', 'modal 状态注释');
assertLine(56, 'const viewingGroup = ref<GroupChat | null>(null);', 'viewingGroup 声明');
assertLine(58, '// ── Toast（保留用于后续错误反馈扩展） ──', 'Toast 注释');
assertLine(61, "const toastType = ref<'info' | 'success' | 'error'>('info');", 'toastType 声明');
assertLine(62, '', 'Toast 段后空行');
assertLine(109, 'function formatDateTime(ts: string): string {', 'formatDateTime 起点');
assertLine(122, '}', 'formatDateTime 终点');
assertLine(123, '', 'formatDateTime 后空行');
assertLine(154, 'function viewGroup(g: GroupChat) {', 'viewGroup 起点');
assertLine(159, 'function goToGroupChat() {', 'goToGroupChat 起点');
assertLine(168, "  pushWithReturn({ name: 'group', query: { group: id } });", 'pushWithReturn 调用');
assertLine(169, '}', 'goToGroupChat 终点');
assertLine(170, '</script>', 'script 尾');
assertLine(330, '    <!-- 查看对话 Modal -->', 'Modal 模板注释起点');
assertLine(331, '    <Modal', 'Modal 开标签');
assertLine(381, '    </Modal>', 'Modal 闭标签');
assertLine(382, '', 'Modal 模板后空行');
assertLine(383, '    <!-- Toast -->', 'Toast 模板注释');
assertLine(384, '    <Toast', 'Toast 开标签');
assertLine(388, '    />', 'Toast 闭标签');
assertLine(389, '  </div>', '根 div 收尾');
assertLine(676, '/* 空状态 */', '空态样式注释');
assertLine(679, '.link-btn {', 'link-btn 起点');
assertLine(686, '}', 'link-btn 终点');
assertLine(688, '/* 查看 Modal */', 'Modal 样式注释');
assertLine(771, '}', 'modal-confirm 终点');
assertLine(772, '', 'Modal 样式后空行');

// ── 切片 ─────────────────────────────────────────────────────────────
const modalTpl = slice(331, 381); // <Modal ... </Modal>（52 行）
const modalCss = slice(689, 771); // 8 个样式块（83 行）
const isoOpts = slice(113, 117); // toLocaleString 的选项对象（5 行；112 是 return 行、118 是 }); 收尾，均不在切片内）

// ── 新组件 ───────────────────────────────────────────────────────────
// 模板从归档逐字符搬运，仅改三处绑定：v-model → modelValue、viewingGroup → group、
// @click="goToGroupChat" → @click="goGroup"
function retargetTpl(lines) {
  const out = lines.map((l) => {
    let s = l;
    s = s.replace('      v-model="viewModalOpen"', '      :model-value="modelValue"');
    s = s.replaceAll('viewingGroup', 'group');
    s = s.replace('@click="goToGroupChat"', '@click="goGroup"');
    s = s.replace('@click="viewModalOpen = false"', '@click="close"');
    return s;
  });
  // 在 <Modal ...> 开标签后补 update 事件（:model-value + @update:model-value 即 v-model）
  const modalOpen = out.findIndex((l) => l.trim() === '<Modal');
  if (modalOpen < 0) throw new Error('新模板里没找到 <Modal>');
  out.splice(modalOpen + 2, 0, '      @update:model-value="close"');
  // 独立组件里根节点缩进 2 空格（原模板嵌在宿主 <div> 内，多一级）
  return out.map((l) => (l.startsWith('  ') ? l.slice(2) : l));
}

const newTpl = retargetTpl(modalTpl);

const newFile = `<!--
  ArchiveDetailModal — 归档页「查看对话」弹窗

  自 ArchivesView.vue 迁出（R4-17）：这一段是完整闭环 —— 标题、成员/消息/时间三项
  摘要、归档徽章、消息气泡列表、底部「关闭 / 前往群聊」都在这里；宿主对它的依赖
  只剩「开关」与「当前查看的群聊」两个值。
  前往群聊需要路由契约（pushWithReturn 的 from 白名单在 composables/useReadinessJump.ts），
  属于页面级关注点，故改为发 go-group 事件由宿主执行导航，本组件不含 router 依赖。

  无障碍沿用原实现：Modal 自带 role=dialog / 焦点陷阱 / ESC 关闭。
-->
<script setup lang="ts">
import Modal from '@/components/common/Modal.vue';
import type { GroupChat } from '@/core/group-chat';
import { formatDateTime } from '@/utils/format';
import { t } from '@/i18n';

const props = defineProps<{
  /** 弹窗开关（v-model） */
  modelValue: boolean;
  /** 当前查看的群聊；null 时不渲染正文 */
  group: GroupChat | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 请求宿主把用户带到该群聊（导航契约属页面关注点，留在宿主） */
  'go-group': [id: string];
}>();

function close() {
  emit('update:modelValue', false);
}

function goGroup() {
  if (!props.group) return;
  const id = props.group.id;
  emit('update:modelValue', false);
  emit('go-group', id);
}
</script>

<template>
${newTpl.join('\n')}
</template>

<style scoped>
${modalCss.join('\n')}
</style>
`;

// ── utils/format.ts 追加 formatDateTime（宿主导出保持同名同签名） ──────
const fmtSrc = readLF(FMT);
if (fmtSrc.includes('export function formatDateTime')) {
  throw new Error('src/utils/format.ts 已存在 formatDateTime，请人工核对');
}
const fmtSuffix = `
/**
 * ISO 时间串 → 「YYYY/MM/DD HH:mm」本地时间（R4-17 自 ArchivesView 迁出）
 *
 * 与原实现逐字一致：显式指定 year/month/day/hour/minute，缺 minute 前不要省；
 * 非法输入原样返回（不抛错、不显示 Invalid Date）。
 */
export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
${isoOpts.join('\n')}
    });
  } catch {
    return iso;
  }
}
`;
writeLF(FMT, fmtSrc.replace(/\n*$/, '\n') + fmtSuffix);

// ── 宿主重写 ─────────────────────────────────────────────────────────
const hostHead = slice(1, 53); // script 头到 modal 状态段前的空行
const hostComputed = slice(63, 108); // 计算属性 + 工具函数注释
const hostUtils = slice(124, 142); // memberInitial / lastMessagePreview / countKeywordMatches
const hostOps = slice(144, 157); // 操作段：clearFilters + viewGroup
const hostTplHead = slice(172, 329); // <template> 到 </main> 后空行

// 组装：script
const scriptLines = [
  ...hostHead, // 1-53（含 import 段与筛选状态）
  ...slice(54, 57), // 选中查看的群聊状态
  '',
  '// ── Toast 段已移除（R4-17）：三个 ref 全仓无写入点，组件永不显示 ──',
  ...hostComputed,
  ...hostUtils,
  '',
  ...hostOps,
  '',
  'function goToGroupChat(id: string) {',
  '  viewModalOpen.value = false;',
  ...slice(163, 167), // 深链说明注释原样保留
  "  pushWithReturn({ name: 'group', query: { group: id } });",
  '}',
  '</script>',
];

// 替换 import 行：Modal/Toast → ArchiveDetailModal；补 formatDateTime
let script = scriptLines.join('\n');
script = script.replace(
  "import Modal from '@/components/common/Modal.vue';\nimport Toast from '@/components/common/Toast.vue';\n",
  "import ArchiveDetailModal from '@/components/archives/ArchiveDetailModal.vue';\n"
);
script = script.replace(
  "import { t } from '@/i18n';",
  `import { formatDateTime } from '@/utils/format';\nimport { t } from '@/i18n';`
);

// 模板：Modal 52 行 → 一行；Toast 5 行删除
let tpl = hostTplHead.join('\n');
tpl += `\n    <!-- 查看对话 Modal（R4-17 抽出为独立组件，导航回调留在本页） -->\n`;
tpl += `    <ArchiveDetailModal\n      v-model="viewModalOpen"\n      :group="viewingGroup"\n      @go-group="goToGroupChat"\n    />\n`;
tpl += `  </div>\n</template>\n\n<style scoped>`;

// 样式：删 link-btn 块（676-687 含注释与空行）、迁走 688-772
const cssHead = slice(393, 674); // .archives-view 到 match-count 收尾（675/676 是空行与空态注释，随死样式一起删）
const cssTail = slice(773, 802); // 响应式两段（@media 640）

const host = [
  script,
  '',
  tpl,
  cssHead.join('\n'),
  '',
  cssTail.join('\n'),
  '</style>',
  '',
].join('\n');

if (!host.includes('ArchiveDetailModal')) throw new Error('宿主未引用新组件');
if (host.includes('<Toast') || host.includes('toastOpen')) {
  throw new Error('宿主仍含 Toast 残留');
}
if (host.includes('function formatDateTime')) throw new Error('宿主仍含 formatDateTime 副本');
if (host.includes('.link-btn')) throw new Error('宿主仍含 .link-btn 死样式');

writeLF(HOST, host);
writeLF(NEW, newFile);

const cnt = (s) => s.split('\n').length;
console.log(`宿主 ${A.length} → ${cnt(host)} 行`);
console.log(`新组件 ${cnt(newFile)} 行`);
console.log(`utils/format.ts +${cnt(fmtSuffix) - 1} 行`);
