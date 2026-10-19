<script setup lang="ts">
/**
 * CharacterEditorWorldBookSection — 需求7 角色↔世界书绑定（R2-1 从 CharacterEditorView 拆出）
 *
 * 两档形态：
 * - 编辑态：已绑定列表（可解绑）+ "添加绑定"下拉，改一次写一次 store；
 * - 新建态：全部世界书的勾选清单，**不立即写**——角色还没有 id，等创建成功后由宿主
 *   一次性绑上（`v-model:pending-ids` 就是这份待绑定清单）。
 *
 * 以前整段都在 `v-if="isEditMode"` 里，而新建角色恰恰是最需要选世界的时刻，
 * 于是新角色一律零绑定地出生。这一段就是那次修复的产物，别再把新建态藏起来。
 */
import { computed, ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { t } from '@/i18n';

const props = defineProps<{
  /** 编辑已有角色：走"已绑定 + 添加绑定"形态 */
  isEditMode: boolean;
  /** 编辑模式下的角色 id；新建态为空 */
  characterId?: string;
}>();

/** 新建态的待绑定清单（宿主在 createCharacter 之后一次性绑上） */
const pendingIds = defineModel<string[]>('pendingIds', { required: true });

const emit = defineEmits<{
  notify: [type: 'info' | 'success' | 'error', message: string];
}>();

const characterStore = useCharacterStore();
const lorebookStore = useLorebookStore();

/** 当前角色已绑定的世界书列表（编辑模式才有效） */
const boundWorldBooks = computed(() => {
  if (!props.characterId) return [];
  const ids = characterStore.getBoundWorldBookIds(props.characterId);
  return lorebookStore.lorebooks.filter((lb) => ids.includes(lb.id));
});

/** 尚未绑定的世界书列表（用于"添加绑定"下拉） */
const unboundWorldBooks = computed(() => {
  if (!props.characterId) return [];
  const ids = characterStore.getBoundWorldBookIds(props.characterId);
  return lorebookStore.lorebooks.filter((lb) => !ids.includes(lb.id));
});

/** 绑定选择框的当前值 */
const selectedBindId = ref('');

/** 新建态勾选清单（全部世界书） */
const allWorldBooks = computed(() => lorebookStore.lorebooks);

/** 绑定选中的世界书到当前角色 */
function bindSelectedWorldBook(): void {
  if (!props.characterId || !selectedBindId.value) return;
  const lb = lorebookStore.lorebooks.find((l) => l.id === selectedBindId.value);
  if (!lb) return;
  const changed = characterStore.bindWorldBook(props.characterId, selectedBindId.value);
  if (changed) {
    emit('notify', 'success', t('charEdit.boundWorldBook', { name: lb.name }));
  }
  selectedBindId.value = '';
}

/** 解绑指定世界书 */
function unbindWorldBook(worldBookId: string): void {
  if (!props.characterId) return;
  const lb = lorebookStore.lorebooks.find((l) => l.id === worldBookId);
  const changed = characterStore.unbindWorldBook(props.characterId, worldBookId);
  if (changed) {
    emit('notify', 'info', t('charEdit.unboundWorldBook', { name: lb?.name ?? worldBookId }));
  }
}
</script>

<template>
  <fieldset class="form-section">
    <legend class="section-title">{{ t('charEdit.wbTitle') }}</legend>
    <p class="field-hint">
      {{ isEditMode ? t('charEdit.wbHint') : t('charEdit.wbCreateHint') }}
    </p>

    <!-- 新建态：勾选项在角色创建成功的那一刻一次性绑上 -->
    <div
      v-if="!isEditMode"
      class="wb-pick-list"
      role="group"
      :aria-label="t('charEdit.wbPickAria')"
    >
      <label v-for="lb in allWorldBooks" :key="lb.id" class="wb-pick-item">
        <input v-model="pendingIds" type="checkbox" :value="lb.id" />
        <Icon name="book-open" :size="14" aria-hidden="true" />
        <span class="wb-bind-name">{{ lb.name }}</span>
        <span class="wb-bind-meta">{{ t('charEdit.wbEntryCount', { count: lb.entries.length }) }}</span>
      </label>
      <p v-if="!allWorldBooks.length" class="wb-bind-empty">{{ t('charEdit.wbNoWorldBook') }}</p>
    </div>
    <template v-else>
    <!-- 已绑定的世界书列表 -->
    <div v-if="boundWorldBooks.length" class="wb-bind-list" role="list" :aria-label="t('charEdit.wbBoundAria')">
      <div
        v-for="lb in boundWorldBooks"
        :key="lb.id"
        class="wb-bind-item"
        role="listitem"
      >
        <div class="wb-bind-info">
          <Icon name="book-open" :size="14" aria-hidden="true" />
          <span class="wb-bind-name">{{ lb.name }}</span>
          <span class="wb-bind-meta">{{ t('charEdit.wbEntryCount', { count: lb.entries.length }) }}</span>
        </div>
        <button
          type="button"
          class="wb-unbind-btn"
          :aria-label="t('charEdit.wbUnbindAria', { name: lb.name })"
          @click="unbindWorldBook(lb.id)"
        >
          <Icon name="close" :size="12" />
          <span>{{ t('charEdit.wbUnbind') }}</span>
        </button>
      </div>
    </div>
    <p v-else class="wb-bind-empty">{{ t('charEdit.wbEmpty') }}</p>

    <!-- 添加绑定 -->
    <div v-if="unboundWorldBooks.length" class="wb-add-bind">
      <label for="f-wb-select" class="field-label">{{ t('charEdit.wbAddLabel') }}</label>
      <div class="wb-add-row">
        <select
          id="f-wb-select"
          v-model="selectedBindId"
          class="field-input wb-select"
          :aria-label="t('charEdit.wbSelectAria')"
        >
          <option value="" disabled>{{ t('charEdit.wbSelectPlaceholder') }}</option>
          <option v-for="lb in unboundWorldBooks" :key="lb.id" :value="lb.id">
            {{ t('charEdit.wbEntryCount2', { name: lb.name, count: lb.entries.length }) }}
          </option>
        </select>
        <button
          type="button"
          class="wb-bind-btn"
          :disabled="!selectedBindId"
          :aria-disabled="!selectedBindId"
          :aria-label="t('charEdit.wbBindAria')"
          @click="bindSelectedWorldBook"
        >
          <Icon name="plus" :size="14" />
          <span>{{ t('charEdit.wbBind') }}</span>
        </button>
      </div>
    </div>
    <p v-else-if="boundWorldBooks.length" class="field-hint">
      {{ t('charEdit.wbAllBound') }}
    </p>
    </template>
  </fieldset>
</template>

<style scoped>
.form-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--card);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  padding: 0 4px;
}

.field-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

/* 与 FormField 的标签/说明同刻度：本页仍有 8 个字段块没接原语（温度、作者深度
   这类标签里带实时数值，原语还没有标签后缀插槽），先让两套排版看不出层级差 */
.field-label {
  font-size: 13px;
  color: var(--foreground);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-input {
  height: var(--size-control-md);
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
  width: 100%;
}

.field-input:focus-visible {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}

/* 需求7：世界书绑定面板 */
.wb-bind-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

/* 新建态的世界书勾选清单（创建成功后一次性绑定） */
.wb-pick-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

.wb-pick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.wb-pick-item input {
  /* 勾选框本身要够大才好点（手指端） */
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.wb-bind-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--card);
  transition: border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .wb-bind-item:hover {
    border-color: var(--primary);
  }
}

.wb-bind-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  min-width: 0;
}

.wb-bind-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-bind-meta {
  color: var(--muted-foreground);
  font-size: 0.85em;
  flex-shrink: 0;
}

.wb-unbind-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 0.85em;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}

@media (hover: hover) and (pointer: fine) {
  .wb-unbind-btn:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

.wb-unbind-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.wb-bind-empty {
  color: var(--muted-foreground);
  font-size: 0.9em;
  padding: 12px;
  text-align: center;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  margin: 12px 0;
}

.wb-add-bind {
  margin-top: 12px;
}

.wb-add-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.wb-select {
  flex: 1;
  min-width: 0;
}

.wb-bind-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 14px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.9em;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

@media (hover: hover) and (pointer: fine) {
  .wb-bind-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
}

.wb-bind-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wb-bind-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .wb-add-row {
    flex-direction: column;
  }
  .wb-bind-btn {
    justify-content: center;
    padding: 8px;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input {
    font-size: 16px;
  }
}
</style>
