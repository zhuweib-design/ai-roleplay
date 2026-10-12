<script setup lang="ts">
/**
 * SettingsModelPanel — 设置页「模型管理」面板（P2-7 拆分）
 *
 * 自 SettingsView.vue 迁出：云端/本地模型统一管理 + API 配置 CRUD + 测试连接。
 * 依赖 settings / chat / localModel 三个 store，不依赖父组件状态。
 */
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useLocalModelStore } from '@/stores/local-model';
import { MODEL_CATEGORIES, type ModelCategory, type SamplingOverrides } from '@/types';
import {
  PRESET_IDS,
  normalizePresetId,
  presetLabel,
  presetDescription,
  resolvePresetParams,
  type PresetId,
} from '@core/creation-preset';
import { createApiClient } from '@/api';
import Collapse from '@/components/common/Collapse.vue';
import { useSectionMemory } from '@/composables/useSectionMemory';
import type { ApiProfile } from '@/types';
import type { ModelSize } from '@/core/local-model-engine';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();
/** M7-d：默认采样参数属高级段，默认收起；点过的开合跨会话记住 */
const samplingOpen = useSectionMemory('model.sampling');
const chatStore = useChatStore();
const localModelStore = useLocalModelStore();
const router = useRouter();
function goToLocalModel() {
  void router.push({ name: 'local-model' });
}

// ── API Profile 管理 ──
const editModalOpen = ref(false);
const editMode = ref<'create' | 'edit'>('create');

// 删除确认
const deleteTarget = ref<ApiProfile | null>(null);
const deleteModalOpen = ref(false);

// 表单字段
const form = ref({
  id: '',
  name: '',
  provider: 'openai' as 'openai' | 'anthropic' | 'custom' | 'deepseek' | 'local',
  baseUrl: '',
  apiKey: '',
  model: '',
  category: 'chat' as 'chat' | 'image-video' | 'embedding',
  // T-16: maxTokens 允许为空(undefined=不传,由供应商默认;用户可设置)
  maxTokens: undefined as number | undefined,
  // P0-2: 推理强度支持三态（auto=按模型名启发式；on/off=用户强制纠偏）
  reasoningSupport: 'auto' as 'auto' | 'on' | 'off',
  // P0-2: Profile 级默认思考强度（空串 = 不设置）
  reasoningEffort: '' as '' | 'low' | 'medium' | 'high',
  // P0-3: Profile 级默认采样参数（空 = 不传 = 供应商默认；绝不用 0 表示未设置）
  topP: '' as string | number,
  presencePenalty: '' as string | number,
  frequencyPenalty: '' as string | number,
});

/**
 * P0-3：把表单里的采样输入转为 `number | undefined`
 * 空串 / null / NaN 一律视为"未设置"（= 不传 = 供应商默认）
 */
function toOptionalNumber(v: string | number): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ── P0-1 思维链偏好（全局；改动后即时持久化） ──
const stripFromHistory = ref(settings.thinkingConfig?.stripFromHistory !== false);
const defaultCollapsed = ref(settings.thinkingConfig?.defaultCollapsed !== false);

function onThinkingPrefChange(): void {
  settings.setThinkingConfig({
    stripFromHistory: stripFromHistory.value,
    defaultCollapsed: defaultCollapsed.value,
  });
  void settings.persistSettings();
}

// ── MODEL-03 创作模式（Preset；全局；切换即持久化） ──
// 实际生效参数用 resolvePresetParams 逐字段展示，来源标注"来自预设 / 沿用你的设置"，
// 满足验收"切换后实际请求参数可检查；高级用户可查看具体参数"。
const presetIds = PRESET_IDS;
const activePreset = computed(() => normalizePresetId(settings.creationPreset));
const activePresetResolution = computed(() => resolvePresetParams(activePreset.value));
const activePresetBudgetPercent = computed(
  () => Math.round(activePresetResolution.value.contextBudgetFactor.value * 100)
);
const presetSamplingRows = [
  { key: 'topP', labelKey: 'modelPanel.topPLabel' },
  { key: 'presencePenalty', labelKey: 'modelPanel.presencePenaltyLabel' },
  { key: 'frequencyPenalty', labelKey: 'modelPanel.frequencyPenaltyLabel' },
] as const;

function onPresetChange(id: PresetId): void {
  settings.setCreationPreset(id);
  void settings.persistSettings();
  showToast('success', t('preset.applied', { name: presetLabel(id) }));
}

// ── 本地模型（第9条：与云端统一管理） ──
const modelMgmtTab = ref<'cloud' | 'local'>('cloud');

/** 本地模型状态文案 */
function localModelStatusLabel(id: string): string {
  const status = localModelStore.modelStatuses.get(id);
  if (status === 'loading' || status === 'downloading') return t('modelPanel.statusLoading');
  if (status === 'loaded') return t('modelPanel.statusLoaded');
  if (status === 'error') return t('modelPanel.statusError');
  return t('modelPanel.statusNotLoaded');
}

async function handleLoadLocalModel(modelId: string) {
  const ok = await localModelStore.loadModel(modelId);
  showToast(ok ? 'success' : 'error', ok ? t('modelPanel.localLoaded', { id: modelId }) : (localModelStore.lastError ?? t('modelPanel.loadFailed')));
}

async function handleUnloadLocalModel() {
  await localModelStore.unloadModel();
  showToast('info', t('modelPanel.localUnloaded'));
}

/** 将本地模型注册为模型配置（provider='local'），供对话页直接选择使用 */
function addLocalModelAsProfile(modelId: string) {
  const exists = settings.apiProfiles.some((p) => p.provider === 'local' && p.model === modelId);
  if (exists) {
    showToast('info', t('modelPanel.alreadyProfile'));
    return;
  }
  const meta = localModelStore.models.find((m) => m.id === modelId);
  const profile: ApiProfile = {
    ...settings.createProfileTemplate(),
    name: t('modelPanel.localProfilePrefix', { name: meta?.name ?? modelId }),
    provider: 'local',
    baseUrl: '',
    apiKey: '',
    model: modelId,
    maxTokens: 4096,
  };
  settings.addApiProfile(profile);
  showToast('success', t('modelPanel.profileAdded', { name: profile.name }));
}

/** 模型规模文案 */
function sizeLabel(size: ModelSize): string {
  if (size === 'small') return t('modelPanel.sizeSmall');
  if (size === 'medium') return t('modelPanel.sizeMedium');
  return t('modelPanel.sizeLarge');
}

/** 引擎状态文案 */
const engineStatusText = computed(() => {
  if (localModelStore.capability === null) return t('modelPanel.engineStatusIdle');
  if (localModelStore.isAvailable) return t('modelPanel.engineStatusOk');
  return t('modelPanel.engineStatusFail');
});

/** 引擎状态指示点样式 */
const engineStatusClass = computed(() => {
  if (localModelStore.capability === null) return 'idle';
  return localModelStore.isAvailable ? 'ok' : 'error';
});

/** 检测本地推理引擎能力 */
async function detectLocalEngine() {
  await localModelStore.detectCapability();
  if (localModelStore.isAvailable) {
    showToast('success', t('modelPanel.engineDetected'));
  } else {
    showToast('error', localModelStore.lastError ?? t('modelPanel.engineFail'));
  }
}

// 表单校验
const errors = computed<Record<string, string>>(() => {
  const e: Record<string, string> = {};
  if (!form.value.name.trim()) e.name = t('modelPanel.nameRequired');
  if (form.value.provider !== 'local') {
    if (!form.value.baseUrl.trim()) e.baseUrl = t('modelPanel.baseUrlRequired');
    else if (!/^https?:\/\//.test(form.value.baseUrl)) e.baseUrl = t('modelPanel.baseUrlInvalid');
  }
  if (!form.value.model.trim()) e.model = t('modelPanel.modelRequired');
  // T-16: maxTokens 允许为空(空=供应商默认)
  if (
    form.value.maxTokens !== undefined &&
    form.value.maxTokens !== null &&
    (form.value.maxTokens < 1 || form.value.maxTokens > 32768)
  ) {
    e.maxTokens = t('modelPanel.maxTokensInvalid');
  }
  // apiKey 不强制（部分代理服务无需鉴权）
  return e;
});

const hasErrors = computed(() => Object.keys(errors.value).length > 0);
const canSaveProfile = computed(() => !hasErrors.value && form.value.name.trim().length > 0);

// ── 测试连接（第8条/第10条）──
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string; hints?: string[] } | null>(null);

// ── 获取模型列表（第8条后半）──
const fetchingModels = ref(false);
const modelOptions = ref<string[]>([]);
const modelListResult = ref<{ ok: boolean; message: string } | null>(null);

/** 清空上次测试/模型列表结果（表单变动后） */
watch(
  () => [
    form.value.baseUrl,
    form.value.apiKey,
    form.value.model,
    form.value.provider,
  ],
  () => {
    testResult.value = null;
    modelListResult.value = null;
  }
);

/** 用当前表单值请求 /models，获取可选模型列表 */
async function fetchModelList(): Promise<void> {
  if (hasErrors.value) {
    showToast('error', t('modelPanel.fixErrors'));
    return;
  }
  fetchingModels.value = true;
  modelListResult.value = null;
  try {
    const client = createApiClient(form.value as unknown as ApiProfile);
    const models = (await client.listModels?.()) ?? [];
    modelOptions.value = models;
    modelListResult.value = {
      ok: true,
      message: models.length ? t('modelPanel.modelsFetched', { count: models.length }) : t('modelPanel.modelsEmpty'),
    };
  } catch (err) {
    modelOptions.value = [];
    modelListResult.value = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    fetchingModels.value = false;
  }
}

/**
 * 失败诊断提示：结合错误类型与 baseUrl 分析常见原因
 * 仅对网络层失败（Failed to fetch / timeout 等）给出针对性建议
 */
function buildTestHints(err: unknown): string[] {
  const hints: string[] = [];
  const msg = err instanceof Error ? err.message : String(err);
  if (!/failed to fetch|network|load failed|timeout|connection/i.test(msg)) return hints;
  try {
    const url = new URL(form.value.baseUrl);
    const host = url.hostname;
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    if (isLocal) {
      hints.push(t('modelPanel.hintLocal'));
      hints.push(t('modelPanel.hintLocal2'));
    } else {
      hints.push(t('modelPanel.hintRemote'));
    }
    if (url.protocol === 'http:' && window.location.protocol === 'https:') {
      hints.push(t('modelPanel.hintMixed'));
    }
  } catch {
    // baseUrl 无法解析，保留通用提示
  }
  return hints;
}

/** 用当前表单值发起最小请求，验证 url + key 可用性 */
async function testConnection(): Promise<void> {
  if (hasErrors.value) {
    showToast('error', t('modelPanel.fixErrors'));
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const client = createApiClient(form.value as unknown as ApiProfile);
    const content = await client.chat({
      messages: [{ role: 'user', content: 'ping' }],
      model: form.value.model,
      maxTokens: 1,
    });
    testResult.value = {
      ok: true,
      message: t('modelPanel.testOk', { response: content ? t('modelPanel.testOkSuffix', { content: content.slice(0, 40) }) : '' }),
    };
  } catch (err) {
    testResult.value = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      hints: buildTestHints(err),
    };
  } finally {
    testing.value = false;
  }
}

// provider 选项
const providerOptions: Array<{ value: 'openai' | 'anthropic' | 'custom' | 'deepseek' | 'local'; label: string; defaultBaseUrl: string }> = [
  { value: 'openai', label: t('modelPanel.providerOpenai'), defaultBaseUrl: 'https://api.openai.com' },
  { value: 'deepseek', label: t('modelPanel.providerDeepseek'), defaultBaseUrl: 'https://api.deepseek.com' },
  { value: 'anthropic', label: t('modelPanel.providerAnthropic'), defaultBaseUrl: 'https://api.anthropic.com' },
  { value: 'custom', label: t('modelPanel.providerCustom'), defaultBaseUrl: '' },
  { value: 'local', label: t('modelPanel.providerLocal'), defaultBaseUrl: '' },
];

function resetForm() {
  form.value = {
    id: '',
    name: '',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-4o',
    category: 'chat',
    maxTokens: undefined as number | undefined,
    reasoningSupport: 'auto' as 'auto' | 'on' | 'off',
    reasoningEffort: '' as '' | 'low' | 'medium' | 'high',
    topP: '' as string | number,
    presencePenalty: '' as string | number,
    frequencyPenalty: '' as string | number,
  };
}

function openCreateModal() {
  resetForm();
  const tpl = settings.createProfileTemplate();
  form.value = {
    ...tpl,
    maxTokens: tpl.maxTokens ?? undefined,
    category: (tpl.category ?? 'chat') as 'chat' | 'image-video' | 'embedding',
    reasoningSupport: (tpl.reasoningSupport ?? 'auto') as 'auto' | 'on' | 'off',
    reasoningEffort: (tpl.reasoningEffort ?? '') as '' | 'low' | 'medium' | 'high',
    topP: tpl.sampling?.topP ?? '',
    presencePenalty: tpl.sampling?.presencePenalty ?? '',
    frequencyPenalty: tpl.sampling?.frequencyPenalty ?? '',
  };
  editMode.value = 'create';
  editModalOpen.value = true;
}

function openEditModal(profile: ApiProfile) {
  form.value = {
    ...profile,
    maxTokens: profile.maxTokens ?? undefined,
    provider: profile.provider as 'openai' | 'anthropic' | 'custom' | 'deepseek',
    category: (profile.category ?? 'chat') as 'chat' | 'image-video' | 'embedding',
    reasoningSupport: (profile.reasoningSupport ?? 'auto') as 'auto' | 'on' | 'off',
    reasoningEffort: (profile.reasoningEffort ?? '') as '' | 'low' | 'medium' | 'high',
    topP: profile.sampling?.topP ?? '',
    presencePenalty: profile.sampling?.presencePenalty ?? '',
    frequencyPenalty: profile.sampling?.frequencyPenalty ?? '',
  };
  editMode.value = 'edit';
  editModalOpen.value = true;
}

function onProviderChange() {
  // 切换 provider 时自动填充默认 baseUrl
  const opt = providerOptions.find((o) => o.value === form.value.provider);
  if (opt && !form.value.baseUrl.trim()) {
    form.value.baseUrl = opt.defaultBaseUrl;
  }
}

/**
 * P0-3：把表单里的三个采样输入打包为 SamplingOverrides
 * 全部为空时返回 null（避免落盘空对象污染 schema）
 */
function buildProfileSampling(): SamplingOverrides | null {
  const sampling: SamplingOverrides = {
    topP: toOptionalNumber(form.value.topP) ?? null,
    presencePenalty: toOptionalNumber(form.value.presencePenalty) ?? null,
    frequencyPenalty: toOptionalNumber(form.value.frequencyPenalty) ?? null,
  };
  const hasAny =
    sampling.topP !== null ||
    sampling.presencePenalty !== null ||
    sampling.frequencyPenalty !== null;
  return hasAny ? sampling : null;
}

function saveProfile() {
  if (hasErrors.value) {
    showToast('error', t('modelPanel.fixFormErrors'));
    return;
  }
  const payload: ApiProfile = {
    id: form.value.id,
    name: form.value.name.trim(),
    provider: form.value.provider,
    baseUrl: form.value.baseUrl.trim(),
    apiKey: form.value.apiKey.trim(),
    model: form.value.model.trim(),
    category: form.value.category,
    // T-16: 空值保存为 undefined(不传 max_tokens,供应商默认);0/NaN/'' 视为空
    maxTokens: form.value.maxTokens ? form.value.maxTokens : undefined,
    // P0-2: 推理强度支持三态 + Profile 级默认档位（空串 = 不设置）
    reasoningSupport: form.value.reasoningSupport,
    reasoningEffort: form.value.reasoningEffort === '' ? null : form.value.reasoningEffort,
    // P0-3: Profile 级默认采样参数（留空 = 不传 = 供应商默认）
    sampling: buildProfileSampling(),
  };
  if (editMode.value === 'create') {
    settings.addApiProfile(payload);
    showToast('success', t('modelPanel.profileCreated', { name: payload.name }));
  } else {
    settings.updateApiProfile(payload.id, payload);
    // 若更新的是当前激活 profile，同步注入到 chat store
    if (settings.activeApiProfileId === payload.id) {
      chatStore.setApiProfile(payload);
    }
    showToast('success', t('modelPanel.profileUpdated', { name: payload.name }));
  }
  editModalOpen.value = false;
}

function confirmDelete(profile: ApiProfile) {
  deleteTarget.value = profile;
  deleteModalOpen.value = true;
}

function executeDelete() {
  if (!deleteTarget.value) return;
  const name = deleteTarget.value.name;
  const id = deleteTarget.value.id;
  settings.deleteApiProfile(id);
  // 若删除的是当前激活，清空 chat store 的 API Profile
  if (chatStore && settings.activeApiProfileId === null) {
    chatStore.setApiProfile(null);
  }
  deleteModalOpen.value = false;
  deleteTarget.value = null;
  showToast('success', t('modelPanel.profileDeleted', { name }));
}

function activateProfile(profile: ApiProfile) {
  settings.setActiveApiProfile(profile.id);
  chatStore.setApiProfile(profile);
  showToast('success', t('modelPanel.profileActivated', { name: profile.name }));
}

function deactivateProfile() {
  settings.setActiveApiProfile(null);
  chatStore.setApiProfile(null);
  showToast('info', t('modelPanel.profileDeactivated'));
}

// ── 需求3：模型分类管理 ──

/** 模型分类元数据（供模板遍历） */
const modelCategories = MODEL_CATEGORIES;

/** 按分类分组展示模型 */
const modelsByCategory = computed(() => {
  const groups: Record<ModelCategory, ApiProfile[]> = {
    'chat': [],
    'image-video': [],
    'embedding': [],
  };
  for (const p of settings.apiProfiles) {
    const cat = p.category ?? 'chat';
    groups[cat].push(p);
  }
  return groups;
});

/** 获取分类的主模型 ID */
function getPrimaryId(category: ModelCategory): string | null {
  return settings.getPrimaryModel(category)?.id ?? null;
}

/** 设置某分类的主模型 */
function handleSetPrimary(profile: ApiProfile, category: ModelCategory): void {
  settings.setPrimaryModel(profile.id, category);
  showToast('success', t('modelPanel.setPrimaryDone', { name: profile.name, category: MODEL_CATEGORIES.find((c) => c.value === category)?.label ?? '' }));
}

const showApiKey = ref(false);
// ── Toast（自包含，不依赖父组件） ──

watch(
  () => settings.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);

</script>

<template>
    <!-- 需求3+9：统一模型管理（云端按分类分组 + 本地模型统一管理） -->
    <section class="settings-section" aria-labelledby="model-mgmt-title">
      <header class="section-header">
        <h2 id="model-mgmt-title" class="section-title">
          <Icon name="cpu" :size="16" />
          <span>{{ t('modelPanel.title') }}</span>
        </h2>
        <button
          v-if="modelMgmtTab === 'cloud'"
          type="button"
          class="add-btn"
          :aria-label="t('modelPanel.newAria')"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="14" />
          <span>{{ t('modelPanel.new') }}</span>
        </button>
      </header>

      <!-- 云端 / 本地 切换（第9条：统一管理） -->
      <div class="bg-source-tabs model-mgmt-tabs" role="tablist" :aria-label="t('modelPanel.tabsAria')">
        <button
          type="button"
          class="bg-source-tab"
          role="tab"
          :aria-selected="modelMgmtTab === 'cloud'"
          :class="{ active: modelMgmtTab === 'cloud' }"
          @click="modelMgmtTab = 'cloud'"
        >
{{ t('modelPanel.tabCloud') }}
</button>
        <button
          type="button"
          class="bg-source-tab"
          role="tab"
          :aria-selected="modelMgmtTab === 'local'"
          :class="{ active: modelMgmtTab === 'local' }"
          @click="modelMgmtTab = 'local'"
        >
{{ t('modelPanel.tabLocal') }}
</button>
      </div>

      <!-- 云端：按分类分组 + 主模型设置 -->
      <template v-if="modelMgmtTab === 'cloud'">
        <p class="section-hint">
          {{ t('modelPanel.cloudHint') }}
        </p>

        <div
          v-for="cat in modelCategories"
          :key="cat.value"
          class="model-category-group"
        >
          <h3 class="category-group-title">
            <Icon name="git-branch" :size="14" aria-hidden="true" />
            <span>{{ cat.label }}</span>
            <span class="category-count">{{ modelsByCategory[cat.value].length }}</span>
          </h3>
          <p class="category-desc">{{ cat.description }}</p>

          <ul v-if="modelsByCategory[cat.value].length" class="profile-list model-mgmt-list" role="list">
            <li
              v-for="profile in modelsByCategory[cat.value]"
              :key="profile.id"
              class="profile-item"
              :class="{ 'is-primary': getPrimaryId(cat.value) === profile.id }"
            >
              <div class="profile-info">
                <div class="profile-row">
                  <span class="profile-name">{{ profile.name }}</span>
                  <span
                    v-if="getPrimaryId(cat.value) === profile.id"
                    class="primary-badge"
                    :aria-label="t('modelPanel.primaryBadge')"
                  >{{ t('modelPanel.primaryBadge') }}</span>
                  <span class="provider-badge" :data-provider="profile.provider">
                    {{ profile.provider }}
                  </span>
                </div>
                <div class="profile-meta">
                  <span class="meta-item"><Icon name="gear" :size="11" /> {{ profile.model }}</span>
                </div>
              </div>
              <div class="profile-actions">
                <button
                  v-if="getPrimaryId(cat.value) !== profile.id"
                  type="button"
                  class="action-btn set-primary"
                  :aria-label="t('modelPanel.setPrimaryAria', { name: profile.name, category: cat.label })"
                  @click="handleSetPrimary(profile, cat.value)"
                >
                  <Icon name="star" :size="12" />
                  <span>{{ t('modelPanel.setPrimary') }}</span>
                </button>
                <span v-else class="primary-mark" :aria-label="t('modelPanel.currentPrimary')">
                  <Icon name="check" :size="12" />
                  <span>{{ t('modelPanel.currentPrimary') }}</span>
                </span>
              </div>
            </li>
          </ul>
          <p v-else class="empty-hint">{{ t('modelPanel.emptyCategory') }}</p>
        </div>
      </template>

      <!-- 本地：WebLLM 本地模型管理 -->
      <template v-else>
        <p class="section-hint">
          {{ t('modelPanel.localHint') }}
        </p>

        <!-- 引擎能力检测 -->
        <div class="local-engine-box">
          <div class="local-engine-status">
            <span class="status-dot" :class="engineStatusClass" aria-hidden="true"></span>
            <span>{{ engineStatusText }}</span>
          </div>
          <button
            type="button"
            class="data-mgmt-btn"
            :disabled="localModelStore.isDetecting"
            @click="detectLocalEngine"
          >
            {{ localModelStore.isDetecting ? t('modelPanel.detecting') : t('modelPanel.detectEngine') }}
          </button>
        </div>
        <p v-if="localModelStore.lastError" class="field-error" role="alert">{{ localModelStore.lastError }}</p>
        <p v-if="localModelStore.capability?.webgpuSupported" class="field-hint">
          {{ t('modelPanel.browserInfo', {
            browser: localModelStore.capability.browserName,
            vram: localModelStore.capability.estimatedVramMb ? t('modelPanel.vramSuffix', { vram: localModelStore.capability.estimatedVramMb }) : '',
          }) }}
        </p>

        <!-- 本地模型列表 -->
        <ul v-if="localModelStore.models.length" class="profile-list model-mgmt-list" role="list">
          <li
            v-for="m in localModelStore.models"
            :key="m.id"
            class="profile-item"
            :class="{ 'is-loaded': localModelStore.loadedModelId === m.id }"
          >
            <div class="profile-info">
              <div class="profile-row">
                <span class="profile-name">{{ m.name }}</span>
                <span class="provider-badge" data-provider="local">local</span>
                <span class="size-badge" :data-size="m.size">{{ sizeLabel(m.size) }}</span>
                <span class="status-badge" :data-status="m.status" aria-live="polite">
                  {{ localModelStatusLabel(m.id) }}
                </span>
              </div>
              <div class="profile-meta">
                <span class="meta-item"><Icon name="gear" :size="11" /> {{ m.id }}</span>
                <span class="meta-item">{{ t('modelPanel.modelMeta', { download: m.downloadSizeMb, vram: m.vramMb, context: m.contextLength }) }}</span>
              </div>
              <div
                v-if="localModelStore.isLoading && localModelStore.loadProgress?.modelId === m.id"
                class="load-progress"
                aria-live="polite"
              >
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    :style="{ width: `${Math.round(localModelStore.loadProgress.progress * 100)}%` }"
                  ></div>
                </div>
                <span class="progress-text">
                  {{ t('modelPanel.progressText', { percent: Math.round(localModelStore.loadProgress.progress * 100), phase: localModelStore.loadProgress.phase }) }}
                </span>
              </div>
            </div>
            <div class="profile-actions">
              <button
                v-if="localModelStore.loadedModelId !== m.id"
                type="button"
                class="action-btn"
                :disabled="localModelStore.isLoading || !localModelStore.isAvailable"
                :aria-label="t('modelPanel.loadAria', { name: m.name })"
                @click="handleLoadLocalModel(m.id)"
              >
                <span>{{ localModelStore.isLoading && localModelStore.loadProgress?.modelId === m.id ? t('modelPanel.loading') : t('modelPanel.load') }}</span>
              </button>
              <button
                v-else
                type="button"
                class="action-btn danger"
                :aria-label="t('modelPanel.unloadAria', { name: m.name })"
                @click="handleUnloadLocalModel"
              >
                <span>{{ t('modelPanel.unload') }}</span>
              </button>
              <button
                type="button"
                class="action-btn"
                :aria-label="t('modelPanel.addToConfigAria', { name: m.name })"
                @click="addLocalModelAsProfile(m.id)"
              >
                <span>{{ t('modelPanel.addToConfig') }}</span>
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="empty-hint local-empty">
          {{ t('modelPanel.localModelsEmpty') }}
          <button type="button" class="link-btn" @click="goToLocalModel">{{ t('modelPanel.goToLocalModel') }}</button>
        </p>
      </template>
    </section>

    <!-- API Profile 管理 -->
    <section class="settings-section" aria-labelledby="api-section-title">
      <header class="section-header">
        <h2 id="api-section-title" class="section-title">
          <Icon name="git-branch" :size="16" />
          <span>{{ t('modelPanel.apiTitle') }}</span>
        </h2>
        <button
          type="button"
          class="add-btn"
          :aria-label="t('modelPanel.apiNewAria')"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="14" />
          <span>{{ t('modelPanel.new') }}</span>
        </button>
      </header>

      <p v-if="settings.apiProfiles.length === 0" class="empty-hint">
        {{ t('modelPanel.apiEmpty') }}
      </p>

      <ul class="profile-list" role="list">
        <li
          v-for="profile in settings.apiProfiles"
          :key="profile.id"
          class="profile-item"
          :class="{ active: settings.activeApiProfileId === profile.id }"
        >
          <div class="profile-info">
            <div class="profile-row">
              <span class="profile-name">{{ profile.name }}</span>
              <span
                v-if="settings.activeApiProfileId === profile.id"
                class="active-badge"
              >{{ t('modelPanel.activeBadge') }}</span>
              <span class="provider-badge" :data-provider="profile.provider">
                {{ profile.provider }}
              </span>
            </div>
            <div class="profile-meta">
              <span class="meta-item"><Icon name="gear" :size="11" /> {{ profile.model }}</span>
              <span class="meta-item meta-url"><Icon name="git-branch" :size="11" /> {{ profile.baseUrl }}</span>
            </div>
          </div>
          <div class="profile-actions">
            <button
              v-if="settings.activeApiProfileId !== profile.id"
              type="button"
              class="action-btn activate"
              :aria-label="t('modelPanel.activateAria')"
              @click="activateProfile(profile)"
            >
              <Icon name="check" :size="12" />
              <span>{{ t('modelPanel.activate') }}</span>
            </button>
            <button
              v-else
              type="button"
              class="action-btn deactivate"
              :aria-label="t('modelPanel.deactivateAria')"
              @click="deactivateProfile"
            >
              <Icon name="stop" :size="12" />
              <span>{{ t('modelPanel.deactivate') }}</span>
            </button>
            <button
              type="button"
              class="action-btn edit"
              :aria-label="t('modelPanel.editAria')"
              @click="openEditModal(profile)"
            >
              <Icon name="pencil" :size="12" />
              <span>{{ t('modelPanel.edit') }}</span>
            </button>
            <button
              type="button"
              class="action-btn delete"
              :aria-label="t('modelPanel.deleteAria')"
              @click="confirmDelete(profile)"
            >
              <Icon name="trash-2" :size="12" />
              <span>{{ t('modelPanel.delete') }}</span>
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- P0-1：思维链偏好（全局；剥离开关 + 默认折叠） -->
    <section class="settings-section" aria-labelledby="thinking-prefs-title">
      <header class="section-header">
        <h2 id="thinking-prefs-title" class="section-title">
          <Icon name="brain" :size="16" />
          <span>{{ t('settings.thinkingTitle') }}</span>
        </h2>
      </header>

      <label class="pref-row">
        <span class="pref-text">
          <span class="pref-label">{{ t('settings.thinkingStripHistory') }}</span>
          <span class="pref-desc">{{ t('settings.thinkingStripHistoryDesc') }}</span>
        </span>
        <input
          v-model="stripFromHistory"
          type="checkbox"
          class="pref-checkbox"
          :aria-label="t('settings.thinkingStripHistory')"
          @change="onThinkingPrefChange"
        />
      </label>

      <label class="pref-row">
        <span class="pref-text">
          <span class="pref-label">{{ t('settings.thinkingDefaultCollapsed') }}</span>
          <span class="pref-desc">{{ t('settings.thinkingDefaultCollapsedDesc') }}</span>
        </span>
        <input
          v-model="defaultCollapsed"
          type="checkbox"
          class="pref-checkbox"
          :aria-label="t('settings.thinkingDefaultCollapsed')"
          @change="onThinkingPrefChange"
        />
      </label>
    </section>

    <!-- MODEL-03：创作模式（Preset）—— 全局切换 + 实际生效参数检查 -->
    <section class="settings-section" aria-labelledby="preset-title">
      <header class="section-header">
        <h2 id="preset-title" class="section-title">
          <Icon name="palette" :size="16" />
          <span>{{ t('preset.title') }}</span>
        </h2>
      </header>
      <p class="preset-hint">{{ t('preset.hint') }}</p>

      <fieldset class="preset-fieldset">
        <legend class="preset-legend">{{ t('preset.label') }}</legend>
        <label
          v-for="id in presetIds"
          :key="id"
          class="preset-option"
        >
          <input
            type="radio"
            name="creation-preset"
            class="preset-radio"
            :value="id"
            :checked="activePreset === id"
            :aria-label="presetLabel(id)"
            @change="onPresetChange(id)"
          />
          <span class="preset-option-body">
            <span class="preset-option-label">{{ presetLabel(id) }}</span>
            <span class="preset-option-desc">{{ presetDescription(id) }}</span>
          </span>
        </label>
      </fieldset>

      <template v-if="activePreset !== 'custom'">
        <div class="preset-inspect">
          <div class="preset-inspect-header">
            <span class="preset-inspect-title">{{ t('preset.inspectTitle') }}</span>
            <span class="preset-inspect-version">
              {{ t('preset.version', { version: activePresetResolution.presetVersion }) }}
            </span>
          </div>
          <dl class="preset-params">
            <div v-for="row in presetSamplingRows" :key="row.key" class="preset-param-row">
              <dt class="preset-param-label">{{ t(row.labelKey) }}</dt>
              <dd class="preset-param-value">
                <span>{{ activePresetResolution.sampling[row.key].value ?? '—' }}</span>
                <span
                  class="preset-param-source"
                  :class="{ 'is-preset': activePresetResolution.sampling[row.key].source === 'preset' }"
                >
                  {{
                    activePresetResolution.sampling[row.key].source === 'preset'
                      ? t('preset.sourcePreset')
                      : t('preset.sourceInherit')
                  }}
                </span>
              </dd>
            </div>
            <div class="preset-param-row">
              <dt class="preset-param-label">{{ t('preset.contextBudget') }}</dt>
              <dd class="preset-param-value">
                <span>{{ t('preset.contextBudgetPercent', { percent: activePresetBudgetPercent }) }}</span>
                <span
                  class="preset-param-source"
                  :class="{ 'is-preset': activePresetResolution.contextBudgetFactor.source === 'preset' }"
                >
                  {{
                    activePresetResolution.contextBudgetFactor.source === 'preset'
                      ? t('preset.sourcePreset')
                      : t('preset.sourceInherit')
                  }}
                </span>
              </dd>
            </div>
            <div class="preset-param-row">
              <dt class="preset-param-label">{{ t('preset.statusInstruction') }}</dt>
              <dd class="preset-param-value">
                <span>{{ activePresetResolution.statusInstruction.value ? t('preset.statusOn') : t('preset.statusOff') }}</span>
                <span
                  class="preset-param-source"
                  :class="{ 'is-preset': activePresetResolution.statusInstruction.source === 'preset' }"
                >
                  {{
                    activePresetResolution.statusInstruction.source === 'preset'
                      ? t('preset.sourcePreset')
                      : t('preset.sourceInherit')
                  }}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </template>
      <p v-else class="preset-hint">{{ t('preset.customHint') }}</p>
    </section>

    <Modal
      v-model="editModalOpen"
      :title="editMode === 'create' ? t('modelPanel.createTitle') : t('modelPanel.editTitle')"
      :aria-label="t('modelPanel.formAria')"
    >
      <form class="profile-form" novalidate @submit.prevent="saveProfile">
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
          <label for="p-maxtok" class="field-label">{{ t('modelPanel.maxTokensLabel') }}</label>
          <input
            id="p-maxtok"
            v-model.number="form.maxTokens"
            type="number"
            min="1"
            max="32768"
            step="1"
            class="field-input"
            :class="{ 'has-error': errors.maxTokens }"
            :aria-invalid="!!errors.maxTokens"
            :aria-describedby="errors.maxTokens ? 'err-maxtok' : undefined"
            :placeholder="t('modelPanel.maxTokensPlaceholder')"
          />
          <p v-if="errors.maxTokens" id="err-maxtok" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" />
            <span>{{ errors.maxTokens }}</span>
          </p>
          <p class="field-hint">{{ t('modelPanel.maxTokensHint') }}</p>
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
          @click="saveProfile"
        >
          <Icon name="save" :size="14" />
          <span>{{ editMode === 'create' ? t('modelPanel.create') : t('modelPanel.save') }}</span>
        </button>
      </template>
    </Modal>

    <!-- 自包含 Toast -->


    <Modal
      v-model="deleteModalOpen"
      :title="t('modelPanel.deleteTitle')"
      :aria-label="t('modelPanel.deleteAria2')"
      described-by="profile-delete-desc profile-delete-warning"
    >
      <p id="profile-delete-desc" v-if="deleteTarget">
        {{ t('modelPanel.deleteConfirm', { name: deleteTarget.name }) }}
      </p>
      <p id="profile-delete-warning" class="delete-warning">{{ t('modelPanel.deleteWarning') }}</p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          {{ t('modelPanel.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="executeDelete"
        >
          {{ t('modelPanel.delete') }}
        </button>
      </template>
    </Modal>
</template>
<style scoped>
/* ── 标准 section 容器（从 SettingsView.vue 复制，因 scoped 不穿透子组件） ── */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  gap: var(--spacing-sm);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

/* P0-1：思维链偏好行 */
.pref-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
  border-top: 1px solid var(--border);
  cursor: pointer;
}

.pref-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.pref-label {
  font-size: 13px;
  color: var(--foreground);
}

.pref-desc {
  font-size: 11px;
  line-height: 1.55;
  color: var(--muted-foreground);
}

.pref-checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--secondary);
  cursor: pointer;
}

.pref-checkbox:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

/* MODEL-03：创作模式（Preset） */
.preset-hint {
  margin: 0 0 var(--spacing-sm);
  font-size: 11px;
  line-height: 1.55;
  color: var(--muted-foreground);
}

.preset-fieldset {
  margin: 0;
  padding: var(--spacing-xs) var(--spacing-md) var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.preset-legend {
  padding: 0 var(--spacing-xs);
  font-size: 11px;
  color: var(--muted-foreground);
}

.preset-option {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
  cursor: pointer;
}

.preset-option + .preset-option {
  border-top: 1px solid var(--border);
}

.preset-radio {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  accent-color: var(--secondary);
  cursor: pointer;
}

.preset-radio:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.preset-option-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.preset-option-label {
  font-size: 13px;
  color: var(--foreground);
}

.preset-option-desc {
  font-size: 11px;
  line-height: 1.55;
  color: var(--muted-foreground);
}

.preset-inspect {
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.preset-inspect-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.preset-inspect-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.preset-inspect-version {
  font-size: 11px;
  color: var(--muted-foreground);
}

.preset-params {
  margin: var(--spacing-sm) 0 0;
}

.preset-param-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-xs) 0;
}

.preset-param-row + .preset-param-row {
  border-top: 1px solid var(--border);
}

.preset-param-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.preset-param-value {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin: 0;
  font-size: 12px;
  color: var(--foreground);
  text-align: right;
}

.preset-param-source {
  font-size: 10px;
  color: var(--muted-foreground);
}

.preset-param-source.is-preset {
  color: var(--secondary-text);
}

.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
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

.data-mgmt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  border: 1px solid var(--border);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .data-mgmt-btn:hover:not(:disabled) {
    background: var(--card);
    border-color: var(--secondary);
  }
}

.data-mgmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 云端/本地切换 tabs（从 SettingsView.vue 复制，因 scoped 不穿透子组件） ── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

/* 2026-10-12 删掉此处 56 行死样式：`.theme-card / .theme-swatch / .swatch-*` 是从
   Round-3 拆分前带过来的，本组件模板里没有任何 theme-card（实测 grep 模板零命中），
   而卡片渲染在 SettingsAppearancePanel.vue ⇒ scoped 样式跨不过组件。
   预览色块的正确归属已搬到 SettingsAppearancePanel.vue。 */

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.theme-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.theme-desc {
  font-size: 11px;
  color: var(--muted-foreground);
}

.theme-check {
  color: var(--secondary-text);
  flex-shrink: 0;
}

/* ── 字号选择 ── */
.fontsize-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.fontsize-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
  transition: border-color .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .fontsize-card:hover {
    border-color: var(--secondary);
  }
}

.fontsize-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.fontsize-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.fontsize-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground);
}

.fontsize-value {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
}

.fontsize-sample {
  color: var(--muted-foreground);
  line-height: 1.3;
  margin-top: var(--spacing-xs);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.preview-label {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

.preview-box {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  line-height: 1.6;
}

.preview-line {
  margin: 0;
}

.preview-line.muted {
  color: var(--muted-foreground);
}

/* ── API Profile 管理 ── */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--on-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .add-btn:hover {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

.add-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  padding: var(--spacing-md) 0;
  text-align: center;
}

.local-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.local-empty .link-btn {
  appearance: none;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--primary, #4f8cff);
  font-size: 13px;
  padding: 6px var(--spacing-md);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .local-empty .link-btn:hover {
    background: var(--primary-muted, rgba(128, 128, 128, 0.12));
    border-color: var(--primary, #4f8cff);
  }
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color .15s ease, background-color .15s ease;
}

.profile-item.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 6%, transparent);
}

.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.active-badge {
  background: var(--secondary);
  color: var(--on-secondary);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.provider-badge {
  background: var(--badge-bg);
  color: var(--badge-fg);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  text-transform: lowercase;
}

.provider-badge[data-provider='openai'] {
  background: color-mix(in srgb, var(--brand-openai) 20%, transparent);
  color: var(--brand-openai);
}

.provider-badge[data-provider='anthropic'] {
  background: color-mix(in srgb, var(--brand-anthropic) 20%, transparent);
  color: var(--brand-anthropic);
}

.provider-badge[data-provider='custom'] {
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary-fg);
}

.provider-badge[data-provider='deepseek'] {
  background: color-mix(in srgb, var(--accent-blue) 20%, transparent);
  color: var(--accent-blue);
}

/* ── 需求3：模型管理面板 ── */

/* 模型分类分组：卡片式容器（对齐外观页「界面自定义」.ui-custom-block 风格） */
.model-category-group {
  margin-top: 12px;
  padding: var(--spacing-md);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-category-group:first-of-type {
  margin-top: 0;
}

.category-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.category-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
}

.category-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.model-mgmt-list {
  margin-top: 0;
}

.profile-item.is-primary {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.primary-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.primary-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--primary-fg);
  font-weight: 500;
}

.action-btn.set-primary {
  color: var(--warning-fg);
  border-color: var(--warning-border);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.set-primary:hover {
    background: var(--warning-bg);
    border-color: var(--warning-fg);
    color: var(--warning-fg);
  }
}

.profile-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-url {
  font-family: var(--font-mono);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
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

@media (hover: hover) and (pointer: fine) {
  .action-btn.activate:hover {
    background: var(--tk-cyan-600);
    border-color: var(--tk-cyan-600);
  }
}

.action-btn.deactivate {
  background: var(--video-bg);
  color: var(--muted-foreground);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

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
  height: 36px;
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
  height: 36px;
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
  color: var(--success);
}

.test-result.fail {
  border-color: color-mix(in srgb, var(--destructive) 45%, transparent);
  background: color-mix(in srgb, var(--destructive) 10%, transparent);
  color: var(--destructive);
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
  color: var(--success);
}

.model-list-result.fail {
  color: var(--destructive);
}

.field-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: var(--font-sans);
  line-height: 1.55;
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
  height: 28px;
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

.delete-warning {
  margin-top: var(--spacing-sm);
  color: var(--error-fg);
  font-size: 13px;
}

.size-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--spacing-sm);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--badge-bg);
  color: var(--badge-fg);
}

.size-badge[data-size='small'] {
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary-text);
}

.size-badge[data-size='medium'] {
  background: color-mix(in srgb, var(--warning-fg, #f59e0b) 16%, transparent);
  color: var(--warning-fg, #f59e0b);
}

.size-badge[data-size='large'] {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 14%, transparent);
  color: var(--tk-red-500, #ef4444);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--spacing-sm);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--badge-bg);
  color: var(--badge-fg);
}

.status-badge[data-status='loaded'] {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary-fg);
}

.status-badge[data-status='loading'],
.status-badge[data-status='downloading'] {
  background: color-mix(in srgb, var(--warning-fg, #f59e0b) 16%, transparent);
  color: var(--warning-fg, #f59e0b);
}

.status-badge[data-status='error'] {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 14%, transparent);
  color: var(--tk-red-500, #ef4444);
}

.profile-item.is-loaded {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.local-engine-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin-bottom: var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.local-engine-status {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 13px;
  color: var(--foreground);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.status-dot.ok {
  background: var(--primary);
}

.status-dot.error {
  background: var(--tk-red-500, #ef4444);
}

.load-progress {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.progress-track {
  flex: 1;
  max-width: 220px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--primary);
  transition: width 0.2s ease;
}

.progress-text {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.action-btn.danger {
  color: var(--tk-red-500, #ef4444);
  border-color: color-mix(in srgb, var(--tk-red-500, #ef4444) 45%, transparent);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--tk-red-500, #ef4444) 12%, transparent);
  }
}

/* ── 云端/本地切换 tabs（从 SettingsView.vue 复制，因 scoped 不穿透子组件） ── */
.model-mgmt-tabs {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs);
  background: var(--video-bg);
  border-radius: var(--radius-md);
}

.model-mgmt-tabs .bg-source-tab {
  flex: 1;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  border-radius: calc(var(--radius-md) - 2px);
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.model-mgmt-tabs .bg-source-tab.active {
  background: var(--card);
  color: var(--foreground);
  font-weight: 500;
}

.model-mgmt-tabs .bg-source-tab:focus-visible {
  outline: 2px solid var(--tk-cyan-500);
  outline-offset: 2px;
}

/* ── 窄屏：侧边栏转为顶部横向分类栏 ── */
@media (max-width: 640px) {
  .settings-view {
    flex-direction: column;
  }
  .settings-nav {
    width: auto;
    margin: var(--spacing-sm);
    max-height: none;
    position: static;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .settings-nav-inner {
    display: flex;
    flex-direction: column;
  }
  .settings-nav-list {
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .settings-nav-item {
    flex: 0 0 auto;
    width: auto;
    padding: var(--spacing-sm) 12px;
  }
  .settings-nav-item-desc {
    display: none;
  }
  .settings-body {
    padding: var(--spacing-md);
    max-width: none;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input {
    font-size: 16px;
  }
}
</style>
