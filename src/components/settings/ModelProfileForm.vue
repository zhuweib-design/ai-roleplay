<script setup lang="ts">
/**
 * ModelProfileForm — API Profile 编辑/新建 Modal（表单骨架 + 测试连接 + 取模型列表）
 *
 * R1-4 从 SettingsModelPanel（原 2544 行）拆出。状态与副作用全在
 * `useModelProfileForm`，本文件只管 markup。
 *
 * 宿主通过 `defineExpose` 的 `openCreate()` / `openEdit(profile)` 打开弹窗——
 * 表单开合是它的内部状态，宿主不必知道。
 */
import { ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { MODEL_CATEGORIES } from '@/types';
import type { ApiProfile } from '@/types';
import { useModelProfileForm } from '@/composables/useModelProfileForm';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Collapse from '@/components/common/Collapse.vue';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();
const modelCategories = MODEL_CATEGORIES;

const {
  CONTEXT_PRESETS,
  formatK,
  editMode,
  form,
  errors,
  hasErrors,
  canSaveProfile,
  testing,
  testResult,
  fetchingModels,
  modelOptions,
  modelListResult,
  fetchModelList,
  testConnection,
  providerOptions,
  openCreate: resetForCreate,
  openEdit: fillForEdit,
  onProviderChange,
  saveProfile,
  samplingOpen,
  showApiKey,
} = useModelProfileForm();

const editModalOpen = ref(false);

function openCreate() {
  resetForCreate();
  editModalOpen.value = true;
}

function openEdit(profile: ApiProfile) {
  fillForEdit(profile);
  editModalOpen.value = true;
}

function onSave() {
  if (saveProfile()) editModalOpen.value = false;
}

// ── Toast（自包含，不依赖父组件） ──
watch(
  () => settings.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);

defineExpose({ openCreate, openEdit });
</script>

<template>
  <Modal
    v-model="editModalOpen"
    :title="editMode === 'create' ? t('modelPanel.createTitle') : t('modelPanel.editTitle')"
    :aria-label="t('modelPanel.formAria')"
  >
    <form class="profile-form" novalidate @submit.prevent="onSave">
      <div class="form-field">
        <label for="p-name" class="field-label">{{ t('modelPanel.nameLabel') }} <span class="required">*</span></label>
        <input
          id="p-name"
          v-model="form.name"
          type="text"
          class="field-input"
          :class="{ 'has-error': errors.name }"
          :aria-invalid="!!errors.name"
          :aria-describedby="errors.name ? 'err-name' : undefined"
          :placeholder="t('modelPanel.namePlaceholder')"
          autocomplete="off"
        />
        <p v-if="errors.name" id="err-name" class="field-error" role="alert">
          <Icon name="alert-triangle" :size="12" />
          <span>{{ errors.name }}</span>
        </p>
      </div>

      <div class="form-field">
        <label for="p-provider" class="field-label">{{ t('modelPanel.providerLabel') }}</label>
        <select
          id="p-provider"
          v-model="form.provider"
          class="field-input"
          @change="onProviderChange"
        >
          <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="form-field">
        <label for="p-category" class="field-label">{{ t('modelPanel.categoryLabel') }}</label>
        <select
          id="p-category"
          v-model="form.category"
          class="field-input"
        >
          <option v-for="cat in modelCategories" :key="cat.value" :value="cat.value">
            {{ cat.label }}
          </option>
        </select>
        <p class="field-hint">{{ modelCategories.find((c) => c.value === form.category)?.description }}</p>
      </div>

      <div class="form-field">
        <label for="p-baseurl" class="field-label">{{ t('modelPanel.baseUrlLabel') }} <span class="required">*</span></label>
        <input
          id="p-baseurl"
          v-model="form.baseUrl"
          type="text"
          class="field-input"
          :class="{ 'has-error': errors.baseUrl }"
          :aria-invalid="!!errors.baseUrl"
          :aria-describedby="errors.baseUrl ? 'err-baseurl' : undefined"
          :placeholder="t('modelPanel.baseUrlPlaceholder')"
          autocomplete="off"
        />
        <p v-if="errors.baseUrl" id="err-baseurl" class="field-error" role="alert">
          <Icon name="alert-triangle" :size="12" />
          <span>{{ errors.baseUrl }}</span>
        </p>
      </div>

      <div class="form-field">
        <label for="p-model" class="field-label">{{ t('modelPanel.modelLabel') }} <span class="required">*</span></label>
        <input
          id="p-model"
          v-model="form.model"
          type="text"
          list="p-model-options"
          class="field-input"
          :class="{ 'has-error': errors.model }"
          :aria-invalid="!!errors.model"
          :aria-describedby="errors.model ? 'err-model' : undefined"
          placeholder="gpt-4o"
          autocomplete="off"
        />
        <datalist id="p-model-options">
          <option v-for="m in modelOptions" :key="m" :value="m" />
        </datalist>
        <p v-if="errors.model" id="err-model" class="field-error" role="alert">
          <Icon name="alert-triangle" :size="12" />
          <span>{{ errors.model }}</span>
        </p>
        <div class="test-row">
          <button
            type="button"
            class="modal-btn test-btn"
            :disabled="fetchingModels || hasErrors"
            :aria-disabled="fetchingModels || hasErrors"
            @click="fetchModelList"
          >
            <Icon name="search" :size="14" />
            <span>{{ fetchingModels ? t('modelPanel.fetching') : t('modelPanel.fetchModels') }}</span>
          </button>
          <p
            v-if="modelListResult"
            class="model-list-result"
            :class="modelListResult.ok ? 'ok' : 'fail'"
            role="status"
          >
            {{ modelListResult.message }}
          </p>
        </div>
      </div>

      <div class="form-field">
        <label for="p-apikey" class="field-label">{{ t('modelPanel.apiKeyLabel') }}</label>
        <div class="apikey-input-wrap">
          <input
            id="p-apikey"
            v-model="form.apiKey"
            :type="showApiKey ? 'text' : 'password'"
            class="field-input"
            placeholder="sk-..."
            autocomplete="off"
          />
          <button
            type="button"
            class="toggle-visibility"
            :aria-label="showApiKey ? t('modelPanel.hideApiKey') : t('modelPanel.showApiKey')"
            :aria-pressed="showApiKey"
            @click="showApiKey = !showApiKey"
          >
            <Icon :name="showApiKey ? 'eye' : 'eye'" :size="14" />
          </button>
        </div>
        <p class="field-hint">{{ t('modelPanel.apiKeyHint') }}</p>
      </div>

      <div class="form-field">
        <label for="p-ctxwin" class="field-label">{{ t('modelPanel.contextWindowLabel') }}</label>
        <input
          id="p-ctxwin"
          v-model="form.contextWindow"
          type="number"
          min="1024"
          step="1024"
          class="field-input"
          :class="{ 'has-error': errors.contextWindow }"
          :aria-invalid="!!errors.contextWindow"
          :aria-describedby="errors.contextWindow ? 'err-ctxwin' : undefined"
          :placeholder="t('modelPanel.contextWindowPlaceholder')"
        />
        <p v-if="errors.contextWindow" id="err-ctxwin" class="field-error" role="alert">
          <Icon name="alert-triangle" :size="12" />
          <span>{{ errors.contextWindow }}</span>
        </p>
        <div class="ctx-presets" role="group" :aria-label="t('modelPanel.contextWindowPresetsAria')">
          <button
            v-for="p in CONTEXT_PRESETS"
            :key="p"
            type="button"
            class="action-btn"
            :class="{ activate: Number(form.contextWindow) === p }"
            @click="form.contextWindow = p"
          >
            {{ formatK(p) }}
          </button>
          <button type="button" class="action-btn" @click="form.contextWindow = ''">
            {{ t('modelPanel.contextWindowClear') }}
          </button>
        </div>
        <p class="field-hint">{{ t('modelPanel.contextWindowHint') }}</p>
      </div>

      <!-- P0-2：推理强度支持（三态，纠正启发式误判） -->
      <div class="form-field">
        <label for="p-reasoning-support" class="field-label">{{ t('modelPanel.reasoningSupport') }}</label>
        <select
          id="p-reasoning-support"
          v-model="form.reasoningSupport"
          class="field-input"
        >
          <option value="auto">{{ t('modelPanel.reasoningSupportAuto') }}</option>
          <option value="on">{{ t('modelPanel.reasoningSupportOn') }}</option>
          <option value="off">{{ t('modelPanel.reasoningSupportOff') }}</option>
        </select>
        <p class="field-hint">{{ t('modelPanel.reasoningSupportHint') }}</p>
      </div>

      <!-- P0-2：Profile 级默认思考强度 -->
      <div class="form-field">
        <label for="p-reasoning-effort" class="field-label">{{ t('modelPanel.reasoningEffortLabel') }}</label>
        <select
          id="p-reasoning-effort"
          v-model="form.reasoningEffort"
          class="field-input"
        >
          <option value="">{{ t('modelPanel.reasoningEffortNone') }}</option>
          <option value="low">{{ t('llm.reasoningLow') }}</option>
          <option value="medium">{{ t('llm.reasoningMedium') }}</option>
          <option value="high">{{ t('llm.reasoningHigh') }}</option>
        </select>
        <p class="field-hint">{{ t('modelPanel.reasoningEffortHint') }}</p>
      </div>

      <!-- P0-3：Profile 级默认采样参数（留空 = 不传 = 供应商默认）；M4-b2：三个参数一起归高级段，默认收起 -->
      <Collapse
        v-model:open="samplingOpen"
        title-key="modelPanel.samplingTitle"
        hint-key="modelPanel.samplingHint"
        :level="3"
        advanced
        plain
      >
        <div class="form-field">
          <label for="p-top-p" class="field-label">{{ t('modelPanel.topPLabel') }}</label>
          <input
            id="p-top-p"
            v-model="form.topP"
            type="number"
            min="0"
            max="1"
            step="0.05"
            class="field-input"
            :placeholder="t('modelPanel.topPPlaceholder')"
          />
          <p class="field-hint">{{ t('modelPanel.topPHint') }}</p>
        </div>

        <div class="form-field">
          <label for="p-presence" class="field-label">{{ t('modelPanel.presencePenaltyLabel') }}</label>
          <input
            id="p-presence"
            v-model="form.presencePenalty"
            type="number"
            min="-2"
            max="2"
            step="0.1"
            class="field-input"
            :placeholder="t('modelPanel.presencePenaltyPlaceholder')"
          />
          <p class="field-hint">{{ t('modelPanel.presencePenaltyHint') }}</p>
        </div>

        <div class="form-field">
          <label for="p-frequency" class="field-label">{{ t('modelPanel.frequencyPenaltyLabel') }}</label>
          <input
            id="p-frequency"
            v-model="form.frequencyPenalty"
            type="number"
            min="-2"
            max="2"
            step="0.1"
            class="field-input"
            :placeholder="t('modelPanel.frequencyPenaltyPlaceholder')"
          />
          <p class="field-hint">{{ t('modelPanel.frequencyPenaltyHint') }}</p>
        </div>
      </Collapse>

      <div class="form-field">
        <div class="test-row">
          <button
            type="button"
            class="modal-btn test-btn"
            :disabled="testing || hasErrors"
            :aria-disabled="testing || hasErrors"
            @click="testConnection"
          >
            <Icon name="send" :size="14" />
            <span>{{ testing ? t('modelPanel.testing') : t('modelPanel.testConnection') }}</span>
          </button>
          <p class="field-hint">{{ t('modelPanel.testHint') }}</p>
        </div>
        <div
          v-if="testResult"
          class="test-result"
          :class="testResult.ok ? 'ok' : 'fail'"
          role="status"
        >
          <Icon
            :name="testResult.ok ? 'check' : 'alert-triangle'"
            :size="14"
            class="test-result-icon"
            aria-hidden="true"
          />
          <div class="test-result-body">
            <p class="test-result-msg">{{ testResult.message }}</p>
            <ul v-if="!testResult.ok && testResult.hints?.length" class="test-result-hints">
              <li v-for="(hint, i) in testResult.hints" :key="i">{{ hint }}</li>
            </ul>
          </div>
        </div>
      </div>
    </form>

    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        @click="editModalOpen = false"
      >
        {{ t('modelPanel.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-save"
        :disabled="!canSaveProfile"
        :aria-disabled="!canSaveProfile"
        @click="onSave"
      >
        <Icon name="save" :size="14" />
        <span>{{ editMode === 'create' ? t('modelPanel.create') : t('modelPanel.save') }}</span>
      </button>
    </template>
  </Modal>
</template>

<style scoped>
/* ── 表单 ── */
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.required {
  color: var(--destructive);
}

.field-input {
  height: var(--size-control-md);
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
  width: 100%;
}

select.field-input {
  height: var(--size-control-md);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23AEB2C0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: var(--spacing-2xl);
}

.field-input:focus-visible {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}

.field-input.has-error {
  border-color: var(--destructive);
}

.field-error {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 12px;
  color: var(--destructive);
  margin: 0;
}

.field-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

.ctx-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--size-control-sm);
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card);
    color: var(--foreground);
  }
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.action-btn.activate {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--on-secondary);
}

/* 测试连接（第8条/第10条） */
.test-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--spacing-sm);
}

.test-btn {
  flex-shrink: 0;
}

.test-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.test-result {
  display: flex;
  gap: var(--spacing-sm);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.55;
  border: 1px solid transparent;
}

.test-result.ok {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  /* --success 是「填充 + 白字」档（见 themes.css 注释），作文字用它 light 下仅 3.04；
     文字一律走 -fg 变体。 */
  color: var(--success-fg);
}

.test-result.fail {
  border-color: color-mix(in srgb, var(--destructive) 45%, transparent);
  background: color-mix(in srgb, var(--destructive) 10%, transparent);
  /* 同上：--destructive 是填充档，作文字走 --error-fg。 */
  color: var(--error-fg);
}

.test-result-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.test-result-body {
  min-width: 0;
  flex: 1;
}

.test-result-msg {
  margin: 0;
  word-break: break-word;
}

.test-result-hints {
  margin: 6px 0 0;
  padding-left: var(--spacing-md);
  color: var(--muted-foreground);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.model-list-result {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  flex: 1;
}

.model-list-result.ok {
  color: var(--success-fg);
}

.model-list-result.fail {
  color: var(--error-fg);
}

.apikey-input-wrap {
  position: relative;
}

.apikey-input-wrap .field-input {
  padding-right: 40px;
}

.toggle-visibility {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: var(--size-control-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

@media (hover: hover) and (pointer: fine) {
  .toggle-visibility:hover {
    color: var(--foreground);
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
  }
}

.toggle-visibility:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

/* ── Modal 按钮 ── */
/* 只写与 `src/styles/primitives.css` 的 `.modal-btn` 基类的**差值**（F1 A 档，实测见
   `evidence/screenshots/f1-modal-btn/`）：基类是 padding 0 12px(--space-3)、焦点环 --ring、
   过渡 --transition-colors（含 color、cubic-bezier、--duration-fast 140ms）；本弹窗是
   14px / --secondary / 只过渡背景与边框且 ease 150ms。其余 10 条与基类同值，已删。
   把这三条收敛到基类属视觉改动，归 Q8 拍板。 */
.modal-btn {
  padding: 0 14px;
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline-color: var(--secondary);
}

@media (hover: hover) and (pointer: fine) {
  .modal-cancel:hover {
    background: var(--video-bg);
  }
}

.modal-save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

@media (hover: hover) and (pointer: fine) {
  .modal-save:hover:not(:disabled) {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

.modal-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input {
    font-size: 16px;
  }
}
</style>
