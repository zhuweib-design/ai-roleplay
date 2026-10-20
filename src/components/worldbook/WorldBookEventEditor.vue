<script setup lang="ts">
/**
 * 世界书事件编辑器（R4-2 从 WorldBookEventsPanel 拆出）
 *
 * 所有字段走 `patchEvent`：写入被拒时**不让输入框回退**，而是留在原地标红并把
 * 原因挂在字段上（`rejectedFields`）。状态与 handler 都来自 useWorldBookEvents
 * 的模块级单例，与列表共用同一个选中事件。
 *
 * 唯一的 prop 是 `event`：宿主的 `v-if` 已经保证非空，收成 prop 是为了在模板里
 * 直接写 `event.name` 而不必每处都 `?.`（这也让 vue-tsc 不必为 null 分支做窄化）。
 */
import FormField from '@/components/common/FormField.vue';
import Icon from '@/components/common/Icon.vue';
import type { StoryEvent } from '@/core/event-types';
import { t } from '@/i18n';
import { useWorldBookEvents } from './useWorldBookEvents';

defineProps<{ event: StoryEvent }>();

const {
  rejectedFields,
  keywordText,
  triggerTypeOptions,
  sceneOptions,
  levelLabel,
  getEntryLevel,
  keywordsToString,
  stateLabel,
  stateColor,
  canTriggerSelected,
  formatEventTime,
  onEventNameInput,
  onEventDescriptionInput,
  onEventSceneChange,
  onTriggerTypeChange,
  onEventKeywordsInput,
  onEventUseRegexChange,
  onEventCaseSensitiveChange,
  onEventRequiredEventsInput,
  onEventProbabilityInput,
  onEventRepeatableChange,
  onEventManualOnlyChange,
  onEventCompletionKeywordsInput,
  triggerSelectedEvent,
  completeSelectedEvent,
  resetSelectedEvent,
  failSelectedEvent,
  deleteSelectedEvent,
} = useWorldBookEvents();
</script>

<template>
  <section class="event-editor-panel" :aria-label="t('wbEvents.editorAria')">
    <div class="event-editor-header">
      <h3>{{ event.name || t('wbEvents.unnamedEvent') }}</h3>
      <span
        class="event-state-badge"
        :class="`state-${event.state}`"
        :style="{ color: stateColor(event.state) }"
      >
        {{ stateLabel(event.state) }}
      </span>
    </div>

    <div class="event-editor-grid">
      <FormField
        label-key="wbEvents.nameLabel"
        :html-for="`evt-name-${event.id}`"
        :error-text="rejectedFields.name ? t('wbEvents.saveRejected', { reason: rejectedFields.name }) : undefined"
        polite
      >
        <template #default="{ describedBy, invalid }">
          <input
            :id="`evt-name-${event.id}`"
            type="text"
            class="form-input"
            :class="{ 'is-rejected': rejectedFields.name }"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
            :value="event.name"
            @input="onEventNameInput"
            :placeholder="t('wbEvents.namePlaceholder')"
            maxlength="50"
          />
        </template>
      </FormField>

      <div class="form-row">
        <label class="form-label" :for="`evt-scene-${event.id}`">{{ t('wbEvents.sceneLabel') }}</label>
        <select
          :id="`evt-scene-${event.id}`"
          class="form-select"
          :value="event.sceneEntryId ?? ''"
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

      <!-- 说明文字随触发方式而变，不是固定 i18n 键 ⇒ 用 hintText 走同一条
           aria-describedby 通道（原来这是个裸 span，读屏念标签时带不到它） -->
      <FormField
        label-key="wbEvents.triggerLabel"
        :html-for="`evt-trigger-${event.id}`"
        :hint-text="triggerTypeOptions.find((o) => o.value === event.trigger.type)?.desc"
      >
        <template #default="{ describedBy }">
          <select
            :id="`evt-trigger-${event.id}`"
            class="form-select"
            :value="event.trigger.type"
            :aria-describedby="describedBy"
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
        </template>
      </FormField>

      <div
        v-if="event.trigger.type === 'keyword'"
        class="form-row"
      >
        <!-- 单向绑定下 store 没收下这个值，框里却还写着：必须标出来 -->
        <FormField
          label-key="wbEvents.keywordLabel"
          :html-for="`evt-kw-${event.id}`"
          :error-text="rejectedFields.trigger ? t('wbEvents.saveRejected', { reason: rejectedFields.trigger }) : undefined"
          polite
        >
          <template #default="{ describedBy, invalid }">
            <input
              :id="`evt-kw-${event.id}`"
              type="text"
              class="form-input"
              :class="{ 'is-rejected': rejectedFields.trigger }"
              :aria-invalid="invalid"
              :aria-describedby="describedBy"
              :value="keywordText()"
              @input="onEventKeywordsInput"
              :placeholder="t('wbEvents.keywordPlaceholder')"
            />
          </template>
        </FormField>
        <div class="checkbox-row">
          <label>
            <input
              type="checkbox"
              :checked="event.trigger.useRegex"
              @change="onEventUseRegexChange"
            />
            <span>{{ t('wbEvents.useRegex') }}</span>
          </label>
          <label>
            <input
              type="checkbox"
              :checked="event.trigger.caseSensitive"
              @change="onEventCaseSensitiveChange"
            />
            <span>{{ t('wbEvents.caseSensitive') }}</span>
          </label>
        </div>
      </div>

      <div
        v-if="event.trigger.type === 'dependency'"
        class="form-row"
      >
        <FormField
          label-key="wbEvents.dependencyLabel"
          :html-for="`evt-dep-${event.id}`"
          hint-key="wbEvents.dependencyHint"
        >
          <template #default="{ describedBy }">
            <input
              :id="`evt-dep-${event.id}`"
              type="text"
              class="form-input"
              :value="keywordsToString(event.trigger.requiredEvents)"
              :aria-describedby="describedBy"
              @input="onEventRequiredEventsInput"
              :placeholder="t('wbEvents.dependencyPlaceholder')"
            />
          </template>
        </FormField>
      </div>

      <div class="form-row form-row-inline">
        <label class="form-label" :for="`evt-prob-${event.id}`">
          {{ t('wbEvents.probability', { percent: event.probability }) }}
        </label>
        <input
          :id="`evt-prob-${event.id}`"
          v-range
          type="range"
          class="tk-range"
          min="0"
          max="100"
          step="5"
          :value="event.probability"
          @input="onEventProbabilityInput"
        />
      </div>

      <div class="form-row form-row-inline">
        <label>
          <input
            type="checkbox"
            :checked="event.repeatable"
            @change="onEventRepeatableChange"
          />
          <span>{{ t('wbEvents.repeatable') }}</span>
        </label>
      </div>

      <div class="form-row">
        <FormField
          label-key="wbEvents.descLabel"
          :html-for="`evt-desc-${event.id}`"
          :error-text="rejectedFields.description ? t('wbEvents.saveRejected', { reason: rejectedFields.description }) : undefined"
          polite
        >
          <template #default="{ describedBy, invalid }">
            <textarea
              :id="`evt-desc-${event.id}`"
              class="form-textarea"
              :class="{ 'is-rejected': rejectedFields.description }"
              :aria-invalid="invalid"
              :aria-describedby="describedBy"
              :value="event.description"
              @input="onEventDescriptionInput"
              :placeholder="t('wbEvents.descPlaceholder')"
              rows="5"
              maxlength="2000"
            ></textarea>
          </template>
        </FormField>
      </div>

      <div class="form-row">
        <label class="form-label">{{ t('wbEvents.completionLabel') }}</label>
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="event.completion.manualOnly"
            @change="onEventManualOnlyChange"
          />
          <span>{{ t('wbEvents.completionManual') }}</span>
        </label>
        <!-- 改前它只有 placeholder：占位符一输入就消失，读屏与键盘用户拿不到字段名。
             现在标签与说明各归各位，和其它字段同一套外壳。 -->
        <FormField
          v-if="!event.completion.manualOnly"
          label-key="wbEvents.completionKeywordsLabel"
          :html-for="`evt-completion-kw-${event.id}`"
          hint-key="wbEvents.completionKeywordsHint"
        >
          <template #default="{ describedBy }">
            <input
              :id="`evt-completion-kw-${event.id}`"
              type="text"
              class="form-input"
              :value="keywordsToString(event.completion.keywords)"
              :aria-describedby="describedBy"
              @input="onEventCompletionKeywordsInput"
            />
          </template>
        </FormField>
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
            :disabled="event.state !== 'active'"
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
          {{ t('wbEvents.meta', { count: event.triggerCount, date: formatEventTime(event.createdAt) }) }}
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
</template>

<style scoped>
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
/* 写入被拒的字段：留在原地、标红、说清原因（不回退用户输入）。
   带 :focus 是因为 base.css 的 `input[type="text"]:focus` 会把边框染成主色，
   特异性比单一条 .is-rejected 高——不加这两条，"正在输入时"恰好看不到红色。 */
.is-rejected,
.is-rejected:focus,
.is-rejected:focus-visible {
  border-color: var(--destructive);
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
@media (hover: hover) and (pointer: fine) {
  .action-btn.trigger:hover:not(:disabled) {
    background: var(--success);
    color: var(--on-accent);
  }
}

.action-btn.complete {
  color: var(--tag-blue);
  border-color: var(--tag-blue);
}
@media (hover: hover) and (pointer: fine) {
  .action-btn.complete:hover:not(:disabled) {
    background: var(--tag-blue);
    color: var(--on-accent);
  }
}

.action-btn.reset {
  color: var(--muted-foreground);
  border-color: var(--border);
}
@media (hover: hover) and (pointer: fine) {
  .action-btn.reset:hover:not(:disabled) {
    background: var(--hover, rgba(255, 255, 255, 0.05));
  }
}

.action-btn.fail {
  color: var(--error-fg);
  border-color: var(--error);
}
@media (hover: hover) and (pointer: fine) {
  .action-btn.fail:hover:not(:disabled) {
    background: var(--error);
    color: var(--on-accent);
  }
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
</style>