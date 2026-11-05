<script setup lang="ts">
/**
 * VersionBranchPanel — Tab 2 分支（R2-2 从 CharacterVersionView 拆出）
 *
 * 分支列表 + 切/删/锁 + 新建分支 Modal。四个动作都只影响分支，与历史、差异、
 * 合并三块没有共享状态，所以整块连同它唯一的那扇 Modal 一起搬。
 *
 * 删除与"带着冲突切分支"仍用原生 `confirm`：这两处是破坏性动作，改成应用内 Modal
 * 属于交互改版，不在拆分范围内。
 */
import { ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Modal from '@/components/common/Modal.vue';
import { useCharacterVersionStore } from '@/stores/character-version';
import { isValidBranchName } from '@core/character-version-control';
import { formatTime } from './version-format';
import { t } from '@/i18n';

const store = useCharacterVersionStore();

const emit = defineEmits<{
  notify: [type: 'info' | 'success' | 'error', message: string];
}>();

// ── 新建分支 Modal ──
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
    emit('notify', 'error', t('cv.needBranchName'));
    return;
  }
  if (!isValidBranchName(name)) {
    emit('notify', 'error', t('cv.invalidBranchName'));
    return;
  }
  const ok = store.createBranch(name, newBranchFrom.value || undefined);
  branchModalOpen.value = false;
  if (ok) emit('notify', 'success', t('cv.branchCreated', { name }));
}

function handleSwitchBranch(name: string): void {
  if (
    store.pendingConflicts &&
    !confirm(t('cv.branchSwitchConflict'))
  ) {
    return;
  }
  const ok = store.switchBranch(name);
  if (ok) emit('notify', 'success', t('cv.branchSwitched', { name }));
}

function handleDeleteBranch(name: string): void {
  if (!confirm(t('cv.branchDeleteConfirm', { name }))) return;
  const ok = store.deleteBranch(name);
  if (ok) emit('notify', 'success', t('cv.branchDeleted', { name }));
}

function handleToggleLock(name: string): void {
  store.toggleBranchLock(name);
}
</script>

<template>
  <section
    id="panel-branches"
    role="tabpanel"
    aria-labelledby="tab-branches"
    class="panel"
  >
    <div class="panel-toolbar">
      <p class="panel-hint">{{ t('cv.branchesHint') }}</p>
      <button type="button" class="btn primary" @click="openCreateBranchModal">
        <Icon name="plus" :size="14" aria-hidden="true" />
        {{ t('cv.newBranch') }}
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
            <span v-if="b.isDefault" class="badge default">{{ t('cv.branchDefault') }}</span>
            <span v-if="b.name === store.currentRepoInfo?.currentBranch" class="badge current">{{ t('cv.branchCurrent') }}</span>
            <span v-if="b.locked" class="badge locked">{{ t('cv.branchLocked') }}</span>
          </div>
          <div class="card-actions">
            <button
              type="button"
              class="icon-btn"
              :aria-label="b.locked ? t('cv.unlockAria') : t('cv.lockAria')"
              @click="handleToggleLock(b.name)"
            >
              <Icon :name="b.locked ? 'eye-off' : 'eye'" :size="14" aria-hidden="true" />
            </button>
            <button
              v-if="b.name !== store.currentRepoInfo?.currentBranch"
              type="button"
              class="icon-btn"
              :aria-label="t('cv.switchBranchAria')"
              @click="handleSwitchBranch(b.name)"
            >
              <Icon name="refresh-cw" :size="14" aria-hidden="true" />
              {{ t('cv.switchBranch') }}
            </button>
            <button
              v-if="!b.isDefault && b.name !== store.currentRepoInfo?.currentBranch"
              type="button"
              class="icon-btn danger"
              :aria-label="t('cv.deleteAria')"
              @click="handleDeleteBranch(b.name)"
            >
              <Icon name="trash-2" :size="14" aria-hidden="true" />
            </button>
          </div>
        </div>
        <dl class="card-meta">
          <div><dt>{{ t('cv.head') }}</dt><dd>{{ b.headId ?? '—' }}</dd></div>
          <div><dt>{{ t('cv.createdAt') }}</dt><dd>{{ formatTime(b.createdAt) }}</dd></div>
          <div><dt>{{ t('cv.createdBy') }}</dt><dd>{{ b.createdBy.name }}</dd></div>
        </dl>
      </li>
    </ul>
    <EmptyState
      v-else
      title-key="cv.noBranches"
      desc-key="cv.noBranchesHint"
      icon="git-branch"
    />

    <!-- ── 创建分支 Modal ── -->
    <Modal
      :model-value="branchModalOpen"
      :title="t('cv.branchTitle')"
      @update:model-value="branchModalOpen = $event"
    >
      <div class="form-group">
        <label for="branch-name-input">{{ t('cv.branchName') }}</label>
        <input
          id="branch-name-input"
          v-model="newBranchName"
          type="text"
          :placeholder="t('cv.branchNamePlaceholder')"
          maxlength="32"
        />
        <small class="form-hint">{{ t('cv.branchNameHint') }}</small>
      </div>
      <div class="form-group">
        <label for="branch-from-input">{{ t('cv.branchFrom') }}</label>
        <select id="branch-from-input" v-model="newBranchFrom">
          <option v-for="b in store.branches" :key="b.name" :value="b.name">
            {{ b.name }}
          </option>
        </select>
      </div>
      <template #footer>
        <button type="button" class="btn" @click="branchModalOpen = false">{{ t('cv.cancel') }}</button>
        <button type="button" class="btn primary" @click="onCreateBranchSubmit">
          <Icon name="check" :size="14" aria-hidden="true" />
          {{ t('cv.create') }}
        </button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
/* Branch list */
.branch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* P2-6: 对齐设置页卡片圆角 */
.branch-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
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
</style>
