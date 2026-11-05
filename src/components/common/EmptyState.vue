<script setup lang="ts">
/**
 * 空态原语（G 层，§3.5.6）
 *
 * 全仓此前有 ≥10 份手写 `.empty-state`，质量随文件漂移：有的只有文字没有入口，
 * 有的文案说"点击新建"却不放按钮。统一成"图标 + 标题 + 一句解释 + 主行动"，
 * 主行动可选（无行动的纯提示也允许，但会在 code review 时被质疑）。
 */
import { computed } from 'vue';
import { t, type MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';

const props = withDefaults(
  defineProps<{
    titleKey: MessageKey;
    descKey?: MessageKey;
    icon?: IconName;
    actionKey?: MessageKey;
    /**
     * 宿主标签。列表页的空态是 `<ul>` 里的一项，用默认的 `<section>` 会生成
     * `ul > section` 这种非法结构（axe 的 list-item 规则会红），所以留一个开关。
     */
    as?: 'section' | 'li';
    /** 标题层级：嵌在别的标题之下时降一级，避免 heading 顺序跳跃 */
    headingLevel?: 2 | 3;
    /** 紧凑态：面板内的小空态不配 40px 圆底图标（原实现里就是"只有一行字"） */
    compact?: boolean;
  }>(),
  { descKey: undefined, icon: undefined, actionKey: undefined, as: 'section', headingLevel: 2, compact: false }
);

const emit = defineEmits<{ (e: 'action'): void }>();

// 一页可能出现两个空态（例如"无搜索结果"+"无数据"分区），id 不能写死
const uid = `empty-${Math.random().toString(36).slice(2, 8)}`;
const titleId = computed(() => `${uid}-title`);
</script>

<template>
  <component
    :is="props.as"
    class="empty-state"
    :class="{ 'empty-state--compact': compact }"
    :aria-labelledby="titleId"
  >
    <span v-if="!compact" class="empty-icon" aria-hidden="true">
      <Icon :name="props.icon ?? 'info'" :size="24" />
    </span>
    <component :is="`h${props.headingLevel}`" :id="titleId" class="empty-title">
      {{ t(props.titleKey) }}
    </component>
    <p v-if="props.descKey" class="empty-desc">{{ t(props.descKey) }}</p>
    <button
      v-if="props.actionKey"
      type="button"
      class="empty-action"
      :data-rel-jump="`empty-${props.actionKey}`"
      @click="emit('action')"
    >
      {{ t(props.actionKey) }}
    </button>
    <slot />
  </component>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs, 4px);
  padding: var(--spacing-lg, 24px) var(--spacing-md, 16px);
  text-align: center;
}

.empty-state--compact {
  gap: 2px;
  padding: var(--spacing-md, 16px);
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--muted, var(--card));
  color: var(--muted-foreground);
}

.empty-title {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.empty-desc {
  margin: 0;
  max-width: 42ch;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.empty-action {
  margin-top: 8px;
  padding: 6px 14px;
  border: 1px solid var(--secondary);
  border-radius: var(--radius-sm, 8px);
  background: var(--secondary);
  color: var(--on-secondary);
  font-size: 13px;
  cursor: pointer;
}

.empty-action:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 2px;
}

/* 批次 3-2：空态行动按钮 */
@media (max-width: 640px) {
  .empty-action {
    min-height: var(--touch-min);
  }
}
</style>
