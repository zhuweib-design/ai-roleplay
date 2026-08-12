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
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import Modal from '@/components/common/Modal.vue';
import {
  isValidBranchName,
  type CharacterVersion,
  type VersionDiff,
  type VersionAuthor,
} from '@core/character-version-control';

const router = useRouter();
const store = useCharacterVersionStore();
const characterStore = useCharacterStore();

// ── 启动加载持久化 ──
onMounted(() => {
  if (!store.loaded) {
    void store.loadFromDisk();
  }
  // 自动选中第一个角色
  if (!store.currentCharacterId && characterStore.characters.length > 0) {
    handleSelectCharacter(characterStore.characters[0].id);
  }
});

// ── Tab ──
type TabKey = 'history' | 'branches' | 'diff' | 'merge' | 'settings';
const activeTab = ref<TabKey>('history');
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'history', label: '版本历史' },
  { key: 'branches', label: '分支' },
  { key: 'diff', label: '差异对比' },
  { key: 'merge', label: '合并' },
  { key: 'settings', label: '设置' },
];

// ── Toast ──
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

// 监听 store 错误/提示
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

// 监听 store.lastError / lastInfo 自动 toast
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

// ── 提交 Modal ──
const commitModalOpen = ref(false);
const commitMessage = ref('');

function openCommitModal(): void {
  commitMessage.value = '';
  commitModalOpen.value = true;
}

function onCommitSubmit(): void {
  if (!commitMessage.value.trim()) {
    showToast('error', '请输入提交信息');
    return;
  }
  const ok = store.commitCurrentCharacter(commitMessage.value.trim());
  commitModalOpen.value = false;
  if (ok) {
    showToast('success', '已提交新版本');
  } else {
    flushStoreMessages();
  }
}

// ── 历史操作 ──
function handleRollback(version: CharacterVersion): void {
  if (
    !confirm(
      `确认回滚当前分支到版本「${version.id}」？\n将创建新提交而非删除历史。`
    )
  ) {
    return;
  }
  const ok = store.rollbackTo(version.id);
  if (ok) showToast('success', '已回滚');
  else flushStoreMessages();
}

// ── 查看快照 Modal ──
const snapshotModalOpen = ref(false);
const snapshotViewing = ref<CharacterVersion | null>(null);

function viewSnapshot(version: CharacterVersion): void {
  snapshotViewing.value = version;
  snapshotModalOpen.value = true;
}

function formatSnapshotField(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ── 分支 ──
const branchModalOpen = ref(false);
const newBranchName = ref('');
const newBranchFrom = ref<string>('');

function openCreateBranchModal(): void {
  newBranchName.value = '';
  newBranchFrom.value = store.currentRepoInfo?.currentBranch ?? 'main';
  branchModalOpen.value = true;
}

function onCreateBranchSubmit(): void {
  const name = newBranchName.value.trim();
  if (!name) {
    showToast('error', '请输入分支名');
    return;
  }
  if (!isValidBranchName(name)) {
    showToast('error', '分支名仅允许字母数字下划线连字符，1-32 字符');
    return;
  }
  const ok = store.createBranch(name, newBranchFrom.value || undefined);
  branchModalOpen.value = false;
  if (ok) showToast('success', `分支「${name}」已创建`);
  else flushStoreMessages();
}

function handleSwitchBranch(name: string): void {
  if (
    store.pendingConflicts &&
    !confirm('当前有未解决的合并冲突，切换分支将丢弃冲突解决进度，是否继续？')
  ) {
    return;
  }
  const ok = store.switchBranch(name);
  if (ok) showToast('success', `已切换到「${name}」`);
  else flushStoreMessages();
}

function handleDeleteBranch(name: string): void {
  if (!confirm(`确认删除分支「${name}」？此操作不可恢复。`)) return;
  const ok = store.deleteBranch(name);
  if (ok) showToast('success', `分支「${name}」已删除`);
  else flushStoreMessages();
}

function handleToggleLock(name: string): void {
  store.toggleBranchLock(name);
  flushStoreMessages();
}

// ── 差异对比 ──
const diffFromId = ref<string>('');
const diffToId = ref<string>('');
const diffResult = ref<VersionDiff | null>(null);

function computeDiff(): void {
  if (!diffFromId.value || !diffToId.value) {
    showToast('error', '请选择两个版本');
    return;
  }
  if (diffFromId.value === diffToId.value) {
    showToast('error', '请选择不同的版本');
    return;
  }
  const result = store.diff(diffFromId.value, diffToId.value);
  if (result) {
    diffResult.value = result;
    showToast(
      'info',
      result.identical ? '两版本完全相同' : `共 ${result.changes} 个差异字段`
    );
  } else {
    flushStoreMessages();
  }
}

function formatDiffValue(value: unknown): string {
  return formatSnapshotField(value);
}

function diffTypeLabel(type: 'added' | 'removed' | 'modified'): string {
  return type === 'added' ? '新增' : type === 'removed' ? '删除' : '修改';
}

// ── 合并 ──
const mergeSourceBranch = ref<string>('');
const mergeMessage = ref('');

function handleMerge(): void {
  if (!mergeSourceBranch.value) {
    showToast('error', '请选择要合并的源分支');
    return;
  }
  if (mergeSourceBranch.value === store.currentRepoInfo?.currentBranch) {
    showToast('error', '不能合并自己');
    return;
  }
  const ok = store.mergeBranch(mergeSourceBranch.value, mergeMessage.value || undefined);
  mergeMessage.value = '';
  if (ok) {
    showToast('success', '合并成功');
  } else if (store.pendingConflicts) {
    // 冲突 → 切换到合并 Tab 不需要，弹 Modal
    showToast('error', `检测到 ${store.pendingConflicts.conflicts.length} 个冲突，请解决`);
  } else {
    flushStoreMessages();
  }
}

// ── 冲突解决 Modal ──
const conflictModalOpen = ref(false);
const conflictResolutions = ref<Record<string, 'current' | 'source'>>({});

watch(
  () => store.pendingConflicts,
  (conflicts) => {
    if (conflicts) {
      conflictResolutions.value = {};
      for (const c of conflicts.conflicts) {
        conflictResolutions.value[c.path] = 'current'; // 默认保留当前
      }
      conflictModalOpen.value = true;
    } else {
      conflictModalOpen.value = false;
    }
  }
);

function onResolveConflictsSubmit(): void {
  const ok = store.resolveConflicts(conflictResolutions.value);
  if (ok) showToast('success', '冲突已解决并提交');
  else flushStoreMessages();
}

function onCancelMerge(): void {
  store.cancelMerge();
  showToast('info', '已取消合并');
}

// ── 设置：操作者切换 ──
const authorName = ref(store.author.name);
const authorAvatar = ref(store.author.avatar ?? '');

function saveAuthor(): void {
  const name = authorName.value.trim();
  if (!name) {
    showToast('error', '请输入操作者名称');
    return;
  }
  const newAuthor: VersionAuthor = {
    name,
    avatar: authorAvatar.value || undefined,
  };
  store.setAuthor(newAuthor);
  showToast('success', `已切换为「${name}」`);
}

// ── 操作锁 ──
function handleAcquireLock(): void {
  const ok = store.acquireLock('*');
  if (ok) showToast('success', '已获取全字段编辑锁');
  else flushStoreMessages();
}

function handleReleaseAllLocks(): void {
  store.releaseAllLocks();
  flushStoreMessages();
}

function handlePurgeExpiredLocks(): void {
  const n = store.purgeExpiredLocks();
  showToast('info', `已清理 ${n} 个过期锁`);
}

// ── 仓库管理 ──
function handleDeleteRepository(): void {
  if (!store.currentCharacterId) return;
  if (
    !confirm(
      `确认删除角色「${currentCharacter.value?.name}」的全部版本仓库？\n所有分支与提交历史将被永久删除。`
    )
  ) {
    return;
  }
  const ok = store.deleteRepository(store.currentCharacterId);
  if (ok) showToast('success', '仓库已删除');
  else flushStoreMessages();
}

// ── 辅助：格式化 ──
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shortMessage(message: string, max = 50): string {
  return message.length > max ? message.slice(0, max) + '…' : message;
}

// ── 返回 ──
function goBack(): void {
  router.push({ name: 'chat' });
}
</script>

<template>
  <div class="version-view">
    <header class="page-header">
      <div class="header-title">
        <button type="button" class="header-btn" aria-label="返回" @click="goBack">
          <Icon name="arrow-left" :size="18" aria-hidden="true" />
        </button>
        <h1>角色卡版本管理</h1>
        <span class="header-tag">
          {{ store.currentRepoInfo ? store.currentRepoInfo.characterName : '未选择' }}
        </span>
      </div>
      <div class="header-actions">
        <label class="header-field">
          <span class="sr-only">选择角色</span>
          <select
            :value="store.currentCharacterId ?? ''"
            class="header-select"
            aria-label="选择角色"
            @change="handleSelectCharacter(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>选择角色…</option>
            <option
              v-for="c in characterStore.characters"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </label>
        <button
          v-if="store.currentCharacterId"
          type="button"
          class="header-btn primary"
          @click="openCommitModal"
        >
          <Icon name="save" :size="14" aria-hidden="true" />
          提交
        </button>
      </div>
    </header>

    <nav class="tabs" role="tablist" aria-label="角色卡版本管理">
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
      <!-- ── 1. 版本历史 ── -->
      <section
        v-show="activeTab === 'history'"
        id="panel-history"
        role="tabpanel"
        aria-labelledby="tab-history"
        class="panel"
      >
        <div class="panel-toolbar">
          <p class="panel-hint">
            当前分支：<strong>{{ store.currentRepoInfo?.currentBranch ?? '—' }}</strong>
            ·
            共 {{ store.history.length }} 个提交
          </p>
          <button type="button" class="btn primary" @click="openCommitModal">
            <Icon name="plus" :size="14" aria-hidden="true" />
            提交新版本
          </button>
        </div>

        <ol v-if="store.history.length > 0" class="commit-list" role="list">
          <li
            v-for="(v, idx) in store.history"
            :key="v.id"
            class="commit-item"
            :class="{ head: idx === 0 }"
          >
            <div class="commit-dot" aria-hidden="true">
              <Icon :name="idx === 0 ? 'star' : 'file'" :size="14" />
            </div>
            <div class="commit-main">
              <div class="commit-title">
                <span class="commit-id">{{ v.id }}</span>
                <span v-if="idx === 0" class="badge head">HEAD</span>
                <span class="badge branch">{{ v.branch }}</span>
              </div>
              <p class="commit-msg">{{ shortMessage(v.message, 80) }}</p>
              <div class="commit-meta">
                <span class="meta-author">
                  <Icon name="user" :size="12" aria-hidden="true" />
                  {{ v.author.name }}
                </span>
                <span class="meta-time">{{ formatTime(v.timestamp) }}</span>
                <span v-if="v.parentId" class="meta-parent">parent {{ v.parentId }}</span>
              </div>
              <div class="commit-actions">
                <button
                  type="button"
                  class="icon-btn"
                  aria-label="查看快照"
                  @click="viewSnapshot(v)"
                >
                  <Icon name="eye" :size="14" aria-hidden="true" />
                  查看
                </button>
                <button type="button"
                  v-if="idx > 0"
                  class="icon-btn"
                  aria-label="回滚到此版本"
                  @click="handleRollback(v)"
                >
                  <Icon name="refresh-cw" :size="14" aria-hidden="true" />
                  回滚
                </button>
                <button type="button"
                  v-if="idx > 0"
                  class="icon-btn"
                  aria-label="与HEAD对比"
                  @click="diffFromId = v.id; diffToId = store.headVersion?.id ?? ''; activeTab = 'diff';"
                >
                  <Icon name="git-branch" :size="14" aria-hidden="true" />
                  对比 HEAD
                </button>
              </div>
            </div>
          </li>
        </ol>
        <div v-else class="empty-state">
          <Icon name="file" :size="48" aria-hidden="true" />
          <p>暂无提交历史</p>
          <p class="empty-hint">点击「提交新版本」创建第一个版本</p>
        </div>
      </section>

      <!-- ── 2. 分支 ── -->
      <section
        v-show="activeTab === 'branches'"
        id="panel-branches"
        role="tabpanel"
        aria-labelledby="tab-branches"
        class="panel"
      >
        <div class="panel-toolbar">
          <p class="panel-hint">管理当前角色的分支。每个分支维护独立的提交链，可独立编辑与回滚。</p>
          <button type="button" class="btn primary" @click="openCreateBranchModal">
            <Icon name="plus" :size="14" aria-hidden="true" />
            新建分支
          </button>
        </div>

        <ul v-if="store.branches.length > 0" class="branch-list" role="list">
          <li
            v-for="b in store.branches"
            :key="b.name"
            class="branch-card"
            :class="{
              current: b.name === store.currentRepoInfo?.currentBranch,
              locked: b.locked,
            }"
          >
            <div class="card-header">
              <div class="card-title">
                <Icon name="git-branch" :size="16" aria-hidden="true" />
                <span class="title-text">{{ b.name }}</span>
                <span v-if="b.isDefault" class="badge default">默认</span>
                <span v-if="b.name === store.currentRepoInfo?.currentBranch" class="badge current">当前</span>
                <span v-if="b.locked" class="badge locked">已锁定</span>
              </div>
              <div class="card-actions">
                <button
                  type="button"
                  class="icon-btn"
                  :aria-label="b.locked ? '解锁' : '锁定'"
                  @click="handleToggleLock(b.name)"
                >
                  <Icon :name="b.locked ? 'eye-off' : 'eye'" :size="14" aria-hidden="true" />
                </button>
                <button
                  v-if="b.name !== store.currentRepoInfo?.currentBranch"
                  type="button"
                  class="icon-btn"
                  aria-label="切换到此分支"
                  @click="handleSwitchBranch(b.name)"
                >
                  <Icon name="refresh-cw" :size="14" aria-hidden="true" />
                  切换
                </button>
                <button
                  v-if="!b.isDefault && b.name !== store.currentRepoInfo?.currentBranch"
                  type="button"
                  class="icon-btn danger"
                  aria-label="删除"
                  @click="handleDeleteBranch(b.name)"
                >
                  <Icon name="trash-2" :size="14" aria-hidden="true" />
                </button>
              </div>
            </div>
            <dl class="card-meta">
              <div><dt>HEAD</dt><dd>{{ b.headId ?? '—' }}</dd></div>
              <div><dt>创建时间</dt><dd>{{ formatTime(b.createdAt) }}</dd></div>
              <div><dt>创建者</dt><dd>{{ b.createdBy.name }}</dd></div>
            </dl>
          </li>
        </ul>
        <div v-else class="empty-state">
          <Icon name="git-branch" :size="48" aria-hidden="true" />
          <p>暂无分支</p>
          <p class="empty-hint">默认 main 分支在首次提交时自动创建</p>
        </div>
      </section>

      <!-- ── 3. 差异对比 ── -->
      <section
        v-show="activeTab === 'diff'"
        id="panel-diff"
        role="tabpanel"
        aria-labelledby="tab-diff"
        class="panel"
      >
        <div class="diff-form">
          <div class="form-group">
            <label for="diff-from">源版本</label>
            <select id="diff-from" v-model="diffFromId">
              <option value="">选择版本…</option>
              <option v-for="v in store.history" :key="v.id" :value="v.id">
                {{ v.id }} · {{ shortMessage(v.message, 30) }}
              </option>
            </select>
          </div>
          <div class="diff-arrow" aria-hidden="true">→</div>
          <div class="form-group">
            <label for="diff-to">目标版本</label>
            <select id="diff-to" v-model="diffToId">
              <option value="">选择版本…</option>
              <option v-for="v in store.history" :key="v.id" :value="v.id">
                {{ v.id }} · {{ shortMessage(v.message, 30) }}
              </option>
            </select>
          </div>
          <button type="button" class="btn primary" @click="computeDiff">
            <Icon name="search" :size="14" aria-hidden="true" />
            对比
          </button>
        </div>

        <div v-if="diffResult" class="diff-result">
          <div class="diff-summary">
            <span>差异字段：<strong>{{ diffResult.changes }}</strong></span>
            <span v-if="diffResult.identical" class="badge success">完全相同</span>
          </div>

          <ul v-if="diffResult.fields.length > 0" class="diff-list" role="list">
            <li
              v-for="field in diffResult.fields"
              :key="field.path"
              class="diff-item"
              :data-type="field.type"
            >
              <div class="diff-header">
                <span class="badge" :data-type="field.type">{{ diffTypeLabel(field.type) }}</span>
                <span class="diff-label">{{ field.label }}</span>
                <span class="diff-path">{{ field.path }}</span>
              </div>
              <div class="diff-values">
                <div class="diff-old">
                  <span class="diff-tag">旧</span>
                  <pre class="diff-pre">{{ formatDiffValue(field.oldValue) }}</pre>
                </div>
                <div class="diff-new">
                  <span class="diff-tag">新</span>
                  <pre class="diff-pre">{{ formatDiffValue(field.newValue) }}</pre>
                </div>
              </div>
            </li>
          </ul>
        </div>
        <div v-else class="empty-state">
          <Icon name="git-branch" :size="48" aria-hidden="true" />
          <p>选择两个版本进行对比</p>
          <p class="empty-hint">差异对比展示字段级变更，便于审计版本演进</p>
        </div>
      </section>

      <!-- ── 4. 合并 ── -->
      <section
        v-show="activeTab === 'merge'"
        id="panel-merge"
        role="tabpanel"
        aria-labelledby="tab-merge"
        class="panel"
      >
        <div v-if="store.hasPendingConflicts" class="conflict-banner" role="alert">
          <Icon name="alert-triangle" :size="20" aria-hidden="true" />
          <div>
            <strong>有未解决的合并冲突</strong>
            <p>共 {{ store.pendingConflicts?.conflicts.length }} 个字段需要手动解决</p>
          </div>
          <button type="button" class="btn primary" @click="conflictModalOpen = true">
            <Icon name="check" :size="14" aria-hidden="true" />
            解决冲突
          </button>
          <button type="button" class="btn" @click="onCancelMerge">取消合并</button>
        </div>

        <div class="merge-form">
          <h2 class="section-title">合并分支到当前分支</h2>
          <p class="section-hint">
            当前分支：<strong>{{ store.currentRepoInfo?.currentBranch ?? '—' }}</strong>
          </p>

          <div class="form-group">
            <label for="merge-source">选择源分支</label>
            <select id="merge-source" v-model="mergeSourceBranch">
              <option value="">选择分支…</option>
              <option
                v-for="b in store.branches.filter(b => b.name !== store.currentRepoInfo?.currentBranch)"
                :key="b.name"
                :value="b.name"
              >
                {{ b.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="merge-msg">提交信息（可选）</label>
            <input
              id="merge-msg"
              v-model="mergeMessage"
              type="text"
              placeholder="如：合并 dev 分支的修改"
            />
          </div>

          <button
            type="button"
            class="btn primary"
            :disabled="!mergeSourceBranch"
            @click="handleMerge"
          >
            <Icon name="git-branch" :size="14" aria-hidden="true" />
            合并
          </button>

          <div class="merge-explain">
            <h3>合并说明</h3>
            <ul>
              <li>采用基于共同祖先的三方合并算法</li>
              <li>若仅一方修改某字段，自动采用修改后的值</li>
              <li>若双方修改同一字段且不同，标记冲突由用户手动选择</li>
              <li>合并成功后自动在当前分支创建一个新提交</li>
              <li>冲突时不会创建提交，需先解决冲突</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ── 5. 设置 ── -->
      <section
        v-show="activeTab === 'settings'"
        id="panel-settings"
        role="tabpanel"
        aria-labelledby="tab-settings"
        class="panel"
      >
        <div class="settings-section">
          <h2 class="section-title">当前操作者</h2>
          <p class="section-hint">
            由于项目无后端，"多人协作" 通过切换操作者模拟。
            切换后提交/锁定/分支操作将以新操作者身份进行。
          </p>
          <div class="form-grid">
            <div class="form-row">
              <label for="author-name">名称</label>
              <input id="author-name" v-model="authorName" type="text" maxlength="30" />
            </div>
            <div class="form-row">
              <label for="author-avatar">头像 URL（可选）</label>
              <input id="author-avatar" v-model="authorAvatar" type="url" />
            </div>
          </div>
          <button type="button" class="btn primary" @click="saveAuthor">
            <Icon name="save" :size="14" aria-hidden="true" />
            保存
          </button>
        </div>

        <div class="settings-section">
          <h2 class="section-title">操作锁</h2>
          <p class="section-hint">
            操作锁防止多人并发编辑同一字段。本地模拟多用户场景下，
            切换作者后可观察到他人持有的锁。
          </p>
          <div v-if="store.currentRepoInfo && store.currentRepoInfo.activeLocks.length > 0">
            <h3>当前活跃锁</h3>
            <ul class="lock-list" role="list">
              <li
                v-for="lock in store.currentRepoInfo?.activeLocks"
                :key="lock.fieldPath + lock.holder.name"
                class="lock-item"
              >
                <span class="lock-field">{{ lock.fieldPath === '*' ? '全部字段' : lock.fieldPath }}</span>
                <span class="lock-holder">{{ lock.holder.name }}</span>
                <span class="lock-time">至 {{ formatTime(lock.expiresAt) }}</span>
              </li>
            </ul>
          </div>
          <p v-else class="muted">当前无活跃锁</p>

          <div class="action-row">
            <button type="button" class="btn" @click="handleAcquireLock">
              <Icon name="check" :size="14" aria-hidden="true" />
              获取全字段锁
            </button>
            <button type="button" class="btn" @click="handleReleaseAllLocks">
              <Icon name="x-circle" :size="14" aria-hidden="true" />
              释放我的锁
            </button>
            <button type="button" class="btn" @click="handlePurgeExpiredLocks">
              <Icon name="trash-2" :size="14" aria-hidden="true" />
              清理过期锁
            </button>
          </div>
        </div>

        <div class="settings-section danger-zone">
          <h2 class="section-title">危险操作</h2>
          <p class="section-hint">
            删除当前角色的全部版本仓库，包括所有分支与提交历史。操作不可恢复。
          </p>
          <button
            type="button"
            class="btn danger-outline"
            :disabled="!store.currentCharacterId"
            @click="handleDeleteRepository"
          >
            <Icon name="trash-2" :size="14" aria-hidden="true" />
            删除此角色版本仓库
          </button>
        </div>
      </section>
    </main>

    <!-- ── 提交 Modal ── -->
    <Modal
      :model-value="commitModalOpen"
      title="提交新版本"
      @update:model-value="commitModalOpen = $event"
    >
      <p class="modal-hint">
        将当前角色「{{ currentCharacter?.name }}」的状态保存为新版本提交。
        提交后无法修改，但可创建后续版本或回滚到此版本。
      </p>
      <div class="form-group">
        <label for="commit-msg-input">提交信息</label>
        <textarea
          id="commit-msg-input"
          v-model="commitMessage"
          rows="3"
          placeholder="简述本次修改，如：增加角色背景故事"
        />
      </div>
      <template #footer>
        <button type="button" class="btn" @click="commitModalOpen = false">取消</button>
        <button type="button" class="btn primary" @click="onCommitSubmit">
          <Icon name="check" :size="14" aria-hidden="true" />
          确认提交
        </button>
      </template>
    </Modal>

    <!-- ── 创建分支 Modal ── -->
    <Modal
      :model-value="branchModalOpen"
      title="新建分支"
      @update:model-value="branchModalOpen = $event"
    >
      <div class="form-group">
        <label for="branch-name-input">分支名</label>
        <input
          id="branch-name-input"
          v-model="newBranchName"
          type="text"
          placeholder="如：dev / rewrite / alt-ending"
          maxlength="32"
        />
        <small class="form-hint">仅允许字母数字下划线连字符，长度 1-32</small>
      </div>
      <div class="form-group">
        <label for="branch-from-input">从分支创建</label>
        <select id="branch-from-input" v-model="newBranchFrom">
          <option v-for="b in store.branches" :key="b.name" :value="b.name">
            {{ b.name }}
          </option>
        </select>
      </div>
      <template #footer>
        <button type="button" class="btn" @click="branchModalOpen = false">取消</button>
        <button type="button" class="btn primary" @click="onCreateBranchSubmit">
          <Icon name="check" :size="14" aria-hidden="true" />
          创建
        </button>
      </template>
    </Modal>

    <!-- ── 查看快照 Modal ── -->
    <Modal
      :model-value="snapshotModalOpen"
      :title="snapshotViewing ? `版本 ${snapshotViewing.id} 快照` : '版本快照'"
      @update:model-value="snapshotModalOpen = $event"
    >
      <div v-if="snapshotViewing" class="snapshot-grid">
        <div class="snapshot-row">
          <span class="snapshot-label">分支</span>
          <span class="snapshot-value">{{ snapshotViewing.branch }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">作者</span>
          <span class="snapshot-value">{{ snapshotViewing.author.name }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">提交时间</span>
          <span class="snapshot-value">{{ formatTime(snapshotViewing.timestamp) }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">提交信息</span>
          <span class="snapshot-value">{{ snapshotViewing.message }}</span>
        </div>
        <div class="snapshot-divider" />
        <div class="snapshot-row">
          <span class="snapshot-label">名称</span>
          <span class="snapshot-value">{{ snapshotViewing.snapshot.name }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">描述</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.description) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">性格</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.personality) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">场景</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.scenario) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">首条消息</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.firstMessage) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">标签</span>
          <span class="snapshot-value">{{ snapshotViewing.snapshot.tags.join('、') || '—' }}</span>
        </div>
      </div>
    </Modal>

    <!-- ── 解决冲突 Modal ── -->
    <Modal
      :model-value="conflictModalOpen"
      title="解决合并冲突"
      :dismissible="false"
      @update:model-value="conflictModalOpen = $event"
    >
      <p class="modal-hint">
        以下字段在源分支与当前分支均被修改，请逐个选择保留哪个版本。
      </p>
      <ul v-if="store.pendingConflicts" class="conflict-list" role="list">
        <li
          v-for="c in store.pendingConflicts.conflicts"
          :key="c.path"
          class="conflict-item"
        >
          <div class="conflict-header">
            <strong>{{ c.label }}</strong>
            <code class="conflict-path">{{ c.path }}</code>
          </div>
          <div class="conflict-options" role="radiogroup" :aria-label="c.label">
            <label class="conflict-option">
              <input
                type="radio"
                :name="`conflict-${c.path}`"
                value="current"
                v-model="conflictResolutions[c.path]"
              />
              <span class="conflict-tag">当前</span>
              <pre class="conflict-pre">{{ formatSnapshotField(c.currentValue) }}</pre>
            </label>
            <label class="conflict-option">
              <input
                type="radio"
                :name="`conflict-${c.path}`"
                value="source"
                v-model="conflictResolutions[c.path]"
              />
              <span class="conflict-tag">源分支</span>
              <pre class="conflict-pre">{{ formatSnapshotField(c.sourceValue) }}</pre>
            </label>
          </div>
        </li>
      </ul>
      <template #footer>
        <button type="button" class="btn" @click="onCancelMerge">取消合并</button>
        <button type="button" class="btn primary" @click="onResolveConflictsSubmit">
          <Icon name="check" :size="14" aria-hidden="true" />
          提交解决结果
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
}

.header-tag {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-btn {
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

.header-btn:hover {
  background: var(--card-elevated);
}

.header-btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.header-btn.primary:hover {
  filter: brightness(1.1);
}

.header-field {
  display: inline-flex;
}

.header-select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
}

.header-select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
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

.tab:hover {
  color: var(--foreground);
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

/* Body */
.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.panel {
  max-width: 960px;
  margin: 0 auto;
}

.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.panel-hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  flex: 1;
  min-width: 200px;
}

.panel-hint strong {
  color: var(--primary-fg, var(--primary));
}

/* Buttons */
.btn {
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

.btn:hover {
  background: var(--card-elevated);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn.danger-outline {
  color: var(--danger-fg);
  border-color: var(--danger-border);
}

.btn.danger-outline:hover:not(:disabled) {
  background: var(--danger-bg);
}

.icon-btn {
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
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--card-elevated);
  color: var(--foreground);
}

.icon-btn.danger:hover {
  color: var(--danger-fg);
  background: var(--danger-bg);
}

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-weight: 500;
}

.badge.head {
  background: var(--primary);
  color: var(--on-primary);
}

.badge.branch {
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.badge.default {
  background: var(--primary-fg, var(--primary));
  color: var(--on-accent);
}

.badge.current {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.badge.locked {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

.badge.success {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.badge[data-type='added'] {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.badge[data-type='removed'] {
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.badge[data-type='modified'] {
  background: var(--warning-bg);
  color: var(--warning-fg);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted-foreground);
  text-align: center;
  gap: 8px;
}

.empty-state p {
  margin: 0;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.8;
}

/* Commit list */
.commit-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.commit-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  position: relative;
}

.commit-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 9px;
  top: 36px;
  bottom: 0;
  width: 2px;
  background: var(--border);
}

.commit-dot {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--card-elevated);
  color: var(--muted-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.commit-item.head .commit-dot {
  background: var(--primary);
  color: var(--on-primary);
}

.commit-main {
  flex: 1;
  min-width: 0;
}

.commit-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.commit-id {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--muted-foreground);
}

.commit-msg {
  margin: 4px 0;
  font-size: 14px;
  color: var(--foreground);
}

.commit-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.meta-author {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.commit-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

/* Branch list */
.branch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.branch-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  transition: border-color 0.15s;
}

.branch-card.current {
  border-color: var(--primary-fg, var(--primary));
}

.branch-card.locked {
  opacity: 0.7;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: var(--foreground);
}

.card-actions {
  display: flex;
  gap: 4px;
}

.card-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 6px 12px;
  margin: 8px 0 0;
}

.card-meta dt {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

.card-meta dd {
  margin: 0;
  font-size: 12px;
  color: var(--foreground);
  font-family: var(--font-mono, monospace);
}

/* Diff form */
.diff-form {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
  margin-bottom: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.diff-arrow {
  font-size: 20px;
  color: var(--muted-foreground);
  padding-bottom: 8px;
}

.diff-result {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.diff-summary {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  color: var(--muted-foreground);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.diff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diff-item {
  border-left: 3px solid var(--border);
  padding-left: 10px;
}

.diff-item[data-type='added'] {
  border-left-color: var(--success-fg, #22c55e);
}

.diff-item[data-type='removed'] {
  border-left-color: var(--danger-fg);
}

.diff-item[data-type='modified'] {
  border-left-color: var(--warning-fg);
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.diff-label {
  font-weight: 600;
  color: var(--foreground);
}

.diff-path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--muted-foreground);
}

.diff-values {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.diff-old,
.diff-new {
  background: var(--card-elevated);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diff-tag {
  font-size: 10px;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.diff-pre {
  margin: 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--foreground);
  max-height: 120px;
  overflow-y: auto;
}

/* Merge form */
.merge-form {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}

.section-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--muted-foreground);
}

.section-hint strong {
  color: var(--primary-fg, var(--primary));
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-group label {
  font-size: 13px;
  color: var(--foreground);
  font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

.form-group input:focus-visible,
.form-group select:focus-visible,
.form-group textarea:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.form-hint {
  font-size: 11px;
  color: var(--muted-foreground);
}

.merge-explain {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.merge-explain h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--foreground);
}

.merge-explain ul {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.merge-explain li {
  margin-bottom: 4px;
}

.conflict-banner {
  display: flex;
  gap: 12px;
  align-items: center;
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin-bottom: 16px;
  color: var(--warning-fg);
}

.conflict-banner p {
  margin: 0;
  font-size: 12px;
}

.conflict-banner button {
  margin-left: auto;
}

/* Settings sections */
.settings-section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.settings-section.danger-zone {
  border-color: var(--danger-border);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.form-row input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--foreground);
  font-size: 13px;
}

.form-row input:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.action-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.muted {
  color: var(--muted-foreground);
  font-size: 13px;
}

.lock-list {
  list-style: none;
  margin: 8px 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lock-item {
  display: grid;
  grid-template-columns: 100px 1fr 1fr;
  gap: 8px;
  padding: 6px 8px;
  background: var(--card-elevated);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.lock-field {
  font-weight: 500;
  color: var(--foreground);
}

.lock-holder {
  color: var(--primary-fg, var(--primary));
}

.lock-time {
  color: var(--muted-foreground);
}

/* Modal content */
.modal-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted-foreground);
}

.snapshot-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snapshot-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 12px;
  align-items: start;
  font-size: 13px;
}

.snapshot-label {
  color: var(--muted-foreground);
}

.snapshot-value {
  color: var(--foreground);
}

.snapshot-pre {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--foreground);
  max-height: 120px;
  overflow-y: auto;
  background: var(--card-elevated);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.snapshot-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

/* Conflict list in modal */
.conflict-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.conflict-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px;
}

.conflict-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.conflict-path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--muted-foreground);
}

.conflict-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.conflict-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.conflict-option:has(input:checked) {
  border-color: var(--primary);
  background: var(--primary-bg, rgba(99, 102, 241, 0.05));
}

.conflict-tag {
  font-size: 11px;
  color: var(--muted-foreground);
  text-transform: uppercase;
}

.conflict-pre {
  margin: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--foreground);
  max-height: 80px;
  overflow-y: auto;
}

/* Responsive */
@media (max-width: 767px) {
  .diff-values,
  .conflict-options,
  .lock-item {
    grid-template-columns: 1fr;
  }
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .header-actions {
    justify-content: stretch;
  }
}
</style>
