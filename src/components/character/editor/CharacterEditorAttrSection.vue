<script setup lang="ts">
/**
 * CharacterEditorAttrSection — F01.6 角色属性（R2-1 从 CharacterEditorView 拆出）
 *
 * 一个开关 + 一块折叠面板：职业、等级、经验、自定义属性行。
 *
 * 折叠原来本文件自己写过一套（aria-expanded 按钮 + v-show 面板），与设置页的 Collapse
 * 长得不一样、也没有 aria-controls。并入统一原语后，"打开属性开关 / 加一条属性 /
 * 切换角色"这三处从外部改展开态的地方才真的有地方可写（`v-model:open`）——
 * 所以展开态仍然挂在 `form.attributesOpen` 上，而不是组件内部 `ref`。
 */
import Icon from '@/components/common/Icon.vue';
import Collapse from '@/components/common/Collapse.vue';
import FormField from '@/components/common/FormField.vue';
import type { FormState } from '@/composables/useCharacterEditorForm';
import { t } from '@/i18n';

const form = defineModel<FormState>('form', { required: true });

defineProps<{
  errors: Record<string, string>;
}>();

/** F01.6 添加属性行（顺手展开折叠面板） */
function addStat(): void {
  form.value.stats.push({ name: '', value: '', type: 'number' });
  form.value.attributesOpen = true;
}

/** F01.6 删除指定属性行 */
function removeStat(index: number): void {
  form.value.stats.splice(index, 1);
}
</script>

<template>
  <fieldset class="form-section">
    <legend class="section-title attr-legend">
      <span>{{ t('charEdit.attrTitle') }}</span>
      <label class="attr-switch">
        <input
          v-model="form.attrEnabled"
          type="checkbox"
          :aria-label="form.attrEnabled ? t('charEdit.attrOnAria') : t('charEdit.attrOffAria')"
          @change="form.attrEnabled && (form.attributesOpen = true)"
        />
        <span class="switch-track" :class="{ on: form.attrEnabled }" aria-hidden="true">
          <span class="switch-thumb"></span>
        </span>
      </label>
      <span v-if="form.attrEnabled" class="attr-badge">{{ t('charEdit.attrEnabled') }}</span>
    </legend>

    <Collapse
      v-if="form.attrEnabled"
      v-model:open="form.attributesOpen"
      title-key="charEdit.attrDetails"
      :level="3"
      plain
    >
        <FormField label-key="charEdit.professionLabel" html-for="f-profession">
          <template #default>
            <input
              id="f-profession"
              v-model="form.profession"
              type="text"
              class="field-input"
              :placeholder="t('charEdit.professionPlaceholder')"
              maxlength="30"
              autocomplete="off"
            />
          </template>
        </FormField>

        <div class="attr-row">
          <FormField
            label-key="charEdit.levelLabel"
            html-for="f-level"
            :error-text="errors.level"
          >
            <template #default="{ describedBy, invalid }">
              <input
                id="f-level"
                v-model.number="form.level"
                type="number"
                min="0"
                max="9999"
                step="1"
                class="field-input"
                :class="{ 'has-error': invalid }"
                :aria-invalid="invalid"
                :aria-describedby="describedBy"
              />
            </template>
          </FormField>
          <FormField
            label-key="charEdit.expLabel"
            html-for="f-exp"
            :error-text="errors.experience"
          >
            <template #default="{ describedBy, invalid }">
              <input
                id="f-exp"
                v-model.number="form.experience"
                type="number"
                min="0"
                step="1"
                class="field-input"
                :class="{ 'has-error': invalid }"
                :aria-invalid="invalid"
                :aria-describedby="describedBy"
              />
            </template>
          </FormField>
        </div>

        <div class="field" role="group" aria-labelledby="f-stats-label">
          <div class="stats-header">
            <p id="f-stats-label" class="field-label">{{ t('charEdit.statsLabel') }}</p>
            <button
              type="button"
              class="add-stat-btn"
              @click="addStat"
            >
              <Icon name="plus" :size="12" />
              <span>{{ t('charEdit.addStat') }}</span>
            </button>
          </div>
          <p v-if="errors.stats" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" />
            <span>{{ errors.stats }}</span>
          </p>
          <div v-if="form.stats.length > 0" class="stats-list">
            <div
              v-for="(stat, idx) in form.stats"
              :key="idx"
              class="stat-row"
            >
              <input
                v-model="stat.name"
                type="text"
                class="stat-input stat-name"
                :placeholder="t('charEdit.statNamePlaceholder')"
                maxlength="20"
                autocomplete="off"
                :aria-label="t('charEdit.statNameAria', { index: idx + 1 })"
              />
              <input
                v-model="stat.value"
                type="text"
                class="stat-input stat-value"
                :placeholder="t('charEdit.statValuePlaceholder')"
                autocomplete="off"
                :aria-label="t('charEdit.statValueAria', { index: idx + 1 })"
              />
              <select
                v-model="stat.type"
                class="stat-select"
                :aria-label="t('charEdit.statTypeAria', { index: idx + 1 })"
              >
                <option value="number">{{ t('charEdit.statTypeNumber') }}</option>
                <option value="text">{{ t('charEdit.statTypeText') }}</option>
              </select>
              <button
                type="button"
                class="stat-remove"
                :aria-label="t('charEdit.statRemoveAria', { index: idx + 1 })"
                @click="removeStat(idx)"
              >
                <Icon name="trash-2" :size="14" />
              </button>
            </div>
          </div>
          <p v-else class="field-hint">{{ t('charEdit.statEmptyHint') }}</p>
        </div>
    </Collapse>
    <p v-else class="field-hint">{{ t('charEdit.attrOffHint') }}</p>
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

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.field-input.has-error {
  border-color: var(--destructive);
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--destructive);
  margin: 0;
}

.field-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

/* F01.6 角色属性面板 */
.attr-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.attr-badge {
  font-size: 10px;
  color: var(--secondary-text);
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.attr-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  margin-left: auto;
}

.attr-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-track {
  display: inline-flex;
  align-items: center;
  width: 32px;
  height: 18px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 1px;
  transition: background-color .15s ease, border-color .15s ease;
}

.switch-track.on {
  background: var(--secondary);
  border-color: var(--secondary);
}

.switch-thumb {
  display: inline-block;
  width: 12px;
  height: 12px;
  background: var(--foreground);
  border-radius: 50%;
  transform: translateX(0);
  transition: transform .15s ease;
}

.switch-track.on .switch-thumb {
  transform: translateX(14px);
  background: var(--on-media);
}

.attr-switch input:focus-visible + .switch-track {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.attr-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.add-stat-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .add-stat-btn:hover {
    border-color: var(--secondary);
    color: var(--secondary-text);
  }
}

.add-stat-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr 80px 32px;
  gap: 6px;
  align-items: center;
}

.stat-input {
  height: 32px;
  padding: 0 8px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 12px;
  outline: none;
  transition: border-color .15s ease;
  width: 100%;
}

.stat-input:focus-visible {
  border-color: var(--secondary);
}

.stat-select {
  height: 32px;
  padding: 0 6px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.stat-select:focus-visible {
  border-color: var(--secondary);
}

.stat-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .stat-remove:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

.stat-remove:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .attr-row {
    grid-template-columns: 1fr;
  }
  .stat-row {
    grid-template-columns: 1fr 1fr;
  }
  .stat-row .stat-select,
  .stat-row .stat-remove {
    grid-column: span 1;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input,
  .stat-input,
  .stat-select {
    font-size: 16px;
  }
}
</style>
