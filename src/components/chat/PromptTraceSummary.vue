<script setup lang="ts">
/**
 * 本轮注入回显（L 层，§3.3）
 *
 * 世界书此前的问题是"配了但看不见"：prompt-builder 早就返回 activatedEntries，
 * 只是没下传。这里把它变成一句可核对的话 + 可点回来源书的链接。
 * 只报"注入了"，不报"模型采纳了"——后者无法从界面证明。
 */
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { PromptTraceItem } from '@core/lorebook-scanner';
import { useReadinessJump } from '@/composables/useReadinessJump';

const props = defineProps<{ items?: PromptTraceItem[] }>();

const open = ref(false);
const { pushWithReturn } = useReadinessJump();

const list = computed(() => props.items ?? []);
</script>

<template>
  <div v-if="list.length" class="prompt-trace">
    <button
      type="button"
      class="trace-toggle"
      :aria-expanded="open"
      data-rel-jump="trace-toggle"
      @click="open = !open"
    >
      <Icon name="book-open" :size="13" aria-hidden="true" />
      <span>{{ t('trace.summary', { count: list.length }) }}</span>
      <Icon :name="open ? 'chevron-up' : 'chevron-down'" :size="13" aria-hidden="true" />
    </button>

    <ul v-if="open" class="trace-list" role="list">
      <li v-for="item in list" :key="item.entryId" class="trace-item">
        <button
          type="button"
          class="trace-link"
          :data-rel-jump="`trace-${item.bookId}`"
          :aria-label="t('trace.openBook', { name: item.bookName })"
          @click="pushWithReturn({ name: 'worldbook', query: { book: item.bookId } })"
        >
          {{ item.bookName }}
        </button>
        <span class="trace-entry">{{ item.title }}</span>
        <span v-if="item.keys.length" class="trace-keys">{{ item.keys.join(' · ') }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.prompt-trace {
  margin-top: 6px;
}

.trace-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}

@media (hover: hover) {
  .trace-toggle:hover,
  .trace-link:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.trace-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.trace-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--muted-foreground);
}

.trace-link {
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
}

.trace-entry {
  color: var(--foreground);
}

.trace-keys {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
}

.trace-toggle:focus-visible,
.trace-link:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
</style>
