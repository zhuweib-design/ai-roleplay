<script setup lang="ts">
/**
 * SegmentedControl — 通用分段控件（P0-2 思考强度三档）
 *
 * 可访问性：
 * - 语义为 radiogroup / radio + aria-checked（单一选中语义）
 * - roving tabindex：仅选中项可 Tab 进入，方向键在组内移动
 * - 每个选项热区 ≥44px（I-7 / WCAG 触控目标）
 */
import { computed, ref, watch, nextTick } from 'vue';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

const props = withDefaults(
  defineProps<{
    /** 当前选中值；null 表示未选择（"跟随配置"） */
    modelValue: string | null;
    options: SegmentedOption<string>[];
    disabled?: boolean;
  }>(),
  { disabled: false }
);

/**
 * 无障碍标签由调用方以 `aria-label` 传入，
 * 通过 Vue 的属性透传落到根元素（role="radiogroup"）上。
 */
defineOptions({ inheritAttrs: true });

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

/** 各选项按钮的 ref（用于方向键移动焦点） */
const buttons = ref<HTMLButtonElement[]>([]);

function setButtonRef(el: unknown, index: number): void {
  if (el instanceof HTMLButtonElement) {
    buttons.value[index] = el;
  }
}

/** roving tabindex：选中项（或首个选项）可 Tab 进入 */
const activeIndex = computed(() => {
  const i = props.options.findIndex((o) => o.value === props.modelValue);
  return i >= 0 ? i : 0;
});

watch(
  () => props.options.length,
  () => {
    // 选项数量变化（如切换 provider）时清理失效的 ref
    void nextTick(() => {
      buttons.value = buttons.value.filter(Boolean);
    });
  }
);

function select(value: string): void {
  if (props.disabled) return;
  emit('update:modelValue', value);
}

function onKeydown(e: KeyboardEvent, index: number): void {
  if (props.disabled) return;
  const last = props.options.length - 1;
  let next = index;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    next = index >= last ? 0 : index + 1;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    next = index <= 0 ? last : index - 1;
  } else if (e.key === 'Home') {
    next = 0;
  } else if (e.key === 'End') {
    next = last;
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    select(props.options[index]!.value);
    return;
  } else {
    return;
  }
  e.preventDefault();
  select(props.options[next]!.value);
  buttons.value[next]?.focus();
}
</script>

<template>
  <div class="seg" role="radiogroup">
    <button
      v-for="(opt, i) in options"
      :key="opt.value"
      :ref="(el) => setButtonRef(el, i)"
      type="button"
      class="seg-item"
      role="radio"
      :aria-checked="modelValue === opt.value"
      :aria-label="opt.label"
      :tabindex="activeIndex === i ? 0 : -1"
      :disabled="disabled"
      @click="select(opt.value)"
      @keydown="onKeydown($event, i)"
    >
      <span>{{ opt.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  width: 100%;
  gap: 2px;
  padding: 2px;
  background: color-mix(in srgb, var(--muted-foreground) 8%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.seg-item {
  flex: 1;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--spacing-sm);
  font-size: 13px;
  color: var(--muted-foreground);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.seg-item[aria-checked='true'] {
  background: var(--card-elevated);
  color: var(--foreground);
  font-weight: 600;
}

@media (hover: hover) and (pointer: fine) {
  .seg-item:hover:not([aria-checked='true']) {
    color: var(--foreground);
  }
}

.seg-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.seg-item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 640px) {
  /* I-7：移动端可编辑/可操作控件字号 ≥16px */
  .seg-item {
    font-size: 16px;
  }
}
</style>
