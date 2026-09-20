<script setup lang="ts">
/**
 * StatusHud — 角色状态栏 (P1)
 *
 * 渲染红线（CSP / XSS）：状态值**只用文本插值 `{{ }}`**，
 * 本组件内禁止 v-html / innerHTML（图标走 Icon 白名单）。
 * 模型输出的 key / value 全程是 JS 字符串，永不进 HTML 解析器。
 *
 * 两种 variant：
 * - 'sticky'：会话顶部的"截至当前最新状态"条（由 ChatMain 挂载）
 * - 'inline'：单条消息内的该轮状态（由 MessageBubble 挂载，仅在 msg.status 存在时渲染）
 *
 * 移动端（≤640）：挂载点传 `collapsibleOnMobile` 时，inline 会**默认折叠**为
 * 一行标题 + 字段数，点击展开 —— 消息列表里每轮都可能出现一条，不折叠会把列表撑爆。
 * sticky 恒展开（全局只有一条）。
 *
 * 无可用字段（status 为空 / entries 为空）时**完全不渲染**，不渲染空壳。
 */
import { computed, ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { STATUS_STACK_THRESHOLD, type CharacterStatus } from '@core/status-schema';
import { isMobile } from '@core/viewport';
import { t } from '@/i18n';

const props = withDefaults(
  defineProps<{
    /** 状态快照；null / undefined / entries 为空 → 不渲染 */
    status?: CharacterStatus | null;
    /** 'sticky' = 会话顶部条；'inline' = 消息内条 */
    variant?: 'inline' | 'sticky';
    /**
     * 小屏（≤640）是否折叠为一行（点击展开）
     *
     * **默认 false** —— 折叠是"消息列表里会重复出现 N 次"才需要的降级，
     * 由挂载点（MessageBubble）显式开启；群聊成员状态条等一次性展示处保持原样。
     */
    collapsibleOnMobile?: boolean;
  }>(),
  { status: null, variant: 'inline', collapsibleOnMobile: false }
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

/**
 * 小屏折叠：默认折叠，点标题展开
 *
 * 视口状态取自 `useViewport`（全仓唯一允许 matchMedia 的位置）；
 * 非移动端恒为展开，折叠开关根本不渲染 —— 桌面不出现无意义的交互。
 */
const collapsible = computed(() => props.collapsibleOnMobile && isMobile.value);
const collapsed = ref(isMobile.value);
const showList = computed(() => !collapsible.value || !collapsed.value);

/** 折叠开关的 aria-controls（消息级可能同时存在多个，用 messageId 区分） */
const listId = computed(
  () => `status-hud-list-${props.status?.messageId ?? props.variant}`
);

/** 折叠时显示的字段数（让用户知道折叠里有多少内容） */
const entryCountText = computed(() => t('status.entryCount', { count: entries.value.length }));
</script>

<template>
  <section
    v-if="hasStatus"
    class="status-hud"
    :class="`status-hud-${variant}`"
    role="group"
    :aria-label="ariaLabel"
  >
    <!-- 小屏：标题即折叠开关（桌面/平板渲染为纯文本标题，不带交互） -->
    <button
      v-if="collapsible"
      type="button"
      class="status-hud-toggle"
      :aria-expanded="!collapsed"
      :aria-controls="listId"
      @click="collapsed = !collapsed"
    >
      <Icon :name="collapsed ? 'chevron-down' : 'chevron-up'" :size="12" />
      <span class="status-hud-title">{{ title }}</span>
      <span class="status-hud-count" :aria-label="entryCountText">{{ entries.length }}</span>
    </button>
    <span v-else class="status-hud-title">{{ title }}</span>
    <ul v-if="showList" :id="listId" class="status-hud-list">
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

/**
 * inline variant：消息内的"这一轮"状态
 *
 * 视觉上必须能与顶部 sticky 条区分开 —— sticky 是贴边通栏、只有下边框；
 * inline 是气泡内的一张**带圆角边框的小卡**，不与气泡边缘相连、四边都有线。
 * 两者底色同系但 inline 更淡，避免"两条一样的条"造成的重复感。
 */
.status-hud-inline {
  align-items: flex-start;
  margin-bottom: var(--spacing-sm);
  padding: 3px var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--muted-foreground) 4%, transparent);
  font-size: 11px;
}

/* 小屏折叠开关：整行可点，命中区域不小于行高 */
.status-hud-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.status-hud-count {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted-foreground) 14%, transparent);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: center;
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

  /* 小屏 inline：默认折叠（由 JS 控制），展开后仍横向换行（比竖排更省高度） */
  .status-hud-inline {
    gap: 2px;
    padding: 2px var(--spacing-sm);
  }

  .status-hud-inline .status-hud-list {
    gap: 2px 6px;
  }
}
</style>
