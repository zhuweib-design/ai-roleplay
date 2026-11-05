<script setup lang="ts">
/**
 * 首聊验收记录（C-01 五人试用的采集表）
 *
 * 收在「数据管理 → 高级」里且默认收起：它是验收工具，不是日常功能。
 * 三样自动值（启动耗时 / 首字延迟 / 模型与供应商）都取自应用已有的读数，
 * 记录人只填"谁、结论、卡在哪一步、备注"。
 *
 * 记录只写本机 localStorage，点导出才离开这台机器；上限与环形淘汰在
 * `core/trial-sheet.ts` 里（纯函数，单测覆盖）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useChatGenerationStore } from '@/stores/chat-generation';
import { useSettingsStore } from '@/stores/settings';
import { APP_READY_EVENT, getAppReadyMs } from '@/core/boot-timing';
import {
  TRIAL_MAX_RECORDS,
  TRIAL_STEP_IDS,
  TRIAL_STORAGE_KEY,
  appendTrialRecord,
  makeTrialRecord,
  parseTrialRecords,
  toTrialCsv,
  toTrialJson,
  type TrialRecord,
  type TrialVerdict,
} from '@/core/trial-sheet';
import { saveBlob, describeSaveResult } from '@/utils/save-blob';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';

const generation = useChatGenerationStore();
const settings = useSettingsStore();

function readRecords(): TrialRecord[] {
  try {
    return parseTrialRecords(localStorage.getItem(TRIAL_STORAGE_KEY));
  } catch {
    return [];
  }
}

const records = ref<TrialRecord[]>(readRecords());
const participant = ref('');
const verdict = ref<TrialVerdict>('ok');
const blockedStep = ref('');
const notes = ref('');

/**
 * 启动耗时要在**真人看得见的那一刻**是准的。
 *
 * 直接冷启动进设置页时，本组件的首帧渲染早于 `App.onMounted` 的存储注入，
 * 那一刻 `getAppReadyMs()` 还是 null；它又不是响应式来源，所以写成 computed
 * 会把 null 永久定住（2026-10-28 实测过，环境行恒显"未取到"）。
 * 这里改成"先取一次 + 听一次性事件补上"，`markAppReady` 在写入数字之后派事件。
 */
const readyMs = ref<number | null>(getAppReadyMs());
function onAppReady(): void {
  readyMs.value = getAppReadyMs();
}
window.addEventListener(APP_READY_EVENT, onAppReady, { once: true });

/** 最近 20 条、新的在上：表格是给人扫的，全量在导出的文件里 */
const recentRecords = computed(() => [...records.value].reverse().slice(0, 20));

const profile = computed(() => settings.activeProfile);

const envLine = computed(() =>
  t('settingsView.trialEnvLine', {
    ready: readyMs.value === null ? t('settingsView.trialNoValue') : `${readyMs.value} ms`,
    ttft: generation.ttftStats.count > 0 ? `${generation.ttftStats.lastMs} ms` : t('settingsView.trialNoValue'),
    count: generation.ttftStats.count,
  }),
);

const modelLine = computed(() => {
  const p = profile.value;
  if (!p) return t('settingsView.trialNoValue');
  return `${p.provider ?? ''} / ${p.model ?? ''}`.replace(/^ \/ | \/ $/g, '') || t('settingsView.trialNoValue');
});

function verdictLabel(v: TrialVerdict): string {
  if (v === 'ok') return t('settingsView.trialVerdictOk');
  if (v === 'blocked') return t('settingsView.trialVerdictBlocked');
  return t('settingsView.trialVerdictGaveUp');
}

function stepLabel(step: string): string {
  return step ? t(`settingsView.trialStep.${step}` as 'settingsView.trialStep.open') : '';
}

function persist(next: TrialRecord[]): void {
  records.value = next;
  try {
    localStorage.setItem(TRIAL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    showToast('error', t('settingsView.trialSaveFailed'));
  }
}

function handleRecord(): void {
  if (!participant.value.trim()) {
    showToast('error', t('settingsView.trialNeedParticipant'));
    return;
  }
  const rec = makeTrialRecord({
    participant: participant.value,
    verdict: verdict.value,
    blockedStep: blockedStep.value,
    notes: notes.value,
    appReadyMs: getAppReadyMs(),
    ttftLastMs: generation.ttftStats.count > 0 ? generation.ttftStats.lastMs : null,
    ttftAvgMs: generation.ttftStats.count > 0 ? generation.ttftStats.avgMs : null,
    ttftCount: generation.ttftStats.count,
    model: profile.value?.model ?? '',
    provider: profile.value?.provider ?? '',
    platform: navigator.platform || '',
    viewport: `${window.innerWidth}×${window.innerHeight}`,
  });
  persist(appendTrialRecord(records.value, rec, TRIAL_MAX_RECORDS));
  notes.value = '';
  showToast('success', t('settingsView.trialSaved'));
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function exportAs(kind: 'json' | 'csv'): Promise<void> {
  if (records.value.length === 0) {
    showToast('info', t('settingsView.trialEmpty'));
    return;
  }
  try {
    const name = `first-chat-trial-${stamp()}.${kind}`;
    const mime = kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json';
    const payload = kind === 'csv'
      ? toTrialCsv(records.value, {
          time: t('settingsView.trialColTime'),
          participant: t('settingsView.trialColParticipant'),
          verdict: t('settingsView.trialColVerdict'),
          step: t('settingsView.trialColStep'),
          ttft: t('settingsView.trialColTtft'),
          notes: t('settingsView.trialColNotes'),
        })
      : toTrialJson(records.value);
    const outcome = await saveBlob(name, () => new Blob([payload], { type: mime }));
    const saved = describeSaveResult(outcome);
    if (!saved) return;
    showToast(saved.type, saved.message);
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

/** 清空要两下：第一下改成"再点一次清空"，4 秒没点就自己收回 */
const clearArmed = ref(false);
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function handleClear(): void {
  if (!clearArmed.value) {
    clearArmed.value = true;
    clearTimer = setTimeout(() => { clearArmed.value = false; }, 4000);
    return;
  }
  if (clearTimer) clearTimeout(clearTimer);
  clearArmed.value = false;
  persist([]);
  showToast('success', t('settingsView.trialCleared'));
}

onBeforeUnmount(() => {
  if (clearTimer) clearTimeout(clearTimer);
  // 事件没派过的时候监听还在，组件走了就要摘掉（派过则 once 已自动摘）
  window.removeEventListener(APP_READY_EVENT, onAppReady);
});
</script>

<template>
  <div class="data-mgmt-row">
    <div class="data-mgmt-block">
      <h3 class="data-mgmt-subtitle">{{ t('settingsView.trialSection') }}</h3>
      <p class="data-mgmt-hint">{{ t('settingsView.trialSectionDesc') }}</p>

      <p class="trial-env">
        <Icon name="info" :size="13" aria-hidden="true" />
        <span>{{ envLine }}</span>
        <span class="trial-env-sep" aria-hidden="true">·</span>
        <span>{{ modelLine }}</span>
      </p>

      <div class="trial-form">
        <label class="trial-field">
          <span class="trial-label">{{ t('settingsView.trialParticipant') }}</span>
          <input
            v-model="participant"
            class="tk-input trial-input"
            type="text"
            maxlength="24"
            :placeholder="t('settingsView.trialParticipantPh')"
            :aria-label="t('settingsView.trialParticipant')"
          />
        </label>

        <div class="trial-field">
          <span id="trial-verdict-label" class="trial-label">{{ t('settingsView.trialVerdict') }}</span>
          <select v-model="verdict" class="tk-input trial-input" aria-labelledby="trial-verdict-label">
            <option value="ok">{{ t('settingsView.trialVerdictOk') }}</option>
            <option value="blocked">{{ t('settingsView.trialVerdictBlocked') }}</option>
            <option value="gaveUp">{{ t('settingsView.trialVerdictGaveUp') }}</option>
          </select>
        </div>

        <div v-if="verdict !== 'ok'" class="trial-field">
          <span id="trial-step-label" class="trial-label">{{ t('settingsView.trialStep') }}</span>
          <select v-model="blockedStep" class="tk-input trial-input" aria-labelledby="trial-step-label">
            <option value="">{{ t('settingsView.trialStepNone') }}</option>
            <option v-for="s in TRIAL_STEP_IDS" :key="s" :value="s">{{ stepLabel(s) }}</option>
          </select>
        </div>

        <label class="trial-field trial-field-wide">
          <span class="trial-label">{{ t('settingsView.trialNotes') }}</span>
          <input
            v-model="notes"
            class="tk-input trial-input"
            type="text"
            maxlength="120"
            :placeholder="t('settingsView.trialNotesPh')"
            :aria-label="t('settingsView.trialNotes')"
          />
        </label>
      </div>

      <div class="data-mgmt-actions">
        <button type="button" class="data-mgmt-btn" @click="handleRecord">
          <Icon name="check" :size="14" />
          <span>{{ t('settingsView.trialRecord') }}</span>
        </button>
        <button type="button" class="data-mgmt-btn" @click="exportAs('json')">
          <Icon name="download" :size="14" />
          <span>{{ t('settingsView.trialExportJson') }}</span>
        </button>
        <button type="button" class="data-mgmt-btn" @click="exportAs('csv')">
          <Icon name="download" :size="14" />
          <span>{{ t('settingsView.trialExportCsv') }}</span>
        </button>
        <button type="button" class="data-mgmt-btn" @click="handleClear">
          <Icon name="trash-2" :size="14" />
          <span>{{ clearArmed ? t('settingsView.trialClearConfirm') : t('settingsView.trialClear') }}</span>
        </button>
      </div>

      <p v-if="records.length === 0" class="data-mgmt-hint">{{ t('settingsView.trialEmpty') }}</p>
      <template v-else>
        <p class="data-mgmt-hint">{{ t('settingsView.trialCount', { n: records.length }) }}</p>
        <div class="trial-table-wrap">
          <table class="trial-table">
            <thead>
              <tr>
                <th scope="col">{{ t('settingsView.trialColTime') }}</th>
                <th scope="col">{{ t('settingsView.trialColParticipant') }}</th>
                <th scope="col">{{ t('settingsView.trialColVerdict') }}</th>
                <th scope="col">{{ t('settingsView.trialColStep') }}</th>
                <th scope="col">{{ t('settingsView.trialColTtft') }}</th>
                <th scope="col">{{ t('settingsView.trialColNotes') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in recentRecords" :key="r.id">
                <td>{{ new Date(r.recordedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</td>
                <td>{{ r.participant }}</td>
                <td>{{ verdictLabel(r.verdict) }}</td>
                <td>{{ stepLabel(r.blockedStep) || '—' }}</td>
                <td>{{ r.ttftAvgMs === null ? '—' : `${r.ttftAvgMs} ms` }}</td>
                <td class="trial-notes">{{ r.notes || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 与「数据管理」其余段的基类同名同值（scoped 跨不过组件边界，沿用本目录既有做法） */
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

/* ── 验收表自己的部分 ── */

.trial-env {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.trial-env-sep {
  opacity: 0.6;
}

.trial-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 12px;
}

.trial-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.trial-field-wide {
  grid-column: 1 / -1;
}

.trial-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.trial-input {
  width: 100%;
}

.trial-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.trial-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.trial-table th,
.trial-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.trial-table tbody tr:last-child td {
  border-bottom: none;
}

.trial-table th {
  color: var(--muted-foreground);
  font-weight: 600;
  background: var(--card);
}

.trial-notes {
  white-space: normal;
  min-width: 120px;
}
</style>
