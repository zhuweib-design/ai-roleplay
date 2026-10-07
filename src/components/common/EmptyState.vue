<script setup lang="ts">
/**
 * 空态原语（G 层，§3.5.6）
 *
 * 全仓此前有 ≥10 份手写 `.empty-state`，质量随文件漂移：有的只有文字没有入口，
 * 有的文案说"点击新建"却不放按钮。统一成"图标 + 标题 + 一句解释 + 主行动"，
 * 主行动可选（无行动的纯提示也允许，但会在 code review 时被质疑）。
 */
import { t, type MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';

const props = defineProps<{
  titleKey: MessageKey;
  descKey?: MessageKey;
  icon?: IconName;
  actionKey?: MessageKey;
}>();

const emit = defineEmits<{ (e: 'action'): void }>();
</script>

<template>
  <section class="empty-state" :aria-labelledby="'empty-title'">
    <span class="empty-icon" aria-hidden="true">
      <Icon :name="props.icon ?? 'info'" :size="24" />
    </span>
    <h2 id="empty-title" class="empty-title">{{ t(props.titleKey) }}</h2>
    <p v-if="props.descKey" class="empty-desc">{{ t(props.descKey) }}</p>
    <button
      v-if="props.actionKey"
      type="button"
      class="empty-action"
      @click="emit('action')"
    >
      {{ t(props.actionKey) }}
    </button>
    <slot />
  </section>
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
  color: var(--primary-foreground, var(--background));
  font-size: 13px;
  cursor: pointer;
}

.empty-action:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 2px;
}
</style>
