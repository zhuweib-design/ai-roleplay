<script setup lang="ts">
/**
 * 上下文面板 · Token 预算（R2-3 从 ContextPanel 拆出）
 *
 * 用量与上限都取真实数据（E24 / 决策 D-H）：上限跟随 settings.maxContextTokens，
 * 用量取 chatStore.totalTokenUsage，不再读从不重算的 char.tokenBudget。
 */
import { useContextPanel } from '@/composables/useContextPanel';
import { t } from '@/i18n';

const { chatStore, TOTAL_BUDGET, usedTokens, usedPercent, remainingTokens } = useContextPanel();
</script>

<template>
  <section class="ctx-section" aria-labelledby="ctx-token-title">
    <header class="ctx-section-header">
      <span id="ctx-token-title" class="ctx-section-title">{{ t('ctx.tokenTitle') }}</span>
      <span class="ctx-section-value">{{ usedTokens }} / {{ TOTAL_BUDGET }}</span>
    </header>
    <div
      class="token-bar"
      role="progressbar"
      :aria-valuenow="usedTokens"
      :aria-valuemin="0"
      :aria-valuemax="TOTAL_BUDGET"
      :aria-label="t('ctx.tokenUsed', { percent: usedPercent })"
    >
      <div class="token-bar-fill" :style="{ width: `${usedPercent}%` }" />
    </div>
    <ul class="token-legend" :aria-label="t('ctx.tokenLegend')">
      <li class="legend-usage">
        <span class="legend-dot legend-usage-dot" aria-hidden="true" />
        <span class="legend-label">{{ t('ctx.totalUsage') }}</span>
        <span class="legend-value">{{ chatStore.totalTokenUsage }} Tokens</span>
      </li>
      <li>
        <span class="legend-dot legend-remaining" aria-hidden="true" />
        <span class="legend-label">{{ t('ctx.remaining') }}</span>
        <span class="legend-value">{{ remainingTokens }}</span>
      </li>
    </ul>
    <p class="ctx-char-desc">{{ t('ctx.tokenHint') }}</p>
  </section>
</template>

<style scoped>
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

/* 待清理：多段配色用量条时代的分段元素，现用量条只有 fill 一层（模板零命中）。
   按 R1-4 立下的纪律"先分离再删"，下一提交单独删。 */
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
</style>
