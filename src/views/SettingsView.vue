<script setup lang="ts">
import Icon from '@/components/common/Icon.vue';
import SettingsModelPanel from '@/components/settings/SettingsModelPanel.vue';
import SettingsContextLengthSection from '@/components/settings/SettingsContextLengthSection.vue';
import VectorModelPanel from '@/components/settings/VectorModelPanel.vue';
import type { IconName } from '@/components/common/icons';
import { ref, computed, nextTick, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useDrilldown } from '@/composables/useDrilldown';
import { useViewport } from '@/core/viewport';
import { t } from '@/i18n';;

interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: IconName;
}

type SettingsCategoryId = 'appearance' | 'model' | 'retrieval' | 'extension' | 'data' | 'security' | 'about';

const activeCategory = ref<SettingsCategoryId>('appearance');

const { isMobile } = useViewport();

/**
 * 手机端两级互换（MOBILE_PLAN 批次 1-4）：设置首页（7 个分类的全屏列表）→ 分类页。
 *
 * 与批次 0-1 的关系：0-1 把横排分类条改成"可横向滚动、7/7 够得着"，那是**缓解**；
 * 这里把横排条整个去掉、分类变成一级页，是**治本**。两者不冲突——0-1 的"7/7 可达"
 * 断言在竖排满屏列表下同样成立，所以那条 e2e 不用改。
 *
 * 桌面不动：左栏 + 右内容并置，level 恒为 1 且不写历史（useDrilldown 的默认行为）。
 */
const {
  level: swapLevel,
  open: openCategoryDetail,
  goBack: swapGoBack,
} = useDrilldown();

/** 二级页顶栏的「← 所有分类」 */
function backToCategoryList(): void {
  swapGoBack();
  // 焦点交还给刚进去的那个分类：键盘用户不该回到列表开头重新 Tab 七次
  void nextTick(() => {
    document
      .querySelector<HTMLElement>(`.settings-nav-item[data-cat="${activeCategory.value}"]`)
      ?.focus();
  });
}

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

function selectCategory(id: SettingsCategoryId) {
  activeCategory.value = id;
  // 手机：选中即进分类页。一级只是入口列表，不是"预览"——
  // 若只切 activeCategory 不进二级，用户点完看不出任何变化（内容区在另一级）。
  if (isMobile.value) openCategoryDetail(id);
}

const settingsCategories = computed<SettingsCategory[]>(() => [
  { id: 'appearance', label: t('settingsView.categoryAppearance'), description: t('settingsView.categoryAppearanceDesc'), icon: 'palette' },
  { id: 'model', label: t('settingsView.categoryModel'), description: t('settingsView.categoryModelDesc'), icon: 'cpu' },
  { id: 'retrieval', label: t('settingsView.categoryRetrieval'), description: t('settingsView.categoryRetrievalDesc'), icon: 'search' },
  { id: 'extension', label: t('settingsView.categoryExtension'), description: t('settingsView.categoryExtensionDesc'), icon: 'puzzle' },
  { id: 'data', label: t('settingsView.categoryData'), description: t('settingsView.categoryDataDesc'), icon: 'database' },
  { id: 'security', label: t('settingsView.categorySecurity'), description: t('settingsView.categorySecurityDesc'), icon: 'lock-keyhole' },
  { id: 'about', label: t('settingsView.categoryAbout'), description: t('settingsView.categoryAboutDesc'), icon: 'info' },
]);

/** 二级页顶栏：手机显示当前分类的图标与名字（桌面仍显示「设置」） */
const activeCategoryMeta = computed(() =>
  settingsCategories.value.find((c) => c.id === activeCategory.value)
);

/**
 * 深链 `?cat=<id>` 在手机上直接落二级。
 * 用户是被别的页面的"去设置"按钮指到某个分类的（如就绪条跳"模型"），
 * 停在一级列表等于让他再找一遍。只在挂载时判一次，不做 watch：
 * watch 盯着 activeCategory 会在用户点返回后被重新推回二级（形成"退不出去"的环）。
 */
onMounted(() => {
  if (!isMobile.value) return;
  const raw = route.query.cat;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && CATEGORY_IDS.includes(value)) {
    openCategoryDetail(value);
  }
});
import SettingsAppearancePanel from '@/components/settings/SettingsAppearancePanel.vue';
import SettingsExtensionPanel from '@/components/settings/SettingsExtensionPanel.vue';
import SettingsSecurityPanel from '@/components/settings/SettingsSecurityPanel.vue';
import SettingsDataPanel from '@/components/settings/SettingsDataPanel.vue';
import SettingsAboutPanel from '@/components/settings/SettingsAboutPanel.vue';
</script>

<template>
  <main
    id="main-content"
    class="settings-view m-swap"
    :data-level="swapLevel"
    :aria-label="t('settings.title')"
    tabindex="-1"
  >
    <!-- 浮动侧边栏：设置分类切换（固定） -->
    <aside class="settings-nav m-swap__master" :aria-label="t('settings.title')">
      <div class="settings-nav-inner">
        <h2 class="settings-nav-title">{{ t('settings.title') }}</h2>
        <div class="settings-nav-list" role="tablist" :aria-label="t('settings.title')">
          <button
            v-for="(cat, idx) in settingsCategories"
            :key="cat.id"
            type="button"
            class="settings-nav-item"
            :class="{ active: activeCategory === cat.id }"
            :data-cat="cat.id"
            role="tab"
            :aria-selected="activeCategory === cat.id"
            :tabindex="activeCategory === cat.id ? 0 : -1"
            @click="selectCategory(cat.id)"
            @keydown="handleCategoryKeydown($event, idx)"
          >
            <Icon :name="cat.icon" :size="15" aria-hidden="true" />
            <span class="settings-nav-item-label">{{ cat.label }}</span>
            <!-- 桌面：描述是 tooltip（仅非当前项弹出）；手机：一级列表里常显，它就是"这个分类是干什么的" -->
            <span
              class="settings-nav-item-desc"
              role="tooltip"
              :hidden="!isMobile && activeCategory === cat.id"
            >{{ cat.description }}</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- 设置内容区（唯一纵向滚动容器，横向裁剪避免 xy 双滚动轴） -->
    <div class="settings-body m-swap__detail tk-scroll">
    <!-- 头部 -->
    <header class="settings-header">
      <!-- 手机二级页：回一级分类列表。文案说出目的地，不是裸的「返回」 -->
      <button v-if="isMobile" type="button" class="m-swap__back" @click="backToCategoryList">
        <Icon name="arrow-left" :size="16" aria-hidden="true" />
        <span>{{ t('settings.allCategories') }}</span>
      </button>
      <h1 class="settings-title">
        <Icon :name="isMobile ? (activeCategoryMeta?.icon ?? 'gear') : 'gear'" :size="22" />
        <span>{{ isMobile ? (activeCategoryMeta?.label ?? t('settings.title')) : t('settings.title') }}</span>
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

      <SettingsContextLengthSection />

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

/* ── 响应式 ── */
@media (max-width: 640px) {
  .settings-view {
    padding: 16px;
  }
  .settings-section {
    padding: 14px;
  }
}

/* ── 窄屏：两级互换（批次 1-4）──────────────────────────────────────────
   一级 = 设置首页（7 个分类的全屏列表），二级 = 分类页。
   批次 0-1 曾把侧栏改成"横向滚动条"让 7/7 够得着——那是缓解；分类本身成为
   一级页面之后，横排条连同它的横向滚动一起不需要了，竖排列表天然全可见。 */
@media (max-width: 640px) {
  .settings-view {
    flex-direction: column;
  }
  /* 一级：分类列表满屏（.m-swap 在 ≤640 已给 master 一个 flex:1，这里只补外观） */
  .settings-nav {
    width: auto;
    max-width: none;
    min-width: 0;
    margin: 0;
    /* 覆盖桌面的 align-self: flex-start —— 那是给 sticky 侧栏用的，
       在纵向 flex 里会让一级列表缩成"内容高度"，下面的空区就露出背景了 */
    align-self: stretch;
    padding: 12px;
    border: 0;
    border-radius: 0;
    background: var(--background);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    position: static;
    max-height: none;
    overflow-y: auto;
  }
  .settings-nav-inner {
    display: block;
    padding: 0;
  }
  .settings-nav-title {
    margin: 0 0 10px 4px;
  }
  .settings-nav-list {
    flex-direction: column;
    gap: 6px;
    overflow: visible;
  }
  /* 一级列表项：整行 + 图标与名字一行、描述另起一行（描述在手机上不是 tooltip，
     它是"这个分类是干什么的"，一级页面正是需要它的地方） */
  .settings-nav-item {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 2px 8px;
    width: 100%;
    min-height: var(--touch-min, 44px);
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .settings-nav-item-label {
    font-size: var(--font-size-md, 14px);
  }
  .settings-nav-item-desc {
    grid-column: 1 / -1;
    position: static;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    font-size: 12px;
    opacity: 1;
    visibility: visible;
    transform: none;
  }
  /* 二级：内容满屏，返回按钮在页头 */
  .settings-body {
    padding: 16px;
    max-width: none;
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
