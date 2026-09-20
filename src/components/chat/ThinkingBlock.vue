<script lang="ts">
/**
 * ThinkingBlock — 思维链折叠块 (P0-1)
 *
 * 渲染红线（CSP / XSS）：思考内容**只用文本插值 `{{ }}`**，
 * 本组件内禁止出现 v-html / innerHTML（静态图标走 Icon 白名单）。
 *
 * 性能：折叠态**不渲染思考正文 DOM**（`v-if` 懒渲染），
 * 长思考不会撑爆 DOM 树；展开态由 ThinkingBlock 自身单点 patch。
 *
 * 交互：默认折叠；生成中显示"思考中…" + 脉冲点；
 * 用户点开后在**本次会话内记忆**（模块级 Set，组件卸载仍保留，刷新页面失效）。
 */

/**
 * 会话级展开记忆（模块作用域）
 *
 * 必须放在普通 `<script>` 块：`<script setup>` 的内容会被编译进 setup() 函数体，
 * 其顶层 const 每次实例化都会重新创建，无法跨实例记忆。
 * 这里声明在模块作用域，跨组件实例保留（切换/重挂载仍生效），刷新页面即失效。
 *
 * 只存"用户手动展开过"的 messageId，不污染 UIMessage 数据结构（§7.4）。
 */
const expandedIds = new Set<string>();

/** 清空记忆（供测试与会话切换复用） */
export function resetThinkingExpansionMemory(): void {
  expandedIds.clear();
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

const props = withDefaults(
  defineProps<{
    /** 思考内容（为空/空白时不渲染） */
    thinking?: string;
    /** 消息 id（用于记忆展开状态；缺省时不记忆） */
    messageId?: string;
    /** 是否正在生成中（显示"思考中…" + 脉冲点） */
    generating?: boolean;
    /** 是否默认折叠（来自全局 settings.thinkingConfig.defaultCollapsed） */
    defaultCollapsed?: boolean;
    /**
     * P1：本条思考消耗的 token（来自 ChatUsage.reasoningTokens）
     * 供应商未上报时为 undefined → **不展示**（显示 0 会被误读成"思考没花 token"）
     */
    reasoningTokens?: number;
  }>(),
  { thinking: '', messageId: '', generating: false, defaultCollapsed: true, reasoningTokens: undefined }
);

/** 是否有可展示的思考（空串与 undefined 都不渲染折叠块，§7.4） */
const hasThinking = computed(() => !!props.thinking && props.thinking.trim() !== '');

function initialExpanded(): boolean {
  if (props.messageId && expandedIds.has(props.messageId)) return true;
  return !props.defaultCollapsed;
}

const expanded = ref<boolean>(initialExpanded());

function toggle(): void {
  expanded.value = !expanded.value;
  if (!props.messageId) return;
  if (expanded.value) expandedIds.add(props.messageId);
  else expandedIds.delete(props.messageId);
}

/** 生成中且未展开时显示"思考中…"（与既有 .gen-dot 脉冲视觉一致） */
const title = computed(() =>
  props.generating && !expanded.value ? t('bubble.thinkingLoading') : t('bubble.thinking')
);

/**
 * P1：思考 token 是否可展示
 *
 * 只认"供应商真的上报了正数"这一种情况：undefined / null / 0 / NaN 一律不展示。
 * 生成未完成时也没有最终用量，同样不展示（避免中途闪一个不完整的数字）。
 */
const hasReasoningTokens = computed(
  () =>
    !props.generating &&
    typeof props.reasoningTokens === 'number' &&
    Number.isFinite(props.reasoningTokens) &&
    props.reasoningTokens > 0
);

/** 思考 token 文案（仅在 hasReasoningTokens 为真时渲染） */
const reasoningTokensText = computed(() =>
  t('bubble.thinkingTokens', { count: props.reasoningTokens ?? 0 })
);
</script>

<template>
  <div v-if="hasThinking" class="thinking-block">
    <button
      type="button"
      class="thinking-header"
      :aria-expanded="expanded"
      :aria-controls="messageId ? `thinking-body-${messageId}` : undefined"
      :aria-label="expanded ? t('bubble.thinkingCollapse') : t('bubble.thinkingExpand')"
      @click="toggle"
    >
      <Icon name="brain" :size="13" />
      <span class="thinking-title">{{ title }}</span>
      <!-- P1: reasoning tokens — rendered only when the provider reports them -->
      <span v-if="hasReasoningTokens" class="thinking-tokens">{{ reasoningTokensText }}</span>
      <span v-if="generating && !expanded" class="thinking-pulse" aria-hidden="true" />
      <Icon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="13" />
    </button>

    <div
      v-if="expanded"
      :id="messageId ? `thinking-body-${messageId}` : undefined"
      class="thinking-body"
      role="group"
      :aria-label="t('bubble.thinkingAria')"
    >
      {{ thinking }}
    </div>
  </div>
</template>

<style scoped>
.thinking-block {
  margin-bottom: var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--muted-foreground) 6%, transparent);
  overflow: hidden;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  padding: 6px var(--spacing-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.thinking-title {
  flex: 1;
  font-family: var(--font-display);
  letter-spacing: 0.02em;
}

/* P1：思考 token 数（等宽数字避免数字变化时宽度跳动；比标题略小，不抢主语） */
.thinking-tokens {
  flex-shrink: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
  white-space: nowrap;
}

.thinking-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--secondary);
  animation: thinking-pulse 1.2s ease-in-out infinite;
}

@keyframes thinking-pulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .thinking-pulse {
    animation: none;
  }
}

@media (hover: hover) and (pointer: fine) {
  .thinking-header:hover {
    color: var(--foreground);
  }
}

.thinking-header:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.thinking-body {
  padding: 0 var(--spacing-sm) var(--spacing-sm);
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--muted-foreground);
  white-space: pre-wrap;
  word-break: break-word;
  border-top: 1px solid var(--border);
  padding-top: var(--spacing-sm);
  max-height: 320px;
  overflow-y: auto;
}
</style>
