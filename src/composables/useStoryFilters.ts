import { computed } from 'vue';
import { useStoryStore } from '@/stores/story';
import { t } from '@/i18n';
import type { FilterTab } from '@/components/common/FilterTabs.vue';

/**
 * useStoryFilters — 搜索 + 状态分类（R1-2 从 StoryEngineView 拆出）
 *
 * 三件事都是"store 派生 + 一层 UI 包装"：关键词直接写 store，筛选状态也写 store
 * （刷新后保持），Tab 的可见性与计数从 `statusCounts` 推。
 *
 * 注意 `STATUS_LABELS` 必须留在函数体内：它是 `t()` 的求值结果，
 * 提到模块级就只在首次加载时算一遍，切语言不会更新（全仓踩过的坑）。
 */
export function useStoryFilters() {
  const store = useStoryStore();

  const stories = computed(() => store.filteredStories);

  const STATUS_LABELS: Record<'pending' | 'analyzing' | 'completed' | 'failed', string> = {
    pending: t('story.statusPending'),
    analyzing: t('story.statusAnalyzing'),
    completed: t('story.statusCompleted'),
    failed: t('story.statusFailed'),
  };

  const statusFilterTabs = computed<FilterTab[]>(() => {
    const counts = store.statusCounts;
    return (Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>)
      .filter((s) => counts[s] > 0)
      .map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
        count: counts[s],
      }));
  });

  const filterStatus = computed({
    get: () => store.filterStatus,
    set: (v: string) => store.setFilterStatus(v as 'pending' | 'analyzing' | 'completed' | 'failed' | ''),
  });

  return {
    stories,
    statusFilterTabs,
    filterStatus,
  };
}
