<script setup lang="ts">
/**
 * FormField — 字段外壳（G 层原语，§3.4 第 4 条）
 *
 * 解决的是"标签、说明、报错三件事各写各的"：仓库里同一个字段的 hint 与 error
 * 经常没有和控件建立 aria 关联，读屏用户只知道"这里错了"，不知道错在哪个框。
 *
 * 用法：控件放在默认插槽，并通过插槽参数拿到 `describedBy` / `invalid`，
 * 由调用方绑到真正的 input/textarea 上（本组件不假设控件类型，也就不替调用方
 * 决定 v-model 怎么写）。
 */
import { computed } from 'vue';
import { t, type MessageKey } from '@/i18n';

const props = withDefaults(
  defineProps<{
    labelKey: MessageKey;
    /** 控件的 id；不传则用 for 关联不到，只能靠插槽的 id */
    htmlFor?: string;
    hintKey?: MessageKey;
    /**
     * 说明文案已算好时使用（优先于 hintKey）。
     *
     * 给"说明随选项而变"的字段用，例如世界书事件面板的触发方式：每种触发方式各有
     * 一句解释，写不成固定 i18n 键。没有这个入口的话这类说明只能继续做成裸 <span>，
     * 读屏念到标签时带不到它。
     */
    hintText?: string;
    errorKey?: MessageKey;
    /** 报错文案已插值好时使用（优先于 errorKey） */
    errorText?: string;
    /**
     * 报错用 `role="status"`（礼貌播报）而不是默认的 `role="alert"`（打断式）。
     *
     * 给"边打字边校验"的字段用：世界书事件面板的逐字段拒绝反馈就是这种——
     * 用户还在输入，每敲一个非法字符都打断一次读屏会把这条字段变成噪音。
     */
    polite?: boolean;
    required?: boolean;
  }>(),
  { htmlFor: undefined, hintKey: undefined, hintText: undefined, errorKey: undefined, errorText: undefined, polite: false }
);

const uid = `ff-${Math.random().toString(36).slice(2, 8)}`;
const hintId = computed(() =>
  props.hintKey || props.hintText ? `${uid}-hint` : undefined
);
const errorId = computed(() => (props.errorKey || props.errorText ? `${uid}-error` : undefined));
const describedBy = computed(() => [hintId.value, errorId.value].filter(Boolean).join(' ') || undefined);
const controlId = computed(() => props.htmlFor ?? `${uid}-control`);
const hasError = computed(() => Boolean(props.errorKey || props.errorText));
</script>

<template>
  <div class="form-field" :class="{ 'has-error': hasError }">
    <label class="form-field-label" :for="controlId">
      {{ t(labelKey) }}
      <!-- 标签后缀：给"温度 [1.00]"这类标签里嵌实时数值的字段用（角色编辑器有四处）。
           放在 label 内部，读屏念标签时会一起念到当前值；没有这个插槽的话
           这类字段就只能继续手写 <label>，接不进本组件的 aria 关联。 -->
      <slot name="label-extra" />
      <span v-if="required" class="form-field-required" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">{{ t('common.required') }}</span>
      <span v-else-if="$slots.optional" class="form-field-optional">{{ t('common.optional') }}</span>
    </label>
    <slot :id="controlId" :described-by="describedBy" :invalid="hasError" />
    <p v-if="hintKey || hintText" :id="hintId" class="form-field-hint">{{ hintText ?? t(hintKey as MessageKey) }}</p>
    <p v-if="hasError" :id="errorId" class="form-field-error" :role="polite ? 'status' : 'alert'">
      {{ errorText ?? t(errorKey as MessageKey) }}
    </p>
  </div>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.form-field-required {
  margin-left: 2px;
  color: var(--primary);
}

.form-field-optional {
  margin-left: 4px;
  font-weight: 400;
  color: var(--muted-foreground);
}

.form-field-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--muted-foreground);
}

.form-field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  color: var(--destructive);
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
</style>
