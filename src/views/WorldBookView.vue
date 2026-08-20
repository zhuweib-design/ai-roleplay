<script setup lang="ts">
/**
 * WorldBookView — 世界书管理页 (W4 · F06.1-F06.6)
 *
 * 功能：
 * - 左侧：Lorebook 列表 + 新建/导入/导出/删除
 * - 右侧：当前 Lorebook 的条目列表 + 条目详情编辑
 * - 条目编辑：标题、关键词、内容、激活策略、插入位置、深度、概率、逻辑、包含组
 * - F06.6 树状层级导航：展开/折叠子节点、拖拽调整层级关系
 * - 拖拽排序条目（使用 HTML5 draggable）
 * - 导入/导出兼容 SillyTavern 格式
 *
 * 无障碍：
 * - 语义化 main / aside / section
 * - aria-label 标注图标按钮
 * - 键盘可访问（Enter/Space 触发主操作）
 */
import { ref, computed, watch, useTemplateRef, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useLorebookStore } from '@/stores/lorebook';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import WorldBookEventsPanel from '@/components/worldbook/WorldBookEventsPanel.vue';
import FilterTabs, { type FilterTab } from '@/components/common/FilterTabs.vue';
import type {
  LorebookEntry,
  LorebookStrategy,
  LorebookInsertionPosition,
  LorebookLogic,
  WorldDescription,
  WorldType,
} from '@/core/lorebook';
import { MAX_WORLD_DESCRIPTION_LENGTH } from '@/core/lorebook';
import {
  WORLD_TEMPLATES,
  type WorldTemplateId,
} from '@core/world-generator';
import { useSettingsStore } from '@/stores/settings';
import { useCharacterStore } from '@/stores/character';
import { t } from '@/i18n';

const store = useLorebookStore();
const settingsStore = useSettingsStore();
const characterStore = useCharacterStore();
const router = useRouter();

// ── 需求7：世界书 → 角色 反向关系展示 ──

/** 当前世界书已绑定的角色列表（由角色 boundWorldBookIds 派生） */
const boundCharacters = computed(() => {
  if (!store.currentLorebookId) return [];
  const charIds = characterStore.getCharacterIdsByWorldBook(
    store.currentLorebookId
  );
  return characterStore.characters.filter((c) => charIds.includes(c.id));
});

// ── 需求1：分类 Tab 筛选（按世界书 scope） ──────────────────────────
/** scope 标签映射 */
const SCOPE_LABELS: Record<'global' | 'character' | 'persona' | 'chat', string> = {
  global: t('wb.scopeGlobal'),
  character: t('wb.scopeCharacter'),
  persona: t('wb.scopePersona'),
  chat: t('wb.scopeChat'),
};

/** 过滤 Tab，按 scope 聚合 + 显示数量徽标 */
const scopeFilterTabs = computed<FilterTab[]>(() => {
  const counts = store.scopeCounts;
  return (Object.keys(SCOPE_LABELS) as Array<keyof typeof SCOPE_LABELS>)
    .filter((s) => counts[s] > 0)
    .map((s) => ({
      value: s,
      label: SCOPE_LABELS[s],
      count: counts[s],
    }));
});

const filterScope = computed({
  get: () => store.filterScope,
  set: (v: string) => store.setFilterScope(v as 'global' | 'character' | 'persona' | 'chat' | ''),
});

/** 返回对话页 */
function goBack() {
  void router.push({ name: 'chat' });
}

// ── UI 状态 ──
const deleteTargetId = ref<string | null>(null);
const deleteModalOpen = ref(false);
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

// 迭代27 · F06.8: 世界生成 Modal 状态
const generateModalOpen = ref(false);
const selectedTemplateId = ref<WorldTemplateId>('fantasy');
const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);

// 拖拽状态
const draggingEntryId = ref<string | null>(null);
const dragOverEntryId = ref<string | null>(null);

// F06.6 树状导航状态
/** 展开的节点 ID 集合（默认全部展开） */
const expandedEntryIds = ref<Set<string>>(new Set());
/** 拖拽放置模式：'before' | 'after' 同级排序，'inside' 设为子节点 */
const dragDropMode = ref<'before' | 'after' | 'inside'>('before');

// 条目表单本地编辑缓冲（避免每次按键触发 store 更新）
const entryDraft = ref<LorebookEntry | null>(null);

// 当前展开/折叠的策略选项
const strategyOptions: { value: LorebookStrategy; label: string; desc: string }[] = [
  { value: 'keyword', label: t('wb.strategyKeyword'), desc: t('wb.strategyKeywordDesc') },
  { value: 'constant', label: t('wb.strategyConstant'), desc: t('wb.strategyConstantDesc') },
  { value: 'probability', label: t('wb.strategyProbability'), desc: t('wb.strategyProbabilityDesc') },
];

const positionOptions: { value: LorebookInsertionPosition; label: string }[] = [
  { value: 'beforeCharDefs', label: t('wb.positionBeforeChar') },
  { value: 'afterCharDefs', label: t('wb.positionAfterChar') },
  { value: 'atDepth', label: t('wb.positionAtDepth') },
];

const logicOptions: { value: LorebookLogic; label: string; desc: string }[] = [
  { value: 'AND_ANY', label: 'AND ANY', desc: t('wb.logicAny') },
  { value: 'AND_ALL', label: 'AND ALL', desc: t('wb.logicAll') },
  { value: 'NOT_ANY', label: 'NOT ANY', desc: t('wb.logicNotAny') },
  { value: 'NOT_ALL', label: 'NOT ALL', desc: t('wb.logicNotAll') },
];

// ── 计算属性 ──
const currentLorebook = computed(() => store.currentLorebook);
const currentEntry = computed(() => store.currentEntry);

// F06.6 树状导航计算属性
/**
 * 可见条目列表（过滤掉被折叠祖先的后代节点）
 * 算法：遍历扁平 entries，对每个节点检查其所有祖先是否都展开
 */
const visibleEntries = computed<LorebookEntry[]>(() => {
  const lb = currentLorebook.value;
  if (!lb) return [];
  const expanded = expandedEntryIds.value;
  const result: LorebookEntry[] = [];

  for (const entry of lb.entries) {
    // 收集该节点的祖先链
    let ancestorId = entry.parentId ?? null;
    let allAncestorsExpanded = true;
    const visited = new Set<string>([entry.id]);
    while (ancestorId !== null && !visited.has(ancestorId)) {
      visited.add(ancestorId);
      // 如果某个祖先被折叠，则该节点不可见
      if (!expanded.has(ancestorId)) {
        allAncestorsExpanded = false;
        break;
      }
      const ancestor = lb.entries.find((e) => e.id === ancestorId);
      if (!ancestor) break;
      ancestorId = ancestor.parentId ?? null;
    }
    if (allAncestorsExpanded) {
      result.push(entry);
    }
  }
  return result;
});

/**
 * 获取条目的层级深度（通过 parentId 链计算）
 */
function getEntryLevel(entryId: string): number {
  const lb = currentLorebook.value;
  if (!lb) return 0;
  let level = 0;
  const visited = new Set<string>([entryId]);
  let currentId = entryId;
  while (true) {
    const entry = lb.entries.find((e) => e.id === currentId);
    if (!entry) break;
    const parentId = entry.parentId ?? null;
    if (parentId === null || visited.has(parentId)) break;
    visited.add(parentId);
    level++;
    currentId = parentId;
    if (level > 10) break; // 防止异常循环
  }
  return level;
}

/**
 * 判断节点是否有子节点
 */
function hasChildren(entryId: string): boolean {
  const lb = currentLorebook.value;
  if (!lb) return false;
  return lb.entries.some((e) => (e.parentId ?? null) === entryId);
}

/**
 * 判断节点是否展开
 */
function isExpanded(entryId: string): boolean {
  return expandedEntryIds.value.has(entryId);
}

/**
 * 切换节点展开/折叠
 */
function toggleExpand(entryId: string): void {
  const set = new Set(expandedEntryIds.value);
  if (set.has(entryId)) {
    set.delete(entryId);
  } else {
    set.add(entryId);
  }
  expandedEntryIds.value = set;
}

/**
 * 全部展开
 */
function expandAll(): void {
  const lb = currentLorebook.value;
  if (!lb) return;
  expandedEntryIds.value = new Set(lb.entries.map((e) => e.id));
}

/**
 * 全部折叠
 */
function collapseAll(): void {
  expandedEntryIds.value = new Set();
}

/**
 * 层级标签
 */
function levelLabel(level: number): string {
  switch (level) {
    case 0: return 'World';
    case 1: return 'Region';
    case 2: return 'Sub-area';
    default: return `L${level}`;
  }
}

/**
 * 层级颜色（视觉区分）
 */
function levelColor(level: number): string {
  switch (level) {
    case 0: return 'var(--secondary)';
    case 1: return 'var(--primary)';
    case 2: return 'var(--tag-purple)';
    default: return 'var(--muted-foreground)';
  }
}

/**
 * 获取缩进像素值
 */
function getIndent(entryId: string): number {
  return getEntryLevel(entryId) * 16;
}

// ── 监听 store 错误/提示 ──
watch(
  () => store.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);
watch(
  () => store.lastInfo,
  (info) => {
    if (info) showToast('success', info);
  }
);

// 当选中条目变化时，重置本地草稿
watch(
  () => currentEntry.value?.id,
  () => {
    entryDraft.value = null;
  }
);

// F06.6 切换 Lorebook 时默认展开所有节点
watch(
  () => currentLorebook.value?.id,
  () => {
    const lb = currentLorebook.value;
    if (lb) {
      expandedEntryIds.value = new Set(lb.entries.map((e) => e.id));
    }
  },
  { immediate: true }
);

// ── Toast ──
function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// ── Lorebook 操作 ──
function createLorebook() {
  store.createLorebook();
}

function selectLorebook(id: string) {
  store.selectLorebook(id);
}

function deleteLorebook(id: string) {
  deleteTargetId.value = id;
  deleteModalOpen.value = true;
}

function confirmDelete() {
  if (deleteTargetId.value) {
    store.deleteLorebook(deleteTargetId.value);
  }
  deleteModalOpen.value = false;
  deleteTargetId.value = null;
}

function exportLorebook(id: string) {
  store.downloadLorebook(id);
}

// ── 迭代27 · F06.8: 世界观 AI 生成 ──

/** 打开生成 Modal */
function openGenerateModal() {
  if (!hasApiProfile.value) {
    showToast('error', t('wb.needApi'));
    return;
  }
  generateModalOpen.value = true;
}

/** 关闭生成 Modal */
function closeGenerateModal() {
  if (store.isGeneratingWorld) return; // 生成中禁止关闭
  generateModalOpen.value = false;
}

/** 选择模板 */
function selectTemplate(id: WorldTemplateId) {
  selectedTemplateId.value = id;
}

/** 执行 AI 生成新世界 */
async function confirmGenerate() {
  const lbId = await store.generateRandomWorldbook(selectedTemplateId.value);
  if (lbId) {
    generateModalOpen.value = false;
    showToast('success', store.lastInfo ?? t('wb.generated'));
  } else {
    showToast('error', store.lastError ?? t('wb.generateFailed'));
  }
}

/** 扩展当前 Lorebook */
async function extendCurrentWorldbook() {
  if (!store.currentLorebookId) {
    showToast('error', t('wb.selectWorldbook'));
    return;
  }
  if (!hasApiProfile.value) {
    showToast('error', t('wb.needApi'));
    return;
  }
  const added = await store.extendWorldbook(store.currentLorebookId);
  if (added > 0) {
    showToast('success', store.lastInfo ?? t('wb.extended', { count: added }));
  } else {
    showToast('error', store.lastError ?? t('wb.extendFailed'));
  }
}

function triggerFileInput() {
  fileInput.value?.click();
}

async function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  await store.importLorebookFile(file);
  input.value = '';
}

// ── Lorebook 元信息编辑 ──
function onNameInput(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  if (currentLorebook.value) {
    store.updateLorebook(currentLorebook.value.id, { name: value });
  }
}

// ── F06.7 整体世界描述 ──
const worldDescDraft = ref<WorldDescription | null>(null);

const worldTypeOptions: { value: WorldType; label: string }[] = [
  { value: 'fantasy', label: t('wb.worldTypeFantasy') },
  { value: 'scifi', label: t('wb.worldTypeScifi') },
  { value: 'modern', label: t('wb.worldTypeModern') },
  { value: 'historical', label: t('wb.worldTypeHistorical') },
  { value: 'other', label: t('wb.worldTypeOther') },
];

const worldDescContentLength = computed(
  () => worldDescDraft.value?.content.length ?? 0
);

// 当选中 Lorebook 变化时同步 worldDescription 到 draft
watch(
  () => currentLorebook.value?.id,
  () => {
    const wd = currentLorebook.value?.worldDescription;
    worldDescDraft.value = wd
      ? { ...wd, keys: [...wd.keys] }
      : null;
  },
  { immediate: true }
);

function addWorldDesc() {
  worldDescDraft.value = {
    name: '',
    type: 'fantasy',
    keys: [],
    content: '',
  };
  // 立即保存（建立空对象）
  if (currentLorebook.value) {
    store.updateWorldDescription(currentLorebook.value.id, worldDescDraft.value);
  }
}

function clearWorldDesc() {
  if (!currentLorebook.value) return;
  worldDescDraft.value = null;
  store.updateWorldDescription(currentLorebook.value.id, null);
}

function commitWorldDesc() {
  if (!currentLorebook.value || !worldDescDraft.value) return;
  store.updateWorldDescription(currentLorebook.value.id, worldDescDraft.value);
}

function onWorldNameInput(e: Event) {
  if (!worldDescDraft.value) return;
  worldDescDraft.value.name = (e.target as HTMLInputElement).value;
  commitWorldDesc();
}

function onWorldTypeChange(e: Event) {
  if (!worldDescDraft.value) return;
  worldDescDraft.value.type = (e.target as HTMLSelectElement).value as WorldType;
  commitWorldDesc();
}

function onWorldKeysInput(e: Event) {
  if (!worldDescDraft.value) return;
  const raw = (e.target as HTMLInputElement).value;
  worldDescDraft.value.keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  commitWorldDesc();
}

function onWorldContentInput(e: Event) {
  if (!worldDescDraft.value) return;
  worldDescDraft.value.content = (e.target as HTMLTextAreaElement).value;
  commitWorldDesc();
}

function worldKeysToString(keys: string[]): string {
  return keys.join(', ');
}

function onDescInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value;
  if (currentLorebook.value) {
    store.updateLorebook(currentLorebook.value.id, { description: value });
  }
}

// ── 条目操作 ──
function addEntry() {
  if (!currentLorebook.value) return;
  const id = store.addEntry(currentLorebook.value.id);
  if (id) {
    void nextTick(() => {
      const el = document.querySelector(`[data-entry-id="${id}"]`);
      (el as HTMLElement | null)?.focus();
    });
  }
}

function selectEntry(id: string) {
  if (currentLorebook.value) {
    store.selectEntry(id);
  }
}

function deleteEntry(entryId: string) {
  if (!currentLorebook.value) return;
  store.deleteEntry(currentLorebook.value.id, entryId);
}

function duplicateEntry(entryId: string) {
  if (!currentLorebook.value) return;
  store.duplicateEntry(currentLorebook.value.id, entryId);
}

function toggleEntry(entryId: string) {
  if (!currentLorebook.value) return;
  store.toggleEntry(currentLorebook.value.id, entryId);
}

// ── 拖拽排序（F06.6 扩展支持层级调整）──
function onDragStart(entryId: string, e: DragEvent) {
  draggingEntryId.value = entryId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entryId);
  }
}

function onDragOver(entryId: string, e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  dragOverEntryId.value = entryId;

  // 根据鼠标位置判断放置模式
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const height = rect.height;
  // 上 25%: before；下 25%: after；中间 50%: inside（设为子节点）
  if (offsetY < height * 0.25) {
    dragDropMode.value = 'before';
  } else if (offsetY > height * 0.75) {
    dragDropMode.value = 'after';
  } else {
    dragDropMode.value = 'inside';
  }
}

function onDragLeave() {
  dragOverEntryId.value = null;
}

function onDrop(targetEntryId: string, e: DragEvent) {
  e.preventDefault();
  const fromId = draggingEntryId.value;
  if (!fromId || fromId === targetEntryId) return;
  if (!currentLorebook.value) return;

  const mode = dragDropMode.value;

  if (mode === 'inside') {
    // F06.6 设为子节点
    const ok = store.setEntryParent(
      currentLorebook.value.id,
      fromId,
      targetEntryId
    );
    if (ok) {
      // 展开目标节点以显示新子节点
      const set = new Set(expandedEntryIds.value);
      set.add(targetEntryId);
      expandedEntryIds.value = set;
    }
  } else {
    // before/after: 同级排序
    // 如果拖拽节点和目标节点的 parentId 不同，先调整到同层级
    const lb = currentLorebook.value;
    const fromEntry = lb.entries.find((e) => e.id === fromId);
    const targetEntry = lb.entries.find((e) => e.id === targetEntryId);
    if (!fromEntry || !targetEntry) return;

    const fromParent = fromEntry.parentId ?? null;
    const targetParent = targetEntry.parentId ?? null;

    if (fromParent !== targetParent) {
      // 先调整到同层级
      const adjusted = store.setEntryParent(
        currentLorebook.value.id,
        fromId,
        targetParent
      );
      if (!adjusted) return;
    }

    // 执行同级排序
    store.moveEntry(currentLorebook.value.id, fromId, targetEntryId, mode);
  }

  draggingEntryId.value = null;
  dragOverEntryId.value = null;
}

function onDragEnd() {
  draggingEntryId.value = null;
  dragOverEntryId.value = null;
}

/**
 * F06.6 移到顶层（取消父节点关系）
 */
function moveToTopLevel(entryId: string): void {
  if (!currentLorebook.value) return;
  store.setEntryParent(currentLorebook.value.id, entryId, null);
}

/**
 * F06.6 同级上移
 */
function moveUpInLevel(entryId: string): void {
  if (!currentLorebook.value) return;
  store.reorderEntryInLevel(currentLorebook.value.id, entryId, 'up');
}

/**
 * F06.6 同级下移
 */
function moveDownInLevel(entryId: string): void {
  if (!currentLorebook.value) return;
  store.reorderEntryInLevel(currentLorebook.value.id, entryId, 'down');
}

// ── 条目表单编辑 ──
/**
 * 获取当前草稿（首次访问时从 store 复制一份）
 */
function draft(): LorebookEntry | null {
  if (!currentEntry.value) return null;
  if (!entryDraft.value || entryDraft.value.id !== currentEntry.value.id) {
    entryDraft.value = { ...currentEntry.value, keys: [...currentEntry.value.keys] };
  }
  return entryDraft.value;
}

function onEntryField<K extends keyof LorebookEntry>(
  field: K,
  value: LorebookEntry[K]
) {
  const d = draft();
  if (!d || !currentLorebook.value) return;
  d[field] = value;
  // 提交到 store
  store.updateEntry(currentLorebook.value.id, d.id, { [field]: value });
}

function onTitleInput(e: Event) {
  onEntryField('title', (e.target as HTMLInputElement).value);
}

function onContentInput(e: Event) {
  onEntryField('content', (e.target as HTMLTextAreaElement).value);
}

function onKeysInput(e: Event) {
  // 关键词以逗号分隔
  const raw = (e.target as HTMLInputElement).value;
  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  onEntryField('keys', keys);
}

function keysToString(keys: string[]): string {
  return keys.join(', ');
}

function onStrategyChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value as LorebookStrategy;
  onEntryField('strategy', value);
}

function onPositionChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value as LorebookInsertionPosition;
  onEntryField('insertionPosition', value);
}

function onLogicChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value as LorebookLogic;
  onEntryField('logic', value);
}

function onProbabilityInput(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(value)) onEntryField('probability', value);
}

function onOrderInput(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(value)) onEntryField('insertionOrder', value);
}

function onDepthInput(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(value)) onEntryField('depth', value);
}

function onGroupInput(e: Event) {
  onEntryField('group', (e.target as HTMLInputElement).value);
}

// ── F17.3 随机事件开关 ──

function onRandomEventEnabledChange(e: Event) {
  const enabled = (e.target as HTMLInputElement).checked;
  onEntryField('randomEventEnabled', enabled);
  // 首次开启时初始化默认概率
  if (enabled) {
    const d = draft();
    if (d && (d.randomEventProbability === undefined || d.randomEventProbability === null)) {
      onEntryField('randomEventProbability', 10);
    }
  }
}

function onRandomEventProbabilityInput(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(value)) onEntryField('randomEventProbability', value);
}

function keysPreview(keys: string[]): string {
  if (keys.length === 0) return t('wb.noKeywords');
  if (keys.length <= 2) return keys.join('、');
  return `${keys.slice(0, 2).join('、')} +${keys.length - 2}`;
}

function strategyLabel(s: LorebookStrategy): string {
  return strategyOptions.find((o) => o.value === s)?.label ?? s;
}

</script>

<template>
  <div class="worldbook-view">
    <!-- 顶部 Header -->
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn back"
          :aria-label="t('wb.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">{{ t('wb.back') }}</span>
        </button>
        <h1>{{ t('wb.title') }}</h1>
        <span class="header-count">{{ t('wb.count', { count: store.lorebooks.length }) }}</span>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-btn generate-btn"
          :aria-label="t('wb.aiGenerateAria')"
          :disabled="store.isGeneratingWorld"
          @click="openGenerateModal"
        >
          <Icon name="star" :size="16" />
          <span class="btn-label">{{ t('wb.aiGenerate') }}</span>
        </button>
        <button
          type="button"
          class="header-btn import-btn"
          :aria-label="t('wb.importAria')"
          @click="triggerFileInput"
        >
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('wb.import') }}</span>
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden-file-input"
          aria-hidden="true"
          tabindex="-1"
          @change="handleFileSelected"
        />
        <button
          type="button"
          class="header-btn new-btn"
          :aria-label="t('wb.newAria')"
          @click="createLorebook"
        >
          <Icon name="plus" :size="16" />
          <span class="btn-label">{{ t('wb.new') }}</span>
        </button>
      </div>
    </header>

    <!-- 主体：左 Lorebook 列表 + 右编辑器 -->
    <div class="worldbook-body">
      <!-- 左侧 Lorebook 列表 -->
      <aside class="lorebook-list-panel tk-scroll" :aria-label="t('wb.listAria')">
        <div class="search-box">
          <input
            type="text"
            v-model="store.searchQuery"
            :placeholder="t('wb.searchPlaceholder')"
            :aria-label="t('wb.searchAria')"
            class="search-input"
          />
        </div>

        <!-- 需求1：按 scope 筛选分类 Tab -->
        <FilterTabs
          v-if="scopeFilterTabs.length > 0"
          v-model="filterScope"
          :tabs="scopeFilterTabs"
          :label="t('wb.filterLabel')"
          :all-label="t('wb.filterAll')"
          :all-value="''"
          :all-count="store.lorebooks.length"
        />

        <ul class="lorebook-list" role="list">
          <li
            v-for="lb in store.filteredLorebooks"
            :key="lb.id"
            role="listitem"
          >
            <button
              type="button"
              class="lorebook-item"
              :class="{ active: lb.id === store.currentLorebookId }"
              :aria-current="lb.id === store.currentLorebookId ? 'true' : undefined"
              @click="selectLorebook(lb.id)"
            >
              <div class="item-main">
                <span class="item-name">{{ lb.name }}</span>
                <span class="item-desc">{{ lb.description || t('wb.noDesc') }}</span>
              </div>
              <span class="item-meta">{{ t('wb.entryCount', { count: lb.entries.length }) }}</span>
            </button>
          </li>
          <li v-if="store.filteredLorebooks.length === 0" class="empty-state">
            <p>{{ t('wb.emptyList') }}</p>
            <button type="button" class="link-btn" @click="createLorebook">
              {{ t('wb.createFirst') }}
            </button>
          </li>
        </ul>
      </aside>

      <!-- 右侧 Lorebook 编辑器 -->
      <main class="lorebook-editor-panel" id="main-content" tabindex="-1">
        <div v-if="!currentLorebook" class="empty-editor">
          <Icon name="compass" :size="48" />
          <p>{{ t('wb.emptyEditor') }}</p>
          <button type="button" class="primary-btn" @click="createLorebook">
            {{ t('wb.createNew') }}
          </button>
        </div>

        <div v-else class="editor-content">
          <!-- Lorebook 元信息 -->
          <section class="lorebook-meta" :aria-label="t('wb.metaAria')">
            <div class="meta-row">
              <label :for="`lb-name-${currentLorebook.id}`" class="meta-label">
                {{ t('wb.nameLabel') }}
              </label>
              <input
                :id="`lb-name-${currentLorebook.id}`"
                type="text"
                class="meta-input"
                :value="currentLorebook.name"
                @input="onNameInput"
                :placeholder="t('wb.namePlaceholder')"
              />
            </div>
            <div class="meta-row">
              <label :for="`lb-desc-${currentLorebook.id}`" class="meta-label">
                {{ t('wb.descLabel') }}
              </label>
              <textarea
                :id="`lb-desc-${currentLorebook.id}`"
                class="meta-textarea"
                :value="currentLorebook.description"
                @input="onDescInput"
                :placeholder="t('wb.descPlaceholder')"
                rows="2"
              />
            </div>
            <div class="meta-actions">
              <button
                type="button"
                class="action-btn extend"
                :disabled="store.isGeneratingWorld"
                @click="extendCurrentWorldbook"
              >
                <Icon name="star" :size="14" />
                <span>{{ store.isGeneratingWorld ? t('wb.generating') : t('wb.aiExtend') }}</span>
              </button>
              <button
                type="button"
                class="action-btn export"
                @click="exportLorebook(currentLorebook.id)"
              >
                <Icon name="download" :size="14" />
                <span>{{ t('wb.exportJson') }}</span>
              </button>
              <button
                type="button"
                class="action-btn delete"
                @click="deleteLorebook(currentLorebook.id)"
              >
                <Icon name="trash-2" :size="14" />
                <span>{{ t('wb.deleteLorebook') }}</span>
              </button>
            </div>
          </section>

          <!-- 需求7：已绑定角色展示（反向关系） -->
          <section class="bound-chars-section" :aria-label="t('wb.boundCharsAria')">
            <header class="bound-chars-header">
              <h2>
                <Icon name="users" :size="14" aria-hidden="true" />
                <span>{{ t('wb.boundCharsTitle') }}</span>
              </h2>
              <span class="bound-chars-count">{{ boundCharacters.length }}</span>
            </header>
            <p class="bound-chars-hint">
              {{ t('wb.boundCharsHint') }}
            </p>
            <ul v-if="boundCharacters.length" class="bound-chars-list" role="list">
              <li
                v-for="char in boundCharacters"
                :key="char.id"
                class="bound-char-item"
                role="listitem"
              >
                <Avatar :character="char" :size="28" />
                <span class="bound-char-name">{{ char.name }}</span>
                <span
                  v-if="char.tags.length"
                  class="bound-char-tags"
                >{{ char.tags.slice(0, 2).join(' · ') }}</span>
              </li>
            </ul>
            <p v-else class="bound-chars-empty">
              {{ t('wb.boundCharsEmpty') }}
            </p>
          </section>

          <!-- F06.7 整体世界描述 -->
          <section class="world-desc-section" :aria-label="t('wb.worldDescAria')">
            <header class="world-desc-header">
              <h2>
                <Icon name="globe" :size="14" />
                <span>{{ t('wb.worldDescTitle') }}</span>
              </h2>
              <span class="world-desc-tag">{{ t('wb.worldDescTag') }}</span>
            </header>

            <div v-if="!worldDescDraft" class="world-desc-empty">
              <p>{{ t('wb.worldDescEmpty') }}</p>
              <button
                type="button"
                class="action-btn add-world-btn"
                @click="addWorldDesc"
              >
                <Icon name="plus" :size="14" />
                <span>{{ t('wb.addWorldDesc') }}</span>
              </button>
            </div>

            <div v-else class="world-desc-form">
              <div class="world-desc-row">
                <div class="world-desc-cell">
                  <label class="form-label" :for="`wd-name-${currentLorebook.id}`">
                    {{ t('wb.worldName') }}
                  </label>
                  <input
                    :id="`wd-name-${currentLorebook.id}`"
                    type="text"
                    class="form-input"
                    :value="worldDescDraft.name"
                    @input="onWorldNameInput"
                    :placeholder="t('wb.worldNamePlaceholder')"
                    :maxlength="100"
                  />
                </div>
                <div class="world-desc-cell">
                  <label class="form-label" :for="`wd-type-${currentLorebook.id}`">
                    {{ t('wb.worldType') }}
                  </label>
                  <select
                    :id="`wd-type-${currentLorebook.id}`"
                    class="form-select"
                    :value="worldDescDraft.type"
                    @change="onWorldTypeChange"
                  >
                    <option
                      v-for="opt in worldTypeOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="world-desc-row">
                <label class="form-label" :for="`wd-keys-${currentLorebook.id}`">
                  {{ t('wb.worldKeys') }}
                </label>
                <input
                  :id="`wd-keys-${currentLorebook.id}`"
                  type="text"
                  class="form-input"
                  :value="worldKeysToString(worldDescDraft.keys)"
                  @input="onWorldKeysInput"
                  :placeholder="t('wb.worldKeysPlaceholder')"
                />
              </div>

              <div class="world-desc-row">
                <label class="form-label" :for="`wd-content-${currentLorebook.id}`">
                  {{ t('wb.worldContent') }}
                </label>
                <textarea
                  :id="`wd-content-${currentLorebook.id}`"
                  class="form-textarea world-desc-content"
                  :value="worldDescDraft.content"
                  @input="onWorldContentInput"
                  :placeholder="t('wb.worldContentPlaceholder')"
                  rows="5"
                />
                <span class="char-count">
                  {{ worldDescContentLength }} / {{ MAX_WORLD_DESCRIPTION_LENGTH }}
                </span>
              </div>

              <div class="world-desc-actions">
                <button
                  type="button"
                  class="action-btn delete"
                  @click="clearWorldDesc"
                >
                  <Icon name="trash-2" :size="14" />
                  <span>{{ t('wb.clearWorldDesc') }}</span>
                </button>
              </div>
            </div>
          </section>

      <WorldBookEventsPanel />

          <!-- 条目列表 + 条目编辑器 -->
          <div class="entries-layout">
            <!-- 条目列表（F06.6 树状导航）-->
            <aside class="entries-list-panel" :aria-label="t('wb.editorAria')">
              <div class="entries-header">
                <h2>{{ t('wb.entriesTitle', { count: currentLorebook.entries.length }) }}</h2>
                <div class="entries-header-actions">
                  <button
                    type="button"
                    class="tree-action-btn"
                    :aria-label="t('wb.expandAll')"
                    :title="t('wb.expandAll')"
                    @click="expandAll"
                  >
                    <Icon name="chevron-down" :size="14" />
                  </button>
                  <button
                    type="button"
                    class="tree-action-btn"
                    :aria-label="t('wb.collapseAll')"
                    :title="t('wb.collapseAll')"
                    @click="collapseAll"
                  >
                    <Icon name="chevron-up" :size="14" />
                  </button>
                  <button
                    type="button"
                    class="add-entry-btn"
                    :aria-label="t('wb.addEntry')"
                    @click="addEntry"
                  >
                    <Icon name="plus" :size="14" />
                    <span>{{ t('wb.add') }}</span>
                  </button>
                </div>
              </div>
              <div
                class="entries-list tk-scroll"
                :role="currentLorebook.entries.length > 0 ? 'tree' : undefined"
                :aria-label="t('wb.entriesTreeAria')"
              >
                <div
                  v-for="entry in visibleEntries"
                  :key="entry.id"
                  role="treeitem"
                  :data-entry-id="entry.id"
                  :aria-expanded="hasChildren(entry.id) ? isExpanded(entry.id) : undefined"
                  :aria-level="getEntryLevel(entry.id) + 1"
                  class="entry-tree-item"
                >
                  <div
                    class="entry-item"
                    :class="{
                      active: entry.id === store.currentEntryId,
                      'drag-over': entry.id === dragOverEntryId,
                      'drag-over-before': entry.id === dragOverEntryId && dragDropMode === 'before',
                      'drag-over-after': entry.id === dragOverEntryId && dragDropMode === 'after',
                      'drag-over-inside': entry.id === dragOverEntryId && dragDropMode === 'inside',
                      'dragging': entry.id === draggingEntryId,
                      'disabled': !entry.enabled,
                    }"
                    :style="{ paddingLeft: `${8 + getIndent(entry.id)}px` }"
                    tabindex="0"
                    draggable="true"
                    :aria-label="t('wb.entryAria', { title: entry.title || t('wb.unnamedEntry'), strategy: strategyLabel(entry.strategy), level: levelLabel(getEntryLevel(entry.id)) })"
                    :aria-current="entry.id === store.currentEntryId ? 'true' : undefined"
                    @click="selectEntry(entry.id)"
                    @keydown.enter="selectEntry(entry.id)"
                    @keydown.space.prevent="selectEntry(entry.id)"
                    @dragstart="onDragStart(entry.id, $event)"
                    @dragover="onDragOver(entry.id, $event)"
                    @dragleave="onDragLeave"
                    @drop="onDrop(entry.id, $event)"
                    @dragend="onDragEnd"
                  >
                    <!-- 展开/折叠按钮 -->
                    <button
                      v-if="hasChildren(entry.id)"
                      type="button"
                      class="expand-toggle"
                      :aria-label="isExpanded(entry.id) ? t('wb.collapseChildren') : t('wb.expandChildren')"
                      :aria-expanded="isExpanded(entry.id)"
                      @click.stop="toggleExpand(entry.id)"
                    >
                      <Icon
                        :name="isExpanded(entry.id) ? 'chevron-down' : 'chevron-right'"
                        :size="12"
                      />
                    </button>
                    <span v-else class="expand-spacer" aria-hidden="true"></span>

                    <!-- 层级标签 -->
                    <span
                      class="level-badge"
                      :style="{ color: levelColor(getEntryLevel(entry.id)) }"
                      :title="t('wb.levelTitle', { level: levelLabel(getEntryLevel(entry.id)) })"
                    >
                      {{ levelLabel(getEntryLevel(entry.id)).charAt(0) }}
                    </span>

                    <button
                      type="button"
                      class="entry-toggle"
                      :class="{ active: entry.enabled }"
                      :aria-label="entry.enabled ? t('wb.disableEntry') : t('wb.enableEntry')"
                      :aria-pressed="entry.enabled"
                      @click.stop="toggleEntry(entry.id)"
                    >
                      <Icon :name="entry.enabled ? 'eye' : 'eye-off'" :size="12" />
                    </button>
                    <div class="entry-content">
                      <div class="entry-title">{{ entry.title || t('wb.unnamedEntry') }}</div>
                      <div class="entry-keys">{{ keysPreview(entry.keys) }}</div>
                    </div>
                    <span class="entry-strategy">{{ strategyLabel(entry.strategy) }}</span>
                  </div>
                </div>
                <div v-if="currentLorebook.entries.length === 0" class="empty-entries">
                  <p>{{ t('wb.emptyEntries') }}</p>
                  <button type="button" class="link-btn" @click="addEntry">
                    {{ t('wb.addFirstEntry') }}
                  </button>
                </div>
              </div>
              <div class="entries-footer">
                <p class="drag-hint">{{ t('wb.dragHint') }}</p>
              </div>
            </aside>

            <!-- 条目编辑器 -->
            <section class="entry-editor-panel" :aria-label="t('wb.editorAria')">
              <div v-if="!currentEntry" class="empty-entry-editor">
                <Icon name="file" :size="36" />
                <p>{{ t('wb.emptyEntryEditor') }}</p>
              </div>

              <form v-else class="entry-form" @submit.prevent>
                <div class="entry-form-header">
                  <h3>
                    {{ currentEntry.title || t('wb.unnamedEntry') }}
                    <span
                      class="form-level-badge"
                      :style="{ color: levelColor(getEntryLevel(currentEntry.id)) }"
                    >
                      {{ levelLabel(getEntryLevel(currentEntry.id)) }}
                    </span>
                  </h3>
                  <div class="entry-form-actions">
                    <button
                      type="button"
                      class="action-btn"
                      :aria-label="t('wb.moveToTop')"
                      :title="t('wb.moveToTopTitle')"
                      :disabled="getEntryLevel(currentEntry.id) === 0"
                      @click="moveToTopLevel(currentEntry.id)"
                    >
                      <Icon name="chevron-up" :size="14" />
                      <span>{{ t('wb.top') }}</span>
                    </button>
                    <button
                      type="button"
                      class="action-btn"
                      :aria-label="t('wb.moveUp')"
                      :title="t('wb.moveUp')"
                      @click="moveUpInLevel(currentEntry.id)"
                    >
                      <Icon name="arrow-up" :size="14" />
                    </button>
                    <button
                      type="button"
                      class="action-btn"
                      :aria-label="t('wb.moveDown')"
                      :title="t('wb.moveDown')"
                      @click="moveDownInLevel(currentEntry.id)"
                    >
                      <Icon name="arrow-down" :size="14" />
                    </button>
                    <button
                      type="button"
                      class="action-btn duplicate"
                      :aria-label="t('wb.duplicateEntry')"
                      @click="duplicateEntry(currentEntry.id)"
                    >
                      <Icon name="copy" :size="14" />
                      <span>{{ t('wb.duplicate') }}</span>
                    </button>
                    <button
                      type="button"
                      class="action-btn delete"
                      :aria-label="t('wb.deleteEntry')"
                      @click="deleteEntry(currentEntry.id)"
                    >
                      <Icon name="trash-2" :size="14" />
                      <span>{{ t('wb.delete') }}</span>
                    </button>
                  </div>
                </div>

                <div class="form-grid">
                  <div class="form-row">
                    <label class="form-label" :for="`entry-title-${currentEntry.id}`">
                      {{ t('wb.titleLabel') }}
                    </label>
                    <input
                      :id="`entry-title-${currentEntry.id}`"
                      type="text"
                      class="form-input"
                      :value="currentEntry.title"
                      @input="onTitleInput"
                      :placeholder="t('wb.titlePlaceholder')"
                    />
                  </div>

                  <div class="form-row">
                    <label class="form-label" :for="`entry-keys-${currentEntry.id}`">
                      {{ t('wb.keysLabel') }}
                    </label>
                    <input
                      :id="`entry-keys-${currentEntry.id}`"
                      type="text"
                      class="form-input"
                      :value="keysToString(currentEntry.keys)"
                      @input="onKeysInput"
                      :placeholder="t('wb.keysPlaceholder')"
                    />
                  </div>

                  <div class="form-row">
                    <label class="form-label" :for="`entry-content-${currentEntry.id}`">
                      {{ t('wb.contentLabel') }}
                    </label>
                    <textarea
                      :id="`entry-content-${currentEntry.id}`"
                      class="form-textarea"
                      :value="currentEntry.content"
                      @input="onContentInput"
                      :placeholder="t('wb.contentPlaceholder')"
                      rows="6"
                    />
                    <span class="char-count">
                      {{ currentEntry.content.length }} / 20000
                    </span>
                  </div>

                  <div class="form-row form-row-3col">
                    <div class="form-cell">
                      <label class="form-label" :for="`entry-strategy-${currentEntry.id}`">
                        {{ t('wb.strategyLabel') }}
                      </label>
                      <select
                        :id="`entry-strategy-${currentEntry.id}`"
                        class="form-select"
                        :value="currentEntry.strategy"
                        @change="onStrategyChange"
                      >
                        <option
                          v-for="opt in strategyOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>

                    <div class="form-cell">
                      <label class="form-label" :for="`entry-position-${currentEntry.id}`">
                        {{ t('wb.positionLabel') }}
                      </label>
                      <select
                        :id="`entry-position-${currentEntry.id}`"
                        class="form-select"
                        :value="currentEntry.insertionPosition"
                        @change="onPositionChange"
                      >
                        <option
                          v-for="opt in positionOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>

                    <div class="form-cell">
                      <label class="form-label" :for="`entry-logic-${currentEntry.id}`">
                        {{ t('wb.logicLabel') }}
                      </label>
                      <select
                        :id="`entry-logic-${currentEntry.id}`"
                        class="form-select"
                        :value="currentEntry.logic"
                        @change="onLogicChange"
                      >
                        <option
                          v-for="opt in logicOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div class="form-row form-row-4col">
                    <div class="form-cell">
                      <label class="form-label" :for="`entry-prob-${currentEntry.id}`">
                        {{ t('wb.probability') }}
                      </label>
                      <input
                        :id="`entry-prob-${currentEntry.id}`"
                        type="number"
                        min="0"
                        max="100"
                        class="form-input"
                        :value="currentEntry.probability"
                        @input="onProbabilityInput"
                        :disabled="currentEntry.strategy !== 'probability'"
                      />
                    </div>

                    <div class="form-cell">
                      <label class="form-label" :for="`entry-order-${currentEntry.id}`">
                        {{ t('wb.insertionOrder') }}
                      </label>
                      <input
                        :id="`entry-order-${currentEntry.id}`"
                        type="number"
                        min="0"
                        class="form-input"
                        :value="currentEntry.insertionOrder"
                        @input="onOrderInput"
                      />
                    </div>

                    <div class="form-cell">
                      <label class="form-label" :for="`entry-depth-${currentEntry.id}`">
                        {{ t('wb.depth') }}
                      </label>
                      <input
                        :id="`entry-depth-${currentEntry.id}`"
                        type="number"
                        min="0"
                        class="form-input"
                        :value="currentEntry.depth"
                        @input="onDepthInput"
                        :disabled="currentEntry.insertionPosition !== 'atDepth'"
                      />
                    </div>

                    <div class="form-cell">
                      <label class="form-label" :for="`entry-group-${currentEntry.id}`">
                        {{ t('wb.group') }}
                      </label>
                      <input
                        :id="`entry-group-${currentEntry.id}`"
                        type="text"
                        class="form-input"
                        :value="currentEntry.group"
                        @input="onGroupInput"
                        :placeholder="t('wb.groupPlaceholder')"
                      />
                    </div>
                  </div>

                  <!-- F17.3 随机事件开关（仅 hierarchyLevel >= 1 时显示） -->
                  <div
                    v-if="currentEntry && (currentEntry.hierarchyLevel ?? 0) >= 1"
                    class="form-row random-event-row"
                  >
                    <div class="form-cell">
                      <label class="form-label" :for="`entry-rand-${currentEntry.id}`">
                        {{ t('wb.randomEvent') }}
                      </label>
                      <label class="checkbox-label">
                        <input
                          :id="`entry-rand-${currentEntry.id}`"
                          type="checkbox"
                          :checked="currentEntry.randomEventEnabled ?? false"
                          @change="onRandomEventEnabledChange"
                        />
                        <span>{{ t('wb.randomEventEnable') }}</span>
                      </label>
                      <span class="form-hint">
                        {{ t('wb.randomEventHint') }}
                      </span>
                    </div>
                    <div
                      v-if="currentEntry.randomEventEnabled"
                      class="form-cell"
                    >
                      <label class="form-label" :for="`entry-rand-prob-${currentEntry.id}`">
                        {{ t('wb.randomEventProb', { percent: currentEntry.randomEventProbability ?? 10 }) }}
                      </label>
                      <input
                        :id="`entry-rand-prob-${currentEntry.id}`"
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        :value="currentEntry.randomEventProbability ?? 10"
                        @input="onRandomEventProbabilityInput"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>

    <!-- 删除确认对话框 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('wb.deleteTitle')"
    >
      <p>{{ t('wb.deleteConfirm') }}</p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          {{ t('wb.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm modal-danger"
          @click="confirmDelete"
        >
          {{ t('wb.delete') }}
        </button>
      </template>
    </Modal>

    <!-- F06.8 AI 生成世界观 Modal -->
    <Modal
      v-model="generateModalOpen"
      :title="t('wb.generateTitle')"
    >
      <div class="generate-modal-body">
        <p class="generate-hint">
          {{ t('wb.generateHint') }}
        </p>

        <div
          class="template-grid"
          role="radiogroup"
          :aria-label="t('wb.generateTypeAria')"
        >
          <button
            v-for="tpl in WORLD_TEMPLATES"
            :key="tpl.id"
            type="button"
            class="template-card"
            role="radio"
            :aria-checked="selectedTemplateId === tpl.id"
            :class="{ active: selectedTemplateId === tpl.id }"
            @click="selectTemplate(tpl.id)"
          >
            <span class="template-label">{{ tpl.label }}</span>
            <span class="template-desc">{{ tpl.description }}</span>
          </button>
        </div>

        <div v-if="store.isGeneratingWorld" class="generating-state" role="status" aria-live="polite">
          <Icon name="refresh-cw" :size="16" />
          <span>{{ t('wb.generatingWorld') }}</span>
        </div>

        <div v-if="store.lastError && store.isGeneratingWorld === false && generateModalOpen" class="generate-error" role="alert">
          {{ store.lastError }}
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          :disabled="store.isGeneratingWorld"
          @click="closeGenerateModal"
        >
          {{ t('wb.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          :disabled="store.isGeneratingWorld"
          @click="confirmGenerate"
        >
          {{ store.isGeneratingWorld ? t('wb.generating') : t('wb.generateBtn') }}
        </button>
      </template>
    </Modal>

    <!-- Toast 反馈 -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.worldbook-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
  color: var(--foreground);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground);
}

.header-count {
  font-size: 12px;
  color: var(--muted-foreground);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.header-btn:hover {
  background: var(--card-elevated);
  border-color: var(--border);
}

.header-btn.back {
  background: none;
  border-color: transparent;
}

.header-btn.new-btn {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.header-btn.new-btn:hover {
  opacity: 0.9;
}

.header-btn.generate-btn {
  background: var(--accent-orange);
  color: var(--on-accent);
  border-color: var(--accent-orange);
}

.header-btn.generate-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.header-btn.generate-btn:disabled,
.action-btn.extend:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hidden-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.worldbook-body {
  flex: 1;
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 0;
  overflow: hidden;
}

/* 左侧 Lorebook 列表 */
.lorebook-list-panel {
  border-right: 1px solid var(--border);
  background: var(--card);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.search-box {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.search-input:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.lorebook-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.empty-state {
  padding: 24px 12px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 13px;
}

.empty-state p {
  margin: 0 0 8px 0;
}

.link-btn {
  background: none;
  border: none;
  color: var(--secondary);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.link-btn:hover {
  color: var(--primary-fg);
}

.lorebook-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background-color 0.15s;
}

.lorebook-item:hover {
  background: var(--card-elevated);
}

.lorebook-item.active {
  background: var(--card-elevated);
  border-left-color: var(--primary);
}

.lorebook-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  font-size: 11px;
  color: var(--muted-foreground);
  flex-shrink: 0;
}

/* 右侧编辑器 */
.lorebook-editor-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  outline: none;
}

.empty-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted-foreground);
  font-size: 14px;
}

.empty-editor p {
  margin: 0;
}

.primary-btn {
  padding: 8px 16px;
  background: var(--primary);
  color: var(--on-primary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}

.primary-btn:hover {
  opacity: 0.9;
}

.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* Lorebook 元信息 */
.lorebook-meta {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.meta-label {
  font-size: 12px;
  color: var(--muted-foreground);
  width: 48px;
  flex-shrink: 0;
}

.meta-input,
.meta-textarea {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.meta-input:focus,
.meta-textarea:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.meta-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* 需求7：已绑定角色展示 */
.bound-chars-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.bound-chars-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.bound-chars-header h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.bound-chars-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--accent-blue-bg, rgba(96, 165, 250, 0.15));
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 600;
}

.bound-chars-hint {
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.bound-chars-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bound-char-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg);
  transition: border-color 0.15s;
}

.bound-char-item:hover {
  border-color: var(--primary);
}

.bound-char-name {
  font-weight: 500;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bound-char-tags {
  color: var(--muted-foreground);
  font-size: 12px;
  flex-shrink: 0;
}

.bound-chars-empty {
  margin: 8px 0;
  padding: 12px;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  color: var(--muted-foreground);
  font-size: 13px;
  text-align: center;
}

/* F06.7 整体世界描述 */
.world-desc-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.world-desc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.world-desc-header h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--foreground);
}

.world-desc-tag {
  font-size: 10px;
  color: var(--secondary);
  padding: 2px 6px;
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.world-desc-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.world-desc-empty p {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.add-world-btn {
  color: var(--secondary);
  border-color: var(--border);
}

.world-desc-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.world-desc-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.world-desc-row:first-child {
  flex-direction: row;
  gap: 12px;
}

.world-desc-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.world-desc-content {
  min-height: 80px;
}

.world-desc-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

.action-btn:hover {
  background: var(--card-elevated);
}

.action-btn.delete {
  color: var(--error);
  border-color: var(--error);
}

.action-btn.delete:hover {
  background: var(--error);
  color: var(--on-accent);
}

.action-btn.extend {
  color: var(--accent-orange);
  border-color: var(--accent-orange);
}

.action-btn.extend:hover:not(:disabled) {
  background: var(--accent-orange);
  color: var(--on-accent);
}

.entries-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.entries-header h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.entries-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tree-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--muted-foreground);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.tree-action-btn:hover {
  background: var(--card-elevated);
  color: var(--foreground);
}

.add-entry-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--primary);
  color: var(--on-primary);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

.add-entry-btn:hover {
  opacity: 0.9;
}

.entries-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.entry-tree-item {
  display: block;
}

.empty-entries {
  padding: 24px 12px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 12px;
}

.empty-entries p {
  margin: 0 0 8px 0;
}

.entry-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin: 0 6px;
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s, border-color 0.15s;
}

.entry-item:hover {
  background: var(--card-elevated);
}

.entry-item.active {
  background: var(--card-elevated);
  border-color: var(--primary);
}

.entry-item.drag-over {
  border-color: var(--secondary);
  border-style: dashed;
}

/* F06.6 拖拽放置模式高亮 */
.entry-item.drag-over-before {
  border-top: 2px solid var(--secondary);
  border-color: var(--secondary) transparent transparent transparent;
}

.entry-item.drag-over-after {
  border-bottom: 2px solid var(--secondary);
  border-color: transparent transparent var(--secondary) transparent;
}

.entry-item.drag-over-inside {
  background: color-mix(in srgb, var(--secondary) 15%, transparent);
  border-color: var(--secondary);
  border-style: solid;
}

.entry-item.dragging {
  opacity: 0.5;
}

/* F06.6 展开/折叠按钮 */
.expand-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  padding: 0;
}

.expand-toggle:hover {
  background: var(--background);
  color: var(--foreground);
}

.expand-toggle:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.expand-spacer {
  display: inline-block;
  width: 18px;
  flex-shrink: 0;
}

/* F06.6 层级标签 */
.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid currentColor;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.form-level-badge {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  vertical-align: middle;
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.entry-item.disabled {
  opacity: 0.55;
}

.entry-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.entry-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.entry-toggle.active {
  color: var(--secondary);
}

.entry-toggle:hover {
  background: var(--background);
}

.entry-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry-title {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-keys {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-strategy {
  font-size: 10px;
  color: var(--muted-foreground);
  padding: 2px 6px;
  background: var(--background);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.entries-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.drag-hint {
  margin: 0;
  font-size: 10px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

/* 条目编辑器 */
.entry-editor-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--background);
}

.empty-entry-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted-foreground);
  font-size: 13px;
}

.empty-entry-editor p {
  margin: 0;
}

.entry-form {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.entry-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.entry-form-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.entry-form-actions {
  display: flex;
  gap: 6px;
}

.action-btn.duplicate {
  color: var(--secondary);
  border-color: var(--border);
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* F17.3 随机事件行 */
.random-event-row {
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
  padding: 12px;
  background: var(--surface-3, var(--card-elevated));
  border-radius: 6px;
  border: 1px solid var(--border);
}

.random-event-row .form-cell {
  flex: 1;
}

.random-event-row input[type='range'] {
  width: 100%;
}

.form-row-3col,
.form-row-4col {
  display: grid;
  gap: 12px;
}

.form-row-3col {
  grid-template-columns: repeat(3, 1fr);
}

.form-row-4col {
  grid-template-columns: repeat(4, 1fr);
}

.form-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.form-input,
.form-select,
.form-textarea {
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.form-input:disabled,
.form-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.char-count {
  font-size: 11px;
  color: var(--muted-foreground);
  align-self: flex-end;
}

/* 响应式 */
@media (max-width: 1100px) {
  .worldbook-body {
    grid-template-columns: 220px 1fr;
  }
  .entries-layout {
    grid-template-columns: 240px 1fr;
  }
  .form-row-3col,
  .form-row-4col {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .worldbook-body {
    grid-template-columns: 1fr;
  }
  .lorebook-list-panel {
    display: none;
  }
  .entries-layout {
    grid-template-columns: 1fr;
  }
  .entries-list-panel {
    display: none;
  }
}

/* ── F06.8 AI 生成 Modal ── */

.generate-modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.generate-hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.template-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1.5px solid var(--border);
  background: var(--background);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.template-card:hover {
  border-color: var(--accent-orange);
}

.template-card.active {
  border-color: var(--accent-orange);
  background: rgba(224, 160, 96, 0.1);
}

.template-card .template-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--foreground);
}

.template-card .template-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.generating-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--card-elevated);
  border-radius: var(--radius-md);
  color: var(--muted-foreground);
  font-size: 13px;
}

.generating-state :deep(svg) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.generate-error {
  padding: 10px 12px;
  background: rgba(255, 82, 82, 0.1);
  border: 1px solid var(--error);
  border-radius: var(--radius-md);
  color: var(--error);
  font-size: 13px;
}

@media (max-width: 600px) {
  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
