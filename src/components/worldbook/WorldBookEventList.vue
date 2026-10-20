<script setup lang="ts">
/**
 * 世界书事件列表（R4-2 从 WorldBookEventsPanel 拆出）
 *
 * 纯展示 + 选中：分组数据来自 eventsStore.eventsByScene，选中态落在
 * useWorldBookEvents 的模块级 selectedEventId 上，编辑器读同一个。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { useWorldBookEvents } from './useWorldBookEvents';

const {
  eventsStore,
  selectedEventId,
  getSceneName,
  triggerTypeLabel,
  stateLabel,
  stateColor,
  selectEvent,
} = useWorldBookEvents();
</script>

<template>
  <aside class="events-list-panel" :aria-label="t('wbEvents.listAria')">
    <div
      v-for="[sceneId, evts] in eventsStore.eventsByScene"
      :key="sceneId ?? '__global'"
      class="event-group"
    >
      <div class="event-group-header">
        <Icon name="map-pin" :size="12" />
        <span>{{ getSceneName(sceneId) }}</span>
        <span class="group-count">{{ evts.length }}</span>
      </div>
      <button
        v-for="evt in evts"
        :key="evt.id"
        type="button"
        class="event-item"
        :class="{ active: evt.id === selectedEventId }"
        :aria-current="evt.id === selectedEventId ? 'true' : undefined"
        @click="selectEvent(evt.id)"
      >
        <span class="event-name">{{ evt.name || t('wbEvents.unnamed') }}</span>
        <span class="event-meta">
          <span class="event-trigger-type">{{ triggerTypeLabel(evt.trigger.type) }}</span>
          <span
            class="event-state-badge"
            :class="`state-${evt.state}`"
            :style="{ color: stateColor(evt.state) }"
          >
            {{ stateLabel(evt.state) }}
          </span>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.events-list-panel {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-1, var(--bg-default));
  overflow-y: auto;
  max-height: 480px;
}
.event-group {
  border-bottom: 1px solid var(--border);
}

.event-group:last-child {
  border-bottom: none;
}
.event-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--surface-3, var(--card-elevated));
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
  position: sticky;
  top: 0;
  z-index: 1;
}
.event-group-header .group-count {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--badge-bg);
  color: var(--badge-fg);
  font-size: 11px;
}
.event-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-xs);
  width: 100%;
  padding: var(--spacing-sm) 12px;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  text-align: left;
  color: var(--foreground);
  font-size: 13px;
}
@media (hover: hover) and (pointer: fine) {
  .event-item:hover {
    background: var(--hover, rgba(255, 255, 255, 0.05));
  }
}
.event-item.active {
  background: var(--active, rgba(255, 255, 255, 0.08));
  border-left-color: var(--primary);
}
.event-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 11px;
}
.event-trigger-type {
  color: var(--muted-foreground);
}

@media (max-width: 640px) {
  .events-list-panel {
    max-height: 240px;
  }
}
</style>