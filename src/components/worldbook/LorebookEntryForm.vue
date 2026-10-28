<script setup lang="ts">
/**
 * LorebookEntryForm — 条目详情编辑表单（R1-3 从 WorldBookView 拆出）
 *
 * 表单值走 `currentEntry`（store 派生），编辑缓冲在 `useLorebookEntryForm`。
 *
 * 手机上本表单**满屏替换条目树**（互斥第三态）。那条"回头路"按钮要说目的地
 * （「← 条目列表」）而不是"返回"：同一个词在三级页面里指不了方向。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import type {
  LorebookEntry,
  LorebookStrategy,
  LorebookInsertionPosition,
  LorebookLogic,
} from '@/core/lorebook';

const props = defineProps<{
  entry: LorebookEntry;
  isMobile: boolean;
  strategyOptions: { value: LorebookStrategy; label: string; desc: string }[];
  positionOptions: { value: LorebookInsertionPosition; label: string }[];
  logicOptions: { value: LorebookLogic; label: string; desc: string }[];
  getEntryLevel: (entryId: string) => number;
  levelColor: (level: number) => string;
  levelLabel: (level: number) => string;
  keysToString: (keys: string[]) => string;
}>();

const emit = defineEmits<{
  closePane: [];
  titleInput: [e: Event];
  keysInput: [e: Event];
  contentInput: [e: Event];
  strategyChange: [e: Event];
  positionChange: [e: Event];
  logicChange: [e: Event];
  probabilityInput: [e: Event];
  orderInput: [e: Event];
  depthInput: [e: Event];
  groupInput: [e: Event];
  moveToTop: [];
  moveUp: [];
  moveDown: [];
  duplicate: [];
  remove: [];
}>();
</script>

<template>
  <form class="entry-form" @submit.prevent>
    <div class="entry-form-header">
      <!--
        手机档：条目表单满屏替换条目树之后，需要一条明确的回头路。
        它不说"返回"而说目的地（「← 条目列表」）——同一个词在三级页面里
        指不了方向。
      -->
      <button
        v-if="props.isMobile"
        type="button"
        class="m-swap__back wb-entry-back"
        @click="emit('closePane')"
      >
        <Icon name="arrow-left" :size="16" />
        <span>{{ t('wb.backToEntries') }}</span>
      </button>
      <h3>
        {{ props.entry.title || t('wb.unnamedEntry') }}
        <span
          class="form-level-badge"
          :style="{ color: props.levelColor(props.getEntryLevel(props.entry.id)) }"
        >
          {{ props.levelLabel(props.getEntryLevel(props.entry.id)) }}
        </span>
      </h3>
      <div class="entry-form-actions">
        <button
          type="button"
          class="action-btn"
          :aria-label="t('wb.moveToTop')"
          v-tip="t('wb.moveToTopTitle')"
          :disabled="props.getEntryLevel(props.entry.id) === 0"
          @click="emit('moveToTop')"
        >
          <Icon name="chevron-up" :size="14" />
          <span>{{ t('wb.top') }}</span>
        </button>
        <button
          type="button"
          class="action-btn"
          :aria-label="t('wb.moveUp')"
          v-tip="t('wb.moveUp')"
          @click="emit('moveUp')"
        >
          <Icon name="arrow-up" :size="14" />
        </button>
        <button
          type="button"
          class="action-btn"
          :aria-label="t('wb.moveDown')"
          v-tip="t('wb.moveDown')"
          @click="emit('moveDown')"
        >
          <Icon name="arrow-down" :size="14" />
        </button>
        <button
          type="button"
          class="action-btn duplicate"
          :aria-label="t('wb.duplicateEntry')"
          @click="emit('duplicate')"
        >
          <Icon name="copy" :size="14" />
          <span>{{ t('wb.duplicate') }}</span>
        </button>
        <button
          type="button"
          class="action-btn delete"
          :aria-label="t('wb.deleteEntry')"
          @click="emit('remove')"
        >
          <Icon name="trash-2" :size="14" />
          <span>{{ t('wb.delete') }}</span>
        </button>
      </div>
    </div>

    <div class="form-grid">
      <div class="form-row">
        <label class="form-label" :for="`entry-title-${props.entry.id}`">
          {{ t('wb.titleLabel') }}
        </label>
        <input
          :id="`entry-title-${props.entry.id}`"
          type="text"
          class="form-input"
          :value="props.entry.title"
          @input="emit('titleInput', $event)"
          :placeholder="t('wb.titlePlaceholder')"
        />
      </div>

      <div class="form-row">
        <label class="form-label" :for="`entry-keys-${props.entry.id}`">
          {{ t('wb.keysLabel') }}
        </label>
        <input
          :id="`entry-keys-${props.entry.id}`"
          type="text"
          class="form-input"
          :value="props.keysToString(props.entry.keys)"
          @input="emit('keysInput', $event)"
          :placeholder="t('wb.keysPlaceholder')"
        />
      </div>

      <div class="form-row">
        <label class="form-label" :for="`entry-content-${props.entry.id}`">
          {{ t('wb.contentLabel') }}
        </label>
        <textarea
          :id="`entry-content-${props.entry.id}`"
          class="form-textarea"
          :value="props.entry.content"
          @input="emit('contentInput', $event)"
          :placeholder="t('wb.contentPlaceholder')"
          rows="6"
        />
        <span class="char-count">
          {{ props.entry.content.length }} / 20000
        </span>
      </div>

      <div class="form-row form-row-3col">
        <div class="form-cell">
          <label class="form-label" :for="`entry-strategy-${props.entry.id}`">
            {{ t('wb.strategyLabel') }}
          </label>
          <select
            :id="`entry-strategy-${props.entry.id}`"
            class="form-select"
            :value="props.entry.strategy"
            @change="emit('strategyChange', $event)"
          >
            <option
              v-for="opt in props.strategyOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-cell">
          <label class="form-label" :for="`entry-position-${props.entry.id}`">
            {{ t('wb.positionLabel') }}
          </label>
          <select
            :id="`entry-position-${props.entry.id}`"
            class="form-select"
            :value="props.entry.insertionPosition"
            @change="emit('positionChange', $event)"
          >
            <option
              v-for="opt in props.positionOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-cell">
          <label class="form-label" :for="`entry-logic-${props.entry.id}`">
            {{ t('wb.logicLabel') }}
          </label>
          <select
            :id="`entry-logic-${props.entry.id}`"
            class="form-select"
            :value="props.entry.logic"
            @change="emit('logicChange', $event)"
          >
            <option
              v-for="opt in props.logicOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="form-row form-row-4col">
        <div class="form-cell">
          <label class="form-label" :for="`entry-prob-${props.entry.id}`">
            {{ t('wb.probability') }}
          </label>
          <input
            :id="`entry-prob-${props.entry.id}`"
            type="number"
            min="0"
            max="100"
            class="form-input"
            :value="props.entry.probability"
            @input="emit('probabilityInput', $event)"
            :disabled="props.entry.strategy !== 'probability'"
          />
        </div>

        <div class="form-cell">
          <label class="form-label" :for="`entry-order-${props.entry.id}`">
            {{ t('wb.insertionOrder') }}
          </label>
          <input
            :id="`entry-order-${props.entry.id}`"
            type="number"
            min="0"
            class="form-input"
            :value="props.entry.insertionOrder"
            @input="emit('orderInput', $event)"
          />
        </div>

        <div class="form-cell">
          <label class="form-label" :for="`entry-depth-${props.entry.id}`">
            {{ t('wb.depth') }}
          </label>
          <input
            :id="`entry-depth-${props.entry.id}`"
            type="number"
            min="0"
            class="form-input"
            :value="props.entry.depth"
            @input="emit('depthInput', $event)"
            :disabled="props.entry.insertionPosition !== 'atDepth'"
          />
        </div>

        <div class="form-cell">
          <label class="form-label" :for="`entry-group-${props.entry.id}`">
            {{ t('wb.group') }}
          </label>
          <input
            :id="`entry-group-${props.entry.id}`"
            type="text"
            class="form-input"
            :value="props.entry.group"
            @input="emit('groupInput', $event)"
            :placeholder="t('wb.groupPlaceholder')"
          />
        </div>
      </div>
    </div>
  </form>
</template>

<style scoped>
/* `.action-btn` 基类：scoped 到不了子组件内部，各消费者自带一份（值取自原定义） */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card-elevated);
  }
}

.action-btn.delete {
  color: var(--error-fg);
  border-color: var(--error);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    background: var(--error);
    color: var(--on-accent);
  }
}

.action-btn.duplicate {
  color: var(--secondary-text);
  border-color: var(--border);
}

.entry-form {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.entry-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.entry-form-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.entry-form-actions {
  display: flex;
  gap: 6px;
}

.form-level-badge {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  vertical-align: middle;
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* F17.3 随机事件行 */

.form-row-3col,
.form-row-4col {
  display: grid;
  gap: 12px;
}

.form-row-3col {
  grid-template-columns: repeat(3, 1fr);
}

.form-row-4col {
  grid-template-columns: repeat(4, 1fr);
}

.form-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.form-input,
.form-select,
.form-textarea {
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.form-input:disabled,
.form-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.char-count {
  font-size: 11px;
  color: var(--muted-foreground);
  align-self: flex-end;
}

@media (max-width: 1024px) {
  .form-row-3col,
  .form-row-4col {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  /* 表单头在手机上要能换行：返回按钮 + 标题 + 动作组一行放不下 */
  .entry-form-header {
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
  }
  .wb-entry-back {
    flex: 1 0 100%;
    justify-content: flex-start;
  }
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-input,
  .form-select,
  .form-textarea {
    font-size: 16px;
  }
}
</style>
