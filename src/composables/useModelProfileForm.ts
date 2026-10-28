/**
 * useModelProfileForm — API Profile 表单状态与行为（校验 / 测试连接 / 取模型列表 / 保存）
 *
 * R1-4 从 SettingsModelPanel（原 2544 行）拆出。UI 骨架留在 ModelProfileForm.vue，
 * 这里只管数据与副作用：`saveProfile` 是唯一写 store 的出口，其余都是纯派生。
 *
 * `createProfileTemplate()` 决定"新建时的初始值"，`resetForm()` 里的默认值只作为
 * 兜底——两者不一致时以 store 的模板为准（历史行为，未改）。
 */
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useSectionMemory } from '@/composables/useSectionMemory';
import { createApiClient } from '@/api';
import type { ApiProfile, SamplingOverrides } from '@/types';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

/** 常用模型上下文档位（K=1024；1M = 1048576）。更小或更偏的档位仍可直接在输入框里填 */
const CONTEXT_PRESETS = [32768, 65536, 131072, 278528, 409600, 614400, 1048576];

/** 32768 → 32K，1048576 → 1M（按 1024 进制，档位值本身就是 1024 的整数倍） */
function formatK(n: number): string {
  if (n >= 1024 * 1024) {
    const m = n / (1024 * 1024);
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return n >= 1024 ? `${Math.round((n / 1024) * 10) / 10}K` : String(n);
}

/**
 * P0-3：把表单里的采样输入转为 `number | undefined`
 * 空串 / null / NaN 一律视为"未设置"（= 不传 = 供应商默认）
 */
function toOptionalNumber(v: string | number): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export type ProviderValue = 'openai' | 'anthropic' | 'custom' | 'deepseek' | 'local';

export interface ProviderPreset {
  value: ProviderValue;
  /** 选它时预填的端点 */
  defaultBaseUrl: string;
  /** 选它时预填的模型名；空串表示"这家没法预填，让用户自己填" */
  defaultModel: string;
}

/**
 * 切换供应商时"该跟着换的才换"（C-01 零配置首聊）
 *
 * 现场：新建配置的初值是 OpenAI，用户切到 Anthropic 时端点还停在 api.openai.com、
 * 模型还停在 gpt-4o —— 点"测试连接"必然失败，而界面上看不出是没跟着切。
 * 判据是"当前值还是上一家的默认值（或空）"：手填过的一律不动，只补没动过的。
 */
export function resolveProviderDefaults(
  current: { baseUrl: string; model: string },
  from: ProviderPreset | undefined,
  to: ProviderPreset
): { baseUrl?: string; model?: string } {
  const untouched = (value: string, previous: string | undefined): boolean => {
    const v = value.trim();
    return v === '' || (!!previous && v === previous);
  };
  const patch: { baseUrl?: string; model?: string } = {};
  if (untouched(current.baseUrl, from?.defaultBaseUrl) && current.baseUrl.trim() !== to.defaultBaseUrl) {
    patch.baseUrl = to.defaultBaseUrl;
  }
  if (untouched(current.model, from?.defaultModel) && current.model.trim() !== to.defaultModel) {
    patch.model = to.defaultModel;
  }
  return patch;
}

export function useModelProfileForm() {
  const settings = useSettingsStore();
  const chatStore = useChatStore();
  /** M7-d：默认采样参数属高级段，默认收起；点过的开合跨会话记住 */
  const samplingOpen = useSectionMemory('model.sampling');

  const editMode = ref<'create' | 'edit'>('create');

  // 表单字段
  const form = ref({
    id: '',
    name: '',
    provider: 'openai' as 'openai' | 'anthropic' | 'custom' | 'deepseek' | 'local',
    baseUrl: '',
    apiKey: '',
    model: '',
    category: 'chat' as 'chat' | 'image-video' | 'embedding',
    // 模型最大上下文：空 = 未设置 = 用全局默认。输出预算与输入压缩都由它推导，
    // 不再单独设输出上限（见 core/token-budget.ts）
    contextWindow: '' as string | number,
    // P0-2: 推理强度支持三态（auto=按模型名启发式；on/off=用户强制纠偏）
    reasoningSupport: 'auto' as 'auto' | 'on' | 'off',
    // P0-2: Profile 级默认思考强度（空串 = 不设置）
    reasoningEffort: '' as '' | 'low' | 'medium' | 'high',
    // P0-3: Profile 级默认采样参数（空 = 不传 = 供应商默认；绝不用 0 表示未设置）
    topP: '' as string | number,
    presencePenalty: '' as string | number,
    frequencyPenalty: '' as string | number,
  });

  // 表单校验
  const errors = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!form.value.name.trim()) e.name = t('modelPanel.nameRequired');
    if (form.value.provider !== 'local') {
      if (!form.value.baseUrl.trim()) e.baseUrl = t('modelPanel.baseUrlRequired');
      else if (!/^https?:\/\//.test(form.value.baseUrl)) e.baseUrl = t('modelPanel.baseUrlInvalid');
    }
    if (!form.value.model.trim()) e.model = t('modelPanel.modelRequired');
    // 最大上下文允许留空（空 = 用全局默认）；填了就必须是 ≥1024 的数
    const cw = Number(form.value.contextWindow);
    if (
      form.value.contextWindow !== '' &&
      form.value.contextWindow !== undefined &&
      form.value.contextWindow !== null &&
      (!Number.isFinite(cw) || cw < 1024)
    ) {
      e.contextWindow = t('modelPanel.contextWindowInvalid');
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

  // provider 选项（computed：普通 const 会把标签快照在 setup 那一刻，切语言不动）
  const providerOptions = computed<Array<ProviderPreset & { label: string }>>(() => [
    {
      value: 'openai',
      label: t('modelPanel.providerOpenai'),
      defaultBaseUrl: 'https://api.openai.com',
      defaultModel: 'gpt-4o',
    },
    {
      value: 'deepseek',
      label: t('modelPanel.providerDeepseek'),
      defaultBaseUrl: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
    },
    {
      value: 'anthropic',
      label: t('modelPanel.providerAnthropic'),
      defaultBaseUrl: 'https://api.anthropic.com',
      // 别名写法，不带日期戳；供应商改名时只改这一处
      defaultModel: 'claude-sonnet-4-5',
    },
    // 自定义端点与本地模型没法预填模型名：留空让用户填，比塞一个错的强
    { value: 'custom', label: t('modelPanel.providerCustom'), defaultBaseUrl: '', defaultModel: '' },
    { value: 'local', label: t('modelPanel.providerLocal'), defaultBaseUrl: '', defaultModel: '' },
  ]);

  function resetForm() {
    lastProvider.value = 'openai';
    form.value = {
      id: '',
      name: '',
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: '',
      model: 'gpt-4o',
      category: 'chat',
      contextWindow: '' as string | number,
      reasoningSupport: 'auto' as 'auto' | 'on' | 'off',
      reasoningEffort: '' as '' | 'low' | 'medium' | 'high',
      topP: '' as string | number,
      presencePenalty: '' as string | number,
      frequencyPenalty: '' as string | number,
    };
  }

  /** 打开"新建"：以 store 模板为准，缺字段回退空值 */
  function openCreate() {
    resetForm();
    const tpl = settings.createProfileTemplate();
    form.value = {
      ...tpl,
      contextWindow: tpl.contextWindow ?? '',
      category: (tpl.category ?? 'chat') as 'chat' | 'image-video' | 'embedding',
      reasoningSupport: (tpl.reasoningSupport ?? 'auto') as 'auto' | 'on' | 'off',
      reasoningEffort: (tpl.reasoningEffort ?? '') as '' | 'low' | 'medium' | 'high',
      topP: tpl.sampling?.topP ?? '',
      presencePenalty: tpl.sampling?.presencePenalty ?? '',
      frequencyPenalty: tpl.sampling?.frequencyPenalty ?? '',
    };
    lastProvider.value = form.value.provider;
    editMode.value = 'create';
  }

  /** 打开"编辑"：以现有 profile 灌入表单 */
  function openEdit(profile: ApiProfile) {
    form.value = {
      ...profile,
      contextWindow: profile.contextWindow ?? '',
      provider: profile.provider as 'openai' | 'anthropic' | 'custom' | 'deepseek',
      category: (profile.category ?? 'chat') as 'chat' | 'image-video' | 'embedding',
      reasoningSupport: (profile.reasoningSupport ?? 'auto') as 'auto' | 'on' | 'off',
      reasoningEffort: (profile.reasoningEffort ?? '') as '' | 'low' | 'medium' | 'high',
      topP: profile.sampling?.topP ?? '',
      presencePenalty: profile.sampling?.presencePenalty ?? '',
      frequencyPenalty: profile.sampling?.frequencyPenalty ?? '',
    };
    lastProvider.value = form.value.provider;
    editMode.value = 'edit';
  }

  /** 上一次选中的供应商：切走时靠它判断"端点和模型还是不是上一家的默认值" */
  const lastProvider = ref<ProviderValue>('openai');

  function onProviderChange() {
    const from = providerOptions.value.find((o) => o.value === lastProvider.value);
    const to = providerOptions.value.find((o) => o.value === form.value.provider);
    if (to) {
      const patch = resolveProviderDefaults(form.value, from, to);
      if (patch.baseUrl !== undefined) form.value.baseUrl = patch.baseUrl;
      if (patch.model !== undefined) form.value.model = patch.model;
    }
    lastProvider.value = form.value.provider;
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

  /** 保存（新建或更新）；返回 true 表示已落库，调用方据此关弹窗 */
  function saveProfile(): boolean {
    if (hasErrors.value) {
      showToast('error', t('modelPanel.fixFormErrors'));
      return false;
    }
    const payload: ApiProfile = {
      id: form.value.id,
      name: form.value.name.trim(),
      provider: form.value.provider,
      baseUrl: form.value.baseUrl.trim(),
      apiKey: form.value.apiKey.trim(),
      model: form.value.model.trim(),
      category: form.value.category,
      // 空值保存为 undefined（回退全局默认）；0/NaN/'' 视为空
      contextWindow:
        form.value.contextWindow === '' || form.value.contextWindow == null || !Number.isFinite(Number(form.value.contextWindow))
          ? undefined
          : Number(form.value.contextWindow),
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
    return true;
  }

  const showApiKey = ref(false);

  return {
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
    openCreate,
    openEdit,
    onProviderChange,
    saveProfile,
    samplingOpen,
    showApiKey,
  };
}
