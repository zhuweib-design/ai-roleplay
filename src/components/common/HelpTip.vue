<script setup lang="ts">
/**
 * HelpTip — 说明气泡（G 层原语，§3.4 第 3 条）
 *
 * 替掉的是 `title=` 这一类"只有鼠标悬停才看得到、键盘与触屏完全拿不到"的说明。
 * 仓库里 `title=` 有 71 处，全量迁移排在 §七 #14；这里先建原语并接管关键项。
 *
 * 实现要点：
 * - 触发器是真正的 `<button>`，因此键盘可聚焦；说明文本用 `aria-describedby` 关联，
 *   读屏聚焦时会读出来（`title=` 在多数读屏里不稳定）。
 * - 显示条件 = 悬停 **或** 聚焦，两条都在 CSS 里，不靠 JS 计时器。
 * - 气泡本身 `role="tooltip"` 且默认不可见时也不 `display:none`（否则 aria-describedby
 *   读不到内容），用 visibility 控制。
 */
import { computed, ref } from 'vue';
import { t, type MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';

const props = withDefaults(
  defineProps<{
    /** 说明正文键 */
    textKey: MessageKey;
    /** 触发器上的可读名字；不传则用说明正文 */
    labelKey?: MessageKey;
    /** 触发器显示的文本（已是成品文案，通常是字段标签） */
    fallback?: string;
    id?: string;
  }>(),
  { labelKey: undefined, id: undefined }
);

const open = ref(false);
const tipId = computed(() => props.id ?? `helptip-${props.textKey.replace(/[^a-z0-9]/gi, '-')}`);
</script>

<template>
  <span class="help-tip" :class="{ open }">
    <button
      type="button"
      class="help-tip-trigger"
      :aria-describedby="tipId"
      :aria-label="labelKey ? t(labelKey) : t(props.textKey)"
      @mouseenter="open = true"
      @mouseleave="open = false"
      @focus="open = true"
      @blur="open = false"
      @click="open = !open"
    >
      <span v-if="fallback" class="help-tip-text">{{ fallback }}</span>
      <Icon name="info" :size="13" aria-hidden="true" />
    </button>
    <span :id="tipId" class="help-tip-bubble" role="tooltip">{{ t(textKey) }}</span>
  </span>
</template>

<style scoped>
.help-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.help-tip-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  cursor: help;
}

.help-tip-text {
  font-size: inherit;
}

.help-tip-bubble {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: var(--z-toast, 40);
  width: max-content;
  max-width: 240px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.4;
  visibility: hidden;
  opacity: 0;
}

.help-tip.open .help-tip-bubble {
  visibility: visible;
  opacity: 1;
}

@media (max-width: 640px) {
  /* 触屏没有悬停：靠点击开合，气泡改占满一行避免贴边被裁 */
  .help-tip-bubble {
    max-width: min(240px, 72vw);
  }
}
</style>
