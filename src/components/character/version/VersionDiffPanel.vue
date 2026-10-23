<script setup lang="ts">
/**
 * VersionDiffPanel — Tab 3 差异对比（R2-2 从 CharacterVersionView 拆出）
 *
 * 两个版本下拉 + 字段级 diff 列表。`fromId` / `toId` 由宿主 `v-model` 下来：
 * 历史 Tab 的「与 HEAD 对比」要预填这一对值再切过来，状态放本面板就填不进去。
 * `diffResult` 是本面板自己的——它只由"点对比"产生，不需要外部写。
 */
import { ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { useCharacterVersionStore } from '@/stores/character-version';
import { formatSnapshotField, shortMessage } from './version-format';
import type { VersionDiff } from '@core/character-version-control';
import { t } from '@/i18n';

const store = useCharacterVersionStore();

const fromId = defineModel<string>('fromId', { required: true });
const toId = defineModel<string>('toId', { required: true });

const emit = defineEmits<{
  notify: [type: 'info' | 'success' | 'error', message: string];
}>();

const diffResult = ref<VersionDiff | null>(null);

function computeDiff(): void {
  if (!fromId.value || !toId.value) {
    emit('notify', 'error', t('cv.needTwoVersions'));
    return;
  }
  if (fromId.value === toId.value) {
    emit('notify', 'error', t('cv.needDifferentVersions'));
    return;
  }
  const result = store.diff(fromId.value, toId.value);
  if (result) {
    diffResult.value = result;
    emit(
      'notify',
      'info',
      result.identical ? t('cv.identicalVersions') : t('cv.diffChanges', { count: result.changes })
    );
  }
}

function diffTypeLabel(type: 'added' | 'removed' | 'modified'): string {
  return type === 'added' ? t('cv.diffAdded') : type === 'removed' ? t('cv.diffRemoved') : t('cv.diffModified');
}
</script>

<template>
  <section
    id="panel-diff"
    role="tabpanel"
    aria-labelledby="tab-diff"
    class="panel"
  >
    <div class="diff-form">
      <div class="form-group">
        <label for="diff-from">{{ t('cv.diffFrom') }}</label>
        <select id="diff-from" v-model="fromId">
          <option value="">{{ t('cv.selectVersion') }}</option>
          <option v-for="v in store.history" :key="v.id" :value="v.id">
            {{ v.id }} · {{ shortMessage(v.message, 30) }}
          </option>
        </select>
      </div>
      <div class="diff-arrow" aria-hidden="true">→</div>
      <div class="form-group">
        <label for="diff-to">{{ t('cv.diffTo') }}</label>
        <select id="diff-to" v-model="toId">
          <option value="">{{ t('cv.selectVersion') }}</option>
          <option v-for="v in store.history" :key="v.id" :value="v.id">
            {{ v.id }} · {{ shortMessage(v.message, 30) }}
          </option>
        </select>
      </div>
      <button type="button" class="btn primary" @click="computeDiff">
        <Icon name="search" :size="14" aria-hidden="true" />
        {{ t('cv.diffBtn') }}
      </button>
    </div>

    <div v-if="diffResult" class="diff-result">
      <div class="diff-summary">
        <span>{{ t('cv.diffFields', { count: diffResult.changes }) }}</span>
        <span v-if="diffResult.identical" class="badge success">{{ t('cv.diffIdentical') }}</span>
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
              <span class="diff-tag">{{ t('cv.diffOld') }}</span>
              <pre class="diff-pre">{{ formatSnapshotField(field.oldValue) }}</pre>
            </div>
            <div class="diff-new">
              <span class="diff-tag">{{ t('cv.diffNew') }}</span>
              <pre class="diff-pre">{{ formatSnapshotField(field.newValue) }}</pre>
            </div>
          </div>
        </li>
      </ul>
    </div>
    <EmptyState
      v-else
      title-key="cv.diffEmpty"
      desc-key="cv.diffEmptyHint"
      icon="git-branch"
    />
  </section>
</template>

<style scoped>
/* Diff form(P2-6: 对齐设置页卡片观感) */
.diff-form {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
  margin-bottom: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
}

.diff-arrow {
  font-size: 20px;
  color: var(--muted-foreground);
  padding-bottom: 8px;
}

/* Diff result(P2-6: 对齐设置页卡片观感) */
.diff-result {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
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

@media (max-width: 640px) {
  .diff-values {
    grid-template-columns: 1fr;
  }
}
</style>
