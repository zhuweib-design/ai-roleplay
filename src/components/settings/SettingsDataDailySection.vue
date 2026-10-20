<script setup lang="ts">
import { ref, computed, useTemplateRef } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useCharacterStore } from '@/stores/character';
import { useEventsStore } from '@/stores/events';
import { useRandomEventsStore } from '@/stores/random-events';
import { useStoryStore } from '@/stores/story';
import Icon from '@/components/common/Icon.vue';
import type { ConflictStrategy } from '@/core/backup';
import {
  exportAll,
  importBackup,
  downloadBackupFile,
  parseBackupFile,
  downloadCharacterPng,
  downloadChatMarkdown,
} from '@/services/backup-service';
import { getActiveProfileId, setActiveProfileId, DEFAULT_PROFILE } from '@/storage/storage-factory';
import { getStorageAdapter, getStorageCapability } from '@/storage';
import { getWorldUserDisplayName } from '@/stores/chat-context';
import { showToast } from '@/utils/toast-service';
import { describeSaveResult } from '@/utils/save-blob';
import { t } from '@/i18n';
import { importResultModalOpen, lastImportResult } from './useDataPanelState';

/**
 * R3-2：数据管理的日常段——资料档案、全量备份（含冲突策略）、角色卡 PNG、对话 Markdown。
 *
 * 这一段是用户每天真正会点的动作；运维与兼容四段（QR 互导 / PWA 持久性 /
 * 嵌入优化 / 审计日志）收在 AppearanceDataAdvancedSection 的 Collapse 里。
 */

const settings = useSettingsStore();
const characterStore = useCharacterStore();
const randomEventsStore = useRandomEventsStore();

const backupFileInput = useTemplateRef<HTMLInputElement>('backupFileInput');

const conflictStrategy = ref<ConflictStrategy>('overwrite');
const currentProfileId = ref(getActiveProfileId());
const dataManageLoading = ref(false);
const exportCharId = ref<string>('');
const exportCharList = computed(() => characterStore.characters);
const exportChatCharId = ref<string>('');
const exportChatCharList = computed(() => characterStore.characters);
const newProfileName = ref('');
const storageMultiProfile = getStorageCapability().multiProfile;

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

function handleResetProfile() {
  setActiveProfileId(DEFAULT_PROFILE);
  currentProfileId.value = DEFAULT_PROFILE;
  showToast('success', t('settingsView.profileReset'));
}

function triggerBackupImport() {
  backupFileInput.value?.click();
}

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
    const outcome = await downloadBackupFile(data, password);
    const saved = describeSaveResult(outcome);
    if (!saved) {
      // 用户在系统保存面板里取消了：不能说"备份已导出"
      return;
    }
    if (outcome.outcome === 'unsupported') {
      // 环境做不到选择保存位置：这句话比"备份已导出"重要得多，优先说它
      showToast(saved.type, saved.message);
      return;
    }
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
      .then(async ({ uiCharToCard }) => {
        const card = uiCharToCard(char);
        const outcome = await downloadCharacterPng(card);
        const saved = describeSaveResult(outcome);
        if (!saved) return;
        showToast(saved.type, saved.message);
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
    const mdOutcome = await downloadChatMarkdown(latestChat, char.name, getWorldUserDisplayName(char.id));
    const mdSaved = describeSaveResult(mdOutcome);
    if (!mdSaved) return;
    showToast(mdSaved.type, mdSaved.message);
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    dataManageLoading.value = false;
  }
}
</script>

<template>
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
</template>

<style scoped>
/* ── F13 数据管理（日常段基类；高级段自带一份同名副本，scoped 跨不过组件边界） ── */
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
  white-space: nowrap;
  flex-shrink: 0;
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

.profile-single-notice {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--warning-border, var(--border));
  background: var(--warning-bg, color-mix(in srgb, #f59e0b 12%, transparent));
  color: var(--warning-fg, var(--foreground));
  font-size: 12px;
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

/* T-12: Profile 管理 */
.profile-create {
  display: flex;
  align-items: center;
  /* 390px 实测：输入框与"创建并切换"按钮同行时被一起压缩，按钮被压成 22×85（五个字竖排五行）。
     允许换行 + 按钮不收缩、文字不折行。 */
  flex-wrap: wrap;
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

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .data-mgmt-select,
  .profile-input {
    font-size: 16px;
  }
}
</style>
