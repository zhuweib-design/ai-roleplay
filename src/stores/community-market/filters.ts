/**
 * B6：community-market store 的筛选/排序域。
 *
 * 六个筛选状态 ref + 八个改它们的方法 + 单选分类的派生值，再加一个
 * `toFilter()`：把散在宿主 computed 里的那段"空值不传"的组装规则收在这里。
 *
 * 这一域**完全不碰引擎**（引擎侧的 `listCards(filter, sort)` 仍由宿主调用），
 * 所以拆出来没有任何反向依赖；tick 也不参与 —— 筛选状态本身就是 ref。
 */
import { computed, ref } from 'vue';
import type { MarketFilter, SortOption } from '@/core/community-market';

export function createMarketFilters() {
  /** 搜索关键词 */
  const searchQuery = ref('');

  /** 当前筛选标签 */
  const selectedTags = ref<string[]>([]);

  /** 当前筛选分类 */
  const selectedCategories = ref<string[]>([]);

  /** 最低评分筛选 */
  const minRating = ref(0);

  /** 是否仅显示精选 */
  const featuredOnly = ref(false);

  /** 排序方式 */
  const sortBy = ref<SortOption>('popular');

  /** 组装引擎查询用的筛选条件：空值一律不传，避免引擎把空数组当成"必须匹配空集" */
  function toFilter(): MarketFilter {
    return {
      search: searchQuery.value || undefined,
      tags: selectedTags.value.length > 0 ? selectedTags.value : undefined,
      categories:
        selectedCategories.value.length > 0
          ? selectedCategories.value
          : undefined,
      minRating: minRating.value > 0 ? minRating.value : undefined,
      featuredOnly: featuredOnly.value || undefined,
      approvedOnly: true,
    };
  }

  function setSearch(query: string): void {
    searchQuery.value = query;
  }

  function toggleTag(tag: string): void {
    const idx = selectedTags.value.indexOf(tag);
    if (idx >= 0) {
      selectedTags.value.splice(idx, 1);
    } else {
      selectedTags.value.push(tag);
    }
  }

  function toggleCategory(cat: string): void {
    const idx = selectedCategories.value.indexOf(cat);
    if (idx >= 0) {
      selectedCategories.value.splice(idx, 1);
    } else {
      selectedCategories.value.push(cat);
    }
  }

  /** 需求1：单选模式设置分类（传 '' 清空，单选模式用于 FilterTabs） */
  function setCategory(cat: string): void {
    if (!cat) {
      selectedCategories.value = [];
    } else {
      selectedCategories.value = [cat];
    }
  }

  /** 需求1：当前单选分类（取 selectedCategories 第一个；空数组=未选） */
  const currentCategory = computed<string>(() => selectedCategories.value[0] ?? '');

  function setMinRating(rating: number): void {
    minRating.value = rating;
  }

  function toggleFeaturedOnly(): void {
    featuredOnly.value = !featuredOnly.value;
  }

  function setSortBy(sort: SortOption): void {
    sortBy.value = sort;
  }

  function clearFilters(): void {
    searchQuery.value = '';
    selectedTags.value = [];
    selectedCategories.value = [];
    minRating.value = 0;
    featuredOnly.value = false;
    sortBy.value = 'popular';
  }

  return {
    searchQuery,
    selectedTags,
    selectedCategories,
    minRating,
    featuredOnly,
    sortBy,
    currentCategory,
    toFilter,
    setSearch,
    toggleTag,
    toggleCategory,
    setCategory,
    setMinRating,
    toggleFeaturedOnly,
    setSortBy,
    clearFilters,
  };
}
