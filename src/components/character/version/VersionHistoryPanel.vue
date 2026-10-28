<script setup lang="ts">
/**
 * VersionHistoryPanel — Tab 1 版本历史（R2-2 从 CharacterVersionView 拆出）
 *
 * 当前分支的提交链 + 三个动作：看快照、回滚、与 HEAD 对比。
 * 快照 Modal 跟着本面板走——只有这里能打开它，状态放宿主反而要多两层 props。
 *
 * 「与 HEAD 对比」不是本面板能独立完成的：它要切到差异 Tab 并填好两个版本 id，
 * 所以只把 `compare` 事件抛给宿主，由宿主改 `activeTab` 与那对 id。
 */
import { ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Modal from '@/components/common/Modal.vue';
import { useCharacterVersionStore } from '@/stores/character-version';
import { formatSnapshotField, formatTime, shortMessage } from './version-format';
import type { CharacterVersion } from '@core/character-version-control';
import { t } from '@/i18n';

const store = useCharacterVersionStore();

const emit = defineEmits<{
  notify: [type: 'info' | 'success' | 'error', message: string];
  /** 打开提交 Modal（宿主持有，因为页头也能开） */
  commit: [];
  /** 与 HEAD 对比：切到差异 Tab 并填好 from/to */
  compare: [fromId: string, toId: string];
}>();

// ── 查看快照 Modal ──
const snapshotModalOpen = ref(false);
const snapshotViewing = ref<CharacterVersion | null>(null);

function viewSnapshot(version: CharacterVersion): void {
  snapshotViewing.value = version;
  snapshotModalOpen.value = true;
}

function handleRollback(version: CharacterVersion): void {
  if (
    !confirm(
      t('cv.rollbackConfirm', { id: version.id })
    )
  ) {
    return;
  }
  const ok = store.rollbackTo(version.id);
  if (ok) emit('notify', 'success', t('cv.rolledBack'));
}

function compareWithHead(version: CharacterVersion): void {
  emit('compare', version.id, store.headVersion?.id ?? '');
}
</script>

<template>
  <section
    id="panel-history"
    role="tabpanel"
    aria-labelledby="tab-history"
    class="panel"
  >
    <div class="panel-toolbar">
      <p class="panel-hint">
        {{ t('cv.currentBranch', { branch: store.currentRepoInfo?.currentBranch ?? '—' }) }}
        ·
        {{ t('cv.commitCount', { count: store.history.length }) }}
      </p>
      <button type="button" class="btn primary" @click="emit('commit')">
        <Icon name="plus" :size="14" aria-hidden="true" />
        {{ t('cv.newCommit') }}
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
            <span v-if="idx === 0" class="badge head">{{ t('cv.headBadge') }}</span>
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
              :aria-label="t('cv.viewSnapshot')"
              @click="viewSnapshot(v)"
            >
              <Icon name="eye" :size="14" aria-hidden="true" />
              {{ t('cv.view') }}
            </button>
            <button
              v-if="idx > 0"
              type="button"
              class="icon-btn"
              :aria-label="t('cv.rollbackAria')"
              @click="handleRollback(v)"
            >
              <Icon name="refresh-cw" :size="14" aria-hidden="true" />
              {{ t('cv.rollback') }}
            </button>
            <button
              v-if="idx > 0"
              type="button"
              class="icon-btn"
              :aria-label="t('cv.compareHeadAria')"
              @click="compareWithHead(v)"
            >
              <Icon name="git-branch" :size="14" aria-hidden="true" />
              {{ t('cv.compareHead') }}
            </button>
          </div>
        </div>
      </li>
    </ol>
    <EmptyState
      v-else
      title-key="cv.noHistory"
      desc-key="cv.noHistoryHint"
      icon="file"
    />

    <!-- ── 查看快照 Modal ── -->
    <Modal
      :model-value="snapshotModalOpen"
      :title="snapshotViewing ? t('cv.snapshotTitle', { id: snapshotViewing.id }) : t('cv.snapshotTitleGeneric')"
      @update:model-value="snapshotModalOpen = $event"
    >
      <div v-if="snapshotViewing" class="snapshot-grid">
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotBranch') }}</span>
          <span class="snapshot-value">{{ snapshotViewing.branch }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotAuthor') }}</span>
          <span class="snapshot-value">{{ snapshotViewing.author.name }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotTime') }}</span>
          <span class="snapshot-value">{{ formatTime(snapshotViewing.timestamp) }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotMessage') }}</span>
          <span class="snapshot-value">{{ snapshotViewing.message }}</span>
        </div>
        <div class="snapshot-divider" />
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotName') }}</span>
          <span class="snapshot-value">{{ snapshotViewing.snapshot.name }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotDesc') }}</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.description) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotPersonality') }}</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.personality) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotScenario') }}</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.scenario) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotFirstMessage') }}</span>
          <pre class="snapshot-pre">{{ formatSnapshotField(snapshotViewing.snapshot.firstMessage) }}</pre>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">{{ t('cv.snapshotTags') }}</span>
          <span class="snapshot-value">{{ snapshotViewing.snapshot.tags.join('、') || '—' }}</span>
        </div>
      </div>
    </Modal>
  </section>
</template>

<style scoped>
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

/* 快照 Modal */
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
</style>
