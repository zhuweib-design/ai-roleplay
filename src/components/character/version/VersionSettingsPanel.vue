<script setup lang="ts">
/**
 * VersionSettingsPanel — Tab 5 设置（R2-2 从 CharacterVersionView 拆出）
 *
 * 三块：操作者身份（模拟多用户）、操作锁管理、危险区（删仓库）。
 *
 * 删除仓库要念角色名，所以宿主把 `characterName` 传进来；其余（作者、锁）都是本面板
 * 自己的表单状态。删仓库仍是原生 `confirm`——破坏性动作换应用内 Modal 属于交互改版，
 * 不在拆分范围内。
 */
import { ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { useCharacterVersionStore } from '@/stores/character-version';
import { formatTime } from './version-format';
import type { VersionAuthor } from '@core/character-version-control';
import { t } from '@/i18n';

const props = defineProps<{
  /** 当前仓库所属角色名（删除确认要念出来） */
  characterName: string;
  /** 有没有选中角色（决定删除键是否可点） */
  hasCharacter: boolean;
}>();

const emit = defineEmits<{
  notify: [type: 'info' | 'success' | 'error', message: string];
}>();

const store = useCharacterVersionStore();

// ── 设置：操作者切换 ──
const authorName = ref(store.author.name);
const authorAvatar = ref(store.author.avatar ?? '');

function saveAuthor(): void {
  const name = authorName.value.trim();
  if (!name) {
    emit('notify', 'error', t('cv.needAuthorName'));
    return;
  }
  const newAuthor: VersionAuthor = {
    name,
    avatar: authorAvatar.value || undefined,
  };
  store.setAuthor(newAuthor);
  emit('notify', 'success', t('cv.authorChanged', { name }));
}

// ── 操作锁 ──
function handleAcquireLock(): void {
  const ok = store.acquireLock('*');
  if (ok) emit('notify', 'success', t('cv.lockAcquired'));
}

function handleReleaseAllLocks(): void {
  store.releaseAllLocks();
}

function handlePurgeExpiredLocks(): void {
  const n = store.purgeExpiredLocks();
  emit('notify', 'info', t('cv.locksPurged', { count: n }));
}

// ── 仓库管理 ──
function handleDeleteRepository(): void {
  if (!store.currentCharacterId) return;
  if (
    !confirm(
      t('cv.repoDeleteConfirm', { name: props.characterName })
    )
  ) {
    return;
  }
  const ok = store.deleteRepository(store.currentCharacterId);
  if (ok) emit('notify', 'success', t('cv.repoDeleted'));
}
</script>

<template>
  <section
    id="panel-settings"
    role="tabpanel"
    aria-labelledby="tab-settings"
    class="panel"
  >
    <div class="settings-section">
      <h2 class="section-title">{{ t('cv.settingsAuthor') }}</h2>
      <p class="section-hint">
        {{ t('cv.settingsAuthorHint') }}
      </p>
      <div class="form-grid">
        <div class="form-row">
          <label for="author-name">{{ t('cv.authorName') }}</label>
          <input id="author-name" v-model="authorName" type="text" maxlength="30" />
        </div>
        <div class="form-row">
          <label for="author-avatar">{{ t('cv.authorAvatar') }}</label>
          <input id="author-avatar" v-model="authorAvatar" type="url" />
        </div>
      </div>
      <button type="button" class="btn primary" @click="saveAuthor">
        <Icon name="save" :size="14" aria-hidden="true" />
        {{ t('cv.save') }}
      </button>
    </div>

    <div class="settings-section">
      <h2 class="section-title">{{ t('cv.settingsLocks') }}</h2>
      <p class="section-hint">
        {{ t('cv.settingsLocksHint') }}
      </p>
      <div v-if="store.currentRepoInfo && store.currentRepoInfo.activeLocks.length > 0">
        <h3>{{ t('cv.activeLocks') }}</h3>
        <ul class="lock-list" role="list">
          <li
            v-for="lock in store.currentRepoInfo?.activeLocks"
            :key="lock.fieldPath + lock.holder.name"
            class="lock-item"
          >
            <span class="lock-field">{{ lock.fieldPath === '*' ? t('cv.allFields') : lock.fieldPath }}</span>
            <span class="lock-holder">{{ lock.holder.name }}</span>
            <span class="lock-time">{{ t('cv.lockUntil', { time: formatTime(lock.expiresAt) }) }}</span>
          </li>
        </ul>
      </div>
      <p v-else class="muted">{{ t('cv.noActiveLocks') }}</p>

      <div class="action-row">
        <button type="button" class="btn" @click="handleAcquireLock">
          <Icon name="check" :size="14" aria-hidden="true" />
          {{ t('cv.acquireLock') }}
        </button>
        <button type="button" class="btn" @click="handleReleaseAllLocks">
          <Icon name="x-circle" :size="14" aria-hidden="true" />
          {{ t('cv.releaseLocks') }}
        </button>
        <button type="button" class="btn" @click="handlePurgeExpiredLocks">
          <Icon name="trash-2" :size="14" aria-hidden="true" />
          {{ t('cv.purgeLocks') }}
        </button>
      </div>
    </div>

    <div class="settings-section danger-zone">
      <h2 class="section-title">{{ t('cv.settingsDanger') }}</h2>
      <p class="section-hint">
        {{ t('cv.settingsDangerHint') }}
      </p>
      <button
        type="button"
        class="btn danger-outline"
        :disabled="!hasCharacter"
        @click="handleDeleteRepository"
      >
        <Icon name="trash-2" :size="14" aria-hidden="true" />
        {{ t('cv.deleteRepo') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
/* Settings sections(P2-6: 对齐设置页卡片: padding 20px + radius-lg) */
.settings-section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
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

@media (max-width: 640px) {
  .lock-item {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-row input {
    font-size: 16px;
  }
}
</style>
