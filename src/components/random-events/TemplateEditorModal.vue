<script setup lang="ts">
/**
 * TemplateEditorModal — 随机事件模板编辑器 (F17.3)
 *
 * 功能：
 * - 新建或编辑事件模板
 * - 多维度参数配置（名称/描述/类别/严重度/概率/权重/冷却/场景适配/触发关键词/最大触发次数）
 * - 启用/禁用开关
 *
 * 无障碍：
 * - 基于 Modal 组件，自动焦点陷阱
 * - 所有表单字段 label 关联
 * - 验证错误通过 aria-live 区域播报
 */
import { ref, watch, computed } from 'vue';
import Modal from '@/components/common/Modal.vue';
import { useRandomEventsStore } from '@/stores/random-events';
import {
  type RandomEventTemplate,
  type RandomEventCategory,
  type RandomEventSeverity,
  validateRandomEventTemplate,
  DEFAULT_RANDOM_EVENT_PROBABILITY,
  DEFAULT_TEMPLATE_WEIGHT,
  DEFAULT_TEMPLATE_COOLDOWN_MS,
} from '@core/random-event-generator';
import { t } from '@/i18n';

const props = defineProps<{
  /** 是否显示 */
  open: boolean;
  /** 编辑的模板（null=新建） */
  template: RandomEventTemplate | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [data: { id: string | null; input: TemplateInput }];
}>();

const store = useRandomEventsStore();

type TemplateInput = Parameters<typeof store.createTemplate>[0];

// ── 表单状态 ──
const form = ref({
  name: '',
  description: '',
  category: 'custom' as RandomEventCategory,
  severity: 'minor' as RandomEventSeverity,
  probability: DEFAULT_RANDOM_EVENT_PROBABILITY,
  weight: DEFAULT_TEMPLATE_WEIGHT,
  cooldownMs: DEFAULT_TEMPLATE_COOLDOWN_MS,
  applicableScenesText: '',
  excludedScenesText: '',
  triggerKeywordsText: '',
  enabled: true,
  maxTriggers: 0,
});

const errors = ref<string[]>([]);

// ── 初始化/重置表单 ──
function resetForm(): void {
  if (props.template) {
    // 编辑模式：填充已有值
    form.value = {
      name: props.template.name,
      description: props.template.description,
      category: props.template.category,
      severity: props.template.severity,
      probability: props.template.probability,
      weight: props.template.weight,
      cooldownMs: props.template.cooldownMs,
      applicableScenesText: props.template.applicableScenes.join('、'),
      excludedScenesText: props.template.excludedScenes.join('、'),
      triggerKeywordsText: props.template.triggerKeywords.join('、'),
      enabled: props.template.enabled,
      maxTriggers: props.template.maxTriggers,
    };
  } else {
    // 新建模式：默认值
    form.value = {
      name: '',
      description: '',
      category: 'custom',
      severity: 'minor',
      probability: DEFAULT_RANDOM_EVENT_PROBABILITY,
      weight: DEFAULT_TEMPLATE_WEIGHT,
      cooldownMs: DEFAULT_TEMPLATE_COOLDOWN_MS,
      applicableScenesText: '',
      excludedScenesText: '',
      triggerKeywordsText: '',
      enabled: true,
      maxTriggers: 0,
    };
  }
  errors.value = [];
}

// 监听 open 变化
watch(
  () => props.open,
  (open) => {
    if (open) resetForm();
  },
  { immediate: true }
);

// ── 保存 ──
const isEdit = computed(() => props.template !== null);

function handleSave(): void {
  // 解析逗号分隔的字段
  const parseList = (text: string): string[] =>
    text
      .split(/[、,，\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const input: TemplateInput = {
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    category: form.value.category,
    severity: form.value.severity,
    probability: form.value.probability,
    weight: form.value.weight,
    cooldownMs: form.value.cooldownMs,
    applicableScenes: parseList(form.value.applicableScenesText),
    excludedScenes: parseList(form.value.excludedScenesText),
    triggerKeywords: parseList(form.value.triggerKeywordsText),
    enabled: form.value.enabled,
    maxTriggers: form.value.maxTriggers,
  };

  // 校验
  const validationErrors = validateRandomEventTemplate(input);
  if (validationErrors.length > 0) {
    errors.value = validationErrors;
    return;
  }

  emit('save', {
    id: props.template?.id ?? null,
    input,
  });
}

function handleClose(): void {
  emit('close');
}
</script>

<template>
  <Modal
    :model-value="open"
    :title="isEdit ? t('tplModal.editTitle') : t('tplModal.newTitle')"
    @update:model-value="(v) => !v && handleClose()"
    @close="handleClose"
  >
    <form class="template-form" @submit.prevent="handleSave">
      <div class="form-row">
        <label for="tpl-name">{{ t('tplModal.nameLabel') }} <span class="required">*</span></label>
        <input
          id="tpl-name"
          v-model="form.name"
          type="text"
          maxlength="50"
          required
          :aria-invalid="errors.some((e) => e.includes(t('tplModal.nameLabel')))"
        />
      </div>

      <div class="form-row">
        <label for="tpl-desc">{{ t('tplModal.descLabel') }} <span class="required">*</span></label>
        <textarea
          id="tpl-desc"
          v-model="form.description"
          rows="3"
          maxlength="2000"
          required
          :aria-invalid="errors.some((e) => e.includes(t('tplModal.descLabel')))"
        ></textarea>
        <small class="form-hint">{{ t('tplModal.descHint') }}</small>
      </div>

      <div class="form-grid-2">
        <div class="form-row">
          <label for="tpl-category">{{ t('tplModal.category') }}</label>
          <select id="tpl-category" v-model="form.category">
            <option v-for="cat in store.CATEGORY_OPTIONS" :key="cat.value" :value="cat.value">
              {{ cat.label }}
            </option>
          </select>
        </div>

        <div class="form-row">
          <label for="tpl-severity">{{ t('tplModal.severity') }}</label>
          <select id="tpl-severity" v-model="form.severity">
            <option v-for="sev in store.SEVERITY_OPTIONS" :key="sev.value" :value="sev.value">
              {{ sev.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-row">
          <label for="tpl-prob">{{ t('tplModal.probability') }}</label>
          <input
            id="tpl-prob"
            v-model.number="form.probability"
            type="number"
            min="0"
            max="100"
            step="1"
          />
        </div>

        <div class="form-row">
          <label for="tpl-weight">{{ t('tplModal.weight') }}</label>
          <input
            id="tpl-weight"
            v-model.number="form.weight"
            type="number"
            min="0"
            step="1"
          />
          <small class="form-hint">{{ t('tplModal.weightHint') }}</small>
        </div>
      </div>

      <div class="form-grid-2">
        <div class="form-row">
          <label for="tpl-cooldown">{{ t('tplModal.cooldown') }}</label>
          <input
            id="tpl-cooldown"
            v-model.number="form.cooldownMs"
            type="number"
            min="0"
            step="1000"
          />
          <small class="form-hint">{{ t('tplModal.cooldownHint') }}</small>
        </div>

        <div class="form-row">
          <label for="tpl-maxtriggers">{{ t('tplModal.maxTriggers') }}</label>
          <input
            id="tpl-maxtriggers"
            v-model.number="form.maxTriggers"
            type="number"
            min="0"
            step="1"
          />
          <small class="form-hint">{{ t('tplModal.maxTriggersHint') }}</small>
        </div>
      </div>

      <div class="form-row">
        <label for="tpl-applicable">{{ t('tplModal.applicable') }}</label>
        <input
          id="tpl-applicable"
          v-model="form.applicableScenesText"
          type="text"
          :placeholder="t('tplModal.applicablePlaceholder')"
        />
      </div>

      <div class="form-row">
        <label for="tpl-excluded">{{ t('tplModal.excluded') }}</label>
        <input
          id="tpl-excluded"
          v-model="form.excludedScenesText"
          type="text"
          :placeholder="t('tplModal.excludedPlaceholder')"
        />
      </div>

      <div class="form-row">
        <label for="tpl-keywords">{{ t('tplModal.keywords') }}</label>
        <input
          id="tpl-keywords"
          v-model="form.triggerKeywordsText"
          type="text"
          :placeholder="t('tplModal.keywordsPlaceholder')"
        />
        <small class="form-hint">{{ t('tplModal.keywordsHint') }}</small>
      </div>

      <div class="form-row checkbox-row">
        <label for="tpl-enabled">
          <input
            id="tpl-enabled"
            v-model="form.enabled"
            type="checkbox"
          />
          <span>{{ t('tplModal.enabled') }}</span>
        </label>
      </div>

      <!-- 错误提示 -->
      <div v-if="errors.length > 0" class="errors" role="alert" aria-live="polite">
        <ul>
          <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
        </ul>
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn" @click="handleClose">{{ t('tplModal.cancel') }}</button>
      <button type="button" class="btn primary" @click="handleSave">
        {{ isEdit ? t('tplModal.save') : t('tplModal.create') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.template-form {
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
.form-row select,
.form-row textarea {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
  font-family: inherit;
}

.form-row textarea {
  resize: vertical;
  min-height: 60px;
}

.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

@media (max-width: 567px) {
  .form-grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
