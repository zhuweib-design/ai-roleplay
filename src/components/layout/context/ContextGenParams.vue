<script setup lang="ts">
/**
 * 上下文面板 · 生成参数（R2-3 从 ContextPanel 拆出）
 *
 * 三块：温度滑杆、思考强度三档（capability=none 时整块隐藏）、创作模式绑定。
 * 输出上限不再是旋钮：由"模型最大上下文 − 预留 − 输入实测"自动推导（core/token-budget.ts）。
 */
import SegmentedControl from '@/components/common/SegmentedControl.vue';
import { useContextPanel } from '@/composables/useContextPanel';
import { PRESET_IDS, presetLabel } from '@core/creation-preset';
import { t } from '@/i18n';

const {
  char,
  onTemperature,
  reasoningCapability,
  reasoningHeuristicMiss,
  reasoningOptions,
  effectiveReasoningEffort,
  onReasoningEffort,
  presetBindingValue,
} = useContextPanel();

const presetIds = PRESET_IDS;
</script>

<template>
  <section class="ctx-section" aria-labelledby="ctx-gen-title">
    <header class="ctx-section-header">
      <span id="ctx-gen-title" class="ctx-section-title">{{ t('ctx.genTitle') }}</span>
    </header>
    <label class="ctx-range-label">
      <span>{{ t('ctx.temperature') }}</span>
      <input
        v-range
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

    <!-- EXP-01 创作模式：角色级绑定优先于全局；"跟随全局"= 不绑定 -->
    <div class="ctx-param-row">
      <span class="ctx-param-label">{{ t('preset.label') }}</span>
      <select
        v-model="presetBindingValue"
        class="tk-input ctx-preset-select"
        :aria-label="t('preset.title')"
      >
        <option value="">{{ t('preset.followGlobal') }}</option>
        <option v-for="id in presetIds" :key="id" :value="id">{{ presetLabel(id) }}</option>
      </select>
    </div>
  </section>
</template>

<style scoped>
/* EXP-01：创作模式绑定选择器。12px 是相对基类 13px 的差值，保留。
   ≤640 的 16px 覆盖必须留着：这条 scoped 规则（0,2,0）比基类 `.tk-input`（0,1,0）高，
   不写就会让手机上的 12px 压过基类的 16px，iOS 聚焦会放大整页（i7 守卫盯着这条）。 */
.ctx-preset-select {
  width: 100%;
  font-size: 12px;
}

@media (max-width: 640px) {
  .ctx-preset-select {
    font-size: 16px;
  }
}
</style>
