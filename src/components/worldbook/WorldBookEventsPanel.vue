<script setup lang="ts">
/**
 * WorldBookEventsPanel — 世界书「事件管理」面板（P2-7 拆分）
 *
 * 自 WorldBookView.vue 迁出：F17.1 事件列表 + 事件编辑器（触发条件/完成条件）。
 * 依赖 lorebook / events 两个 store，getEntryLevel / levelLabel 为本组件副本。
 */
import { ref, computed, watch } from 'vue';
import { useLorebookStore } from '@/stores/lorebook';
import { useEventsStore } from '@/stores/events';
import type {
  TriggerConditionType,
  TriggerCondition,
  CompletionCondition,
  EventState,
  StoryEvent,
} from '@/core/event-types';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import { t } from '@/i18n';

const store = useLorebookStore();
const eventsStore = useEventsStore();

const currentLorebook = computed(() => store.currentLorebook);

/**
 * 获取条目的层级深度（通过 parentId 链计算）
 */
function getEntryLevel(entryId: string): number {
  const lb = currentLorebook.value;
  if (!lb) return 0;
  let level = 0;
  const visited = new Set<string>([entryId]);
  let currentId = entryId;
  while (true) {
    const entry = lb.entries.find((e) => e.id === currentId);
    if (!entry) break;
    const parentId = entry.parentId ?? null;
    if (parentId === null || visited.has(parentId)) break;
    visited.add(parentId);
    level++;
    currentId = parentId;
    if (level > 10) break; // 防止异常循环
  }
  return level;
}

/**
 * 层级标签
 */
function levelLabel(level: number): string {
  switch (level) {
    case 0: return 'World';
    case 1: return 'Region';
    case 2: return 'Sub-area';
    default: return `L${level}`;
  }
}

// ── F17.1 事件管理 ──

const triggerTypeOptions: { value: TriggerConditionType; label: string; desc: string }[] = [
  { value: 'keyword', label: t('wbEvents.triggerKeyword'), desc: t('wbEvents.triggerKeywordDesc') },
  { value: 'dependency', label: t('wbEvents.triggerDependency'), desc: t('wbEvents.triggerDependencyDesc') },
  { value: 'manual', label: t('wbEvents.triggerManual'), desc: t('wbEvents.triggerManualDesc') },
];

const eventStateOptions: { value: EventState; label: string; color: string }[] = [
  { value: 'pending', label: t('wbEvents.statePending'), color: 'var(--muted-foreground)' },
  { value: 'active', label: t('wbEvents.stateActive'), color: 'var(--success)' },
  { value: 'completed', label: t('wbEvents.stateCompleted'), color: 'var(--tag-blue)' },
  { value: 'failed', label: t('wbEvents.stateFailed'), color: 'var(--error)' },
];

const selectedEventId = ref<string | null>(null);

const selectedEvent = computed<StoryEvent | null>(() => {
  if (!selectedEventId.value) return null;
  return eventsStore.getEvent(selectedEventId.value) ?? null;
});

// 当前 Lorebook 下可作为事件绑定场景的条目（Region / Sub-area，即 level>=1）
const sceneOptions = computed(() => {
  const lb = currentLorebook.value;
  if (!lb) return [];
  return lb.entries.filter((e) => getEntryLevel(e.id) >= 1);
});

// 监听 currentLorebook 同步到 eventsStore
watch(
  () => currentLorebook.value?.id,
  (id) => {
    eventsStore.setCurrentLorebook(id ?? null);
    selectedEventId.value = null;
  },
  { immediate: true }
);

// 监听 eventsStore 错误/提示
watch(
  () => eventsStore.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);
watch(
  () => eventsStore.lastInfo,
  (info) => {
    if (info) showToast('success', info);
  }
);

function stateLabel(state: EventState): string {
  return eventStateOptions.find((o) => o.value === state)?.label ?? state;
}

function stateColor(state: EventState): string {
  return eventStateOptions.find((o) => o.value === state)?.color ?? 'var(--muted-foreground)';
}

function triggerTypeLabel(t: TriggerConditionType): string {
  return triggerTypeOptions.find((o) => o.value === t)?.label ?? t;
}

function getSceneName(sceneEntryId: string | null): string {
  if (sceneEntryId === null) return t('wbEvents.globalScene');
  const lb = currentLorebook.value;
  if (!lb) return t('wbEvents.unknownScene');
  const entry = lb.entries.find((e) => e.id === sceneEntryId);
  return entry?.title ?? t('wbEvents.unknownScene');
}

function keywordsToString(keywords: string[] | undefined): string {
  return (keywords ?? []).join(', ');
}

function createNewGlobalEvent() {
  if (!currentLorebook.value) return;
  const id = eventsStore.createEvent(currentLorebook.value.id, null, null);
  if (id) {
    selectedEventId.value = id;
  }
}

function createNewEventForScene(sceneEntryId: string) {
  if (!currentLorebook.value) return;
  const sceneName = getSceneName(sceneEntryId);
  const id = eventsStore.createEvent(currentLorebook.value.id, sceneEntryId, sceneName);
  if (id) {
    selectedEventId.value = id;
  }
}

function selectEvent(id: string) {
  selectedEventId.value = id;
}

function deleteSelectedEvent() {
  if (!selectedEventId.value) return;
  eventsStore.deleteEvent(selectedEventId.value);
  selectedEventId.value = null;
}

function onEventNameInput(e: Event) {
  if (!selectedEvent.value) return;
  eventsStore.updateEvent(selectedEvent.value.id, { name: (e.target as HTMLInputElement).value });
}

function onEventDescriptionInput(e: Event) {
  if (!selectedEvent.value) return;
  eventsStore.updateEvent(selectedEvent.value.id, { description: (e.target as HTMLTextAreaElement).value });
}

function onEventSceneChange(e: Event) {
  if (!selectedEvent.value) return;
  const raw = (e.target as HTMLSelectElement).value;
  const sceneEntryId = raw === '' ? null : raw;
  const sceneName = sceneEntryId === null ? null : getSceneName(sceneEntryId);
  eventsStore.updateEvent(selectedEvent.value.id, { sceneEntryId, sceneName });
}

function onTriggerTypeChange(e: Event) {
  if (!selectedEvent.value) return;
  const type = (e.target as HTMLSelectElement).value as TriggerConditionType;
  let trigger: TriggerCondition;
  if (type === 'keyword') {
    trigger = { type: 'keyword', keywords: [], useRegex: false, caseSensitive: false };
  } else if (type === 'dependency') {
    trigger = { type: 'dependency', requiredEvents: [] };
  } else if (type === 'manual') {
    trigger = { type: 'manual' };
  } else {
    trigger = { type: 'time', storyTime: '' };
  }
  eventsStore.updateEvent(selectedEvent.value.id, { trigger });
}

function onEventKeywordsInput(e: Event) {
  if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'keyword') return;
  const raw = (e.target as HTMLInputElement).value;
  const keywords = raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
  eventsStore.updateEvent(selectedEvent.value.id, {
    trigger: { ...selectedEvent.value.trigger, keywords },
  });
}

function onEventUseRegexChange(e: Event) {
  if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'keyword') return;
  eventsStore.updateEvent(selectedEvent.value.id, {
    trigger: { ...selectedEvent.value.trigger, useRegex: (e.target as HTMLInputElement).checked },
  });
}

function onEventCaseSensitiveChange(e: Event) {
  if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'keyword') return;
  eventsStore.updateEvent(selectedEvent.value.id, {
    trigger: { ...selectedEvent.value.trigger, caseSensitive: (e.target as HTMLInputElement).checked },
  });
}

function onEventRequiredEventsInput(e: Event) {
  if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'dependency') return;
  const raw = (e.target as HTMLInputElement).value;
  const requiredEvents = raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
  eventsStore.updateEvent(selectedEvent.value.id, {
    trigger: { ...selectedEvent.value.trigger, requiredEvents },
  });
}

function onEventProbabilityInput(e: Event) {
  if (!selectedEvent.value) return;
  const value = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(value)) eventsStore.updateEvent(selectedEvent.value.id, { probability: value });
}

function onEventRepeatableChange(e: Event) {
  if (!selectedEvent.value) return;
  eventsStore.updateEvent(selectedEvent.value.id, { repeatable: (e.target as HTMLInputElement).checked });
}

function onEventManualOnlyChange(e: Event) {
  if (!selectedEvent.value) return;
  const manualOnly = (e.target as HTMLInputElement).checked;
  const completion: CompletionCondition = manualOnly
    ? { manualOnly: true }
    : { manualOnly: false, keywords: [], useRegex: false };
  eventsStore.updateEvent(selectedEvent.value.id, { completion });
}

function onEventCompletionKeywordsInput(e: Event) {
  if (!selectedEvent.value) return;
  const raw = (e.target as HTMLInputElement).value;
  const keywords = raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
  const completion: CompletionCondition = {
    manualOnly: false,
    keywords,
    useRegex: selectedEvent.value.completion.useRegex ?? false,
  };
  eventsStore.updateEvent(selectedEvent.value.id, { completion });
}

function triggerSelectedEvent() {
  if (!selectedEvent.value) return;
  eventsStore.triggerEvent(selectedEvent.value.id);
}

function completeSelectedEvent() {
  if (!selectedEvent.value) return;
  eventsStore.completeEvent(selectedEvent.value.id);
}

function resetSelectedEvent() {
  if (!selectedEvent.value) return;
  eventsStore.resetEvent(selectedEvent.value.id);
}

function failSelectedEvent() {
  if (!selectedEvent.value) return;
  eventsStore.failEvent(selectedEvent.value.id);
}

/** 顶部"为场景添加事件"下拉：选中场景后创建事件并重置 */
function onNewEventSceneChange(e: Event) {
  const select = e.target as HTMLSelectElement;
  const sceneEntryId = select.value;
  if (sceneEntryId === '') return;
  createNewEventForScene(sceneEntryId);
  select.value = '';
}

/** 当前选中事件是否可手动触发 */
const canTriggerSelected = computed(() => {
  const evt = selectedEvent.value;
  if (!evt) return false;
  if (evt.state === 'pending') return true;
  if (evt.state === 'completed' && evt.repeatable) return true;
  return false;
});

function formatEventTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}


// ── Toast（自包含） ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}
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

              <section
                v-if="selectedEvent"
                class="event-editor-panel"
                :aria-label="t('wbEvents.editorAria')"
              >
                <div class="event-editor-header">
                  <h3>{{ selectedEvent.name || t('wbEvents.unnamedEvent') }}</h3>
                  <span
                    class="event-state-badge"
                    :class="`state-${selectedEvent.state}`"
                    :style="{ color: stateColor(selectedEvent.state) }"
                  >
                    {{ stateLabel(selectedEvent.state) }}
                  </span>
                </div>

                <div class="event-editor-grid">
                  <div class="form-row">
                    <label class="form-label" :for="`evt-name-${selectedEvent.id}`">{{ t('wbEvents.nameLabel') }}</label>
                    <input
                      :id="`evt-name-${selectedEvent.id}`"
                      type="text"
                      class="form-input"
                      :value="selectedEvent.name"
                      @input="onEventNameInput"
                      :placeholder="t('wbEvents.namePlaceholder')"
                      maxlength="50"
                    />
                  </div>

                  <div class="form-row">
                    <label class="form-label" :for="`evt-scene-${selectedEvent.id}`">{{ t('wbEvents.sceneLabel') }}</label>
                    <select
                      :id="`evt-scene-${selectedEvent.id}`"
                      class="form-select"
                      :value="selectedEvent.sceneEntryId ?? ''"
                      @change="onEventSceneChange"
                    >
                      <option value="">{{ t('wbEvents.sceneGlobal') }}</option>
                      <option
                        v-for="entry in sceneOptions"
                        :key="entry.id"
                        :value="entry.id"
                      >
                        {{ t('wbEvents.sceneEntry', { title: entry.title, level: levelLabel(getEntryLevel(entry.id)) }) }}
                      </option>
                    </select>
                  </div>

                  <div class="form-row">
                    <label class="form-label" :for="`evt-trigger-${selectedEvent.id}`">{{ t('wbEvents.triggerLabel') }}</label>
                    <select
                      :id="`evt-trigger-${selectedEvent.id}`"
                      class="form-select"
                      :value="selectedEvent.trigger.type"
                      @change="onTriggerTypeChange"
                    >
                      <option
                        v-for="opt in triggerTypeOptions"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                    <span class="form-hint">
                      {{ triggerTypeOptions.find((o) => o.value === selectedEvent?.trigger.type)?.desc }}
                    </span>
                  </div>

                  <div
                    v-if="selectedEvent && selectedEvent.trigger.type === 'keyword'"
                    class="form-row"
                  >
                    <label class="form-label" :for="`evt-kw-${selectedEvent.id}`">
                      {{ t('wbEvents.keywordLabel') }}
                    </label>
                    <input
                      :id="`evt-kw-${selectedEvent.id}`"
                      type="text"
                      class="form-input"
                      :value="keywordsToString(selectedEvent.trigger.keywords)"
                      @input="onEventKeywordsInput"
                      :placeholder="t('wbEvents.keywordPlaceholder')"
                    />
                    <div class="checkbox-row">
                      <label>
                        <input
                          type="checkbox"
                          :checked="selectedEvent.trigger.useRegex"
                          @change="onEventUseRegexChange"
                        />
                        <span>{{ t('wbEvents.useRegex') }}</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          :checked="selectedEvent.trigger.caseSensitive"
                          @change="onEventCaseSensitiveChange"
                        />
                        <span>{{ t('wbEvents.caseSensitive') }}</span>
                      </label>
                    </div>
                  </div>

                  <div
                    v-if="selectedEvent && selectedEvent.trigger.type === 'dependency'"
                    class="form-row"
                  >
                    <label class="form-label" :for="`evt-dep-${selectedEvent.id}`">
                      {{ t('wbEvents.dependencyLabel') }}
                    </label>
                    <input
                      :id="`evt-dep-${selectedEvent.id}`"
                      type="text"
                      class="form-input"
                      :value="keywordsToString(selectedEvent.trigger.requiredEvents)"
                      @input="onEventRequiredEventsInput"
                      :placeholder="t('wbEvents.dependencyPlaceholder')"
                    />
                    <span class="form-hint">
                      {{ t('wbEvents.dependencyHint') }}
                    </span>
                  </div>

                  <div class="form-row form-row-inline">
                    <label class="form-label" :for="`evt-prob-${selectedEvent.id}`">
                      {{ t('wbEvents.probability', { percent: selectedEvent.probability }) }}
                    </label>
                    <input
                      :id="`evt-prob-${selectedEvent.id}`"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      :value="selectedEvent.probability"
                      @input="onEventProbabilityInput"
                    />
                  </div>

                  <div class="form-row form-row-inline">
                    <label>
                      <input
                        type="checkbox"
                        :checked="selectedEvent.repeatable"
                        @change="onEventRepeatableChange"
                      />
                      <span>{{ t('wbEvents.repeatable') }}</span>
                    </label>
                  </div>

                  <div class="form-row">
                    <label class="form-label" :for="`evt-desc-${selectedEvent.id}`">
                      {{ t('wbEvents.descLabel') }}
                    </label>
                    <textarea
                      :id="`evt-desc-${selectedEvent.id}`"
                      class="form-textarea"
                      :value="selectedEvent.description"
                      @input="onEventDescriptionInput"
                      :placeholder="t('wbEvents.descPlaceholder')"
                      rows="5"
                      maxlength="2000"
                    ></textarea>
                  </div>

                  <div class="form-row">
                    <label class="form-label">{{ t('wbEvents.completionLabel') }}</label>
                    <label class="checkbox-label">
                      <input
                        type="checkbox"
                        :checked="selectedEvent.completion.manualOnly"
                        @change="onEventManualOnlyChange"
                      />
                      <span>{{ t('wbEvents.completionManual') }}</span>
                    </label>
                    <input
                      v-if="selectedEvent && !selectedEvent.completion.manualOnly"
                      type="text"
                      class="form-input"
                      :value="keywordsToString(selectedEvent.completion.keywords)"
                      @input="onEventCompletionKeywordsInput"
                      :placeholder="t('wbEvents.completionPlaceholder')"
                    />
                  </div>

                  <div class="form-row state-row">
                    <span class="form-label">{{ t('wbEvents.stateActions') }}</span>
                    <div class="event-state-actions">
                      <button
                        type="button"
                        class="action-btn trigger"
                        :disabled="!canTriggerSelected"
                        @click="triggerSelectedEvent"
                      >
                        {{ t('wbEvents.triggerBtn') }}
                      </button>
                      <button
                        type="button"
                        class="action-btn complete"
                        :disabled="selectedEvent.state !== 'active'"
                        @click="completeSelectedEvent"
                      >
                        {{ t('wbEvents.completeBtn') }}
                      </button>
                      <button
                        type="button"
                        class="action-btn reset"
                        @click="resetSelectedEvent"
                      >
                        {{ t('wbEvents.resetBtn') }}
                      </button>
                      <button
                        type="button"
                        class="action-btn fail"
                        @click="failSelectedEvent"
                      >
                        {{ t('wbEvents.failBtn') }}
                      </button>
                    </div>
                  </div>

                  <div class="form-row form-row-actions">
                    <span class="form-meta">
                      {{ t('wbEvents.meta', { count: selectedEvent.triggerCount, date: formatEventTime(selectedEvent.createdAt) }) }}
                    </span>
                    <button
                      type="button"
                      class="action-btn delete"
                      @click="deleteSelectedEvent"
                    >
                      <Icon name="trash-2" :size="14" />
                      <span>{{ t('wbEvents.deleteEvent') }}</span>
                    </button>
                  </div>
                </div>
              </section>

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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
  background: var(--border);
  color: var(--muted-foreground);
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

.event-item:hover {
  background: var(--hover, rgba(255, 255, 255, 0.05));
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

.event-state-badge {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--surface-3, var(--card-elevated));
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 500;
}

.event-state-badge.state-active {
  background: rgba(16, 185, 129, 0.12);
}
.event-state-badge.state-completed {
  background: rgba(59, 130, 246, 0.12);
}
.event-state-badge.state-failed {
  background: rgba(239, 68, 68, 0.12);
}

.event-editor-panel {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-1, var(--bg-default));
  padding: var(--spacing-md);
  overflow-y: auto;
  max-height: 600px;
}

.event-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border);
}

.event-editor-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--foreground);
}

.event-editor-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-editor-grid .form-row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.event-editor-grid .form-row-inline {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.event-editor-grid .form-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.event-editor-grid .form-hint {
  font-size: 11px;
  color: var(--muted-foreground);
}

.checkbox-row {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.checkbox-row label,
.checkbox-label,
.event-editor-grid .form-row-inline label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.state-row {
  flex-direction: row !important;
  align-items: center;
  gap: 12px;
  padding: var(--spacing-sm) 12px;
  background: var(--surface-3, var(--card-elevated));
  border-radius: 6px;
}

.event-state-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.action-btn.trigger {
  color: var(--success);
  border-color: var(--success);
}
.action-btn.trigger:hover:not(:disabled) {
  background: var(--success);
  color: var(--on-accent);
}

.action-btn.complete {
  color: var(--tag-blue);
  border-color: var(--tag-blue);
}
.action-btn.complete:hover:not(:disabled) {
  background: var(--tag-blue);
  color: var(--on-accent);
}

.action-btn.reset {
  color: var(--muted-foreground);
  border-color: var(--border);
}
.action-btn.reset:hover:not(:disabled) {
  background: var(--hover, rgba(255, 255, 255, 0.05));
}

.action-btn.fail {
  color: var(--error);
  border-color: var(--error);
}
.action-btn.fail:hover:not(:disabled) {
  background: var(--error);
  color: var(--on-accent);
}

.form-row-actions {
  flex-direction: row !important;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--spacing-xs);
}

.form-meta {
  font-size: 11px;
  color: var(--muted-foreground);
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

@media (max-width: 640px) {
  .events-content {
    grid-template-columns: 1fr;
  }
  .events-list-panel {
    max-height: 240px;
  }
  .events-header {
    align-items: stretch;
  }
}

/* 条目布局 */
.entries-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: 0;
  overflow: hidden;
}

.entries-list-panel {
  border-right: 1px solid var(--border);
  background: var(--card);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

</style>
