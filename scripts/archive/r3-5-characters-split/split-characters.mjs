// R3-5 CharactersView 拆分生成器
// 铁律：基准只读归档副本 scripts/archive/r3-5-characters-split/CharactersView.orig.vue.txt
// 切面：CharacterGridPanel（网格/卡片/空状态/拖拽覆盖）+ CharacterGenerateModal（生成 Modal）
// 宿主保留：header / FilterTabs / sort-bar / 抽屉 / delete Modal / Toast / import 全套
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const ARCHIVE = resolve(here, 'CharactersView.orig.vue.txt');
const HOST = resolve(root, 'src/views/CharactersView.vue');
const GRID = resolve(root, 'src/views/CharacterGridPanel.vue');
const GEN = resolve(root, 'src/views/CharacterGenerateModal.vue');

const orig = readFileSync(ARCHIVE, 'utf8').split('\n'); // 1-based slice 用

/** 越界/反参/切空全抛错 */
function slice(a, b) {
  if (!(a >= 1 && a <= b && b <= orig.length)) {
    throw new Error(`slice 越界或反参: ${a}-${b} (原文件 ${orig.length} 行)`);
  }
  const text = orig.slice(a - 1, b).join('\n');
  if (!text.trim()) throw new Error(`slice 切空: ${a}-${b}`);
  return text;
}

/** 改写 + 计数断言 */
function rewire(text, pairs) {
  for (const [from, to, expect] of pairs) {
    const parts = text.split(from);
    const n = parts.length - 1;
    if (n !== expect) throw new Error(`改写断言失败: "${from}" 期望 ${expect} 处，实得 ${n}`);
    text = parts.join(to);
  }
  return text;
}

// ───────────────────────── CharacterGridPanel ─────────────────────────

// 模板切片 519–627（grid 根 div 整段），改写为 emit / prop 引用
let gridTpl = slice(519, 627);
gridTpl = rewire(gridTpl, [
  ['onCardClick(char.id)', "$emit('card-click', char.id)", 3],
  ['busyCharacterId === char.id', 'busyId === char.id', 2],
  ['characterList', 'list', 2],
  ['v-if="isDragging"', 'v-if="dragging"', 1],
  ["@click.stop=\"editCharacter(char.id)\"", "@click.stop=\"$emit('edit', char.id)\"", 1],
  ["@click.stop=\"startConversation(char.id)\"", "@click.stop=\"$emit('chat', char.id)\"", 1],
  [':disabled="busyCharacterId === char.id"', ':disabled="busyId === char.id"', 0], // 已被上文 busyId 替换覆盖，此处校验不再出现
]);
// 上面 disabled 行已在 busyCharacterId 替换中处理（同文本），expect 0 校验残留
gridTpl = rewire(gridTpl, [
  ["@click.stop=\"exportCharacter(char.id)\"", "@click.stop=\"$emit('export', char.id)\"", 1],
  ["@click.stop=\"confirmDelete(char)\"", "@click.stop=\"$emit('delete', char)\"", 1],
  ["@click.stop=\"openVersions(char.id)\"", "@click.stop=\"$emit('versions', char.id)\"", 1],
]);
if (gridTpl.includes('busyCharacterId') || gridTpl.includes('characterList') || gridTpl.includes('isDragging')) {
  throw new Error('grid 模板仍有未改写的宿主标识符');
}

// 样式：884–892（grid 容器）+ 919–1092（卡片族）+ 1097–1112（drag-overlay）
// + 640 档 1314–1323、1327–1335、1345–1347、1372–1387
const gridStyle = [
  slice(884, 892),
  slice(919, 1092),
  slice(1097, 1112),
  '@media (max-width: 640px) {',
  slice(1314, 1323),
  slice(1327, 1335),
  slice(1345, 1347),
  '}',
  slice(1372, 1387),
].join('\n\n');

const gridVue = `<script setup lang="ts">
/**
 * CharacterGridPanel — 角色卡片网格（R3-5 从 CharactersView 拆出）
 *
 * 持有：卡片网格 / 收藏切换 / 标签预览 / 空状态 / 拖拽提示覆盖层。
 * 事件上抛：卡片点击（宿主分流抽屉或编辑页）/ 编辑 / 对话 / 导出 / 删除 / 版本历史。
 * 判据：单根组件（无 v-show 透传需求，不包额外根 div）。
 */
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useViewport } from '@/core/viewport';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Avatar from '@/components/common/Avatar.vue';
import type { UICharacter } from '@/types';
import { t } from '@/i18n';

const props = defineProps<{
  list: UICharacter[];
  busyId: string | null;
  dragging: boolean;
}>();

const emit = defineEmits<{
  'card-click': [id: string];
  edit: [id: string];
  chat: [id: string];
  export: [id: string];
  delete: [char: UICharacter];
  versions: [id: string];
}>();

const characterStore = useCharacterStore();
const settingsStore = useSettingsStore();
const versionStore = useCharacterVersionStore();
const { isMobile } = useViewport();

function toggleFavorite(id: string, e: Event) {
  e.stopPropagation();
  characterStore.toggleFavorite(id);
}

function tagsPreview(tags: string[]): string {
  return tags.slice(0, 3).join(' · ') + (tags.length > 3 ? \` +\${tags.length - 3}\` : '');
}
</script>

<template>
  <div class="characters-grid tk-scroll">
${gridTpl
  .split('\n')
  .slice(1, -1) // 去掉原 grid 根 div 首尾行（面板自写根）
  .join('\n')
  .replace(/^ {6}/gm, '    ')}
  </div>
</template>

<style scoped>
${gridStyle}
</style>
`;

// ─────────────────────── CharacterGenerateModal ───────────────────────

// 模板切片 684–749（Modal 整块）：v-model 改 defineModel，其余标识符面板内自持
let genTpl = slice(684, 749);
genTpl = rewire(genTpl, [
  ['v-model="generateModalOpen"', 'v-model="open"', 1],
]);

// 样式：1175–1291（generate 内容族 + spin）+ 640 档 template-grid
// + Teleport 约束：footer 按钮 plain 副本三条（宿主也保留一份给 delete footer）
const genStyle = [
  slice(1175, 1291),
  '@media (max-width: 640px) {',
  '  .template-grid {',
  '    grid-template-columns: 1fr;',
  '  }',
  '}',
  `/* O-6：Modal 走 Teleport，footer 按钮的共用样式须 plain 各留一份
   （宿主那份服务 delete footer，本面板这份服务 generate footer） */
.modal-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .modal-cancel:hover {
    background: var(--video-bg);
  }
}`,
].join('\n\n');

const genVue = `<script setup lang="ts">
/**
 * CharacterGenerateModal — F01.7 随机生成角色 Modal（R3-5 从 CharactersView 拆出）
 *
 * 持有：模板选择 / 生成执行 / 生成中关闭锁。
 * 选择状态由 watch(open=true) 重置（等价原 openGenerateModal 内的 selectedTemplate=null）。
 * hasApiProfile 闸门与页头按钮 disabled 均留宿主（openGenerateModal）。
 */
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import {
  CHARACTER_TEMPLATES,
  type CharacterTemplateId,
} from '@/core/character-generator';
import { t } from '@/i18n';

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
const notify = (type: 'info' | 'success' | 'error', message: string) => emit('notify', type, message);

const router = useRouter();
const characterStore = useCharacterStore();
const selectedTemplate = ref<CharacterTemplateId | null>(null);
const templates = CHARACTER_TEMPLATES;

// 打开时重置选择（原 openGenerateModal 内行为，随 selectedTemplate 下放）
watch(open, (v) => {
  if (v) selectedTemplate.value = null;
});

function selectTemplate(id: CharacterTemplateId) {
  selectedTemplate.value = id;
}

async function handleGenerate() {
  if (!selectedTemplate.value) {
    notify('error', t('characters.generateSelectTemplate'));
    return;
  }
  if (characterStore.isGeneratingCharacter) return;

  const templateId = selectedTemplate.value;
  const id = await characterStore.generateRandomCharacter(templateId);
  if (id) {
    open.value = false;
    // 生成成功后自动跳转到编辑页查看结果
    setTimeout(() => {
      void router.push({ name: 'character-edit', params: { id } });
    }, 300);
  }
  // 失败时 lastError 会通过宿主 watch 显示 toast，保持 Modal 打开允许重试
}

function closeGenerateModal() {
  if (characterStore.isGeneratingCharacter) return; // 生成中不允许关闭
  open.value = false;
}
</script>

<template>
${genTpl}
</template>

<style scoped>
${genStyle}
</style>
`;

// ─────────────────────────── 宿主改写 ───────────────────────────

let host = readFileSync(HOST, 'utf8');
const lines = host.split('\n');

/** 用归档行号切基准段并替换（铁律：基准只读归档，宿主行号已被前置改写打乱） */
function replaceOrigLines(a, b, repl) {
  const old = slice(a, b);
  if (!host.includes(old)) throw new Error(`宿主段 ${a}-${b}（归档基准）未命中`);
  host = host.replace(old, repl);
  lines.length = 0;
  lines.push(...host.split('\n'));
}

/** 唯一锚字符串替换 + 计数断言 */
function sub(from, to, expect = 1) {
  const parts = host.split(from);
  const n = parts.length - 1;
  if (n !== expect) throw new Error(`宿主替换断言失败: "${from.slice(0, 60)}" 期望 ${expect}，实得 ${n}`);
  host = parts.join(to);
  lines.length = 0;
  lines.push(...host.split('\n'));
}

// 1) imports：删 versionStore / CHARACTER_TEMPLATES / EmptyState / Avatar；加两面板
sub("import EmptyState from '@/components/common/EmptyState.vue';\n", '', 1);
sub("import Avatar from '@/components/common/Avatar.vue';\n", '', 1);
sub("import { useCharacterVersionStore } from '@/stores/character-version';\n", '', 1);
sub("import {\n  CHARACTER_TEMPLATES,\n  type CharacterTemplateId,\n} from '@/core/character-generator';\n", '', 1);
sub(
  "import CharacterDetailDrawer from '@/components/character/CharacterDetailDrawer.vue';",
  "import CharacterDetailDrawer from '@/components/character/CharacterDetailDrawer.vue';\nimport CharacterGenerateModal from './CharacterGenerateModal.vue';\nimport CharacterGridPanel from './CharacterGridPanel.vue';",
  1,
);

// 2) script：删 versionStore 实例 + selectedTemplate/templates + toggleFavorite + tagsPreview
sub('const versionStore = useCharacterVersionStore();\n', '', 1);
sub(
  '// F01.7 随机生成\nconst generateModalOpen = ref(false);\nconst selectedTemplate = ref<CharacterTemplateId | null>(null);\nconst templates = CHARACTER_TEMPLATES;',
  '// F01.7 随机生成（模板选择状态在 CharacterGenerateModal 内部）\nconst generateModalOpen = ref(false);',
  1,
);
sub('  selectedTemplate.value = null;\n', '', 1); // openGenerateModal 内重置（面板 watch 接管）
// 删 toggleFavorite（206–209）与其后空行
sub(
  'function toggleFavorite(id: string, e: Event) {\n  e.stopPropagation();\n  characterStore.toggleFavorite(id);\n}\n\n',
  '',
  1,
);
// 删 tagsPreview（395–397）
sub(
  "function tagsPreview(tags: string[]): string {\n  return tags.slice(0, 3).join(' · ') + (tags.length > 3 ? ` +${tags.length - 3}` : '');\n}\n",
  '',
  1,
);

// 3) script：删 selectTemplate / handleGenerate / closeGenerateModal（整段锚）
sub(
  `function selectTemplate(id: CharacterTemplateId) {
  selectedTemplate.value = id;
}

async function handleGenerate() {
  if (!selectedTemplate.value) {
    showToast('error', t('characters.generateSelectTemplate'));
    return;
  }
  if (characterStore.isGeneratingCharacter) return;

  const templateId = selectedTemplate.value;
  const id = await characterStore.generateRandomCharacter(templateId);
  if (id) {
    generateModalOpen.value = false;
    // 生成成功后自动跳转到编辑页查看结果
    setTimeout(() => {
      void router.push({ name: 'character-edit', params: { id } });
    }, 300);
  }
  // 失败时 lastError 会通过 watch 显示 toast，保持 Modal 打开允许重试
}

function closeGenerateModal() {
  if (characterStore.isGeneratingCharacter) return; // 生成中不允许关闭
  generateModalOpen.value = false;
}

`,
  '',
  1,
);
// ── F01.7 随机生成 ── 注释行保留（其下 openGenerateModal 仍在宿主）
sub(
  '// ── F01.7 随机生成 ──\n\nfunction openGenerateModal',
  '// ── F01.7 随机生成（闸门留宿主，Modal 在 CharacterGenerateModal） ──\n\nfunction openGenerateModal',
  1,
);

// 4) template：grid 段 519–627 → 面板标签；generate Modal 684–749 → 面板标签
// （模板段用归档行号切，此刻宿主模板未动过）
replaceOrigLines(
  519,
  627,
  `    <CharacterGridPanel
      :list="characterList"
      :busy-id="busyCharacterId"
      :dragging="isDragging"
      @card-click="onCardClick"
      @edit="editCharacter"
      @chat="startConversation"
      @export="exportCharacter"
      @delete="confirmDelete"
      @versions="openVersions"
    />`,
);
replaceOrigLines(684, 749, '    <CharacterGenerateModal v-model="generateModalOpen" @notify="showToast" />');

// 5) style：删 grid/卡片/drag 覆盖层段 + generate 内容族段 + 640 档拆分 + favorite 640 档
sub(slice(884, 892) + '\n\n', '', 1);
sub(slice(919, 1092) + '\n\n', '', 1);
sub(slice(1097, 1112) + '\n\n', '', 1);
sub(slice(1175, 1291) + '\n\n', '', 1);
// 640 大块 1293–1351 整块替换为宿主保留子集（原顺序保持，行为零变化）
sub(
  slice(1293, 1351),
  `@media (max-width: 640px) {
  .characters-view {
    padding: var(--spacing-md);
  }

  .header-btn .btn-label {
    display: none;
  }

  .header-btn {
    width: 36px;
    padding: 0;
    justify-content: center;
  }

  .search-wrapper {
    order: 3;
    max-width: none;
    flex-basis: 100%;
  }

  .characters-header .header-btn.back {
    display: none;
  }
  /* chrome 也得让位：容器 padding 与块间距是"一屏 ≥3 卡"的另一半 */
  .characters-view {
    padding: 12px;
    gap: 12px;
  }
  .sort-bar {
    padding: 0 0 4px;
  }
}`,
  1,
);
// favorite 640 档 1372–1387（含注释）随 grid 走
sub('\n' + slice(1372, 1387) + '\n', '\n', 1);

// 6) 宿主残留校验
const leftovers = [
  ['selectedTemplate', 0],
  ['CHARACTER_TEMPLATES', 0],
  ['useCharacterVersionStore', 0],
  ['toggleFavorite', 0],
  ['tagsPreview', 0],
  ['handleGenerate', 0],
  ['closeGenerateModal', 0],
  ['characterList.length', 2], // header 计数 + EmptyState? EmptyState 已下放 → 应为 1（header count）
];
for (const [token, max] of leftovers) {
  const n = host.split(token).length - 1;
  if (n > max) throw new Error(`宿主残留校验失败: "${token}" 出现 ${n} 次（上限 ${max}）`);
}
if (!host.includes('<CharacterGridPanel') || !host.includes('<CharacterGenerateModal')) {
  throw new Error('宿主未接入面板组件');
}

// 7) 连续空行归一（切段残留，ESLint no-multiple-empty-lines 兼容）
host = host.replace(/\n{3,}/g, '\n\n');

// ─────────────────────────── 落盘 ───────────────────────────
writeFileSync(GRID, gridVue);
writeFileSync(GEN, genVue);
writeFileSync(HOST, host);

const count = (p) => readFileSync(p, 'utf8').split('\n').length;
console.log(`OK
CharacterGridPanel.vue  ${count(GRID)} 行
CharacterGenerateModal.vue  ${count(GEN)} 行
CharactersView.vue  ${orig.length - 1} → ${count(HOST)} 行`);
