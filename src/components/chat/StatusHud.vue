<script setup lang="ts">
/**
 * StatusHud — 角色状态栏 (P1)
 *
 * 渲染红线（CSP / XSS）：状态值**只用文本插值 `{{ }}`**，
 * 本组件内禁止 v-html / innerHTML（图标走 Icon 白名单）。
 * 模型输出的 key / value 全程是 JS 字符串，永不进 HTML 解析器。
 *
 * 两种 variant：
 * - 'sticky'：会话顶部的"截至当前最新状态"条（本轮唯一启用，由 ChatMain 挂载）
 * - 'inline'：单条消息内的该轮状态（组件已实现，本轮暂不挂载，留待后续）
 *
 * 无可用字段（status 为空 / entries 为空）时**完全不渲染**，不渲染空壳。
 */
import { computed } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { STATUS_STACK_THRESHOLD, type CharacterStatus } from '@core/status-schema';
import { t } from '@/i18n';

const props = withDefaults(
  defineProps<{
    /** 状态快照；null / undefined / entries 为空 → 不渲染 */
    status?: CharacterStatus | null;
    /** 'sticky' = 会话顶部条；'inline' = 消息内条 */
    variant?: 'inline' | 'sticky';
  }>(),
  { status: null, variant: 'inline' }
);

const entries = computed(() =>
  Array.isArray(props.status?.entries) ? props.status!.entries : []
);

const hasStatus = computed(() => entries.value.length > 0);

/** 标题：会话级说"当前状态"，消息级说"角色状态" */
const title = computed(() =>
  props.variant === 'sticky' ? t('status.stickyTitle') : t('status.hudTitle')
);

/** 无障碍标签（role=group 需要可读名称） */
const ariaLabel = computed(() =>
  props.variant === 'sticky' ? t('status.stickyAria') : t('status.hudAria')
);

/** 长值切竖排（抄竞品的响应式降级思路，阈值按 CJK 观感调） */
function isStacked(value: string): boolean {
  return value.length > STATUS_STACK_THRESHOLD;
}
</script>

<template>
  <section
    v-if="hasStatus"
    class="status-hud"
    :class="`status-hud-${variant}`"
    role="group"
    :aria-label="ariaLabel"
  >
    <span class="status-hud-title">{{ title }}</span>
    <ul class="status-hud-list">
      <li
        v-for="entry in entries"
        :key="entry.key"
        class="status-entry"
        :class="{ 'status-entry-stacked': isStacked(entry.value) }"
      >
        <!-- 图标未命中时不渲染（不是渲染空白） -->
        <Icon v-if="entry.icon" :name="entry.icon" :size="12" />
        <span class="status-label">{{ entry.label }}</span>
        <span class="status-value">{{ entry.value }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.status-hud {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px var(--spacing-md);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--muted-foreground) 6%, transparent);
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.5;
  flex-shrink: 0;
}

.status-hud-title {
  font-family: var(--font-display);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.status-hud-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px var(--spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}

.status-entry {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
}

/* 长值竖排：label 与 value 各占一行，避免挤压其他字段 */
.status-entry-stacked {
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
}

.status-label {
  opacity: 0.75;
  white-space: nowrap;
}

.status-value {
  color: var(--foreground);
  word-break: break-word;
}

/* 桌面/平板：sticky 条单行紧凑 */
@media (min-width: 1025px) {
  .status-hud {
    gap: var(--spacing-md);
  }
}

@media (max-width: 640px) {
  .status-hud {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .status-entry {
    font-size: 12px;
  }
}
</style>
