<script setup lang="ts">
/**
 * RandomEventsView — 随机事件管理页面 (F17.3, v1.1 新增)
 *
 * 功能：
 * - 全局生成器配置（开关、默认概率、冷却、反馈步长）
 * - 事件模板管理（CRUD、启用/禁用、参数调整）
 * - 场景级配置（每场景开关、概率覆盖、类别过滤、严重度上限）
 * - 生成结果历史与反馈（点赞/点踩，自动调整模板概率）
 * - 统计面板（按类别/严重度/反馈）
 *
 * 无障碍：
 * - 语义化 main/header/section
 * - Tab 使用 role="tablist"/"tab"/"tabpanel"，aria-selected/aria-controls
 * - 表单字段 label 关联
 * - 图标按钮 aria-label
 * - Modal 焦点陷阱（通过 Modal 组件）
 * - Toast role=alert 反馈
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import PrereqNotice from '@/components/common/PrereqNotice.vue';
import { useRandomEventPrereqs } from '@/composables/useReadiness';
import Toast from '@/components/common/Toast.vue';
import RandomEventsTemplatesPanel from './RandomEventsTemplatesPanel.vue';
import RandomEventsScenesPanel from './RandomEventsScenesPanel.vue';
import RandomEventsGeneratorPanel from './RandomEventsGeneratorPanel.vue';
import RandomEventsResultsPanel from './RandomEventsResultsPanel.vue';
import { t } from '@/i18n';

const router = useRouter();
const store = useRandomEventsStore();
const prereqRows = useRandomEventPrereqs();

// ── Tab ──
type TabKey = 'templates' | 'scenes' | 'generator' | 'results';
const activeTab = ref<TabKey>('templates');
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'templates', label: t('re.tabTemplates') },
  { key: 'scenes', label: t('re.tabScenes') },
  { key: 'generator', label: t('re.tabGenerator') },
  { key: 'results', label: t('re.tabResults') },
];

// ── Toast ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(type: typeof toastType.value, message: string): void {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastOpen.value = false;
  }, 2500);
}

// generatorForm 已下放 GeneratorPanel，其 enabled 由面板 watch store 同步
function toggleGenerator(): void {
  store.toggleGenerator();
  showToast(
    'success',
    store.generatorConfig.enabled ? t('re.generatorEnabled') : t('re.generatorDisabled')
  );
}

// ── 返回 ──
function goBack(): void {
  if (window.history.state?.back) {
    void router.back();
  } else {
    void router.push({ name: 'chat' });
  }
}
</script>

<template>
  <div class="random-events-view">
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn"
          :aria-label="t('re.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="18" aria-hidden="true" />
        </button>
        <h1>{{ t('re.title') }}</h1>
        <span class="header-tag" :class="{ enabled: store.generatorConfig.enabled }">
          {{ store.generatorConfig.enabled ? t('re.enabled') : t('re.disabled') }}
        </span>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="header-btn primary"
          :aria-pressed="store.generatorConfig.enabled"
          @click="toggleGenerator"
        >
          <Icon :name="store.generatorConfig.enabled ? 'stop' : 'play'" :size="16" aria-hidden="true" />
          {{ store.generatorConfig.enabled ? t('re.stop') : t('re.start') }}
        </button>
      </div>
    </header>

    <!-- E10：场景名与角色名是字符串耦合，改名即断链——这条前提此前只写在代码注释里 -->
    <PrereqNotice :rows="prereqRows" />

    <nav class="tabs" role="tablist" :aria-label="t('re.tabsAria')">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :id="`tab-${tab.key}`"
        :aria-selected="activeTab === tab.key"
        :aria-controls="`panel-${tab.key}`"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'templates'" class="tab-count">{{ store.templates.length }}</span>
        <span v-if="tab.key === 'scenes'" class="tab-count">{{ store.sceneConfigList.length }}</span>
        <span v-if="tab.key === 'results'" class="tab-count">{{ store.results.length }}</span>
      </button>
    </nav>

    <main class="page-body">
      <RandomEventsTemplatesPanel
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
      />
    </main>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.random-events-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--background);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
}

.header-tag {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.header-tag.enabled {
  background: var(--success-bg, rgba(34, 197, 94, 0.15));
  color: var(--success-fg, #22c55e);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover {
    background: var(--card-elevated);
  }
}

.header-btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .header-btn.primary:hover {
    filter: brightness(1.1);
  }
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
  padding: 0 20px;
}

.tab {
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .tab:hover {
    color: var(--foreground);
  }
}

.tab.active {
  color: var(--primary-fg, var(--primary));
  border-bottom-color: var(--primary);
}

.tab-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  align-items: center;
  justify-content: center;
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  border-radius: 9px;
}

.tab.active .tab-count {
  background: var(--primary);
  color: var(--on-primary);
}

/* Body */
.page-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.panel {
  max-width: 960px;
  margin: 0 auto;
}


:deep(.panel-toolbar) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

:deep(.panel-hint) {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  flex: 1;
  min-width: 200px;
}

:deep(.btn) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  :deep(.btn:hover) {
    background: var(--card-elevated);
  }
}

:deep(.btn.primary) {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  :deep(.btn.primary:hover) {
    filter: brightness(1.1);
  }
}

:deep(.btn.danger-outline) {
  color: var(--danger-fg);
  border-color: var(--danger-border);
}

@media (hover: hover) and (pointer: fine) {
  :deep(.btn.danger-outline:hover) {
    background: var(--danger-bg);
  }
}

/* 模板列表 */
.template-list,
.scene-list,
:deep(.result-list) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-card,
.scene-card,
:deep(.result-card) {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .template-card:hover,
  :deep(.scene-card:hover) {
    border-color: var(--primary-fg, var(--primary));
  }
}

.template-card.disabled,
:deep(.scene-card.disabled) {
  opacity: 0.6;
}

:deep(.card-header) {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

:deep(.card-title) {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

:deep(.title-text) {
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}

:deep(.badge) {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

:deep(.badge.category) {
  background: color-mix(in srgb, var(--tag-purple) 15%, transparent);
  color: var(--tag-purple);
}

:deep(.badge.severity) {
  background: color-mix(in srgb, var(--warning-fg) 15%, transparent);
  color: var(--warning-text);
}

:deep(.badge.severity[data-sev='major']) {
  background: color-mix(in srgb, var(--accent-orange) 15%, transparent);
  color: var(--accent-orange-text);
}

:deep(.badge.severity[data-sev='critical']) {
  background: color-mix(in srgb, var(--danger-fg) 15%, transparent);
  color: var(--danger-fg);
}

:deep(.badge.on) {
  background: color-mix(in srgb, var(--success-fg) 15%, transparent);
  color: var(--success-fg);
}

:deep(.badge.off) {
  background: color-mix(in srgb, var(--tag-gray) 15%, transparent);
  color: var(--tag-gray);
}

:deep(.card-actions) {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

:deep(.icon-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--size-control-sm);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  :deep(.icon-btn:hover) {
    background: var(--card-elevated);
    color: var(--foreground);
  }
}

@media (hover: hover) and (pointer: fine) {
  :deep(.icon-btn.danger:hover) {
    color: var(--danger-fg);
    background: var(--danger-bg);
  }
}

:deep(.card-desc) {
  margin: 0 0 10px 0;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.5;
}

:deep(.card-meta) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px 12px;
  margin: 0;
}

:deep(.card-meta > div) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

:deep(.card-meta dt) {
  font-size: 11px;
  color: var(--muted-foreground);
}

:deep(.card-meta dd) {
  margin: 0;
  font-size: 13px;
  color: var(--foreground);
}

/* 响应式 */
@media (max-width: 640px) {
  .page-header {
    padding: 10px 14px;
  }

  .tabs {
    padding: 0 8px;
    overflow-x: auto;
  }

  .tab {
    padding: 10px 12px;
    font-size: 12px;
    white-space: nowrap;
  }

  .page-body {
    padding: 14px;
  }

  :deep(.card-meta) {
    grid-template-columns: 1fr 1fr;
  }
}

</style>
