<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import SegmentedControl from '@/components/common/SegmentedControl.vue';
import RuntimeStatePanel from '@/components/chat/RuntimeStatePanel.vue';
import {
  resolveReasoningCapability,
  supportsSamplingParam,
  resolveSampling,
  matchesReasoningModelPattern,
} from '@/api/reasoning-capability';
import type { ReasoningEffort } from '@/api/types';
import { REASONING_EFFORTS, type SamplingOverrides } from '@/types';
import { t } from '@/i18n';
import type { ApiProfile } from '@/types';
import {
  STATUS_ICON_NAMES,
  normalizeStatusSchema,
  type StatusFieldDef,
} from '@core/status-schema';

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

// 角色页绑定的世界书（需求7：唯一数据源 boundWorldBookIds）
const boundLorebooks = computed(() => {
  const bound = char.value.boundWorldBookIds ?? [];
  return lorebookStore.lorebooks.filter((lb) => bound.includes(lb.id));
});

// 当前角色关联世界书中的用户资料，全球世界书作为兜底。
const worldUserProfile = computed(() => {
  const candidates = [
    ...boundLorebooks.value,
    ...lorebookStore.lorebooks.filter((lb) => lb.scope === 'global'),
  ];
  return candidates.find((lb) => lb.userProfile)?.userProfile ?? null;
});
const worldUserProfileName = computed(() => worldUserProfile.value?.name?.trim() || t('ctx.worldUserProfileUnset'));

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

const usedTokens = computed(
  () =>
    char.value.tokenBudget.character +
    char.value.tokenBudget.worldInfo +
    char.value.tokenBudget.chatHistory
);

const usedPercent = computed(() =>
  Math.min(100, Math.round((usedTokens.value / TOTAL_BUDGET.value) * 100))
);

// 各分项占比（用于堆叠条）
const segments = computed(() => {
  const total = Math.max(1, usedTokens.value);
  return [
    {
      key: 'character',
      label: t('ctx.character'),
      value: char.value.tokenBudget.character,
      percent: (char.value.tokenBudget.character / total) * 100,
      color: 'var(--tk-cyan-500)',
    },
    {
      key: 'world',
      label: t('ctx.world'),
      value: char.value.tokenBudget.worldInfo,
      percent: (char.value.tokenBudget.worldInfo / total) * 100,
      color: 'var(--tk-red-500)',
    },
    {
      key: 'history',
      label: t('ctx.history'),
      value: char.value.tokenBudget.chatHistory,
      percent: (char.value.tokenBudget.chatHistory / total) * 100,
      color: 'var(--tk-yellow-500)',
    },
  ];
});

// 生成参数本地编辑 → 写回 store
function onTemperature(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  characterStore.updateCharacter(char.value.id, { temperature: v });
}

/**
 * T-16：角色级 maxTokens —— 可选字段
 *
 * 语义与 P0-3 采样参数完全一致：`undefined` / `null` = 未设置 = 回落
 * Profile 级 → 不传（供应商默认）。绝不用 0 表示未设置。
 */

/** 角色级是否显式设置了 maxTokens */
const isMaxTokensSet = computed(
  () =>
    typeof char.value.maxTokens === 'number' &&
    Number.isFinite(char.value.maxTokens) &&
    char.value.maxTokens > 0
);

/**
 * 实际生效值（角色级 ?? Profile 级 ?? 不传）
 * 用于滑块位置与数值展示；三者都没有时返回 null（UI 显示"未设置"）
 */
const resolvedMaxTokens = computed<number | null>(() => {
  const charV = char.value.maxTokens;
  if (typeof charV === 'number' && Number.isFinite(charV) && charV > 0) return charV;
  const profileV = effectiveProfile.value?.maxTokens;
  if (typeof profileV === 'number' && Number.isFinite(profileV) && profileV > 0) return profileV;
  return null;
});

/** 滑块位置（都未设置时用 4096 中立值，仅作把手位置，不代表已设置） */
const sliderMaxTokens = computed<number>(() => resolvedMaxTokens.value ?? 4096);

function onMaxTokens(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  characterStore.updateCharacter(char.value.id, { maxTokens: v });
}

/** 清空角色级覆盖（写 undefined = 回落 Profile 级） */
function resetMaxTokens(): void {
  characterStore.updateCharacter(char.value.id, { maxTokens: undefined });
}

function onAuthorNote(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value;
  characterStore.updateCharacter(char.value.id, { authorNote: v });
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

function onAuthorDepth(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  characterStore.updateCharacter(char.value.id, { authorDepth: v });
}

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

/** 编辑器折叠状态（默认折叠，避免长 schema 挤占面板） */
const schemaOpen = ref(false);

/** 图标下拉选项（全部来自 icons.ts 白名单，本轮零新增图标） */
const statusIconOptions: string[] = [...STATUS_ICON_NAMES];

/**
 * 写回 schema（统一走 normalizeStatusSchema 校验，脏数据不落盘）
 * 全部字段被删空时写 null = 回到"纯嗅探模式"
 */
function writeStatusSchema(fields: StatusFieldDef[]): void {
  const prev = char.value.statusSchema;
  const next = normalizeStatusSchema({
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

// I-8：触屏横向滑动关闭抽屉（右抽屉：向左滑 >60px 关闭）
let ctxTouchStartX = 0;
let ctxTouchStartY = 0;
let ctxSwipeHoriz = false;
function onCtxTouchStart(e: TouchEvent) {
  if (!characterStore.contextDrawerOpen) return;
  ctxTouchStartX = e.touches[0]!.clientX;
  ctxTouchStartY = e.touches[0]!.clientY;
  ctxSwipeHoriz = false;
}
function onCtxTouchMove(e: TouchEvent) {
  if (!characterStore.contextDrawerOpen) return;
  const dx = e.touches[0]!.clientX - ctxTouchStartX;
  const dy = e.touches[0]!.clientY - ctxTouchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) ctxSwipeHoriz = true;
}
function onCtxTouchEnd(e: TouchEvent) {
  if (!characterStore.contextDrawerOpen) return;
  const dx = e.changedTouches[0]!.clientX - ctxTouchStartX;
  if (ctxSwipeHoriz && dx < -60) characterStore.closeAllDrawers();
  ctxSwipeHoriz = false;
}
</script>

<template>
  <aside
    id="context-drawer"
    tabindex="-1"
    class="context-panel"
    :class="{ active: characterStore.contextDrawerOpen, collapsed: !characterStore.panelExpanded }"
    :aria-label="t('ctx.aria')"
    @touchstart="onCtxTouchStart"
    @touchmove="onCtxTouchMove"
    @touchend="onCtxTouchEnd"
  >
    <!-- 顶栏 -->
    <header class="ctx-header">
      <span class="ctx-title">{{ t('ctx.title') }}</span>
      <button
        type="button"
        class="mobile-menu-btn ctx-close client-compact-only"
        :aria-label="t('ctx.closePanel')"
        @click="characterStore.togglePanel()"
      >
        <Icon name="close" :size="18" />
      </button>
    </header>

    <!-- 可滚动内容 -->
    <div class="context-panel-scroll tk-scroll">
      <!-- 角色信息卡 -->
      <section class="ctx-section" aria-labelledby="ctx-char-title">
        <header class="ctx-section-header">
          <Avatar :character="char" :size="40" />
          <div class="ctx-char-info">
            <div id="ctx-char-title" class="ctx-char-name">{{ char.name }}</div>
            <div class="ctx-char-model" :class="{ 'not-configured': !effectiveProfile }">{{ modelLabel }}</div>
          </div>
        </header>
        <p class="ctx-char-desc">{{ char.description }}</p>
        <div v-if="char.tags.length" class="ctx-tags">
          <span v-for="tag in char.tags" :key="tag" class="ctx-tag">{{ tag }}</span>
        </div>
      </section>

      <!-- 当前世界用户资料：在世界书中编辑 -->
      <section class="ctx-section" aria-labelledby="ctx-persona-title">
        <header class="ctx-section-header">
          <span id="ctx-persona-title" class="ctx-section-title">{{ t('ctx.worldUserProfileTitle') }}</span>
          <span class="ctx-section-value">{{ worldUserProfileName }}</span>
        </header>
        <p class="ctx-persona-hint">
          {{ t('ctx.personaHint') }}
        </p>
      </section>

      <!-- 当前会话摘要状态：让摘要是否生效、覆盖范围和更新状态可见。 -->
      <section class="ctx-section" aria-labelledby="ctx-summary-title">
        <header class="ctx-section-header">
          <span id="ctx-summary-title" class="ctx-section-title">{{ t('ctx.summaryTitle') }}</span>
          <span class="ctx-section-value">
            {{
              chatStore.summaryStatus.phase === 'updating'
                ? t('ctx.summaryUpdatingShort')
                : chatStore.summaryStatus.phase === 'ready'
                  ? t('ctx.summaryReadyShort')
                  : t('ctx.summaryNoneShort')
            }}
          </span>
        </header>
        <p class="ctx-param-hint">
          {{
            chatStore.summaryStatus.phase === 'updating'
              ? t('ctx.summaryUpdating', { count: chatStore.summaryStatus.coveredMessageCount })
              : chatStore.summaryStatus.phase === 'ready'
                ? t('ctx.summaryCovered', { count: chatStore.summaryStatus.coveredMessageCount })
                : t('ctx.summaryNotReady')
          }}
        </p>
      </section>

      <!-- Token 预算 -->
      <section class="ctx-section" aria-labelledby="ctx-token-title">
        <header class="ctx-section-header">
          <span id="ctx-token-title" class="ctx-section-title">{{ t('ctx.tokenTitle') }}</span>
          <span class="ctx-section-value">{{ usedTokens }} / {{ TOTAL_BUDGET }}</span>
        </header>
        <div
class="token-bar" role="progressbar"
          :aria-valuenow="usedTokens" :aria-valuemin="0" :aria-valuemax="TOTAL_BUDGET"
          :aria-label="t('ctx.tokenUsed', { percent: usedPercent })"
>
          <div class="token-bar-fill" :style="{ width: `${usedPercent}%` }">
            <div
              v-for="seg in segments"
              :key="seg.key"
              class="token-segment"
              :style="{
                width: `${seg.percent}%`,
                backgroundColor: seg.color,
              }"
              :title="`${seg.label}: ${seg.value}`"
            />
          </div>
        </div>
        <ul class="token-legend" :aria-label="t('ctx.tokenLegend')">
          <li v-for="seg in segments" :key="seg.key">
            <span class="legend-dot" :style="{ backgroundColor: seg.color }" aria-hidden="true" />
            <span class="legend-label">{{ seg.label }}</span>
            <span class="legend-value">{{ seg.value }}</span>
          </li>
          <li>
            <span class="legend-dot legend-remaining" aria-hidden="true" />
            <span class="legend-label">{{ t('ctx.remaining') }}</span>
            <span class="legend-value">{{ char.tokenBudget.remaining }}</span>
          </li>
          <li class="legend-usage">
            <span class="legend-dot legend-usage-dot" aria-hidden="true" />
            <span class="legend-label">{{ t('ctx.totalUsage') }}</span>
            <span class="legend-value">{{ chatStore.totalTokenUsage }} Tokens</span>
          </li>
        </ul>
      </section>

      <!-- 世界书 -->
      <section class="ctx-section" aria-labelledby="ctx-world-title">
        <header class="ctx-section-header">
          <span id="ctx-world-title" class="ctx-section-title">{{ t('ctx.worldTitle') }}</span>
          <span class="ctx-section-value">{{ t('ctx.worldCount', { count: boundLorebooks.length }) }}</span>
        </header>
        <ul v-if="boundLorebooks.length" class="world-list">
          <li v-for="lb in boundLorebooks" :key="lb.id" class="world-lorebook">
            <span class="world-entry-name">{{ lb.name }}</span>
            <span class="world-entry-count">
              {{ t('ctx.worldEnabled', { count: lb.entries.filter((e) => e.enabled).length }) }}
            </span>
          </li>
        </ul>
        <p v-else class="ctx-empty">{{ t('ctx.worldEmpty') }}</p>
      </section>

      <!-- 作者笔记 -->
      <section class="ctx-section" aria-labelledby="ctx-author-title">
        <header class="ctx-section-header">
          <span id="ctx-author-title" class="ctx-section-title">{{ t('ctx.authorTitle') }}</span>
          <span class="ctx-section-value">{{ t('ctx.authorDepth', { depth: char.authorDepth }) }}</span>
        </header>
        <textarea
          class="tk-input ctx-textarea"
          :value="char.authorNote"
          :placeholder="t('ctx.authorPlaceholder')"
          :aria-label="t('ctx.authorAria')"
          rows="3"
          @input="onAuthorNote"
        />
        <label class="ctx-range-label">
          <span>{{ t('ctx.insertDepth') }}</span>
          <input
            type="range"
            class="tk-range"
            min="0"
            max="10"
            step="1"
            :value="char.authorDepth"
            :aria-label="t('ctx.authorDepthAria')"
            @input="onAuthorDepth"
          />
          <span class="ctx-range-value" aria-hidden="true">{{ char.authorDepth }}</span>
        </label>
      </section>

      <!-- Virtual Character OS：Runtime 最小状态查看与回放自检 -->
      <section class="ctx-section" aria-labelledby="ctx-runtime-title">
        <header class="ctx-section-header">
          <span id="ctx-runtime-title" class="ctx-section-title">{{ t('runtime.title') }}</span>
        </header>
        <RuntimeStatePanel :character="char" />
      </section>

      <!-- 生成参数 -->
      <section class="ctx-section" aria-labelledby="ctx-gen-title">
        <header class="ctx-section-header">
          <span id="ctx-gen-title" class="ctx-section-title">{{ t('ctx.genTitle') }}</span>
        </header>
        <label class="ctx-range-label">
          <span>{{ t('ctx.temperature') }}</span>
          <input
            type="range"
            class="tk-range"
            min="0"
            max="2"
            step="0.05"
            :value="char.temperature"
            :aria-label="t('ctx.temperatureAria')"
            @input="onTemperature"
          />
          <span class="ctx-range-value" aria-hidden="true">{{ char.temperature.toFixed(2) }}</span>
        </label>
        <label class="ctx-range-label">
          <span>{{ t('ctx.maxTokens') }}</span>
          <input
            type="range"
            class="tk-range"
            min="256"
            max="8192"
            step="256"
            :value="sliderMaxTokens"
            :aria-label="t('ctx.maxTokensAria')"
            @input="onMaxTokens"
          />
          <span class="ctx-range-value" aria-hidden="true">
            {{ isMaxTokensSet ? resolvedMaxTokens : t('ctx.maxTokensUnset') }}
          </span>
          <button
            v-if="isMaxTokensSet"
            type="button"
            class="ctx-reset-btn ctx-reset-btn-maxtok"
            :aria-label="t('ctx.maxTokensReset')"
            @click="resetMaxTokens"
          >
            <Icon name="close" :size="12" />
          </button>
        </label>
        <p v-if="!isMaxTokensSet" class="ctx-param-hint">{{ t('ctx.maxTokensUnsetHint') }}</p>

        <!-- P0-2 思考强度：capability = none 时整个隐藏（不为统一而暴露无效开关） -->
        <div v-if="reasoningCapability !== 'none'" class="ctx-param-row">
          <span class="ctx-param-label">{{ t('ctx.reasoningEffort') }}</span>
          <SegmentedControl
            :model-value="effectiveReasoningEffort"
            :options="reasoningOptions"
            :aria-label="t('ctx.reasoningEffortAria')"
            @update:model-value="onReasoningEffort"
          />
          <!-- 正则只作提示：未命中仍允许设置 -->
          <p v-if="reasoningHeuristicMiss" class="ctx-param-hint">
            {{ t('llm.reasoningMaybeUnsupported') }}
          </p>
        </div>
      </section>

      <!-- P0-3 高级采样：角色级只放 topP + frequencyPenalty（RP 场景最需要防复读） -->
      <section
        v-if="supportsTopP || supportsFrequencyPenalty"
        class="ctx-section"
        aria-labelledby="ctx-sampling-title"
      >
        <header class="ctx-section-header">
          <span id="ctx-sampling-title" class="ctx-section-title">{{ t('ctx.samplingTitle') }}</span>
        </header>

        <label v-if="supportsTopP" class="ctx-range-label">
          <span>{{ t('ctx.topP') }}</span>
          <input
            type="range"
            class="tk-range"
            min="0"
            max="1"
            step="0.05"
            :value="displayValue('topP', 1)"
            :aria-label="t('ctx.topPAria')"
            @input="onTopP"
          />
          <span class="ctx-range-value" aria-hidden="true">
            {{ isCharSet('topP') ? displayValue('topP', 1).toFixed(2) : t('llm.samplingUnset') }}
          </span>
          <button
            v-if="isCharSet('topP')"
            type="button"
            class="ctx-reset-btn"
            :aria-label="t('llm.samplingReset')"
            @click="resetSampling('topP')"
          >
            <Icon name="close" :size="12" />
          </button>
        </label>

        <label v-if="supportsFrequencyPenalty" class="ctx-range-label">
          <span>{{ t('ctx.frequencyPenalty') }}</span>
          <input
            type="range"
            class="tk-range"
            min="-2"
            max="2"
            step="0.1"
            :value="displayValue('frequencyPenalty', 0)"
            :aria-label="t('ctx.frequencyPenaltyAria')"
            @input="onFrequencyPenalty"
          />
          <span class="ctx-range-value" aria-hidden="true">
            {{
              isCharSet('frequencyPenalty')
                ? displayValue('frequencyPenalty', 0).toFixed(1)
                : t('llm.samplingUnset')
            }}
          </span>
          <button
            v-if="isCharSet('frequencyPenalty')"
            type="button"
            class="ctx-reset-btn"
            :aria-label="t('llm.samplingReset')"
            @click="resetSampling('frequencyPenalty')"
          >
            <Icon name="close" :size="12" />
          </button>
        </label>
      </section>

      <!-- P1 角色状态栏：状态指令三态开关 + 折叠式 schema 编辑器 -->
      <section class="ctx-section" aria-labelledby="ctx-status-title">
        <header class="ctx-section-header">
          <span id="ctx-status-title" class="ctx-section-title">{{ t('status.instruction') }}</span>
          <span class="ctx-section-value">{{ statusFields.length }}</span>
        </header>
        <SegmentedControl
          :model-value="statusInstruction"
          :options="statusInstructionOptions"
          :aria-label="t('status.instruction')"
          @update:model-value="onStatusInstruction"
        />
        <p class="ctx-param-hint">{{ t('status.instructionHint') }}</p>

        <button
          type="button"
          class="ctx-schema-toggle"
          :aria-expanded="schemaOpen"
          aria-controls="ctx-status-schema"
          @click="schemaOpen = !schemaOpen"
        >
          <Icon :name="schemaOpen ? 'chevron-up' : 'chevron-down'" :size="14" />
          <span>{{ t('status.schemaTitle') }}</span>
        </button>

        <div v-if="schemaOpen" id="ctx-status-schema" class="ctx-schema">
          <div v-for="(f, i) in statusFields" :key="`sf-${i}`" class="status-field">
            <div class="status-field-row">
              <label class="status-field-cell">
                <span class="status-field-label">{{ t('status.schemaKey') }}</span>
                <input
                  class="tk-input status-field-input"
                  type="text"
                  :value="f.key"
                  :placeholder="t('status.schemaKeyHint')"
                  :aria-label="t('status.schemaKey')"
                  @input="onStatusFieldKey(i, $event)"
                />
              </label>
              <label class="status-field-cell">
                <span class="status-field-label">{{ t('status.schemaLabel') }}</span>
                <input
                  class="tk-input status-field-input"
                  type="text"
                  :value="f.label ?? ''"
                  :aria-label="t('status.schemaLabel')"
                  @input="onStatusFieldLabel(i, $event)"
                />
              </label>
            </div>
            <div class="status-field-row">
              <label class="status-field-cell">
                <span class="status-field-label">{{ t('status.schemaType') }}</span>
                <select
                  class="tk-input status-field-input"
                  :value="f.type ?? 'string'"
                  :aria-label="t('status.schemaType')"
                  @change="onStatusFieldType(i, $event)"
                >
                  <option value="string">{{ t('status.schemaTypeString') }}</option>
                  <option value="number">{{ t('status.schemaTypeNumber') }}</option>
                  <option value="enum">{{ t('status.schemaTypeEnum') }}</option>
                </select>
              </label>
              <label class="status-field-cell">
                <span class="status-field-label">{{ t('status.schemaIcon') }}</span>
                <select
                  class="tk-input status-field-input"
                  :value="f.icon ?? ''"
                  :aria-label="t('status.schemaIcon')"
                  @change="onStatusFieldIcon(i, $event)"
                >
                  <option value="">{{ t('status.schemaIconNone') }}</option>
                  <option v-for="ic in statusIconOptions" :key="ic" :value="ic">{{ ic }}</option>
                </select>
              </label>
            </div>
            <label class="status-field-cell">
              <span class="status-field-label">{{ t('status.schemaAliases') }}</span>
              <input
                class="tk-input status-field-input"
                type="text"
                :value="(f.aliases ?? []).join(', ')"
                :placeholder="t('status.schemaAliasesHint')"
                :aria-label="t('status.schemaAliases')"
                @input="onStatusFieldAliases(i, $event)"
              />
            </label>
            <label v-if="f.type === 'enum'" class="status-field-cell">
              <span class="status-field-label">{{ t('status.schemaOptions') }}</span>
              <input
                class="tk-input status-field-input"
                type="text"
                :value="(f.options ?? []).join(', ')"
                :aria-label="t('status.schemaOptions')"
                @input="onStatusFieldOptions(i, $event)"
              />
            </label>
            <button
              type="button"
              class="ctx-reset-btn status-field-remove"
              :aria-label="t('status.schemaRemove')"
              @click="removeStatusField(i)"
            >
              <Icon name="trash-2" :size="12" />
            </button>
          </div>
          <button type="button" class="ctx-schema-add" @click="addStatusField">
            <Icon name="plus" :size="14" />
            <span>{{ t('status.schemaAdd') }}</span>
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.ctx-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ctx-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  letter-spacing: 0.02em;
}

.ctx-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctx-section {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border);
}

.ctx-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.ctx-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  flex: 1;
}

.ctx-section-value {
  font-size: 11px;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
}

.ctx-char-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.ctx-char-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.2;
}

.ctx-char-model {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.ctx-char-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.ctx-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ctx-tag {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  color: var(--secondary-text);
}

.token-bar {
  width: 100%;
  height: 6px;
  background: var(--border);
  border-radius: var(--radius-pill);
  overflow: hidden;
  margin-bottom: 10px;
}

.token-bar-fill {
  height: 100%;
  display: flex;
  width: 100%;
}

.token-segment {
  height: 100%;
  transition: width 0.2s ease;
}

.token-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}

.token-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-remaining {
  background: var(--border);
}

.legend-usage {
  grid-column: 1 / -1;
  border-top: 1px dashed var(--border);
  padding-top: 4px;
  margin-top: 2px;
}

.legend-usage-dot {
  background: var(--primary);
}

.legend-label {
  flex: 1;
}

.legend-value {
  font-family: var(--font-mono);
  color: var(--foreground);
}

.world-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.world-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.world-entry-name {
  flex: 1;
  font-size: 13px;
  color: var(--foreground);
}

.world-lorebook {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 6px 4px;
  border-radius: var(--radius-sm);
}

.world-lorebook .world-entry-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-entry-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.ctx-empty {
  margin: 0;
  padding: 8px 4px;
  font-size: 12px;
  color: var(--muted-foreground);
  text-align: center;
}

.ctx-textarea {
  width: 100%;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  line-height: 1.55;
  resize: vertical;
  outline: none;
}

/* P0-3：第 4 列留给「恢复默认」按钮（无按钮时该列宽度为 0，不改变既有布局） */
.ctx-range-label {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.ctx-range-value {
  font-family: var(--font-mono);
  color: var(--foreground);
  min-width: 36px;
  text-align: right;
}

.ctx-persona-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.ctx-persona-hint code {
  font-family: var(--font-mono);
  padding: 1px 4px;
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  border-radius: var(--radius-sm);
  color: var(--secondary-text);
}

/* 视觉隐藏但屏幕阅读器可读 */
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

/* P0-2/P0-3：思考强度与采样参数行 */
.ctx-param-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--spacing-sm);
}

.ctx-param-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.ctx-param-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.ctx-reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--muted-foreground);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .ctx-reset-btn:hover {
    color: var(--foreground);
  }
}

.ctx-reset-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .ctx-textarea {
    font-size: 16px;
  }
}

/* ── P1 角色状态栏：schema 编辑器 ── */

.ctx-schema-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  margin-top: var(--spacing-sm);
  padding: 0 var(--spacing-sm);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

@media (hover: hover) and (pointer: fine) {
  .ctx-schema-toggle:hover {
    color: var(--foreground);
  }
}

.ctx-schema-toggle:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.ctx-schema {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.status-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--muted-foreground) 6%, transparent);
}

.status-field-row {
  display: flex;
  gap: 6px;
}

.status-field-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.status-field-label {
  font-size: 11px;
  color: var(--muted-foreground);
}

.status-field-input {
  width: 100%;
  min-width: 0;
  font-size: 13px;
}

.status-field-remove {
  position: absolute;
  top: 6px;
  right: 6px;
}

.ctx-schema-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .ctx-schema-add:hover {
    color: var(--foreground);
  }
}

.ctx-schema-add:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .status-field-input {
    font-size: 16px;
  }
}
</style>
