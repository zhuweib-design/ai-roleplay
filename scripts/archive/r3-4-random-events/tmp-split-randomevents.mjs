// R3-4 切片生成器：RandomEventsView.vue 1268 行 → 宿主 + 4 面板 + shared
// 铁律：基准只读归档副本；slice 越界/切空直接抛错。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const REL = 'scripts/archive/r3-4-random-events/RandomEventsView.orig.vue.txt';
const L = readFileSync(resolve(ROOT, REL), 'utf8').split('\n');

function slice(a, b) {
  if (a < 1 || b > L.length) throw new Error(`切片 ${a}-${b} 越界（基准仅 ${L.length} 行）`);
  if (b < a) throw new Error(`切片 ${a}-${b} 参数反了`);
  const out = L.slice(a - 1, b).join('\n');
  if (!out.trim()) throw new Error(`切片 ${a}-${b} 为空`);
  return out;
}

function dedent(text, n = 4) {
  const pad = ' '.repeat(n);
  return text
    .split('\n')
    .map((line) => (line.startsWith(pad) ? line.slice(n) : line))
    .join('\n');
}

function stripVShow(text) {
  const out = text
    .split('\n')
    .filter((line) => !/^\s*v-show="activeTab === '[a-z]+'"(\s*)$/.test(line))
    .join('\n');
  if (/activeTab/.test(out)) throw new Error('stripVShow 之后仍残留 activeTab 引用');
  return out;
}

// 宿主自身元素的类：plain 保留；其余（服务子组件内部元素）包 :deep()
const PLAIN = new Set([
  'random-events-view', 'page-header', 'header-title', 'header-tag', 'header-actions',
  'header-btn', 'tabs', 'tab', 'tab-count', 'page-body', 'panel',
]);

function wrapDeep(css) {
  const lines = css.split('\n');
  const out = [];
  let selLines = [];
  for (const line of lines) {
    const hasOpen = line.includes('{');
    if (selLines.length === 0 && !hasOpen) { out.push(line); continue; }
    if (!hasOpen) { selLines.push(line); continue; }
    const idx = line.indexOf('{');
    const head = line.slice(0, idx);
    const all = [...selLines, head].join(' ').replace(/\s+/g, ' ').trim();
    if (all.startsWith('@')) { out.push(...selLines, line); selLines = []; continue; }
    const indent = (selLines[0] ?? head).match(/^\s*/)[0];
    const items = all.split(',').map((s) => s.trim()).filter(Boolean);
    const wrapped = items
      .map((it) => {
        const m = it.match(/\.([A-Za-z0-9_-]+)/);
        return m && PLAIN.has(m[1]) ? it : `:deep(${it})`;
      })
      .join(`,\n${indent}`);
    out.push(`${indent}${wrapped} {`);
    selLines = [];
  }
  if (selLines.length) throw new Error(`wrapDeep：文件尾有未闭合选择器 ${selLines.join('|')}`);
  return out.join('\n');
}

// 面板内调用形态改写：getCategoryLabel/getSeverityLabel 加 store 参数（map 传函数名的两处包箭头）
function rewire(text, file) {
  let s = text;
  const n1 = (s.match(/\bgetCategoryLabel\(/g) ?? []).length;
  const n2 = (s.match(/\bgetSeverityLabel\(/g) ?? []).length;
  const n3 = (s.match(/flushStoreMessages\(\);/g) ?? []).length;
  const n5 = (s.match(/showToast\(/g) ?? []).length;
  s = s.replace(/\bgetCategoryLabel\(/g, 'getCategoryLabel(store, ');
  s = s.replace(/\bgetSeverityLabel\(/g, 'getSeverityLabel(store, ');
  s = s.replace(/flushStoreMessages\(\);/g, 'flushStoreMessages(store, notify);');
  s = s.replace(/\bshowToast\(/g, 'notify(');
  return { s, n1, n2, n3, n5 };
}

function write(rel, content) {
  const p = resolve(ROOT, rel);
  mkdirSync(resolve(p, '..'), { recursive: true });
  writeFileSync(p, content, 'utf8');
  console.log(`${rel}: ${content.split('\n').length} 行`);
}

// ── shared ──
write(
  'src/views/random-events-shared.ts',
  `// R3-4 拆分：随机事件页跨面板共享的格式化与消息冲刷（templates / scenes / generator / results 四面板共用）
import type { useRandomEventsStore } from '@/stores/random-events';
import type { RandomEventTemplate } from '@core/random-event-generator';

type RandomEventsStore = ReturnType<typeof useRandomEventsStore>;
export type NotifyFn = (type: 'info' | 'success' | 'error', message: string) => void;

// 原宿主 flushStoreMessages 的 store 消息冲刷：error 优先，两者互斥且都会清空
interface FlushableStore {
  lastError: string | null;
  lastInfo: string | null;
  clearLastError: () => void;
}

export function flushStoreMessages(store: FlushableStore, notify: NotifyFn): void {
  if (store.lastError) {
    notify('error', store.lastError);
    store.clearLastError();
  } else if (store.lastInfo) {
    notify('success', store.lastInfo);
    store.clearLastError();
  }
}

export function getCategoryLabel(
  store: RandomEventsStore,
  cat: RandomEventTemplate['category']
): string {
  return store.CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat;
}

export function getSeverityLabel(
  store: RandomEventsStore,
  sev: RandomEventTemplate['severity']
): string {
  return store.SEVERITY_OPTIONS.find((s) => s.value === sev)?.label ?? sev;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
`
);

// ── 面板 script 切片 + 调用改写 ──
const tplLogic = rewire(slice(82, 122), 'templates');
if (tplLogic.n1 !== 0 || tplLogic.n2 !== 0 || tplLogic.n3 !== 3 || tplLogic.n5 !== 3) {
  throw new Error(`templates 逻辑改写计数异常：cat=${tplLogic.n1} sev=${tplLogic.n2} flush=${tplLogic.n3} toast=${tplLogic.n5}`);
}
const sceneLogic = rewire(slice(124, 160), 'scenes');
if (sceneLogic.n3 !== 3 || sceneLogic.n5 !== 2) {
  throw new Error(`scenes 逻辑改写计数异常：flush=${sceneLogic.n3} toast=${sceneLogic.n5}`);
}
const genLogic = rewire(slice(162, 181), 'generator');
if (genLogic.n3 !== 1 || genLogic.n5 !== 1) {
  throw new Error(`generator 逻辑改写计数异常：flush=${genLogic.n3} toast=${genLogic.n5}`);
}
const resLogic = rewire(slice(193, 209), 'results');
if (resLogic.n3 !== 1 || resLogic.n5 !== 2) {
  throw new Error(`results 逻辑改写计数异常：flush=${resLogic.n3} toast=${resLogic.n5}`);
}

// 模板切片 + map 改写（scenes 卡片里两处 map(getCategoryLabel)）
function rewireTpl(text) {
  let s = text;
  const n4 = (s.match(/map\(getCategoryLabel\)/g) ?? []).length;
  const n1 = (s.match(/(?<![\w$])getCategoryLabel\(/g) ?? []).length;
  const n2 = (s.match(/(?<![\w$])getSeverityLabel\(/g) ?? []).length;
  s = s.replace(/(?<![\w$])getCategoryLabel\(/g, 'getCategoryLabel(store, ');
  s = s.replace(/map\(getCategoryLabel\)/g, 'map((c) => getCategoryLabel(store, c))');
  s = s.replace(/(?<![\w$])getSeverityLabel\(/g, 'getSeverityLabel(store, ');
  if (/map\(\(c\) => getCategoryLabel\(store, store/.test(s)) throw new Error('map 双重改写');
  return { s, n1, n2, n4 };
}

// v-show 在多根组件上不生效（Vue 3 限制：Templates/Scenes 面板带各自的 Modal 是两根），
// 宿主的 v-show 透传会静默失效 ⇒ 四个面板统一包一层根 div，v-show 落在它上面。
const tplT = rewireTpl(stripVShow(dedent(slice(306, 359), 2)));
if (tplT.n1 !== 1 || tplT.n2 !== 1) throw new Error(`templates 模板改写异常 cat=${tplT.n1} sev=${tplT.n2}`);
const sceneT = rewireTpl(stripVShow(dedent(slice(361, 411), 2)));
if (sceneT.n4 !== 2 || sceneT.n1 !== 0 || sceneT.n2 !== 1) {
  throw new Error(`scenes 模板改写异常 map=${sceneT.n4} cat=${sceneT.n1} sev=${sceneT.n2}`);
}
const resT = rewireTpl(stripVShow(dedent(slice(498, 613), 2)));
if (resT.n1 !== 1 || resT.n2 !== 1) throw new Error(`results 模板改写异常 cat=${resT.n1} sev=${resT.n2}`);

const NOTIFY_LINE = `const notify = (type: 'info' | 'success' | 'error', message: string): void =>
  emit('notify', type, message);`;

// ── TemplatesPanel ──
write(
  'src/views/RandomEventsTemplatesPanel.vue',
  `<script setup lang="ts">
import { ref } from 'vue';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TemplateEditorModal from '@/components/random-events/TemplateEditorModal.vue';
import type { RandomEventTemplate } from '@core/random-event-generator';
import { t } from '@/i18n';
import {
  flushStoreMessages,
  formatTime,
  getCategoryLabel,
  getSeverityLabel,
} from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
${NOTIFY_LINE}

${tplLogic.s}

function formatCooldown(ms: number): string {
  if (ms <= 0) return t('re.cooldownNone');
  if (ms < 60_000) return t('re.cooldownSec', { sec: Math.round(ms / 1000) });
  if (ms < 3_600_000) return t('re.cooldownMin', { min: Math.round(ms / 60_000) });
  return t('re.cooldownHour', { hour: (ms / 3_600_000).toFixed(1) });
}
</script>

<template>
  <div>
${tplT.s}

${dedent(slice(616, 621), 0)}
  </div>
</template>
`
);

// ── ScenesPanel ──
write(
  'src/views/RandomEventsScenesPanel.vue',
  `<script setup lang="ts">
import { ref } from 'vue';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import SceneConfigModal from '@/components/random-events/SceneConfigModal.vue';
import type { RandomEventSceneConfig } from '@core/random-event-generator';
import { t } from '@/i18n';
import {
  flushStoreMessages,
  getCategoryLabel,
  getSeverityLabel,
} from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
${NOTIFY_LINE}

${sceneLogic.s}
</script>

<template>
  <div>
${sceneT.s}

${dedent(slice(623, 629), 0)}
  </div>
</template>
`
);

// ── GeneratorPanel（专属样式：原 1008–1074 去 success-hint 死规则 + 1262–1267 i7 兜底）──
write(
  'src/views/RandomEventsGeneratorPanel.vue',
  `<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { flushStoreMessages } from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
${NOTIFY_LINE}

${genLogic.s}

// 原宿主持有 generatorForm 时由 toggleGenerator 直接同步；下放后改经 store 响应
watch(
  () => store.generatorConfig.enabled,
  (v) => {
    generatorForm.value.enabled = v;
  }
);
</script>

<template>
  <div>
${stripVShow(dedent(slice(413, 496), 2))}
  </div>
</template>

<style scoped>
${[slice(1008, 1063), slice(1069, 1074), slice(1262, 1267)].join('\n').replace(/\n{3,}/g, '\n\n')}
</style>
`
);

// ── ResultsPanel（统计 + 结果卡片样式：原 1076–1234）──
write(
  'src/views/RandomEventsResultsPanel.vue',
  `<script setup lang="ts">
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { RandomEventResult, RandomEventFeedback } from '@core/random-event-generator';
import { t } from '@/i18n';
import {
  flushStoreMessages,
  formatTime,
  getCategoryLabel,
  getSeverityLabel,
} from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
${NOTIFY_LINE}

${resLogic.s}
</script>

<template>
  <div>
${resT.s}
  </div>
</template>

<style scoped>
${[slice(1076, 1234)].join('\n')}
</style>
`
);

// ── 宿主 ──
const hostTemplate = [
  slice(251, 305),
  `      <RandomEventsTemplatesPanel
        v-show="activeTab === 'templates'"
        @notify="showToast"
      />
      <RandomEventsScenesPanel
        v-show="activeTab === 'scenes'"
        @notify="showToast"
      />
      <RandomEventsGeneratorPanel
        v-show="activeTab === 'generator'"
        @notify="showToast"
      />
      <RandomEventsResultsPanel
        v-show="activeTab === 'results'"
        @notify="showToast"
      />`,
  slice(614, 615),
  slice(631, 637),
].join('\n');

const hostStyle = [
  slice(639, 783).replace(/\n+$/, ''),
  wrapDeep(slice(784, 1002)),
  wrapDeep(slice(1236, 1260)),
  slice(1268, 1268),
].join('\n\n');

write(
  'src/views/RandomEventsView.vue',
  `<script setup lang="ts">
${slice(2, 19)}
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import PrereqNotice from '@/components/common/PrereqNotice.vue';
import { useRandomEventPrereqs } from '@/core/readiness';
import Toast from '@/components/common/Toast.vue';
import RandomEventsTemplatesPanel from './RandomEventsTemplatesPanel.vue';
import RandomEventsScenesPanel from './RandomEventsScenesPanel.vue';
import RandomEventsGeneratorPanel from './RandomEventsGeneratorPanel.vue';
import RandomEventsResultsPanel from './RandomEventsResultsPanel.vue';
import { t } from '@/i18n';

${slice(38, 66)}

// generatorForm 已下放 GeneratorPanel，其 enabled 由面板 watch store 同步
${slice(184, 191).replace(/\n\s*generatorForm\.value\.enabled = store\.generatorConfig\.enabled;/, '')}

${slice(211, 218)}
</script>

${hostTemplate}

${hostStyle}
`
);

console.log('done');
