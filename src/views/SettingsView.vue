<script setup lang="ts">
import Icon from '@/components/common/Icon.vue';
import SettingsModelPanel from '@/components/settings/SettingsModelPanel.vue';
import VectorModelPanel from '@/components/settings/VectorModelPanel.vue';
import type { IconName } from '@/components/common/icons';
import { ref, computed, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';;
import { useSettingsStore } from '@/stores/settings';

/** 与模型面板「最大上下文」同一组常用档位（K=1024；1M = 1048576） */
const CONTEXT_PRESETS: readonly number[] = [
  32768, 65536, 131072, 278528, 409600, 614400, 1048576,
] as const;

interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: IconName;
}

type SettingsCategoryId = 'appearance' | 'model' | 'retrieval' | 'extension' | 'data' | 'security' | 'about';

const activeCategory = ref<SettingsCategoryId>('appearance');

// L 层深链：其他页面用 /settings?cat=<id>&from=<原页面> 跳进来时，
// 必须落在用户被指引的那一类（此前恒落"外观"，导致"去设置"按钮把用户送到无关页）。
const route = useRoute();
const { fromPath, backFromQuery } = useReadinessJump();
const CATEGORY_IDS: readonly string[] = ['appearance', 'model', 'retrieval', 'extension', 'data', 'security', 'about'];

function applyCategoryFromQuery(): void {
  const raw = route.query.cat;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && CATEGORY_IDS.includes(value)) {
    activeCategory.value = value as SettingsCategoryId;
  }
}

// 深链优先：?cat=<id> 决定落地分类。
// 曾经试过"无 Profile 时自动落在「模型」"的智能默认，但它与既有一致性契约冲突：
// 主题相关用例（theme-visual / contrast-axe / chat-flow 等 13 条）进入设置页就直接点
// `.theme-card`，默认分类一变它们就全断；而"把用户带到阻塞点"这件事已由就绪条与
// 首启欢迎窗的显式跳转承担，不需要靠改变落地页来赌。故保持确定性默认「外观」。
watch(() => route.query.cat, applyCategoryFromQuery, { immediate: true });

const activeCategoryDesc = computed(
  () => settingsCategories.value.find((c) => c.id === activeCategory.value)?.description ?? ''
);

function applyContextPreset(max: number): void {
  if (settings.setMaxContextTokens(max)) {
    contextLengthError.value = null;
    showToast(
      'success',
      t('settingsView.contextLengthSaved', { max, reserved: settings.reservedTokens })
    );
  } else {
    contextLengthError.value = t('settingsView.contextLengthError');
    showToast('error', t('settingsView.contextLengthError'));
  }
}

const contextBudget = computed(() => settings.availableContextTokens);

const contextLengthError = ref<string | null>(null);

/** 按 1024 进制显示（32768 → 32K、1048576 → 1M），与档位值本身的进制一致 */
function formatTokenCount(n: number): string {
  if (n >= 1024 * 1024) {
    const m = n / (1024 * 1024);
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  const k = n / 1024;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
}

function handleCategoryKeydown(e: KeyboardEvent, currentIndex: number): void {
  const len = settingsCategories.value.length;
  let nextIndex: number | null = null;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + len) % len;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % len;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = len - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  if (nextIndex !== null) {
    selectCategory(settingsCategories.value[nextIndex]!.id);
    void nextTick(() => {
      document.querySelectorAll<HTMLElement>('.settings-nav-item')[nextIndex!]?.focus();
    });
  }
}

function onMaxContextInput(e: Event): void {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw) || raw <= 0 || !settings.setMaxContextTokens(raw)) {
    contextLengthError.value = t('settingsView.contextLengthError');
    return;
  }
  contextLengthError.value = null;
}

function onReservedInput(e: Event): void {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw) || raw < 0 || !settings.setReservedTokens(raw)) {
    contextLengthError.value = t('settingsView.contextLengthError');
    return;
  }
  contextLengthError.value = null;
}

function selectCategory(id: SettingsCategoryId) {
  activeCategory.value = id;
}

const settings = useSettingsStore();

const settingsCategories = computed<SettingsCategory[]>(() => [
  { id: 'appearance', label: t('settingsView.categoryAppearance'), description: t('settingsView.categoryAppearanceDesc'), icon: 'palette' },
  { id: 'model', label: t('settingsView.categoryModel'), description: t('settingsView.categoryModelDesc'), icon: 'cpu' },
  { id: 'retrieval', label: t('settingsView.categoryRetrieval'), description: t('settingsView.categoryRetrievalDesc'), icon: 'search' },
  { id: 'extension', label: t('settingsView.categoryExtension'), description: t('settingsView.categoryExtensionDesc'), icon: 'puzzle' },
  { id: 'data', label: t('settingsView.categoryData'), description: t('settingsView.categoryDataDesc'), icon: 'database' },
  { id: 'security', label: t('settingsView.categorySecurity'), description: t('settingsView.categorySecurityDesc'), icon: 'lock-keyhole' },
  { id: 'about', label: t('settingsView.categoryAbout'), description: t('settingsView.categoryAboutDesc'), icon: 'info' },
]);
import SettingsAppearancePanel from '@/components/settings/SettingsAppearancePanel.vue';
import SettingsExtensionPanel from '@/components/settings/SettingsExtensionPanel.vue';
import SettingsSecurityPanel from '@/components/settings/SettingsSecurityPanel.vue';
import SettingsDataPanel from '@/components/settings/SettingsDataPanel.vue';
import SettingsAboutPanel from '@/components/settings/SettingsAboutPanel.vue';
</script>

<template>
  <main id="main-content" class="settings-view" :aria-label="t('settings.title')" tabindex="-1">
    <!-- 浮动侧边栏：设置分类切换（固定） -->
    <aside class="settings-nav" :aria-label="t('settings.title')">
      <div class="settings-nav-inner">
        <h2 class="settings-nav-title">{{ t('settings.title') }}</h2>
        <div class="settings-nav-list" role="tablist" :aria-label="t('settings.title')">
          <button
            v-for="(cat, idx) in settingsCategories"
            :key="cat.id"
            type="button"
            class="settings-nav-item"
            :class="{ active: activeCategory === cat.id }"
            role="tab"
            :aria-selected="activeCategory === cat.id"
            :tabindex="activeCategory === cat.id ? 0 : -1"
            @click="selectCategory(cat.id)"
            @keydown="handleCategoryKeydown($event, idx)"
          >
            <Icon :name="cat.icon" :size="15" aria-hidden="true" />
            <span class="settings-nav-item-label">{{ cat.label }}</span>
            <span class="settings-nav-item-desc" role="tooltip" :hidden="activeCategory === cat.id">{{ cat.description }}</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- 设置内容区（唯一纵向滚动容器，横向裁剪避免 xy 双滚动轴） -->
    <div class="settings-body tk-scroll">
    <!-- 头部 -->
    <header class="settings-header">
      <h1 class="settings-title">
        <Icon name="gear" :size="22" />
        <span>{{ t('settings.title') }}</span>
      </h1>
      <p class="settings-subtitle">{{ activeCategoryDesc }}</p>
      <!-- 深链进来时给一条回头路（浏览器的返回键同样可用） -->
      <button
        v-if="fromPath"
        type="button"
        class="settings-back-from"
        data-rel-jump="settings-return"
        @click="backFromQuery"
      >
        <Icon name="arrow-left" :size="14" aria-hidden="true" />
        <span>{{ t('settings.backFrom') }}</span>
      </button>
    </header>

    <!-- 外观：语言 / 主题 / 字号 / 界面自定义 -->

    <!-- S2-S6（ROUND_3_HIGH_RISK_SPLIT_DESIGN）：各分区拆分为子组件；v-show 保留草稿状态 -->
    <SettingsAppearancePanel v-show="activeCategory === 'appearance'" />

    <div v-show="activeCategory === 'model'">
      <SettingsModelPanel />

      <!-- 上下文长度配置：接入大上下文模型（如 256K）时调大；默认 8192/1024 保持既有行为 -->
      <section class="settings-section" aria-labelledby="context-length-title">
        <header class="section-header">
          <h2 id="context-length-title" class="section-title">
            <Icon name="cpu" :size="16" />
            <span>{{ t('settingsView.contextLengthTitle') }}</span>
          </h2>
        </header>

        <div class="extension-block">
          <label class="form-row">
            <span>{{ t('settingsView.contextLengthMax') }}</span>
            <input
              type="number"
              min="1024"
              max="2000000"
              step="1024"
              :value="settings.maxContextTokens"
              @change="onMaxContextInput"
            />
          </label>
          <label class="form-row">
            <span>{{ t('settingsView.contextLengthReserved') }}</span>
            <input
              type="number"
              min="0"
              max="1000000"
              step="128"
              :value="settings.reservedTokens"
              @change="onReservedInput"
            />
          </label>

          <div class="context-preset">
            <span class="context-preset-label">{{ t('settingsView.contextLengthPreset') }}</span>
            <div class="context-preset-btns">
              <button
                v-for="preset in CONTEXT_PRESETS"
                :key="preset"
                type="button"
                class="data-mgmt-btn"
                :class="{ active: settings.maxContextTokens === preset }"
                @click="applyContextPreset(preset)"
              >
                {{ formatTokenCount(preset) }}
              </button>
            </div>
          </div>

          <p class="hint-text context-budget">
            {{ t('settingsView.contextLengthBudget', { budget: contextBudget }) }}
          </p>
          <p class="hint-text">
            {{ t('settingsView.contextLengthHint') }}
          </p>
          <p v-if="contextLengthError" class="context-error" role="alert">
            {{ contextLengthError }}
          </p>
        </div>
      </section>

      <!--
        向量检索从「模型」类里独立成「检索」类（§3.6.1）：
        原来一类聚合 模型面板 + 上下文长度段 + 向量面板 ≈60 个控件面 / 6 段，
        而它服务的任务（让文档能被检索到）与"接入一个模型"并不是同一件事。
      -->
    </div>

    <div v-show="activeCategory === 'retrieval'">
      <VectorModelPanel />
    </div>

    <SettingsExtensionPanel v-show="activeCategory === 'extension'" />

    <SettingsSecurityPanel v-show="activeCategory === 'security'" />

    <SettingsDataPanel v-show="activeCategory === 'data'" />

    <SettingsAboutPanel v-show="activeCategory === 'about'" />
    </div>
  </main>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--background);
}

/* ── 浮动侧边栏（固定，随内容滚动保持可见） ── */
.settings-nav {
  flex-shrink: 0;
  width: 216px;
  margin: 16px 0 16px 16px;
  padding: 14px 10px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--card) 90%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--border);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
  overflow: visible;
  align-self: flex-start;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  z-index: 5;
}

.settings-nav-title {
  margin: 0 0 10px 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.settings-nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav-item {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--muted-foreground);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.settings-nav-item-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
}

/* 侧边栏描述小字 → hover 气泡（默认隐藏，向下浮层显示） */
.settings-nav-item-desc {
  position: absolute;
  left: 8px;
  right: 8px;
  top: calc(100% + 6px);
  z-index: 30;
  padding: 6px 9px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted-foreground);
  background: var(--card-elevated, var(--card));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-elevated);
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .settings-nav-item:hover .settings-nav-item-desc {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
}

/* focus-visible 分支不加 hover 守卫：键盘可达性不受设备 hover 能力影响 */
.settings-nav-item:focus-visible .settings-nav-item-desc {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
/* I-5（2026-09-16）：触屏 tap 不触发 focus-visible，设置项描述常显，保证说明文本可达 */
@media (hover: none) {
  .settings-nav-item-desc {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
}

@media (hover: hover) and (pointer: fine) {
  .settings-nav-item:hover {
    background: var(--card-elevated, var(--card));
    color: var(--foreground);
  }
}

.settings-nav-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.settings-nav-item.active {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  /* 激活项文字用最高亮度层级，保证 on 红色浅底 ≥4.5:1（WCAG AA） */
  color: var(--foreground);
  border: 1px solid color-mix(in srgb, var(--primary) 55%, transparent);
}

/* ── 内容区（唯一滚动容器；横向裁剪避免双滚动轴） ── */
.settings-body {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  max-width: 980px;
  margin: 0 auto;
}

.settings-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.settings-subtitle {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.theme-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.fontsize-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.profile-item.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 6%, transparent);
}

.active-badge {
  background: var(--secondary);
  color: var(--on-secondary);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.badge-active {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--on-secondary);
  background: var(--secondary);
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── 响应式 ── */
@media (max-width: 640px) {
  .settings-view {
    padding: 16px;
  }
  .settings-section {
    padding: 14px;
  }
  .theme-grid {
    grid-template-columns: 1fr;
  }
  .fontsize-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .profile-item {
    flex-direction: column;
    align-items: stretch;
  }
  .profile-actions {
    flex-wrap: wrap;
  }
  .action-btn {
    flex: 1;
    min-width: 0;
  }
  .meta-url {
    max-width: 100%;
  }
}

.bg-source-tab.active {
  background: var(--card);
  color: var(--foreground);
  font-weight: 500;
}

.data-mgmt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .data-mgmt-btn:hover:not(:disabled) {
    background: var(--card-elevated);
    border-color: var(--tk-cyan-500);
  }
}

.data-mgmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.extension-block {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
}

.extension-block .form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--foreground);
}

.extension-block .form-row > span {
  min-width: 100px;
  color: var(--muted-foreground);
}

.extension-block .form-row input[type='checkbox'] {
  margin: 0;
}

.extension-block .form-row input[type='range'] {
  flex: 1;
  max-width: 200px;
}

.extension-block .form-row input[type='number'],
.extension-block .form-row input[type='password'],
.extension-block .form-row select {
  flex: 1;
  max-width: 240px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.extension-block .hint-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

/* 上下文长度配置：预设快捷按钮 + 预算实时展示 */
.context-preset {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0;
  font-size: 13px;
  color: var(--foreground);
}

.context-preset-label {
  min-width: 100px;
  color: var(--muted-foreground);
}

.context-preset-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.context-preset-btns .data-mgmt-btn.active {
  border-color: var(--tk-cyan-500);
  background: var(--card-elevated);
  /* 亮色主题中 cyan-500 叠在浅色卡片上对比度不足，使用专用文本派生色。 */
  color: var(--accent-blue-text);
}

.context-budget {
  font-weight: 600;
  color: var(--foreground);
}

.context-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tk-red-500, #ef4444);
  line-height: 1.5;
}

/* ── 窄屏：侧边栏转为顶部横向分类栏 ── */
@media (max-width: 640px) {
  .settings-view {
    flex-direction: column;
  }
  /* 批次 0-1：宽度与收缩约束。
     缺 `min-width: 0` / `max-width: 100%` 时，7 个 `flex: 0 0 auto` 的分类 item 把
     `.settings-nav-list` 撑到 444px（> 视口 390），祖先三层 `overflow-x: hidden`
     把多出的 89px **静默裁掉**；条自身虽有 `overflow-x: auto`，但盒子已比视口宽，
     滚动条在屏外 ⇒ 390/412 上有 3 个分类、360 上有 4 个分类**没有任何手势能到达**
     （含主密码所在的「安全」）。根因不是"缺滚动"，是"缺收缩约束"。 */
  .settings-nav {
    width: auto;
    max-width: 100%;
    min-width: 0;
    margin: 8px;
    max-height: none;
    position: static;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .settings-nav-inner {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
  .settings-nav-list {
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
  .settings-nav-item {
    flex: 0 0 auto;
    width: auto;
    padding: 8px 12px;
  }
  .settings-nav-item-desc {
    display: none;
  }
  .settings-body {
    padding: 16px;
    max-width: none;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input,
  .form-textarea,
  .custom-css-textarea,
  .data-mgmt-select,
  .extension-block .form-row input[type='number'],
  .extension-block .form-row input[type='password'],
  .extension-block .form-row select,
  .profile-input {
    font-size: 16px;
  }
}
.settings-back-from {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}

@media (hover: hover) {
  .settings-back-from:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.settings-back-from:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
</style>
