<script setup lang="ts">
/**
 * SettingsModelPanel — 设置页「模型管理」面板（P2-7 拆分）
 *
 * 自 SettingsView.vue 迁出：云端/本地模型统一管理 + API 配置 CRUD + 测试连接。
 * 依赖 settings / chat / localModel 三个 store，不依赖父组件状态。
 */
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useLocalModelStore } from '@/stores/local-model';
import { MODEL_CATEGORIES, type ModelCategory } from '@/types';
import { createApiClient } from '@/api';
import type { ApiProfile } from '@/types';
import type { ModelSize } from '@/core/local-model-engine';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';

const settings = useSettingsStore();
const chatStore = useChatStore();
const localModelStore = useLocalModelStore();

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
});

// ── 本地模型（第9条：与云端统一管理） ──
const modelMgmtTab = ref<'cloud' | 'local'>('cloud');

/** 本地模型状态文案 */
function localModelStatusLabel(id: string): string {
  const status = localModelStore.modelStatuses.get(id);
  if (status === 'loading' || status === 'downloading') return '加载中…';
  if (status === 'loaded') return '已加载';
  if (status === 'error') return '加载失败';
  return '未加载';
}

async function handleLoadLocalModel(modelId: string) {
  const ok = await localModelStore.loadModel(modelId);
  showToast(ok ? 'success' : 'error', ok ? `本地模型已加载：${modelId}` : (localModelStore.lastError ?? '加载失败'));
}

async function handleUnloadLocalModel() {
  await localModelStore.unloadModel();
  showToast('info', '本地模型已卸载');
}

/** 将本地模型注册为模型配置（provider='local'），供对话页直接选择使用 */
function addLocalModelAsProfile(modelId: string) {
  const exists = settings.apiProfiles.some((p) => p.provider === 'local' && p.model === modelId);
  if (exists) {
    showToast('info', '该本地模型已是模型配置');
    return;
  }
  const meta = localModelStore.models.find((m) => m.id === modelId);
  const profile: ApiProfile = {
    ...settings.createProfileTemplate(),
    name: `本地·${meta?.name ?? modelId}`,
    provider: 'local',
    baseUrl: '',
    apiKey: '',
    model: modelId,
    maxTokens: 4096,
  };
  settings.addApiProfile(profile);
  showToast('success', `已添加本地模型配置：${profile.name}`);
}

/** 模型规模文案 */
function sizeLabel(size: ModelSize): string {
  if (size === 'small') return '小';
  if (size === 'medium') return '中';
  return '大';
}

/** 引擎状态文案 */
const engineStatusText = computed(() => {
  if (localModelStore.capability === null) return '未检测引擎能力';
  if (localModelStore.isAvailable) return '引擎可用（WebGPU + WebLLM）';
  return '引擎不可用';
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
    showToast('success', '本地推理引擎可用');
  } else {
    showToast('error', localModelStore.lastError ?? '本地推理引擎不可用');
  }
}

// 表单校验
const errors = computed<Record<string, string>>(() => {
  const e: Record<string, string> = {};
  if (!form.value.name.trim()) e.name = '名称为必填项';
  if (form.value.provider !== 'local') {
    if (!form.value.baseUrl.trim()) e.baseUrl = 'Base URL 不能为空';
    else if (!/^https?:\/\//.test(form.value.baseUrl)) e.baseUrl = 'Base URL 必须以 http:// 或 https:// 开头';
  }
  if (!form.value.model.trim()) e.model = '模型名不能为空';
  // T-16: maxTokens 允许为空(空=供应商默认)
  if (
    form.value.maxTokens !== undefined &&
    form.value.maxTokens !== null &&
    (form.value.maxTokens < 1 || form.value.maxTokens > 32768)
  ) {
    e.maxTokens = 'maxTokens 范围 1 ~ 32768(留空使用供应商默认)';
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
    showToast('error', '请先修正表单错误');
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
      message: models.length ? `获取到 ${models.length} 个模型，可直接选择` : '该服务未返回模型列表，请手动输入',
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
      hints.push('检测到本地/内网地址：开发模式已自动走代理绕过 CORS，请确认模型服务已启动且 IP/端口正确');
      hints.push('本地模型建议使用桌面版（原生网络栈，无 CORS 限制）；也可为服务端开启 CORS（如 Ollama 设 OLLAMA_ORIGINS=*）');
    } else {
      hints.push('请检查 API 地址与 Key 是否正确，且服务商允许浏览器跨域（CORS）访问');
    }
    if (url.protocol === 'http:' && window.location.protocol === 'https:') {
      hints.push('HTTPS 页面会拦截对 HTTP 地址的请求（混合内容），请改用 HTTPS 地址或本地环境');
    }
  } catch {
    // baseUrl 无法解析，保留通用提示
  }
  return hints;
}

/** 用当前表单值发起最小请求，验证 url + key 可用性 */
async function testConnection(): Promise<void> {
  if (hasErrors.value) {
    showToast('error', '请先修正表单错误');
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
      message: `连接成功${content ? `，响应：${content.slice(0, 40)}` : ''}`,
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
  { value: 'openai', label: 'OpenAI 兼容', defaultBaseUrl: 'https://api.openai.com' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com' },
  { value: 'anthropic', label: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com' },
  { value: 'custom', label: '自定义', defaultBaseUrl: '' },
  { value: 'local', label: '本地模型（WebLLM）', defaultBaseUrl: '' },
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
  };
}

function openCreateModal() {
  resetForm();
  const tpl = settings.createProfileTemplate();
  form.value = {
    ...tpl,
    maxTokens: tpl.maxTokens ?? undefined,
    category: (tpl.category ?? 'chat') as 'chat' | 'image-video' | 'embedding',
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

function saveProfile() {
  if (hasErrors.value) {
    showToast('error', '请修正表单中的错误');
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
  };
  if (editMode.value === 'create') {
    settings.addApiProfile(payload);
    showToast('success', `已创建 API 配置：${payload.name}`);
  } else {
    settings.updateApiProfile(payload.id, payload);
    // 若更新的是当前激活 profile，同步注入到 chat store
    if (settings.activeApiProfileId === payload.id) {
      chatStore.setApiProfile(payload);
    }
    showToast('success', `已更新 API 配置：${payload.name}`);
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
  showToast('success', `已删除 API 配置：${name}`);
}

function activateProfile(profile: ApiProfile) {
  settings.setActiveApiProfile(profile.id);
  chatStore.setApiProfile(profile);
  showToast('success', `已切换激活 API 配置：${profile.name}`);
}

function deactivateProfile() {
  settings.setActiveApiProfile(null);
  chatStore.setApiProfile(null);
  showToast('info', '已停用 API Profile（生成将不可用）');
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
  showToast('success', `已将「${profile.name}」设为${MODEL_CATEGORIES.find((c) => c.value === category)?.label}主模型`);
}

const showApiKey = ref(false);
// ── Toast（自包含，不依赖父组件） ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

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
          <span>模型管理</span>
        </h2>
        <button
          v-if="modelMgmtTab === 'cloud'"
          type="button"
          class="add-btn"
          aria-label="新增模型配置"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="14" />
          <span>新增</span>
        </button>
      </header>

      <!-- 云端 / 本地 切换（第9条：统一管理） -->
      <div class="bg-source-tabs model-mgmt-tabs" role="tablist" aria-label="模型管理范围">
        <button
          type="button"
          class="bg-source-tab"
          role="tab"
          :aria-selected="modelMgmtTab === 'cloud'"
          :class="{ active: modelMgmtTab === 'cloud' }"
          @click="modelMgmtTab = 'cloud'"
        >云端模型</button>
        <button
          type="button"
          class="bg-source-tab"
          role="tab"
          :aria-selected="modelMgmtTab === 'local'"
          :class="{ active: modelMgmtTab === 'local' }"
          @click="modelMgmtTab = 'local'"
        >本地模型</button>
      </div>

      <!-- 云端：按分类分组 + 主模型设置 -->
      <template v-if="modelMgmtTab === 'cloud'">
        <p class="section-hint">
          按分类管理所有 API 模型，每分类可设置一个主模型供调用使用。
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
                    aria-label="主模型"
                  >主模型</span>
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
                  :aria-label="`将 ${profile.name} 设为${cat.label}主模型`"
                  @click="handleSetPrimary(profile, cat.value)"
                >
                  <Icon name="star" :size="12" />
                  <span>设为主模型</span>
                </button>
                <span v-else class="primary-mark" aria-label="当前主模型">
                  <Icon name="check" :size="12" />
                  <span>当前主模型</span>
                </span>
              </div>
            </li>
          </ul>
          <p v-else class="empty-hint">该分类暂无模型，点击「新增」添加。</p>
        </div>
      </template>

      <!-- 本地：WebLLM 本地模型管理 -->
      <template v-else>
        <p class="section-hint">
          本地模型由浏览器内 WebLLM 推理引擎驱动（需 WebGPU），下载后点击「添加到配置」即可在对话页直接调用，无需 API Key。
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
            {{ localModelStore.isDetecting ? '检测中…' : '检测引擎' }}
          </button>
        </div>
        <p v-if="localModelStore.lastError" class="field-error" role="alert">{{ localModelStore.lastError }}</p>
        <p v-if="localModelStore.capability?.webgpuSupported" class="field-hint">
          浏览器：{{ localModelStore.capability.browserName }}{{ localModelStore.capability.estimatedVramMb ? ` · 可用显存约 ${localModelStore.capability.estimatedVramMb}MB` : '' }}
        </p>

        <!-- 本地模型列表 -->
        <ul class="profile-list model-mgmt-list" role="list">
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
                <span class="meta-item">下载 {{ m.downloadSizeMb }}MB · 显存约 {{ m.vramMb }}MB · 上下文 {{ m.contextLength }}tokens</span>
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
                  {{ Math.round(localModelStore.loadProgress.progress * 100) }}%（{{ localModelStore.loadProgress.phase }}）
                </span>
              </div>
            </div>
            <div class="profile-actions">
              <button
                v-if="localModelStore.loadedModelId !== m.id"
                type="button"
                class="action-btn"
                :disabled="localModelStore.isLoading || !localModelStore.isAvailable"
                :aria-label="`加载本地模型 ${m.name}`"
                @click="handleLoadLocalModel(m.id)"
              >
                <span>{{ localModelStore.isLoading && localModelStore.loadProgress?.modelId === m.id ? '加载中…' : '加载' }}</span>
              </button>
              <button
                v-else
                type="button"
                class="action-btn danger"
                :aria-label="`卸载本地模型 ${m.name}`"
                @click="handleUnloadLocalModel"
              >
                <span>卸载</span>
              </button>
              <button
                type="button"
                class="action-btn"
                :aria-label="`将本地模型 ${m.name} 添加到模型配置`"
                @click="addLocalModelAsProfile(m.id)"
              >
                <span>添加到配置</span>
              </button>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <!-- API Profile 管理 -->
    <section class="settings-section" aria-labelledby="api-section-title">
      <header class="section-header">
        <h2 id="api-section-title" class="section-title">
          <Icon name="git-branch" :size="16" />
          <span>API 配置</span>
        </h2>
        <button
          type="button"
          class="add-btn"
          aria-label="新增 API 配置"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="14" />
          <span>新增</span>
        </button>
      </header>

      <p v-if="settings.apiProfiles.length === 0" class="empty-hint">
        还没有 API 配置，点击「新增」开始添加第一个。
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
              >激活中</span>
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
              aria-label="激活此 API 配置"
              @click="activateProfile(profile)"
            >
              <Icon name="check" :size="12" />
              <span>激活</span>
            </button>
            <button
              v-else
              type="button"
              class="action-btn deactivate"
              aria-label="停用当前 API 配置"
              @click="deactivateProfile"
            >
              <Icon name="stop" :size="12" />
              <span>停用</span>
            </button>
            <button
              type="button"
              class="action-btn edit"
              aria-label="编辑 API 配置"
              @click="openEditModal(profile)"
            >
              <Icon name="pencil" :size="12" />
              <span>编辑</span>
            </button>
            <button
              type="button"
              class="action-btn delete"
              aria-label="删除 API 配置"
              @click="confirmDelete(profile)"
            >
              <Icon name="trash-2" :size="12" />
              <span>删除</span>
            </button>
          </div>
        </li>
      </ul>
    </section>

    <Modal
      v-model="editModalOpen"
      :title="editMode === 'create' ? '新增 API 配置' : '编辑 API 配置'"
      aria-label="API 配置表单"
    >
      <form class="profile-form" novalidate @submit.prevent="saveProfile">
        <div class="form-field">
          <label for="p-name" class="field-label">名称 <span class="required">*</span></label>
          <input
            id="p-name"
            v-model="form.name"
            type="text"
            class="field-input"
            :class="{ 'has-error': errors.name }"
            :aria-invalid="!!errors.name"
            :aria-describedby="errors.name ? 'err-name' : undefined"
            placeholder="如：OpenAI 官方"
            autocomplete="off"
          />
          <p v-if="errors.name" id="err-name" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" />
            <span>{{ errors.name }}</span>
          </p>
        </div>

        <div class="form-field">
          <label for="p-provider" class="field-label">服务商</label>
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
          <label for="p-category" class="field-label">模型分类</label>
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
          <label for="p-baseurl" class="field-label">Base URL <span class="required">*</span></label>
          <input
            id="p-baseurl"
            v-model="form.baseUrl"
            type="text"
            class="field-input"
            :class="{ 'has-error': errors.baseUrl }"
            :aria-invalid="!!errors.baseUrl"
            :aria-describedby="errors.baseUrl ? 'err-baseurl' : undefined"
            placeholder="https://api.openai.com"
            autocomplete="off"
          />
          <p v-if="errors.baseUrl" id="err-baseurl" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" />
            <span>{{ errors.baseUrl }}</span>
          </p>
        </div>

        <div class="form-field">
          <label for="p-model" class="field-label">模型 <span class="required">*</span></label>
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
              <span>{{ fetchingModels ? '获取中…' : '获取模型列表' }}</span>
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
          <label for="p-apikey" class="field-label">API Key</label>
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
              :aria-label="showApiKey ? '隐藏 API Key' : '显示 API Key'"
              :aria-pressed="showApiKey"
              @click="showApiKey = !showApiKey"
            >
              <Icon :name="showApiKey ? 'eye' : 'eye'" :size="14" />
            </button>
          </div>
          <p class="field-hint">部分代理服务可留空；仅存储在本地，不会上传</p>
        </div>

        <div class="form-field">
          <label for="p-maxtok" class="field-label">默认最大 Tokens(可留空)</label>
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
            placeholder="留空使用供应商默认"
          />
          <p v-if="errors.maxTokens" id="err-maxtok" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" />
            <span>{{ errors.maxTokens }}</span>
          </p>
          <p class="field-hint">单次回复的最大 Token 数；留空则不传 max_tokens，由供应商默认（角色未单独设置时使用此值）</p>
        </div>

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
              <span>{{ testing ? '测试中…' : '测试连接' }}</span>
            </button>
            <p class="field-hint">发送最小请求验证 Base URL 与 Key 是否可用</p>
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
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-save"
          :disabled="!canSaveProfile"
          :aria-disabled="!canSaveProfile"
          @click="saveProfile"
        >
          <Icon name="save" :size="14" />
          <span>{{ editMode === 'create' ? '创建' : '保存' }}</span>
        </button>
      </template>
    </Modal>

    <!-- 自包含 Toast -->
    <Toast
      v-model="toastOpen"
      :message="toastMessage"
      :type="toastType"
    />


    <Modal
      v-model="deleteModalOpen"
      title="确认删除"
      aria-label="删除 API 配置确认"
    >
      <p v-if="deleteTarget">
        确定要删除 API 配置「<strong>{{ deleteTarget.name }}</strong>」吗？
      </p>
      <p class="delete-warning">删除后无法恢复，对话中将无法继续生成 AI 回复。</p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="executeDelete"
        >
          删除
        </button>
      </template>
    </Modal>


</template>
<style scoped>
.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

/* ── 主题选择 ── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color .15s ease, background-color .15s ease;
}

.theme-card:hover {
  border-color: var(--secondary);
}

.theme-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.theme-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.theme-swatch {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.swatch-dark {
  background: linear-gradient(135deg, #0B0B10, #161823);
}

.swatch-light {
  background: linear-gradient(135deg, #F7F8FA, #FFFFFF);
}

.swatch-midnight {
  background: linear-gradient(135deg, #0A0E27, #1A2048);
}

.swatch-oled {
  background: linear-gradient(135deg, #000000, #141414);
}

.swatch-theatre {
  background: linear-gradient(135deg, #0C0A09, #201A12);
}

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
  color: var(--secondary);
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
  gap: 4px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
  transition: border-color .15s ease, background-color .15s ease;
}

.fontsize-card:hover {
  border-color: var(--secondary);
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
  margin-top: 4px;
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
  gap: 4px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--on-media);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.add-btn:hover {
  background: var(--destructive);
  border-color: var(--destructive);
}

.add-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  padding: 16px 0;
  text-align: center;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  gap: 4px;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.active-badge {
  background: var(--secondary);
  color: var(--on-accent);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.provider-badge {
  background: var(--border);
  color: var(--muted-foreground);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  text-transform: lowercase;
}

.provider-badge[data-provider='openai'] {
  background: color-mix(in srgb, #10A37F 20%, transparent);
  color: #10A37F;
}

.provider-badge[data-provider='anthropic'] {
  background: color-mix(in srgb, #D97757 20%, transparent);
  color: #D97757;
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

.model-category-group {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.model-category-group:first-of-type {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.category-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 4px 0;
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
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.model-mgmt-list {
  margin-top: 4px;
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

.action-btn.set-primary:hover {
  background: var(--warning-bg);
  border-color: var(--warning-fg);
  color: var(--warning-fg);
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

.action-btn:hover {
  background: var(--card);
  color: var(--foreground);
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.action-btn.activate {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--on-accent);
}

.action-btn.activate:hover {
  background: var(--tk-cyan-600);
  border-color: var(--tk-cyan-600);
}

.action-btn.deactivate {
  background: var(--video-bg);
  color: var(--muted-foreground);
}

.action-btn.delete:hover {
  border-color: var(--destructive);
  color: var(--destructive);
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
  padding-right: 32px;
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
  gap: 4px;
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
  margin-bottom: 8px;
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
  gap: 8px;
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
  padding-left: 16px;
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

/* Persona 区段 (F07) */
.badge-active {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--on-accent);
  background: var(--secondary);
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

.toggle-visibility:hover {
  color: var(--foreground);
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
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

.modal-cancel:hover {
  background: var(--video-bg);
}

.modal-save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-media);
}

.modal-save:hover:not(:disabled) {
  background: var(--destructive);
  border-color: var(--destructive);
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

.modal-confirm:hover {
  background: var(--destructive);
  border-color: var(--destructive);
}

.delete-warning {
  margin-top: 8px;
  color: var(--error-fg);
  font-size: 13px;
}

.size-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--border);
  color: var(--muted-foreground);
}

.size-badge[data-size='small'] {
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary);
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
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--border);
  color: var(--muted-foreground);
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
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.local-engine-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  gap: 8px;
  margin-top: 8px;
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

.action-btn.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 12%, transparent);
}

/* ── 窄屏：侧边栏转为顶部横向分类栏 ── */
@media (max-width: 760px) {
  .settings-view {
    flex-direction: column;
  }
  .settings-nav {
    width: auto;
    margin: 8px;
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
    padding: 8px 12px;
  }
  .settings-nav-item-desc {
    display: none;
  }
  .settings-body {
    padding: 16px;
    max-width: none;
  }
}
</style>
