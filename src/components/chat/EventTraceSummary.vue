<script setup lang="ts">
/**
 * 本轮随机事件回显（E11，L 层）
 *
 * 与 `PromptTraceSummary` 同一件事的另一半：世界书那边已经能核对"这轮用了哪几条设定"，
 * 随机事件却是**生效了但完全 invisible**——`chat-generation` 把事件转成 StoryEvent
 * 推进事件表，下一轮由 `chat-context` 注入系统提示词，对话界面上一句痕迹都没有。
 *
 * 同样只报"注入了"，不报"模型采纳了"（后者无法从界面证明）；
 * 同样不显示事件正文——`description` 是模型生成的整段文本，撑体积也可能把
 * 未公开设定原文摊在会话里。
 */
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { EventTraceItem } from '@core/event-trace';
import { useReadinessJump } from '@/composables/useReadinessJump';

const props = defineProps<{ items?: EventTraceItem[] }>();

const open = ref(false);
const { pushWithReturn } = useReadinessJump();

const list = computed(() => props.items ?? []);
</script>

<template>
  <div v-if="list.length" class="event-trace">
    <button
      type="button"
      class="event-trace-toggle"
      :aria-expanded="open"
      data-rel-jump="event-trace-toggle"
      @click="open = !open"
    >
      <Icon name="warning" :size="13" aria-hidden="true" />
      <span>{{ t('trace.eventsSummary', { count: list.length }) }}</span>
      <Icon :name="open ? 'chevron-up' : 'chevron-down'" :size="13" aria-hidden="true" />
    </button>

    <ul v-if="open" class="event-trace-list" role="list">
      <li v-for="item in list" :key="item.eventId" class="event-trace-item">
        <button
          type="button"
          class="event-trace-link"
          :data-rel-jump="`event-trace-${item.eventId}`"
          :aria-label="t('trace.eventsOpen')"
          @click="pushWithReturn({ name: 'random-events' })"
        >
          {{ t('re.title') }}
        </button>
        <span class="event-trace-name">{{ item.name }}</span>
        <span v-if="item.sceneName" class="event-trace-scene">{{ item.sceneName }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 排版与 prompt-trace 同款：两条回显并排出现时必须看起来是一类东西 */
.event-trace {
  margin-top: 6px;
}

.event-trace-toggle {
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
  .event-trace-toggle:hover,
  .event-trace-link:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.event-trace-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-trace-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--muted-foreground);
}

.event-trace-link {
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--secondary);
  font-size: 13px;
  cursor: pointer;
}

.event-trace-name {
  color: var(--foreground);
}

.event-trace-scene {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
}

.event-trace-toggle:focus-visible,
.event-trace-link:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
</style>
