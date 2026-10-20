/**
 * WorldBook 事件面板的共享状态与操作（R4-2 拆分）
 *
 * 宿主、列表、编辑器必须看到同一个 `selectedEventId` / `rejectedFields` /
 * `keywordDraft` —— 各自调普通 composable 会各持一份 ref，点列表编辑器不切过去；
 * 但也不能走模块级单例：模块作用域的 ref 会被同页面里**所有**面板实例共享，
 * 包括已经脱离 DOM 却还没销毁的实例（单测里连续 mount 不复用），一个实例弹 toast
 * 会让另一个实例跟着重渲染，落到已卸载的锚点上就是 `insertBefore of null`。
 *
 * 所以用 `provide/inject`：状态随面板实例生灭，宿主 setup 里 provide 一次，
 * 列表与编辑器 inject 同一份。跨实例零串味，子树内共享。
 *
 * **副作用留在宿主**：同步 currentLorebook、监听 store 的 lastError/lastInfo 都只在
 * 宿主装一次。子组件各建一份 watch 会重复弹 toast（"已触发"弹两遍）。
 */
import { ref, computed, provide, inject, type InjectionKey } from 'vue';
import { useLorebookStore } from '@/stores/lorebook';
import { useEventsStore } from '@/stores/events';
import type {
  TriggerConditionType,
  TriggerCondition,
  CompletionCondition,
  EventState,
  StoryEvent,
  StoryEventPatch,
} from '@/core/event-types';
import { t } from '@/i18n';

export function createWorldBookEvents() {
  // ── 面板实例状态（provide 给列表与编辑器的同一份） ──

  const selectedEventId = ref<string | null>(null);

  /**
   * 写入被拒的字段 → 原因。store 没收下这个值时，面板必须说出来：
   * toast 只闪一次，这条标注是一直挂着的（配合红框与 aria-invalid）。
   *
   * 这两个 ref 必须声明在宿主的 `watch(..., { immediate: true })` 之前——
   * immediate 回调在 setup 阶段就会跑一次，碰到后面的 `const` 会直接踩空引用。
   * （工厂先建完这份状态才返回，宿主拿到时它们已经就位。）
   */
  const rejectedFields = ref<Record<string, string>>({});

  /**
   * 关键词输入框的本地草稿。
   *
   * 名称与描述有 `maxlength` 兜着、概率是 range，三者都到不了"被 store 拒绝"；
   * 唯一能拒的是"使用正则 + 非法表达式"。而 `:value` 单向绑定在写入被拒时会把用户
   * 刚打的字**直接吞掉**（真实浏览器实测：打 `(` 之后框里是空的），所以这一格以草稿
   * 为准显示，草稿只在写入成功时清掉。
   */
  const keywordDraft = ref<string | null>(null);

  // ── Toast（自包含，宿主渲染） ──
  const toastOpen = ref(false);
  const toastType = ref<'info' | 'success' | 'error'>('info');
  const toastMessage = ref('');

  function showEventsToast(type: 'info' | 'success' | 'error', message: string): void {
    toastType.value = type;
    toastMessage.value = message;
    toastOpen.value = true;
  }

  /** 换事件 / 换世界书 / 删事件：草稿与"未保存"标注都属于上一条，不能带过去 */
  function clearFieldState(): void {
    keywordDraft.value = null;
    rejectedFields.value = {};
  }

  /** 输入框显示什么：草稿优先，否则回落到 store 里已存下的那份 */
  function splitKeywords(raw: string): string[] {
    return raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
  }

  /** 逗号分隔字符串 ← 数组（与 splitKeywords 互逆，用于只读展示） */
  function keywordsToString(keywords: string[] | undefined): string {
    return (keywords ?? []).join(', ');
  }

  /**
   * 获取条目的层级深度（通过 parentId 链计算）
   */
  function entryLevelOf(entries: { id: string; parentId?: string | null }[], entryId: string): number {
    let level = 0;
    const visited = new Set<string>([entryId]);
    let currentId = entryId;
    while (true) {
      const entry = entries.find((e) => e.id === currentId);
      if (!entry) break;
      const parentId = entry.parentId ?? null;
      if (parentId === null || visited.has(parentId)) break;
      visited.add(parentId);
      level++;
      currentId = parentId;
      if (level > 10) break; // 防止异常循环
    }
    return level;
  }

  /** 层级标签 */
  function levelLabel(level: number): string {
    switch (level) {
      case 0: return 'World';
      case 1: return 'Region';
      case 2: return 'Sub-area';
      default: return `L${level}`;
    }
  }

  const store = useLorebookStore();
  const eventsStore = useEventsStore();

  const currentLorebook = computed(() => store.currentLorebook);

  const getEntryLevel = (entryId: string): number => {
    const lb = currentLorebook.value;
    if (!lb) return 0;
    return entryLevelOf(lb.entries, entryId);
  };

  // ── F17.1 事件管理 ──

  const triggerTypeOptions: { value: TriggerConditionType; label: string; desc: string }[] = [
    { value: 'keyword', label: t('wbEvents.triggerKeyword'), desc: t('wbEvents.triggerKeywordDesc') },
    { value: 'dependency', label: t('wbEvents.triggerDependency'), desc: t('wbEvents.triggerDependencyDesc') },
    { value: 'manual', label: t('wbEvents.triggerManual'), desc: t('wbEvents.triggerManualDesc') },
  ];

  const eventStateOptions: { value: EventState; label: string; color: string }[] = [
    { value: 'pending', label: t('wbEvents.statePending'), color: 'var(--muted-foreground)' },
    { value: 'active', label: t('wbEvents.stateActive'), color: 'var(--success)' },
    { value: 'completed', label: t('wbEvents.stateCompleted'), color: 'var(--tag-blue)' },
    { value: 'failed', label: t('wbEvents.stateFailed'), color: 'var(--error)' },
  ];

  const selectedEvent = computed<StoryEvent | null>(() => {
    if (!selectedEventId.value) return null;
    return eventsStore.getEvent(selectedEventId.value) ?? null;
  });

  // 当前 Lorebook 下可作为事件绑定场景的条目（Region / Sub-area，即 level>=1）
  const sceneOptions = computed(() => {
    const lb = currentLorebook.value;
    if (!lb) return [];
    return lb.entries.filter((e) => getEntryLevel(e.id) >= 1);
  });

  function stateLabel(state: EventState): string {
    return eventStateOptions.find((o) => o.value === state)?.label ?? state;
  }

  function stateColor(state: EventState): string {
    return eventStateOptions.find((o) => o.value === state)?.color ?? 'var(--muted-foreground)';
  }

  function triggerTypeLabel(triggerType: TriggerConditionType): string {
    return triggerTypeOptions.find((o) => o.value === triggerType)?.label ?? triggerType;
  }

  function getSceneName(sceneEntryId: string | null): string {
    if (sceneEntryId === null) return t('wbEvents.globalScene');
    const lb = currentLorebook.value;
    if (!lb) return t('wbEvents.unknownScene');
    const entry = lb.entries.find((e) => e.id === sceneEntryId);
    return entry?.title ?? t('wbEvents.unknownScene');
  }

  function createNewGlobalEvent() {
    if (!currentLorebook.value) return;
    clearFieldState();
    const id = eventsStore.createEvent(currentLorebook.value.id, null, null);
    if (id) {
      selectedEventId.value = id;
    }
  }

  function createNewEventForScene(sceneEntryId: string) {
    if (!currentLorebook.value) return;
    clearFieldState();
    const sceneName = getSceneName(sceneEntryId);
    const id = eventsStore.createEvent(currentLorebook.value.id, sceneEntryId, sceneName);
    if (id) {
      selectedEventId.value = id;
    }
  }

  function selectEvent(id: string) {
    clearFieldState();
    selectedEventId.value = id;
  }

  function deleteSelectedEvent() {
    if (!selectedEventId.value) return;
    eventsStore.deleteEvent(selectedEventId.value);
    selectedEventId.value = null;
    clearFieldState();
  }

  function keywordText(): string {
    if (keywordDraft.value !== null) return keywordDraft.value;
    const trig = selectedEvent.value?.trigger;
    return trig?.type === 'keyword' ? keywordsToString(trig.keywords) : '';
  }

  /**
   * 字段编辑统一走这条：一律静默。
   *
   * 面板监听 `lastInfo` 弹成功提示，逐字段输入若各写一次 `lastInfo`，
   * 敲四个字就弹四条"已更新"；而事件名还没填时那句提示会显示成"已更新 "。
   * 编辑本来就不该有反馈，要反馈的是"触发/完成/删除"这类离散动作。
   *
   * @param fieldKey 被拒时挂在哪个字段上做可见标注（默认取 patch 的第一个键）
   * @param onCommitted 写入成功后的收尾（如清掉本地草稿）；被拒时不调用，草稿留着
   */
  function patchEvent(
    patch: StoryEventPatch,
    fieldKey?: string,
    onCommitted?: () => void
  ): void {
    if (!selectedEvent.value) return;
    const ok = eventsStore.updateEvent(selectedEvent.value.id, patch, { silent: true });
    const key = fieldKey ?? Object.keys(patch)[0] ?? '';
    if (ok) {
      delete rejectedFields.value[key];
      onCommitted?.();
    } else {
      rejectedFields.value[key] = eventsStore.lastError ?? '';
    }
  }

  function onEventNameInput(e: Event) {
    patchEvent({ name: (e.target as HTMLInputElement).value }, 'name');
  }

  function onEventDescriptionInput(e: Event) {
    patchEvent({ description: (e.target as HTMLTextAreaElement).value }, 'description');
  }

  function onEventSceneChange(e: Event) {
    if (!selectedEvent.value) return;
    const raw = (e.target as HTMLSelectElement).value;
    const sceneEntryId = raw === '' ? null : raw;
    const sceneName = sceneEntryId === null ? null : getSceneName(sceneEntryId);
    patchEvent({ sceneEntryId, sceneName }, 'scene');
  }

  function onTriggerTypeChange(e: Event) {
    if (!selectedEvent.value) return;
    keywordDraft.value = null;
    const type = (e.target as HTMLSelectElement).value as TriggerConditionType;
    let trigger: TriggerCondition;
    if (type === 'keyword') {
      trigger = { type: 'keyword', keywords: [], useRegex: false, caseSensitive: false };
    } else if (type === 'dependency') {
      trigger = { type: 'dependency', requiredEvents: [] };
    } else if (type === 'manual') {
      trigger = { type: 'manual' };
    } else {
      trigger = { type: 'time', storyTime: '' };
    }
    patchEvent({ trigger }, 'trigger');
  }

  function onEventKeywordsInput(e: Event) {
    if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'keyword') return;
    const raw = (e.target as HTMLInputElement).value;
    keywordDraft.value = raw;
    patchEvent(
      { trigger: { ...selectedEvent.value.trigger, keywords: splitKeywords(raw) } },
      'trigger',
      () => {
        keywordDraft.value = null;
      }
    );
  }

  function onEventUseRegexChange(e: Event) {
    if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'keyword') return;
    // 勾选作用在"框里现在显示的那串"上，而不是 store 里那份——否则草稿会被这次写回抹掉
    const keywords = splitKeywords(keywordText());
    patchEvent(
      { trigger: { ...selectedEvent.value.trigger, keywords, useRegex: (e.target as HTMLInputElement).checked } },
      'trigger'
    );
  }

  function onEventCaseSensitiveChange(e: Event) {
    if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'keyword') return;
    const keywords = splitKeywords(keywordText());
    patchEvent({
      trigger: { ...selectedEvent.value.trigger, keywords, caseSensitive: (e.target as HTMLInputElement).checked },
    });
  }

  function onEventRequiredEventsInput(e: Event) {
    if (!selectedEvent.value || selectedEvent.value.trigger.type !== 'dependency') return;
    const raw = (e.target as HTMLInputElement).value;
    const requiredEvents = raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
    patchEvent({ trigger: { ...selectedEvent.value.trigger, requiredEvents } });
  }

  function onEventProbabilityInput(e: Event) {
    if (!selectedEvent.value) return;
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) patchEvent({ probability: value }, 'probability');
  }

  function onEventRepeatableChange(e: Event) {
    patchEvent({ repeatable: (e.target as HTMLInputElement).checked }, 'repeatable');
  }

  function onEventManualOnlyChange(e: Event) {
    if (!selectedEvent.value) return;
    const manualOnly = (e.target as HTMLInputElement).checked;
    const completion: CompletionCondition = manualOnly
      ? { manualOnly: true }
      : { manualOnly: false, keywords: [], useRegex: false };
    patchEvent({ completion }, 'completion');
  }

  function onEventCompletionKeywordsInput(e: Event) {
    if (!selectedEvent.value) return;
    const raw = (e.target as HTMLInputElement).value;
    const keywords = raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
    const completion: CompletionCondition = {
      manualOnly: false,
      keywords,
      useRegex: selectedEvent.value.completion.useRegex ?? false,
    };
    patchEvent({ completion }, 'completion');
  }

  function triggerSelectedEvent() {
    if (!selectedEvent.value) return;
    eventsStore.triggerEvent(selectedEvent.value.id);
  }

  function completeSelectedEvent() {
    if (!selectedEvent.value) return;
    eventsStore.completeEvent(selectedEvent.value.id);
  }

  function resetSelectedEvent() {
    if (!selectedEvent.value) return;
    eventsStore.resetEvent(selectedEvent.value.id);
  }

  function failSelectedEvent() {
    if (!selectedEvent.value) return;
    eventsStore.failEvent(selectedEvent.value.id);
  }

  /** 顶部"为场景添加事件"下拉：选中场景后创建事件并重置 */
  function onNewEventSceneChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const sceneEntryId = select.value;
    if (sceneEntryId === '') return;
    createNewEventForScene(sceneEntryId);
    select.value = '';
  }

  /** 当前选中事件是否可手动触发 */
  const canTriggerSelected = computed(() => {
    const evt = selectedEvent.value;
    if (!evt) return false;
    if (evt.state === 'pending') return true;
    if (evt.state === 'completed' && evt.repeatable) return true;
    return false;
  });

  function formatEventTime(iso: string): string {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  }

  return {
    eventsStore,
    currentLorebook,
    getEntryLevel,
    levelLabel,
    triggerTypeOptions,
    eventStateOptions,
    selectedEventId,
    rejectedFields,
    selectedEvent,
    sceneOptions,
    stateLabel,
    stateColor,
    triggerTypeLabel,
    getSceneName,
    keywordsToString,
    keywordText,
    clearFieldState,
    showEventsToast,
    createNewGlobalEvent,
    createNewEventForScene,
    selectEvent,
    deleteSelectedEvent,
    patchEvent,
    onEventNameInput,
    onEventDescriptionInput,
    onEventSceneChange,
    onTriggerTypeChange,
    onEventKeywordsInput,
    onEventUseRegexChange,
    onEventCaseSensitiveChange,
    onEventRequiredEventsInput,
    onEventProbabilityInput,
    onEventRepeatableChange,
    onEventManualOnlyChange,
    onEventCompletionKeywordsInput,
    triggerSelectedEvent,
    completeSelectedEvent,
    resetSelectedEvent,
    failSelectedEvent,
    onNewEventSceneChange,
    canTriggerSelected,
    formatEventTime,
    toastOpen,
    toastType,
    toastMessage,
  };
}

type WorldBookEventsContext = ReturnType<typeof createWorldBookEvents>;

/** 面板实例级上下文键：列表与编辑器按它取同一份状态 */
const EVENTS_CTX: InjectionKey<WorldBookEventsContext> = Symbol('wbEvents');

/** 只该在面板 setup 里调一次 */
export function provideWorldBookEvents(): WorldBookEventsContext {
  const ctx = createWorldBookEvents();
  provide(EVENTS_CTX, ctx);
  return ctx;
}

export function useWorldBookEvents(): WorldBookEventsContext {
  const ctx = inject(EVENTS_CTX, null);
  if (!ctx) throw new Error('useWorldBookEvents() 必须在 WorldBookEventsPanel 子树内调用');
  return ctx;
}
