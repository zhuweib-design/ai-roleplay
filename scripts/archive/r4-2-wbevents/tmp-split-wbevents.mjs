#!/usr/bin/env node
/**
 * 临时生成器：R4-2 拆分 WorldBookEventsPanel（1160 行）
 *
 * 与 R4-1 同一套方法：模板与样式**按行号精确切片**，不做手工重写；
 * script 手写（状态要按"共享 / 独占"重新归位）。
 *
 * 用法：node scripts/archive/r4-2-wbevents/tmp-split-wbevents.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
/**
 * 切片基准必须读**归档副本**，不能读仓库里那份 —— 本脚本会把源文件覆写成
 * 拆分后的宿主。第二次跑时若仍读源文件，行号早就对不上了（398 行以后不存在），
 * 切片静默返回空串，产出"样式与模板全丢但语法仍合法"的文件。
 */
const REL = 'scripts/archive/r4-2-wbevents/WorldBookEventsPanel.orig.vue.txt';
const TARGET = 'src/components/worldbook/WorldBookEventsPanel.vue';
const raw = readFileSync(resolve(ROOT, REL), 'utf8');
const L = raw.split('\n'); // LF，索引 = 行号 - 1
const DRY = process.argv.includes('--dry');

/** 切片；越界或切空一律抛错——静默返回空串会产出"语法合法但内容全丢"的文件 */
const slice = (a, b) => {
  if (b > L.length) throw new Error(`切片 ${a}-${b} 越界（基准仅 ${L.length} 行）`);
  const out = L.slice(a - 1, b).join('\n');
  if (!out.trim()) throw new Error(`切片 ${a}-${b} 为空`);
  return out;
};
const seg = (arr) => arr.map(([a, b]) => slice(a, b)).join('\n');

/** 整段去缩进 n 个空格（只动有缩进的行，空行原样） */
function dedent(text, n) {
  return text
    .split('\n')
    .map((l) => {
      if (!l.trim()) return l;
      let k = 0;
      while (k < n && l[k] === ' ') k++;
      return l.slice(k);
    })
    .join('\n');
}

/** 把一段 scoped 样式里的每条规则包成 `<prefix> :deep(sel)` */
function deepify(text, prefix) {
  const out = [];
  let selBuf = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '') {
      out.push(line);
      continue;
    }
    // 整行注释：原样保留并清空 pending（否则会被吞进选择器，整条规则在浏览器里无效）
    if (t.startsWith('/*') && t.endsWith('*/')) {
      if (selBuf.length) {
        out.push(...selBuf);
        selBuf = [];
      }
      out.push(line);
      continue;
    }
    if (/^@(media|supports|container|layer)\b/.test(t)) {
      out.push(line);
      continue;
    }
    if (t.includes('{')) {
      const head = (selBuf.length ? selBuf.join('\n') + '\n' : '') + line;
      selBuf = [];
      const idx = head.lastIndexOf('{');
      const selPart = head.slice(0, idx);
      const rest = head.slice(idx).trim();
      const indent = line.match(/^[ \t]*/)[0];
      const parts = selPart
        .split(',')
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      out.push(indent + parts.map((p) => `${prefix} :deep(${p})`).join(',\n' + indent) + ' ' + rest);
      continue;
    }
    if (t === '}') {
      out.push(line);
      continue;
    }
    if (t.includes(':') && !t.startsWith('.') && !t.startsWith(',')) {
      out.push(line);
      continue;
    }
    selBuf.push(line);
  }
  if (selBuf.length) out.push(...selBuf);
  return out.join('\n');
}

/* ═══════════════════════ 1. 共享状态与操作 ═══════════════════════ */

const composableRaw = `/**
 * WorldBook 事件面板的共享状态与操作（R4-2 拆分）
 *
 * 宿主、列表、编辑器必须看到同一个 \`selectedEventId\` / \`rejectedFields\` /
 * \`keywordDraft\` —— 各自调普通 composable 会各持一份 ref，点列表编辑器不切过去；
 * 但也不能走模块级单例：模块作用域的 ref 会被同页面里**所有**面板实例共享，
 * 包括已经脱离 DOM 却还没销毁的实例（单测里连续 mount 不复用），一个实例弹 toast
 * 会让另一个实例跟着重渲染，落到已卸载的锚点上就是 \`insertBefore of null\`。
 *
 * 所以用 \`provide/inject\`：状态随面板实例生灭，宿主 setup 里 provide 一次，
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

// ── 面板实例状态（provide 给列表与编辑器的同一份） ──

const selectedEventId = ref<string | null>(null);

/**
 * 写入被拒的字段 → 原因。store 没收下这个值时，面板必须说出来：
 * toast 只闪一次，这条标注是一直挂着的（配合红框与 aria-invalid）。
 *
 * 这两个 ref 必须声明在宿主的 \`watch(..., { immediate: true })\` 之前——
 * immediate 回调在 setup 阶段就会跑一次，碰到后面的 \`const\` 会直接踩空引用。
 * （工厂先建完这份状态才返回，宿主拿到时它们已经就位。）
 */
const rejectedFields = ref<Record<string, string>>({});

/**
 * 关键词输入框的本地草稿。
 *
 * 名称与描述有 \`maxlength\` 兜着、概率是 range，三者都到不了"被 store 拒绝"；
 * 唯一能拒的是"使用正则 + 非法表达式"。而 \`:value\` 单向绑定在写入被拒时会把用户
 * 刚打的字**直接吞掉**（真实浏览器实测：打 \`(\` 之后框里是空的），所以这一格以草稿
 * 为准显示，草稿只在写入成功时清掉。
 */
const keywordDraft = ref<string | null>(null);

// ── Toast（自包含，宿主渲染） ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

export function showEventsToast(type: 'info' | 'success' | 'error', message: string): void {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

/** 换事件 / 换世界书 / 删事件：草稿与"未保存"标注都属于上一条，不能带过去 */
export function clearFieldState(): void {
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
    default: return \`L\${level}\`;
  }
}

export function useWorldBookEvents() {
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
   * 面板监听 \`lastInfo\` 弹成功提示，逐字段输入若各写一次 \`lastInfo\`，
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
      return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
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
`;

/**
 * 把字面量拆成「外壳（注释 + import）+ 工厂体」。
 *
 * 字面量里那一段本来是 `useWorldBookEvents()` 的自包含实现，这里把它整体
 * 收进 `createWorldBookEvents()`：去掉旧函数的签名与收尾大括号、清掉嵌套的
 * `export`（函数体内写 export 是语法错误）、整体再缩进 2 格。
 */
const STATE_MARK = '// ── 面板实例状态（provide 给列表与编辑器的同一份） ──';
const stateIdx = composableRaw.indexOf(STATE_MARK);
if (stateIdx < 0) throw new Error('composable 里找不到状态分段标记');

const ctxExports = `type WorldBookEventsContext = ReturnType<typeof createWorldBookEvents>;

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
`;

const ctxBody = (() => {
  const FN_MARK = 'function useWorldBookEvents() {\n';
  const tail = composableRaw
    .slice(stateIdx)
    .replace(/^export function /gm, 'function ');
  const fi = tail.indexOf(FN_MARK);
  if (fi < 0) throw new Error('composable 里找不到旧函数签名');
  // 原来在模块作用域的部分（状态 + 纯函数）：整体进工厂，缩进 +2
  const partA = tail
    .slice(0, fi)
    .split('\n')
    .map((l) => (l.trim() ? '  ' + l : l))
    .join('\n');
  // 原来是函数体的部分：本来就缩进 2，去掉签名与收尾大括号后正好是工厂体
  const partB = tail.slice(fi + FN_MARK.length).replace(/\n\}\n$/, '\n');
  return partA + partB;
})();

const composable = `${composableRaw.slice(0, stateIdx)}export function createWorldBookEvents() {
${ctxBody}}

${ctxExports}`;
/* ═══════════════════════ 2. 宿主 ═══════════════════════ */

const hostScript = `<script setup lang="ts">
/**
 * WorldBookEventsPanel — 世界书「事件管理」面板（P2-7 拆分；R4-2 二次拆分）
 *
 * 自 WorldBookView.vue 迁出：F17.1 事件列表 + 事件编辑器（触发条件/完成条件）。
 *
 * R4-2 把三件事分开：本书只剩**外壳 + 副作用**（section 骨架、页头动作、空态、
 * 内容网格、Toast，以及两处 watch），列表与编辑器各自成组件。
 * 共享状态在 \`useWorldBookEvents\` 的模块级单例里，子组件直接取用、零 props 传递
 * （编辑器只收一个 \`event\` prop 用来在模板里排除 null）。
 */
import { watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import { t } from '@/i18n';
import { provideWorldBookEvents } from './useWorldBookEvents';
import WorldBookEventList from './WorldBookEventList.vue';
import WorldBookEventEditor from './WorldBookEventEditor.vue';

const {
  eventsStore,
  currentLorebook,
  selectedEventId,
  selectedEvent,
  sceneOptions,
  levelLabel,
  getEntryLevel,
  clearFieldState,
  showEventsToast,
  createNewGlobalEvent,
  onNewEventSceneChange,
  toastOpen,
  toastType,
  toastMessage,
} = provideWorldBookEvents();

// 监听 currentLorebook 同步到 eventsStore
watch(
  () => currentLorebook.value?.id,
  (id) => {
    eventsStore.setCurrentLorebook(id ?? null);
    selectedEventId.value = null;
    clearFieldState();
  },
  { immediate: true }
);

// 监听 eventsStore 错误/提示
watch(
  () => eventsStore.lastError,
  (err) => {
    if (err) showEventsToast('error', err);
  }
);
watch(
  () => eventsStore.lastInfo,
  (info) => {
    if (info) showEventsToast('success', info);
  }
);
</script>`;

const hostTemplate = `<template>
  <!-- F17.1 事件管理 -->
  <section class="events-section" :aria-label="t('wbEvents.aria')">
${dedent(slice(398, 436), 8)}

    <div v-else class="events-content">
      <WorldBookEventList />
      <WorldBookEventEditor v-if="selectedEvent" :event="selectedEvent" />
${dedent(slice(761, 764), 8)}
    </div>
  </section>

  <!-- 自包含 Toast -->
  <Toast
    v-model="toastOpen"
    :message="toastMessage"
    :type="toastType"
  />
</template>`;

const hostOwnCss = seg([
  [777, 786], // .events-section
  [788, 794], // .events-header
  [796, 803], // h2
  [805, 810], // .events-actions
  [812, 815], // .scene-select-label
  [817, 822], // .scene-select
  [836, 849], // .events-empty + .hint
  [851, 856], // .events-content
  [1111, 1122], // .event-editor-empty
]);

const hostSharedCss = deepify(seg([[942, 959]]), '.events-section'); // .event-state-badge + 3 state

const hostCss = `${hostOwnCss}

/* ── 共用：状态徽标（列表条目与编辑器页头各一处） ──
 * 放在宿主单点定义再用 :deep() 贯穿：两处各自带一份会让规则数翻倍，
 * 而它们必须逐字一致（同一状态在两个位置不能是两种颜色）。 */
${hostSharedCss}

@media (max-width: 640px) {
  .events-content {
    grid-template-columns: 1fr;
  }
  .events-header {
    align-items: stretch;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .scene-select {
    font-size: 16px;
  }
}`;

const hostFile = `${hostScript}

${hostTemplate}

<style scoped>
${hostCss}
</style>`;

/* ═══════════════════════ 3. 列表 ═══════════════════════ */

const listScript = `<script setup lang="ts">
/**
 * 世界书事件列表（R4-2 从 WorldBookEventsPanel 拆出）
 *
 * 纯展示 + 选中：分组数据来自 eventsStore.eventsByScene，选中态落在
 * useWorldBookEvents 的模块级 selectedEventId 上，编辑器读同一个。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { useWorldBookEvents } from './useWorldBookEvents';

const {
  eventsStore,
  selectedEventId,
  getSceneName,
  triggerTypeLabel,
  stateLabel,
  stateColor,
  selectEvent,
} = useWorldBookEvents();
</script>`;

const listTemplate = `<template>
${dedent(slice(439, 472), 12)}
</template>`;

const listCss = `${seg([
  [858, 864], // .events-list-panel
  [866, 872], // .event-group / last-child
  [874, 886], // .event-group-header
  [888, 895], // .group-count
  [897, 911], // .event-item
  [913, 917], // hover
  [919, 922], // .event-item.active
  [924, 929], // .event-name
  [931, 936], // .event-meta
  [938, 940], // .event-trigger-type
])}

@media (max-width: 640px) {
  .events-list-panel {
    max-height: 240px;
  }
}`;

const listFile = `${listScript}

${listTemplate}

<style scoped>
${listCss}
</style>`;

/* ═══════════════════════ 4. 编辑器 ═══════════════════════ */

const editorScript = `<script setup lang="ts">
/**
 * 世界书事件编辑器（R4-2 从 WorldBookEventsPanel 拆出）
 *
 * 所有字段走 \`patchEvent\`：写入被拒时**不让输入框回退**，而是留在原地标红并把
 * 原因挂在字段上（\`rejectedFields\`）。状态与 handler 都来自 useWorldBookEvents
 * 的模块级单例，与列表共用同一个选中事件。
 *
 * 唯一的 prop 是 \`event\`：宿主的 \`v-if\` 已经保证非空，收成 prop 是为了在模板里
 * 直接写 \`event.name\` 而不必每处都 \`?.\`（这也让 vue-tsc 不必为 null 分支做窄化）。
 */
import FormField from '@/components/common/FormField.vue';
import Icon from '@/components/common/Icon.vue';
import type { StoryEvent } from '@/core/event-types';
import { t } from '@/i18n';
import { useWorldBookEvents } from './useWorldBookEvents';

defineProps<{ event: StoryEvent }>();

const {
  rejectedFields,
  keywordText,
  triggerTypeOptions,
  sceneOptions,
  levelLabel,
  getEntryLevel,
  keywordsToString,
  stateLabel,
  stateColor,
  canTriggerSelected,
  formatEventTime,
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
  deleteSelectedEvent,
} = useWorldBookEvents();
</script>`;

/** 474-478 原本是带 v-if 的多行 <section>，v-if 已移到宿主，收成单行 */
const EDITOR_SECTION_OPEN = `  <section class="event-editor-panel" :aria-label="t('wbEvents.editorAria')">`;

/** 758 是 `.event-editor-grid` 的收尾 `</div>`；759 的 `</section>` 由下面补，否则重复 */
let editorBody = dedent(slice(479, 758), 12);
// 宿主已保证非空：去掉模板里所有 selectedEvent 的存在性判断
editorBody = editorBody
  .replace(/v-if="selectedEvent && selectedEvent\.trigger\.type === 'keyword'"/g, `v-if="event.trigger.type === 'keyword'"`)
  .replace(/v-if="selectedEvent && selectedEvent\.trigger\.type === 'dependency'"/g, `v-if="event.trigger.type === 'dependency'"`)
  .replace(/v-if="selectedEvent && !selectedEvent\.completion\.manualOnly"/g, `v-if="!event.completion.manualOnly"`)
  .replace(/selectedEvent\?\./g, 'event.')
  .replace(/selectedEvent\./g, 'event.');

const editorTemplate = `<template>
${EDITOR_SECTION_OPEN}
${editorBody}
  </section>
</template>`;

const editorCss = seg([
  [961, 968], // .event-editor-panel
  [970, 978], // .event-editor-header
  [980, 984], // h3
  [986, 990], // .event-editor-grid
  [992, 996], // .form-row
  [998, 1002], // .form-row-inline
  [1004, 1008], // .form-label
  [1015, 1021], // .checkbox-row
  [1023, 1030], // checkbox-label 组
  [1032, 1039], // .is-rejected（含说明注释）
  [1041, 1048], // .state-row
  [1050, 1054], // .event-state-actions
  [1056, 1097], // .action-btn.trigger/complete/reset/fail + hover
  [1099, 1104], // .form-row-actions
  [1106, 1109], // .form-meta
]);

const editorFile = `${editorScript}

${editorTemplate}

<style scoped>
${editorCss}
</style>`;

/* ═══════════════════════ 写出 ═══════════════════════ */

const writes = [
  ['src/components/worldbook/useWorldBookEvents.ts', composable],
  [TARGET, hostFile],
  ['src/components/worldbook/WorldBookEventList.vue', listFile],
  ['src/components/worldbook/WorldBookEventEditor.vue', editorFile],
];

let total = 0;
for (const [path, body] of writes) {
  const n = body.split('\n').length;
  total += n;
  if (DRY) {
    console.log(`\n===== ${path} (${n} 行) =====`);
    console.log(body.slice(0, 300) + '\n  …');
  } else {
    writeFileSync(resolve(ROOT, path), body, 'utf8');
    console.log(`写入 ${path}  ${n} 行`);
  }
}
console.log(`\n合计 ${total} 行（原 ${L.length} 行，Δ ${total - L.length}）`);
console.log(`删除的死样式行：.sr-only 824-834（全局 base.css 已有 !important 版）、`);
console.log(`.event-editor-grid .form-hint 1010-1013（FormField 渲染的是 .form-field-hint）、`);
console.log(`.entries-layout / .entries-list-panel 1136-1151（模板中从无）`);
