<script setup lang="ts">
/**
 * SceneConfigModal — 场景级随机事件配置编辑器 (F17.3)
 *
 * 功能：
 * - 新建或编辑场景配置
 * - 场景名（新建时可输入，编辑时只读）
 * - 启用/禁用开关
 * - 概率覆盖（null=使用全局默认）
 * - 允许/排除类别（多选）
 * - 严重度上限
 *
 * 无障碍：
 * - 基于 Modal 组件，自动焦点陷阱
 * - 所有表单字段 label 关联
 * - 类别多选使用复选框组
 */
import { ref, watch, computed } from 'vue';
import Modal from '@/components/common/Modal.vue';
import { useRandomEventsStore } from '@/stores/random-events';
import {
  type RandomEventSceneConfig,
  type RandomEventCategory,
  type RandomEventSeverity,
  validateSceneConfig,
  createDefaultSceneConfig,
} from '@core/random-event-generator';
import { t } from '@/i18n';

const props = defineProps<{
  /** 是否显示 */
  open: boolean;
  /** 编辑的场景名（null=新建） */
  sceneName: string | null;
  /** 已存在的场景名（用于新建时去重校验） */
  existingNames: string[];
}>();

const emit = defineEmits<{
  close: [];
  save: [data: { sceneName: string; isEdit: boolean; config: Partial<Omit<RandomEventSceneConfig, 'sceneName'>> }];
}>();

const store = useRandomEventsStore();

// ── 表单状态 ──
const form = ref({
  sceneName: '',
  enabled: true,
  probabilityOverrideEnabled: false,
  probabilityOverride: 10,
  allowedCategories: [] as RandomEventCategory[],
  excludedCategories: [] as RandomEventCategory[],
  maxSeverity: 'critical' as RandomEventSeverity,
});

const errors = ref<string[]>([]);

const isEdit = computed(() => props.sceneName !== null);

// ── 初始化/重置表单 ──
function resetForm(): void {
  if (props.sceneName) {
    // 编辑模式：从 store 读取已有配置
    const existing = store.getSceneConfig(props.sceneName);
    if (existing) {
      form.value = {
        sceneName: existing.sceneName,
        enabled: existing.enabled,
        probabilityOverrideEnabled: existing.probabilityOverride !== null,
        probabilityOverride: existing.probabilityOverride ?? 10,
        allowedCategories: [...existing.allowedCategories],
        excludedCategories: [...existing.excludedCategories],
        maxSeverity: existing.maxSeverity,
      };
    } else {
      // 配置不存在，使用默认值但保留场景名
      const def = createDefaultSceneConfig(props.sceneName);
      form.value = {
        sceneName: def.sceneName,
        enabled: def.enabled,
        probabilityOverrideEnabled: false,
        probabilityOverride: 10,
        allowedCategories: [],
        excludedCategories: [],
        maxSeverity: def.maxSeverity,
      };
    }
  } else {
    // 新建模式：默认值
    form.value = {
      sceneName: '',
      enabled: true,
      probabilityOverrideEnabled: false,
      probabilityOverride: 10,
      allowedCategories: [],
      excludedCategories: [],
      maxSeverity: 'critical',
    };
  }
  errors.value = [];
}

watch(
  () => props.open,
  (open) => {
    if (open) resetForm();
  },
  { immediate: true }
);

// ── 类别多选 ──
function toggleCategory(list: 'allowed' | 'excluded', cat: RandomEventCategory): void {
  const target = list === 'allowed' ? form.value.allowedCategories : form.value.excludedCategories;
  const idx = target.indexOf(cat);
  if (idx >= 0) {
    target.splice(idx, 1);
  } else {
    target.push(cat);
  }
}

function isCategoryChecked(list: 'allowed' | 'excluded', cat: RandomEventCategory): boolean {
  const target = list === 'allowed' ? form.value.allowedCategories : form.value.excludedCategories;
  return target.includes(cat);
}

// ── 保存 ──
function handleSave(): void {
  // 新建模式校验场景名
  if (!isEdit.value) {
    const name = form.value.sceneName.trim();
    if (!name) {
      errors.value = [t('sceneModal.nameRequired')];
      return;
    }
    if (props.existingNames.includes(name)) {
      errors.value = [t('sceneModal.nameExists', { name })];
      return;
    }
  }

  const config: Partial<Omit<RandomEventSceneConfig, 'sceneName'>> = {
    enabled: form.value.enabled,
    probabilityOverride: form.value.probabilityOverrideEnabled ? form.value.probabilityOverride : null,
    allowedCategories: [...form.value.allowedCategories],
    excludedCategories: [...form.value.excludedCategories],
    maxSeverity: form.value.maxSeverity,
  };

  // 校验
  const validationErrors = validateSceneConfig(config);
  if (validationErrors.length > 0) {
    errors.value = validationErrors;
    return;
  }

  emit('save', {
    sceneName: isEdit.value ? props.sceneName! : form.value.sceneName.trim(),
    isEdit: isEdit.value,
    config,
  });
}

function handleClose(): void {
  emit('close');
}
</script>

<template>
  <Modal
    :model-value="open"
    :title="isEdit ? t('sceneModal.editTitle') : t('sceneModal.newTitle')"
    @update:model-value="(v) => !v && handleClose()"
    @close="handleClose"
  >
    <form class="scene-form" @submit.prevent="handleSave">
      <div class="form-row">
        <label for="scn-name">{{ t('sceneModal.nameLabel') }} <span class="required">*</span></label>
        <input
          id="scn-name"
          v-model="form.sceneName"
          type="text"
          :disabled="isEdit"
          :required="!isEdit"
          maxlength="100"
          :placeholder="t('sceneModal.namePlaceholder')"
        />
        <small v-if="isEdit" class="form-hint">{{ t('sceneModal.nameReadonlyHint') }}</small>
      </div>

      <div class="form-row checkbox-row">
        <label for="scn-enabled">
          <input
            id="scn-enabled"
            v-model="form.enabled"
            type="checkbox"
          />
          <span>{{ t('sceneModal.enabled') }}</span>
        </label>
      </div>

      <div class="form-row checkbox-row">
        <label for="scn-prob-enabled">
          <input
            id="scn-prob-enabled"
            v-model="form.probabilityOverrideEnabled"
            type="checkbox"
          />
          <span>{{ t('sceneModal.probOverride') }}</span>
        </label>
      </div>

      <div v-if="form.probabilityOverrideEnabled" class="form-row">
        <label for="scn-prob">{{ t('sceneModal.probValue') }}</label>
        <input
          id="scn-prob"
          v-model.number="form.probabilityOverride"
          type="number"
          min="0"
          max="100"
          step="1"
        />
      </div>

      <fieldset class="category-group">
        <legend>{{ t('sceneModal.allowTitle') }}</legend>
        <small class="form-hint">{{ t('sceneModal.allowHint') }}</small>
        <div class="checkbox-grid">
          <label v-for="cat in store.CATEGORY_OPTIONS" :key="`allow-${cat.value}`">
            <input
              type="checkbox"
              :checked="isCategoryChecked('allowed', cat.value)"
              :disabled="isCategoryChecked('excluded', cat.value)"
              @change="toggleCategory('allowed', cat.value)"
            />
            <span>{{ cat.label }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset class="category-group">
        <legend>{{ t('sceneModal.excludeTitle') }}</legend>
        <small class="form-hint">{{ t('sceneModal.excludeHint') }}</small>
        <div class="checkbox-grid">
          <label v-for="cat in store.CATEGORY_OPTIONS" :key="`exclude-${cat.value}`">
            <input
              type="checkbox"
              :checked="isCategoryChecked('excluded', cat.value)"
              :disabled="isCategoryChecked('allowed', cat.value)"
              @change="toggleCategory('excluded', cat.value)"
            />
            <span>{{ cat.label }}</span>
          </label>
        </div>
      </fieldset>

      <div class="form-row">
        <label for="scn-maxsev">{{ t('sceneModal.maxSeverity') }}</label>
        <select id="scn-maxsev" v-model="form.maxSeverity">
          <option v-for="sev in store.SEVERITY_OPTIONS" :key="sev.value" :value="sev.value">
            {{ sev.label }}
          </option>
        </select>
        <small class="form-hint">{{ t('sceneModal.maxSeverityHint') }}</small>
      </div>

      <!-- 错误提示 -->
      <div v-if="errors.length > 0" class="errors" role="alert" aria-live="polite">
        <ul>
          <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
        </ul>
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn" @click="handleClose">{{ t('sceneModal.cancel') }}</button>
      <button type="button" class="btn primary" @click="handleSave">
        {{ isEdit ? t('sceneModal.save') : t('sceneModal.create') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.scene-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--spacing-md) 20px;
  overflow-y: auto;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-row label {
  font-size: 13px;
  color: var(--foreground);
  font-weight: 500;
}

.form-row input[type='text'],
.form-row input[type='number'],
.form-row select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

.form-row input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.checkbox-row {
  flex-direction: row;
  align-items: center;
}

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
}

.required {
  color: var(--danger-fg);
}

.form-hint {
  font-size: 11px;
  color: var(--muted-foreground);
}

.category-group {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin: 0;
}

.category-group legend {
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
  padding: 0 6px;
}

.checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
  margin-top: 6px;
}

.checkbox-grid label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: normal;
}

.errors {
  padding: 10px 12px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius-sm);
  color: var(--danger-fg);
  font-size: 12px;
}

.errors ul {
  margin: 0;
  padding-left: var(--spacing-md);
}

.btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
}

.btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}
</style>
