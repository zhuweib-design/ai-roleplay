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
 *
 * R1-3（结构债 §7）：本页原 3115 行，拆为 8 个组件 + 3 个 composable。
 * 拆分的**硬约束**（改这里之前先读）：
 *   · `.worldbook-view` / `.worldbook-body` / `.lorebook-list-panel` /
 *     `.lorebook-editor-panel` / `.editor-content` / `.entries-layout` /
 *     `.entries-list-panel` / `.entry-editor-panel` 这些**外壳**必须留在本文件：
 *     手机两级互换（`.worldbook-view[data-level='1'] .lorebook-editor-panel{display:none}`）
 *     与第三态互斥（`.editor-content[data-entry='1'] .entries-list-panel{display:none}`）
 *     都是**后代 + 属性选择器**，外壳搬进子组件就够不到了。
 *   · 子组件是 fragment（多根）时按 DOM 顺序平铺进外壳，因此网格/列排布不变。
 */
import { ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useDeepLinkId } from '@/composables/useDeepLinkId';
import { useDrilldown } from '@/composables/useDrilldown';
import { useViewport } from '@/core/viewport';
import { useLorebookStore } from '@/stores/lorebook';
import Icon from '@/components/common/Icon.vue';
import QuickLorebookFlow from '@/components/worldbook/QuickLorebookFlow.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import WorldBookEventsPanel from '@/components/worldbook/WorldBookEventsPanel.vue';
import LorebookHeader from '@/components/worldbook/LorebookHeader.vue';
import LorebookListPanel from '@/components/worldbook/LorebookListPanel.vue';
import LorebookMetaSection from '@/components/worldbook/LorebookMetaSection.vue';
import LorebookWorldSections from '@/components/worldbook/LorebookWorldSections.vue';
import LorebookBindings from '@/components/worldbook/LorebookBindings.vue';
import LorebookEntryTree from '@/components/worldbook/LorebookEntryTree.vue';
import LorebookEntryForm from '@/components/worldbook/LorebookEntryForm.vue';
import LorebookGenerateModal from '@/components/worldbook/LorebookGenerateModal.vue';
import {
  useLorebookTree,
  levelLabel,
  levelColor,
  getEntryLevel,
  getIndent,
} from '@/composables/useLorebookTree';
import { useLorebookEntryForm } from '@/composables/useLorebookEntryForm';
import { useLorebookIO } from '@/composables/useLorebookIO';
import { useCharacterStore } from '@/stores/character';
import { t } from '@/i18n';

const store = useLorebookStore();

/**
 * "最小生效三步"的开合：由空态里那颗按钮展开，走完三步由用户点"完成"收起。
 * 放在宿主而不是组件里，是因为收起之后这块区域就该让位给正常编辑器。
 * 曾经做成"一本书都没有时自动展开"，实测否掉：那等于把编辑器从用户手里抢走，
 * 已有的"新建世界书 → 重命名 → 加条目"路径整个被挡住（e2e/ 里就有一条这么红的）。
 */
const quickFlowOpen = ref(false);
const characterStore = useCharacterStore();
const router = useRouter();
const route = useRoute();
const { pushWithReturn } = useReadinessJump();

/** 反向关系跳转：世界书 → 角色编辑（带来源，便于返回） */
function openBoundCharacter(id: string): void {
  pushWithReturn({ name: 'character-edit', params: { id } });
}

function openCharacterList(): void {
  pushWithReturn({ name: 'character-list' });
}

// ── 需求7：世界书 → 角色 反向关系展示 ──

/** 当前世界书已绑定的角色列表（由角色 boundWorldBookIds 派生） */
const boundCharacters = computed(() => {
  if (!store.currentLorebookId) return [];
  const charIds = characterStore.getCharacterIdsByWorldBook(
    store.currentLorebookId
  );
  return characterStore.characters.filter((c) => charIds.includes(c.id));
});

/** 返回对话页 */
function goBack() {
  // 手机二级页：页头返回先回列表级，而不是直接离开世界书页
  if (isMobile.value && swap.goBack()) return;
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}

// ── 组成层（批次 1-3）：手机两级互换 ──
// 一级 = 世界书列表（满屏），二级 = 该书（条目树满屏）。
// 条目表单是二级内的**互斥第三态**：同屏最多一个滚动容器，不再是
// 「列表 38vh + 条目树 38vh + 表单」三层嵌套滚动。
const { isMobile } = useViewport();
const entryPaneOpen = ref(false);
const swap = useDrilldown({
  masterLabel: t('wb.title'),
  onLeaveDetail: () => {
    entryPaneOpen.value = false;
  },
});
/** `data-level` 要字符串：数字会被 Vue 渲染成 "1"/"2" 也一样，但显式转一次免得歧义 */
const swapLevel = computed(() => String(swap.level.value));

/**
 * 手机上打开条目表单后把它滚进视口。
 * 表单在二级里替换的是**条目树**，但元信息 / 世界描述 / 事件还在它上面——
 * 不滚一下，用户点完「新增」看到的还是元信息，会以为没反应。
 */
watch(entryPaneOpen, (open) => {
  if (!open || !isMobile.value) return;
  void nextTick(() => {
    document
      .querySelector('.entry-editor-panel')
      ?.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
});

// ── UI 状态 ──
const deleteTargetId = ref<string | null>(null);
// O-22：确认文案需要名称与条目数，派生自待删除 id
const deleteTargetLorebook = computed(
  () => store.lorebooks.find((lb) => lb.id === deleteTargetId.value) ?? null,
);
const deleteModalOpen = ref(false);
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

// ── Toast ──
function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// ── 拆分出的三块逻辑 ──
// 解构取用：setup 顶层解出的 ref 在模板里自动解包，写 `tree.visibleEntries.value`
// 既啰嗦又容易漏 `.value`（模板里读到的是 ref 对象本身，渲染成 [object Object]）。
const {
  draggingEntryId,
  dragOverEntryId,
  dragDropMode,
  visibleEntries,
  hasChildren,
  isExpanded,
  toggleExpand,
  expandAll,
  collapseAll,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  moveToTopLevel,
  moveUpInLevel,
  moveDownInLevel,
  toggleEntry,
} = useLorebookTree();

const {
  strategyOptions,
  positionOptions,
  logicOptions,
  onTitleInput,
  onContentInput,
  onKeysInput,
  keysToString,
  onStrategyChange,
  onPositionChange,
  onLogicChange,
  onProbabilityInput,
  onOrderInput,
  onDepthInput,
  onGroupInput,
  keysPreview,
  strategyLabel,
  deleteEntry,
  duplicateEntry,
} = useLorebookEntryForm();

const {
  generateModalOpen,
  selectedTemplateId,
  generateOwnerId,
  openGenerateModal,
  closeGenerateModal,
  selectTemplate,
  confirmGenerate,
  extendCurrentWorldbook,
  exportLorebook,
} = useLorebookIO(showToast);

// ── 计算属性 ──
const currentLorebook = computed(() => store.currentLorebook);
const currentEntry = computed(() => store.currentEntry);

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

// ── Lorebook 操作 ──
function createLorebook() {
  const id = store.createLorebook();
  if (!id) return;
  entryPaneOpen.value = false;
  // 建完直接进二级：停在列表级会让用户以为"没建成"（A7 建群后停在列表级同款）
  if (isMobile.value) swap.open(id);
}

function selectLorebook(id: string) {
  store.selectLorebook(id);
  entryPaneOpen.value = false;
  // 地址栏跟着当前书走（M17-b）：刷新/分享后仍在这本世界上，深链的另一半。
  // 用 replace 是为了不让"连着点三本书"堆出三条历史记录；保留原 query 免得抹掉 from。
  const navigate =
    route.query.book !== id
      ? router.replace({ query: { ...route.query, book: id } })
      : Promise.resolve();
  // 压层必须在 replace 落地**之后**：`router.replace` 会整体覆盖 history.state，
  // 先 pushState 再 replace 会把 `__aijiuLayer` 标记冲掉（A7 踩过同一个坑）。
  if (isMobile.value) void navigate.then(() => swap.open(id));
}

/**
 * 深链 `/worldbook?book=<id>`（M17-b，第二条按 URL 寻址的新深链）。
 *
 * 闸门由登记表给（src/stores/deep-link-gate.ts 的 `book` → 世界书库）：视图只说键名。
 * 读完了仍没有这本书时必须说出来 —— 世界书页在读库完成后会默认选中第一本，
 * 不说就是"打开的是另一本书"，正是 M12-a 那类静默换目标的形状。
 */
useDeepLinkId({
  key: 'book',
  onResolved: (id) => {
    if (!store.lorebooks.some((lb) => lb.id === id)) {
      showToast('error', t('wb.notFound'));
      return;
    }
    if (id !== store.currentLorebookId) selectLorebook(id);
  },
});

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

// ── Lorebook 元信息编辑 ──
function onNameInput(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  if (currentLorebook.value) {
    store.updateLorebook(currentLorebook.value.id, { name: value });
  }
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
  if (!id) return;
  // 手机档：store.addEntry 会把 currentEntryId 指到新条目，但视图的"第三态"是
  // 视图自己的状态——不跟着打开的话，用户点「新增」看不到表单（像没建成）。
  if (isMobile.value) entryPaneOpen.value = true;
  void nextTick(() => {
    const el = document.querySelector(`[data-entry-id="${id}"]`);
    (el as HTMLElement | null)?.focus();
  });
}

function selectEntry(id: string) {
  if (currentLorebook.value) {
    store.selectEntry(id);
    // 手机档：条目表单满屏替换条目树（桌面并置，不受影响）
    if (isMobile.value) entryPaneOpen.value = true;
  }
}

/** 生成 Modal 的归属下拉项 */
const ownerOptions = computed(() =>
  characterStore.characters.map((c) => ({ id: c.id, name: c.name }))
);
</script>

<template>
  <div class="worldbook-view m-swap" :data-level="swapLevel">
    <!-- 顶部 Header -->
    <LorebookHeader
      :book-count="store.lorebooks.length"
      :generating="store.isGeneratingWorld"
      @back="goBack"
      @create="createLorebook"
      @generate="openGenerateModal"
      @import="store.importLorebookFile($event)"
    />

    <!-- 主体：左 Lorebook 列表 + 右编辑器 -->
    <div class="worldbook-body">
      <!-- 左侧 Lorebook 列表 -->
      <aside class="lorebook-list-panel m-swap__master tk-scroll" :aria-label="t('wb.listAria')">
        <LorebookListPanel @select="selectLorebook" @create="createLorebook" />
      </aside>

      <!-- 右侧 Lorebook 编辑器 -->
      <main class="lorebook-editor-panel m-swap__detail" id="main-content" tabindex="-1">
        <!--
          三步流程**不能**挂在 !currentLorebook 分支里：createLorebook 会把新书设成当前选中，
          于是第一步一完成宿主就消失，用户做到一半被踢回编辑器（浏览器实测踩过这个）。
          流程打开时编辑器整体不渲染：两者同时留在页面上会互相压住操作
          （移动视口实测：流程卡片盖住编辑器的"新增条目"按钮，点不到）。
          三步走完点"完成"收起，编辑器带着刚建好的书回来。
        -->
        <QuickLorebookFlow
          v-if="quickFlowOpen"
          class="wb-quick-flow"
          @finished="quickFlowOpen = false"
        />

        <div v-if="!currentLorebook && !quickFlowOpen" class="empty-editor">
          <Icon name="compass" :size="48" />
          <!--
            一句话要对两种情况负责：左侧有书但没选中的，才谈得上"选择左侧的世界书"；
            一本书都没有时那句是指令不了的指令，用户照着做只会对着空列表发呆。
          -->
          <p>{{ store.lorebooks.length === 0 ? t('wb.emptyNoBooks') : t('wb.emptyEditor') }}</p>
          <button type="button" class="primary-btn" @click="createLorebook">
            {{ t('wb.createNew') }}
          </button>
          <!-- 最短生效路径要能被看见，但不替用户决定：默认仍进编辑器 -->
          <button type="button" class="wb-open-flow" data-rel-jump="quick-wb-open" @click="quickFlowOpen = true">
            {{ t('quick.wbOpenFlow') }}
          </button>
        </div>

        <div v-else-if="currentLorebook && !quickFlowOpen" class="editor-content" :data-entry="entryPaneOpen ? '1' : '0'">
          <!--
            三步走原先只挂在"一本书都没有"的空态里：选中一本书之后就再也打不开，
            可"再按最短路径建一本能生效的"恰恰是在已有书的人身上最常发生的事。
          -->
          <button type="button" class="wb-open-flow wb-open-flow-inline" data-rel-jump="quick-wb-open" @click="quickFlowOpen = true">
            {{ t('quick.wbOpenFlow') }}
          </button>

          <!-- Lorebook 元信息 -->
          <LorebookMetaSection
            :book="currentLorebook"
            :generating="store.isGeneratingWorld"
            @name-input="onNameInput"
            @desc-input="onDescInput"
            @extend="extendCurrentWorldbook"
            @export="exportLorebook(currentLorebook.id)"
            @remove="deleteLorebook(currentLorebook.id)"
          />

          <!-- 需求7：已绑定角色展示（反向关系） -->
          <LorebookBindings
            :characters="boundCharacters"
            @open-character="openBoundCharacter"
            @open-character-list="openCharacterList"
          />

          <LorebookWorldSections />

          <WorldBookEventsPanel />

          <!-- 条目列表 + 条目编辑器 -->
          <div class="entries-layout">
            <!-- 条目列表（F06.6 树状导航）-->
            <aside class="entries-list-panel" :aria-label="t('wb.editorAria')">
              <LorebookEntryTree
                :entries-count="currentLorebook.entries.length"
                :visible-entries="visibleEntries"
                :current-entry-id="store.currentEntryId"
                :dragging-entry-id="draggingEntryId"
                :drag-over-entry-id="dragOverEntryId"
                :drag-drop-mode="dragDropMode"
                :has-children="hasChildren"
                :is-expanded="isExpanded"
                :get-entry-level="getEntryLevel"
                :level-color="levelColor"
                :level-label="levelLabel"
                :get-indent="getIndent"
                :keys-preview="keysPreview"
                :strategy-label="strategyLabel"
                @select="selectEntry"
                @add="addEntry"
                @expand-all="expandAll"
                @collapse-all="collapseAll"
                @toggle-expand="toggleExpand"
                @toggle-entry="toggleEntry"
                @drag-start="onDragStart"
                @drag-over="onDragOver"
                @drag-leave="onDragLeave"
                @drop="onDrop"
                @drag-end="onDragEnd"
              />
            </aside>

            <!-- 条目编辑器 -->
            <section class="entry-editor-panel" :aria-label="t('wb.editorAria')">
              <div v-if="!currentEntry" class="empty-entry-editor">
                <Icon name="file" :size="36" />
                <p>{{ t('wb.emptyEntryEditor') }}</p>
              </div>

              <LorebookEntryForm
                v-else
                :entry="currentEntry"
                :is-mobile="isMobile"
                :strategy-options="strategyOptions"
                :position-options="positionOptions"
                :logic-options="logicOptions"
                :get-entry-level="getEntryLevel"
                :level-color="levelColor"
                :level-label="levelLabel"
                :keys-to-string="keysToString"
                @close-pane="entryPaneOpen = false"
                @title-input="onTitleInput"
                @keys-input="onKeysInput"
                @content-input="onContentInput"
                @strategy-change="onStrategyChange"
                @position-change="onPositionChange"
                @logic-change="onLogicChange"
                @probability-input="onProbabilityInput"
                @order-input="onOrderInput"
                @depth-input="onDepthInput"
                @group-input="onGroupInput"
                @move-to-top="moveToTopLevel(currentEntry.id)"
                @move-up="moveUpInLevel(currentEntry.id)"
                @move-down="moveDownInLevel(currentEntry.id)"
                @duplicate="duplicateEntry(currentEntry.id)"
                @remove="deleteEntry(currentEntry.id)"
              />
            </section>
          </div>
        </div>
      </main>
    </div>

    <!-- 删除确认对话框 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('wb.deleteTitle')"
      described-by="wb-delete-desc"
    >
      <p id="wb-delete-desc">{{ t('wb.deleteConfirmNamed', { name: deleteTargetLorebook?.name ?? t('story.unnamedLorebook'), count: deleteTargetLorebook?.entries.length ?? 0 }) }}</p>
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
    <LorebookGenerateModal
      v-model="generateModalOpen"
      v-model:owner-id="generateOwnerId"
      :selected-template-id="selectedTemplateId"
      :owner-options="ownerOptions"
      :generating="store.isGeneratingWorld"
      :error-message="store.lastError"
      @select-template="selectTemplate"
      @cancel="closeGenerateModal"
      @confirm="confirmGenerate"
    />

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

.worldbook-body {
  flex: 1;
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 0;
  overflow: hidden;
}

/* 左侧 Lorebook 列表（外壳：手机两级互换靠它做显隐） */
.lorebook-list-panel {
  border-right: 1px solid var(--border);
  background: var(--card);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 右侧编辑器（外壳） */
.lorebook-editor-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  outline: none;
}

.wb-open-flow {
  margin-top: 4px;
  padding: 6px 12px;
  border: 1px dashed var(--secondary);
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
}

/* 编辑器内的那份：靠左、给够点击高度，不与空态里的居中排版混用 */
.wb-open-flow-inline {
  align-self: flex-start;
  margin-top: 0;
  min-height: 32px;
}

.wb-quick-flow {
  width: min(520px, 100%);
  margin-top: 12px;
  text-align: left;
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

@media (hover: hover) and (pointer: fine) {
  .primary-btn:hover {
    opacity: 0.9;
  }
}

.editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* 条目区外壳。
   注意（R1-3 保行为）：原文件里 `.entries-layout` 与 `.entries-list-panel`
   **都没有桌面基类规则** —— 只有 ≤1024 / ≤640 两条覆盖给列数、以及 ≤640 的
   display:flex。桌面怎么排就怎么排，这里刻意不补基线，补了就是改版式。 */

/* 条目编辑器（外壳：手机第三态互斥靠它做显隐） */
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

/* ── 响应式 ── */
@media (max-width: 1024px) {
  .worldbook-body {
    grid-template-columns: 220px 1fr;
  }
  .entries-layout {
    grid-template-columns: 240px 1fr;
  }
}

/* ── ≤640：两级互换（批次 1-3）────────────────────────────────────────
   改之前是"列表 38vh + 条目树 38vh + 条目表单"三层堆叠，每层各自滚动，
   主体区只剩不到 30%。现在：
     一级 = 世界书列表（满屏）
     二级 = 该书：条目树满屏；选中条目后**表单满屏替换条目树**（互斥第三态）
   于是同屏最多一个滚动容器。
   注意特异性：页面自己的 `.lorebook-list-panel{display:flex}` 是 (0,1,0)，
   压不过全局 `.m-swap[data-level='2'] > .m-swap__master`（(0,2,0)）没问题，
   但反向（要显示的那个）必须自己写 flex，否则会被 `.worldbook-body` 的
   grid 布局按行分配。

   R1-3：子组件搬到独立文件后，圈选子组件内部元素的两条规则也跟着搬走了
   （scoped 到不了子组件内部）—— 见 LorebookEntryTree / LorebookEntryForm 的
   640 块。本文件只留**外壳**自己的规则。 */
@media (max-width: 640px) {
  /* 两栏在手机上变一列。用 flex 而不是 grid：grid 的单行是内容高度，
     显示中的那一级撑不满剩余空间（两级互换要求"显示的那级满屏"）。 */
  .worldbook-body {
    display: flex;
    flex-direction: column;
    grid-template-columns: none;
  }
  /*
   * 显隐必须由页面自己写：`.m-swap` 的规则是 `> .m-swap__master`（直接子元素），
   * 而这里的 master/detail 在 `.worldbook-body` 里面一层——原语够不到。
   * 特异性 (0,3,0) 也保证压得过下面两条 (0,2,0) 的 display:flex。
   */
  .worldbook-view[data-level='1'] .lorebook-editor-panel {
    display: none;
  }
  .worldbook-view[data-level='2'] .lorebook-list-panel {
    display: none;
  }
  .lorebook-list-panel {
    display: flex;
    flex: 1;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    border-right: 0;
  }
  .lorebook-editor-panel {
    flex: 1;
    min-height: 0;
  }
  /*
   * 二级只留**一个**滚动容器：`.editor-content`。原来条目树自己滚、条目列表再滚、
   * 外层还滚——手机上三层嵌套，手指划一下不知道滚的是哪层。
   * 现在元信息 / 世界描述 / 事件 / 条目树一起随 `.editor-content` 滚，
   * 条目树本身 overflow: visible（内容自然撑高）。
   */
  .editor-content {
    overflow-y: auto;
  }
  .entries-layout {
    grid-template-columns: 1fr;
  }
  .entries-list-panel {
    display: flex;
    /* 显式列方向：默认 row 会让 .entries-list 的 flex:1 被头部挤成 0 宽，
       条目树在移动端实际不可见（移动视口 E2E 捕获过该回归）。 */
    flex-direction: column;
    min-height: 0;
    max-height: none;
    overflow: visible;
  }
  /* 二级内的第三态：条目表单与条目树互斥，同一时刻只有一个在布局里 */
  .editor-content[data-entry='1'] .entries-list-panel {
    display: none;
  }
  .editor-content[data-entry='0'] .entry-editor-panel {
    display: none;
  }
  .entry-editor-panel {
    flex: 1;
    min-height: 0;
  }
}
</style>
