<script setup lang="ts">
/**
 * ModelPresetSection — 创作模式（MODEL-03）与旁白人称（两个 section，多根平铺）
 *
 * R1-4 从 SettingsModelPanel（原 2544 行）拆出。两块共用同一套 `.preset-*`
 * 样式（原来就是复用的），所以合成一个文件而不是两个：分开会让 fieldset/radio
 * 那 80 行样式复制两份。
 *
 * 多根（fragment）：settings 页正文是单列 flex 容器，两个 section 平铺进去
 * 各占一格，与拆分前的 DOM 顺序一致。
 */
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import {
  PRESET_IDS,
  normalizePresetId,
  presetLabel,
  presetDescription,
  resolvePresetParams,
  type PresetId,
} from '@core/creation-preset';
import type { NarrationPerspective } from '@/core/narration';
import type { MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();

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

/** 旁白人称的两个选项（顺序即界面顺序；'me' 是默认值） */
const narrativeOptions: Array<{
  id: NarrationPerspective;
  labelKey: MessageKey;
  descKey: MessageKey;
}> = [
  { id: 'me', labelKey: 'narrative.me', descKey: 'narrative.meDesc' },
  { id: 'you', labelKey: 'narrative.you', descKey: 'narrative.youDesc' },
];

function onNarrativeChange(value: NarrationPerspective): void {
  settings.setNarrationPerspective(value);
  void settings.persistSettings();
}
</script>

<template>
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

  <!-- 心理活动（旁白段）的人称视角。它只改**注入给模型的叙事规则**，
       不回写历史消息：切换后下一条回复用新视角，之前生成的仍是旧视角。 -->
  <section class="settings-section" aria-labelledby="narrative-title">
    <header class="section-header">
      <h2 id="narrative-title" class="section-title">
        <Icon name="palette" :size="16" />
        <span>{{ t('narrative.title') }}</span>
      </h2>
    </header>
    <p class="preset-hint">{{ t('narrative.hint') }}</p>
    <!-- 样式复用上面「创作模式」那一组：同一个面板里"全局多选一"就该长一个样，
         不为这一节另造一套 fieldset/radio 的 CSS -->
    <fieldset class="preset-fieldset">
      <legend class="preset-legend">{{ t('narrative.label') }}</legend>
      <label v-for="opt in narrativeOptions" :key="opt.id" class="preset-option">
        <input
          type="radio"
          name="narrative-perspective"
          class="preset-radio"
          :value="opt.id"
          :checked="settings.narrationPerspective === opt.id"
          :aria-label="t(opt.labelKey)"
          @change="onNarrativeChange(opt.id)"
        />
        <span class="preset-option-body">
          <span class="preset-option-label">{{ t(opt.labelKey) }}</span>
          <span class="preset-option-desc">{{ t(opt.descKey) }}</span>
        </span>
      </label>
    </fieldset>
  </section>
</template>

<style scoped>
/* ── 标准 section 容器（从 SettingsModelPanel.vue 复制，因 scoped 不穿透子组件） ── */
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
</style>
