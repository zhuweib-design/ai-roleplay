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
      errors.value = ['场景名不能为空'];
      return;
    }
    if (props.existingNames.includes(name)) {
      errors.value = [`场景「${name}」已存在`];
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
    :title="isEdit ? '编辑场景配置' : '新建场景配置'"
    @update:model-value="(v) => !v && handleClose()"
    @close="handleClose"
  >
    <form class="scene-form" @submit.prevent="handleSave">
      <div class="form-row">
        <label for="scn-name">场景名 <span class="required">*</span></label>
        <input
          id="scn-name"
          v-model="form.sceneName"
          type="text"
          :disabled="isEdit"
          :required="!isEdit"
          maxlength="100"
          placeholder="如：王都市场"
        />
        <small v-if="isEdit" class="form-hint">场景名不可修改</small>
      </div>

      <div class="form-row checkbox-row">
        <label for="scn-enabled">
          <input
            id="scn-enabled"
            v-model="form.enabled"
            type="checkbox"
          />
          <span>启用此场景的随机事件</span>
        </label>
      </div>

      <div class="form-row checkbox-row">
        <label for="scn-prob-enabled">
          <input
            id="scn-prob-enabled"
            v-model="form.probabilityOverrideEnabled"
            type="checkbox"
          />
          <span>覆盖全局默认概率</span>
        </label>
      </div>

      <div v-if="form.probabilityOverrideEnabled" class="form-row">
        <label for="scn-prob">覆盖概率（%）</label>
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
        <legend>允许的类别</legend>
        <small class="form-hint">空=允许全部（与排除列表互斥校验）</small>
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
        <legend>排除的类别</legend>
        <small class="form-hint">排除优先于允许</small>
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
        <label for="scn-maxsev">严重度上限</label>
        <select id="scn-maxsev" v-model="form.maxSeverity">
          <option v-for="sev in store.SEVERITY_OPTIONS" :key="sev.value" :value="sev.value">
            {{ sev.label }}
          </option>
        </select>
        <small class="form-hint">超过此严重度的模板不会在此场景触发</small>
      </div>

      <!-- 错误提示 -->
      <div v-if="errors.length > 0" class="errors" role="alert" aria-live="polite">
        <ul>
          <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
        </ul>
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn" @click="handleClose">取消</button>
      <button type="button" class="btn primary" @click="handleSave">
        {{ isEdit ? '保存' : '创建' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.scene-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px;
  overflow-y: auto;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  padding-left: 16px;
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
