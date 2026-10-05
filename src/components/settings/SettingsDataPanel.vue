<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import MasterPasswordModal from '@/components/common/MasterPasswordModal.vue';
import Modal from '@/components/common/Modal.vue';
import type { ConflictStrategy } from '@/core/backup';
import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';
import { mpModalOpen, mpModalMode } from '@/utils/master-password-modal-state';
import {
  exportAll,
  importBackup,
  downloadBackupFile,
  parseBackupFile,
  downloadCharacterPng,
  downloadChatMarkdown,
  type ImportResult,
} from '@/services/backup-service';
import {
  getActiveProfileId,
  setActiveProfileId,
  DEFAULT_PROFILE,
} from '@/storage/storage-factory';
import { auditLogger } from '@/core/audit-log';
import { getStorageAdapter, getStorageCapability } from '@/storage';
import { getWorldUserDisplayName } from '@/stores/chat-context';
import { loadOptimizationConfig, saveOptimizationConfig } from '@/core/optimization-pipeline';
import { persistState, requestPersistentStorage } from '@/core/storage-persistence';;
import { ref, computed, useTemplateRef } from 'vue';;;;
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';;
import { useCharacterStore } from '@/stores/character';
import { useEventsStore } from '@/stores/events';
import { useRandomEventsStore } from '@/stores/random-events';
import { useStoryStore } from '@/stores/story';

const settings = useSettingsStore();
const randomEventsStore = useRandomEventsStore();

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

const auditClearConfirmOpen = ref(false);

const auditEntries = computed(() => auditLogger.list());

const auditModalOpen = ref(false);

function auditResultClass(r: string): string {
  return r === 'ok' ? 'audit-ok' : r === 'blocked' ? 'audit-blocked' : 'audit-error';
}

function auditResultLabel(r: string): string {
  if (r === 'ok') return t('settingsView.auditResultOk');
  if (r === 'blocked') return t('settingsView.auditResultBlocked');
  return t('settingsView.auditResultFailed');
}

const backupFileInput = useTemplateRef<HTMLInputElement>('backupFileInput');

const characterStore = useCharacterStore();

function confirmClearAuditLog() {
  auditClearConfirmOpen.value = false;
  auditLogger.clear();
  showToast('success', t('settingsView.auditCleared'));
}

const conflictStrategy = ref<ConflictStrategy>('overwrite');

const currentProfileId = ref(getActiveProfileId());

const dataManageLoading = ref(false);

const exportCharId = ref<string>('');

const exportCharList = computed(() => characterStore.characters);

const exportChatCharId = ref<string>('');

const exportChatCharList = computed(() => characterStore.characters);

async function handleBackupFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  input.value = '';

  dataManageLoading.value = true;
  try {
    // T-06：加密备份需已解锁的主密码；明文备份无需
    const password = settings.isUnlocked ? settings.getSessionMasterPassword() : undefined;
    const data = await parseBackupFile(file, password);
    const adapter = getStorageAdapter();
    const result = await importBackup(adapter, data, {
      conflictStrategy: conflictStrategy.value,
    });

    lastImportResult.value = result;
    importResultModalOpen.value = true;

    // 重新加载所有 store 数据
    await characterStore.loadFromStorage();
    await useStoryStore().loadFromStorage();
    // F17 事件为内存态：从备份恢复回事件 store
    if (result.events) {
      useEventsStore().events = result.events;
    }
    // D-9：随机事件为内存态：从备份恢复回随机事件 store
    if (result.randomEvents) {
      randomEventsStore.applyBackupData(result.randomEvents);
    }
  } catch (err) {
    showToast('error', t('settingsView.importFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    dataManageLoading.value = false;
  }
}

function handleClearAuditLog() {
  auditClearConfirmOpen.value = true;
}

function handleCreateProfile() {
  const name = newProfileName.value.trim();
  if (!name) {
    showToast('error', t('settingsView.profileNameRequired'));
    return;
  }
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    showToast('error', t('settingsView.profileNameInvalid'));
    return;
  }
  setActiveProfileId(name);
  currentProfileId.value = name;
  newProfileName.value = '';
  showToast('success', t('settingsView.profileSwitched', { name }));
}

function handleExportAuditLog() {
  try {
    const json = auditLogger.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', t('settingsView.auditExported'));
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

async function handleExportBackup() {
  dataManageLoading.value = true;
  try {
    const adapter = getStorageAdapter();
    // F17 事件为内存态：显式带出到备份，随故事线一起导出
    const data = await exportAll(adapter, {
      events: useEventsStore().events,
      randomEvents: randomEventsStore.exportBackupData(),
    });
    // 已解锁主密码 → 加密备份文件；未设置 → 明文备份
    const password = settings.isUnlocked ? settings.getSessionMasterPassword() : undefined;
    await downloadBackupFile(data, password);
    showToast(
      'success',
      t('settingsView.exportBackup', {
        enc: password ? t('settingsView.encrypted') : '',
        chars: data.characters.length,
        chats: data.chats.length,
        lbs: data.lorebooks.length,
      })
    );
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    dataManageLoading.value = false;
  }
}

function handleExportCharacterPng() {
  const id = exportCharId.value;
  if (!id) {
    showToast('error', t('settingsView.selectCharFirst'));
    return;
  }
  const char = characterStore.characters.find((c) => c.id === id);
  if (!char) {
    showToast('error', t('settingsView.charNotFound'));
    return;
  }
  try {
    // 将 UICharacter 转换为 CharacterCard（复用 type-adapters）
    void import('@/services/type-adapters')
      .then(({ uiCharToCard }) => {
        const card = uiCharToCard(char);
        downloadCharacterPng(card);
        showToast('success', t('settingsView.pngExported', { name: char.name }));
      })
      .catch((err) => {
        showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
      });
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

async function handleExportChatMarkdown() {
  const id = exportChatCharId.value;
  if (!id) {
    showToast('error', t('settingsView.selectCharFirst'));
    return;
  }
  const char = characterStore.characters.find((c) => c.id === id);
  if (!char) {
    showToast('error', t('settingsView.charNotFound'));
    return;
  }

  dataManageLoading.value = true;
  try {
    const adapter = getStorageAdapter();
    const chats = await adapter.loadChats(char.id);

    if (chats.length === 0) {
      showToast('info', t('settingsView.noChats', { name: char.name }));
      return;
    }

    // 取最新的对话
    const latestChat = chats[0]!;
    // 导出名称跟随该角色关联的世界资料，不再读取全局“当前身份”。
    downloadChatMarkdown(latestChat, char.name, getWorldUserDisplayName(char.id));
    showToast('success', t('settingsView.mdExported', { name: char.name }));
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    dataManageLoading.value = false;
  }
}

function handleExportQuickReplies() {
  try {
    settings.exportQuickRepliesSt();
    showToast('success', t('settingsView.qrExported'));
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

function handleImportQuickReplies() {
  quickReplyFileInput.value?.click();
}

function handleMasterPasswordSuccess(): void {
  const labels: Record<MasterPasswordMode, string> = {
    setup: t('settingsView.mpSetup'),
    unlock: t('settingsView.mpUnlock'),
    change: t('settingsView.mpChange'),
  };
  showToast('success', labels[mpModalMode.value]);
}

async function handleQuickReplyFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  input.value = '';
  try {
    const added = await settings.importQuickRepliesSt(file);
    showToast(
      added > 0 ? 'success' : 'info',
      added > 0 ? t('settingsView.qrImported', { count: added }) : t('settingsView.qrNoNew')
    );
  } catch (err) {
    showToast('error', t('settingsView.importFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

async function handleRequestPersist(): Promise<void> {
  persistBusy.value = true;
  try {
    persistState.value = await requestPersistentStorage();
  } finally {
    persistBusy.value = false;
  }
}

function handleResetProfile() {
  setActiveProfileId(DEFAULT_PROFILE);
  currentProfileId.value = DEFAULT_PROFILE;
  showToast('success', t('settingsView.profileReset'));
}

const importResultModalOpen = ref(false);

const lastImportResult = ref<ImportResult | null>(null);



const newProfileName = ref('');

const optimizationConfig = ref(loadOptimizationConfig());

const persistBusy = ref(false);

const persistHint = computed(() =>
  persistState.value === 'granted'
    ? t('settingsView.persistGrantedHint')
    : t('settingsView.persistDeniedHint'),
);

const persistLabel = computed(() => {
  switch (persistState.value) {
    case 'granted':
      return t('settingsView.persistGranted');
    case 'denied':
      return t('settingsView.persistDenied');
    case 'unsupported':
      return t('settingsView.persistUnsupported');
    default:
      return t('settingsView.persistUnknown');
  }
});

const quickReplyFileInput = ref<HTMLInputElement | null>(null);

const storageMultiProfile = getStorageCapability().multiProfile;

// O-20：内部字段名 → 用户可读 label（原 toast 直接把 l0Enabled 等字段名抛给用户）
const OPT_KEY_LABELS: Record<'l0Enabled' | 'l1Enabled' | 'l2Enabled', string> = {
  l0Enabled: t('settingsView.optL0'),
  l1Enabled: t('settingsView.optL1'),
  l2Enabled: t('settingsView.optL2'),
};

function toggleOptimization(key: 'enabled' | 'l0Enabled' | 'l1Enabled' | 'l2Enabled', value: boolean) {
  optimizationConfig.value = { ...optimizationConfig.value, [key]: value };
  saveOptimizationConfig(optimizationConfig.value);
  showToast(
    'success',
    key === 'enabled'
      ? value
        ? t('settingsView.optEnabled')
        : t('settingsView.optDisabled')
      : t('settingsView.optToggled', { key: OPT_KEY_LABELS[key as keyof typeof OPT_KEY_LABELS], state: value ? t('settingsView.optOn') : t('settingsView.optOff') })
  );
}

function triggerBackupImport() {
  backupFileInput.value?.click();
}
</script>

<template>
    <div>
    <!-- F13 数据管理 -->
    <section
      v-if="characterStore.characters.length > 0"
      class="settings-section data-mgmt-section"
      aria-labelledby="data-mgmt-title"
    >
      <header class="section-header">
        <h2 id="data-mgmt-title" class="section-title">
          <Icon name="download" :size="16" />
          <span>{{ t('settingsView.dataMgmtTitle') }}</span>
        </h2>
        <p class="section-hint">{{ t('settingsView.dataMgmtDesc') }}</p>
      </header>

      <!-- T-07: SillyTavern Quick Reply 互导 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.qrSection') }}</h3>
          <p class="data-mgmt-hint">
            {{ t('settingsView.qrSectionDesc') }}
          </p>
          <div class="data-mgmt-actions">
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleExportQuickReplies"
            >
              <Icon name="download" :size="14" />
              <span>{{ t('settingsView.qrExport') }}</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleImportQuickReplies"
            >
              <Icon name="upload" :size="14" />
              <span>{{ t('settingsView.qrImport') }}</span>
            </button>
            <input
              ref="quickReplyFileInput"
              type="file"
              accept=".json,application/json"
              class="sr-only"
              @change="handleQuickReplyFileSelected"
            />
          </div>
        </div>
      </div>

      <!-- T-12: 资料档案(Profile) -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.profileSection') }}</h3>
          <p class="data-mgmt-hint">
            {{ t('settingsView.profileCurrent') }}<strong>{{ currentProfileId }}</strong>。
            {{ t('settingsView.profileCurrentDesc') }}
          </p>
          <p
            v-if="!storageMultiProfile"
            class="data-mgmt-hint profile-single-notice"
            role="note"
          >
            {{ t('settingsView.profileSingleNotice') }}
          </p>
          <div class="data-mgmt-actions">
            <label class="profile-create">
              <input
                v-model="newProfileName"
                type="text"
                class="profile-input"
                :placeholder="t('settingsView.profileNamePlaceholder')"
                :aria-label="t('settingsView.profileNameAria')"
                :disabled="!storageMultiProfile"
              />
              <button
                type="button"
                class="data-mgmt-btn"
                :disabled="!storageMultiProfile"
                :title="storageMultiProfile ? '' : t('settingsView.profileSingleNotice')"
                @click="handleCreateProfile"
              >
                <Icon name="plus" :size="14" />
                <span>{{ t('settingsView.profileCreateAndSwitch') }}</span>
              </button>
            </label>
            <button
              v-if="currentProfileId !== DEFAULT_PROFILE && storageMultiProfile"
              type="button"
              class="data-mgmt-btn"
              :disabled="!storageMultiProfile"
              @click="handleResetProfile"
            >
              <Icon name="arrow-left" :size="14" />
              <span>{{ t('settingsView.profileResetAction') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- P1-10: Web / PWA 数据持久性（IndexedDB 驱逐风险） -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.persistSection') }}</h3>
          <p class="data-mgmt-hint">{{ t('settingsView.persistDesc') }}</p>
          <p class="data-mgmt-hint persist-state" role="status">
            {{ t('settingsView.persistStateLabel') }}<strong>{{ persistLabel }}</strong>
          </p>
          <p class="data-mgmt-hint">{{ persistHint }}</p>
          <div class="data-mgmt-actions">
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="persistBusy || persistState === 'unsupported'"
              @click="handleRequestPersist"
            >
              <Icon name="refresh-cw" :size="14" />
              <span>{{ t('settingsView.persistRetry') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- E-04 二期: 嵌入优化开关 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.optSection') }}</h3>
          <p class="data-mgmt-hint">
            {{ t('settingsView.optSectionDesc') }}
            <strong>{{ t('settingsView.optDefaultOff') }}</strong>{{ t('settingsView.optSectionDesc2') }}
          </p>
          <div class="opt-switches">
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.enabled"
                @change="toggleOptimization('enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('settingsView.optMasterSwitch') }}</span>
            </label>
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.l0Enabled"
                :disabled="!optimizationConfig.enabled"
                @change="toggleOptimization('l0Enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('settingsView.optL0') }}</span>
            </label>
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.l2Enabled"
                :disabled="!optimizationConfig.enabled"
                @change="toggleOptimization('l2Enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('settingsView.optL2') }}</span>
            </label>
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.l1Enabled"
                :disabled="!optimizationConfig.enabled"
                @change="toggleOptimization('l1Enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t('settingsView.optL1') }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- T-06: 数据操作审计日志 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.auditSection') }}</h3>
          <p class="data-mgmt-hint">
            {{ t('settingsView.auditSectionDesc') }}
          </p>
          <div class="data-mgmt-actions">
            <button
              type="button"
              class="data-mgmt-btn"
              @click="auditModalOpen = true"
            >
              <Icon name="clock" :size="14" />
              <span>{{ t('settingsView.auditView') }}</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleExportAuditLog"
            >
              <Icon name="download" :size="14" />
              <span>{{ t('settingsView.auditExport') }}</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleClearAuditLog"
            >
              <Icon name="trash-2" :size="14" />
              <span>{{ t('settingsView.auditClear') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 全量备份 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.backupSection') }}</h3>
          <p class="data-mgmt-hint">
            {{ t('settingsView.backupSectionDesc') }}
          </p>
          <div class="data-mgmt-actions">
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="dataManageLoading"
              @click="handleExportBackup"
            >
              <Icon name="download" :size="14" />
              <span>{{ t('settingsView.backupExport') }}</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="dataManageLoading"
              @click="triggerBackupImport"
            >
              <Icon name="upload" :size="14" />
              <span>{{ t('settingsView.backupImport') }}</span>
            </button>
            <input
              ref="backupFileInput"
              type="file"
              accept=".json,application/json"
              class="hidden-file-input"
              aria-hidden="true"
              tabindex="-1"
              @change="handleBackupFileSelected"
            />
          </div>

          <!-- 冲突策略 -->
          <div class="conflict-strategy" role="radiogroup" :aria-label="t('settingsView.conflictStrategyAria')">
            <span class="strategy-label">{{ t('settingsView.conflictStrategy') }}</span>
            <label class="strategy-option">
              <input
                type="radio"
                name="conflict-strategy"
                value="overwrite"
                v-model="conflictStrategy"
              />
              <span>{{ t('settingsView.conflictOverwrite') }}</span>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="conflict-strategy"
                value="skip"
                v-model="conflictStrategy"
              />
              <span>{{ t('settingsView.conflictSkip') }}</span>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="conflict-strategy"
                value="merge"
                v-model="conflictStrategy"
              />
              <span>{{ t('settingsView.conflictMerge') }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 角色卡 PNG 导出 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.pngExportSection') }}</h3>
          <p class="data-mgmt-hint">
            {{ t('settingsView.pngExportDesc') }}
          </p>
          <div class="data-mgmt-actions">
            <label class="data-mgmt-select-label">
              <span class="visually-hidden">{{ t('settingsView.selectChar') }}</span>
              <select
                v-model="exportCharId"
                class="tk-input data-mgmt-select"
                :aria-label="t('settingsView.selectCharPngAria')"
              >
                <option value="">{{ t('settingsView.selectCharPlaceholder') }}</option>
                <option
                  v-for="c in exportCharList"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="!exportCharId || dataManageLoading"
              @click="handleExportCharacterPng"
            >
              <Icon name="image" :size="14" />
              <span>{{ t('settingsView.exportPng') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 对话 Markdown 导出 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">{{ t('settingsView.mdExportSection') }}</h3>
          <p class="data-mgmt-hint">
            {{ t('settingsView.mdExportDesc') }}
          </p>
          <div class="data-mgmt-actions">
            <label class="data-mgmt-select-label">
              <span class="visually-hidden">{{ t('settingsView.selectChar') }}</span>
              <select
                v-model="exportChatCharId"
                class="tk-input data-mgmt-select"
                :aria-label="t('settingsView.selectCharMdAria')"
              >
                <option value="">{{ t('settingsView.selectCharPlaceholder') }}</option>
                <option
                  v-for="c in exportChatCharList"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="!exportChatCharId || dataManageLoading"
              @click="handleExportChatMarkdown"
            >
              <Icon name="file" :size="14" />
              <span>{{ t('settingsView.exportMd') }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

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
            <span class="result-key">{{ t('settingsView.importKeyPersonas') }}</span>
            <span class="result-value">
              {{ t('settingsView.importAdded', { n: lastImportResult.personas.added }) }} ·
              {{ t('settingsView.importOverwritten', { n: lastImportResult.personas.overwritten }) }} ·
              {{ t('settingsView.importSkipped', { n: lastImportResult.personas.skipped }) }}
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
    <Modal v-model="auditClearConfirmOpen" :title="t('settingsView.auditClearConfirmTitle')">
      <p>{{ t('settingsView.auditClearConfirm') }}</p>
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
    </div>
</template>

<style scoped>

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

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

/* ── 响应式 ── */
@media (max-width: 640px) {
  .settings-view {
    padding: 16px;
  }
  .settings-section {
    padding: 14px;
  }
  .theme-grid {
    grid-template-columns: 1fr;
  }
  .fontsize-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .profile-item {
    flex-direction: column;
    align-items: stretch;
  }
  .profile-actions {
    flex-wrap: wrap;
  }
  .action-btn {
    flex: 1;
    min-width: 0;
  }
  .meta-url {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .theme-card,
  .fontsize-card,
  .profile-item,
  .action-btn,
  .modal-btn {
    transition: none;
  }
}

/* ── F13 数据管理 ── */
.data-mgmt-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.data-mgmt-row {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.data-mgmt-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-mgmt-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.data-mgmt-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.profile-single-notice {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--warning-border, var(--border));
  background: var(--warning-bg, color-mix(in srgb, #f59e0b 12%, transparent));
  color: var(--warning-fg, var(--foreground));
  font-size: 12px;
}

/* P1-10：持久化授权状态行 */
.persist-state {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--card);
  font-size: 12px;
}

.data-mgmt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.data-mgmt-btn {
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

@media (hover: hover) and (pointer: fine) {
  .data-mgmt-btn:hover:not(:disabled) {
    background: var(--card-elevated);
    border-color: var(--tk-cyan-500);
  }
}

.data-mgmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.data-mgmt-select-label {
  display: block;
}

.data-mgmt-select {
  height: 32px;
  padding: 0 28px 0 10px;
  font-size: 13px;
  color: var(--foreground);
  background: var(--video-bg, var(--card));
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 160px;
}

.data-mgmt-select:focus-visible {
  border-color: var(--tk-cyan-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tk-cyan-500) 35%, transparent);
}

.hidden-file-input {
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

.visually-hidden {
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

/* 冲突策略 */
.conflict-strategy {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.strategy-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.strategy-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--foreground);
  cursor: pointer;
}

.strategy-option input[type='radio'] {
  margin: 0;
  cursor: pointer;
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

.extension-block .form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--foreground);
}

.extension-block .form-row > span {
  min-width: 100px;
  color: var(--muted-foreground);
}

.extension-block .form-row input[type='checkbox'] {
  margin: 0;
}

.extension-block .form-row input[type='range'] {
  flex: 1;
  max-width: 200px;
}

.extension-block .form-row input[type='number'],
.extension-block .form-row input[type='password'],
.extension-block .form-row select {
  flex: 1;
  max-width: 240px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.context-preset-btns .data-mgmt-btn.active {
  border-color: var(--tk-cyan-500);
  background: var(--card-elevated);
  /* 亮色主题中 cyan-500 叠在浅色卡片上对比度不足，使用专用文本派生色。 */
  color: var(--accent-blue-text);
}
/* T-12: Profile 管理 */
.profile-create {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--foreground);
  font-size: 13px;
  width: 200px;
}

.profile-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
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

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input,
  .form-textarea,
  .custom-css-textarea,
  .data-mgmt-select,
  .extension-block .form-row input[type='number'],
  .extension-block .form-row input[type='password'],
  .extension-block .form-row select,
  .profile-input {
    font-size: 16px;
  }
}
</style>
