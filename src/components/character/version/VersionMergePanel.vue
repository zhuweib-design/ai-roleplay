<script setup lang="ts">
/**
 * VersionMergePanel — Tab 4 合并（R2-2 从 CharacterVersionView 拆出）
 *
 * 源分支选择 + 合并说明 + 冲突解决 Modal。
 *
 * 冲突 Modal 跟着本面板走：它由 `store.pendingConflicts` 的变化驱动（合并失败时
 * store 里留下冲突清单），而合并动作只在这里发起。状态若提到宿主，就要多两条
 * "面板 → 宿主 → Modal"的转发，反而更容易漏。
 *
 * `dismissible=false`：冲突清单必须逐个选完再提交，点遮罩关掉会让 store 里的
 * pendingConflicts 悬空（下次切 Tab 又弹回来）。
 */
import { ref, watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import { useCharacterVersionStore } from '@/stores/character-version';
import { formatSnapshotField } from './version-format';
import { t } from '@/i18n';

const store = useCharacterVersionStore();

const emit = defineEmits<{
  notify: [type: 'info' | 'success' | 'error', message: string];
}>();

const mergeSourceBranch = ref<string>('');
const mergeMessage = ref('');

function handleMerge(): void {
  if (!mergeSourceBranch.value) {
    emit('notify', 'error', t('cv.needMergeSource'));
    return;
  }
  if (mergeSourceBranch.value === store.currentRepoInfo?.currentBranch) {
    emit('notify', 'error', t('cv.cannotMergeSelf'));
    return;
  }
  const ok = store.mergeBranch(mergeSourceBranch.value, mergeMessage.value || undefined);
  mergeMessage.value = '';
  if (ok) {
    emit('notify', 'success', t('cv.mergeSuccess'));
  } else if (store.pendingConflicts) {
    // 冲突 → 不需要切 Tab，直接弹 Modal
    emit('notify', 'error', t('cv.mergeConflicts', { count: store.pendingConflicts.conflicts.length }));
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
  if (ok) emit('notify', 'success', t('cv.conflictsResolved'));
}

function onCancelMerge(): void {
  store.cancelMerge();
  emit('notify', 'info', t('cv.mergeCancelled'));
}
</script>

<template>
  <section
    id="panel-merge"
    role="tabpanel"
    aria-labelledby="tab-merge"
    class="panel"
  >
    <div v-if="store.hasPendingConflicts" class="conflict-banner" role="alert">
      <Icon name="alert-triangle" :size="20" aria-hidden="true" />
      <div>
        <strong>{{ t('cv.conflictBanner') }}</strong>
        <p>{{ t('cv.conflictCount', { count: store.pendingConflicts?.conflicts.length ?? 0 }) }}</p>
      </div>
      <button type="button" class="btn primary" @click="conflictModalOpen = true">
        <Icon name="check" :size="14" aria-hidden="true" />
        {{ t('cv.resolveConflicts') }}
      </button>
      <button type="button" class="btn" @click="onCancelMerge">{{ t('cv.cancelMerge') }}</button>
    </div>

    <div class="merge-form">
      <h2 class="section-title">{{ t('cv.mergeTitle') }}</h2>
      <p class="section-hint">
        {{ t('cv.mergeCurrentBranch', { branch: store.currentRepoInfo?.currentBranch ?? '—' }) }}
      </p>

      <div class="form-group">
        <label for="merge-source">{{ t('cv.mergeSource') }}</label>
        <select id="merge-source" v-model="mergeSourceBranch">
          <option value="">{{ t('cv.selectBranch') }}</option>
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
        <label for="merge-msg">{{ t('cv.mergeMessage') }}</label>
        <input
          id="merge-msg"
          v-model="mergeMessage"
          type="text"
          :placeholder="t('cv.mergeMessagePlaceholder')"
        />
      </div>

      <button
        type="button"
        class="btn primary"
        :disabled="!mergeSourceBranch"
        @click="handleMerge"
      >
        <Icon name="git-branch" :size="14" aria-hidden="true" />
        {{ t('cv.mergeBtn') }}
      </button>

      <div class="merge-explain">
        <h3>{{ t('cv.mergeExplainTitle') }}</h3>
        <ul>
          <li>{{ t('cv.mergeExplain1') }}</li>
          <li>{{ t('cv.mergeExplain2') }}</li>
          <li>{{ t('cv.mergeExplain3') }}</li>
          <li>{{ t('cv.mergeExplain4') }}</li>
          <li>{{ t('cv.mergeExplain5') }}</li>
        </ul>
      </div>
    </div>

    <!-- ── 解决冲突 Modal ── -->
    <Modal
      :model-value="conflictModalOpen"
      :title="t('cv.conflictTitle')"
      :dismissible="false"
      described-by="cv-conflict-desc"
      @update:model-value="conflictModalOpen = $event"
    >
      <p id="cv-conflict-desc" class="modal-hint">
        {{ t('cv.conflictHint') }}
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
              <span class="conflict-tag">{{ t('cv.conflictCurrent') }}</span>
              <pre class="conflict-pre">{{ formatSnapshotField(c.currentValue) }}</pre>
            </label>
            <label class="conflict-option">
              <input
                type="radio"
                :name="`conflict-${c.path}`"
                value="source"
                v-model="conflictResolutions[c.path]"
              />
              <span class="conflict-tag">{{ t('cv.conflictSource') }}</span>
              <pre class="conflict-pre">{{ formatSnapshotField(c.sourceValue) }}</pre>
            </label>
          </div>
        </li>
      </ul>
      <template #footer>
        <button type="button" class="btn" @click="onCancelMerge">{{ t('cv.cancelMerge') }}</button>
        <button type="button" class="btn primary" @click="onResolveConflictsSubmit">
          <Icon name="check" :size="14" aria-hidden="true" />
          {{ t('cv.submitResolution') }}
        </button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
/* Merge form(P2-6: 对齐设置页卡片) */
.merge-form {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
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

@media (max-width: 640px) {
  .conflict-options {
    grid-template-columns: 1fr;
  }
}
</style>
