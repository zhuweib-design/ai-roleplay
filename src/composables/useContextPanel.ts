/**
 * 上下文面板的派生状态与写操作（R2-3 从 `layout/ContextPanel.vue` 抽出）
 *
 * 设计判据：这里**只有纯派生 + 写 store**，不持有任何组件本地 UI 状态
 * （折叠开关、触摸手势坐标留在各自的组件里）。所以八个 section 组件各自调用一次
 * 也安全 —— 数据全走 store，不存在两份真相。这与 R2-1「六段共用同一份 form」相反：
 * 那张表单是跨字段校验的，必须单份；这里每条都是独立的只读投影。
 */
import { computed } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import {
  resolveReasoningCapability,
  supportsSamplingParam,
  resolveSampling,
  matchesReasoningModelPattern,
} from '@/api/reasoning-capability';
import type { ReasoningEffort } from '@/api/types';
import { REASONING_EFFORTS, type SamplingOverrides } from '@/types';
import { PRESET_IDS, type PresetId } from '@core/creation-preset';
import { collectLorebooksForCharacter } from '@/stores/chat-context';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { t } from '@/i18n';
import type { ApiProfile } from '@/types';
import {
  STATUS_ICON_NAMES,
  normalizeStatusSchema,
  type StatusFieldDef,
} from '@core/status-schema';

export function useContextPanel() {
  const characterStore = useCharacterStore();
  const lorebookStore = useLorebookStore();
  const chatStore = useChatStore();
  const settingsStore = useSettingsStore();

  const char = computed(() => characterStore.currentCharacter!);

  /**
   * 当前角色实际生效的 API Profile：per-role 绑定优先，否则跟随全局激活 Profile。
   * 与发送链路(App.vue 在切换角色时 setApiProfile)保持一致，做到显示=发送。
   */
  const effectiveProfile = computed<ApiProfile | null>(() => {
    const pid = char.value?.profileId;
    if (pid) {
      return settingsStore.apiProfiles.find((p) => p.id === pid) ?? null;
    }
    return settingsStore.activeProfile;
  });

  /** 实际使用的模型名(与发送一致)；未配置时显示提示文案 */
  const modelLabel = computed(() =>
    effectiveProfile.value ? effectiveProfile.value.model : t('chat.modelNotConfigured')
  );

  /**
   * 生效世界书：与发送链路**共用同一个判定源** `collectLorebooksForCharacter`。
   * 此前面板自己按 `boundWorldBookIds` 过滤，而 `stores/chat-context.ts:63` 会把
   * `scope === 'global'` 的书**无条件**纳入 ⇒ 面板少报了实际一直在注入的书，
   * 用户看到"没有世界书"其实正文里全是（设计文档 §1.4 E03）。
   */
  const effectiveLorebooks = computed(() =>
    char.value ? collectLorebooksForCharacter(char.value.id) : []
  );
  const boundLorebooks = computed(() =>
    effectiveLorebooks.value.filter((lb) => lb.scope !== 'global')
  );
  const globalLorebooks = computed(() =>
    effectiveLorebooks.value.filter((lb) => lb.scope === 'global')
  );

  // 当前角色关联世界书中的用户资料；全局书也在候选里（它就是会被注入的那批）
  const worldUserProfile = computed(() => {
    const candidates = [...boundLorebooks.value, ...globalLorebooks.value];
    return candidates.find((lb) => lb.userProfile)?.userProfile ?? null;
  });
  const worldUserProfileName = computed(
    () => worldUserProfile.value?.name?.trim() || t('ctx.worldUserProfileUnset')
  );

  const { pushWithReturn } = useReadinessJump();

  /** 面板里列出的每本书都可点进世界书页并选中它（E03：可见且可一跳） */
  function openLorebook(id: string): void {
    lorebookStore.selectLorebook(id);
    // M17-b：把"要点开哪一本"写进 URL。原来只跳 /worldbook，落地页选中谁取决于
    // store 里已经是什么——面板高亮的那本和页面打开的那本可能是两本，且刷新即丢。
    pushWithReturn({ name: 'worldbook', query: { book: id } });
  }

  /**
   * Token 预算总量：取全局设置的上下文窗口上限（**响应式**，配置改动即时反映）。
   *
   * 修复：此前硬编码 8192，用户把上下文配到 256K 后用量条仍按 8192 计算、
   * 恒显 100%，可视化与实际配置脱节（"改了但看不出来"）。现直接跟随
   * settings.maxContextTokens，与设置页入口保持同一数据源。
   *
   * 边界：上限为 0 / 负数 / 非有限数（脏数据）时回落到 1，
   * 避免除零、避免 aria-valuemax 出现 0 或非法值。
   */
  const TOTAL_BUDGET = computed(() => {
    const max = settingsStore.maxContextTokens;
    return Number.isFinite(max) && max > 0 ? max : 1;
  });

  // E24：用量与上限改用真实数据。
  // 原实现读 char.tokenBudget 的三段拆分（character/worldInfo/chatHistory），但该字段只有初始化写点、
  // 从不重算 ⇒ 进度条恒为 0、"剩余"恒等于初始值，界面在说谎（决策 D-H）。
  const usedTokens = computed(() => chatStore.totalTokenUsage);

  const usedPercent = computed(() =>
    Math.min(100, Math.round((usedTokens.value / TOTAL_BUDGET.value) * 100))
  );

  const remainingTokens = computed(() => Math.max(0, TOTAL_BUDGET.value - usedTokens.value));

  // ── 生成参数：本地编辑 → 写回 store ──

  function onTemperature(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    characterStore.updateCharacter(char.value.id, { temperature: v });
  }

  function onAuthorNote(e: Event) {
    const v = (e.target as HTMLTextAreaElement).value;
    characterStore.updateCharacter(char.value.id, { authorNote: v });
  }

  function onAuthorDepth(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    characterStore.updateCharacter(char.value.id, { authorDepth: v });
  }

  // ── P0-2 思考强度 / P0-3 采样参数（角色级覆盖） ──

  /** 当前生效 Profile 的思考强度能力；'none' 时控件隐藏（不为统一而暴露无效开关） */
  const reasoningCapability = computed(() =>
    effectiveProfile.value ? resolveReasoningCapability(effectiveProfile.value) : 'none'
  );

  /**
   * 决策：REASONING_MODEL_RE **不作为隐藏依据，只作提示依据**。
   * 正则必然滞后于新模型，用它隐藏会让功能对大多数用户不可见。
   */
  const reasoningHeuristicMiss = computed(
    () => !matchesReasoningModelPattern(effectiveProfile.value?.model)
  );

  /** 角色级采样覆盖（可能为 null） */
  const charSampling = computed<SamplingOverrides | null>(() => char.value.sampling ?? null);

  /** 三档合并后的实际生效值（角色级 ?? Profile 级 ?? 全局默认） */
  const resolvedSampling = computed(() =>
    resolveSampling(
      charSampling.value,
      effectiveProfile.value?.sampling ?? null,
      settingsStore.samplingDefaults ?? null
    )
  );

  /** 三档思考强度选项（跟随上游配置时用 llm.reasoningFollow 文案展示） */
  const reasoningOptions = computed(() =>
    REASONING_EFFORTS.map((value) => ({
      value,
      label:
        value === 'low'
          ? t('llm.reasoningLow')
          : value === 'medium'
            ? t('llm.reasoningMedium')
            : t('llm.reasoningHigh'),
    }))
  );

  /** 实际展示/下发的思考强度：角色级 ?? Profile 级 */
  const effectiveReasoningEffort = computed<ReasoningEffort | null>(
    () => char.value.reasoningEffort ?? effectiveProfile.value?.reasoningEffort ?? null
  );

  function onReasoningEffort(value: string | null): void {
    if (value !== 'low' && value !== 'medium' && value !== 'high') return;
    characterStore.updateCharacter(char.value.id, { reasoningEffort: value });
  }

  // ── EXP-01：角色级创作模式（Preset）绑定 ──
  // '' = 未绑定 = 跟随全局 settings.creationPreset；选择具体档位则该角色强制使用。
  const presetIds = PRESET_IDS;

  const presetBindingValue = computed<PresetId | ''>({
    get: () => char.value.boundPresetId ?? '',
    set: (raw) => {
      characterStore.updateCharacter(char.value.id, {
        boundPresetId: raw === '' ? null : (raw as PresetId),
      });
    },
  });

  /**
   * 角色级采样参数写入
   * 语义：`undefined` / `null` = 未设置 = 跟随 Profile → 全局默认（绝不用 0 表示未设置）
   */
  function writeSampling(patch: Partial<SamplingOverrides>): void {
    const next: SamplingOverrides = { ...(charSampling.value ?? {}) };
    for (const [k, v] of Object.entries(patch) as Array<
      [keyof SamplingOverrides, number | null | undefined]
    >) {
      if (typeof v === 'number' && Number.isFinite(v)) next[k] = v;
      else delete next[k];
    }
    characterStore.updateCharacter(char.value.id, { sampling: next });
  }

  /** 恢复默认（把角色级覆盖置回未设置） */
  function resetSampling(key: keyof SamplingOverrides): void {
    writeSampling({ [key]: null } as Partial<SamplingOverrides>);
  }

  /** 角色级是否显式设置了该参数（决定是否显示"恢复默认"按钮） */
  function isCharSet(key: keyof SamplingOverrides): boolean {
    return typeof charSampling.value?.[key] === 'number';
  }

  /** 展示用数值：未设置时用合并后的生效值，都没有时用中性默认值 */
  function displayValue(key: keyof SamplingOverrides, fallback: number): number {
    const v = resolvedSampling.value[key];
    return typeof v === 'number' ? v : fallback;
  }

  function onTopP(e: Event): void {
    writeSampling({ topP: Number((e.target as HTMLInputElement).value) });
  }

  function onFrequencyPenalty(e: Event): void {
    writeSampling({ frequencyPenalty: Number((e.target as HTMLInputElement).value) });
  }

  /** 采样参数是否被当前 provider 支持（不支持则隐藏控件） */
  const supportsTopP = computed(() =>
    effectiveProfile.value ? supportsSamplingParam(effectiveProfile.value, 'topP') : false
  );
  const supportsFrequencyPenalty = computed(() =>
    effectiveProfile.value
      ? supportsSamplingParam(effectiveProfile.value, 'frequencyPenalty')
      : false
  );

  // ── P1 角色状态栏：状态指令三态开关 + schema 编辑器 ──

  /** 三态：继承全局 / 强制开启 / 强制关闭（null = 继承） */
  const statusInstructionOptions = computed(() => [
    { value: 'inherit', label: t('status.instructionInherit') },
    { value: 'on', label: t('status.instructionOn') },
    { value: 'off', label: t('status.instructionOff') },
  ]);

  /** 当前角色的状态指令（未设置显示为"继承全局"） */
  const statusInstruction = computed<string>(() => {
    const v = char.value.statusInstruction;
    return v === 'on' || v === 'off' ? v : 'inherit';
  });

  function onStatusInstruction(value: string | null): void {
    const next = value === 'on' || value === 'off' ? value : null;
    characterStore.updateCharacter(char.value.id, { statusInstruction: next });
  }

  /** schema 编辑器的字段快照（来自角色卡；无 schema 时为空数组） */
  const statusFields = computed<StatusFieldDef[]>(() => char.value.statusSchema?.fields ?? []);

  /** 图标下拉选项（全部来自 icons.ts 白名单，本轮零新增图标） */
  const statusIconOptions: string[] = [...STATUS_ICON_NAMES];

  /**
   * 写回 schema（统一走 normalizeStatusSchema 校验，脏数据不落盘）
   * 全部字段被删空时写 null = 回到"纯嗅探模式"
   */
  function writeStatusSchema(fields: StatusFieldDef[]): void {
    const prev = char.value.statusSchema;
    const next =
      normalizeStatusSchema({
        version: 1,
        fields,
        unknownKeyPolicy: prev?.unknownKeyPolicy,
        maxFields: prev?.maxFields,
      }) ?? null;
    characterStore.updateCharacter(char.value.id, { statusSchema: next });
  }

  function addStatusField(): void {
    const fields = statusFields.value.map((f) => ({ ...f }));
    fields.push({ key: `field${fields.length + 1}`, type: 'string' });
    writeStatusSchema(fields);
  }

  function removeStatusField(index: number): void {
    const fields = statusFields.value.map((f) => ({ ...f }));
    if (index < 0 || index >= fields.length) return;
    fields.splice(index, 1);
    writeStatusSchema(fields);
  }

  function patchStatusField(index: number, patch: Partial<StatusFieldDef>): void {
    const fields = statusFields.value.map((f) => ({ ...f }));
    const target = fields[index];
    if (!target) return;
    const next: StatusFieldDef = { ...target, ...patch };
    // undefined = "清除该设置"，直接删键，保持"未设置"语义（绝不用空串表示未设置）
    for (const k of Object.keys(patch) as Array<keyof StatusFieldDef>) {
      if (patch[k] === undefined) delete next[k];
    }
    fields[index] = next;
    writeStatusSchema(fields);
  }

  function onStatusFieldKey(index: number, e: Event): void {
    patchStatusField(index, { key: (e.target as HTMLInputElement).value });
  }

  function onStatusFieldLabel(index: number, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    // 空串 = 未设置（走内置 i18n 或原始 key），不落空字符串污染 schema
    patchStatusField(index, v === '' ? { label: undefined } : { label: v });
  }

  function onStatusFieldType(index: number, e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    patchStatusField(index, {
      type: v === 'number' || v === 'enum' ? v : 'string',
    });
  }

  function onStatusFieldIcon(index: number, e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    patchStatusField(index, { icon: v === '' ? undefined : (v as StatusFieldDef['icon']) });
  }

  /** 逗号分隔 → 字符串数组（空串表示清空该字段） */
  function splitList(raw: string): string[] | undefined {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    return parts.length > 0 ? parts : undefined;
  }

  function onStatusFieldAliases(index: number, e: Event): void {
    patchStatusField(index, { aliases: splitList((e.target as HTMLInputElement).value) });
  }

  function onStatusFieldOptions(index: number, e: Event): void {
    patchStatusField(index, { options: splitList((e.target as HTMLInputElement).value) });
  }

  return {
    // store 引用（个别 section 需要直接读）
    chatStore,
    // 角色与模型
    char,
    effectiveProfile,
    modelLabel,
    // 世界书
    effectiveLorebooks,
    worldUserProfileName,
    openLorebook,
    // Token 预算
    TOTAL_BUDGET,
    usedTokens,
    usedPercent,
    remainingTokens,
    // 作者笔记
    onAuthorNote,
    onAuthorDepth,
    // 生成参数
    onTemperature,
    reasoningCapability,
    reasoningHeuristicMiss,
    reasoningOptions,
    effectiveReasoningEffort,
    onReasoningEffort,
    presetIds,
    presetBindingValue,
    // 采样
    supportsTopP,
    supportsFrequencyPenalty,
    displayValue,
    isCharSet,
    resetSampling,
    onTopP,
    onFrequencyPenalty,
    // 状态栏
    statusInstructionOptions,
    statusInstruction,
    onStatusInstruction,
    statusFields,
    statusIconOptions,
    addStatusField,
    removeStatusField,
    onStatusFieldKey,
    onStatusFieldLabel,
    onStatusFieldType,
    onStatusFieldIcon,
    onStatusFieldAliases,
    onStatusFieldOptions,
  };
}
