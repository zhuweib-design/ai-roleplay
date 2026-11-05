<script setup lang="ts">
/**
 * StoryProtagonistModal — 主角配置（F16.3，R1-2 从 StoryEngineView 拆出）
 *
 * 表单的 11 个 ref、三种进入方式（已有配置 / 从某个人物"设为主角" / 空白新建）、
 * 校验与落库全在这里。父级只负责"打开给谁"和"保存完弹个 Toast"。
 *
 * 故事主角是**故事内容**，不是全局用户 Persona：保存成功后要清掉旧版本留下的
 * personaId 关联（这条规则随代码一起搬过来，别在别处再写一遍）。
 */
import { computed, ref, watch } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import { useStoryStore } from '@/stores/story';
import {
  validateProtagonist,
  addRelation as addRelationCore,
  removeRelation as removeRelationCore,
  MAX_PROTAGONIST_NAME_LENGTH,
  MAX_PROTAGONIST_DESCRIPTION_LENGTH,
  MAX_RELATION_DESC_LENGTH,
  MAX_RELATIONS_COUNT,
} from '@core/protagonist';
import type {
  ProtagonistConfig,
  ProtagonistRelation,
  ProtagonistRole,
  StoryAnalysisResult,
} from '@core/story-types';
import type { ToastKind } from '@/composables/useStoryGeneration';

const props = defineProps<{
  open: boolean;
  /** 目标故事（null 时表单不渲染，与拆分前 `v-if="protagonistTargetStory"` 一致） */
  story: StoryAnalysisResult | null;
  /** 从人物卡片"设为主角"进入时的预填名 */
  presetCharacterName?: string | null;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  /** 保存成功 */
  saved: [];
  notify: [type: ToastKind, message: string];
}>();

const store = useStoryStore();

/** 表单模式：'existing' 从故事人物选 / 'custom' 自定义 */
const formMode = ref<'existing' | 'custom'>('existing');
/** 选中的故事人物名（mode='existing' 时） */
const selectedCharName = ref<string>('');
const role = ref<ProtagonistRole>('protagonist');
const name = ref<string>('');
const description = ref<string>('');
const startingScene = ref<string>('');
const relations = ref<ProtagonistRelation[]>([]);
const newRelationTarget = ref<string>('');
const newRelationDesc = ref<string>('');
const formErrors = ref<string[]>([]);

/** 故事中可选的人物列表（用于 mode='existing' 的下拉选择） */
const characterOptions = computed(() => props.story?.characters.map((c) => c.name) ?? []);
/** 故事中可选的场景列表（用于起始场景下拉） */
const sceneOptions = computed(() => props.story?.scenes.map((s) => s.name) ?? []);
/** 新增关系时可选的目标人物名（来自故事人物，但允许自定义外部角色） */
const relationTargetOptions = computed(() => props.story?.characters.map((c) => c.name) ?? []);

/** 当前编辑的主角表单（合并状态） */
const formDraft = computed<ProtagonistConfig | null>(() => {
  if (!props.story) return null;
  const now = Date.now();
  const draftName = formMode.value === 'existing' ? selectedCharName.value : name.value;
  if (!draftName) return null;
  return {
    role: role.value,
    source: formMode.value,
    name: draftName,
    description: description.value,
    startingScene: startingScene.value || undefined,
    relations: relations.value,
    personaId: null,
    createdAt: now,
    updatedAt: now,
  };
});

/** 是否可保存（基本合法性预检） */
const canSave = computed(() => {
  if (!formDraft.value) return false;
  const errors = validateProtagonist(formDraft.value, props.story ?? undefined);
  return errors.length === 0;
});

watch(
  () => props.open,
  (open) => {
    if (open) loadForm();
  }
);

/** 按三种进入方式装载表单（原实现是 openProtagonistModal 里那段 if/else） */
function loadForm(): void {
  formErrors.value = [];
  const story = props.story;
  if (!story) {
    emit('notify', 'error', t('story.storyNotFound'));
    return;
  }

  // 已有主角配置：载入编辑
  if (story.protagonist) {
    const p = story.protagonist;
    formMode.value = p.source;
    selectedCharName.value = p.source === 'existing' ? p.name : '';
    name.value = p.source === 'custom' ? p.name : '';
    role.value = p.role;
    description.value = p.description;
    startingScene.value = p.startingScene ?? '';
    relations.value = [...p.relations];
  } else if (props.presetCharacterName) {
    // 从"设为主角"按钮进入：预填已有人物
    const character = story.characters.find((c) => c.name === props.presetCharacterName);
    if (character) {
      formMode.value = 'existing';
      selectedCharName.value = props.presetCharacterName;
      role.value = 'protagonist';
      description.value = character.description ?? '';
      startingScene.value = '';
      relations.value = (character.relationships ?? []).map((r) => ({
        target: r.target,
        relation: r.relation,
      }));
    }
  } else {
    // 默认自定义模式
    formMode.value = 'custom';
    selectedCharName.value = '';
    name.value = '';
    role.value = 'protagonist';
    description.value = '';
    startingScene.value = '';
    relations.value = [];
  }

  newRelationTarget.value = '';
  newRelationDesc.value = '';
}

function close(): void {
  emit('update:open', false);
}

/** 切换表单模式时同步主角名 */
function handleModeChange(mode: 'existing' | 'custom'): void {
  if (mode === formMode.value) return;
  formMode.value = mode;
  // 切换到 custom 时清空 existing 选择
  if (mode === 'custom') {
    selectedCharName.value = '';
  } else {
    name.value = '';
  }
  formErrors.value = [];
}

/** 切换 selectedCharName 时同步描述（如果用户尚未自定义） */
function handleSelectedCharChange(value: string): void {
  selectedCharName.value = value;
  const story = props.story;
  if (!story) return;
  const character = story.characters.find((c) => c.name === value);
  if (character) {
    description.value = character.description ?? '';
    relations.value = (character.relationships ?? []).map((r) => ({
      target: r.target,
      relation: r.relation,
    }));
  }
}

/** 新增一条关系 */
function handleAddRelation(): void {
  const target = newRelationTarget.value.trim();
  const relation = newRelationDesc.value.trim();
  if (!target || !relation) {
    emit('notify', 'error', t('story.needRelationFields'));
    return;
  }
  if (relations.value.length >= MAX_RELATIONS_COUNT) {
    emit('notify', 'error', t('story.relationLimit', { max: MAX_RELATIONS_COUNT }));
    return;
  }
  relations.value = addRelationCore(relations.value, target, relation);
  newRelationTarget.value = '';
  newRelationDesc.value = '';
}

/** 移除指定关系 */
function handleRemoveRelation(target: string): void {
  relations.value = removeRelationCore(relations.value, target);
}

/** 保存主角配置 */
function handleSave(): void {
  if (!props.story || !formDraft.value) {
    emit('notify', 'error', t('story.completeFirst'));
    return;
  }

  const storyId = props.story.id;
  const draft = formDraft.value;
  const errors = validateProtagonist(draft, props.story ?? undefined);
  if (errors.length > 0) {
    formErrors.value = errors;
    emit('notify', 'error', t('story.validateFailed', { error: errors[0]! }));
    return;
  }
  formErrors.value = [];

  let ok = false;
  if (draft.source === 'existing') {
    ok = store.setProtagonistFromCharacter(
      storyId,
      draft.name,
      draft.role,
      draft.startingScene
    );
    // existing 模式下，setProtagonistFromCharacter 不会处理 description/relations 自定义项
    // 需调用 updateProtagonist 同步用户修改后的 description 和 relations
    if (ok && (draft.description || draft.relations.length > 0)) {
      ok = store.updateProtagonist(storyId, {
        description: draft.description,
        relations: draft.relations,
      });
    }
  } else {
    ok = store.setProtagonistAsCustom(storyId, {
      name: draft.name,
      description: draft.description,
      role: draft.role,
      startingScene: draft.startingScene,
      relations: draft.relations,
    });
  }

  if (ok) {
    // 故事主角是故事内容，不再创建或切换全局用户 Persona。
    // 清理旧版本留下的关联 ID，避免继续把故事角色当成用户身份。
    const story = store.stories.find((s) => s.id === storyId);
    if (story?.protagonist) {
      if (story.protagonist.personaId) store.setProtagonistPersonaId(storyId, null);
    }
    if (store.lastInfo) emit('notify', 'success', store.lastInfo);
    if (store.lastError) emit('notify', 'error', store.lastError);
    emit('saved');
    close();
  } else if (store.lastError) {
    emit('notify', 'error', store.lastError);
  }
}
</script>

<template>
  <Modal
    :model-value="open"
    :title="story?.protagonist ? t('story.protagonistEditTitle') : t('story.protagonistTitle2')"
    :aria-label="t('story.protagonistAria')"
    @update:model-value="emit('update:open', $event)"
  >
    <div v-if="story" class="protagonist-form">
      <!-- 主角来源选择 -->
      <fieldset class="import-fieldset">
        <legend>{{ t('story.sourceLegend') }}</legend>
        <div class="strategy-options">
          <label class="strategy-option">
            <input
              type="radio"
              name="protagonistSource"
              value="existing"
              :checked="formMode === 'existing'"
              @change="handleModeChange('existing')"
            />
            <span>{{ t('story.sourceFromChar') }}</span>
          </label>
          <label class="strategy-option">
            <input
              type="radio"
              name="protagonistSource"
              value="custom"
              :checked="formMode === 'custom'"
              @change="handleModeChange('custom')"
            />
            <span>{{ t('story.sourceCustomNew') }}</span>
          </label>
        </div>
      </fieldset>

      <!-- 主角名选择/输入 -->
      <div v-if="formMode === 'existing'" class="form-row">
        <label for="protagonistCharSelect" class="form-label">{{ t('story.selectChar') }}</label>
        <select
          id="protagonistCharSelect"
          class="form-select"
          :value="selectedCharName"
          @change="handleSelectedCharChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>{{ t('story.selectPlaceholder') }}</option>
          <option
            v-for="charName in characterOptions"
            :key="charName"
            :value="charName"
          >
            {{ charName }}
          </option>
        </select>
        <p v-if="characterOptions.length === 0" class="form-hint">
          {{ t('story.noCharHint') }}
        </p>
      </div>
      <div v-else class="form-row">
        <label for="protagonistNameInput" class="form-label">
          {{ t('story.protagNameLabel', { max: MAX_PROTAGONIST_NAME_LENGTH }) }}
        </label>
        <input
          id="protagonistNameInput"
          type="text"
          class="form-input"
          v-model="name"
          :maxlength="MAX_PROTAGONIST_NAME_LENGTH"
          :placeholder="t('story.protagNamePlaceholder')"
        />
      </div>

      <!-- 主角身份 -->
      <fieldset class="import-fieldset">
        <legend>{{ t('story.roleLegend') }}</legend>
        <div class="strategy-options">
          <label class="strategy-option">
            <input
              type="radio"
              name="protagonistRole"
              value="protagonist"
              v-model="role"
            />
            <span>{{ t('story.roleProtagonistDesc') }}</span>
          </label>
          <label class="strategy-option">
            <input
              type="radio"
              name="protagonistRole"
              value="observer"
              v-model="role"
            />
            <span>{{ t('story.roleObserverDesc') }}</span>
          </label>
        </div>
      </fieldset>

      <!-- 主角描述 -->
      <div class="form-row">
        <label for="protagonistDesc" class="form-label">
          {{ t('story.protagDescLabel', { max: MAX_PROTAGONIST_DESCRIPTION_LENGTH }) }}
        </label>
        <textarea
          id="protagonistDesc"
          class="form-textarea"
          v-model="description"
          :maxlength="MAX_PROTAGONIST_DESCRIPTION_LENGTH * 2"
          rows="4"
          :placeholder="t('story.protagDescPlaceholder')"
        ></textarea>
      </div>

      <!-- 起始场景 -->
      <div class="form-row">
        <label for="protagonistScene" class="form-label">{{ t('story.startScene') }}</label>
        <select
          id="protagonistScene"
          class="form-select"
          v-model="startingScene"
        >
          <option value="">{{ t('story.notSpecified') }}</option>
          <option
            v-for="sceneName in sceneOptions"
            :key="sceneName"
            :value="sceneName"
          >
            {{ sceneName }}
          </option>
        </select>
        <p v-if="sceneOptions.length === 0" class="form-hint">
          {{ t('story.noSceneHint') }}
        </p>
      </div>

      <!-- 关系列表 -->
      <fieldset class="import-fieldset">
        <legend>
          {{ t('story.relationsLegend', { count: relations.length, max: MAX_RELATIONS_COUNT }) }}
        </legend>

        <!-- 已有关系列表 -->
        <ul v-if="relations.length > 0" class="relation-edit-list">
          <li
            v-for="rel in relations"
            :key="rel.target"
            class="relation-edit-item"
          >
            <span class="rel-target">{{ rel.target }}</span>
            <span class="rel-sep">：</span>
            <span class="rel-text">{{ rel.relation }}</span>
            <button
              type="button"
              class="rel-remove-btn"
              :aria-label="t('story.removeRelationAria', { name: rel.target })"
              @click="handleRemoveRelation(rel.target)"
            >
              <Icon name="close" :size="12" />
            </button>
          </li>
        </ul>
        <p v-else class="form-hint">{{ t('story.noRelations') }}</p>

        <!-- 新增关系表单 -->
        <div class="relation-add-form">
          <input
            type="text"
            class="form-input relation-target-input"
            v-model="newRelationTarget"
            list="relationTargetOptions"
            :placeholder="t('story.relationTargetPlaceholder')"
          />
          <datalist id="relationTargetOptions">
            <option v-for="targetName in relationTargetOptions" :key="targetName" :value="targetName" />
          </datalist>
          <input
            type="text"
            class="form-input relation-desc-input"
            v-model="newRelationDesc"
            :maxlength="MAX_RELATION_DESC_LENGTH"
            :placeholder="t('story.relationDescPlaceholder')"
          />
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="handleAddRelation"
          >
            <Icon name="plus" :size="12" />
            {{ t('story.add') }}
          </button>
        </div>
      </fieldset>

      <!-- 校验错误提示 -->
      <div v-if="formErrors.length > 0" class="form-errors" role="alert">
        <Icon name="alert-triangle" :size="14" />
        <ul>
          <li v-for="(err, idx) in formErrors" :key="idx">{{ err }}</li>
        </ul>
      </div>

      <!-- 操作按钮 -->
      <div class="protagonist-form-actions">
        <button type="button" class="btn btn-secondary" @click="close">
          {{ t('story.cancelBtn') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!canSave"
          @click="handleSave"
        >
          <Icon name="check" :size="14" />
          {{ t('story.saveProtagonist') }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
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

.form-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: inherit;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
}

.form-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

/* 主角配置 Modal 表单 */
.protagonist-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.protagonist-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

/* 关系编辑列表 */
.relation-edit-list {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.relation-edit-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  font-size: 12px;
}

.rel-target {
  font-weight: 600;
  color: var(--foreground);
}

.rel-sep {
  color: var(--muted-foreground);
}

.rel-text {
  flex: 1;
  color: var(--muted-foreground);
}

.rel-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

@media (hover: hover) and (pointer: fine) {
  .rel-remove-btn:hover {
    background: color-mix(in srgb, var(--error-fg, #f87171) 12%, transparent);
    color: var(--error-fg, #f87171);
  }
}

.relation-add-form {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.relation-target-input {
  flex: 1;
  min-width: 120px;
}

.relation-desc-input {
  flex: 1;
  min-width: 120px;
}

.form-errors {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--error-fg, #f87171);
  background: color-mix(in srgb, var(--error-fg, #f87171) 8%, transparent);
  border-radius: var(--radius-sm);
  color: var(--error-fg, #f87171);
  font-size: 12px;
}

.form-errors ul {
  margin: 0;
  padding-left: 16px;
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
  .relation-add-form {
    flex-direction: column;
  }

  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-select,
  .form-input,
  .form-textarea {
    font-size: 16px;
  }
}
</style>
