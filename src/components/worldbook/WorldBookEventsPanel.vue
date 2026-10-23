<script setup lang="ts">
/**
 * WorldBookEventsPanel — 世界书「事件管理」面板（P2-7 拆分；R4-2 二次拆分）
 *
 * 自 WorldBookView.vue 迁出：F17.1 事件列表 + 事件编辑器（触发条件/完成条件）。
 *
 * R4-2 把三件事分开：本书只剩**外壳 + 副作用**（section 骨架、页头动作、空态、
 * 内容网格、Toast，以及两处 watch），列表与编辑器各自成组件。
 * 共享状态在 `useWorldBookEvents` 的模块级单例里，子组件直接取用、零 props 传递
 * （编辑器只收一个 `event` prop 用来在模板里排除 null）。
 */
import { watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import { t } from '@/i18n';
import { provideWorldBookEvents } from './useWorldBookEvents';
import WorldBookEventList from './WorldBookEventList.vue';
import WorldBookEventEditor from './WorldBookEventEditor.vue';

const {
  eventsStore,
  currentLorebook,
  selectedEventId,
  selectedEvent,
  sceneOptions,
  levelLabel,
  getEntryLevel,
  clearFieldState,
  showEventsToast,
  createNewGlobalEvent,
  onNewEventSceneChange,
  toastOpen,
  toastType,
  toastMessage,
} = provideWorldBookEvents();

// 监听 currentLorebook 同步到 eventsStore
watch(
  () => currentLorebook.value?.id,
  (id) => {
    eventsStore.setCurrentLorebook(id ?? null);
    selectedEventId.value = null;
    clearFieldState();
  },
  { immediate: true }
);

// 监听 eventsStore 错误/提示
watch(
  () => eventsStore.lastError,
  (err) => {
    if (err) showEventsToast('error', err);
  }
);
watch(
  () => eventsStore.lastInfo,
  (info) => {
    if (info) showEventsToast('success', info);
  }
);
</script>

<template>
  <!-- F17.1 事件管理 -->
  <section class="events-section" :aria-label="t('wbEvents.aria')">
    <header class="events-header">
      <h2>
        <Icon name="calendar-check" :size="14" />
        <span>{{ t('wbEvents.title', { count: eventsStore.currentEvents.length }) }}</span>
      </h2>
      <div class="events-actions">
        <button
          type="button"
          class="action-btn add-event-btn"
          @click="createNewGlobalEvent"
        >
          <Icon name="plus" :size="14" />
          <span>{{ t('wbEvents.globalEvent') }}</span>
        </button>
        <label class="scene-select-label" for="new-event-scene">
          <span class="sr-only">{{ t('wbEvents.bindSceneAria') }}</span>
          <select
            id="new-event-scene"
            class="form-select scene-select"
            @change="onNewEventSceneChange"
          >
            <option value="">{{ t('wbEvents.addSceneEvent') }}</option>
            <option
              v-for="entry in sceneOptions"
              :key="entry.id"
              :value="entry.id"
            >
              {{ t('wbEvents.sceneEntry', { title: entry.title, level: levelLabel(getEntryLevel(entry.id)) }) }}
            </option>
          </select>
        </label>
      </div>
    </header>

    <div v-if="eventsStore.currentEvents.length === 0" class="events-empty">
      <Icon name="calendar-check" :size="32" />
      <p>{{ t('wbEvents.emptyTitle') }}</p>
      <p class="hint">{{ t('wbEvents.emptyHint') }}</p>
    </div>

    <div v-else class="events-content">
      <WorldBookEventList />
      <WorldBookEventEditor v-if="selectedEvent" :event="selectedEvent" />
      <div v-else class="event-editor-empty">
        <Icon name="cursor" :size="32" />
        <p>{{ t('wbEvents.selectHint') }}</p>
      </div>
    </div>
  </section>

  <!-- 自包含 Toast -->
  <Toast
    v-model="toastOpen"
    :message="toastMessage"
    :type="toastType"
  />
</template>

<style scoped>
.events-section {
  background: var(--surface-2, var(--card-elevated));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: var(--spacing-md);
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.events-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.events-header h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
  color: var(--foreground);
}
.events-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}
.scene-select-label {
  display: inline-flex;
  align-items: center;
}
.scene-select {
  width: auto;
  min-width: 200px;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 13px;
}
.events-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  color: var(--muted-foreground);
  text-align: center;
}

.events-empty .hint {
  font-size: 12px;
  opacity: 0.8;
}
.events-content {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 12px;
  min-height: 240px;
}
.event-editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--muted-foreground);
  font-size: 13px;
  padding: var(--spacing-2xl);
}

/* ── 共用：状态徽标（列表条目与编辑器页头各一处） ──
 * 放在宿主单点定义再用 :deep() 贯穿：两处各自带一份会让规则数翻倍，
 * 而它们必须逐字一致（同一状态在两个位置不能是两种颜色）。 */
.events-section :deep(.event-state-badge) {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--surface-3, var(--card-elevated));
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 500;
}

.events-section :deep(.event-state-badge.state-active) {
  background: rgba(16, 185, 129, 0.12);
}
.events-section :deep(.event-state-badge.state-completed) {
  background: rgba(59, 130, 246, 0.12);
}
.events-section :deep(.event-state-badge.state-failed) {
  background: rgba(239, 68, 68, 0.12);
}

@media (max-width: 640px) {
  .events-content {
    grid-template-columns: 1fr;
  }
  .events-header {
    align-items: stretch;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .scene-select {
    font-size: 16px;
  }
}
</style>