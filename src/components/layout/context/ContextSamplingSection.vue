<script setup lang="ts">
/**
 * 上下文面板 · 高级采样（R2-3 从 ContextPanel 拆出）
 *
 * 角色级只放 topP + frequencyPenalty（RP 场景最需要防复读）；
 * 两个参数是否出现由 provider 能力决定（local / anthropic 各缺一项）。
 */
import Icon from '@/components/common/Icon.vue';
import { useContextPanel } from '@/composables/useContextPanel';
import { t } from '@/i18n';

const {
  supportsTopP,
  supportsFrequencyPenalty,
  displayValue,
  isCharSet,
  resetSampling,
  onTopP,
  onFrequencyPenalty,
} = useContextPanel();
</script>

<template>
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
        v-range
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
        v-range
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
</template>
