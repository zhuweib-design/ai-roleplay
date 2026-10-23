<script setup lang="ts">
/**
 * StoryImportModal — 把分析结果导入世界书/角色/事件（F16.2，R1-2 从 StoryEngineView 拆出）
 *
 * 这块的六个分类、冲突策略、目标世界书、导入结果全部只服务这一个弹窗，
 * 留在视图里会让视图多出 11 个 ref 和 8 个只在这里用的 helper。
 * 写操作走 storyStore 的 import*，结果用 `notify` 交给父级弹 Toast。
 */
import { computed, ref, watch } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import { useStoryStore } from '@/stores/story';
import { useLorebookStore } from '@/stores/lorebook';
import type { ImportConflictStrategy, ImportResult, StoryAnalysisResult } from '@core/story-types';
import type { ToastKind } from '@/composables/useStoryGeneration';

const props = defineProps<{
  open: boolean;
  /** 目标故事（null 时弹窗内容为空，与拆分前 `v-if="importTargetStory"` 一致） */
  story: StoryAnalysisResult | null;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  notify: [type: ToastKind, message: string];
}>();

const store = useStoryStore();
const lorebookStore = useLorebookStore();

const importCategory = ref<'all' | 'world' | 'scenes' | 'characters' | 'events' | 'scripts'>('all');
const importStrategy = ref<ImportConflictStrategy>('add');
const importLorebookId = ref<string>('');
const importResults = ref<ImportResult[]>([]);
const importResultsVisible = ref(false);

const availableLorebooks = computed(() => lorebookStore.lorebooks);

const canImport = computed(() => {
  if (!props.story) return false;
  if (importCategory.value === 'world') return !!props.story.worldInfo;
  if (importCategory.value === 'scenes') return props.story.scenes.length > 0;
  if (importCategory.value === 'characters') return props.story.characters.length > 0;
  if (importCategory.value === 'events') return props.story.events.length > 0;
  if (importCategory.value === 'scripts') return props.story.scripts.length > 0;
  return true;
});

const needsLorebook = computed(() =>
  importCategory.value === 'all' ||
  importCategory.value === 'world' ||
  importCategory.value === 'scenes' ||
  importCategory.value === 'events'
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    importCategory.value = 'all';
    importStrategy.value = 'add';
    importResults.value = [];
    importResultsVisible.value = false;
    // 默认选择第一个 Lorebook
    importLorebookId.value = availableLorebooks.value[0]?.id ?? '';
  }
);

function close(): void {
  emit('update:open', false);
}

async function handleImport(): Promise<void> {
  if (!props.story) return;
  const storyId = props.story.id;

  if (importCategory.value === 'scripts') {
    await store.exportScripts(storyId);
    // 用户在系统保存面板里取消 ⇒ lastInfo 不会被写，这里也不会弹"已导出"
    if (store.lastInfo) emit('notify', 'success', store.lastInfo);
    close();
    return;
  }

  if (needsLorebook.value && !importLorebookId.value) {
    emit('notify', 'error', t('story.needLorebook'));
    return;
  }

  const lbId = importLorebookId.value;
  const strategy = importStrategy.value;
  let results: ImportResult[] = [];

  switch (importCategory.value) {
    case 'world':
      results = store.importWorld(storyId, lbId, strategy);
      break;
    case 'scenes':
      results = store.importScenes(storyId, lbId, strategy);
      break;
    case 'characters':
      results = store.importCharacters(storyId, strategy);
      break;
    case 'events':
      results = store.importEvents(storyId, lbId, strategy);
      break;
    case 'all':
      results = store.importAll(storyId, lbId, strategy);
      break;
  }

  importResults.value = results;
  importResultsVisible.value = true;

  if (store.lastInfo) emit('notify', 'success', store.lastInfo);
  if (store.lastError) emit('notify', 'error', store.lastError);
}

function getImportCategoryLabel(cat: typeof importCategory.value): string {
  const labels: Record<typeof importCategory.value, string> = {
    all: t('story.catAll'),
    world: t('story.catWorld'),
    scenes: t('story.catScenes'),
    characters: t('story.catCharacters'),
    events: t('story.catEvents'),
    scripts: t('story.catScripts'),
  };
  return labels[cat] ?? cat;
}

function getStrategyLabel(s: ImportConflictStrategy): string {
  const labels: Record<ImportConflictStrategy, string> = {
    add: t('story.strategyAdd'),
    overwrite: t('story.strategyOverwrite'),
    merge: t('story.strategyMerge'),
  };
  return labels[s] ?? s;
}

function getResultLabel(type: ImportResult['type']): string {
  const labels: Record<ImportResult['type'], string> = {
    character: t('story.resultTypeChar'),
    lorebook: t('story.resultTypeLorebook'),
    event: t('story.resultTypeEvent'),
    scene: t('story.resultTypeScene'),
  };
  return labels[type] ?? type;
}

function isCategoryAvailable(cat: typeof importCategory.value): boolean {
  const story = props.story;
  if (!story) return false;
  if (cat === 'all') return story.status === 'completed';
  if (cat === 'world') return !!story.worldInfo;
  if (cat === 'scenes') return story.scenes.length > 0;
  if (cat === 'characters') return story.characters.length > 0;
  if (cat === 'events') return story.events.length > 0;
  if (cat === 'scripts') return story.scripts.length > 0;
  return false;
}

function getCategoryCount(cat: typeof importCategory.value): number {
  const story = props.story;
  if (!story) return 0;
  if (cat === 'world') return story.worldInfo ? 1 : 0;
  if (cat === 'scenes') return story.scenes.length;
  if (cat === 'characters') return story.characters.length;
  if (cat === 'events') return story.events.length;
  if (cat === 'scripts') return story.scripts.length;
  return 0;
}
</script>

<template>
  <Modal
    :model-value="open"
    :title="t('story.importTitle')"
    :aria-label="t('story.importAria2')"
    @update:model-value="emit('update:open', $event)"
  >
    <div v-if="story" class="import-content">
      <!-- 导入分类选择 -->
      <fieldset class="import-fieldset">
        <legend>{{ t('story.importCategory') }}</legend>
        <div class="category-grid">
          <label
            v-for="cat in (['all', 'world', 'scenes', 'characters', 'events', 'scripts'] as const)"
            :key="cat"
            class="category-option"
            :class="{ disabled: !isCategoryAvailable(cat) }"
          >
            <input
              type="radio"
              name="importCategory"
              :value="cat"
              v-model="importCategory"
              :disabled="!isCategoryAvailable(cat)"
            />
            <span class="cat-label">{{ getImportCategoryLabel(cat) }}</span>
            <span class="cat-count">{{ getCategoryCount(cat) }}</span>
          </label>
        </div>
      </fieldset>

      <!-- Lorebook 选择（世界/场景/事件/全部需要） -->
      <div v-if="needsLorebook && importCategory !== 'scripts'" class="form-row">
        <label for="importLorebook" class="form-label">{{ t('story.targetLorebook') }}</label>
        <select
          id="importLorebook"
          v-model="importLorebookId"
          class="form-select"
        >
          <option value="" disabled>{{ t('story.selectLorebook') }}</option>
          <option v-for="lb in availableLorebooks" :key="lb.id" :value="lb.id">
            {{ t('story.lorebookEntryCount', { name: lb.name || t('story.unnamedLorebook'), count: lb.entries.length }) }}
          </option>
        </select>
        <p v-if="availableLorebooks.length === 0" class="form-hint">
          {{ t('story.noLorebookHint') }}
        </p>
      </div>

      <!-- 冲突处理策略（脚本导出不需要） -->
      <fieldset v-if="importCategory !== 'scripts'" class="import-fieldset">
        <legend>{{ t('story.strategyLegend') }}</legend>
        <div class="strategy-options">
          <label
            v-for="s in (['add', 'overwrite', 'merge'] as const)"
            :key="s"
            class="strategy-option"
          >
            <input type="radio" name="importStrategy" :value="s" v-model="importStrategy" />
            <span>{{ getStrategyLabel(s) }}</span>
          </label>
        </div>
      </fieldset>

      <!-- 脚本导出提示 -->
      <div v-if="importCategory === 'scripts'" class="script-export-hint">
        <Icon name="info" :size="16" />
        <span>{{ t('story.scriptExportHint') }}</span>
      </div>

      <!-- 导入结果 -->
      <div v-if="importResultsVisible && importResults.length > 0" class="import-results">
        <h4 class="results-title">{{ t('story.resultsTitle') }}</h4>
        <ul class="results-list">
          <li
            v-for="(r, idx) in importResults"
            :key="idx"
            class="result-item"
            :class="{ success: r.success, failed: !r.success }"
          >
            <Icon :name="r.success ? 'check' : 'close'" :size="14" />
            <span class="result-type">{{ getResultLabel(r.type) }}</span>
            <span class="result-name">{{ r.name }}</span>
            <span v-if="r.error" class="result-error">{{ r.error }}</span>
          </li>
        </ul>
      </div>

      <!-- 操作按钮 -->
      <!-- O-19：目标未选时按钮为禁用态，补一行可见解释（原观察：点了没反应） -->
      <p v-if="needsLorebook && !importLorebookId" class="form-hint">
        {{ t('story.needLorebook') }}
      </p>

      <div class="import-actions">
        <button type="button" class="btn btn-secondary" @click="close">
          {{ t('story.close') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!canImport || (needsLorebook && !importLorebookId)"
          @click="handleImport"
        >
          {{ importResultsVisible ? t('story.reimport') : t('story.execImport') }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.import-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.import-fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin: 0;
}

.import-fieldset legend {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
  padding: 0 6px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.category-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.15s, background-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .category-option:hover:not(.disabled) {
    border-color: var(--secondary);
    background: color-mix(in srgb, var(--secondary) 8%, transparent);
  }
}

.category-option.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.category-option input[type="radio"] {
  margin: 0;
}

.cat-label {
  flex: 1;
}

.cat-count {
  font-size: 11px;
  color: var(--muted-foreground);
  background: var(--card-elevated);
  padding: 1px 6px;
  border-radius: 10px;
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.strategy-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
}

.strategy-option input[type="radio"] {
  margin: 0;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.form-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
}

.form-select:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.form-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 2px 0 0;
}

.script-export-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--foreground);
}

.import-results {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.results-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/*
 * 补位：拆分前这个类名在同一个 <style> 里被定义了两次——这里一段（display:flex），
 * 文件末尾「一键生成」那段又写了一次（display:inline-flex）。后者靠顺序胜出，
 * 所以导入结果的真实取值是 inline-flex。拆分后两段分属两个组件、不再互相覆盖，
 * 这里按**有效值**写 inline-flex，其余声明与原来一致。
 */
.result-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
}

.result-item.success {
  color: var(--success-fg, #4ade80);
}

.result-item.failed {
  color: var(--error-fg, #f87171);
}

.result-type {
  font-weight: 600;
  min-width: 32px;
}

.result-name {
  flex: 1;
}

.result-error {
  color: var(--muted-foreground);
  font-style: italic;
}

.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

/* 按钮三件套（全仓惯例：每个视图自带一份） */

@media (hover: hover) and (pointer: fine) {
  .btn:hover:not(:disabled) {
    background: var(--card-elevated);
  }
}

@media (hover: hover) and (pointer: fine) {
  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover, var(--primary));
  }
}

@media (max-width: 640px) {
  .category-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-select {
    font-size: 16px;
  }
}
</style>
