<script setup lang="ts">
/**
 * FilterTabs — 通用分类筛选 Tab 组件 (需求1)
 *
 * 用于在卡片列表页（角色/世界书/故事/社区市场）顶部展示一组分类
 * 标签，用户点击标签可快速筛选内容；与 `v-model` 双向绑定当前激活
 * 项。
 *
 * 设计要点：
 * - 泛型 `T` 支持任意 tab value 类型（字符串、枚举等）
 * - 自动从传入数据源动态生成 tabs（含 `all` 选项），也可外部传入
 * - 无障碍：role="tablist"/"tab"，aria-selected/aria-controls
 * - 左右键盘箭头切换
 * - 响应式：移动端可换行
 * - 显示每个分类的数量徽标（可选）
 *
 * 用法示例：
 * ```vue
 * <FilterTabs
 *   v-model="activeCategory"
 *   :tabs="tabs"
 *   label="按分类筛选"
 *   all-label="全部"
 *   :all-value="''"
 * />
 * ```
 */
import { computed, ref } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { type IconName } from '@/components/common/icons';

/** 单个 Tab 描述 */
export interface FilterTab<T extends string = string> {
  /** Tab 唯一值 */
  value: T;
  /** Tab 显示文本 */
  label: string;
  /** 数量徽标（可选） */
  count?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 图标名（可选，匹配 Icon 组件） */
  icon?: IconName;
}

const props = withDefaults(
  defineProps<{
    /** 当前激活值（v-model） */
    modelValue: string;
    /** Tab 列表（不含"全部"项，由组件根据 allLabel/allValue 自动拼） */
    tabs: FilterTab[];
    /** aria-label（用于 tablist） */
    label?: string;
    /** "全部"Tab 的显示文本；传入空字符串则不显示"全部"项 */
    allLabel?: string;
    /** "全部"Tab 对应的 value */
    allValue?: string;
    /** "全部"Tab 的数量徽标（可选） */
    allCount?: number;
    /** 自定义容器 aria-orientation，默认 horizontal */
    orientation?: 'horizontal' | 'vertical';
  }>(),
  {
    label: '分类筛选',
    allLabel: '全部',
    allValue: '',
    orientation: 'horizontal',
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** 用户切换 Tab 时触发（含静态/动态切换） */
  change: [value: string];
}>();

// 所有 Tab（含"全部"前缀项，若启用）
const allTabs = computed<FilterTab[]>(() => {
  const list: FilterTab[] = [];
  if (props.allLabel) {
    list.push({
      value: props.allValue,
      label: props.allLabel,
      count: props.allCount,
    });
  }
  list.push(...props.tabs);
  return list;
});

const activeIndex = computed(() =>
  allTabs.value.findIndex((t) => t.value === props.modelValue)
);

// 无障碍：使用 roving tabindex
const tablistRef = ref<HTMLElement | null>(null);

function isActive(tab: FilterTab): boolean {
  return tab.value === props.modelValue;
}

function selectTab(tab: FilterTab): void {
  if (tab.disabled) return;
  if (tab.value === props.modelValue) return;
  emit('update:modelValue', tab.value);
  emit('change', tab.value);
}

function onKeydown(e: KeyboardEvent): void {
  if (props.orientation === 'vertical') {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  } else {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  }
  e.preventDefault();
  const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
  const n = allTabs.value.length;
  if (n === 0) return;
  let next = activeIndex.value;
  for (let i = 0; i < n; i++) {
    next = (next + dir + n) % n;
    if (!allTabs.value[next].disabled) {
      selectTab(allTabs.value[next]);
      // 移动焦点到激活 Tab
      const el = tablistRef.value?.querySelector<HTMLElement>(
        `[data-tab-index="${next}"]`
      );
      el?.focus();
      return;
    }
  }
}
</script>

<template>
  <div class="filter-tabs" :data-orientation="orientation">
    <div
      ref="tablistRef"
      class="tablist"
      role="tablist"
      :aria-label="label"
      :aria-orientation="orientation"
      @keydown="onKeydown"
    >
      <button
        v-for="(tab, idx) in allTabs"
        :key="`${tab.value}-${idx}`"
        type="button"
        role="tab"
        class="filter-tab"
        :class="{ active: isActive(tab), disabled: tab.disabled }"
        :data-tab-index="idx"
        :aria-selected="isActive(tab)"
        :aria-disabled="tab.disabled"
        :tabindex="isActive(tab) ? 0 : -1"
        :disabled="tab.disabled"
        @click="selectTab(tab)"
      >
        <Icon
          v-if="tab.icon"
          :name="tab.icon"
          :size="14"
          aria-hidden="true"
        />
        <span class="tab-label">{{ tab.label }}</span>
        <span
          v-if="typeof tab.count === 'number'"
          class="tab-count"
          :aria-label="`共 ${tab.count} 项`"
        >{{ tab.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-tabs {
  width: 100%;
  margin-bottom: var(--spacing-md, 16px);
}

.tablist {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 4px;
  background: color-mix(in srgb, var(--muted-foreground) 12%, transparent);
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-md, 10px);
}

.filter-tabs[data-orientation='vertical'] .tablist {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
}

.filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  line-height: 1.2;
  color: var(--muted-foreground, #999);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  white-space: nowrap;
}

.filter-tab:hover:not(.disabled) {
  background: color-mix(in srgb, var(--muted-foreground, #999) 10%, transparent);
  color: var(--foreground, #fff);
}

.filter-tab:focus-visible {
  outline: 2px solid var(--secondary, #5b8def);
  outline-offset: 2px;
}

.filter-tab.active {
  background: var(--secondary, #5b8def);
  /* 青色底上用深色文字（--on-accent），保证 ≥4.5:1；白字 on 亮青仅 ~1.1:1 不可见 */
  color: var(--on-accent, #161823);
  border-color: var(--secondary, #5b8def);
  font-weight: 600;
}

.filter-tab.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tab-label {
  /* 视觉对齐 */
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 500;
  background: color-mix(in srgb, currentColor 15%, transparent);
  color: inherit;
  border-radius: 999px;
}

.filter-tab.active .tab-count {
  background: color-mix(in srgb, var(--on-accent, #161823) 25%, transparent);
}

@media (max-width: 767px) {
  .filter-tab {
    padding: 6px 10px;
    font-size: 12px;
  }
}
</style>
