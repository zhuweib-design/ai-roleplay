<script setup lang="ts">
/**
 * 就绪状态条（L 层，设计文档 §3.3）
 *
 * 页头一眼看清"这轮对话依赖的四件事各自到什么程度"，未就绪时给出原因 + 一步跳转，
 * 取代此前"只有发失败才知道缺什么"（ChatMain.vue:746 的被动徽标）。
 * 状态一律来自 core/readiness.ts，本组件不做任何判断。
 */
import { computed } from 'vue';
import { t, type MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import { useReadinessChips, type ReadinessChip, type ReadinessState } from '@/core/readiness';
import { useReadinessJump } from '@/composables/useReadinessJump';

defineProps<{ compact?: boolean }>();

const chips = useReadinessChips();
const { pushWithReturn } = useReadinessJump();

const needsAttention = computed(() => chips.value.filter((c) => c.state !== 'ready' && c.state !== 'n-a').length);

function stateKey(state: ReadinessState): MessageKey {
  switch (state) {
    case 'ready':
      return 'readiness.stateReady';
    case 'attention':
      return 'readiness.stateAttention';
    case 'locked':
      return 'readiness.stateLocked';
    default:
      return 'readiness.stateUnused';
  }
}

function onChip(chip: ReadinessChip): void {
  if (chip.jump) pushWithReturn(chip.jump);
}
</script>

<template>
  <div
    class="readiness-bar"
    :class="{ compact }"
    role="group"
    :aria-label="t('readiness.aria')"
  >
    <span class="readiness-summary">
      <Icon name="info" :size="14" aria-hidden="true" />
      <span>{{ needsAttention === 0 ? t('readiness.allSet') : t('readiness.needsAttention', { count: needsAttention }) }}</span>
    </span>

    <button
      v-for="chip in chips"
      :key="chip.id"
      type="button"
      class="readiness-chip"
      :class="`is-${chip.state}`"
      :data-rel-jump="chip.dataRelJump"
      v-tip="chip.reasonKey ? t(chip.reasonKey) : t('readiness.stateReadyHint')"
      @click="onChip(chip)"
    >
      <span class="chip-dot" aria-hidden="true" />
      <span class="chip-label">{{ t(chip.labelKey) }}</span>
      <span class="chip-state">{{ t(stateKey(chip.state)) }}</span>
    </button>
  </div>
</template>

<style scoped>
.readiness-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  /* 以下 6px / 5px / 3px / 7px 都落在 4px 基准尺的档位之外（尺度只有 4/8/12），
     试点先保留字面量并登记进"尺度缺口"表——要么补一档细尺度，要么接受视觉微调。 */
  gap: 6px;
  padding: 6px var(--space-3);
  border-bottom: var(--size-border-thin) solid var(--border);
  background: var(--card);
  font-size: var(--font-size-sm);
  color: var(--muted-foreground);
}

.readiness-bar.compact {
  padding: var(--space-1) var(--space-2);
  gap: var(--space-1);
}

.readiness-summary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-right: var(--space-1);
}

.readiness-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px var(--space-2);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: var(--transition-colors);
}

@media (hover: hover) {
  .readiness-chip:hover {
    border-color: var(--secondary);
    color: var(--foreground);
  }
}

.readiness-chip:focus-visible {
  outline: var(--focus-ring-width) solid var(--ring, var(--secondary));
  outline-offset: var(--size-border-thin);
}

.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-circle);
  background: var(--muted-foreground);
}

.is-ready .chip-dot {
  background: var(--success, var(--secondary));
}

.is-attention {
  color: var(--foreground);
}

.is-attention .chip-dot {
  background: var(--warning, var(--secondary));
}

.is-locked .chip-dot {
  background: var(--secondary);
}

.chip-state {
  font-size: 13px;
}
</style>
