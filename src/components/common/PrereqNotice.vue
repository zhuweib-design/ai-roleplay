<script setup lang="ts">
/**
 * 前置条件横幅（L 层，设计文档 §3.3）
 *
 * 用于"功能看起来能用、实则因别处未配置而不产生效果"的页面（数据银行最典型：
 * 上传显示分块成功，但向量通道默认关闭且静态通道要求角色绑定世界书）。
 * 行数据来自 core/readiness.ts；本组件只负责呈现与跳转，不自行判断。
 */
import { t, type MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { PrereqRow } from '@/core/readiness';
import { useReadinessJump } from '@/composables/useReadinessJump';

defineProps<{ rows: PrereqRow[]; titleKey?: MessageKey }>();

const { pushWithReturn } = useReadinessJump();
</script>

<template>
  <section class="prereq-notice" :aria-label="t(titleKey ?? 'prereq.aria')">
    <header class="prereq-header">
      <Icon name="info" :size="15" aria-hidden="true" />
      <h2 class="prereq-title">{{ t(titleKey ?? 'prereq.title') }}</h2>
    </header>
    <ul class="prereq-list" role="list">
      <li v-for="row in rows" :key="row.id" class="prereq-row" :class="{ done: row.done }">
        <Icon :name="row.done ? 'check' : 'info'" :size="14" aria-hidden="true" />
        <span class="prereq-text">{{ t(row.textKey) }}</span>
        <button
          v-if="!row.done && row.jump"
          type="button"
          class="prereq-action"
          :data-rel-jump="`prereq-${row.id}`"
          @click="pushWithReturn(row.jump!)"
        >
          {{ t(row.actionKey) }}
        </button>
        <span v-else-if="row.done" class="prereq-done">{{ t('prereq.done') }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.prereq-notice {
  margin: 0 0 var(--spacing-md, 16px);
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
}

.prereq-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted-foreground);
}

.prereq-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
}

.prereq-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prereq-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
}

.prereq-row.done {
  color: var(--muted-foreground);
}

.prereq-text {
  flex: 1 1 auto;
  min-width: 0;
}

.prereq-action {
  flex: 0 0 auto;
  padding: 3px 10px;
  border: 1px solid var(--secondary);
  border-radius: 999px;
  background: transparent;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
}

@media (hover: hover) {
  .prereq-action:hover {
    background: var(--secondary);
    color: var(--on-secondary);
  }
}

.prereq-action:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}

.prereq-done {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--muted-foreground);
}
</style>
