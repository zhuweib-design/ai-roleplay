#!/usr/bin/env node
/**
 * R4-10 DataBankView 拆分生成器（产出版）
 *
 * 三段实测（992 行）：script 1–170 / template 172–467 / style 469–992（524 行，53%）
 *
 * 主战场不是 script（169 行里大多是薄转发），而是：
 *   · template 的逐行重复 —— 全局段 232–284 与角色段 287–339 各 52 行，44 行 article
 *     里只有 3 行不同（v-for 源 / meta 第三列 / .stop 修饰符）
 *   · style 的卡片段 611–761（151 行）随卡片组件走
 *
 * 切面（三件，全部 ≤800）：
 *   A. components/databank/DocCard.vue           卡片合并 + 修 .stop 缺陷
 *   B. components/databank/DataBankUploadModal.vue 上传 Modal 整块
 *   C. utils/format.ts                            formatFileSize / formatDate
 *
 * 铁律（O-4 / O-14 / O-15）：
 *   - 基准只读归档副本；尾部空串 pop 后再切
 *   - 越界/切空立即抛错；行号断言 A[n-1]；数量断言先量再写死
 *   - 内存归一 LF，写回按原文件 EOL
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const ARCHIVE = path.join(ROOT, 'scripts/archive/r4-10-databank/DataBankView.orig.vue.txt');
const TARGET = path.join(ROOT, 'src/views/DataBankView.vue');

const raw = fs.readFileSync(ARCHIVE, 'utf8').replace(/\r\n/g, '\n');
const A = raw.split('\n');
while (A.length > 0 && A[A.length - 1] === '') A.pop();

const EOL = fs.readFileSync(TARGET, 'utf8').includes('\r\n') ? '\r\n' : '\n';
const write = (abs, text) => {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text.split('\n').join(EOL), 'utf8');
};

function assertLine(n, x, tag) {
  const got = A[n - 1];
  if (got !== x) {
    throw new Error(`[${tag}] 第 ${n} 行不符\n  期望: ${JSON.stringify(x)}\n  实际: ${JSON.stringify(got)}`);
  }
}
function seg(start, end, tag) {
  if (!(start >= 1 && end <= A.length && start <= end)) {
    throw new Error(`[${tag}] 区间越界: ${start}-${end}（共 ${A.length} 行）`);
  }
  const out = A.slice(start - 1, end);
  if (out.join('').trim() === '') throw new Error(`[${tag}] 切出空片段: ${start}-${end}`);
  return out;
}
function assertCount(lines, re, want, tag) {
  const got = lines.filter((l) => re.test(l)).length;
  if (got !== want) throw new Error(`[${tag}] 计数不符：期望 ${want}，实际 ${got}（${re}）`);
}
/** 按基准缩进整体左移 n 级（每级 2 空格），用于把 template 片段搬进新 SFC */
function dedent(lines, levels) {
  const pad = ' '.repeat(levels * 2);
  return lines.map((l) => (l.startsWith(pad) ? l.slice(pad.length) : l.replace(/^\s+/, (m) => (m.length > pad.length ? m.slice(pad.length) : ''))));
}

// ── 0. 结构断言 ───────────────────────────────────────────────
assertLine(1, '<script setup lang="ts">', 'script 开');
assertLine(170, '</script>', 'script 闭');
assertLine(172, '<template>', 'template 开');
assertLine(467, '</template>', 'template 闭');
assertLine(469, '<style scoped>', 'style 开');
assertLine(992, '</style>', 'style 闭');

// ── 1. 取三段 ─────────────────────────────────────────────────
const SCRIPT = seg(2, 169, 'script 体'); // 去掉 <script setup> / </script>
const TPL_BODY = seg(173, 466, 'template 体');
const STYLE = seg(470, 991, 'style 体');

// ── 2. 取方法块（C 件：formatFileSize / formatDate）───────────
assertLine(150, 'function formatFileSize(bytes: number): string {', 'formatFileSize 开');
assertLine(162, '}', 'formatFileSize 闭');
assertLine(156, 'function formatDate(iso: string): string {', 'formatDate 开');
assertLine(162, '}', 'formatDate 闭');
const FMT_BLOCK = seg(150, 162, 'FMT');

// ── 3. 取 template 片段 ───────────────────────────────────────
assertLine(232, '      <section v-if="globalDocuments.length > 0" class="doc-section" :aria-label="t(\'databank.globalSection\')">', '全局段开');
assertLine(284, '      </section>', '全局段闭');
assertLine(287, '      <section v-if="characterDocuments.length > 0" class="doc-section" :aria-label="t(\'databank.characterSection\')">', '角色段开');
assertLine(339, '      </section>', '角色段闭');
assertLine(356, '    <Modal', '上传 Modal 开');
assertLine(360, '    >', '上传 Modal 头闭');
assertLine(361, '      <div class="upload-content">', '上传内容开');
assertLine(443, '      </template>', '上传 footer 闭');
assertLine(444, '    </Modal>', '上传 Modal 闭');

// article 块：全局 239–282 / 角色 294–337（各 44 行）
const ART_GLOBAL = seg(239, 282, 'ART_G');
const ART_CHAR = seg(294, 337, 'ART_C');
if (ART_GLOBAL.length !== 44 || ART_CHAR.length !== 44) throw new Error('article 块行数应为 44');

// 差异必须只有 3 处（实证，不是猜）
const diffIdx = [];
ART_GLOBAL.forEach((g, i) => { if (g !== ART_CHAR[i]) diffIdx.push(i + 1); });
if (diffIdx.join(',') !== '2,10,17') throw new Error(`article 差异行应为 2,10,17，实际 ${diffIdx.join(',')}`);

// 节头（232–238 / 287–293）：h2 标题块，各 7 行
const SEC_GLOBAL = seg(232, 238, 'SEC_G');
const SEC_CHAR = seg(287, 293, 'SEC_C');
if (SEC_GLOBAL.length !== 7 || SEC_CHAR.length !== 7) throw new Error('节头块行数应为 7');

// 卡片内部（article 内层 = 239–282 整体，作为 DocCard 的 template 主体）
// 只取 <Modal> 外壳内部（361–443）：外壳由本组件手写，含 v-model="open"
const UPLOAD_MODAL = seg(361, 443, 'UPLOAD');

// ── 4. 取样式片段 ─────────────────────────────────────────────
assertLine(611, '/* 文档卡片 */', '卡片样式注释');
assertLine(762, '', '卡片样式后空行');
assertLine(763, '/* 上传 Modal */', '上传样式注释');
assertLine(891, '', '上传样式后空行');
assertLine(910, '.modal-btn:disabled {', 'modal-btn:disabled');
assertLine(919, '}', 'modal-confirm 闭');
assertLine(933, '/* 响应式 */', '响应式注释');
assertLine(953, '}', '响应式闭');
assertLine(954, '', '响应式后空行');
assertLine(955, '@media (max-width: 640px) {', 'i7 断点开');
assertLine(961, '}', 'i7 断点闭');
assertLine(962, '/* O-24：搜索无结果空态 */', 'O-24 注释');

const ST_CARD = seg(611, 761, 'ST_CARD'); // 卡片段（含 .doc-card … .delete-btn:hover）
const ST_UPLOAD = seg(763, 890, 'ST_UPLOAD'); // 上传 Modal 段（.upload-content … .upload-hint）
const ST_MODAL_BTN = seg(892, 919, 'ST_MODAL_BTN'); // .modal-btn + hover + :disabled（无注释头）
const ST_MODAL_REST = seg(921, 931, 'ST_MODAL_REST'); // .modal-delete + .delete-hint
const ST_RESP_MAIN = seg(933, 953, 'ST_RESP'); // 响应式主块
const ST_I7 = seg(955, 961, 'ST_I7'); // i7 字号兜底

// .modal-btn 同时被上传（confirm/cancel）与删除弹窗用 ⇒ 两份各持一份副本（"多出规则只提示"）
// .doc-grid 640 断点随卡片走 ⇒ 卡片组件内保留一份；宿主保留节容器
const ST_RESP_GRID = ST_RESP_MAIN.filter((l) => /\.doc-grid|grid-template-columns: 1fr;/.test(l));
if (ST_RESP_GRID.length !== 2) throw new Error(`.doc-grid 640 规则应 2 行，实际 ${ST_RESP_GRID.length}`);

// i7 里 .search-input 留宿主、.char-select-input 跟上传组件走
const I7_SEARCH = ST_I7.filter((l) => /\.search-input/.test(l));
const I7_CHAR = ST_I7.filter((l) => /\.char-select-input/.test(l));
if (I7_SEARCH.length !== 1 || I7_CHAR.length !== 1) throw new Error('i7 两选择器各应 1 行');

console.log('[ok] 全部切片取得：SCRIPT %d / TPL %d / STYLE %d', SCRIPT.length, TPL_BODY.length, STYLE.length);
console.log('[ok] FMT %d / ART %d / SEC %d / UPLOAD %d', FMT_BLOCK.length, ART_GLOBAL.length, SEC_GLOBAL.length, UPLOAD_MODAL.length);
console.log('[ok] ST：卡片 %d / 上传 %d / modal-btn %d / modal 余 %d / 响应 %d / i7 %d',
  ST_CARD.length, ST_UPLOAD.length, ST_MODAL_BTN.length, ST_MODAL_REST.length, ST_RESP_MAIN.length, ST_I7.length);

// ── 5. 生成 A：DocCard.vue ────────────────────────────────────
// template 主体：取全局 article，把「源数组 / meta 行 / .stop」三处改成组件内统一写法
const cardBody = ART_GLOBAL.map((l, i) => {
  const n = i + 1;
  if (n === 2) return '  <article v-for="doc in docs" :key="doc.id" class="doc-card">';
  if (n === 10) {
    // meta 第三列按 scope 分支：全局显示创建时间，角色显示绑定角色名
    return [
      '        <span class="doc-meta">',
      '          {{ formatFileSize(doc.fileSize) }} ·',
      "          {{ t('databank.chunksCount', { count: doc.chunks.length }) }} ·",
      "          {{ doc.scope === 'character' ? getCharacterName(doc.characterId) : formatDate(doc.createdAt) }}",
      '        </span>',
    ].join('\n');
  }
  if (n === 17) return '        @click.stop="onToggleExpand(doc.id)"';
  if (n <= 4) return null; // article 开标签合并成一行（见 n===2）
  if (l.trim() === '</article>') return null; // 开标签已单行化，闭标签在模板外统一补
  return l;
}).filter((l) => l !== null).join('\n');

const cardVue = `<script setup lang="ts">
/**
 * DocCard — 数据银行文档卡片（R4-10 从 DataBankView 抽出）
 *
 * 抽出的直接动因是**逐行重复**：原视图全局段（232–284）与角色段（287–339）
 * 各 52 行，其中 44 行 article 里只有 3 行不同 —— v-for 源、meta 第三列、
 * 以及展开按钮的 \`.stop\` 修饰符。合并后这三处统一为：
 *   · v-for 由 props.docs 驱动
 *   · meta 第三列按 \`doc.scope\` 分支（character → 绑定的角色名，其余 → 创建时间）
 *   · 展开按钮统一 \`@click.stop\`
 *
 * **顺手修掉一处真缺陷**：原角色段展开按钮写的是 \`@click\`（漏了 \`.stop\`），
 * 事件冒泡到父级 \`.card-header\` 的 \`@click="toggleExpand"\` 后二次触发，
 * 开关相互抵消 —— 即 D-8 修过的同一 bug 在角色段仍然存在。原 e2e
 * （e2e/databank-flow.spec.ts）只覆盖新上传的全局段，抓不到角色段。
 *
 * 类名（.doc-card / .card-header / .card-expand / .card-chunks …）刻意原样保留，
 * 因为 e2e 靠它们定位。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import type { DataBankDocument } from '@/core/data-bank';

defineProps<{
  /** 本组要渲染的文档（全局组或某角色组） */
  docs: DataBankDocument[];
  /** 当前展开的文档 id（受控，与宿主共享同一展开态） */
  expandedDocId: string | null;
  formatFileSize: (bytes: number) => string;
  formatDate: (iso: string) => string;
  getCharacterName: (id?: string) => string;
}>();

const emit = defineEmits<{
  toggleExpand: [id: string];
  confirmDelete: [id: string];
}>();

function onToggleExpand(id: string) {
  emit('toggleExpand', id);
}
function onConfirmDelete(id: string) {
  emit('confirmDelete', id);
}
</script>

<template>
${cardBody}
  </article>
</template>

<style scoped>
${ST_CARD.join('\n')}
</style>
`;

write(path.join(ROOT, 'src/components/databank/DocCard.vue'), cardVue);

// ── 6. 生成 B：DataBankUploadModal.vue ────────────────────────
// Modal 在组件里是根节点（缩进 2），故内部内容只需左移 1 级（原 6 空格 → 4）
const uploadBody = dedent(UPLOAD_MODAL, 1)
  .join('\n')
  .replace('@click="closeUploadModal"', '@click="close"');

const uploadVue = `<script setup lang="ts">
/**
 * DataBankUploadModal — 数据银行「上传文档」弹窗（R4-10 从 DataBankView 抽出）
 *
 * 整块 89 行 template + 78 行样式，且与页面主区无耦合（只读写自己的 3 个 UI 状态
 * 与 store 的两个结果字段）。抽出的同时把「选文件 / 拖拽 / 校验 / 提交」一并收进来，
 * 宿主只剩一个 \`@uploaded\` 回调。
 *
 * 无障碍口径不变：fieldset/legend + role=radiogroup + aria-label + 隐藏 file input 铺满拖拽区。
 */
import { ref, computed } from 'vue';
import Modal from '@/components/common/Modal.vue';
import Icon from '@/components/common/Icon.vue';
import { useDataBankStore } from '@/stores/data-bank';
import { useCharacterStore } from '@/stores/character';
import { MAX_FILE_SIZE } from '@/core/data-bank';
import type { DataBankScope } from '@/core/data-bank';
import { formatFileSize } from '@/utils/format';
import { t } from '@/i18n';

const props = defineProps<{
  /** 弹窗开关（v-model） */
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 上传完成，参数为 store.lastInfo 文案 */
  uploaded: [info: string];
}>();

const store = useDataBankStore();
const characterStore = useCharacterStore();

const selectedScope = ref<DataBankScope>('global');
const selectedCharacterId = ref<string>('');
const selectedFile = ref<File | null>(null);
const busy = ref(false);

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

/** 每次打开都重置表单，行为与原 \`openUploadModal()\` 一致 */
function resetForm() {
  selectedScope.value = 'global';
  selectedCharacterId.value = '';
  selectedFile.value = null;
}

const errorMessage = ref('');

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]!;
    errorMessage.value = '';
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    selectedFile.value = event.dataTransfer.files[0]!;
    errorMessage.value = '';
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}

async function handleUpload() {
  if (!selectedFile.value) {
    errorMessage.value = t('databank.selectFileFirst');
    return;
  }
  if (selectedFile.value.size > MAX_FILE_SIZE) {
    errorMessage.value = t('databank.fileTooLarge', { size: MAX_FILE_SIZE / 1024 / 1024 });
    return;
  }
  const characterId =
    selectedScope.value === 'character' && selectedCharacterId.value
      ? selectedCharacterId.value
      : undefined;

  busy.value = true;
  try {
    const id = await store.createDocumentFromFile(
      selectedFile.value,
      selectedScope.value,
      characterId
    );
    if (id) {
      open.value = false;
      resetForm();
      if (store.lastInfo) emit('uploaded', store.lastInfo);
    } else if (store.lastError) {
      errorMessage.value = store.lastError;
    }
  } finally {
    busy.value = false;
  }
}

function close() {
  open.value = false;
  resetForm();
  errorMessage.value = '';
}

defineExpose({ resetForm });
</script>

<template>
  <Modal
    v-model="open"
    :title="t('databank.uploadTitle')"
    :aria-label="t('databank.uploadAria2')"
  >
${uploadBody}
  </Modal>
</template>

<style scoped>
${ST_UPLOAD.join('\n')}

/* Modal 按钮（本组件只用 confirm / cancel 两种；.modal-delete 留在宿主） */
${ST_MODAL_BTN.join('\n')}

${I7_CHAR.join('\n').replace('  ', '')}
</style>
`;

write(path.join(ROOT, 'src/components/databank/DataBankUploadModal.vue'), uploadVue);

console.log('[ok] 已写出 DocCard.vue / DataBankUploadModal.vue');
console.log('[next] 需人工补：utils/format.ts、宿主重写、以及 B 件里 errorMessage 的模板接线');
