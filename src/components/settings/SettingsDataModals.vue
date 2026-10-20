<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import MasterPasswordModal from '@/components/common/MasterPasswordModal.vue';
import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';
import { auditLogger } from '@/core/audit-log';
import { mpModalOpen, mpModalMode } from '@/utils/master-password-modal-state';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';
import {
  importResultModalOpen,
  lastImportResult,
  auditModalOpen,
  auditClearConfirmOpen,
} from './useDataPanelState';

/**
 * R3-2：数据面板的四扇弹窗——备份导入结果、审计日志查看、清空审计确认、主密码管理。
 *
 * 触发点在日常段（导入结果）与高级段（审计两扇），状态走 useDataPanelState 单例。
 * Modal 用 Teleport 传送到 body，所以这些样式必须写在弹窗自己所在的组件里，
 * 宿主或兄弟组件的 scoped / :deep() 都到不了。
 */

const AUDIT_ACTION_LABELS: Record<string, string> = {
  backup_export: t('settingsView.auditBackupExport'),
  backup_import: t('settingsView.auditBackupImport'),
  character_export_png: t('settingsView.auditCharPng'),
  character_export_v2: t('settingsView.auditCharV2'),
  character_import: t('settingsView.auditCharImport'),
  lorebook_export: t('settingsView.auditLorebookExport'),
  lorebook_import: t('settingsView.auditLorebookImport'),
  chat_export_md: t('settingsView.auditChatExport'),
  settings_reset: t('settingsView.auditSettingsReset'),
};

const auditEntries = computed(() => auditLogger.list());

function auditResultClass(r: string): string {
  return r === 'ok' ? 'audit-ok' : r === 'blocked' ? 'audit-blocked' : 'audit-error';
}

function auditResultLabel(r: string): string {
  if (r === 'ok') return t('settingsView.auditResultOk');
  if (r === 'blocked') return t('settingsView.auditResultBlocked');
  return t('settingsView.auditResultFailed');
}

function confirmClearAuditLog() {
  auditClearConfirmOpen.value = false;
  auditLogger.clear();
  showToast('success', t('settingsView.auditCleared'));
}

function handleMasterPasswordSuccess(): void {
  const labels: Record<MasterPasswordMode, string> = {
    setup: t('settingsView.mpSetup'),
    unlock: t('settingsView.mpUnlock'),
    change: t('settingsView.mpChange'),
  };
  showToast('success', labels[mpModalMode.value]);
}
</script>

<template>
  <!-- 导入结果 Modal -->
  <Modal
    v-model="importResultModalOpen"
    :title="t('settingsView.importResultTitle')"
  >
    <div v-if="lastImportResult" class="import-result">
      <p class="result-summary">{{ t('settingsView.importResultSummary') }}</p>
      <ul class="result-list">
        <li>
          <span class="result-key">{{ t('settingsView.importKeyCharacters') }}</span>
          <span class="result-value">
            {{ t('settingsView.importAdded', { n: lastImportResult.characters.added }) }} ·
            {{ t('settingsView.importOverwritten', { n: lastImportResult.characters.overwritten }) }} ·
            {{ t('settingsView.importSkipped', { n: lastImportResult.characters.skipped }) }}
          </span>
        </li>
        <li>
          <span class="result-key">{{ t('settingsView.importKeyChats') }}</span>
          <span class="result-value">
            {{ t('settingsView.importAdded', { n: lastImportResult.chats.added }) }} ·
            {{ t('settingsView.importOverwritten', { n: lastImportResult.chats.overwritten }) }} ·
            {{ t('settingsView.importSkipped', { n: lastImportResult.chats.skipped }) }}
          </span>
        </li>
        <li>
          <span class="result-key">{{ t('settingsView.importKeyLorebooks') }}</span>
          <span class="result-value">
            {{ t('settingsView.importAdded', { n: lastImportResult.lorebooks.added }) }} ·
            {{ t('settingsView.importOverwritten', { n: lastImportResult.lorebooks.overwritten }) }} ·
            {{ t('settingsView.importSkipped', { n: lastImportResult.lorebooks.skipped }) }}
          </span>
        </li>
        <li>
          <span class="result-key">{{ t('settingsView.importKeyGroups') }}</span>
          <span class="result-value">
            {{ t('settingsView.importAdded', { n: lastImportResult.groupChats.added }) }} ·
            {{ t('settingsView.importOverwritten', { n: lastImportResult.groupChats.overwritten }) }} ·
            {{ t('settingsView.importSkipped', { n: lastImportResult.groupChats.skipped }) }}
          </span>
        </li>
        <li>
          <span class="result-key">{{ t('settingsView.importKeyStories') }}</span>
          <span class="result-value">
            {{ t('settingsView.importAdded', { n: lastImportResult.stories.added }) }} ·
            {{ t('settingsView.importOverwritten', { n: lastImportResult.stories.overwritten }) }} ·
            {{ t('settingsView.importSkipped', { n: lastImportResult.stories.skipped }) }}
          </span>
        </li>
        <li>
          <span class="result-key">{{ t('settingsView.importKeySettings') }}</span>
          <span class="result-value">
            {{ lastImportResult.settingsUpdated ? t('settingsView.importUpdated') : t('settingsView.importUnchanged') }}
          </span>
        </li>
      </ul>
      <p
        v-if="lastImportResult.errors.length > 0"
        class="result-errors"
        role="alert"
      >
        <Icon name="alert-triangle" :size="14" />
        <span>{{ t('settingsView.importErrors', { n: lastImportResult.errors.length }) }}</span>
      </p>
      <ul v-if="lastImportResult.errors.length > 0" class="error-list">
        <li v-for="(err, idx) in lastImportResult.errors" :key="idx">
          {{ err }}
        </li>
      </ul>
    </div>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-confirm"
        @click="importResultModalOpen = false"
      >
        {{ t('common.close') }}
      </button>
    </template>
  </Modal>

  <!-- T-06: 审计日志查看 -->
  <Modal v-model="auditModalOpen" :title="t('settingsView.auditLogSectionSortTitle')">
    <div class="audit-log-body">
      <p v-if="auditEntries.length === 0" class="audit-empty">{{ t('settingsView.auditEmpty') }}</p>
      <ul v-else class="audit-list">
        <li
          v-for="entry in auditEntries"
          :key="`${entry.ts}-${entry.action}`"
          class="audit-item"
        >
          <span class="audit-time">{{ new Date(entry.ts).toLocaleString('zh-CN') }}</span>
          <span class="audit-action">{{ AUDIT_ACTION_LABELS[entry.action] ?? entry.action }}</span>
          <span class="audit-detail">{{ entry.detail }}</span>
          <span class="audit-result" :class="auditResultClass(entry.result)">
            {{ auditResultLabel(entry.result) }}
          </span>
        </li>
      </ul>
    </div>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-confirm"
        @click="auditModalOpen = false"
      >
        {{ t('common.close') }}
      </button>
    </template>
  </Modal>

  <!-- P1-3：清空审计日志确认（替代原生 confirm） -->
  <Modal
    v-model="auditClearConfirmOpen"
    :title="t('settingsView.auditClearConfirmTitle')"
    described-by="audit-clear-desc"
  >
    <p id="audit-clear-desc">{{ t('settingsView.auditClearConfirm') }}</p>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        @click="auditClearConfirmOpen = false"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm"
        @click="confirmClearAuditLog"
      >
        {{ t('common.confirm') }}
      </button>
    </template>
  </Modal>

  <!-- AC20 主密码管理弹窗 -->
  <MasterPasswordModal
    v-model="mpModalOpen"
    :mode="mpModalMode"
    @success="handleMasterPasswordSuccess"
  />
</template>

<style scoped>
/* ── Modal 按钮 ── */
.modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .modal-cancel:hover {
    background: var(--video-bg);
  }
}

.modal-confirm {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

@media (hover: hover) and (pointer: fine) {
  .modal-confirm:hover {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

@media (prefers-reduced-motion: reduce) {
  .modal-btn {
    transition: none;
  }
}

/* 导入结果 Modal */
.import-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-summary {
  margin: 0;
  font-size: 13px;
  color: var(--foreground);
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--card-elevated, var(--card));
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.result-key {
  flex-shrink: 0;
  min-width: 64px;
  font-weight: 600;
  color: var(--foreground);
}

.result-value {
  flex: 1;
  color: var(--muted-foreground);
  font-family: var(--font-mono, monospace);
}

.result-errors {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  color: var(--tk-red-500, #ef4444);
  font-weight: 500;
}

.error-list {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 10%, transparent);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--tk-red-500, #ef4444);
  max-height: 200px;
  overflow-y: auto;
}

.error-list li {
  font-size: 12px;
  color: var(--foreground);
  line-height: 1.6;
  padding: 2px 0;
}

/* T-06: 审计日志视图 */
.audit-log-body {
  max-height: 420px;
  overflow-y: auto;
}

.audit-empty {
  color: var(--muted-foreground);
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}

.audit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.audit-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  flex-wrap: wrap;
}

.audit-time {
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
}

.audit-action {
  font-weight: 600;
  white-space: nowrap;
}

.audit-detail {
  color: var(--text-secondary);
  flex: 1;
  min-width: 120px;
}

.audit-result {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
</style>
