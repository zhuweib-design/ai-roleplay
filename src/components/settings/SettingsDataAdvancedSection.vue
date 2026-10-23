<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import Collapse from '@/components/common/Collapse.vue';
import { useSectionMemory } from '@/composables/useSectionMemory';
import { auditLogger } from '@/core/audit-log';
import { loadOptimizationConfig, saveOptimizationConfig } from '@/core/optimization-pipeline';
import { persistState, requestPersistentStorage } from '@/core/storage-persistence';
import { showToast } from '@/utils/toast-service';
import { saveBlob, describeSaveResult } from '@/utils/save-blob';
import { t } from '@/i18n';
import { auditModalOpen, auditClearConfirmOpen } from './useDataPanelState';

/**
 * R3-2：数据管理的运维与兼容四段——SillyTavern Quick Reply 互导、PWA 数据持久性、
 * 嵌入优化开关、数据操作审计日志。
 *
 * 四段整体收在 Collapse 里默认收起（M4-b2）：备份/导出这些日常动作不该被
 * 运维项挡在下面。开合状态走 useSectionMemory，跨会话记住。
 */

const settings = useSettingsStore();
const advancedOpsOpen = useSectionMemory('settings.advancedOps');

const quickReplyFileInput = ref<HTMLInputElement | null>(null);

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

const optimizationConfig = ref(loadOptimizationConfig());

// O-20：内部字段名 → 用户可读 label（原 toast 直接把 l0Enabled 等字段名抛给用户）
const OPT_KEY_LABELS: Record<'l0Enabled' | 'l1Enabled' | 'l2Enabled', string> = {
  l0Enabled: t('settingsView.optL0'),
  l1Enabled: t('settingsView.optL1'),
  l2Enabled: t('settingsView.optL2'),
};

async function handleExportQuickReplies() {
  try {
    const outcome = await settings.exportQuickRepliesSt();
    // 取消 ⇒ 不提示；成功 ⇒ 说清落到哪
    const saved = describeSaveResult(outcome);
    if (!saved) return;
    showToast(saved.type, saved.message);
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

function handleImportQuickReplies() {
  quickReplyFileInput.value?.click();
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

async function handleExportAuditLog() {
  try {
    const json = auditLogger.exportJson();
    const outcome = await saveBlob(`audit-log-${new Date().toISOString().slice(0, 10)}.json`, () =>
      new Blob([json], { type: 'application/json' })
    );
    // 取消 ⇒ 不提示；成功 ⇒ 说清落到哪；安卓 WebView ⇒ 说清去哪找
    const saved = describeSaveResult(outcome);
    if (!saved) return;
    showToast(saved.type, saved.message);
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

function handleClearAuditLog() {
  auditClearConfirmOpen.value = true;
}
</script>

<template>
  <!-- M4-b2：四段运维项归入高级段，默认收起；备份/导出这些日常动作不再被挡在下面 -->
  <Collapse
    v-model:open="advancedOpsOpen"
    title-key="settingsView.advancedOpsSection"
    hint-key="settingsView.advancedOpsHint"
    icon="database"
    advanced
  >
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
  </Collapse>
</template>

<style scoped>
/* ── F13 数据管理（高级段基类；日常段自带一份同名副本，scoped 跨不过组件边界） ── */
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

/* P1-10：持久化授权状态行 */
.persist-state {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--card);
  font-size: 12px;
}
</style>
