<script setup lang="ts">
/**
 * CharacterVersionView — 角色卡版本管理页面 (模块4)
 *
 * 功能：
 * - 顶部：角色选择器 + 当前操作者（模拟多用户切换）
 * - Tab 1 版本历史：当前分支的 commit 链，支持查看快照、对比、回滚
 * - Tab 2 分支：列出全部分支，支持创建/切换/删除/锁定
 * - Tab 3 差异对比：选择两个版本查看字段级 diff
 * - Tab 4 合并：选择源分支合并到当前分支，冲突时弹出解决 Modal
 * - Tab 5 设置：操作者切换、操作锁管理、仓库清理
 *
 * 无障碍：
 * - 语义化 main/header/nav/section
 * - Tab 使用 role="tablist"/"tab"/"tabpanel"
 * - 表单 label 关联
 * - 图标按钮 aria-label
 * - Modal 焦点陷阱（通过 Modal 组件）
 * - Toast role=alert 反馈
 *
 * R2-2 拆分后本文件只留编排：
 * - 页头 → `components/character/version/VersionPageHeader.vue`
 * - 五个 Tab → 同目录的五个 Panel（各自的 Modal 跟着自己走：快照 / 建分支 / 冲突）
 * - 时间与快照字段格式化 → `version-format.ts`
 *
 * **样式为什么没有跟着组件走**：本页的 `.btn` / `.icon-btn` / `.badge` / `.form-group`
 * 是**页级设计系统**，五个面板都在用；而五个面板都只在这一页里出现、不会复用。
 * 所以这些共享基类留在宿主，用 `:deep()` 一次性作用到面板内部（`ChatMain` 的
 * `:deep(.msg-bubble)` 是同一手法）；面板只带自己独有的样式。
 * 这与 R1-4/R2-1「子组件自带基类」的区别在**可复用性**：那边拆出的是会被别处引用的
 * 通用组件，这边是单次使用的页内子视图。
 */
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDeepLinkId } from '@/composables/useDeepLinkId';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import Modal from '@/components/common/Modal.vue';
import VersionPageHeader from '@/components/character/version/VersionPageHeader.vue';
import VersionHistoryPanel from '@/components/character/version/VersionHistoryPanel.vue';
import VersionBranchPanel from '@/components/character/version/VersionBranchPanel.vue';
import VersionDiffPanel from '@/components/character/version/VersionDiffPanel.vue';
import VersionMergePanel from '@/components/character/version/VersionMergePanel.vue';
import VersionSettingsPanel from '@/components/character/version/VersionSettingsPanel.vue';
import { t } from '@/i18n';

const router = useRouter();
const store = useCharacterVersionStore();
const characterStore = useCharacterStore();

// ── 启动加载持久化 ──
// E19：角色卡的"已跟踪"标记带 ?char= 进来，直接定位到那个角色。取 id、等两道闸门、
// 等待期间 URL 变化作废，收进 useDeepLinkId（M14-a）。
// 必须等角色库读完再决定"这条 URL 对应哪个角色"：`characters` 的初值是 mock 种子，
// 读库没完成时 URL 里那个 id 在内存里根本不存在，于是落到"自动选中第一条"
// = 种子角色。webkit 实测就是这样：整条版本历史的快照全是种子角色的描述，
// 用户以为在给刚建的角色提交版本。
const ensureVersionData = async (): Promise<void> => {
  if (!store.loaded) await store.loadFromDisk();
  await characterStore.ensureLoaded();
};
useDeepLinkId({
  key: 'char',
  // 这里自己传 load 是登记过的例外：版本页要**等两个**库（版本仓库 + 角色库），
  // 登记表只能给一个键对应一个库。其余视图都让登记表决定等谁。
  load: ensureVersionData,
  onResolved: (id) => handleSelectCharacter(id),
  onMissing: async () => {
    await ensureVersionData();
    // 自动选中第一个角色
    if (!store.currentCharacterId && characterStore.characters.length > 0) {
      handleSelectCharacter(characterStore.characters[0]!.id);
    }
  },
  reactive: false,
});

// ── Tab ──
type TabKey = 'history' | 'branches' | 'diff' | 'merge' | 'settings';
const activeTab = ref<TabKey>('history');
// P2-6: computed 包裹使 t() 响应 locale 变化(切中英文时 Tab 标签同步更新)
const TABS = computed<Array<{ key: TabKey; label: string }>>(() => [
  { key: 'history', label: t('cv.tabHistory') },
  { key: 'branches', label: t('cv.tabBranches') },
  { key: 'diff', label: t('cv.tabDiff') },
  { key: 'merge', label: t('cv.tabMerge') },
  { key: 'settings', label: t('cv.tabSettings') },
]);

// ── Toast ──
// 保留本页自己的 Toast（不走全局 toast-service）：`deep-link-waits-character-library`
// 用例把 Toast 换成桩并从 `message` 断言"角色不存在"这条提示，换成全局服务就没有
// 可断言的 DOM 了。面板通过 `notify` 事件回到这里，全页仍只有一个 Toast 实例。
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(type: typeof toastType.value, message: string): void {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastOpen.value = false;
  }, 2500);
}

// 监听 store 错误/提示。面板只管调 store 动作，**不各自 flush**：
// 这一处统一把 lastError/lastInfo 变成 Toast 并清位，避免五个面板各写一遍。
const storeError = computed(() => store.lastError);
const storeInfo = computed(() => store.lastInfo);

function flushStoreMessages(): void {
  if (storeError.value) {
    showToast('error', storeError.value);
    store.clearLastError();
  } else if (storeInfo.value) {
    showToast('success', storeInfo.value);
    store.clearLastInfo();
  }
}

watch(
  [storeError, storeInfo],
  () => {
    flushStoreMessages();
  },
  { immediate: false }
);

// ── 角色选择 ──
function handleSelectCharacter(id: string): void {
  const ok = store.selectCharacter(id);
  if (!ok) flushStoreMessages();
}

// 当前选中角色信息
const currentCharacter = computed(() => {
  if (!store.currentCharacterId) return null;
  return characterStore.characters.find((c) => c.id === store.currentCharacterId) ?? null;
});

// ── 提交 Modal（页头与历史面板都能打开，所以状态在宿主） ──
const commitModalOpen = ref(false);
const commitMessage = ref('');

function openCommitModal(): void {
  commitMessage.value = '';
  commitModalOpen.value = true;
}

function onCommitSubmit(): void {
  if (!commitMessage.value.trim()) {
    showToast('error', t('cv.needCommitMessage'));
    return;
  }
  const ok = store.commitCurrentCharacter(commitMessage.value.trim());
  commitModalOpen.value = false;
  if (ok) {
    showToast('success', t('cv.committed'));
  } else {
    flushStoreMessages();
  }
}

// ── 差异对比的两个版本 id（历史面板「与 HEAD 对比」要预填后切过来） ──
const diffFromId = ref<string>('');
const diffToId = ref<string>('');

function handleCompare(fromId: string, toId: string): void {
  diffFromId.value = fromId;
  diffToId.value = toId;
  activeTab.value = 'diff';
}

// ── 返回 ──
function goBack(): void {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}
</script>

<template>
  <div class="version-view">
    <VersionPageHeader
      :repo-character-name="store.currentRepoInfo ? store.currentRepoInfo.characterName : null"
      :selected-id="store.currentCharacterId ?? ''"
      :characters="characterStore.characters"
      :can-commit="!!currentCharacter"
      :show-commit="!!store.currentCharacterId"
      @back="goBack"
      @select="handleSelectCharacter"
      @commit="openCommitModal"
    />

    <nav class="tabs" role="tablist" :aria-label="t('cv.tabsAria')">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :id="`tab-${tab.key}`"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`panel-${tab.key}`"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'branches' && store.branches.length" class="tab-count">{{ store.branches.length }}</span>
        <span v-if="tab.key === 'merge' && store.hasPendingConflicts" class="tab-count alert">!</span>
      </button>
    </nav>

    <main class="page-body">
      <VersionHistoryPanel
        v-show="activeTab === 'history'"
        @notify="showToast"
        @commit="openCommitModal"
        @compare="handleCompare"
      />
      <VersionBranchPanel
        v-show="activeTab === 'branches'"
        @notify="showToast"
      />
      <VersionDiffPanel
        v-show="activeTab === 'diff'"
        v-model:from-id="diffFromId"
        v-model:to-id="diffToId"
        @notify="showToast"
      />
      <VersionMergePanel
        v-show="activeTab === 'merge'"
        @notify="showToast"
      />
      <VersionSettingsPanel
        v-show="activeTab === 'settings'"
        :character-name="currentCharacter?.name ?? ''"
        :has-character="!!store.currentCharacterId"
        @notify="showToast"
      />
    </main>

    <!-- ── 提交 Modal ── -->
    <Modal
      :model-value="commitModalOpen"
      :title="t('cv.commitTitle')"
      described-by="cv-commit-desc"
      @update:model-value="commitModalOpen = $event"
    >
      <p id="cv-commit-desc" class="modal-hint">
        {{ t('cv.commitHint', { name: currentCharacter?.name ?? '' }) }}
      </p>
      <div class="form-group">
        <label for="commit-msg-input">{{ t('cv.commitMessage') }}</label>
        <textarea
          id="commit-msg-input"
          v-model="commitMessage"
          rows="3"
          :placeholder="t('cv.commitPlaceholder')"
        />
      </div>
      <template #footer>
        <button type="button" class="btn" @click="commitModalOpen = false">{{ t('cv.cancel') }}</button>
        <button type="button" class="btn primary" @click="onCommitSubmit">
          <Icon name="check" :size="14" aria-hidden="true" />
          {{ t('cv.confirmCommit') }}
        </button>
      </template>
    </Modal>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.version-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
  padding: 0 20px;
}

.tab {
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .tab:hover {
    color: var(--foreground);
  }
}

.tab.active {
  color: var(--primary-fg, var(--primary));
  border-bottom-color: var(--primary);
}

.tab-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  align-items: center;
  justify-content: center;
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  border-radius: 9px;
}

.tab.active .tab-count {
  background: var(--primary);
  color: var(--on-primary);
}

.tab-count.alert {
  background: var(--danger-bg);
  color: var(--danger-fg);
  font-weight: 700;
}

/* Body：`.panel` 落在各面板的根元素上，父级 scoped 规则对子组件根元素有效 */
.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.panel {
  max-width: 960px;
  margin: 0 auto;
}

/* ── 页级设计系统：五个面板共用，用 :deep() 一次作用到面板内部 ──
   为什么不各复制一份：这五个面板只在本页出现、不复用；复制会把 945 行样式
   变成 1600+ 行（.btn/.badge 各要 6 份）。可复用组件仍按 R1-4 的纪律自带基类。 */
.version-view :deep(.panel-toolbar) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.version-view :deep(.panel-hint) {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  flex: 1;
  min-width: 200px;
}

.version-view :deep(.panel-hint strong) {
  color: var(--primary-fg, var(--primary));
}

.version-view :deep(.btn) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .version-view :deep(.btn:hover) {
    background: var(--card-elevated);
  }
}

.version-view :deep(.btn.primary) {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .version-view :deep(.btn.primary:hover:not(:disabled)) {
    filter: brightness(1.1);
  }
}

.version-view :deep(.btn.danger-outline) {
  color: var(--danger-fg);
  border-color: var(--danger-border);
}

@media (hover: hover) and (pointer: fine) {
  .version-view :deep(.btn.danger-outline:hover:not(:disabled)) {
    background: var(--danger-bg);
  }
}

.version-view :deep(.icon-btn) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .version-view :deep(.icon-btn:hover) {
    background: var(--card-elevated);
    color: var(--foreground);
  }
}

@media (hover: hover) and (pointer: fine) {
  .version-view :deep(.icon-btn.danger:hover) {
    color: var(--danger-fg);
    background: var(--danger-bg);
  }
}

.version-view :deep(.badge) {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-weight: 500;
}

.version-view :deep(.badge.head) {
  background: var(--primary);
  color: var(--on-primary);
}

.version-view :deep(.badge.branch) {
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.version-view :deep(.badge.default) {
  background: var(--primary-fg, var(--primary));
  color: var(--on-accent);
}

.version-view :deep(.badge.current) {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.version-view :deep(.badge.locked) {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.version-view :deep(.badge.success) {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.version-view :deep(.badge[data-type='added']) {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.version-view :deep(.badge[data-type='removed']) {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.version-view :deep(.badge[data-type='modified']) {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.version-view :deep(.section-title) {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
}

.version-view :deep(.section-hint) {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--muted-foreground);
}

.version-view :deep(.section-hint strong) {
  color: var(--primary-fg, var(--primary));
}

.version-view :deep(.form-group) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.version-view :deep(.form-group label) {
  font-size: 13px;
  color: var(--foreground);
  font-weight: 500;
}

.version-view :deep(.form-group input),
.version-view :deep(.form-group select),
.version-view :deep(.form-group textarea) {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

.version-view :deep(.form-group input:focus-visible),
.version-view :deep(.form-group select:focus-visible),
.version-view :deep(.form-group textarea:focus-visible) {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.version-view :deep(.form-hint) {
  font-size: 11px;
  color: var(--muted-foreground);
}

.version-view :deep(.action-row) {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.version-view :deep(.muted) {
  color: var(--muted-foreground);
  font-size: 13px;
}

.version-view :deep(.modal-hint) {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted-foreground);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .version-view :deep(.form-group input),
  .version-view :deep(.form-group select),
  .version-view :deep(.form-group textarea) {
    font-size: 16px;
  }
}
</style>
