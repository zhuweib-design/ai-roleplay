/**
 * useLorebookEntryForm — 条目表单的本地草稿与字段写回（R1-3）
 *
 * 自 WorldBookView（原 3115 行）提出。语义逐字保留：
 * - `entryDraft` 是**本地缓冲**，避免每次按键都整体替换 store 里的条目；
 *   选中条目变化时清空（watch 保留在 composable 内）。
 * - 策略/位置/逻辑选项数组**必须留在函数体内**：它们的 label 来自 `t()`，
 *   提到模块级会在应用启动那一刻求值定死，切语言后不再更新
 *   （同 useStoryFilters 的 STATUS_LABELS，见该文件注释）。
 */
import { ref, computed, watch } from 'vue';
import { useLorebookStore } from '@/stores/lorebook';
import type {
  LorebookEntry,
  LorebookStrategy,
  LorebookInsertionPosition,
  LorebookLogic,
} from '@/core/lorebook';
import { t } from '@/i18n';

export function useLorebookEntryForm() {
  const store = useLorebookStore();
  const currentLorebook = computed(() => store.currentLorebook);
  const currentEntry = computed(() => store.currentEntry);

  // 条目表单本地编辑缓冲（避免每次按键触发 store 更新）
  const entryDraft = ref<LorebookEntry | null>(null);

  // 当前展开/折叠的策略选项
  const strategyOptions: { value: LorebookStrategy; label: string; desc: string }[] = [
    { value: 'keyword', label: t('wb.strategyKeyword'), desc: t('wb.strategyKeywordDesc') },
    { value: 'constant', label: t('wb.strategyConstant'), desc: t('wb.strategyConstantDesc') },
    { value: 'probability', label: t('wb.strategyProbability'), desc: t('wb.strategyProbabilityDesc') },
  ];

  const positionOptions: { value: LorebookInsertionPosition; label: string }[] = [
    { value: 'beforeCharDefs', label: t('wb.positionBeforeChar') },
    { value: 'afterCharDefs', label: t('wb.positionAfterChar') },
    { value: 'atDepth', label: t('wb.positionAtDepth') },
  ];

  const logicOptions: { value: LorebookLogic; label: string; desc: string }[] = [
    { value: 'AND_ANY', label: 'AND ANY', desc: t('wb.logicAny') },
    { value: 'AND_ALL', label: 'AND ALL', desc: t('wb.logicAll') },
    { value: 'NOT_ANY', label: 'NOT ANY', desc: t('wb.logicNotAny') },
    { value: 'NOT_ALL', label: 'NOT ALL', desc: t('wb.logicNotAll') },
  ];

  // 当选中条目变化时，重置本地草稿
  watch(
    () => currentEntry.value?.id,
    () => {
      entryDraft.value = null;
    }
  );

  /**
   * 获取当前草稿（首次访问时从 store 复制一份）
   */
  function draft(): LorebookEntry | null {
    if (!currentEntry.value) return null;
    if (!entryDraft.value || entryDraft.value.id !== currentEntry.value.id) {
      entryDraft.value = { ...currentEntry.value, keys: [...currentEntry.value.keys] };
    }
    return entryDraft.value;
  }

  function onEntryField<K extends keyof LorebookEntry>(
    field: K,
    value: LorebookEntry[K]
  ) {
    const d = draft();
    if (!d || !currentLorebook.value) return;
    d[field] = value;
    // 提交到 store
    store.updateEntry(currentLorebook.value.id, d.id, { [field]: value });
  }

  function onTitleInput(e: Event) {
    onEntryField('title', (e.target as HTMLInputElement).value);
  }

  function onContentInput(e: Event) {
    onEntryField('content', (e.target as HTMLTextAreaElement).value);
  }

  function onKeysInput(e: Event) {
    // 关键词以逗号分隔
    const raw = (e.target as HTMLInputElement).value;
    const keys = raw
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    onEntryField('keys', keys);
  }

  function keysToString(keys: string[]): string {
    return keys.join(', ');
  }

  function onStrategyChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as LorebookStrategy;
    onEntryField('strategy', value);
  }

  function onPositionChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as LorebookInsertionPosition;
    onEntryField('insertionPosition', value);
  }

  function onLogicChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as LorebookLogic;
    onEntryField('logic', value);
  }

  function onProbabilityInput(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) onEntryField('probability', value);
  }

  function onOrderInput(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) onEntryField('insertionOrder', value);
  }

  function onDepthInput(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) onEntryField('depth', value);
  }

  function onGroupInput(e: Event) {
    onEntryField('group', (e.target as HTMLInputElement).value);
  }

  function keysPreview(keys: string[]): string {
    if (keys.length === 0) return t('wb.noKeywords');
    if (keys.length <= 2) return keys.join('、');
    return `${keys.slice(0, 2).join('、')} +${keys.length - 2}`;
  }

  function strategyLabel(s: LorebookStrategy): string {
    return strategyOptions.find((o) => o.value === s)?.label ?? s;
  }

  function deleteEntry(entryId: string) {
    if (!currentLorebook.value) return;
    store.deleteEntry(currentLorebook.value.id, entryId);
  }

  function duplicateEntry(entryId: string) {
    if (!currentLorebook.value) return;
    store.duplicateEntry(currentLorebook.value.id, entryId);
  }

  return {
    entryDraft,
    strategyOptions,
    positionOptions,
    logicOptions,
    draft,
    onEntryField,
    onTitleInput,
    onContentInput,
    onKeysInput,
    keysToString,
    onStrategyChange,
    onPositionChange,
    onLogicChange,
    onProbabilityInput,
    onOrderInput,
    onDepthInput,
    onGroupInput,
    keysPreview,
    strategyLabel,
    deleteEntry,
    duplicateEntry,
  };
}
